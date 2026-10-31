import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const image = path.resolve(process.argv[2]);
const mount = await mkdtemp(path.join(tmpdir(), 'ziwei-dmg-'));
let attached = false;
try {
  execFileSync('hdiutil', ['verify', image], { stdio: 'inherit' });
  execFileSync('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, image], { stdio: 'inherit' });
  attached = true;
  const apps = (await readdir(mount)).filter(name => name.endsWith('.app'));
  if (apps.length !== 1) throw new Error('DMG 必须包含唯一的应用。');
  const app = path.join(mount, apps[0]);
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' });
  const identifier = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', path.join(app, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();
  if (identifier !== 'com.ziwei.chart') throw new Error('DMG 中的应用标识不匹配。');
  if (process.env.SIGN_BUILD === 'true') {
    execFileSync('xcrun', ['stapler', 'validate', app], { stdio: 'inherit' });
    execFileSync('spctl', ['--assess', '--type', 'execute', '--verbose=2', app], { stdio: 'inherit' });
  }
  console.log('✓ DMG 中的实际 .app 资源签名与标识校验通过。');
} finally {
  if (attached) execFileSync('hdiutil', ['detach', mount], { stdio: 'inherit' });
  await rm(mount, { recursive: true, force: true });
}
