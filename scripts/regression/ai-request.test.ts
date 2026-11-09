import assert from 'node:assert/strict';
import { readRequestText, REQUEST_CAPACITY_ERROR } from '@ziwei/features/ai/request';
import { consumeAI, normalizedEvents } from '@ziwei/features/ai/client';
import { upstreamFailure } from '@ziwei/domain/ai/errors';
import { datasetLoadStatus, type DatasetLoadStatus } from '@ziwei/domain/ziwei/dataset';

async function main(){
  const text='条件与例外😀\n'.repeat(100);
  const bytes=new TextEncoder().encode(text);
  let cancelled=false;
  const request=(declared?:number)=>new Request('http://localhost/api/interpret',{
    method:'POST',headers:declared===undefined?{}:{'content-length':String(declared)},
    body:new ReadableStream<Uint8Array>({
      start(controller){for(let index=0;index<bytes.length;index+=7)controller.enqueue(bytes.slice(index,index+7));controller.close();},
      cancel(){cancelled=true;},
    }),duplex:'half',
  } as RequestInit & {duplex:'half'});
  assert.equal(await readRequestText(request(),bytes.length),text,'UTF-8 fragments must round-trip without clipping');
  for(const declared of [undefined,1,bytes.length]){
    await assert.rejects(readRequestText(request(declared),bytes.length-1),error=>error instanceof Error&&error.message===REQUEST_CAPACITY_ERROR&&'status' in error&&error.status===413);
  }
  assert.ok(cancelled,'oversized streams must be canceled');
  const abort=new AbortController();
  let released=false;
  const stalled=new Request('http://localhost/api/interpret',{method:'POST',body:new ReadableStream({cancel(){released=true;}}),duplex:'half'} as RequestInit & {duplex:'half'});
  const pending=readRequestText(stalled,1024,abort.signal);abort.abort();
  await assert.rejects(pending,{name:'AbortError'});assert.ok(released,'cancellation releases an unfinished upload');
  for(const [status,payload,expected] of [
    [400,{error:{code:'context_length_exceeded',message:'secret transcript'}},'上下文容量不足'],
    [400,{error:{message:'input tokens exceed the context window'}},'上下文容量不足'],
    [413,{error:'secret transcript'},'请求体大小'],
    [400,{error:{param:'max_output_tokens',message:'secret transcript'}},'输出 token 配置不兼容'],
    [400,{error:{param:'max_completion_tokens'}},'输出 token 配置不兼容'],
    [500,{error:{message:'secret transcript'}},'暂时不可用'],
  ] as const){const error=upstreamFailure(status,payload);assert.ok(error.includes(expected));assert.ok(!error.includes('secret transcript'));}
  const records=[datasetLoadStatus('当前盘','1990-02-06-11-male','资料暂不可用','档案读取超时。')];
  let received:DatasetLoadStatus[]=[];
  await assert.rejects(consumeAI(normalizedEvents(Response.json({error:'模型上下文容量不足',dataset:records},{status:502})),()=>{},value=>{received=value;}),/上下文容量不足/);
  assert.deepEqual(received,records,'status metadata must arrive even when the upstream request fails');
  const stream=`data: ${JSON.stringify({type:'dataset',records})}\n\ndata: {"delta":{"text":"正文"}}\n\ndata: [DONE]\n\n`;
  let answer='';
  await consumeAI(normalizedEvents(new Response(stream)),value=>{answer=value;},value=>{received=value;});
  assert.equal(answer,'正文');assert.deepEqual(received,records);
  console.log('✓ AI 请求：按字节限制、无 Content-Length/伪造长度、UTF-8 原样读取、容量错误分类和档案状态传递。');
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
