import {createReadStream} from 'node:fs';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createZstdDecompress,constants} from 'node:zlib';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const datasetRoot=()=>process.env.ZIWEI_DATASET_DIR||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../assets/datasets/ziwei-v4.0-13d');
const cache=new Map(),verified=new Map();
let active=0;const queue=[];const CACHE_LIMIT=32;
export function validateKey(key){
 const m=typeof key==='string'&&/^(\d{4})-(\d{2})-(\d{2})-(\d|1[01])-(male|female)$/.exec(key);
 if(!m)throw new Error('生辰键格式不正确。');
 const [y,mo,d]=m.slice(1,4).map(Number),date=new Date(Date.UTC(y,mo-1,d));
 if(y<1950||y>2026||date.getUTCMonth()!==mo-1||date.getUTCDate()!==d)throw new Error('资料仅覆盖 1950–2026 年的真实公历日期。');return y;
}
async function manifest(){return JSON.parse(await readFile(path.join(datasetRoot(),'MANIFEST.json'),'utf8'));}
async function acquire(signal){
 signal.throwIfAborted();
 if(active>=2){if(queue.length>=16)throw new Error('资料读取繁忙，请稍后重试。');await new Promise((resolve,reject)=>{
  const item={resolve:()=>{signal.removeEventListener('abort',abort);resolve();}};
  const abort=()=>{const i=queue.indexOf(item);if(i>=0)queue.splice(i,1);reject(signal.reason);};
  signal.addEventListener('abort',abort,{once:true});queue.push(item);
 });}else active++;
 if(signal.aborted){release();signal.throwIfAborted();}
}
function release(){const next=queue.shift();if(next)next.resolve();else active--;}
async function yearFile(year){
 if(!Number.isInteger(year)||year<1950||year>2026)throw new Error('年份必须为 1950–2026。');
 const m=await manifest();const entry=m.files.find(f=>f.year===year);if(!entry)throw new Error('资料清单缺少年份。');
 const file=path.join(datasetRoot(),`year-${year}.jsonl.zst`);const info=await stat(file);
 const fingerprint=`${info.size}:${info.mtimeMs}`;
 if(verified.get(file)!==fingerprint){const bytes=await readFile(file);if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw new Error('资料校验失败，请重新安装数据包。');verified.set(file,fingerprint);}
 return file;
}
export async function* scanYear(year,signal=AbortSignal.timeout(120000)){
 const file=await yearFile(year);signal.throwIfAborted();
 const input=createReadStream(file,{highWaterMark:65536,signal});
 const decoder=createZstdDecompress({params:{[constants.ZSTD_d_windowLogMax]:27}});
 const abort=()=>{input.destroy();decoder.destroy(signal.reason);};signal.addEventListener('abort',abort,{once:true});
 input.on('error',error=>decoder.destroy(error));input.pipe(decoder);
 const lines=createInterface({input:decoder,crlfDelay:Infinity});
 try{for await(const line of lines){signal.throwIfAborted();if(line.length>262144)throw new Error('资料行超过大小限制。');if(line.trim())yield JSON.parse(line);}}
 finally{signal.removeEventListener('abort',abort);lines.close();input.destroy();decoder.destroy();}
}
function remember(record){cache.delete(record.k);cache.set(record.k,record);while(cache.size>CACHE_LIMIT)cache.delete(cache.keys().next().value);}
export async function readRecord(key,signal){
 const year=validateKey(key);const bounded=AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(20000)]);
 bounded.throwIfAborted();if(cache.has(key)){const record=cache.get(key);remember(record);return record;}
 await acquire(bounded);
 try{if(cache.has(key))return cache.get(key);for await(const record of scanYear(year,bounded)){if(record.k===key){remember(record);return record;}}return null;}
 finally{release();}
}
export async function searchRecords(query,signal){
 const {year,offset=0,limit=12,topic='overview',text='',primaryStar=''}=query||{};
 if(!Number.isInteger(year)||year<1950||year>2026||!Number.isInteger(offset)||offset<0||offset>8784||!Number.isInteger(limit)||limit<1||limit>24||typeof text!=='string'||text.length>80||typeof primaryStar!=='string'||primaryStar.length>12||!['overview','personality','love','career','wealth','health','family','children','move','friends','home','spirit','parents'].includes(topic))throw new Error('资料查询条件不正确。');
 const bounded=AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(20000)]);await acquire(bounded);
 try{let index=0,scanned=0;const items=[];
  for await(const record of scanYear(year,bounded)){if(index++<offset)continue;scanned++;
   if((!primaryStar||(primaryStar==='空宫'?record.ms===null:record.ms===primaryStar))&&(!text||record.c[topic].includes(text))){items.push(record);remember(record);}
   if(items.length>=limit||scanned>=512)return {items,scanned,nextOffset:index,year};
  }return {items,scanned,nextOffset:null,year};
 }finally{release();}
}
export async function datasetStatus(){const m=await manifest();return {version:m.contentVersion,years:m.files.length,records:m.totalCharts,compressedBytes:m.zstBytes,cachedRecords:cache.size,cacheLimit:CACHE_LIMIT,mode:'按年流式解压；最多两路读取；32 条内存缓存'};}
export function clearDatasetCache(){cache.clear();}
