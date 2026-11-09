import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Match the toolchain bundled with the locked @tauri-apps/cli version.
// Asset API downloads avoid a failing github.com/releases/download redirect.
const require = createRequire(import.meta.url);
if (require('@tauri-apps/cli/package.json').version !== '2.12.4') {
  throw new Error('Tauri CLI 已升级，请同步核对 Windows NSIS 工具版本与校验值。');
}
const assets = [
  {
    repository: 'tauri-apps/binary-releases', id: 623832696, name: 'nsis-3.13.zip',
    sha256: 'ba63dffc4410ee89193e1cb5a41989991bd77c61068da17e3156d136b7b0b3d8',
  },
  {
    repository: 'tauri-apps/nsis-tauri-utils', id: 345882097, name: 'nsis_tauri_utils.dll',
    sha256: '5ba143b5db4a87d32d6e7802e033330aae56cbceabe0d1e3ba41948385ad4709',
  },
];

async function download(asset) {
  for (let attempt = 1; ; attempt++) {
    let data;
    try {
      data = execFileSync('gh', [
        'api', `repos/${asset.repository}/releases/assets/${asset.id}`,
        '--header', 'Accept: application/octet-stream',
      ], { maxBuffer: 10 * 1024 * 1024, timeout: 90_000, stdio: ['ignore', 'pipe', 'inherit'] });
    } catch (error) {
      if (attempt === 3) throw error;
      console.warn(`${asset.name} 下载失败，10 秒后重试 (${attempt}/3)。`);
      await delay(10_000);
      continue;
    }
    if (createHash('sha256').update(data).digest('hex') !== asset.sha256) {
      throw new Error(`${asset.name} SHA-256 校验失败，未写入 Tauri 工具目录。`);
    }
    return data;
  }
}

const tools = process.argv[2] || (process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'tauri'));
if (!tools) throw new Error('缺少 LOCALAPPDATA；也可传入工具目录进行构建准备验证。');
const stage = await mkdtemp(path.join(tmpdir(), 'ziwei-nsis-'));
try {
  // Verify both downloads before changing Tauri's cache. Windows includes bsdtar,
  // which supports extracting ZIP archives without a separate unzip dependency.
  const archive = await download(assets[0]);
  const plugin = await download(assets[1]);
  const archivePath = path.join(stage, assets[0].name);
  await writeFile(archivePath, archive);
  execFileSync('tar', ['-xf', archivePath, '-C', stage], { stdio: 'inherit' });
  const pluginDirectory = path.join(stage, 'nsis-3.13/Plugins/x86-unicode/additional');
  await mkdir(pluginDirectory, { recursive: true });
  await writeFile(path.join(pluginDirectory, assets[1].name), plugin);
  await mkdir(tools, { recursive: true });
  await cp(path.join(stage, 'nsis-3.13'), path.join(tools, 'NSIS'), { recursive: true });
  console.log('✓ Windows NSIS 3.13 与 Tauri 插件已下载、校验并就绪。');
} finally {
  await rm(stage, { recursive: true, force: true });
}
