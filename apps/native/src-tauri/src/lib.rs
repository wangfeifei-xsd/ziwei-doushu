mod ai;
mod db;
mod secrets;
use db::{Database, ImportRecord, ImportSummary, Profile, Result};
use secrets::SecretStore;
use std::collections::{BTreeMap, HashMap};
use tauri::{Manager, State};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

struct AppState {
    db: Database,
    secrets: std::sync::Arc<SecretStore>,
    http: reqwest::Client,
    requests: Mutex<HashMap<String, CancellationToken>>,
}
#[tauri::command]
fn platform_info() -> serde_json::Value {
    serde_json::json!({"mobile":cfg!(mobile)})
}
#[tauri::command]
async fn system_navigation(_app: tauri::AppHandle, intercept: bool, light: bool) -> Result<()> {
    #[cfg(mobile)]
    return _app
        .state::<tauri_plugin_platform::Platform<tauri::Wry>>()
        .navigation(intercept, light);
    #[cfg(desktop)]
    {
        let _ = (intercept, light);
        Ok(())
    }
}
#[tauri::command]
async fn share_file(
    app: tauri::AppHandle,
    name: String,
    bytes: Vec<u8>,
    mime: String,
) -> Result<serde_json::Value> {
    if bytes.len() > 16 * 1024 * 1024
        || name.is_empty()
        || name.len() > 240
        || name.contains(['/', '\\'])
        || name.chars().any(char::is_control)
        || !["application/json", "image/png"].contains(&mime.as_str())
    {
        return Err("导出文件格式或大小无效。".into());
    }
    #[cfg(mobile)]
    {
        let dir = app
            .path()
            .app_cache_dir()
            .map_err(|_| "无法访问分享目录。")?
            .join("ziwei-share");
        std::fs::create_dir_all(&dir).map_err(|_| "无法建立分享文件。")?;
        // Keep files while another app may read them. Only expire older files on a later export.
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                if entry
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.elapsed().ok())
                    .is_some_and(|age| age.as_secs() > 7 * 86400)
                {
                    let _ = std::fs::remove_file(entry.path());
                }
            }
        }
        let path = dir.join(format!(
            "{}-{}",
            chrono::Utc::now().timestamp_millis(),
            name
        ));
        std::fs::write(&path, bytes).map_err(|_| "无法写入分享文件。")?;
        app.state::<tauri_plugin_platform::Platform<tauri::Wry>>()
            .share(path.to_str().ok_or("文件路径无效。")?, &mime)
    }
    #[cfg(desktop)]
    {
        let _ = app;
        Err("桌面端请使用保存对话框。".into())
    }
}
#[tauri::command]
async fn bootstrap(state: State<'_, AppState>) -> Result<BTreeMap<String, String>> {
    state.db.settings().await
}
#[tauri::command]
async fn preference_set(
    state: State<'_, AppState>,
    key: String,
    value: Option<String>,
) -> Result<()> {
    state.db.set(&key, value.as_deref()).await
}
#[tauri::command]
async fn profile_list(state: State<'_, AppState>) -> Result<Vec<Profile>> {
    state.db.list().await
}
#[tauri::command]
async fn profile_get(state: State<'_, AppState>, id: String) -> Result<Option<Profile>> {
    state.db.get(&id).await
}
#[tauri::command]
async fn profile_save(state: State<'_, AppState>, canonical: String) -> Result<Profile> {
    state.db.save(&canonical).await
}
#[tauri::command]
async fn profile_update(
    state: State<'_, AppState>,
    id: String,
    canonical: String,
) -> Result<Profile> {
    state.db.update(&id, &canonical).await
}
#[tauri::command]
async fn profile_delete(state: State<'_, AppState>, id: String) -> Result<bool> {
    state.db.remove(&id).await
}
#[tauri::command]
async fn profile_import(
    state: State<'_, AppState>,
    records: Vec<ImportRecord>,
) -> Result<ImportSummary> {
    state.db.import(records).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_platform::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            app.manage(AppState {
                db: Database::new(dir.join("ziwei.sqlite")),
                secrets: std::sync::Arc::new(SecretStore::new(dir.join("secrets"))),
                http: reqwest::Client::builder()
                    .redirect(reqwest::redirect::Policy::none())
                    .connect_timeout(std::time::Duration::from_secs(20))
                    .build()?,
                requests: Mutex::new(HashMap::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            platform_info,
            system_navigation,
            share_file,
            bootstrap,
            preference_set,
            profile_list,
            profile_get,
            profile_save,
            profile_update,
            profile_delete,
            profile_import,
            ai::model_get,
            ai::model_save,
            ai::model_unlock,
            ai::model_lock,
            ai::model_clear,
            ai::ai_begin,
            ai::ai_stream,
            ai::ai_cancel
        ])
        .run(tauri::generate_context!())
        .expect("无法启动紫微命盘应用");
}
