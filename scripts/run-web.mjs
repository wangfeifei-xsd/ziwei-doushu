import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'apps/web/package.json'));
require('@next/env').loadEnvConfig(root,false);
const server=path.join(root,'dist/web/start.cjs');
try {await access(server);}catch{console.error('缺少 Web 独立构建，请先运行 npm run build:web。');process.exit(1);}
const data=path.resolve(root,process.env.H2_DATA_DIR||'data');
const child=spawn(process.execPath,[server],{cwd:root,env:{...process.env,H2_DATA_DIR:data,AI_CONFIG_DIR:path.resolve(root,process.env.AI_CONFIG_DIR||data)},stdio:'inherit'});
child.once('error',error=>{console.error(error.message);process.exitCode=1;});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
child.once('exit',(code,signal)=>{process.exitCode=signal?0:code??1;});
