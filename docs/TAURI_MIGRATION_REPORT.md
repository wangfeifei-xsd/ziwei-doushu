# Tauri 2 迁移交付记录

日期：2026-10-31。原始基线：`7404915d7b7b2250f0c992b5a0c64394cc6ee682`。已验证代码：`6090ae1adb272d63458924acc05df864b21198cd`。

React + TypeScript + Vite + Tauri 2 的迁移代码已完成，保留独立 Next.js 网站。该代码的 GitHub 公共检查和 Web、Windows、macOS、Android、iOS simulator 五类构建均成功；全部产物已下载并通过 SHA-256。正式签名、Windows/Android 安装与移动真机交互仍需对应证书及设备，不属于本次已验证结果。

## 实现范围

- npm workspaces：`apps/web`、`apps/native` 与 `packages/domain/content/runtime/ui/features`。原生安装包不依赖 Node、Java、Next 或本地 HTTP 服务；网站继续使用 Next、SEO、API 和 H2。
- 复用原排盘规则、钟表原值、流派、全部业务路由、三本古籍 21 章及「玄青星图 / 宣纸墨金」。已有内容随代码打包，未生成虚构知识条目。
- SQLite migration、档案原子编辑和重复保护、偏好与历史、版本化 JSON 导入导出；旧 H2 使用只读导出工具。原个人数据库和模型配置未迁改。
- 原生 reqwest + Channel 双协议流式 AI、取消和超时；Stronghold + Argon2 密钥保存、锁定/解锁、会话密钥。release 模型地址要求 HTTPS，密钥不进入静态包或普通档案导出。
- 桌面文件/图片保存和取消、移动系统分享、剪贴板、外链、HTTPS 分享链接粘贴起盘；Android 返回插件与 iOS 主题/分享插件、安全区适配。
- sh / PowerShell / Node 服务管理器、健康检查、进程身份与进程树清理、独立 Web 包；push 后先公共检查，再由对应 OS runner 构建，上传 manifest 和校验文件。

## 本地使用

仓库根目录安装依赖。Node 版本见 `.node-version`；完整网站档案需要 Java 17+ JDK。

```sh
npm ci
npm run web:up                         # 完整 Next 网站/API/H2，默认 3000
npm run web:status
npm run web:down
npm run web:up -- --port 3001           # 自定义端口
npm run build:web
npm run web:up -- --mode production    # 已构建的生产网站
npm run app-web:up                     # Vite 浏览器样式预览，默认 1420
npm run app-web:down
npm run dev:app                        # 真正 Tauri 桌面调试，需原生工具链
```

macOS/Linux 可用 `./scripts/start.sh` / `./scripts/stop.sh`；Windows 可用 `scripts/start.ps1` / `scripts/stop.ps1` 或上述 npm 入口。两种服务可并行管理，停止不会删除档案、模型配置或备份。Windows 先释放 H2 再结束进程，PowerShell 包装不会等待后台服务的整个运行期。

详细说明：[本地开发](LOCAL_DEVELOPMENT.md)、[原生构建与签名](TAURI_BUILD.md)、[旧数据迁移](DATA_MIGRATION.md)、[GitHub 自动打包](GITHUB_ACTIONS.md)。

## 验证结果

[CI run 41202825672](https://github.com/wangfeifei-xsd/ziwei-doushu/actions/runs/41202825672) 与 [push 构建 run 41202821661](https://github.com/wangfeifei-xsd/ziwei-doushu/actions/runs/41202821661) 已全部成功。后者的打包 jobs 显式依赖公共检查。

- Ubuntu：干净 checkout/npm ci、全 workspace 类型、共享依赖边界、全部既有回归、Next/Vite build、独立 Web 包和浏览器 E2E。
- 回归保留 768 命盘、24,106 日 DST，以及历法/四化/钟表、真实 H2、模型配置和流式协议检查。共享测试覆盖 TS/Rust 规范化哈希、导入、分享、古籍和跨片中文。
- macOS Rust：fmt、clippy、9 项 SQLite/Stronghold/原生 HTTP 流测试。包含并发重复保存、原子编辑/冲突、导入回滚、重启与升级/损坏文件保留，以及真实网络字节流、错误、取消和超时。
- Windows 2025：完整 Web/H2/Vite 生命周期、中文空格路径、不同 cwd、并行服务、端口占用、失效 PID、幂等启停、H2 释放锁/重启恢复/只读导出及 PowerShell 包装入口。相同生命周期在 macOS/Linux 也已验证。
- 浏览器：9 项通过、1 项按宿主跳过（Vite 不调用网站 H2 API）；两主题、全路由/21 章、分享/导入/返回，以及 360、390、768、1024、1440 CSS px 布局。
- 原生 AI 补验：独立测试标识的 macOS debug 应用连接本地 SSE 服务。Chat Completions/Responses 的第 1–2 片先于第 12 片完成可见；离开页面在第 2 片断开上游，页面未收到迟到内容。修复 SSE 已结束而 IPC 再次关闭流导致的额外错误，并新增对应双协议/迟到 IPC/取消/网络错误回归。release 仍只接受 HTTPS，没有调用实际模型厂商。

## 四端实际产物与验收

全部对应 `6090ae1`，下载入口为 [Actions artifacts](https://github.com/wangfeifei-xsd/ziwei-doushu/actions/runs/41202821661#artifacts)，默认保留 14 天。每类包含 `build-manifest.json` 与 `SHA256SUMS`。本地副本位于 `.runtime/releases/0.1.0-6090ae1/`：

- **Web / Ubuntu**：`web/`，Next standalone 与 Vite 预览 tar。runner 在独立目录启动 HTTP/资源/H2 CRUD 成功；前轮下载包也已在本机临时中文目录脱离仓库启动并通过同类操作。
- **macOS ARM64**：`macos-arm64-unsigned/`，`.app.tar.gz` 与 DMG，未做 Developer ID 签名/公证。已核对 SHA/Mach-O，并将本轮下载 app 解包到中文目录，在禁止联网的进程沙盒中实际启动 WKWebView；截图 `selected/native-ci-6090ae1-home.png`。
- **Windows x64**：`windows-x64-unsigned/`，NSIS `紫微命盘_0.1.0_x64-setup.exe`，未签名。真实 MSVC 应用 PE 架构检查通过。安装器的 32 位 NSIS 引导器不等于应用为 32 位。未在 Windows 桌面安装验收；首次安装 WebView2 可能需要联网。
- **Android arm64**：`android-arm64-debug/`，`debug-app-universal-debug.apk`，使用 Android debug keystore，实际只包含 arm64 ABI。SDK 36 / Build Tools 36.0.0 / NDK 28.2.13676358；全部打包 `.so` 的 ELF LOAD 与 APK ZIP 16 KiB 对齐通过。已下载校验，未做设备安装，未生成正式签名 APK/AAB。
- **iOS ARM64 simulator**：`ios-simulator/`，`Ziwei.app` 的 tar 与启动截图；macOS 15 runner 的 iPhone/iOS 18.5 模拟器已安装、启动、检查进程存活并截图。下载后的校验和 plist 检查通过，已人工查看截图，实际显示中文欢迎页。无 Apple distribution 证书/profile，未生成真机 IPA。

Android 初始化已修复 SDK 37 尚不可下载、CLI 回调被错误生成为 `node tauri` 的问题。iOS 启动崩溃已通过 `.ips`/LLDB 定位到系统 `NSBundle bundleWithIdentifier:` 对中文可执行路径的查询；平台配置改为 ASCII 内部名 `Ziwei`，中文显示名「紫微命盘」与 bundle identifier 保持一致，随后模拟器启动通过。相关配置说明见 [TAURI_BUILD.md](TAURI_BUILD.md)。

## macOS release 离线交互

在真实 Tauri/WKWebView 中，关闭本项目 Next/Vite 服务，用 `sandbox-exec` 仅禁止测试应用联网，没有改系统网络设置。离线交互基于 `51781cf` 的 release；本轮 `6090ae1` 下载 release 另完成断网启动复核。

- 测试资料 2000-01-31 23:30、女命、经度 120；起盘按晚子时换日，档案仍保留原始钟表日期。
- 两主题、12 宫、大限/流年、上一年、重新起盘；SQLite 保存/列表/编辑/退出重启恢复。
- 系统 Save 导出 JSON、系统 Open 导入：重复导入新增 0/跳过 1，编辑后导入原备份新增 1/跳过 0。PNG 保存及取消均实际操作，输出图片已打开检查。
- 会话密钥、空输入保留、Stronghold 保存、锁定/解锁和清除；离线阅读《骨髓赋》及检索“紫微”22 条已有原文。

测试仅使用专用资料；测试结束清理本次创建的记录及独立 AI 测试身份。没有覆盖原 H2 数据、网站模型配置或私人环境文件。

## 截图对比与修正

`.runtime/tauri-review/REVIEW.md` 和 `after/` 保留 40 张两主题浏览器截图及多视口检查；`selected/` 包含迁移前后对比、实际 WKWebView 操作、原生录屏和本轮 iOS 启动截图。实际修正并复拍了返回按钮覆盖表单、原生 select 高度/箭头、命盘入场截图、分享图品牌/无站点提示及 AI 正常完成后的多余错误。

可携带证据包：`.runtime/releases/migration-evidence/ziwei-migration-ui-evidence.tar.gz`，同目录附 manifest 和 SHA-256。包含 `REVIEW.md`、两主题图库、精选截图/录屏、原生 AI 分阶段文本和无敏感请求内容的测试日志。这些忽略目录不随 Git 提交，需要单独下载或复制。

## 尚需设备或发行材料的验收

- Windows：安装/升级/卸载、WebView2、保存/剪贴板等原生桌面交互；现有 Windows 启停回归不能替代这些操作。
- Android：实际安装、返回键、系统 URI 分享、键盘、旋转、后台恢复；当前仅构建/签名检查与 16 KiB 对齐。
- iOS：真机签名/IPA、系统分享/文件选择、键盘、安全区和后台恢复；模拟器目前完成启动和页面呈现。
- 各平台正式发行证书、macOS 公证、应用商店上传；实际模型厂商联通。账号、云同步、自动更新、Universal Links 未纳入本轮。

仓库：[wangfeifei-xsd/ziwei-doushu](https://github.com/wangfeifei-xsd/ziwei-doushu)，分支 `feat/tauri2-migration`，[PR #1](https://github.com/wangfeifei-xsd/ziwei-doushu/pull/1)。未合并到主分支。文档后续提交与已验证代码 commit 分别记录，构建成功不等于四端真机正式发行完成。
