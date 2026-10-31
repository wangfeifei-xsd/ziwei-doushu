import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { syncNativeIcons } from '../sync-native-icons.mjs';

const project = await mkdtemp(path.join(tmpdir(), 'ziwei-icons-'));
try {
  const main = path.join(project, 'app/src/main');
  await mkdir(path.join(main, 'res/mipmap-anydpi-v33'), { recursive: true });
  await mkdir(path.join(main, 'res/values'), { recursive: true });
  await writeFile(path.join(main, 'res/mipmap-anydpi-v33/ic_launcher.xml'), '<stale-template/>');
  await writeFile(path.join(main, 'res/values/strings.xml'), '<resources/>');
  const manifest = path.join(main, 'AndroidManifest.xml');
  await writeFile(manifest, '<manifest><application android:icon="@mipmap/old" android:roundIcon="@mipmap/old_round"><activity android:exported="true"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity></application></manifest>');
  await syncNativeIcons('android', project);
  await assert.rejects(stat(path.join(main, 'res/mipmap-anydpi-v33/ic_launcher.xml')), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(main, 'res/values/strings.xml'), 'utf8'), '<resources/>');
  assert.deepEqual(await readFile(path.join(main, 'res/mipmap-xxxhdpi/ic_launcher.png')), await readFile('apps/native/src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher.png'));
  const adaptive = await readFile(path.join(main, 'res/mipmap-anydpi-v26/ic_launcher.xml'), 'utf8');
  assert.match(adaptive, /ic_launcher_foreground/);
  assert.match(adaptive, /ic_launcher_monochrome/);
  assert.equal(await readFile(path.join(main, 'res/mipmap-anydpi-v26/ic_launcher_round.xml'), 'utf8'), adaptive);
  const first = await readFile(manifest, 'utf8');
  assert.match(first, /android:icon="@mipmap\/ic_launcher"/);
  assert.match(first, /android:roundIcon="@mipmap\/ic_launcher_round"/);
  await syncNativeIcons('android', project);
  assert.equal(await readFile(manifest, 'utf8'), first);
  await writeFile(manifest, '<manifest><application/></manifest>');
  await assert.rejects(syncNativeIcons('android', project), /MAIN\/LAUNCHER/);
  console.log('✓ 原生图标回归：覆盖过期模板、保留业务资源、普通与自适应图标、幂等同步、拒绝缺失桌面入口。');
} finally { await rm(project, { recursive: true, force: true }); }
