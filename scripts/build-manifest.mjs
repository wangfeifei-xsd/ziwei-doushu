import {readdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const directory=path.resolve(process.argv[2]||'dist/artifacts');
const artifacts=[];
for(const name of (await readdir(directory)).sort()){
 if(['build-manifest.json','SHA256SUMS'].includes(name))continue;
 const file=path.join(directory,name);if(!(await stat(file)).isFile())throw new Error('请先将目录打成 tar/zip，以保留权限和符号链接。');
 artifacts.push({name,bytes:(await stat(file)).size,sha256:createHash('sha256').update(await readFile(file)).digest('hex')});
}
if(!artifacts.length)throw new Error('未生成构建产物。');
const manifest={version:JSON.parse(await readFile('package.json','utf8')).version,commit:process.env.GITHUB_SHA||'local-working-tree',runId:process.env.GITHUB_RUN_ID||null,platform:process.env.BUILD_PLATFORM||process.platform,architecture:process.env.BUILD_ARCH||process.arch,signing:process.env.BUILD_SIGNING||'unsigned',command:process.env.BUILD_COMMAND||'local build',validation:process.env.BUILD_VALIDATION||'See migration report; no installation claim',artifacts};
await writeFile(path.join(directory,'build-manifest.json'),JSON.stringify(manifest,null,2)+'\n');await writeFile(path.join(directory,'SHA256SUMS'),artifacts.map(item=>`${item.sha256}  ${item.name}`).join('\n')+'\n');
if(process.env.GITHUB_STEP_SUMMARY){const{appendFile}=await import('node:fs/promises');await appendFile(process.env.GITHUB_STEP_SUMMARY,`### ${manifest.platform} / ${manifest.architecture}\n\n版本 ${manifest.version} · ${manifest.signing}\n\n`+artifacts.map(item=>`- ${item.name} (${item.bytes} bytes)`).join('\n')+`\n\n[本次 Actions 产物](https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}#artifacts)\n`);}
console.log(`已记录 ${artifacts.length} 份产物及 SHA-256。`);
