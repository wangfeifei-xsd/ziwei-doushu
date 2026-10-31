# GitHub 多环境自动打包

## 触发与检查门槛

`.github/workflows/build.yml` 监听所有分支 push、`v*` 标签及手动运行；普通 push 自动运行完整目标集。PR 另执行 `.github/workflows/ci.yml`，不读取签名 secrets。

Build 的 `verify` 调用可复用 CI：Ubuntu 做全 workspace 类型/边界、既有回归、Web/Vite 构建、浏览器 E2E；macOS 做 Rust fmt/clippy/SQLite/Stronghold/流式请求；Windows 做真实启停与 PowerShell 包装回归。所有打包 job 显式 `needs: verify`。

各目标在正确 runner 编译：

- Ubuntu 24.04 → Next standalone、Vite 预览；独立目录 HTTP/资源/H2 CRUD 冒烟。
- Windows 2025 → x64 MSVC NSIS `.exe`。
- macOS 15 → Apple Silicon `.app`、`.dmg`，核验二进制架构。
- Ubuntu 24.04 → arm64 Android debug APK，全部原生库 16 KiB 页与 ZIP 对齐检查；正式签名时增加 APK/AAB。
- macOS 15 → 按 runner 架构选择 iOS 模拟器 `.app`，安装启动并截图；正式签名时增加真机 IPA。

desktop matrix 设置 `fail-fast: false`；平台失败不阻断其他独立平台完成。总汇总 job 会在任何必需目标失败/取消时报失败，不能把部分成功描述为四端完成。手动选择一个平台时仍先执行完整公共检查。

## 下载与校验

推送后进入仓库 **Actions → Build all platforms → 对应 commit run → Artifacts**。每个 artifact 名含平台、架构、签名类型、完整 SHA；保留 14 天。过期后重新运行或自行保存。

Web/app 先 tar 以保留权限、符号链接；每个 artifact 附 `build-manifest.json`、`SHA256SUMS`，记录版本、commit、run、命令、架构、签名状态、大小和实际验证范围。解压 artifact 后校验：

```sh
shasum -a 256 -c SHA256SUMS
# Linux 也可用 sha256sum -c SHA256SUMS
```

Web 解开 standalone tar 后，在支持 Node 22.12+ / Java 17+ JDK 的主机运行 `node start.cjs`。Vite 包用于浏览器样式查看，不能当作原生安装包。模拟器 tar 仅安装到匹配架构的 iOS simulator；Android debug 包/未签名桌面包仅作为测试产物。

## 仓库配置

- Node/Rust 版本在仓库文件固定，锁文件与 OS/架构参与缓存。
- `PUBLIC_SITE_URL` repository variable：公开 HTTPS 网站分享地址；为空时链接分享禁用，仍可导出图片。
- 不向 build 注入任何 `OPENAI_API_KEY`、私人 `.env`、档案数据库或个人配置。
- `build` environment 用于普通编译；`release` environment 可设置审批和受控 secrets。
- 签名 secrets 名称和含义见 [TAURI_BUILD.md](TAURI_BUILD.md)。Android、Apple、Windows 证书相互独立。

普通分支不需要签名材料，输出名称分别为 unsigned/debug/simulator。手动 `workflow_dispatch` 可选 `all/web/windows/macos/android/ios`，`signing=true` 表示**要求**正式签名。标签必须 `v` + 应用 semver（如 `v0.1.0`）；仅当 `ENABLE_SIGNING=true` 时标签要求签名，否则仍明确输出测试包。首次配置签名前应先在受控环境手动验证。

工作流只有只读 contents 权限，不自动创建 Release、不向应用商店上传。证书临时文件构建后清理，iOS profile 验证 bundle/team。新的开发 push 可以取消同分支过时构建，版本签名任务不按普通开发规则取消。

## 诊断

先看 `verify`：其失败时打包应 skipped。构建日志能定位 npm/Cargo、SDK、Gradle、Xcode 或签名步骤，不能仅凭 `.yml` 文件存在认为已构建。浏览器失败上传脱敏测试诊断，勿将真实档案或 Key 附加到日志。

下载/启动、四端安装、真机交互和正式签名分别登记在 [TAURI_MIGRATION_REPORT.md](TAURI_MIGRATION_REPORT.md)。Actions 绿灯仅证明对应命令完成；没有实际设备操作的项目保留待验证状态。
