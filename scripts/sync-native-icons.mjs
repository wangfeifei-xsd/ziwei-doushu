import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const tauri = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps/native/src-tauri');

export async function syncNativeIcons(platform, project = path.join(tauri, 'gen', platform === 'ios' ? 'apple' : 'android')) {
  if (platform === 'android') {
    const resources = path.join(project, 'app/src/main/res');
    await mkdir(resources, { recursive: true });
    // Remove only launcher resources; a stale higher-API template can override
    // the generated PNGs even when the regular density folders look correct.
    for (const entry of await readdir(resources, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('mipmap')) continue;
      for (const name of await readdir(path.join(resources, entry.name))) {
        if (/^ic_launcher(?:_|\.)/.test(name)) await rm(path.join(resources, entry.name, name));
      }
    }
    for (const name of await readdir(path.join(tauri, 'icons/android'))) {
      if (name === 'values') {
        await mkdir(path.join(resources, name), { recursive: true });
        await cp(path.join(tauri, 'icons/android/values/ic_launcher_background.xml'), path.join(resources, name, 'ic_launcher_background.xml'));
      } else {
        await cp(path.join(tauri, 'icons/android', name), path.join(resources, name), { recursive: true });
      }
    }
    // Round launcher entries must also use the adaptive icon on Android 8+.
    await cp(path.join(resources, 'mipmap-anydpi-v26/ic_launcher.xml'), path.join(resources, 'mipmap-anydpi-v26/ic_launcher_round.xml'));
    const manifest = path.join(project, 'app/src/main/AndroidManifest.xml');
    let xml = await readFile(manifest, 'utf8');
    if (!/<application\b/.test(xml) || !xml.includes('android.intent.action.MAIN') || !xml.includes('android.intent.category.LAUNCHER')) {
      throw new Error('Android 模板缺少 application 或 MAIN/LAUNCHER 桌面启动入口。');
    }
    xml = xml.replace(/<application\b([^>]*)>/, (_, attributes) => {
      attributes = attributes.replace(/\s+android:(?:icon|roundIcon)="[^"]*"/g, '').trimEnd();
      return `<application${attributes}\n        android:icon="@mipmap/ic_launcher"\n        android:roundIcon="@mipmap/ic_launcher_round">`;
    });
    await writeFile(manifest, xml);
  } else if (platform === 'ios') {
    const output = path.join(project, 'Assets.xcassets/AppIcon.appiconset');
    await mkdir(output, { recursive: true });
    await cp(path.join(tauri, 'icons/ios'), output, { recursive: true });
    const contents = JSON.parse(await readFile(path.join(output, 'Contents.json'), 'utf8'));
    for (const image of contents.images) if (image.filename) await stat(path.join(output, image.filename));
  } else throw new Error('指定 android 或 ios。');
  console.log(`✓ ${platform} 原生工程已同步正式图标资源。`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const platforms = process.argv[2] === '--if-present' ? ['android', 'ios'] : [process.argv[2]];
  for (const platform of platforms) {
    const project = path.join(tauri, 'gen', platform === 'ios' ? 'apple' : 'android');
    if (process.argv[2] === '--if-present') {
      try { await stat(project); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    }
    await syncNativeIcons(platform, project);
  }
}
