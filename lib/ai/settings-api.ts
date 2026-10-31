import 'server-only';
import { AIConfigError, parseAIConfig } from './config';
import { readAISettings } from './settings';

export async function readModelSettingsRequest(request: Request) {
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new AIConfigError('请在本站模型配置页面提交设置。', 403);
  }
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
