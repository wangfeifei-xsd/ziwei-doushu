import assert from 'node:assert/strict';
import {mkdtemp,cp,mkdir,symlink,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const temp=await mkdtemp(path.join(tmpdir(),'紫微 启停回归-'));
const fixture=path.join(temp,'含中文 空格项目');await mkdir(fixture);
for(const name of ['scripts','packages','assets'])await cp(path.join(root,name),path.join(fixture,name),{recursive:true});
for(const app of ['web','native'])await cp(path.join(root,'apps',app),path.join(fixture,'apps',app),{recursive:true,filter:file=>!['node_modules','.next','public','dist','src-tauri'].includes(path.basename(file))});
for(const name of ['package.json','tsconfig.base.json','types'])await cp(path.join(root,name),path.join(fixture,name),{recursive:true});
await symlink(path.join(root,'node_modules'),path.join(fixture,'node_modules'),process.platform==='win32'?'junction':'dir');
const script=path.join(fixture,'scripts/service.mjs');
const env={...process.env,H2_DATA_DIR:path.join(temp,'private-db'),AI_CONFIG_DIR:path.join(temp,'private-model'),OPENAI_API_KEY:'',OPENAI_BASE_URL:'',OPENAI_MODEL:'',ZIWEI_START_TIMEOUT_MS:'120000',NEXT_TELEMETRY_DISABLED:'1'};
function run(args,success=true){console.log('Lifecycle:',args.join(' '));return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script,...args],{cwd:temp,env,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);child.once('error',reject);child.once('exit',code=>{try{if(success)assert.equal(code,0,output);else assert.notEqual(code,0,output);resolve(output);}catch(error){reject(error);}});});}
async function port(){return new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(()=>resolve(value));});});}
async function free(value){return new Promise(resolve=>{const server=net.createServer();server.once('error',()=>resolve(false));server.listen(value,'127.0.0.1',()=>server.close(()=>resolve(true)));});}
const webPort=await port(),vitePort=await port();
let external;
try{
 assert.match(await run(['stop','--all']),/未运行/);
 await mkdir(path.join(fixture,'.runtime/services'),{recursive:true});
 await writeFile(path.join(fixture,'.runtime/services/web.json'),JSON.stringify({root:fixture,target:'web',pid:process.pid,birth:'stale-birth',instance:'not-owned'}));
 assert.match(await run(['stop','web']),/失效/);assert.ok(process.pid>1);
 assert.match(await run(['start','web','--mode','production','--port',String(webPort)],false),/build:web/);
 external=net.createServer(socket=>{socket.end('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"ok":true}');});await new Promise(resolve=>external.listen(vitePort,'127.0.0.1',resolve));
 assert.match(await run(['start','app-web','--port',String(vitePort)],false),/占用/);assert.ok(external.listening);await new Promise(resolve=>external.close(resolve));external=null;
 assert.match(await run(['start','app-web','--port',String(vitePort)]),/启动成功/);
 assert.match(await run(['start','app-web','--port',String(vitePort)]),/已在运行/);
 assert.match(await run(['start','app-web','--port',String(webPort)],false),/请先停止/);
 assert.match(await run(['start','web','--port',String(webPort)]),/启动成功/);
 const health=await(await fetch(`http://127.0.0.1:${webPort}/api/health`)).json();assert.equal(health.ok,true);
 const form={name:'启停测试',year:'2000',month:'1',day:'31',clockHour:'23',clockMinute:'30',unknownTime:false,province:'',city:'',longitude:120,gender:'female'};
 const saved=await(await fetch(`http://127.0.0.1:${webPort}/api/profiles`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)})).json();assert.equal(saved.profile.form.clockHour,'23');
 assert.match(await run(['status','--all']),/运行中/);assert.match(await run(['stop','web']),/已释放/);assert.equal(await free(webPort),true);assert.equal(await free(vitePort),false);
 assert.match(await run(['start','web','--port',String(webPort)]),/启动成功/);const restored=await(await fetch(`http://127.0.0.1:${webPort}/api/profiles`)).json();assert.equal(restored.profiles.length,1);
 assert.match(await run(['stop','--all']),/已关闭/);assert.ok(await free(webPort));assert.ok(await free(vitePort));await run(['stop','--all']);
 const snapshot=path.join(temp,'导出 备份.json');execFileSync(process.execPath,['--import','tsx',path.join(fixture,'scripts/export-h2-profiles.ts'),'--data-dir',env.H2_DATA_DIR,'--out',snapshot],{cwd:fixture,env,stdio:'pipe'});const data=JSON.parse(await readFile(snapshot,'utf8'));assert.equal(data.profiles.length,1);assert.equal(data.profiles[0].id,saved.profile.id);
 if(process.platform==='win32'){
  const started=execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(fixture,'scripts/start.ps1'),'app-web','--port',String(vitePort)],{cwd:temp,env,encoding:'utf8'});assert.match(started,/启动成功/);
  execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(fixture,'scripts/stop.ps1'),'app-web'],{cwd:temp,env,stdio:'pipe'});assert.ok(await free(vitePort));
 }else{
  execFileSync(path.join(fixture,'scripts/start.sh'),['app-web','--port',String(vitePort)],{cwd:temp,env,stdio:'pipe'});execFileSync(path.join(fixture,'scripts/stop.sh'),['app-web'],{cwd:temp,env,stdio:'pipe'});assert.ok(await free(vitePort));
 }
 console.log('✓ 服务启停回归：真实 Web/H2 与 Vite，并行隔离、重启存档、中文空格路径、不同 cwd、外部占用、陈旧 PID、幂等和平台包装入口。');
}catch(error){console.error(error);console.error(`回归诊断目录：${temp}`);await cp(path.join(fixture,'.runtime'),path.join(root,'.runtime/lifecycle-last-failure'),{recursive:true}).catch(()=>{});throw error;}
finally{if(external)external.close();await run(['stop','--all']).catch(error=>console.error('Cleanup stop:',error.message));await rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:500}).catch(error=>console.error('Cleanup directory:',error.message));}
