import { AIRequestError } from '@ziwei/domain/ai/errors';

export const REQUEST_CAPACITY_ERROR = '请求超过当前容量设置，完整资料未裁剪。请在模型配置中提高请求容量后重试。';

/** Bound bytes while reading, including requests without Content-Length. */
export async function readRequestText(request: Request, limit: number, signal = request.signal): Promise<string> {
  signal.throwIfAborted();
  if (Number(request.headers.get('content-length')) > limit) {
    await request.body?.cancel();
    throw new AIRequestError(REQUEST_CAPACITY_ERROR, 413);
  }
  if (!request.body) return '';
  const reader = request.body.getReader();
  const abort = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new AIRequestError(REQUEST_CAPACITY_ERROR, 413);
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join('');
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
