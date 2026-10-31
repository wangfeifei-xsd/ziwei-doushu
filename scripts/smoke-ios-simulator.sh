#!/usr/bin/env bash
set -euo pipefail
DEVICE=$(xcrun simctl list devices available -j | python3 -c 'import json,sys; d=json.load(sys.stdin); print(next(v["udid"] for devices in d["devices"].values() for v in devices if "iPhone" in v["name"]))')
DIAGNOSTICS="$PWD/.runtime/ios-diagnostics"
mkdir -p "$DIAGNOSTICS"
finish() {
  local result=$?
  trap - EXIT
  set +e
  if [[ $result != 0 ]]; then
    xcrun simctl spawn "$DEVICE" log show --last 5m --style compact --predicate 'process == "紫微命盘" OR process == "ziwei-native" OR eventMessage CONTAINS "com.ziwei.chart"' > "$DIAGNOSTICS/system.log" 2>&1
    python3 - "$DIAGNOSTICS" <<'PY'
import pathlib, shutil, sys
output=pathlib.Path(sys.argv[1])
for source in (pathlib.Path.home()/'Library/Logs/DiagnosticReports').glob('*'):
    if source.is_file() and any(name in source.name for name in ('ziwei', '紫微')):
        shutil.copy2(source, output/source.name)
PY
    for file in "$DIAGNOSTICS/stdout.log" "$DIAGNOSTICS/stderr.log"; do
      if [[ -f "$file" ]]; then tail -100 "$file"; fi
    done
  fi
  xcrun simctl terminate "$DEVICE" com.ziwei.chart >/dev/null 2>&1
  xcrun simctl shutdown "$DEVICE" >/dev/null 2>&1
  exit "$result"
}
trap finish EXIT
xcrun simctl boot "$DEVICE" || true
xcrun simctl bootstatus "$DEVICE" -b
APP=$(cat .runtime/ios-simulator-app.txt)
xcrun simctl install "$DEVICE" "$APP"
SIMCTL_CHILD_RUST_BACKTRACE=full SIMCTL_CHILD_RUST_LOG=info xcrun simctl launch --stdout="$DIAGNOSTICS/stdout.log" --stderr="$DIAGNOSTICS/stderr.log" "$DEVICE" com.ziwei.chart > "$DIAGNOSTICS/launch.log"
cat "$DIAGNOSTICS/launch.log"
APP_PID=$(awk '/com\.ziwei\.chart:/ {print $NF}' "$DIAGNOSTICS/launch.log")
[[ "$APP_PID" =~ ^[0-9]+$ ]]
sleep 5
xcrun simctl io "$DEVICE" screenshot dist/artifacts/ios-simulator-launch.png
ps -p "$APP_PID" -o pid=,args= > "$DIAGNOSTICS/process.log"
kill -0 "$APP_PID"
xcrun simctl terminate "$DEVICE" com.ziwei.chart
