import type { AIEvent } from '@ziwei/runtime/services';
import { readSSEData } from './stream';
import type { AIAPIMode } from '@ziwei/domain/ai/config';
import type { AIMessage } from '@ziwei/domain/ai/errors';

export function requestBody(mode: AIAPIMode, model: string, messages: AIMessage[]) {
  return mode === 'responses' ? {
    model, instructions: messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n'),
    input: messages.filter(m => m.role !== 'system'), stream: true, store: false, max_output_tokens: 4096,
  } : { model, messages, stream: true, max_completion_tokens: 4096 };
}

type StreamEvent = {
  type?: string;
  error?: unknown;
  delta?: unknown;
  response?: { error?: unknown; status?: unknown };
  choices?: { delta?: { content?: unknown } }[];
};

function parseEvent(data: string): StreamEvent {
  try {
    const event: unknown = JSON.parse(data);
    if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error();
    return event as StreamEvent;
  } catch {
    throw new Error('模型返回的数据格式异常，请确认所选接口类型与服务商一致后重试。');
  }
}

export async function* normalizedEvents(response: Response): AsyncGenerator<AIEvent> {
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || 'AI 服务暂时不可用，请稍后重试。');
  }
  if (!response.body) throw new Error('模型未返回响应。');
  for await (const data of readSSEData(response.body)) {
    if (data === '[DONE]') { yield { type: 'done' }; return; }
    const event = parseEvent(data);
    if (typeof event.error === 'string') throw new Error(event.error);
    const delta = event.delta as { text?: unknown } | undefined;
    if (typeof delta?.text === 'string') yield { type: 'delta', text: delta.text };
  }
  throw new Error('解读连接已中断，请重试。');
}

export async function* upstreamEvents(body: ReadableStream<Uint8Array>, mode: AIAPIMode): AsyncGenerator<AIEvent> {
  for await (const data of readSSEData(body)) {
    if (data.trim() === '[DONE]') { yield { type: 'done' }; return; }
    const event = parseEvent(data);
    if (event.error || ['error', 'response.failed', 'response.incomplete'].includes(event.type ?? '')) throw new Error('模型响应失败或不完整，请检查模型配置。');
    if (mode === 'responses' && event.type === 'response.completed') {
      if (event.response?.error || (event.response?.status && event.response.status !== 'completed')) throw new Error('模型响应失败或不完整，请检查模型配置。');
      yield { type: 'done' }; return;
    }
    const text = mode === 'responses'
      ? (['response.output_text.delta', 'response.refusal.delta'].includes(event.type ?? '') ? event.delta : undefined)
      : event.choices?.[0]?.delta?.content;
    if (typeof text === 'string' && text) yield { type: 'delta', text };
  }
  throw new Error('模型响应不完整，请重试。');
}

export async function consumeAI(events: AsyncIterable<AIEvent>, onText: (text: string) => void) {
  let text = '';
  for await (const event of events) {
    if (event.type === 'error') throw new Error(event.message);
    if (event.type === 'delta') { text += event.text; onText(text); }
    if (event.type === 'done') {
      if (!text.trim()) throw new Error('模型没有返回解读内容，请重试。');
      return;
    }
  }
  throw new Error('解读连接已中断，请重试。');
}
