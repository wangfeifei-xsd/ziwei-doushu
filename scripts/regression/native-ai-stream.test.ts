import assert from 'node:assert/strict';
import {createAIByteStream} from '../../apps/native/src/adapters/ai-byte-stream';
import {consumeAI,upstreamEvents} from '@ziwei/features/ai/client';

async function main() {
  const bytes=(text:string)=>Array.from(new TextEncoder().encode(text));
  for (const mode of ['chat','responses'] as const) {
    let cancellations=0;
    const bridge=createAIByteStream(async()=>{cancellations++;});
    const updates:string[]=[];
    const consumed=consumeAI(upstreamEvents(bridge.stream,mode),text=>updates.push(text));
    const payload=mode==='chat'?{choices:[{delta:{content:'紫微😀'}}]}:{type:'response.output_text.delta',delta:'紫微😀'};
    bridge.enqueue(bytes(`data: ${JSON.stringify(payload)}\n\n`));
    bridge.enqueue(bytes(`data: ${mode==='chat'?'[DONE]':'{"type":"response.completed"}'}\n\n`));
    await consumed;
    assert.deepEqual(updates,['紫微😀']);
    assert.equal(cancellations,1,'terminal SSE event cancels the native reader');
    // Rust may settle or deliver an already queued IPC callback after the SSE
    // reader has canceled. Neither should turn a completed answer into an error.
    bridge.enqueue(bytes('late network data'));
    bridge.finish();
    bridge.finish(new Error('late native cancellation'));
  }
  const aborted=createAIByteStream(async()=>{});
  const reading=consumeAI(upstreamEvents(aborted.stream,'chat'),()=>{});
  aborted.finish(new DOMException('请求已取消','AbortError'));
  await assert.rejects(reading,{name:'AbortError'});
  aborted.finish();
  const failed=createAIByteStream(async()=>{});
  const failure=consumeAI(upstreamEvents(failed.stream,'responses'),()=>{});
  failed.finish(new Error('fixture network failure'));
  await assert.rejects(failure,/fixture network failure/);
  for (const ending of ['\n', '\r\n', '\r']) {
    const events = [
      'event: response.created', 'data: {"type":"response.created"}', '',
      ': keepalive', '',
      'event: response.output_text.delta', 'data: {"type":"response.output_text.delta","delta":"紫微😀"}', '',
      'event: response.completed', 'data: {"type":"response.completed","response":{"status":"completed"}}', '', '',
    ].join(ending);
    const bridge=createAIByteStream(async()=>{});
    const result=consumeAI(upstreamEvents(bridge.stream,'responses'),text=>assert.equal(text,'紫微😀'));
    // Includes boundaries inside Chinese characters, emoji and CRLF pairs.
    for(const byte of new TextEncoder().encode(events))bridge.enqueue([byte]);
    bridge.finish();
    await result;
  }
  for (const invalid of ['not-json', 'null', '[]', '42', '{"type":']) {
    let released=false;
    const bridge=createAIByteStream(async()=>{released=true;});
    const result=consumeAI(upstreamEvents(bridge.stream,'responses'),()=>{});
    bridge.enqueue(bytes(`data: ${invalid}\n\n`));
    await assert.rejects(result,error=>error instanceof Error && /模型返回的数据格式异常/.test(error.message) && !/JSON|SyntaxError|not-json/.test(error.message));
    assert.ok(released,'invalid events release the native reader');
  }
  for(const terminal of [
    {type:'response.failed',response:{error:{message:'fixture-only-secret'}}},
    {type:'response.incomplete'},
    {type:'error',message:'fixture-only-secret'},
    {type:'response.completed',response:{status:'incomplete'}},
    {type:'response.completed',response:{status:'completed',error:{message:'fixture-only-secret'}}},
  ]){
    const bridge=createAIByteStream(async()=>{});
    const result=consumeAI(upstreamEvents(bridge.stream,'responses'),()=>{});
    bridge.enqueue(bytes(`data: {"type":"response.output_text.delta","delta":"partial"}\n\ndata: ${JSON.stringify(terminal)}\n\n`));
    await assert.rejects(result,error=>error instanceof Error && /失败或不完整/.test(error.message) && !error.message.includes('fixture-only-secret'));
  }
  console.log('✓ 原生 AI 流：双协议、三种 SSE 换行逐字节分片、异常 JSON、Responses 终止状态、迟到 IPC、取消和网络错误。');
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
