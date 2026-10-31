# 本地开发与服务启停

## 安装

在仓库根目录执行 `npm ci`。Node 版本固定在 `.node-version`，最低为 22.12；网站档案需要 Java 17+ **JDK**。原生应用不需要 Java/Node 运行时，但开发、编译需要相应工具链，见 [TAURI_BUILD.md](TAURI_BUILD.md)。

根目录 `npm run dev` / `npm run build` / `npm start` 继续分别表示网站开发、网站独立包构建、网站生产启动。先安装依赖再启动，脚本不自动安装依赖或执行生产构建。

## macOS / Linux 后台入口

```sh
./scripts/start.sh                         # 完整 Next 网站，默认 3000
./scripts/start.sh web --port 3001
./scripts/stop.sh web

./scripts/start.sh app-web --port 1420     # Vite 浏览器样式预览
./scripts/stop.sh app-web
node scripts/service.mjs status --all
./scripts/stop.sh --all

npm run build:web
./scripts/start.sh web --mode production --port 3000
```

脚本根据自身位置确定仓库，支持从其他工作目录调用及中文、空格路径。`--port` 优先于 `PORT`；同一目标已启动时返回现有地址，切换端口/模式前须停止。`web` 与 `app-web` 分别记录进程、日志与锁，可以同时运行。默认仅监听 `127.0.0.1`。

## Windows PowerShell

```powershell
npm ci
.\scripts\start.ps1 web --port 3000
.\scripts\start.ps1 app-web --port 1420
node scripts/service.mjs status --all
.\scripts\stop.ps1 --all

npm run build:web
.\scripts\start.ps1 web --mode production --port 3000
```

如果系统策略不允许执行本地 PowerShell 脚本，可以直接使用相同参数的 `node scripts/service.mjs start|stop|status`；无需修改系统执行策略。

## npm 与前台入口

```sh
npm run web:up -- --port 3000
npm run web:down
npm run app-web:up
npm run app-web:down
npm run services:status
npm run services:down

npm run dev:web                # 前台，Ctrl+C 退出
npm run dev:app:web            # Vite 预览，不能验证原生数据库/密钥/对话框
npm run dev:app                # 真正 Tauri 桌面应用 + Vite
```

`app-web` 在浏览器内明确显示预览提示，不伪造 SQLite、Stronghold 或系统文件功能。应用必须通过 Tauri 启动才能使用这些能力。

## 环境、数据、日志

- 根目录 `.env.local`：网站 `OPENAI_*`、`H2_DATA_DIR`、`AI_CONFIG_DIR`、`JAVA_BIN`、`NEXT_PUBLIC_SITE_URL`；示例见 `.env.example`。
- 网站数据库：默认根目录 `data/ziwei.mv.db`；AI 配置默认同目录 `ai-config.json`。相对路径按仓库根目录解析。独立部署包默认按包目录解析，建议部署显式设置绝对路径。
- 应用公开分享站点：编译时环境变量 `VITE_SITE_URL=https://your-site.example`，或原生宿主的 Vite `.env.local`。只含公开地址，禁止放模型密钥。没有有效 HTTPS 地址时仍可导出命盘图片，链接分享禁用。
- 日志：`.runtime/logs/web.log`、`.runtime/logs/app-web.log`；状态：`.runtime/services/`。`tail -f .runtime/logs/web.log` 查看网站诊断。
- 网站健康检查 `/api/health` 连接 H2；Vite 使用 `/__ziwei_health`。管理器还校验实例标识，避免将其他服务误认为启动成功。

停止先发送正常退出信号并等待进程树/端口释放；不会删除档案、配置、备份或日志。对身份、启动时间、仓库不匹配的 PID 仅清理失效记录。外部端口占用会报错并保留占用进程。确认属于本管理器的实例仍不退出时可用 `stop web --force`。

Windows 正常关闭会先让各 Node worker 关闭 H2，再结束 Next/Vite 并核对后代进程退出，避免 Java 被立即终止后留下数据库锁。PowerShell 包装入口只等待管理器完成启停，不等待后台服务的整个运行期。Java 17 启动使用相对资源路径，数据库目录通过环境传递，支持中文目录。

## 生产网站与独立包

```sh
npm run build:web              # Next build + 封装到 dist/web
npm start                     # 加载根环境，运行 dist/web/start.cjs
node scripts/smoke-standalone.mjs
```

部署时复制整个 `dist/web`，准备 Node 22.12+、Java 17+ JDK，不需再次 npm install；设置持久化目录、PORT/HOSTNAME 后运行 `node start.cjs`。静态资源、H2 bridge/JAR 已随包提供。独立包不读取仓库 `.env.local`，环境由部署系统注入。对公网提供服务时显式设置 `HOSTNAME=0.0.0.0`。

## 验证命令

```sh
npm run typecheck
npm test                       # 原有算法/AI/H2 + 共享边界与迁移回归
npm run test:scripts            # 临时目录真实启停与只读导出
npm run build:web
npm run build:app
npx playwright install chromium
npm run test:e2e:web            # 使用隔离数据目录，两种主题及全部路由
npm run test:native             # Rust SQLite / Stronghold / 原生流式请求
```

浏览器 E2E 使用 3159/3160 端口。生产 E2E 前先 `build:web`；不要在开发服务器或 E2E 正运行时重建同一个 `.next`。回归测试只使用临时数据库，不读写个人 `data/`。
