#!/usr/bin/env node
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile, rename, rm, realpath, stat, open } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { randomUUID } from 'node:crypto';

const entry = fileURLToPath(import.meta.url);
const root = await realpath(path.resolve(path.dirname(entry), '..'));
const runtime = path.join(root, '.runtime');
const states = path.join(runtime, 'services');
const logs = path.join(runtime, 'logs');
const windows = process.platform === 'win32';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const [action = 'status', requested = 'web', ...options] = process.argv.slice(2);
const targets = ['web', 'app-web'];
const stateFile = target => path.join(states, `${target}.json`);
async function readJSON(file) { try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { if(e.code==='ENOENT'||e instanceof SyntaxError)return null;throw e; } }
async function atomicJSON(file, value) { const temp = `${file}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temp, JSON.stringify(value, null, 2), {mode:0o600}); await rename(temp, file); }
function ps(pid) {
  if (!Number.isInteger(pid) || pid < 2) return null;
  try {
    if(windows) {
      const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" | Select-Object ProcessId,CommandLine,CreationDate | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true,timeout:10000}).trim();
      if(!output)return null;const item=JSON.parse(output);return {pid,birth:String(item.CreationDate),command:item.CommandLine||'',pgid:pid};
    }
    const output = execFileSync('ps', ['-p', String(pid), '-o', 'pgid=,lstart=,stat=,args='], {encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
    const match = output.match(/^(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+[\d:]+\s+\d+)\s+(\S+)\s+([\s\S]*)$/);
    if(!match||match[3].includes('Z'))return null;
    return {pid,pgid:Number(match[1]),birth:match[2].replace(/\s+/g,' '),command:match[4]};
  } catch { return null; }
}
function owned(meta) {
  if(!meta||meta.root!==root||!targets.includes(meta.target))return false;
  const current=ps(meta.pid);
  return Boolean(current&&current.birth===meta.birth&&current.command.includes(entry)&&current.command.includes(meta.instance)&&current.command.includes('supervise')&&(windows||current.pgid===meta.pid));
}
function groupAlive(pid) {
  if(windows)return Boolean(ps(pid));
  try { return execFileSync('ps',['-axo','pid=,pgid=,stat='],{encoding:'utf8'}).split('\n').some(line=>{const fields=line.trim().split(/\s+/);return Number(fields[1])===pid&&!fields[2]?.includes('Z');}); } catch { return false; }
}
async function portFree(port) {
  return new Promise(resolve=>{const server=net.createServer();server.once('error',()=>resolve(false));server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)));});
}
async function health(meta) {
  try {const response=await fetch(`http://127.0.0.1:${meta.port}${meta.target==='web'?'/api/health':'/__ziwei_health'}`,{signal:AbortSignal.timeout(2500)});const data=await response.json();return response.ok&&data.ok===true&&data.instance===meta.instance&&owned(meta);}catch{return false;}
}
async function lock(target, task) {
  await mkdir(states,{recursive:true});const file=path.join(states,`${target}.lock`);
  for(let attempt=0;attempt<3;attempt++){
    try {await mkdir(file);await atomicJSON(path.join(file,'owner.json'),{pid:process.pid,birth:ps(process.pid)?.birth});break;}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      const owner=await readJSON(path.join(file,'owner.json'));const current=owner&&ps(owner.pid);
      if((current&&current.birth===owner.birth)||(!owner&&Date.now()-(await stat(file)).mtimeMs<30000))throw new Error(`${target} 正在进行另一个启停操作，请稍后重试。`);
      await rm(file,{recursive:true,force:true});
      if(attempt===2)throw new Error('无法取得服务锁。');
    }
  }
  try{return await task();}finally{await rm(file,{recursive:true,force:true});}
}
async function legacy(stop) {
  const file=path.join(runtime,'dev.pid');let raw;try{raw=await readFile(file,'utf8');}catch(e){if(e.code==='ENOENT')return;throw e;}
  const pid=Number(raw.trim().split(/\s+/)[0]);const current=ps(pid);
  if(!current||!current.command.includes(path.join(root,'node_modules','next','dist','bin','next'))||!current.command.includes(' dev ')) {await rm(file,{force:true});return;}
  if(!stop)throw new Error('检测到旧版 start.sh 启动的实例，请先运行 scripts/stop.sh web。');
  if(!windows&&current.pgid!==pid)throw new Error('旧实例的进程组无法确认，请检查 .runtime/dev.pid；未关闭其他进程。');
  if(windows)execFileSync('taskkill',['/PID',String(pid),'/T'],{windowsHide:true});else process.kill(-pid,'SIGTERM');
  for(let i=0;i<60&&groupAlive(pid);i++)await pause(250);
  if(groupAlive(pid))throw new Error('旧实例尚未退出，已保留记录。');await rm(file,{force:true});
}
function show(meta,prefix='运行中') {
  console.log(`${prefix}：${meta.target} (${meta.mode}) http://localhost:${meta.port}\nPID：${meta.pid}\n日志：${meta.log}\n关闭：node "${entry}" stop ${meta.target}`);
}
async function stopTarget(target,force=false) {
  if(target==='web')await legacy(true);
  const meta=await readJSON(stateFile(target));
  if(!owned(meta)) {await rm(stateFile(target),{force:true});console.log(`${target} 未运行，已清理失效记录。`);return;}
  if(windows) {
    // Ask the supervisor to end stdin first, then taskkill only its verified tree if forced.
    await writeFile(path.join(states,`${target}.${meta.instance}.stop`),'stop');
  } else process.kill(-meta.pid,'SIGTERM');
  const deadline=Date.now()+20000;
  while(groupAlive(meta.pid)&&Date.now()<deadline)await pause(250);
  if(groupAlive(meta.pid)&&force) {
    if(!owned(meta))throw new Error('进程身份发生变化，已拒绝强制终止。');
    if(windows)execFileSync('taskkill',['/PID',String(meta.pid),'/T','/F'],{windowsHide:true});else process.kill(-meta.pid,'SIGKILL');
    for(let i=0;i<20&&groupAlive(meta.pid);i++)await pause(250);
  }
  if(groupAlive(meta.pid))throw new Error(`关闭超时，记录和日志已保留：${meta.log}。确认后可加 --force 重试。`);
  await rm(stateFile(target),{force:true});await rm(path.join(states,`${target}.${meta.instance}.stop`),{force:true});
  if(!await portFree(meta.port))throw new Error(`本项目进程已退出，但端口 ${meta.port} 仍被占用；未终止占用者。`);
  console.log(`${target} 已关闭，端口 ${meta.port} 已释放。`);
}
async function startTarget(target) {
  const port=Number(getOption('--port')||process.env.PORT||(target==='web'?3000:1420));
  const mode=getOption('--mode')||'development';
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT/--port 必须是 1–65535 之间的整数。');
  if(!['development','production'].includes(mode)||target==='app-web'&&mode==='production')throw new Error('支持 web development/production；app-web 为开发样式预览。');
  if(target==='web')await legacy(false);
  const old=await readJSON(stateFile(target));
  if(owned(old)){
    if(old.port!==port||old.mode!==mode)throw new Error(`已有 ${old.mode} 实例使用端口 ${old.port}；请先停止 ${target}。`);
    if(!await health(old))throw new Error(`已有实例尚未就绪，请检查：${old.log}`);
    show(old,'已在运行');return;
  }
  await rm(stateFile(target),{force:true});
  if(!await portFree(port))throw new Error(`端口 ${port} 已被占用；使用 --port 指定其他端口。`);
  const major=Number(process.versions.node.split('.')[0]);const minor=Number(process.versions.node.split('.')[1]);
  if(major<22||major===22&&minor<12)throw new Error('需要 Node.js 22.12+，推荐 .node-version 中的版本。');
  const cwd=path.join(root,'apps',target==='web'?'web':'native');const require=createRequire(path.join(cwd,'package.json'));
  let cli;
  try {cli=target==='web'?require.resolve('next/dist/bin/next'):path.join(path.dirname(require.resolve('vite/package.json')),'bin/vite.js');}
  catch {throw new Error(`缺少依赖，请在 ${root} 执行 npm ci。`);}
  if(target==='web')execFileSync(process.execPath,[path.join(root,'scripts/check-h2.mjs')],{cwd:root,stdio:'inherit'});
  if(target==='web'&&mode==='production')try{await stat(path.join(cwd,'.next/BUILD_ID'));await stat(path.join(root,'dist/web/start.cjs'));}catch{throw new Error('缺少生产构建，请先运行 npm run build:web。');}
  if(target==='web'&&mode==='production')cli=path.join(root,'scripts/run-web.mjs');
  execFileSync(process.execPath,[path.join(root,'scripts/sync-assets.mjs')],{cwd:root,stdio:'ignore'});
  await mkdir(logs,{recursive:true});const log=path.join(logs,`${target}.log`);const handle=await open(log,'a',0o600);
  const instance=randomUUID();const meta={root,target,mode,port,log,instance,cli,cwd,createdAt:new Date().toISOString()};
  // Private launch description is consumed by the supervisor, keeping config and secrets off argv.
  const launch=path.join(states,`${target}.${instance}.launch.json`);await atomicJSON(launch,meta);
  const child=spawn(process.execPath,[entry,'supervise',target,instance],{cwd:root,env:process.env,detached:true,stdio:['ignore',handle.fd,handle.fd],windowsHide:true});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();await handle.close();
  let current;const deadline=Date.now()+Number(process.env.ZIWEI_START_TIMEOUT_MS||90000);
  while(Date.now()<deadline){
    current=await readJSON(stateFile(target));
    if(current?.instance===instance&&owned(current)&&await health(current)){show(current,'启动成功');return;}
    if(current?.instance===instance&&current.failed)break;
    if(!ps(child.pid))break;await pause(350);
  }
  if(current?.instance===instance&&owned(current))await stopTarget(target,false);
  throw new Error(`启动失败或超时。诊断：${log}（请勿公开包含个人配置的日志）。`);
}
function getOption(flag){const at=options.indexOf(flag);if(at<0)return '';if(!options[at+1]||options[at+1].startsWith('--'))throw new Error(`${flag} 缺少值。`);return options[at+1];}
async function supervise(target,instance) {
  const launch=path.join(states,`${target}.${instance}.launch.json`);const meta=await readJSON(launch);await rm(launch,{force:true});
  if(!meta||meta.root!==root||meta.instance!==instance)throw new Error('服务启动描述无效。');
  const args=target==='web'?(meta.mode==='production'?[]:['dev','--webpack','--hostname','127.0.0.1','--port',String(meta.port)]):['--host','127.0.0.1','--port',String(meta.port),'--strictPort'];
  const marker=path.join(states,`${target}.${instance}.stop`);
  const childEnv={...process.env,ZIWEI_SERVICE_ID:instance,PORT:String(meta.port),HOSTNAME:'127.0.0.1'};
  if(windows){childEnv.ZIWEI_MANAGED_STOP_FILE=marker;const hook=path.join(root,'scripts/service-signal.cjs').replaceAll('\\','/');childEnv.NODE_OPTIONS=`${process.env.NODE_OPTIONS||''} --require "${hook}"`;}
  const child=spawn(process.execPath,[meta.cli,...args],{cwd:meta.cwd,env:childEnv,stdio:['pipe','inherit','inherit'],windowsHide:true});
  let stopping=false;let exited=false;let initialized=false;let watch;
  // Install listeners before the first await: a failed preload/CLI can exit immediately.
  child.once('error',()=>{exited=true;meta.failed=true;if(initialized)void atomicJSON(stateFile(target),meta).then(()=>shutdown());});
  child.once('exit',()=>{exited=true;if(initialized)void shutdown();});
  const identity=ps(process.pid);Object.assign(meta,{pid:process.pid,birth:identity?.birth,pgid:identity?.pgid,childPid:child.pid});await atomicJSON(stateFile(target),meta);
  async function shutdown(){
    if(stopping)return;stopping=true;
    // Closing stdin lets H2 bridges flush when the Next worker exits. The POSIX group signal also reaches workers.
    child.stdin.end();if(!windows)try{child.kill('SIGTERM');}catch{}
    if(!windows)try{process.kill(-process.pid,'SIGTERM');}catch{}
    for(let i=0;i<70;i++){if(windows?exited:!otherGroupMembers())break;await pause(200);}
    if(windows&&!exited){console.error('等待服务子进程退出。');return;}
    if(!windows&&otherGroupMembers()){console.error('仍有子进程未退出，保留 supervisor 供 --force 诊断。');return;}
    clearInterval(watch);await rm(marker,{force:true});process.exit(exited?0:1);
  }
  function otherGroupMembers(){try{return execFileSync('ps',['-axo','pid=,pgid=,stat=,comm='],{encoding:'utf8'}).split('\n').some(line=>{const f=line.trim().split(/\s+/);return Number(f[1])===process.pid&&Number(f[0])!==process.pid&&!f[2]?.includes('Z')&&!f[3]?.endsWith('/ps')&&f[3]!=='ps';});}catch{return false;}}
  process.on('SIGTERM',()=>void shutdown());process.on('SIGINT',()=>void shutdown());
  watch=setInterval(()=>{void stat(marker).then(()=>shutdown(),()=>{});},300);
  initialized=true;if(exited)void shutdown();
}
try {
  if(action==='supervise'){await supervise(requested,options[0]);}
  else {
    const all=requested==='--all'||options.includes('--all');
    if(!['start','stop','status'].includes(action)||(!all&&!targets.includes(requested))||all&&action==='start')throw new Error('用法：node scripts/service.mjs start|stop|status [web|app-web] [--mode development|production] [--port N] [--all] [--force]');
    for(const target of all?targets:[requested])await lock(target,async()=>{
      if(action==='start')await startTarget(target);
      if(action==='stop')await stopTarget(target,options.includes('--force'));
      if(action==='status'){const meta=await readJSON(stateFile(target));if(owned(meta))show(meta,await health(meta)?'运行中':'进程存在，服务未就绪');else console.log(`${target} 未运行。`);}
    });
  }
} catch(error){console.error(error.message);process.exitCode=1;}
