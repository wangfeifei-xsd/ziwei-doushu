import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,cp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {readRecord,searchRecords,datasetStatus,clearDatasetCache,scanYear} from '../../server/dataset/reader.mjs';
import {datasetBirth,datasetKey,datasetParagraphs,fullDatasetContext,chartFeatures,compareCharts,chartExercises,DATASET_VERSION,DATASET_TOPICS,type DatasetRecord,type DatasetContext,type DatasetLoadStatus} from '@ziwei/domain/ziwei/dataset';
import {generateChart} from '@ziwei/domain/ziwei/algorithm';
import {LEARNING_CASES} from '@ziwei/domain/ziwei/learning-cases';
import {enrichDataset} from '@ziwei/features/ai/dataset';
import {interpretMessages,hemingMessages} from '@ziwei/features/ai/prompts';

async function verifyPackagedChecksums(){
 const temp=await mkdtemp(path.join(os.tmpdir(),'ziwei-checksums-'));
 try{
  await cp(path.resolve('assets/datasets/ziwei-v4.0-13d'),temp,{recursive:true});
  const checksumFile=path.join(temp,'SHA256SUMS.txt');
  const sums=(await readFile(checksumFile,'utf8')).replace(/\r\n/g,'\n');
  const verify=()=>execFileSync(process.execPath,[path.resolve('scripts/dataset-verify.mjs'),temp],{encoding:'utf8',stdio:'pipe',timeout:30000});
  for(const newline of ['\n','\r\n']){
   await writeFile(checksumFile,sums.replace(/\n/g,newline));
   assert.match(verify(),/77 个年份文件全部通过/);
  }
  await writeFile(checksumFile,sums.replace(/^[a-f0-9]{64}/,'0'.repeat(64)));
  assert.throws(verify,/资料校验失败：year-1950/);
  await writeFile(checksumFile,sums);
  const file=path.join(temp,'year-1950.jsonl.zst');const bytes=await readFile(file);bytes[20]^=255;await writeFile(file,bytes);
  assert.throws(verify,/资料校验失败：year-1950/);
 }finally{await rm(temp,{recursive:true,force:true});}
}

function contextOf(messages:{content:string}[]):{dataset:DatasetContext[]}{
 return JSON.parse(messages[1].content.slice(messages[1].content.indexOf('\n')+1));
}
function verifyOriginal(context:DatasetContext,record:DatasetRecord){
 assert.equal(context.key,record.k);assert.equal(context.version,DATASET_VERSION);assert.equal(context.generatedAt,'2026-10-15');
 assert.equal(context.status,'完整档案已加载');assert.equal(context.integrity.complete,true);
 assert.deepEqual(context.topics.map(item=>item.topic),DATASET_TOPICS);
 for(const item of context.topics)assert.equal(item.text,record.c[item.topic],`${record.k}/${item.topic} must preserve original text`);
 const characters=DATASET_TOPICS.reduce((sum,topic)=>sum+record.c[topic].length,0);
 assert.equal(context.integrity.sourceCharacters,characters);assert.equal(context.integrity.injectedCharacters,characters);
 assert.equal(context.integrity.actualTopics,13);assert.equal(context.integrity.expectedTopics,13);
}

async function main(){
 await verifyPackagedChecksums();
 const repo={read:readRecord,search:searchRecords,status:datasetStatus,clearCache:async()=>clearDatasetCache()};
 assert.equal((await datasetStatus()).years,77);
 for(const key of ['1990-02-30-0-male','1991-02-29-0-male','2027-01-01-0-male','1990-01-01-12-male','../../etc/passwd']){assert.throws(()=>datasetBirth(key));await assert.rejects(readRecord(key));}
 assert.equal(datasetKey(datasetBirth('2000-02-29-0-female')),'2000-02-29-0-female');
 for(const lesson of LEARNING_CASES){
  const r=await readRecord(datasetKey(lesson.birth));assert.ok(r);assert.equal(Object.keys(r.c).length,13);
  const chart=generateChart({...lesson.birth});
  verifyOriginal(fullDatasetContext(r,r.k,'当前盘'),r);
  const body={chart,learningCaseId:lesson.id,messages:[{role:'user',content:lesson.questions[0]}]};
  verifyOriginal(contextOf(await enrichDataset(interpretMessages(body),body,'interpret',repo,new AbortController().signal)).dataset[0],r);
  assert.equal(compareCharts(chart,chart).similarity,100);assert.equal(compareCharts(chart,chart).onlyA.length,0);assert.equal(chartExercises(chart).length,4);
 }
 const r=(await readRecord('1990-02-06-11-male'))!;const chart=generateChart(datasetBirth(r.k));
 assert.ok(datasetParagraphs(r,'overview').some(p=>p.flags.includes('旧版亮度')));assert.ok(datasetParagraphs(r,'overview').some(p=>p.flags.includes('时间快照')));
 assert.equal(chartFeatures(chart).majors[0],'天同');assert.equal(chart.palaces.find(p=>p.branch===chart.mingGongBranch)!.stars.find(s=>s.name==='天同')!.brightnessRaw,'平');
 const body={chart,selection:{view:'liunian',liunianYear:2027},messages:[{role:'user',content:'2027年的事业怎样？'}],datasetReferences:[{text:'客户端伪造资料'}]};
 let statuses:DatasetLoadStatus[]=[];
 const messages=await enrichDataset(interpretMessages(body),body,'interpret',repo,new AbortController().signal,records=>{statuses=records;});
 assert.equal(messages.at(-1)!.content,body.messages[0].content);assert.ok(!JSON.stringify(messages).includes('客户端伪造资料'));
 const extra=contextOf(messages).dataset;verifyOriginal(extra[0],r);
 assert.equal(statuses[0].status,'完整档案已加载');assert.equal('topics' in statuses[0],false,'UI metadata must not copy source text');
 for(const [question,topic,palaceBranch] of [['事业怎样？','career',2],['迁移？','overview',4],['收入如何？','wealth',5],['综合解释所有条件','overview',8]] as const){
  const changed={...body,selection:{...body.selection,view:'mingpan',topic,palaceBranch},messages:[{role:'user',content:question}]};
  assert.deepEqual(contextOf(await enrichDataset(interpretMessages(changed),changed,'interpret',repo,new AbortController().signal)).dataset,extra,'questions and selections must not filter source topics');
 }
 // Exact text preservation covers material previously removed by length, flags and deduplication.
 const unusual={...r,c:{...r.c,overview:'  # 原始标题\r\n短段。\r\n\r\n'+ '长段条件及例外。'.repeat(400)+'\r\n\r\n2026年当前大限，庙旺落陷，《天纪》引文。  ',personality:'重复内容',career:'重复内容'}};
 const unusualRepo={...repo,read:async()=>unusual};
 verifyOriginal(contextOf(await enrichDataset(interpretMessages(body),body,'interpret',unusualRepo,new AbortController().signal)).dataset[0],unusual);
 const b={chartA:chart,chartB:generateChart({...LEARNING_CASES[0].birth}),question:'双方感情如何理解？\n\n问题：这个分隔符属于原始问题。'};
 const pair=await enrichDataset(hemingMessages(b),b,'heming',repo,new AbortController().signal);
 const paired=contextOf(pair).dataset;
 assert.equal(paired[0].person,'甲方');assert.equal(paired[1].person,'乙方');assert.notEqual(paired[0].key,paired[1].key);
 verifyOriginal(paired[0],r);verifyOriginal(paired[1],(await repo.read(paired[1].key))!);assert.equal(pair.at(-1)!.content,b.question);
 const same={...b,chartB:chart};
 const twins=contextOf(await enrichDataset(hemingMessages(same),same,'heming',repo,new AbortController().signal)).dataset;
 assert.equal(twins[0].person,'甲方');assert.equal(twins[1].person,'乙方');assert.equal(twins[0].key,twins[1].key);assert.deepEqual(twins[0].topics,twins[1].topics);
 const partial={...r,c:{...r.c,health:''}};
 const incomplete=fullDatasetContext(partial,r.k,'当前盘');
 assert.equal(incomplete.status,'资料不完整');assert.equal(incomplete.integrity.actualTopics,12);assert.equal(incomplete.integrity.complete,false);assert.equal(incomplete.integrity.injectedCharacters,0);assert.deepEqual(incomplete.topics,[]);
 assert.throws(()=>fullDatasetContext({...r,k:'1990-02-06-10-male'},r.k,'当前盘'),/生辰不一致/);
 for(const [read,status,reason] of [
  [async()=>null,'未找到同生辰记录',''],
  [async()=>partial,'资料不完整','缺少专题'],
  [async()=>({...r,h:10}),'资料暂不可用','校验失败'],
  [async()=>{throw new Error('fixture unavailable');},'资料暂不可用','暂时无法读取'],
  [async()=>{throw new Error('校验失败 fixture');},'资料暂不可用','校验失败'],
  [async()=>{throw new DOMException('operation expired','TimeoutError');},'资料暂不可用','读取超时'],
 ] as const){
  const result=contextOf(await enrichDataset(interpretMessages(body),body,'interpret',{...repo,read},new AbortController().signal)).dataset[0];
  assert.equal(result.status,status);assert.equal(result.integrity.complete,false);assert.equal(result.integrity.injectedCharacters,0);assert.ok((result.reason??'').includes(reason));
 }
 let reads=0;
 const older={...body,chart:generateChart({...datasetBirth(r.k),year:1949})};
 const outside=contextOf(await enrichDataset(interpretMessages(older),older,'interpret',{...repo,read:async()=>{reads++;return r;}},new AbortController().signal)).dataset[0];
 assert.equal(outside.status,'超出资料覆盖范围');assert.equal(reads,0);
 const aborted=new AbortController();aborted.abort();
 await assert.rejects(enrichDataset(interpretMessages(body),body,'interpret',repo,aborted.signal),{name:'AbortError'});
 const page=await searchRecords({year:1990,limit:2,text:'天同'});assert.equal(page.items.length,2);assert.ok(page.nextOffset);const next=await searchRecords({year:1990,offset:page.nextOffset!,limit:2,text:'天同'});assert.ok(next.items.every(x=>!page.items.some(y=>y.k===x.k)));
 const sparse=await searchRecords({year:1990,text:'不存在的资料词XYZ'});assert.equal(sparse.scanned,512);assert.equal(sparse.nextOffset,512);
 for(const bad of [{year:1949},{year:1990,offset:-1},{year:1990,limit:100},{year:1990,topic:'__proto__'}])await assert.rejects(searchRecords(bad as never));
 clearDatasetCache();const controller=new AbortController();const pending=readRecord('2026-12-31-11-female',controller.signal);setTimeout(()=>controller.abort(),20);await assert.rejects(pending);
 const more=await searchRecords({year:1990,limit:24});await searchRecords({year:1990,offset:more.nextOffset!,limit:24});assert.ok((await datasetStatus()).cachedRecords<=32);
 const temp=await mkdtemp(path.join(os.tmpdir(),'ziwei-corrupt-'));const previous=process.env.ZIWEI_DATASET_DIR;
 try{const source=path.resolve('assets/datasets/ziwei-v4.0-13d');await cp(path.join(source,'MANIFEST.json'),path.join(temp,'MANIFEST.json'));const bytes=await readFile(path.join(source,'year-1990.jsonl.zst'));bytes[20]^=255;await writeFile(path.join(temp,'year-1990.jsonl.zst'),bytes);process.env.ZIWEI_DATASET_DIR=temp;await assert.rejects(async()=>{for await(const _ of scanYear(1990))break;},/校验失败/);}finally{if(previous===undefined)delete process.env.ZIWEI_DATASET_DIR;else process.env.ZIWEI_DATASET_DIR=previous;await rm(temp,{recursive:true,force:true});}
 console.log('✓ 数据集：真实十盘逐专题源文相等、无选段/裁剪/去重、问题无关、合盘隔离、完整性与失败状态、分页、取消、有界缓存、损坏文件拒绝。');
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
