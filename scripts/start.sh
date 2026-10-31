#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$PROJECT_DIR/.runtime"
PID_FILE="$RUNTIME_DIR/dev.pid"
LOG_FILE="$RUNTIME_DIR/dev.log"
NEXT_CLI="$PROJECT_DIR/node_modules/next/dist/bin/next"
APP_PORT="${PORT:-3000}"
pid=""

is_app_running() {
  [[ "$pid" =~ ^[1-9][0-9]*$ ]] && [[ "$pid" -gt 1 ]] || return 1
  local process_command
  process_command="$(ps -p "$pid" -o args= 2>/dev/null)" || return 1
  [[ "$process_command" == *"$NEXT_CLI dev --hostname 127.0.0.1 --port "* ]]
}

cd "$PROJECT_DIR"

for dependency in node npm curl; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    echo "缺少命令：$dependency。请先安装 Node.js 20.9+（推荐 22 LTS）和 curl。" >&2
    exit 1
  fi
done

if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 20 || (major === 20 && minor >= 9) ? 0 : 1)'; then
  echo "需要 Node.js 20.9+，当前版本：$(node --version)" >&2
  exit 1
fi

if [[ ! "$APP_PORT" =~ ^[1-9][0-9]{0,4}$ ]] || (( APP_PORT > 65535 )); then
  echo "PORT 必须是 1–65535 之间的整数。" >&2
  exit 1
fi

mkdir -p "$RUNTIME_DIR"
if [[ -f "$PID_FILE" ]]; then
  read -r pid saved_port < "$PID_FILE" || true
  if is_app_running; then
    echo "项目已在运行：http://localhost:${saved_port}（PID: ${pid}）"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

# 提前检查端口，避免把其他服务的响应误判为本项目启动成功。
node - "$APP_PORT" <<'NODE'
const net = require('node:net');
const port = Number(process.argv[2]);
const server = net.createServer();
server.once('error', (error) => {
  console.error(`无法使用端口 ${port}：${error.message}。可用 PORT=3001 ./scripts/start.sh 指定其他端口。`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => server.close());
NODE

if [[ ! -f "$NEXT_CLI" ]]; then
  echo "首次启动，正在安装依赖……"
  npm ci --no-audit --no-fund
fi

# H2 驱动随项目提供，提前检查 Java，避免起盘成功却无法保存档案。
node scripts/check-h2.mjs

echo "正在启动开发服务器……"
# 独立进程组确保启动脚本/终端结束后仍能运行；SIGTERM 由 Next.js 传递给子进程。
pid="$(node - "$NEXT_CLI" "$APP_PORT" "$LOG_FILE" <<'NODE'
const { spawn } = require('node:child_process');
const { openSync, closeSync } = require('node:fs');
const [nextCli, port, logFile] = process.argv.slice(2);
const log = openSync(logFile, 'w');
const child = spawn(process.execPath, [nextCli, 'dev', '--hostname', '127.0.0.1', '--port', port], {
  detached: true,
  stdio: ['ignore', log, log],
});
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('spawn', () => {
  console.log(child.pid);
  closeSync(log);
  child.unref();
});
NODE
)"
printf '%s %s\n' "$pid" "$APP_PORT" > "$PID_FILE"

for (( attempt = 0; attempt < 60; attempt++ )); do
  if ! kill -0 "$pid" 2>/dev/null; then
    break
  fi
  if curl --fail --silent --max-time 2 "http://127.0.0.1:$APP_PORT" > /dev/null && is_app_running; then
    echo "启动成功：http://localhost:${APP_PORT}（PID: ${pid}）"
    echo "日志：$LOG_FILE"
    echo "关闭：$PROJECT_DIR/scripts/stop.sh"
    exit 0
  fi
  sleep 1
done

echo "启动失败或等待超时，最近的日志如下：" >&2
tail -n 40 "$LOG_FILE" >&2
"$PROJECT_DIR/scripts/stop.sh"
exit 1
