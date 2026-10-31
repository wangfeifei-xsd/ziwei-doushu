#!/usr/bin/env bash
set -euo pipefail
DEVICE=$(xcrun simctl list devices available -j | python3 -c 'import json,sys; d=json.load(sys.stdin); print(next(v["udid"] for devices in d["devices"].values() for v in devices if "iPhone" in v["name"]))')
xcrun simctl boot "$DEVICE" || true
xcrun simctl bootstatus "$DEVICE" -b
APP=$(cat .runtime/ios-simulator-app.txt)
xcrun simctl install "$DEVICE" "$APP"
xcrun simctl launch "$DEVICE" com.ziwei.chart
sleep 5
xcrun simctl io "$DEVICE" screenshot dist/artifacts/ios-simulator-launch.png
xcrun simctl terminate "$DEVICE" com.ziwei.chart
xcrun simctl shutdown "$DEVICE"
