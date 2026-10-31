# Tauri 2 迁移交付记录

日期：2026-10-31。基线：`7404915d7b7b2250f0c992b5a0c64394cc6ee682`。

## 实现范围

已拆分 npm workspaces，保留 Next 网站/SEO/API 和 H2；原生使用 React/Vite/Tauri 2 + SQLite，无本地 Node/Java/HTTP 服务依赖。排盘算法、流派、钟表原值、三个古籍 21 章、命盘/合盘/档案/模型等完整路由、玄青星图/宣纸墨金共用实现。增加 `runtime` 包解决服务注入与 UI/业务环依赖。

原生实现 SQLite 原子档案、重复保护、版本化导入/导出、偏好/历史；reqwest 双协议流式 AI 与取消、Stronghold 锁定和会话密钥；文件/图片导出、剪贴板、HTTPS 分享粘贴起盘、Android 返回/iOS 分享插件、安全区适配。原个人 H2 数据与模型配置未迁改，旧数据通过只读工具导出。

更新 sh/PowerShell/Node 启停、健康检查、身份验证、进程树退出、独立 Web 包；实现 push 自动验证和多 OS 打包、签名接入、manifest 和 SHA-256。运行说明见 [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)、[TAURI_BUILD.md](TAURI_BUILD.md)、[DATA_MIGRATION.md](DATA_MIGRATION.md)、[GITHUB_ACTIONS.md](GITHUB_ACTIONS.md)。

## 已有本地证据

- 原有全量回归通过：768 命盘、24,106 日 DST、日期/历法/四化/钟表、真实 H2、模型配置和流协议。
- 新共享回归通过：固定字段哈希、TS/Rust golden fixture、JSON 导入、HTTPS 分享、古籍目录和中文跨片流。
- 边界检查和全 workspace TypeScript 通过，共享层不直接依赖 Next/Tauri/Node，React 单份加载。
- Rust SQLite/Stronghold/原生 reqwest 测试通过，含原子事务、重启、升级/损坏文件保留、双协议真实字节流、错误/取消/超时。
- 真实启停回归通过：临时中文空格路径、任意 cwd、两个服务并行、外部占用、失效 PID、幂等、H2 重启及只读导出。
- Next 生产、Vite 生产和 Web standalone 独立中文空格目录 HTTP/资源/H2 CRUD 通过。
- 浏览器两主题全路由、21 章、分享/导入/返回与 360–1440 视口回归通过。Vite 预览不会冒充原生服务验证。
- macOS ARM64 未签名 release `.app` 已实际编译并启动 WKWebView；其余平台由真实 GitHub runner 验证后补记。

测试日志和约 40 张浏览器截图位于本地 `.runtime/`，不随 Git 提交；精选截图在交付证据包附带。第一次截图发现应用浮动返回按钮遮挡移动表单，已改为顶部正常文档流返回栏；命盘截图增加等待入场动画完成，复拍完整内容。没有改变上一轮视觉设计和排盘口径。

## 平台与签名状态

- macOS：本地 ARM64 release 已构建、启动；本轮无 Developer ID、公证材料。系统文件对话框和离线交互继续实测记录。
- Windows：已实现 MSVC/NSIS 构建和 PowerShell 生命周期；等待真实 runner 和安装验收。
- Android：已实现 Kotlin 返回/分享、SDK/NDK/arm64 构建、16 KiB 检查；本机无 Android SDK/设备，等待 runner 与设备验收。
- iOS：生成工程、Swift 分享和模拟器/签名工作流已实现；本机仅 CLT，无完整 Xcode，等待 macOS runner 模拟器验证；无 distribution 证书/profile，尚无可分发 IPA。

四端正式签名、商店上传、Windows 安装/卸载与 WebView2、Android 实机返回/URI/键盘、iOS 真机分享/安全区/后台验收，均不由浏览器测试或脚手架替代。账号、云同步、自动更新和 Universal Links 未纳入首版。

## GitHub 验证

远端：`https://github.com/wangfeifei-xsd/ziwei-doushu`。迁移分支完成首次推送后记录真实 run/job、产物下载和校验结果；线上构建结果将在本节更新，不能以配置存在代替执行结果。
