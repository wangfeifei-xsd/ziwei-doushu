import assert from 'node:assert/strict';import{mkdtemp,cp,rm}from'node:fs/promises';import{tmpdir}from'node:os';import path from'node:path';import{spawn}from'node:child_process';import net from'node:net';
const temp=await mkdtemp(path.join(tmpdir(),'紫微 standalone-'));const app=path.join(temp,'独立 包');await cp(path.resolve('dist/web'),app,{recursive:true});
const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(()=>resolve(value));});});
const instance='standalone-smoke';const child=spawn(process.execPath,[path.join(app,'start.cjs')],{cwd:temp,env:{...process.env,PORT:String(port),HOSTNAME:'127.0.0.1',H2_DATA_DIR:path.join(temp,'私人数据库'),AI_CONFIG_DIR:path.join(temp,'私人配置'),OPENAI_API_KEY:'',OPENAI_BASE_URL:'',OPENAI_MODEL:'',ZIWEI_SERVICE_ID:instance},detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
let log='';child.stdout.on('data',value=>log+=value);child.stderr.on('data',value=>log+=value);
try{
 let ready=false;for(let i=0;i<90;i++){try{const data=await(await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(1500)})).json();if(data.ok&&data.instance===instance){ready=true;break;}}catch{}if(child.exitCode!==null)break;await new Promise(resolve=>setTimeout(resolve,500));}assert.ok(ready,'独立包没有就绪：'+log.slice(-1200));
 for(const route of ['/','/library','/library/quanshu','/images/landscape-dark.webp','/images/landscape-light.webp']){const response=await fetch(`http://127.0.0.1:${port}${route}`);assert.equal(response.status,200,route);}
 const form={name:'独立包验证',year:'2000',month:'1',day:'31',clockHour:'23',clockMinute:'30',unknownTime:false,province:'',city:'',longitude:120,gender:'female'};
 const saved=await(await fetch(`http://127.0.0.1:${port}/api/profiles`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)})).json();assert.equal(saved.profile.form.day,'31');assert.equal((await(await fetch(`http://127.0.0.1:${port}/api/profiles`)).json()).profiles.length,1);
 assert.equal((await fetch(`http://127.0.0.1:${port}/api/profiles/${saved.profile.id}`,{method:'DELETE'})).status,204);
 console.log('✓ Web standalone 独立目录启动、静态资源、古籍及 H2 CRUD 冒烟通过。');
}finally{
 if(process.platform==='win32')child.kill();else try{process.kill(-child.pid,'SIGTERM');}catch{}
 await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,10000).unref();});await rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:500});
}
