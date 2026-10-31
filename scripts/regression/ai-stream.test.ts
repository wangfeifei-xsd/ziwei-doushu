import assert from 'node:assert/strict';
import { readAIResponse, readSSEData } from '../../packages/features/src/ai/stream';

function fragmented(text: string, size = 1): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let index = 0; index < bytes.length; index += size) controller.enqueue(bytes.slice(index, index + size));
      controller.close();
    },
  });
}

async function main() {
  const raw = ': heartbeat\r\nevent: message\r\ndata: {"delta":{"text":"命宫紫微"}}\r\n\r\ndata: {"delta":{"text":"，天府同宫。"}}\r\n\r\ndata: [DONE]\r\n\r\n';
  for (const size of [1, 2, 3, 7, 64, 4096]) {
    let text = '';
    await readAIResponse(new Response(fragmented(raw, size)), value => { text = value; });
    assert.equal(text, '命宫紫微，天府同宫。', `UTF-8 / SSE chunk size ${size}`);
  }

  const events = [];
  for await (const data of readSSEData(fragmented('data: first\ndata: second\n\ndata: [DONE]'))) events.push(data);
  assert.deepEqual(events, ['first\nsecond', '[DONE]']);

  await assert.rejects(
    readAIResponse(Response.json({ error: '模型服务认证失败，请检查 API Key 和模型访问权限。' }, { status: 502 }), () => {}),
    /认证失败/,
  );
  await assert.rejects(readAIResponse(new Response('unavailable', { status: 503 }), () => {}), /暂时不可用/);
  await assert.rejects(readAIResponse(new Response(fragmented('data: {"error":"模型响应不完整，请重试。"}\n\n')), () => {}), /响应不完整/);
  await assert.rejects(readAIResponse(new Response(fragmented('data: {"delta":{"text":"只返回一半"}}\n\n')), () => {}), /连接已中断/);
  await assert.rejects(readAIResponse(new Response(fragmented('data: [DONE]\n\n')), () => {}), /没有返回解读内容/);
  await assert.rejects(readAIResponse(new Response(fragmented('data: {invalid}\n\n')), () => {}), /格式异常/);
  await assert.rejects(readAIResponse(new Response(fragmented('data: null\n\n')), () => {}), /格式异常/);

  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"delta":{"text":"正常"}}\n\ndata: [DONE]\n\n'));
    },
    cancel() { cancelled = true; },
  });
  await readAIResponse(new Response(stream), () => {});
  assert.equal(cancelled, true, '完成或退出解析时应释放底层流');

  console.log('✓ AI 流式回归通过：中文逐字节分片、CRLF、多行事件、认证错误、流中断、空结果、格式异常和流释放。');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
