import 'server-only';
import { AIConfigError, parseAIConfig } from '@ziwei/domain/ai/config';
import { readAISettings } from './settings';

export function assertSettingsOrigin(request: Request) {
  const origin = request.headers.get('origin');
  // Next.js can reconstruct request.url with its bind hostname instead of the browser's host.
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host')?.split(',')[0].trim() || request.headers.get('host') || url.host;
  const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || url.protocol.replace(':', '');
  if ((origin && origin !== `${protocol}://${host}`) || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new AIConfigError('请在本站模型配置页面提交设置。', 403);
  }
}
export async function readModelSettingsRequest(request: Request) {
  assertSettingsOrigin(request);
  if (!request.headers.get('content-type')?.includes('application/json')) {
    throw new AIConfigError('模型配置必须使用 JSON 提交。', 415);
  }
  if (Number(request.headers.get('content-length')) > 8192) throw new AIConfigError('模型配置内容过长。', 413);
  const text = await request.text();
  if (Buffer.byteLength(text) > 8192) throw new AIConfigError('模型配置内容过长。', 413);
  let input: unknown;
  try { input = JSON.parse(text); }
  catch { throw new AIConfigError('模型配置必须是有效的 JSON。'); }
  const { config } = await readAISettings();
  return parseAIConfig(input, config.apiKey);
}

export function modelSettingsError(error: unknown): Response {
  return Response.json({
    error: error instanceof AIConfigError ? error.message : '模型配置读写失败，请检查数据目录权限后重试。',
  }, {
    status: error instanceof AIConfigError ? error.status : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
