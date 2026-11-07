use crate::{AppState, db::Result};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::VecDeque, io::{BufRead, BufReader, Cursor}, sync::{Arc, Mutex}, time::Instant};
use tauri::{Manager, State};
use tauri_plugin_fs::FsExt;
use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;

pub struct DatasetState { cache: Mutex<VecDeque<Value>>, gate: Arc<Semaphore> }
impl Default for DatasetState { fn default()->Self {Self{cache:Mutex::new(VecDeque::new()),gate:Arc::new(Semaphore::new(1))}} }
const TOPICS: [&str;13]=["overview","personality","love","career","wealth","health","family","children","move","friends","home","spirit","parents"];
fn year_from_key(key:&str)->Result<u64>{
    let p:Vec<_>=key.split('-').collect();if p.len()!=5||p[0].len()!=4||p[1].len()!=2||p[2].len()!=2||!matches!(p[4],"male"|"female"){return Err("生辰键格式不正确。".into())}
    let y=p[0].parse::<i32>().map_err(|_|"生辰年份无效。")?;
    let m=p[1].parse::<u32>().map_err(|_|"生辰月份无效。")?;
    let d=p[2].parse::<u32>().map_err(|_|"生辰日期无效。")?;
    let h=p[3].parse::<u32>().map_err(|_|"时辰无效。")?;
    if !(1950..=2026).contains(&y)||h>11||h.to_string()!=p[3]||chrono::NaiveDate::from_ymd_opt(y,m,d).is_none(){return Err("资料仅覆盖 1950–2026 年的真实日期及十二时辰。".into())}Ok(y as u64)
}
fn resource(app:&tauri::AppHandle,name:&str)->Result<Vec<u8>> {
    let p=app.path().resource_dir().map_err(|e|e.to_string())?.join("datasets/ziwei-v4.0-13d").join(name);
    match app.fs().read(p){Ok(v)=>Ok(v),Err(_)=>{
        #[cfg(debug_assertions)]
        {return std::fs::read(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../assets/datasets/ziwei-v4.0-13d").join(name)).map_err(|_|"数据包缺失，请重新构建或安装。".into());}
        #[cfg(not(debug_assertions))]
        {Err("数据包缺失，请重新安装。".into())}
    }}
}
fn manifest(app:&tauri::AppHandle)->Result<Value>{serde_json::from_slice(&resource(app,"MANIFEST.json")?).map_err(|_|"资料清单无效。".into())}
fn scan(bytes:Vec<u8>,key:Option<&str>,query:&Value,token:&CancellationToken)->Result<Value>{
    let mut decoder=zstd::stream::read::Decoder::new(Cursor::new(bytes)).map_err(|e|e.to_string())?;
    decoder.window_log_max(27).map_err(|e|e.to_string())?;
    let mut reader=BufReader::with_capacity(65536,decoder);
    let offset=query["offset"].as_u64().unwrap_or(0);let limit=query["limit"].as_u64().unwrap_or(12);
    let topic=query["topic"].as_str().unwrap_or("overview");let text=query["text"].as_str().unwrap_or("");let star=query["primaryStar"].as_str().unwrap_or("");
    let mut index=0;let mut scanned=0;let mut items=Vec::new();let started=Instant::now();let mut line=String::new();
    loop {
        if token.is_cancelled()||started.elapsed().as_secs()>20{return Err("资料读取已取消或超时。".into())}
        line.clear();if reader.read_line(&mut line).map_err(|e|e.to_string())?==0{break}
        if line.len()>1048576{return Err("资料行超过大小限制。".into())}
        let r:Value=serde_json::from_str(&line).map_err(|_|"资料记录损坏。")?;
        if let Some(k)=key{if r["k"]==k{return Ok(r)}continue}
        index+=1;if index<=offset{continue}scanned+=1;
        if (star.is_empty()||(star=="空宫"&&r["ms"].is_null())||r["ms"].as_str()==Some(star))&&r["c"][topic].as_str().is_some_and(|v|v.contains(text)){items.push(r)}
        if items.len() as u64>=limit||scanned>=512{return Ok(json!({"items":items,"scanned":scanned,"nextOffset":index,"year":query["year"]}))}
    }
    Ok(if key.is_some(){Value::Null}else{json!({"items":items,"scanned":scanned,"nextOffset":null,"year":query["year"]})})
}
#[tauri::command]
pub async fn dataset_read(app:tauri::AppHandle,state:State<'_,AppState>,request_id:String,key:Option<String>,query:Option<Value>)->Result<Value>{
    let token=state.requests.lock().await.get(&request_id).cloned().ok_or("资料请求未初始化。")?;
    let ds=app.state::<DatasetState>();
    let q=query.unwrap_or_else(||json!({}));
    let year=if let Some(ref k)=key{year_from_key(k)?}else{
        let y=q["year"].as_u64().filter(|y|(1950..=2026).contains(y)).ok_or("查询年份无效。")?;
        for (field,max) in [("offset",8784),("limit",24)]{if !q[field].is_null()&&q[field].as_u64().is_none_or(|v|v>max||(field=="limit"&&v==0)){return Err("分页参数无效。".into())}}
        for (field,max) in [("text",80),("primaryStar",12)]{if !q[field].is_null()&&q[field].as_str().is_none_or(|v|v.chars().count()>max){return Err("查询文本无效。".into())}}
        if !q["topic"].is_null()&&!TOPICS.contains(&q["topic"].as_str().unwrap_or("")){return Err("专题无效。".into())}y
    };
    let cached=key.as_ref().and_then(|k|ds.cache.lock().unwrap().iter().find(|v|v["k"].as_str()==Some(k)).cloned());
    if let Some(value)=cached{state.requests.lock().await.remove(&request_id);return Ok(value)}
    let permit=tokio::select!{p=ds.gate.clone().acquire_owned()=>p.map_err(|_|"读取服务已关闭。")?,_=token.cancelled()=>return Err("资料读取已取消。".into()),_=tokio::time::sleep(std::time::Duration::from_secs(20))=>return Err("资料读取等待超时。".into())};
    let app_clone=app.clone();let result=tauri::async_runtime::spawn_blocking(move||{
        let _permit=permit;if token.is_cancelled(){return Err("资料读取已取消。".into())}
        let m=manifest(&app_clone)?;let name=format!("year-{year}.jsonl.zst");let bytes=resource(&app_clone,&name)?;
        let expected=m["files"].as_array().and_then(|a|a.iter().find(|r|r["year"]==year)).and_then(|r|r["sha256"].as_str()).ok_or("年份清单缺失。")?;
        if format!("{:x}",Sha256::digest(&bytes))!=expected{return Err("数据校验失败，请重新安装。".into())}
        let result=scan(bytes,key.as_deref(),&q,&token)?;
        let records=if key.is_some(){vec![result.clone()]}else{result["items"].as_array().cloned().unwrap_or_default()};
        let ds=app_clone.state::<DatasetState>();let mut cache=ds.cache.lock().unwrap();
        for r in records{if r.is_null(){continue}cache.retain(|v|v["k"]!=r["k"]);cache.push_back(r);while cache.len()>32{cache.pop_front();}}
        Ok(result)
    }).await.map_err(|e|e.to_string())?;
    state.requests.lock().await.remove(&request_id);result
}
#[tauri::command]
pub fn dataset_status(app:tauri::AppHandle)->Result<Value>{let m=manifest(&app)?;Ok(json!({"version":m["contentVersion"],"years":77,"records":m["totalCharts"],"compressedBytes":m["zstBytes"],"cachedRecords":app.state::<DatasetState>().cache.lock().unwrap().len(),"cacheLimit":32,"mode":"按年流式解压；单路读取；32 条内存缓存"}))}
#[tauri::command]
pub fn dataset_clear_cache(state:State<'_,DatasetState>){state.cache.lock().unwrap().clear();}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn real_compressed_lookup(){let bytes=include_bytes!("../../../../assets/datasets/ziwei-v4.0-13d/year-1990.jsonl.zst").to_vec();let r=scan(bytes,Some("1990-02-06-11-male"),&json!({}),&CancellationToken::new()).unwrap();assert_eq!(r["ms"],"天同");assert_eq!(r["c"].as_object().unwrap().len(),13);}
    #[test] fn invalid_and_cancelled(){assert!(year_from_key("1990-02-30-0-male").is_err());assert!(year_from_key("../../etc/passwd").is_err());let token=CancellationToken::new();token.cancel();assert!(scan(vec![0],None,&json!({}),&token).is_err());}
}
