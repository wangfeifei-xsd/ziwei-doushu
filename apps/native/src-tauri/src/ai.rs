use crate::{db::Result, AppState};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use tauri::{ipc::Channel, State};
use tokio_util::sync::CancellationToken;

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelConfig {
    #[serde(rename = "baseURL")]
    pub base_url: String,
    pub model: String,
    pub mode: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDraft {
    #[serde(flatten)]
    pub config: ModelConfig,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub remember: bool,
    #[serde(default)]
    pub password: String,
}
pub fn validate_config(config: &ModelConfig) -> Result<reqwest::Url> {
    let mut url =
        reqwest::Url::parse(&config.base_url).map_err(|_| "请输入有效的模型接口地址。")?;
    if url.scheme() != "https" && !(cfg!(debug_assertions) && url.scheme() == "http") {
        return Err("正式应用仅支持 HTTPS 模型服务；HTTP 仅用于调试构建。".into());
    }
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || config.base_url.len() > 2048
        || config.base_url.chars().any(char::is_control)
    {
        return Err("接口地址不能包含凭证、查询参数或锚点。".into());
    }
    let path = url.path().trim_end_matches('/');
    if ["/chat/completions", "/responses", "/keys", "/api-keys"]
        .iter()
        .any(|s| path.ends_with(s))
    {
        return Err("请填写 API Base URL，不是完整接口地址。".into());
    }
    if config.model.trim().is_empty()
        || config.model.encode_utf16().count() > 200
        || config.model.chars().any(char::is_control)
        || !["chat", "responses"].contains(&config.mode.as_str())
    {
        return Err("模型名称或接口类型无效。".into());
    }
    url.set_path(&format!(
        "{}/{}",
        path,
        if config.mode == "responses" {
            "responses"
        } else {
            "chat/completions"
        }
    ));
    Ok(url)
}
fn validate_key(key: &str) -> Result<()> {
    if key.is_empty()
        || key.len() > 4096
        || key.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        Err("API Key 格式不正确。".into())
    } else {
        Ok(())
    }
}
pub async fn configuration(state: &AppState) -> Result<ModelConfig> {
    let raw = state.db.settings().await?.remove("model-config");
    raw.map(|s| serde_json::from_str(&s).map_err(|_| "已保存的模型配置无法读取。".into()))
        .unwrap_or_else(|| Ok(ModelConfig::default()))
}
pub async fn public_settings(state: &AppState) -> Result<Value> {
    let mut config = configuration(state).await?;
    if config.mode.is_empty() {
        config.mode = "chat".into();
    }
    Ok(
        json!({"baseURL":config.base_url,"model":config.model,"mode":config.mode,"apiKey":"","hasApiKey":state.secrets.has_key(),"locked":state.secrets.locked(),"hasVault":state.secrets.exists(),"configured":validate_config(&config).is_ok()&&state.secrets.has_key()&&!state.secrets.locked(),"source":state.secrets.source()}),
    )
}
#[tauri::command]
pub async fn model_get(state: State<'_, AppState>) -> Result<Value> {
    public_settings(&state).await
}
#[tauri::command]
pub async fn model_save(state: State<'_, AppState>, mut draft: ModelDraft) -> Result<Value> {
    draft.config.base_url = draft
        .config
        .base_url
        .trim()
        .trim_end_matches('/')
        .to_owned();
    draft.config.model = draft.config.model.trim().to_owned();
    validate_config(&draft.config)?;
    if !draft.api_key.trim().is_empty() || draft.remember && state.secrets.source() == "session" {
        let key = if draft.api_key.trim().is_empty() {
            state.secrets.key()?.to_string()
        } else {
            draft.api_key.trim().to_owned()
        };
        validate_key(&key)?;
        let secrets = state.secrets.clone();
        let remember = draft.remember;
        let password = zeroize::Zeroizing::new(draft.password);
        tokio::task::spawn_blocking(move || secrets.save(key, remember, &password))
            .await
            .map_err(|_| "密钥库操作失败。")??;
    } else if !state.secrets.has_key() {
        return Err("请填写 API Key。".into());
    }
    state
        .db
        .set(
            "model-config",
            Some(&serde_json::to_string(&draft.config).map_err(|_| "配置格式无效。")?),
        )
        .await?;
    public_settings(&state).await
}
#[tauri::command]
pub async fn model_unlock(state: State<'_, AppState>, password: String) -> Result<Value> {
    unlock_model(&state, password).await
}
async fn unlock_model(state: &AppState, password: String) -> Result<Value> {
    let secrets = state.secrets.clone();
    let password = zeroize::Zeroizing::new(password);
    tokio::task::spawn_blocking(move || secrets.unlock(&password))
        .await
        .map_err(|_| "解锁操作失败。")??;
    public_settings(state).await
}
#[tauri::command]
pub async fn model_lock(state: State<'_, AppState>) -> Result<Value> {
    let secrets = state.secrets.clone();
    tokio::task::spawn_blocking(move || secrets.lock())
        .await
        .map_err(|_| "锁定操作失败。")?;
    public_settings(&state).await
}
#[tauri::command]
pub async fn model_clear(state: State<'_, AppState>) -> Result<Value> {
    let secrets = state.secrets.clone();
    tokio::task::spawn_blocking(move || secrets.clear())
        .await
        .map_err(|_| "清除操作失败。")??;
    public_settings(&state).await
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum WireEvent {
    Chunk { bytes: Vec<u8> },
}
#[tauri::command]
pub async fn ai_begin(state: State<'_, AppState>, request_id: String) -> Result<()> {
    if request_id.is_empty()
        || request_id.len() > 100
        || !request_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err("请求编号无效。".into());
    }
    let mut tasks = state.requests.lock().await;
    if tasks.len() >= 64 || tasks.contains_key(&request_id) {
        return Err("并行请求过多或请求编号重复。".into());
    }
    tasks.insert(request_id, CancellationToken::new());
    Ok(())
}
#[tauri::command]
pub async fn ai_cancel(state: State<'_, AppState>, request_id: String) -> Result<()> {
    let mut tasks = state.requests.lock().await;
    if let Some(token) = tasks.remove(&request_id) {
        token.cancel();
    }
    Ok(())
}
#[tauri::command]
pub async fn ai_stream(
    state: State<'_, AppState>,
    request_id: String,
    body: Value,
    channel: Channel<WireEvent>,
    draft: Option<ModelDraft>,
) -> Result<()> {
    let token = state
        .requests
        .lock()
        .await
        .get(&request_id)
        .cloned()
        .ok_or("请求已取消或尚未注册。")?;
    let timeout = Duration::from_secs(if draft.is_some() { 30 } else { 180 });
    let result = timed_run(&state, body, channel, draft, token, timeout).await;
    state.requests.lock().await.remove(&request_id);
    result
}
async fn timed_run(
    state: &AppState,
    body: Value,
    channel: Channel<WireEvent>,
    draft: Option<ModelDraft>,
    token: CancellationToken,
    timeout: Duration,
) -> Result<()> {
    tokio::select! {
        _=token.cancelled()=>Err("请求已取消。".into()),
        result=tokio::time::timeout(timeout,run(state,body,channel,draft))=>result.unwrap_or_else(|_|Err("模型响应超时，请重试。".into()))
    }
}
async fn run(
    state: &AppState,
    mut body: Value,
    channel: Channel<WireEvent>,
    draft: Option<ModelDraft>,
) -> Result<()> {
    let (config, key) = if let Some(draft) = draft {
        let key = if draft.api_key.trim().is_empty() {
            state.secrets.key()?.to_string()
        } else {
            draft.api_key.trim().to_owned()
        };
        (draft.config, zeroize::Zeroizing::new(key))
    } else {
        (configuration(state).await?, state.secrets.key()?)
    };
    let endpoint = validate_config(&config)?;
    validate_key(&key)?;
    // Only the configured model endpoint is reachable; no general purpose HTTP proxy.
    if !body.is_object()
        || serde_json::to_vec(&body)
            .map_err(|_| "请求格式错误。")?
            .len()
            > 262_144
    {
        return Err("模型请求过长或格式错误。".into());
    }
    body["model"] = json!(config.model);
    body["stream"] = json!(true);
    if config.mode == "responses" {
        body["store"] = json!(false);
        body["max_output_tokens"] = json!(4096);
        if !body["input"].is_array() {
            return Err("Responses 请求数据无效。".into());
        }
    } else {
        body["max_completion_tokens"] = json!(4096);
        if !body["messages"].is_array() {
            return Err("聊天请求数据无效。".into());
        }
    }
    let response = state
        .http
        .post(endpoint)
        .bearer_auth(&*key)
        .header(reqwest::header::ACCEPT, "text/event-stream")
        .json(&body)
        .send()
        .await
        .map_err(|_| "无法连接模型服务，请检查接口地址和网络。")?;
    let status = response.status();
    if !status.is_success() {
        return Err(match status.as_u16() {
            401 | 403 => "模型认证失败，请检查 API Key 和模型权限。",
            404 => "模型或接口不存在。",
            429 => "模型额度不足或请求过于频繁。",
            _ => "模型服务暂时不可用。",
        }
        .into());
    }
    if !response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|s| s.to_str().ok())
        .is_some_and(|s| s.contains("text/event-stream"))
    {
        return Err("模型没有返回有效的流式响应。".into());
    }
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "模型连接中断。")?;
        for bytes in chunk.chunks(16_384) {
            channel
                .send(WireEvent::Chunk {
                    bytes: bytes.to_vec(),
                })
                .map_err(|_| "界面已离开，响应已取消。")?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::{Arc, Mutex},
        thread,
    };
    fn mock(status: u16, delay: u64) -> (String, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let task = thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut request = Vec::new();
            let mut buffer = [0; 4096];
            loop {
                let count = socket.read(&mut buffer).unwrap();
                if count == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..count]);
                if let Some(end) = request.windows(4).position(|value| value == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&request[..end]).to_lowercase();
                    let size = headers
                        .lines()
                        .find_map(|line| {
                            line.strip_prefix("content-length: ")
                                .and_then(|s| s.parse::<usize>().ok())
                        })
                        .unwrap_or(0);
                    if request.len() >= end + 4 + size {
                        break;
                    }
                }
            }
            let body = if request.starts_with(b"POST /v1/responses ") {
                "event: response.output_text.delta\r\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"紫微😀\"}\r\n\r\nevent: response.completed\r\ndata: {\"type\":\"response.completed\"}\r\n\r\n"
            } else {
                "data: {\"choices\":[{\"delta\":{\"content\":\"紫微😀\"}}]}\n\ndata: [DONE]\n\n"
            }
            .as_bytes();
            let headers=format!("HTTP/1.1 {status} Fixture\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nLocation: http://127.0.0.1:1/forbidden\r\nConnection: close\r\n\r\n",body.len());
            let _ = socket.write_all(headers.as_bytes());
            thread::sleep(Duration::from_millis(delay));
            for bytes in body.chunks(7) {
                if socket.write_all(bytes).is_err() {
                    break;
                }
                thread::sleep(Duration::from_millis(2));
            }
            String::from_utf8(request).unwrap()
        });
        (format!("http://{address}/v1"), task)
    }
    fn state(dir: &std::path::Path) -> AppState {
        AppState {
            db: crate::db::Database::new(dir.join("test.sqlite")),
            secrets: Arc::new(crate::secrets::SecretStore::new(dir.join("keys"))),
            http: reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .unwrap(),
            requests: tokio::sync::Mutex::new(std::collections::HashMap::new()),
        }
    }
    fn draft(base_url: String, mode: &str) -> ModelDraft {
        ModelDraft {
            config: ModelConfig {
                base_url,
                model: "fixture".into(),
                mode: mode.into(),
            },
            api_key: "fixture-only-key".into(),
            remember: false,
            password: String::new(),
        }
    }
    #[tokio::test]
    async fn native_http_stream_protocols_auth_and_incremental_channel() {
        let dir = tempfile::tempdir().unwrap();
        let state = state(dir.path());
        for mode in ["chat", "responses"] {
            let (url, server) = mock(200, 20);
            let received = Arc::new(Mutex::new(Vec::new()));
            let out = received.clone();
            let channel = Channel::new(move |event| {
                if let tauri::ipc::InvokeResponseBody::Json(data) = event {
                    out.lock().unwrap().push(data);
                }
                Ok(())
            });
            let body = if mode == "chat" {
                json!({"messages":[{"role":"user","content":"测试"}]})
            } else {
                json!({"input":[{"role":"user","content":"测试"}]})
            };
            timed_run(
                &state,
                body,
                channel,
                Some(draft(url, mode)),
                CancellationToken::new(),
                Duration::from_secs(5),
            )
            .await
            .unwrap();
            let chunks = received.lock().unwrap();
            assert!(
                chunks.len() > 2,
                "native channel must deliver real partial chunks"
            );
            let bytes: Vec<u8> = chunks
                .iter()
                .flat_map(|s| {
                    serde_json::from_str::<Value>(s).unwrap()["bytes"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|n| n.as_u64().unwrap() as u8)
                        .collect::<Vec<_>>()
                })
                .collect();
            assert!(String::from_utf8(bytes).unwrap().contains("紫微😀"));
            let request = server.join().unwrap();
            assert!(request
                .to_lowercase()
                .contains("authorization: bearer fixture-only-key"));
            assert!(request.to_lowercase().contains("accept: text/event-stream"));
            assert!(request.starts_with(if mode == "chat" {
                "POST /v1/chat/completions "
            } else {
                "POST /v1/responses "
            }));
        }
    }
    #[tokio::test]
    async fn unlock_after_restart_updates_settings_and_tests_saved_key() {
        let started = std::time::Instant::now();
        let dir = tempfile::tempdir().unwrap();
        let (base_url, server) = mock(200, 0);
        let first = state(dir.path());
        first
            .secrets
            .save("fixture-only-key".into(), true, "fixture-password")
            .unwrap();
        first
            .db
            .set(
                "model-config",
                Some(&serde_json::to_string(&draft(base_url.clone(), "responses").config).unwrap()),
            )
            .await
            .unwrap();
        drop(first);
        let saved_after = started.elapsed();

        let restarted = state(dir.path());
        let locked = public_settings(&restarted).await.unwrap();
        assert_eq!(locked["hasVault"], true);
        assert_eq!(locked["locked"], true);
        assert_eq!(locked["configured"], false);
        assert!(unlock_model(&restarted, "wrong-password".into())
            .await
            .is_err());
        let unlocked = unlock_model(&restarted, "fixture-password".into())
            .await
            .unwrap();
        eprintln!(
            "vault regression: encrypted save {:?}; wrong-password check plus unlock {:?}",
            saved_after,
            started.elapsed() - saved_after
        );
        assert_eq!(unlocked["locked"], false);
        assert_eq!(unlocked["configured"], true);
        assert_eq!(unlocked["apiKey"], "");
        let mut probe = draft(base_url, "responses");
        probe.api_key.clear();
        timed_run(
            &restarted,
            json!({"input":[{"role":"user","content":"OK"}]}),
            Channel::new(|_| Ok(())),
            Some(probe),
            CancellationToken::new(),
            Duration::from_secs(5),
        )
        .await
        .unwrap();
        let request = server.join().unwrap();
        assert!(request.starts_with("POST /v1/responses "));
        assert!(request
            .to_lowercase()
            .contains("authorization: bearer fixture-only-key"));
    }
    #[tokio::test]
    async fn transport_errors_redirect_cancellation_and_timeout() {
        let dir = tempfile::tempdir().unwrap();
        let state = state(dir.path());
        for (status, expected) in [
            (401, "认证"),
            (403, "认证"),
            (429, "额度"),
            (404, "不存在"),
            (302, "暂时不可用"),
        ] {
            let (url, server) = mock(status, 0);
            let error = timed_run(
                &state,
                json!({"messages":[]}),
                Channel::new(|_| Ok(())),
                Some(draft(url, "chat")),
                CancellationToken::new(),
                Duration::from_secs(5),
            )
            .await
            .unwrap_err();
            assert!(error.contains(expected));
            assert!(!error.contains("fixture-only-key"));
            server.join().unwrap();
        }
        let (url, server) = mock(200, 150);
        let token = CancellationToken::new();
        let cancel = token.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(20)).await;
            cancel.cancel();
        });
        assert!(timed_run(
            &state,
            json!({"messages":[]}),
            Channel::new(|_| Ok(())),
            Some(draft(url, "chat")),
            token,
            Duration::from_secs(5)
        )
        .await
        .unwrap_err()
        .contains("取消"));
        server.join().unwrap();
        let (url, server) = mock(200, 150);
        assert!(timed_run(
            &state,
            json!({"messages":[]}),
            Channel::new(|_| Ok(())),
            Some(draft(url, "chat")),
            CancellationToken::new(),
            Duration::from_millis(25)
        )
        .await
        .unwrap_err()
        .contains("超时"));
        server.join().unwrap();
    }
    #[test]
    fn configuration_contract_and_public_serialization() {
        let config: ModelConfig = serde_json::from_value(
            json!({"baseURL":"https://example.com/v1","model":"fixture","mode":"responses"}),
        )
        .unwrap();
        assert_eq!(
            validate_config(&config).unwrap().as_str(),
            "https://example.com/v1/responses"
        );
        assert!(serde_json::to_value(&config)
            .unwrap()
            .get("baseURL")
            .is_some());
        for base in [
            "file:///private/data",
            "https://user:pass@example.com",
            "https://example.com?secret=1",
            "https://example.com/v1/responses",
        ] {
            assert!(validate_config(&ModelConfig {
                base_url: base.into(),
                ..config.clone()
            })
            .is_err());
        }
        assert!(validate_config(&ModelConfig {
            model: "x".repeat(201),
            ..config
        })
        .is_err());
    }
}
