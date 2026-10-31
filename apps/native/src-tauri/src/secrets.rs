use crate::db::Result;
use argon2::Argon2;
use rand::RngCore;
use std::{path::PathBuf, sync::Mutex};
use tauri_plugin_stronghold::stronghold::Stronghold;
use zeroize::Zeroizing;

pub struct SecretStore {
    dir: PathBuf,
    session: Mutex<Option<Zeroizing<String>>>,
    persistent: Mutex<bool>,
    operation: Mutex<()>,
}
impl SecretStore {
    pub fn new(dir: PathBuf) -> Self {
        Self {
            dir,
            session: Mutex::new(None),
            persistent: Mutex::new(false),
            operation: Mutex::new(()),
        }
    }
    pub fn exists(&self) -> bool {
        self.dir.join("model.hold").is_file()
    }
    pub fn locked(&self) -> bool {
        self.exists() && self.session.lock().unwrap().is_none()
    }
    pub fn has_key(&self) -> bool {
        self.exists() || self.session.lock().unwrap().is_some()
    }
    pub fn source(&self) -> &'static str {
        if *self.persistent.lock().unwrap() || self.locked() {
            "saved"
        } else {
            "session"
        }
    }
    pub fn key(&self) -> Result<Zeroizing<String>> {
        self.session
            .lock()
            .unwrap()
            .as_ref()
            .map(|s| Zeroizing::new(s.to_string()))
            .ok_or_else(|| {
                if self.exists() {
                    "密钥库已锁定，请先解锁。".into()
                } else {
                    "请先配置 API Key。".into()
                }
            })
    }
    fn open(&self, password: &str) -> Result<Stronghold> {
        if password.chars().count() < 8 || password.len() > 1024 {
            return Err("解锁密码需要 8 个字符以上，且不能过长。".into());
        }
        std::fs::create_dir_all(&self.dir).map_err(|_| "无法创建密钥目录。")?;
        let salt_path = self.dir.join("model.salt");
        let salt = if salt_path.exists() {
            std::fs::read(&salt_path).map_err(|_| "无法读取密钥库 salt。")?
        } else {
            if self.exists() {
                return Err("密钥库 salt 缺失，请恢复备份或清除密钥库后重新配置。".into());
            }
            let mut bytes = vec![0u8; 32];
            rand::thread_rng().fill_bytes(&mut bytes);
            std::fs::write(&salt_path, &bytes).map_err(|_| "无法保存密钥库 salt。")?;
            bytes
        };
        let mut key = Zeroizing::new(vec![0u8; 32]);
        Argon2::default()
            .hash_password_into(password.as_bytes(), &salt, &mut key)
            .map_err(|_| "密钥派生失败。")?;
        Stronghold::new(self.dir.join("model.hold"), key.to_vec())
            .map_err(|_| "密钥库无法解锁，请检查密码；原文件未修改。".into())
    }
    pub fn save(&self, key: String, remember: bool, password: &str) -> Result<()> {
        let _operation = self.operation.lock().unwrap();
        let key = Zeroizing::new(key);
        if remember {
            let stronghold = self.open(password)?;
            let client = if self.exists() {
                stronghold
                    .load_client(b"model")
                    .map_err(|_| "密钥库内容无法读取。")?
            } else {
                stronghold
                    .create_client(b"model")
                    .map_err(|_| "无法建立密钥库。")?
            };
            client
                .store()
                .insert(b"api-key".to_vec(), key.as_bytes().to_vec(), None)
                .map_err(|_| "无法保存密钥。")?;
            stronghold.save().map_err(|_| "无法保存加密密钥库。")?;
        }
        *self.session.lock().unwrap() = Some(key);
        *self.persistent.lock().unwrap() = remember;
        Ok(())
    }
    pub fn unlock(&self, password: &str) -> Result<()> {
        let _operation = self.operation.lock().unwrap();
        if !self.exists() {
            return Err("尚无已保存的密钥库。".into());
        }
        let stronghold = self.open(password)?;
        let client = stronghold
            .load_client(b"model")
            .map_err(|_| "密钥库内容无法读取。")?;
        let bytes = client
            .store()
            .get(b"api-key")
            .map_err(|_| "密钥库内容无法读取。")?
            .ok_or("密钥库中没有 API Key。")?;
        let key = String::from_utf8(bytes).map_err(|_| "已保存密钥格式异常。")?;
        *self.session.lock().unwrap() = Some(Zeroizing::new(key));
        *self.persistent.lock().unwrap() = true;
        Ok(())
    }
    pub fn lock(&self) {
        let _operation = self.operation.lock().unwrap();
        self.session.lock().unwrap().take();
    }
    pub fn clear(&self) -> Result<()> {
        let _operation = self.operation.lock().unwrap();
        for name in ["model.hold", "model.salt"] {
            let file = self.dir.join(name);
            if file.exists() {
                std::fs::remove_file(file).map_err(|_| "无法清除密钥文件。")?;
            }
        }
        self.session.lock().unwrap().take();
        *self.persistent.lock().unwrap() = false;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn encrypted_store_lock_restart_wrong_password_and_clear() {
        let dir = tempfile::tempdir().unwrap();
        let store = SecretStore::new(dir.path().to_path_buf());
        store
            .save("fixture-only-secret".into(), true, "test-password")
            .unwrap();
        assert_eq!(&**store.key().unwrap(), "fixture-only-secret");
        let bytes = std::fs::read(dir.path().join("model.hold")).unwrap();
        assert!(!bytes.windows(19).any(|w| w == b"fixture-only-secret"));
        store.lock();
        assert!(store.locked());
        assert!(store.unlock("wrong-password").is_err());
        let restarted = SecretStore::new(dir.path().to_path_buf());
        restarted.unlock("test-password").unwrap();
        assert_eq!(&**restarted.key().unwrap(), "fixture-only-secret");
        restarted.clear().unwrap();
        assert!(!restarted.has_key());
        assert!(!restarted.exists());
        restarted.save("session-only".into(), false, "").unwrap();
        assert!(!restarted.exists());
    }
}
