# Tauri 2 开发、构建与签名

## 结构与工具链

- `apps/web`：Next 16 网站、SEO、HTTP API、H2/Java。
- `apps/native`：React 19 + TypeScript + Vite 7 + HashRouter；Tauri 2 Rust 宿主。
- `packages/domain`：排盘、表单、规范化、分享；`content`：三个古籍、21 章等已有内容。
- `packages/runtime`：服务/导航/偏好/模态框注入，避免 UI 与业务互相依赖；`ui`、`features` 共用页面和两套主题。
- `assets`：唯一原始素材；`npm run assets` 同步两宿主 public，生成目录不提交。

使用 `.node-version`、`rust-toolchain.toml` 和 npm/Cargo lock。运行 `npm ci`、`npm run check:versions`。应用安装包不包含 Node、Java、Next 服务或用户私人配置。

桌面/移动构建前按照 [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) 安装对应平台工具。无需为了推送代码在开发机安装所有平台 SDK，GitHub 各 runner 独立构建。

## macOS

需要 Rust、Xcode Command Line Tools；移动开发还需要完整 Xcode。最低 macOS 11，默认 Apple Silicon：

```sh
npm run dev:app
npm run build:desktop -- --ci --bundles app,dmg --no-sign
# CI 显式目标
npm run build:desktop -- --ci --target aarch64-apple-darwin --bundles app,dmg --no-sign
```

产物位于 `apps/native/src-tauri/target/[目标架构/]release/bundle/`。未签名/临时签名的本机测试包与 Developer ID + notarization 分发包状态不同；本轮默认不承诺公证。Intel/universal 未纳入默认矩阵，如需要须安装对应 Rust target 并单独构建和验证。

## Windows

需要 Visual Studio C++ Build Tools（MSVC、Windows SDK）、Rust MSVC 工具链、WebView2。默认 x64 NSIS：

```powershell
npm run dev:app
npm run build:desktop -- --ci --target x86_64-pc-windows-msvc --bundles nsis --no-sign
```

产物在对应 `bundle/nsis/`。常规安装器可引导安装 WebView2，需要网络；完全离线的首次安装需预装兼容 WebView2，本轮未内置离线 Runtime 安装包。应用安装后排盘、档案与古籍可离线使用。升级/卸载与非 ASCII 用户路径应单独验收。

## Android

需要 JDK 17、Android SDK/NDK。CI 固定 SDK 36、Build Tools `36.0.0`、NDK `28.2.13676358`，Rust target `aarch64-linux-android`，最低 Android API 24。按实际 SDK 安装路径设置 `ANDROID_HOME` 和 `NDK_HOME`。

锁定的 Tauri CLI 2.12.4 模板使用尚未在 Google 稳定仓库提供的 SDK 37；`mobile-project.mjs` 在生成工程后将 compile/target SDK 与 Build Tools 统一为上述已核对可下载的版本。Tauri 及原生插件库也使用 compile SDK 36，不修改 Cargo registry 的依赖源码。

```sh
node scripts/mobile-project.mjs android
npm run dev:android
npm run build:android -- --ci --target aarch64 --apk --debug
python3 scripts/check-android-alignment.py
```

生成工程在 `apps/native/src-tauri/gen/android`。普通构建使用 Android debug keystore，产出 APK；正式签名构建启用 `SIGN_BUILD=true` 并配置下文凭据，运行 `--apk --aab`。应用 ID `com.ziwei.chart`，ABI `arm64-v8a`。

`.cargo/config.toml` 指定 16 KiB 页对齐，构建后脚本逐个检查 APK **全部** `.so` 的 ELF LOAD 段及 zipalign；检查通过仍需对应 Android 设备/模拟器安装验证。

## iOS

必须 macOS + 完整 Xcode/iOS SDK、可用模拟器、xcodegen。Tauri init 可能通过 Homebrew 安装 xcodegen/libimobiledevice 等工具。首次先确认 `xcode-select -p` 指向所用 Xcode，不能仅有 CLT。

```sh
node scripts/mobile-project.mjs ios
npm run dev:ios
npm run build:ios -- --ci --target aarch64-sim --no-sign --archive-only
node scripts/collect-ios.mjs simulator
bash scripts/smoke-ios-simulator.sh
```

Intel 构建宿主模拟器目标用 `x86_64`。最低 iOS 15；模拟器 `.app.tar.gz` 不能装到真机，也不能改后缀成为 IPA。CI 会启动模拟器、安装、launch 并截图；这只证明实际启动，分享/键盘/后台等仍需交互验收。

iOS 单独使用 `tauri.ios.conf.json` 将内部产品/可执行文件名设为 ASCII `Ziwei`，`Info.ios.plist` 保留桌面显示名「紫微命盘」。这是为了避免已复现的系统 `NSBundle bundleWithIdentifier:` 对非 ASCII 可执行文件路径查询时触发 `CFRelease(NULL)` 崩溃（[相关系统问题](https://github.com/firebase/firebase-ios-sdk/issues/3951)）；不改 bundle identifier 或应用数据身份。Android/macOS/Windows 继续使用原产品名。

真机发行先匹配 Apple Team、`com.ziwei.chart` 对应的 distribution profile 和证书。CI 通过 `prepare-ios-signing.py` 验证 profile 并配置 manual signing，再运行 `tauri ios build --ci --target aarch64 --export-method app-store-connect`。无凭据时仅做模拟器包。

## 标识、版本与权限

当前 `com.ziwei.chart` 是开发标识；正式发行前确定自己控制的 identifier，并在首次正式分发前固定。更改标识会改变沙盒/应用身份，已有数据需要单独制定迁移方案；当前界面不提供档案导入、导出。根、web/native package、Cargo、tauri config 的版本均为 `0.1.0`，由 `check:versions` 校验。

应用图标使用 [Sunburst 生成母版](../assets/APP_ICON.md)，执行 `npm run icons:generate` 更新各端尺寸。移动工程初始化后会同步图标；Android CI 校验最终 APK 的桌面入口与图标资源。

Android versionCode 使用 Tauri 的 semver 派生值；iOS 使用相同版本的 build number。商店每次新上传递增 semver，同一代码重试不自动增加版本。不要为重试生成新的应用身份。

Capability 仅开放当前窗口所需剪贴板、选取/保存文件、选取文件动态授权和 HTTP(S) 外链；不开放 shell 或通用文件系统 scope。API Key 不经 SQLite、localStorage 或前端静态资源：默认仅内存，记住时使用 Stronghold + Argon2 + 每设备随机 salt，重启须解锁。

原生 reqwest 发起模型请求并逐块通过 Channel 交给共享 SSE 解析；release 仅允许 HTTPS，不把全量响应伪装为流。`VITE_SITE_URL` 是公开分享站点，不是模型代理。运行时密钥仅在原生配置页填写。

## macOS 提示“已损坏”或无法验证开发者

旧测试包使用 `--no-sign`，只留下 arm64 链接器签名，没有对 `.app` 的 Info.plist 和资源完成封装；`codesign --verify --deep --strict` 会报 `code has no resources but signature indicates they must be present`。新测试包使用 `signingIdentity: "-"` 完整 ad-hoc 签名，必须在生成 DMG 前完成。收集产物时检查 `.app`，并挂载最终 DMG 再检查其中的实际 `.app`；失败时不会上传安装包。

CI 的测试构建会先移除 Apple 证书及公证环境变量。GitHub 将未配置的 secret 展开为空字符串，而 Tauri 仍会尝试导入已存在的 `APPLE_CERTIFICATE`；仅设为空值不能跳过证书导入。

ad-hoc 签名解决资源完整性问题，不等于 Apple Developer ID 与公证。浏览器下载带有隔离属性，测试包首次启动仍可能被 Gatekeeper 拦截。确认来自自己的 GitHub Actions 并校验 SHA256SUMS 后，将 `.app` 拖入 Applications，可在「系统设置 → 隐私与安全性」中允许打开；仍提示损坏时，仅移除本应用的下载隔离属性：

```sh
xattr -dr com.apple.quarantine "/Applications/紫微命盘.app"
```

上述命令不修复旧包的失效签名，请使用新构建。对外分发须配置下文 Apple Developer ID 证书及公证凭据，以签名模式构建；不要关闭全局 Gatekeeper。签名模式验证资源签名、公证票据和 Gatekeeper 评估。

## 正式签名接入

所有证书放 GitHub `release` environment secrets 或受控本地环境，不提交仓库：

- Android：`ANDROID_KEYSTORE`（base64）、`ANDROID_KEY_ALIAS`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_PASSWORD`。
- macOS：`APPLE_CERTIFICATE`（base64 p12）、`APPLE_CERTIFICATE_PASSWORD`、`APPLE_SIGNING_IDENTITY`、`APPLE_ID`、`APPLE_PASSWORD`（app-specific）、`APPLE_TEAM_ID`。
- iOS：`IOS_CERTIFICATE`（base64 p12）、`IOS_CERTIFICATE_PASSWORD`、`IOS_PROFILE`（base64 provisioning）、`APPLE_DEVELOPMENT_TEAM`。
- Windows：`WINDOWS_CERTIFICATE`（base64 pfx）、`WINDOWS_CERTIFICATE_PASSWORD`。

手动 Actions 勾选 signing，或受信任 `v*` 标签且仓库变量 `ENABLE_SIGNING=true` 才进入签名。显式请求签名却缺材料应失败；没有凭据不能标记为正式签名成功。商店上传、TestFlight、GitHub Release 发布、自动更新均未自动启用。

## 常见问题

- `build:app` 只验证前端；`dev:app:web` 是浏览器预览。实际原生验证必须构建/启动对应 Tauri 宿主。
- 找不到资源先 `npm run assets`；不要复制第二份长期维护的古籍/排盘代码。
- UI 初始化报本地数据库错误时保留原文件，见 [DATA_MIGRATION.md](DATA_MIGRATION.md)。
- 模型锁定后需要解锁；空 Key 保存保留旧值，「清除密钥」需单独确认。仅本次使用的 Key 在应用退出后消失。
- 本机缺 Xcode、Android SDK 或 Windows MSVC 时用对应 GitHub runner 构建，并在报告中保留安装验证差距。
