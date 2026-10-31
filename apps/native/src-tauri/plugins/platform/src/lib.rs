#[cfg(mobile)]
use tauri::{plugin::PluginHandle, Manager};
use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_platform);

#[cfg(mobile)]
pub struct Platform<R: Runtime>(PluginHandle<R>);

#[cfg(mobile)]
impl<R: Runtime> Platform<R> {
    pub fn share(&self, path: &str, mime: &str) -> Result<serde_json::Value, String> {
        self.0
            .run_mobile_plugin("share", serde_json::json!({"path":path,"mime":mime}))
            .map_err(|_| "无法打开系统分享面板。".into())
    }
    pub fn navigation(&self, intercept: bool, light: bool) -> Result<(), String> {
        self.0
            .run_mobile_plugin::<serde_json::Value>(
                "navigation",
                serde_json::json!({"intercept":intercept,"light":light}),
            )
            .map(|_| ())
            .map_err(|_| "无法更新系统导航。".into())
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("platform")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            let handle = _api.register_android_plugin("com.ziwei.platform", "PlatformPlugin")?;
            #[cfg(target_os = "ios")]
            let handle = _api.register_ios_plugin(init_plugin_platform)?;
            #[cfg(mobile)]
            _app.manage(Platform(handle));
            Ok(())
        })
        .build()
}
