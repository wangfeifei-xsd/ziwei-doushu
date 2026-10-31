use chrono::{Datelike, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    Row, SqlitePool,
};
use std::{collections::BTreeMap, path::PathBuf, time::Duration};
use tokio::sync::OnceCell;

pub type Result<T> = std::result::Result<T, String>;
pub struct Database {
    pub path: PathBuf,
    pool: OnceCell<SqlitePool>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub form: Value,
    pub saved_at: i64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRecord {
    pub id: String,
    pub canonical: String,
    pub saved_at: i64,
}
#[derive(Debug, Serialize)]
pub struct ImportSummary {
    pub added: usize,
    pub skipped: usize,
}
fn db_error(_: impl std::fmt::Display) -> String {
    "本地数据库操作失败，原始文件已保留，请重试或恢复备份。".into()
}

pub fn validate_form(raw: &str) -> Result<(String, Value)> {
    if raw.len() > 8192 {
        return Err("出生资料过长。".into());
    }
    let form: Value = serde_json::from_str(raw).map_err(|_| "出生资料不是有效 JSON。")?;
    let obj = form.as_object().ok_or("出生资料必须是对象。")?;
    if obj.len() != 11 {
        return Err("出生资料字段不完整。".into());
    }
    for key in ["name", "province", "city"] {
        let text = form[key].as_str().ok_or("出生资料文字格式错误。")?;
        if text.encode_utf16().count() > 80 || text.trim() != text {
            return Err("出生资料文字需要规范化，最多 80 个字。".into());
        }
    }
    let number = |key: &str, min: u32, max: u32| -> Result<u32> {
        let text = form[key].as_str().ok_or("时间字段必须是规范化字符串。")?;
        let value: u32 = text.parse().map_err(|_| "时间字段无效。")?;
        if text != value.to_string() || !(min..=max).contains(&value) {
            return Err("时间字段超出范围。".into());
        }
        Ok(value)
    };
    let year = number("year", 1900, Utc::now().year() as u32)?;
    let month = number("month", 1, 12)?;
    let day = number("day", 1, 31)?;
    NaiveDate::from_ymd_opt(year as i32, month, day).ok_or("出生日期不存在。")?;
    number("clockHour", 0, 23)?;
    number("clockMinute", 0, 59)?;
    form["unknownTime"].as_bool().ok_or("未知时辰字段无效。")?;
    if !matches!(form["gender"].as_str(), Some("male" | "female")) {
        return Err("性别字段无效。".into());
    }
    let longitude = form["longitude"].as_f64().ok_or("经度无效。")?;
    if !longitude.is_finite() || !(-180.0..=180.0).contains(&longitude) {
        return Err("经度超出范围。".into());
    }
    Ok((format!("{:x}", Sha256::digest(raw.as_bytes())), form))
}
fn profile(row: sqlx::sqlite::SqliteRow) -> Result<Profile> {
    Ok(Profile {
        id: row.get("id"),
        form: serde_json::from_str(row.get("form_json")).map_err(db_error)?,
        saved_at: row.get("saved_at"),
    })
}
impl Database {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            pool: OnceCell::new(),
        }
    }
    pub async fn pool(&self) -> Result<&SqlitePool> {
        self.pool
            .get_or_try_init(|| async {
                if let Some(parent) = self.path.parent() {
                    std::fs::create_dir_all(parent).map_err(db_error)?;
                }
                let options = SqliteConnectOptions::new()
                    .filename(&self.path)
                    .create_if_missing(true)
                    .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
                    .busy_timeout(Duration::from_secs(10));
                let pool = SqlitePoolOptions::new()
                    .max_connections(1)
                    .connect_with(options)
                    .await
                    .map_err(db_error)?;
                sqlx::migrate!("./migrations")
                    .run(&pool)
                    .await
                    .map_err(db_error)?;
                Ok(pool)
            })
            .await
    }
    pub async fn list(&self) -> Result<Vec<Profile>> {
        sqlx::query("SELECT * FROM birth_profiles ORDER BY saved_at DESC, id")
            .fetch_all(self.pool().await?)
            .await
            .map_err(db_error)?
            .into_iter()
            .map(profile)
            .collect()
    }
    pub async fn get(&self, id: &str) -> Result<Option<Profile>> {
        sqlx::query("SELECT * FROM birth_profiles WHERE id = ?")
            .bind(id)
            .fetch_optional(self.pool().await?)
            .await
            .map_err(db_error)?
            .map(profile)
            .transpose()
    }
    pub async fn save(&self, canonical: &str) -> Result<Profile> {
        let (id, _) = validate_form(canonical)?;
        sqlx::query("INSERT INTO birth_profiles VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET form_json=excluded.form_json,saved_at=excluded.saved_at")
            .bind(&id).bind(canonical).bind(Utc::now().timestamp_millis()).execute(self.pool().await?).await.map_err(db_error)?;
        self.get(&id).await?.ok_or("档案保存后无法读取。".into())
    }
    pub async fn update(&self, original: &str, canonical: &str) -> Result<Profile> {
        let (id, _) = validate_form(canonical)?;
        let mut tx = self.pool().await?.begin().await.map_err(db_error)?;
        let exists: i64 = sqlx::query_scalar("SELECT count(*) FROM birth_profiles WHERE id = ?")
            .bind(original)
            .fetch_one(&mut *tx)
            .await
            .map_err(db_error)?;
        if exists == 0 {
            return Err("档案已被删除，请刷新后重试。".into());
        }
        if original != id {
            let duplicate: i64 =
                sqlx::query_scalar("SELECT count(*) FROM birth_profiles WHERE id = ?")
                    .bind(&id)
                    .fetch_one(&mut *tx)
                    .await
                    .map_err(db_error)?;
            if duplicate != 0 {
                return Err("已有完全相同的档案，不能覆盖。".into());
            }
        }
        sqlx::query("DELETE FROM birth_profiles WHERE id = ?")
            .bind(original)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        sqlx::query("INSERT INTO birth_profiles VALUES (?, ?, ?)")
            .bind(&id)
            .bind(canonical)
            .bind(Utc::now().timestamp_millis())
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        self.get(&id).await?.ok_or("档案更新后无法读取。".into())
    }
    pub async fn remove(&self, id: &str) -> Result<bool> {
        Ok(sqlx::query("DELETE FROM birth_profiles WHERE id = ?")
            .bind(id)
            .execute(self.pool().await?)
            .await
            .map_err(db_error)?
            .rows_affected()
            > 0)
    }
    pub async fn import(&self, records: Vec<ImportRecord>) -> Result<ImportSummary> {
        if records.len() > 10_000 {
            return Err("档案不能超过 10000 条。".into());
        }
        for row in &records {
            let (id, _) = validate_form(&row.canonical)?;
            if id != row.id || row.saved_at < 0 || row.saved_at > 9_007_199_254_740_991 {
                return Err("备份的档案编号或时间无效。".into());
            }
        }
        let mut tx = self.pool().await?.begin().await.map_err(db_error)?;
        let mut summary = ImportSummary {
            added: 0,
            skipped: 0,
        };
        for row in records {
            let old: Option<String> =
                sqlx::query_scalar("SELECT form_json FROM birth_profiles WHERE id=?")
                    .bind(&row.id)
                    .fetch_optional(&mut *tx)
                    .await
                    .map_err(db_error)?;
            if let Some(old) = old {
                if old != row.canonical {
                    return Err("备份存在编号内容冲突，导入已回滚。".into());
                }
                summary.skipped += 1;
            } else {
                sqlx::query("INSERT INTO birth_profiles VALUES (?,?,?)")
                    .bind(row.id)
                    .bind(row.canonical)
                    .bind(row.saved_at)
                    .execute(&mut *tx)
                    .await
                    .map_err(db_error)?;
                summary.added += 1;
            }
        }
        tx.commit().await.map_err(db_error)?;
        Ok(summary)
    }
    pub async fn settings(&self) -> Result<BTreeMap<String, String>> {
        let rows = sqlx::query("SELECT key,value_json FROM app_settings")
            .fetch_all(self.pool().await?)
            .await
            .map_err(db_error)?;
        Ok(rows
            .into_iter()
            .map(|row| (row.get("key"), row.get("value_json")))
            .collect())
    }
    pub async fn set(&self, key: &str, value: Option<&str>) -> Result<()> {
        if key.len() > 120 || value.is_some_and(|s| s.len() > 1_048_576) {
            return Err("偏好设置过长。".into());
        }
        if let Some(value) = value {
            sqlx::query("INSERT INTO app_settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json").bind(key).bind(value).execute(self.pool().await?).await.map_err(db_error)?;
        } else {
            sqlx::query("DELETE FROM app_settings WHERE key=?")
                .bind(key)
                .execute(self.pool().await?)
                .await
                .map_err(db_error)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const FORM: &str = r#"{"name":"测试😀","year":"2000","month":"1","day":"31","clockHour":"23","clockMinute":"30","unknownTime":false,"province":"浙江省","city":"杭州市","longitude":120.2,"gender":"female"}"#;
    #[tokio::test]
    async fn archive_transactions_import_and_restart() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.sqlite");
        let db = Database::new(path.clone());
        let first = db.save(FORM).await.unwrap();
        assert_eq!(first.form["clockHour"], "23");
        let mut handles = Vec::new();
        for _ in 0..5 {
            handles.push(db.save(FORM));
        }
        for saved in futures_util::future::join_all(handles).await {
            assert_eq!(saved.unwrap().id, first.id);
        }
        assert_eq!(db.list().await.unwrap().len(), 1);
        let other = FORM.replace("测试😀", "另一个人");
        let second = db.save(&other).await.unwrap();
        assert!(db.update(&first.id, &other).await.is_err());
        assert!(db.get(&first.id).await.unwrap().is_some());
        let changed = FORM.replace("30\"", "45\"");
        let edited = db.update(&first.id, &changed).await.unwrap();
        assert_ne!(edited.id, first.id);
        assert!(db.get(&first.id).await.unwrap().is_none());
        let invalid = ImportRecord {
            id: "invalid".into(),
            canonical: FORM.into(),
            saved_at: 1,
        };
        assert!(db.import(vec![invalid]).await.is_err());
        assert_eq!(db.list().await.unwrap().len(), 2);
        let records = vec![
            ImportRecord {
                id: edited.id.clone(),
                canonical: changed.clone(),
                saved_at: 1,
            },
            ImportRecord {
                id: first.id.clone(),
                canonical: FORM.into(),
                saved_at: 42,
            },
        ];
        let imported = db.import(records).await.unwrap();
        assert_eq!((imported.added, imported.skipped), (1, 1));
        db.pool().await.unwrap().close().await;
        let db = Database::new(path);
        assert_eq!(db.get(&first.id).await.unwrap().unwrap().saved_at, 42);
        assert!(db.remove(&second.id).await.unwrap());
        assert!(!db.remove(&second.id).await.unwrap());
        let conn = db.pool().await.unwrap();
        let version: i64 = sqlx::query_scalar("SELECT count(*) FROM _sqlx_migrations")
            .fetch_one(conn)
            .await
            .unwrap();
        assert_eq!(version, 1);
    }
    #[test]
    fn rejects_invalid_data_without_touching_clock() {
        let (_, form) = validate_form(FORM).unwrap();
        assert_eq!(form["day"], "31");
        assert!(validate_form(&FORM.replace("\"month\":\"1\"", "\"month\":\"2\"")).is_err());
        assert!(validate_form(&FORM.replace("\"23\"", "\"24\"")).is_err());
    }
}

#[cfg(test)]
mod migration_tests {
    use super::*;
    #[test]
    fn matches_typescript_canonical_sha256_vectors() {
        let fixture: Value = serde_json::from_str(include_str!(
            "../../../../scripts/fixtures/profiles-v1.json"
        ))
        .unwrap();
        for row in fixture["profiles"].as_array().unwrap() {
            assert_eq!(
                validate_form(row["canonical"].as_str().unwrap()).unwrap().0,
                row["id"].as_str().unwrap()
            );
        }
    }
    #[tokio::test]
    async fn import_conflict_rolls_back_prior_insert() {
        let fixture: Value = serde_json::from_str(include_str!(
            "../../../../scripts/fixtures/profiles-v1.json"
        ))
        .unwrap();
        let rows = fixture["profiles"].as_array().unwrap();
        let dir = tempfile::tempdir().unwrap();
        let db = Database::new(dir.path().join("rollback.sqlite"));
        let original = db
            .save(rows[0]["canonical"].as_str().unwrap())
            .await
            .unwrap();
        sqlx::query("UPDATE birth_profiles SET form_json=? WHERE id=?")
            .bind(rows[1]["canonical"].as_str().unwrap())
            .bind(&original.id)
            .execute(db.pool().await.unwrap())
            .await
            .unwrap();
        let records = [2, 0]
            .map(|i| ImportRecord {
                id: rows[i]["id"].as_str().unwrap().into(),
                canonical: rows[i]["canonical"].as_str().unwrap().into(),
                saved_at: 42,
            })
            .into();
        assert!(db.import(records).await.unwrap_err().contains("回滚"));
        assert!(db
            .get(rows[2]["id"].as_str().unwrap())
            .await
            .unwrap()
            .is_none());
        assert_eq!(db.list().await.unwrap().len(), 1);
    }
    #[tokio::test]
    async fn initial_migration_preserves_existing_rows_and_corruption() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("v0.sqlite");
        let pool = SqlitePoolOptions::new()
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(&path)
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        sqlx::query("CREATE TABLE legacy_marker(value TEXT)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO legacy_marker VALUES ('keep-existing-data')")
            .execute(&pool)
            .await
            .unwrap();
        pool.close().await;
        let db = Database::new(path);
        let pool = db.pool().await.unwrap();
        let value: String = sqlx::query_scalar("SELECT value FROM legacy_marker")
            .fetch_one(pool)
            .await
            .unwrap();
        assert_eq!(value, "keep-existing-data");
        let path = dir.path().join("corrupt.sqlite");
        let bytes = b"fixture of a damaged database, do not delete";
        std::fs::write(&path, bytes).unwrap();
        let db = Database::new(path.clone());
        assert!(db.pool().await.is_err());
        assert_eq!(std::fs::read(path).unwrap(), bytes);
    }
}
