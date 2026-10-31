// Loaded only by the local Windows service manager. Next workers inherit it.
// Windows child.kill('SIGTERM') terminates immediately, so drain resources in
// every worker before the supervisor lets framework signal handlers run.
const fs = require('node:fs');
const path = require('node:path');
const marker = process.env.ZIWEI_MANAGED_STOP_FILE;
if (marker && process.platform === 'win32') {
  const workers = `${marker}.workers`;
  fs.mkdirSync(workers, { recursive: true });
  const registration = path.join(workers, `${process.pid}.json`);
  const ready = path.join(workers, `${process.pid}.ready`);
  fs.writeFileSync(registration, JSON.stringify({ pid: process.pid }));
  process.once('exit', () => {
    try { fs.rmSync(registration, { force: true }); fs.rmSync(ready, { force: true }); } catch {}
  });
  let draining = false;
  let drained = false;
  const timer = setInterval(async () => {
    let phase;
    try { phase = fs.readFileSync(marker, 'utf8'); } catch { return; }
    if (!draining) {
      draining = true;
      process.env.ZIWEI_SERVICE_DRAINING = '1';
      try {
        const tasks = [];
        process.emit('ziwei-managed-drain', task => tasks.push(Promise.resolve(task)));
        await Promise.all(tasks);
        fs.writeFileSync(ready, 'ready');
        drained = true;
      } catch { console.error('等待本地服务资源关闭，进程记录已保留。'); }
    }
    if (phase !== 'stop' || !drained) return;
    clearInterval(timer);
    if (process.listenerCount('SIGTERM')) process.emit('SIGTERM', 'SIGTERM');
    else process.exit(0);
  }, 100);
  timer.unref();
}
