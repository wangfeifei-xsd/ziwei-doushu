import {readFileSync} from 'node:fs';
const json=file=>JSON.parse(readFileSync(file,'utf8'));
const version=json('package.json').version;
for(const file of ['apps/web/package.json','apps/native/package.json','apps/native/src-tauri/tauri.conf.json'])if(json(file).version!==version)throw new Error(`${file} 版本不一致。`);
const cargo=readFileSync('apps/native/src-tauri/Cargo.toml','utf8').match(/^version = "([^"]+)"/m)?.[1];if(cargo!==version)throw new Error('Cargo.toml 版本不一致。');
const ref=process.env.GITHUB_REF||'';if(ref.startsWith('refs/tags/v')&&ref.slice('refs/tags/v'.length)!==version)throw new Error('版本标签必须与应用版本一致。');
if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('首版构建使用 x.y.z 版本。');
console.log(`✓ 应用版本 ${version}；Android 使用 semver 派生 versionCode，iOS 使用相同版本号。`);
