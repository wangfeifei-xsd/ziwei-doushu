import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canonicalForm, profileID, validateProfileExport } from '@ziwei/domain/profiles-transfer';
import { parseShareLink, publicShareLink, formToBirthInfo } from '@ziwei/domain/ziwei/share';
import { ALL_BOOKS, searchClassics } from '@ziwei/content/classics';
import { consumeAI, requestBody, upstreamEvents } from '@ziwei/features/ai/client';

async function main(){
 const fixture=JSON.parse(await readFile(new URL('../fixtures/profiles-v1.json',import.meta.url),'utf8'));
 for(const record of fixture.profiles){assert.equal(canonicalForm(record.form),record.canonical);assert.equal(await profileID(record.form),record.id);}
 const data=await validateProfileExport(fixture);assert.equal(data.profiles.length,3);
 await assert.rejects(validateProfileExport({...fixture,version:2}),/版本/);
 await assert.rejects(validateProfileExport({...fixture,profiles:[{...fixture.profiles[0],id:'0'.repeat(64)}]}),/第 1/);
 await assert.rejects(validateProfileExport({...fixture,profiles:[{...fixture.profiles[0],savedAt:NaN}]}),/第 1/);
 await assert.rejects(validateProfileExport({...fixture,profiles:[{...fixture.profiles[0],form:{...fixture.profiles[0].form,month:'2'}}]}),/第 1/);
 const form=data.profiles[0].form;
 assert.deepEqual(parseShareLink(publicShareLink('https://ziwei.example',form)),form);
 for(const base of ['tauri://localhost','http://localhost:3000','https://127.0.0.1','https://localhost'])assert.equal(publicShareLink(base,form),'');
 for(const url of ['https://example.com/chart?profile='+data.profiles[0].id,'javascript:alert(1)','https://example.com/other?y=2000'])assert.throws(()=>parseShareLink(url));
 const info=formToBirthInfo(form);assert.equal(info.day,1);assert.equal(info.month,2);assert.equal(info.origInput?.day,31);
 const originalTZ=process.env.TZ;
 try {
  // Apia skipped 2011-12-30 locally; birth calendar arithmetic must still produce that date.
  for(const zone of ['UTC','Asia/Shanghai','America/New_York','Pacific/Apia']){
   process.env.TZ=zone;
   const next=formToBirthInfo({...form,year:'2011',month:'12',day:'29',clockHour:'23'});
   assert.deepEqual([next.year,next.month,next.day],[2011,12,30],zone);
   assert.equal(next.origInput?.day,29);
  }
 } finally {if(originalTZ===undefined)delete process.env.TZ;else process.env.TZ=originalTZ;}
 assert.equal(ALL_BOOKS.length,3);assert.equal(ALL_BOOKS.reduce((sum,book)=>sum+book.chapters.length,0),21);assert.ok(searchClassics('紫微').length>0);
 for(const mode of ['chat','responses'] as const){
  const request=requestBody(mode,'fixture',[{role:'system',content:'system'},{role:'user',content:'你好'}]);
  assert.equal(request.stream,true);if(mode==='responses'){assert.equal(request.store,false);assert.equal(request.instructions,'system');}
  const first=mode==='chat'?{choices:[{delta:{content:'紫微😀'}}]}:{type:'response.output_text.delta',delta:'紫微😀'};
  const second=mode==='chat'?{choices:[{delta:{content:'斗数'}}]}:{type:'response.output_text.delta',delta:'斗数'};
  const done=mode==='chat'?'[DONE]':JSON.stringify({type:'response.completed'});
  const payload=`data: ${JSON.stringify(first)}\r\n\r\ndata: ${JSON.stringify(second)}\n\ndata: ${done}\n\n`;
  const bytes=new TextEncoder().encode(payload);let cancelled=false;
  const input=new ReadableStream<Uint8Array>({async start(controller){for(let i=0;i<bytes.length;i+=3)controller.enqueue(bytes.slice(i,i+3));},cancel(){cancelled=true;}});
  const updates:string[]=[];await consumeAI(upstreamEvents(input,mode),text=>updates.push(text));assert.deepEqual(updates,['紫微😀','紫微😀斗数']);assert.ok(cancelled);
  for(const invalid of ['data: [DONE]\n\n',`data: ${JSON.stringify(first)}\n\n`,'data: {"error":{"code":"invalid"}}\n\n','data: {"type":"response.incomplete"}\n\n']){
   const body=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode(invalid));controller.close();}});
   await assert.rejects(consumeAI(upstreamEvents(body,mode),()=>{}));
  }
 }
 // A delayed second network chunk proves that the first text is observable before completion.
 let controller!:ReadableStreamDefaultController<Uint8Array>;
 const stream=new ReadableStream<Uint8Array>({start(value){controller=value;}});
 const iterator=upstreamEvents(stream,'chat');const next=iterator.next();controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"第一段"}}]}\n\n'));
 assert.deepEqual((await next).value,{type:'delta',text:'第一段'});controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));assert.deepEqual((await iterator.next()).value,{type:'done'});await iterator.return(undefined);
 console.log('✓ 迁移共享回归：跨语言哈希样本、导入校验、晚子时、分享、3 部古籍/21 章、双协议中文分片与提前消费。');
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
