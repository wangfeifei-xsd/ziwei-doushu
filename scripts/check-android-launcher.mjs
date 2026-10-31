import { execFileSync } from 'node:child_process';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('apps/native/src-tauri/gen/android/app/build/outputs');
async function apks(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await apks(file));
    else if (entry.name.endsWith('.apk')) files.push(file);
  }
  return files;
}
const files = process.argv[2] ? [path.resolve(process.argv[2])] : await apks(root);
if (!files.length) throw new Error('没有 APK 可校验。');
const aapt = process.env.AAPT2 || path.join(process.env.ANDROID_HOME, 'build-tools', process.env.ANDROID_BUILD_TOOLS_VERSION || '36.0.0', process.platform === 'win32' ? 'aapt2.exe' : 'aapt2');
const reports = [];
for (const file of files) {
  const badging = execFileSync(aapt, ['dump', 'badging', file], { encoding: 'utf8' });
  const manifest = execFileSync(aapt, ['dump', 'xmltree', file, '--file', 'AndroidManifest.xml'], { encoding: 'utf8' });
  if (!/^package: name='com\.ziwei\.chart'/m.test(badging) || !/^application-label(?:-zh[^:]*)?:'紫微命盘'/m.test(badging)) throw new Error('APK 应用标识或桌面名称无效。');
  if (!/^launchable-activity:.*name='[^']+'/.test(badging.split('\n').find(line => line.startsWith('launchable-activity:')) || '') || !manifest.includes('android.intent.category.LAUNCHER')) throw new Error('APK 没有可用的桌面启动 Activity。');
  const icons = [...badging.matchAll(/^application-icon-\d+:'([^']+)'/gm)].map(match => match[1]);
  if (!icons.length || icons.some(icon => !/^res\/.*ic_launcher/.test(icon))) throw new Error('APK 桌面图标资源缺失或未使用正式图标。');
  const resources = execFileSync(aapt, ['dump', 'resources', file], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  for (const name of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground', 'ic_launcher_monochrome']) {
    if (!resources.includes(`mipmap/${name}`)) throw new Error(`APK 缺少 ${name} 图标。`);
  }
  reports.push(`APK: ${path.basename(file)}\n${badging.split('\n').filter(line => /^(package:|application-label|application-icon|launchable-activity:)/.test(line)).join('\n')}`);
}
await mkdir('.runtime', { recursive: true });
await writeFile('.runtime/android-launcher-check.txt', reports.join('\n\n') + '\n');
console.log('✓ APK 桌面启动入口、名称、普通/圆形/自适应/主题图标校验通过。');
