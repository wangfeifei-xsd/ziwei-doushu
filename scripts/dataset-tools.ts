import {mkdir,readFile,readdir,writeFile,open} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {zstdCompressSync,zstdDecompressSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {once} from 'node:events';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readRecord,scanYear} from '../server/dataset/reader.mjs';
import {generateChart} from '@ziwei/domain/ziwei/algorithm';
import {LEARNING_CASES} from '@ziwei/domain/ziwei/learning-cases';
import {DATASET_TOPICS,DATASET_VERSION,DATASET_SOURCE,datasetKey,datasetBirth,recordBirth,datasetParagraphs,datasetReferences,chartFeatures} from '@ziwei/domain/ziwei/dataset';
import type {TopicKey} from '@ziwei/domain/ziwei/db-analysis';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);const command=args[0];
function option(name:string,fallback:string){const i=args.indexOf(`--${name}`);if(i<0)return fallback;if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(`--${name} 缺少参数`);return args[i+1];}
const from=Number(option('from',option('year','1990'))),to=Number(option('to',String(from))),limit=Number(option('limit','100000000'));
if(!Number.isInteger(from)||!Number.isInteger(to)||from<1950||to>2026||from>to||!Number.isSafeInteger(limit)||limit<1)throw new Error('年份或记录上限无效。');
const hash=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex');
async function engineFingerprint(dir:string):Promise<string>{const h=createHash('sha256');for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){h.update(e.name);h.update(e.isDirectory()?await engineFingerprint(path.join(dir,e.name)):await readFile(path.join(dir,e.name)));}return h.digest('hex');}
async function main(){
 if(!['index','dedupe','pack','training','evaluate','search','lookup'].includes(command)){console.log('用法：npm run dataset:tools -- index|dedupe|pack|training|evaluate [--year 1990 | --from 1950 --to 2026] [--limit 200]\n派生库搜索：search --db <SQLite 文件> --query <词>\n随机读取验证：lookup --pack <pack 目录> --key <出生键>');return;}
 if(command==='search'){
  const db=new DatabaseSync(path.resolve(option('db','')),{readOnly:true});try{const q=option('query','').trim();if(!q||q.length>80)throw new Error('搜索词长度需为 1–80。');const rows=q.length>=3?db.prepare('SELECT id,text FROM search WHERE search MATCH ? LIMIT 20').all('"'+q.replaceAll('"','""')+'"'):db.prepare('SELECT id,text FROM paragraphs WHERE instr(text,?)>0 LIMIT 20').all(q);for(const row of rows){console.log(JSON.stringify({...row,references:db.prepare('SELECT birth,topic,ordinal FROM refs WHERE paragraph=? LIMIT 5').all(row.id as string)}));}}finally{db.close();}return;
 }
 if(command==='lookup'){
  const dir=path.resolve(option('pack',''));const key=option('key','');datasetBirth(key);const db=new DatabaseSync(path.join(dir,'offsets.sqlite'),{readOnly:true});try{const row=db.prepare('SELECT offset,length,sha256 FROM records WHERE birth=?').get(key);if(!row)throw new Error('索引没有这个出生键。');const fd=await open(path.join(dir,'records.zst'),'r');try{const buffer=Buffer.alloc(Number(row.length));const {bytesRead}=await fd.read(buffer,0,buffer.length,Number(row.offset));if(bytesRead!==buffer.length||hash(buffer)!==row.sha256)throw new Error('压缩记录校验失败。');const record=JSON.parse(zstdDecompressSync(buffer).toString());console.log(JSON.stringify({key:record.k,topics:Object.keys(record.c),compressedBytes:buffer.length}));}finally{await fd.close();}}finally{db.close();}return;
 }
 const out=path.join(root,'.runtime/dataset',`${command}-${from}-${to}-${Date.now()}`);await mkdir(out,{recursive:true});
 const meta={command,from,to,recordLimit:limit,datasetVersion:DATASET_VERSION,source:DATASET_SOURCE,engineFingerprint:await engineFingerprint(path.join(root,'packages/domain/src/ziwei')),configuration:'当前领域引擎默认配置；以 fingerprint 识别源码',generatedAt:new Date().toISOString(),attribution:'王多鱼AI / Renhuai123/ziwei-doushu · CC BY 4.0；独立引文见分发目录许可'};
 if(command==='evaluate'){
  const checks=[];
  for(const l of LEARNING_CASES){const r=await readRecord(datasetKey(l.birth));if(!r)throw new Error('教学盘缺失');const chart=generateChart({...l.birth});const refs=datasetReferences(r,l.questions[0],chart);
   const check={key:r.k,topics:Object.keys(r.c).length,references:refs.length,characters:refs.reduce((n,r)=>n+r.text.length,0),allLocal:refs.every(p=>p.birthKey===r.k&&p.version===DATASET_VERSION&&p.flags.length===0),primaryMatches:r.ms===null?chartFeatures(chart).empty:chartFeatures(chart).majors.includes(r.ms)};
   if(check.topics!==13||check.characters>3600||!check.allLocal||!check.primaryMatches||!refs.length)throw new Error(`检查失败：${l.id}`);checks.push(check);
  }
  await writeFile(path.join(out,'evaluation.json'),JSON.stringify({meta,checks,scope:'验证读取、参考过滤和预算；不是模型答案质量或真实事件准确率。'},null,2));console.log(out);return;
 }
 const db=(command==='dedupe'||command==='pack')?new DatabaseSync(path.join(out,command==='pack'?'offsets.sqlite':'paragraphs.sqlite')):null;
 if(db){db.exec('CREATE TABLE metadata (key TEXT PRIMARY KEY,value TEXT);');db.prepare('INSERT INTO metadata VALUES (?,?)').run('provenance',JSON.stringify(meta));}
 if(command==='dedupe')db!.exec("CREATE TABLE paragraphs (id TEXT PRIMARY KEY,text TEXT NOT NULL,flags TEXT NOT NULL); CREATE TABLE refs (birth TEXT,topic TEXT,ordinal INTEGER,paragraph TEXT,PRIMARY KEY(birth,topic,ordinal)); CREATE INDEX refs_paragraph ON refs(paragraph); CREATE VIRTUAL TABLE search USING fts5(id UNINDEXED,text,tokenize='trigram');");
 if(command==='pack')db!.exec('CREATE TABLE records (birth TEXT PRIMARY KEY,offset INTEGER,length INTEGER,sha256 TEXT);');
 const streams=new Map<string,ReturnType<typeof createWriteStream>>();
 async function line(file:string,value:unknown){let stream=streams.get(file);if(!stream){stream=createWriteStream(path.join(out,file),{flags:'wx'});streams.set(file,stream);}if(!stream.write(JSON.stringify(value)+'\n'))await once(stream,'drain');}
 const pack=command==='pack'?await open(path.join(out,'records.zst'),'wx'):null;let packedOffset=0,count=0,occurrences=0,unique=0;
 const patterns:Record<string,number>={},majors:Record<string,number>={},seen=new Set<string>(),splitCounts:Record<string,number>={train:0,validation:0,test:0};
 const insertParagraph=db&&command==='dedupe'?db.prepare('INSERT OR IGNORE INTO paragraphs VALUES (?,?,?)'):null;
 const insertRef=db&&command==='dedupe'?db.prepare('INSERT INTO refs VALUES (?,?,?,?)'):null;
 const insertSearch=db&&command==='dedupe'?db.prepare('INSERT INTO search VALUES (?,?)'):null;
 try{
  db?.exec('BEGIN');
  outer:for(let year=from;year<=to;year++){
   for await(const r of scanYear(year,AbortSignal.timeout(3600000))){
    count++;
    if(command==='index'||command==='training'){
     const chart=generateChart(recordBirth(r)),features=chartFeatures(chart);
     for(const p of features.patterns)patterns[p]=(patterns[p]||0)+1;const major=features.majors.join('+')||'空宫';majors[major]=(majors[major]||0)+1;
     if(command==='index')await line('structures.jsonl',{...features,version:DATASET_VERSION});
     else{
      // Keep an entire structural teaching group in one split. Exact paragraph duplicates are emitted only once across the entire run.
      const group=[major,...features.patterns.slice().sort()].join('|'),bucket=parseInt(hash(group).slice(0,8),16)%10;const split=bucket===0?'test':bucket===1?'validation':'train';
      for(const topic of DATASET_TOPICS){for(const p of datasetParagraphs(r,topic)){if(p.flags.length||p.text.length<40||p.text.length>1600)continue;const id=hash(p.text);if(seen.has(id))continue;seen.add(id);splitCounts[split]++;
       await line(`${split}.jsonl`,{id,group:hash(group),requiresHumanReview:true,instruction:`请按当前盘面条件解释${topic}，区分事实与传统解读。`,input:features,output:p.text,source:{birth:r.k,topic,paragraph:p.index,version:DATASET_VERSION,path:p.path}});
      }}
     }
    }else if(command==='dedupe'){
     for(const topic of DATASET_TOPICS)for(const p of datasetParagraphs(r,topic)){occurrences++;const id=hash(p.text);if(Number(insertParagraph!.run(id,p.text,JSON.stringify(p.flags)).changes)>0){unique++;insertSearch!.run(id,p.text);}insertRef!.run(r.k,topic,p.index,id);}
    }else if(command==='pack'){
     const bytes=zstdCompressSync(Buffer.from(JSON.stringify(r)));let written=0;while(written<bytes.length){const result=await pack!.write(bytes,written,bytes.length-written,packedOffset+written);if(!result.bytesWritten)throw new Error('写入压缩记录失败。');written+=result.bytesWritten;}
     db!.prepare('INSERT INTO records VALUES (?,?,?,?)').run(r.k,packedOffset,bytes.length,hash(bytes));packedOffset+=bytes.length;
    }
    if(count%100===0){db?.exec('COMMIT; BEGIN');console.log(`${command}: ${count} 条`);}
    if(count>=limit)break outer;
   }
  }
  db?.exec('COMMIT');
 }finally{await pack?.close();db?.close();for(const stream of streams.values()){stream.end();await once(stream,'finish');}}
 await writeFile(path.join(out,'summary.json'),JSON.stringify({meta,processedRecords:count,partial:count>=limit,patterns,majors,paragraphOccurrences:occurrences,uniqueParagraphs:unique,packedBytes:packedOffset,splitCounts,note:'枚举样本统计，不代表人口比例或预测准确率；训练候选须人工审核。'},null,2));
 console.log(out);
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
