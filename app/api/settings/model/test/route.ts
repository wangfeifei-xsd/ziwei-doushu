import { AIConfigError } from '@/lib/ai/config';
import { handleAIRequest } from '@/lib/ai/server';
import { modelSettingsError, readModelSettingsRequest } from '@/lib/ai/settings-api';
import { readAIResponse } from '@/lib/ai/stream';

export const runtime = 'nodejs';
export const maxDuration = 35;

export async function POST(request: Request) {
  try {
    const config = await readModelSettingsRequest(request);
    const started = Date.now();
    const probe = new Request(request.url, { method: 'POST', body: '{}', signal: request.signal });
    const response = await handleAIRequest(probe, () => [{ role: 'user', content: '请仅回复 OK。' }], {
      config,
      timeoutMs: 30_000,
    });
    if (!response.ok) return response;
    try { await readAIResponse(response, () => {}); }
    catch (error) {
      throw new AIConfigError(error instanceof Error ? error.message : '模型连接测试失败。', 502);
    }
    return Response.json({ message: '连接成功，模型已返回有效响应。', latencyMs: Date.now() - started }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) { return modelSettingsError(error); }
}
