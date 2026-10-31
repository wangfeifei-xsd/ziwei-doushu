import 'server-only';
import { readSSEData } from './stream';
import { AIConfigError, getAIEndpoint, type AIConfig } from './config';
import { getAIConfig } from './settings';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class AIRequestError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

function upstreamError(status: number): AIRequestError {
  if (status === 401 || status === 403) {
    return new AIRequestError('模型服务认证失败，请检查 API Key 和模型访问权限。', 502);
  }
  if (status === 404) {
    return new AIRequestError('模型或接口不存在，请检查接口地址和模型名。', 502);
  }
  if (status === 429) {
    return new AIRequestError('模型服务额度不足或请求过于频繁，请检查额度后重试。', 429);
  }
  return new AIRequestError('模型服务暂时不可用，请稍后重试。', 502);
}

export async function handleAIRequest(
  request: Request,
  buildMessages: (body: unknown) => AIMessage[],
  options?: { config?: AIConfig; timeoutMs?: number },
): Promise<Response> {
  try {
    if (Number(request.headers.get('content-length')) > 262_144) {
      throw new AIRequestError('请求内容过长，请减少聊天记录后重试。', 413);
    }
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 262_144) {
      throw new AIRequestError('请求内容过长，请减少聊天记录后重试。', 413);
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new AIRequestError('请求内容必须是有效的 JSON。');
    }
    const messages = buildMessages(body);
    const config = options?.config ?? await getAIConfig();
    const { apiKey, model, mode } = config;
    const endpoint = getAIEndpoint(config);
    const abort = new AbortController();
    const signal = AbortSignal.any([request.signal, abort.signal, AbortSignal.timeout(options?.timeoutMs ?? 180_000)]);
    const requestOptions: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(mode === 'responses' ? {
        model,
        instructions: messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n'),
        input: messages.filter(message => message.role !== 'system'),
        stream: true,
        store: false,
        max_output_tokens: 4096,
      } : { model, messages, stream: true, max_completion_tokens: 4096 }),
      signal,
      cache: 'no-store',
      redirect: 'error',
    };
    let upstream: Response;
    try {
      upstream = await fetch(endpoint, requestOptions);
    } catch (error) {
      const code = (error as { cause?: { code?: string } })?.cause?.code;
      if (signal.aborted || !['ECONNRESET', 'UND_ERR_SOCKET'].includes(code ?? '')) throw error;
      // 只在尚未收到响应头时，为连接重置重试一次；不重试额度或认证错误。
      upstream = await fetch(endpoint, requestOptions);
    }
    if (!upstream.ok) {
      await upstream.body?.cancel();
      throw upstreamError(upstream.status);
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
        const send = (value: unknown) => {
          if (!cancelled) controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
        };
        let receivedText = false;
        let completed = false;
        try {
          for await (const data of readSSEData(upstreamBody)) {
            if (data === '[DONE]') {
              completed = true;
              break;
            }
            const event = JSON.parse(data);
            if (event.error || ['response.failed', 'response.incomplete', 'error'].includes(event.type)) {
              throw new Error('Upstream stream error');
            }
            if (mode === 'responses' && event.type === 'response.completed') {
              completed = true;
              break;
            }
            const delta = mode === 'responses'
              ? (['response.output_text.delta', 'response.refusal.delta'].includes(event.type) ? event.delta : undefined)
              : event.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta) {
              receivedText = true;
              send({ delta: { text: delta } });
            }
          }
          if (!receivedText || !completed) throw new Error('Incomplete response');
          if (!cancelled) controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch {
          send({ error: signal.aborted ? '模型响应超时或连接已断开，请重试。' : '模型响应不完整，请重试或检查模型配置。' });
        } finally {
          abort.abort();
          if (!cancelled) controller.close();
        }
      },
      cancel() {
        cancelled = true;
        abort.abort();
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    if (error instanceof AIRequestError || error instanceof AIConfigError) {
      return Response.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
    }
    const networkError = error as { name?: string; cause?: { code?: string } };
    console.error('AI request failed', { name: networkError?.name, code: networkError?.cause?.code });
    return Response.json({ error: '无法连接模型服务，请检查接口地址和网络后重试。' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
