import {readFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=process.argv[2]?path.resolve(process.argv[2]):fileURLToPath(new URL('../assets/datasets/ziwei-v4.0-13d/',import.meta.url));
const manifest=JSON.parse(await readFile(path.join(root,'MANIFEST.json'),'utf8'));
const sums=await readFile(path.join(root,'SHA256SUMS.txt'),'utf8');
if(manifest.files.length!==77||manifest.totalCharts!==674976)throw new Error('资料清单不完整。');
let total=0;
for(const entry of manifest.files){const name=`year-${entry.year}.jsonl.zst`;const data=await readFile(path.join(root,name));const hash=createHash('sha256').update(data).digest('hex');
 if(data.length!==entry.zstBytes||hash!==entry.sha256||!sums.split('\n').some(line=>line.startsWith(hash)&&line.endsWith(name)))throw new Error(`资料校验失败：${name}`);total+=data.length;
}
if(total!==manifest.zstBytes)throw new Error('资料总大小不一致。');
for(const entry of await readdir(root)){if(entry.endsWith('.jsonl'))throw new Error('分发目录不应混入原始文本。');if((await stat(path.join(root,entry))).size>100*1024*1024)throw new Error('Git 分发目录出现超过 100 MiB 的文件。');}
console.log(`✓ 77 个年份文件全部通过官方 SHA-256 / 字节数校验；${total} 字节压缩资料。`);
