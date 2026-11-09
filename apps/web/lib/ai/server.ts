import 'server-only';
import { requestBody, upstreamEvents } from '@ziwei/features/ai/client';
import { readRequestText, REQUEST_CAPACITY_ERROR } from '@ziwei/features/ai/request';
import { AIConfigError, DEFAULT_AI_REQUEST_BYTES, DEFAULT_AI_TIMEOUT_SECONDS, getAIEndpoint, parseAIConfig, type AIConfig } from '@ziwei/domain/ai/config';
import type { DatasetLoadStatus } from '@ziwei/domain/ziwei/dataset';
import { getAIConfig } from './settings';
import { AIRequestError, upstreamFailure, type AIMessage } from '@ziwei/domain/ai/errors';
export { AIRequestError, type AIMessage } from '@ziwei/domain/ai/errors';

async function providerError(response: Response): Promise<unknown> {
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '', bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 65_536) return undefined;
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch { return undefined; }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function handleAIRequest(
  request: Request,
  buildMessages: (body: unknown, onDataset: (records: DatasetLoadStatus[]) => void, signal: AbortSignal) => AIMessage[] | Promise<AIMessage[]>,
  options?: { config?: AIConfig; timeoutMs?: number },
): Promise<Response> {
  let dataset: DatasetLoadStatus[] = [];
  let abort: AbortController | undefined, signal: AbortSignal | undefined;
  let streaming = false;
  try {
    const config = options?.config ? parseAIConfig(options.config) : await getAIConfig();
    abort = new AbortController();
    signal = AbortSignal.any([request.signal, abort.signal, AbortSignal.timeout(options?.timeoutMs ?? (config.requestTimeoutSeconds ?? DEFAULT_AI_TIMEOUT_SECONDS) * 1000)]);
    const activeSignal = signal;
    const limit = config.maxRequestBytes ?? DEFAULT_AI_REQUEST_BYTES;
    const text = await readRequestText(request, limit, signal);
    let body: unknown;
    try { body = JSON.parse(text); }
    catch { throw new AIRequestError('请求内容必须是有效的 JSON。'); }
    const messages = await buildMessages(body, records => { dataset = records; }, signal);
    signal.throwIfAborted();
    const { apiKey, model, mode } = config;
    const endpoint = getAIEndpoint(config);
    const serialized = JSON.stringify(requestBody(mode, model, messages, config));
    if (new TextEncoder().encode(serialized).byteLength > limit) throw new AIRequestError(REQUEST_CAPACITY_ERROR, 413);
    const requestOptions: RequestInit = {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: serialized, signal, cache: 'no-store', redirect: 'error',
    };
    let upstream: Response;
    try { upstream = await fetch(endpoint, requestOptions); }
    catch (error) {
      const code = (error as { cause?: { code?: string } })?.cause?.code;
      if (signal.aborted) throw new AIRequestError('模型响应超时或请求已取消，完整资料已保留，请重试。', 504);
      if (!['ECONNRESET', 'UND_ERR_SOCKET'].includes(code ?? '')) throw error;
      // A connection reset before headers may retry the identical complete request once.
      upstream = await fetch(endpoint, requestOptions);
    }
    if (!upstream.ok) {
      const error = upstreamFailure(upstream.status, await providerError(upstream));
      throw new AIRequestError(error, upstream.status === 429 ? 429 : 502);
    }
    if (!upstream.body || !upstream.headers.get('content-type')?.includes('text/event-stream')) {
      await upstream.body?.cancel();
      throw new AIRequestError('模型服务没有返回有效的流式响应，请检查接口地址和模型名。', 502);
    }
    const upstreamBody = upstream.body;
    const encoder = new TextEncoder();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (value: unknown) => { if (!cancelled) controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`)); };
        let receivedText = false, completed = false;
        try {
          if (dataset.length) send({ type: 'dataset', records: dataset });
          for await (const event of upstreamEvents(upstreamBody, mode)) {
            if (event.type === 'done') { completed = true; break; }
            if (event.type === 'error') throw new Error(event.message);
            if (event.type === 'delta') { receivedText = true; send({ delta: { text: event.text } }); }
          }
          if (!receivedText || !completed) throw new Error('模型响应不完整，请重试。');
          if (!cancelled) controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (error) {
          send({ error: activeSignal.aborted ? '模型响应超时或连接已断开，请重试。' : error instanceof Error ? error.message : '模型响应不完整，请重试。' });
        } finally { abort?.abort(); if (!cancelled) controller.close(); }
      },
      cancel() { cancelled = true; abort?.abort(); },
    });
    streaming = true;
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
  } catch (error) {
    if (signal?.aborted) return Response.json({ error: '模型响应超时或请求已取消，完整资料已保留，请重试。', dataset }, { status: 504, headers: { 'Cache-Control': 'no-store' } });
    if (error instanceof AIRequestError || error instanceof AIConfigError) {
      return Response.json({ error: error.message, dataset }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
    }
    const networkError = error as { name?: string; cause?: { code?: string } };
    console.error('AI request failed', { name: networkError?.name, code: networkError?.cause?.code });
    return Response.json({ error: '无法连接模型服务，请检查接口地址和网络后重试。', dataset }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  } finally { if (!streaming) abort?.abort(); }
}
