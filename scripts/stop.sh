#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$PROJECT_DIR/.runtime/dev.pid"
NEXT_CLI="$PROJECT_DIR/node_modules/next/dist/bin/next"
pid=""

is_app_running() {
  [[ "$pid" =~ ^[1-9][0-9]*$ ]] && [[ "$pid" -gt 1 ]] || return 1
  local process_command
  process_command="$(ps -p "$pid" -o args= 2>/dev/null)" || return 1
  [[ "$process_command" == *"$NEXT_CLI dev --hostname 127.0.0.1 --port "* ]]
}

if [[ ! -f "$PID_FILE" ]]; then
  echo "项目未运行（没有通过 start.sh 启动的进程）。"
  exit 0
fi

read -r pid saved_port < "$PID_FILE" || true
if ! is_app_running; then
  rm -f "$PID_FILE"
  echo "项目未运行，已清理失效的进程记录。"
  exit 0
fi

echo "正在关闭项目（PID: ${pid}）……"
kill -TERM "$pid"

for (( attempt = 0; attempt < 15; attempt++ )); do
  if ! is_app_running; then
    rm -f "$PID_FILE"
    echo "项目已关闭。"
    exit 0
  fi
  sleep 1
done

echo "进程尚未退出，请检查 .runtime/dev.log 后重试；已保留进程记录。" >&2
exit 1
