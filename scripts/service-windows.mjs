// File-backed output keeps the background supervisor independent of the
// PowerShell caller's redirected pipes. Service ownership stays in service.mjs.
import { spawn } from 'node:child_process';
import { openSync, closeSync, writeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const [outputDirectory, ...args] = process.argv.slice(2);
if (!outputDirectory) throw new Error('Missing service output directory.');
const stdout = openSync(path.join(outputDirectory, 'stdout.log'), 'w', 0o600);
const stderr = openSync(path.join(outputDirectory, 'stderr.log'), 'w', 0o600);
const manager = spawn(process.execPath, [fileURLToPath(new URL('./service.mjs', import.meta.url)), ...args], {
  stdio: ['ignore', stdout, stderr],
  windowsHide: true,
});
manager.once('error', error => {
  writeSync(stderr, `${error.message}\n`);
  process.exitCode = 1;
});
manager.once('close', code => {
  closeSync(stdout);
  closeSync(stderr);
  process.exitCode = code ?? 1;
});
