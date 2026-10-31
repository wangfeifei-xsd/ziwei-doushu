// Loaded only by the local Windows service manager. Next CLI workers inherit this hook.
const fs = require('node:fs');
const marker = process.env.ZIWEI_MANAGED_STOP_FILE;
if (marker && process.platform === 'win32') {
  const timer = setInterval(() => {
    if (!fs.existsSync(marker)) return;
    clearInterval(timer);
    if (process.listenerCount('SIGTERM')) process.emit('SIGTERM', 'SIGTERM');
    else process.exit(0);
  }, 200);
  timer.unref();
}
