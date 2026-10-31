/** 按 SSE 事件读取，保留跨网络分片的 JSON、换行和 UTF-8 字符。 */
export async function* readSSEData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const eventData = (event: string) => event.split(/\r?\n/)
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).replace(/^ /, ''))
    .join('\n');

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length > 1_048_576) throw new Error('模型返回的数据格式异常。');

      let separator: RegExpExecArray | null;
      while ((separator = /\r?\n\r?\n/.exec(buffer))) {
        const data = eventData(buffer.slice(0, separator.index));
        buffer = buffer.slice(separator.index + separator[0].length);
        if (data) yield data;
      }

      if (done) {
        const data = eventData(buffer);
        if (data) yield data;
        return;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** 两个解读面板和合盘页面共用同一份流解析及错误处理。 */
export async function readAIResponse(response: Response, onText: (text: string) => void): Promise<void> {
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(typeof payload?.error === 'string' ? payload.error : 'AI 服务暂时不可用，请稍后重试。');
  }
  if (!response.body) throw new Error('AI 服务没有返回响应。');

  let text = '';
  for await (const data of readSSEData(response.body)) {
    if (data === '[DONE]') {
      if (!text.trim()) throw new Error('模型没有返回解读内容，请重试。');
      return;
    }
    let event;
    try {
      event = JSON.parse(data);
      if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('Invalid event');
    } catch {
      throw new Error('AI 服务返回的数据格式异常，请重试。');
    }
    if (typeof event.error === 'string') throw new Error(event.error);
    if (typeof event.delta?.text === 'string') {
      text += event.delta.text;
      onText(text);
    }
  }
  throw new Error('解读连接已中断，请重试。');
}
