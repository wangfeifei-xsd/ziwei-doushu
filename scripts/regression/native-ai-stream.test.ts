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
  console.log('✓ 原生 AI 流：双协议正常结束先于 IPC 完成、迟到分片、取消和网络错误。');
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
