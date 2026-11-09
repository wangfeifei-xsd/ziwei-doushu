import type { AIEvent } from '@ziwei/runtime/services';
import { readSSEData } from './stream';
import type { AIAPIMode, AIRequestSettings } from '@ziwei/domain/ai/config';
import type { AIMessage } from '@ziwei/domain/ai/errors';
import { upstreamFailure } from '@ziwei/domain/ai/errors';
import type { DatasetLoadStatus } from '@ziwei/domain/ziwei/dataset';

export interface AIRequestBody {
  model: string;
  stream: true;
  messages?: AIMessage[];
  instructions?: string;
  input?: AIMessage[];
  store?: false;
  max_output_tokens?: number;
  max_completion_tokens?: number;
}

export function requestBody(mode: AIAPIMode, model: string, messages: AIMessage[], settings: AIRequestSettings = {}): AIRequestBody {
  return mode === 'responses' ? {
    model, instructions: messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n'),
    input: messages.filter(m => m.role !== 'system'), stream: true, store: false,
    ...(settings.maxOutputTokens === undefined ? {} : { max_output_tokens: settings.maxOutputTokens }),
  } : { model, messages, stream: true,
    ...(settings.maxOutputTokens === undefined ? {} : { max_completion_tokens: settings.maxOutputTokens }),
  };
}

type StreamEvent = {
  type?: string;
  error?: unknown;
  delta?: unknown;
  records?: DatasetLoadStatus[];
  response?: { error?: unknown; status?: unknown; incomplete_details?: { reason?: string } };
  choices?: { delta?: { content?: unknown }; finish_reason?: string | null }[];
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
    if (Array.isArray(data?.dataset)) yield { type: 'dataset', records: data.dataset };
    throw new Error(data?.error || 'AI 服务暂时不可用，请稍后重试。');
  }
  if (!response.body) throw new Error('模型未返回响应。');
  for await (const data of readSSEData(response.body)) {
    if (data === '[DONE]') { yield { type: 'done' }; return; }
    const event = parseEvent(data);
    if (typeof event.error === 'string') throw new Error(event.error);
    if (event.type === 'dataset' && Array.isArray(event.records)) { yield { type: 'dataset', records: event.records }; continue; }
    const delta = event.delta as { text?: unknown } | undefined;
    if (typeof delta?.text === 'string') yield { type: 'delta', text: delta.text };
  }
  throw new Error('解读连接已中断，请重试。');
}

export async function* upstreamEvents(body: ReadableStream<Uint8Array>, mode: AIAPIMode): AsyncGenerator<AIEvent> {
  for await (const data of readSSEData(body)) {
    if (data.trim() === '[DONE]') {
      if (mode === 'responses') throw new Error('模型响应不完整，未收到 Responses 完成信号。');
      yield { type: 'done' }; return;
    }
    const event = parseEvent(data);
    const text = mode === 'responses'
      ? (['response.output_text.delta', 'response.refusal.delta'].includes(event.type ?? '') ? event.delta : undefined)
      : event.choices?.[0]?.delta?.content;
    if (typeof text === 'string' && text) yield { type: 'delta', text };
    if (event.response?.incomplete_details?.reason === 'max_output_tokens' || event.choices?.some(choice => choice.finish_reason === 'length')) {
      throw new Error('模型响应失败或不完整：已达到输出额度，请提高输出 token 设置后重试。');
    }
    if (event.choices?.some(choice => choice.finish_reason && !['stop', 'length'].includes(choice.finish_reason))) {
      throw new Error('模型响应失败或不完整，服务商提前结束了回答。');
    }
    if (event.error || event.response?.error) {
      const message = upstreamFailure(400, { error: event.error || event.response?.error });
      throw new Error(message === '模型服务暂时不可用，请稍后重试。' ? '模型响应失败或不完整，请检查模型配置。' : message);
    }
    if (['error', 'response.failed', 'response.incomplete'].includes(event.type ?? '')) throw new Error('模型响应失败或不完整，请检查模型配置。');
    if (mode === 'responses' && event.type === 'response.completed') {
      if (event.response?.error || (event.response?.status && event.response.status !== 'completed')) throw new Error('模型响应失败或不完整，请检查模型配置。');
      yield { type: 'done' }; return;
    }
  }
  throw new Error('模型响应不完整，请重试。');
}

export async function consumeAI(events: AsyncIterable<AIEvent>, onText: (text: string) => void, onDataset?: (records: DatasetLoadStatus[]) => void) {
  let text = '';
  for await (const event of events) {
    if (event.type === 'error') throw new Error(event.message);
    if (event.type === 'dataset') onDataset?.(event.records);
    if (event.type === 'delta') { text += event.text; onText(text); }
    if (event.type === 'done') {
      if (!text.trim()) throw new Error('模型没有返回解读内容，请重试。');
      return;
    }
  }
  throw new Error('解读连接已中断，请重试。');
}
