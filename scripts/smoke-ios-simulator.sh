#!/usr/bin/env bash
set -euo pipefail
bounded() {
  python3 - "$@" <<'PY'
import subprocess, sys
try:
    result=subprocess.run(sys.argv[2:], timeout=int(sys.argv[1]))
    raise SystemExit(result.returncode)
except subprocess.TimeoutExpired:
    print('Simulator command timed out: '+ ' '.join(sys.argv[2:]), file=sys.stderr)
    raise SystemExit(124)
PY
}
read -r SIM_RUNTIME SIM_TYPE < <(bounded 45 xcrun simctl list devices available -j | python3 -c 'import json,sys; d=json.load(sys.stdin); print(next(runtime+" "+v["deviceTypeIdentifier"] for runtime,devices in d["devices"].items() for v in devices if "iPhone" in v["name"]))')
# Use an owned device rather than the runner image's pre-created simulator.
DEVICE=$(bounded 45 xcrun simctl create "Ziwei CI ${GITHUB_RUN_ID:-local}" "$SIM_TYPE" "$SIM_RUNTIME")
DIAGNOSTICS="$PWD/.runtime/ios-diagnostics"
mkdir -p "$DIAGNOSTICS"
STARTED_AT=$(date +%s)
APP_INSTALLED=false
finish() {
  local result=$?
  trap - EXIT
  set +e
  if [[ $result != 0 ]]; then
    for file in "$DIAGNOSTICS/readiness.log" "$DIAGNOSTICS/stdout.log" "$DIAGNOSTICS/stderr.log"; do
      if [[ -f "$file" ]]; then tail -100 "$file"; fi
    done
    bounded 30 xcrun simctl spawn "$DEVICE" log show --last 5m --style compact --predicate 'process == "Ziwei" OR process == "紫微命盘" OR process == "ziwei-native" OR process == "SpringBoard" OR process == "CoreSimulatorBridge" OR eventMessage CONTAINS "com.ziwei.chart"' > "$DIAGNOSTICS/system.log" 2>&1
    # Reproduce an early native crash under LLDB, including faults before Rust
    # can install its panic hook or the WebView can produce console output.
    if [[ "$APP_INSTALLED" == true ]]; then
      bounded 15 xcrun simctl terminate "$DEVICE" com.ziwei.chart >/dev/null 2>&1
      bounded 30 xcrun simctl launch --wait-for-debugger "$DEVICE" com.ziwei.chart > "$DIAGNOSTICS/debug-launch.log" 2>&1
      local debug_pid
      debug_pid=$(awk '/^com\.ziwei\.chart:/ {print $NF}' "$DIAGNOSTICS/debug-launch.log")
      if [[ "$debug_pid" =~ ^[0-9]+$ ]]; then
        bounded 90 xcrun lldb --batch -p "$debug_pid" -o continue -k 'thread backtrace all' -k 'register read' > "$DIAGNOSTICS/backtrace.log" 2>&1
        tail -120 "$DIAGNOSTICS/backtrace.log"
      fi
    fi
    python3 - "$DIAGNOSTICS" "$DEVICE" "$STARTED_AT" <<'PY'
import pathlib, shutil, sys
output=pathlib.Path(sys.argv[1])/'crashes'
home=pathlib.Path.home()
roots=[home/'Library/Logs/DiagnosticReports', home/'Library/Developer/CoreSimulator/Devices'/sys.argv[2]/'data/Library/Logs']
for index, root in enumerate(roots):
    if not root.exists(): continue
    for source in root.rglob('*'):
        if source.is_file() and source.suffix in ('.ips', '.crash') and source.stat().st_mtime >= int(sys.argv[3])-30:
            target=output/str(index)/source.relative_to(root)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
PY
  fi
  bounded 20 xcrun simctl terminate "$DEVICE" com.ziwei.chart >/dev/null 2>&1
  bounded 30 xcrun simctl shutdown "$DEVICE" >/dev/null 2>&1
  bounded 30 xcrun simctl delete "$DEVICE" >/dev/null 2>&1
  exit "$result"
}
trap finish EXIT
echo 'iOS smoke: boot simulator'
bounded 45 xcrun simctl boot "$DEVICE"
bounded 30 open -a Simulator --args -CurrentDeviceUDID "$DEVICE"
bounded 240 xcrun simctl bootstatus "$DEVICE" -b
# bootstatus can finish while SpringBoard is still unresponsive on a cold
# runner. Probe it with an Apple app before installing or testing our app.
echo 'iOS smoke: verify simulator UI readiness'
if ! bounded 60 xcrun simctl launch "$DEVICE" com.apple.Preferences > "$DIAGNOSTICS/readiness.log" 2>&1; then
  cat "$DIAGNOSTICS/readiness.log"
  echo 'iOS smoke: restart unresponsive simulator once'
  bounded 45 xcrun simctl shutdown "$DEVICE"
  bounded 45 xcrun simctl boot "$DEVICE"
  bounded 240 xcrun simctl bootstatus "$DEVICE" -b
  bounded 60 xcrun simctl launch "$DEVICE" com.apple.Preferences > "$DIAGNOSTICS/readiness.log" 2>&1
fi
bounded 20 xcrun simctl terminate "$DEVICE" com.apple.Preferences >/dev/null 2>&1 || true
APP=$(cat .runtime/ios-simulator-app.txt)
echo 'iOS smoke: install app'
bounded 180 xcrun simctl install "$DEVICE" "$APP"
APP_INSTALLED=true
echo 'iOS smoke: launch app'
SIMCTL_CHILD_RUST_BACKTRACE=full SIMCTL_CHILD_RUST_LOG=info bounded 90 xcrun simctl launch --stdout="$DIAGNOSTICS/stdout.log" --stderr="$DIAGNOSTICS/stderr.log" "$DEVICE" com.ziwei.chart > "$DIAGNOSTICS/launch.log"
cat "$DIAGNOSTICS/launch.log"
APP_PID=$(awk '/com\.ziwei\.chart:/ {print $NF}' "$DIAGNOSTICS/launch.log")
[[ "$APP_PID" =~ ^[0-9]+$ ]]
sleep 5
echo 'iOS smoke: screenshot and verify process'
bounded 60 xcrun simctl io "$DEVICE" screenshot dist/artifacts/ios-simulator-launch.png
ps -p "$APP_PID" -o pid=,args= > "$DIAGNOSTICS/process.log"
kill -0 "$APP_PID"
bounded 20 xcrun simctl terminate "$DEVICE" com.ziwei.chart
