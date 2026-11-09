export type AIAPIMode = 'chat' | 'responses';

export const DEFAULT_AI_REQUEST_BYTES = 16 * 1024 * 1024;
export const DEFAULT_AI_TIMEOUT_SECONDS = 600;
export interface AIRequestSettings {
  maxOutputTokens?: number;
  requestTimeoutSeconds?: number;
  maxRequestBytes?: number;
}

export interface AIConfig extends AIRequestSettings {
  baseURL: string;
  model: string;
  mode: AIAPIMode;
  apiKey: string;
}

export interface ModelSettings extends AIRequestSettings {
  baseURL: string;
  model: string;
  mode: AIAPIMode;
  apiKey: string;
  hasApiKey: boolean;
  configured: boolean;
  source: 'environment' | 'saved' | 'session';
  locked?: boolean;
  hasVault?: boolean;
}

export class AIConfigError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

/** Validate the complete configuration; a blank key preserves the existing secret. */
export function parseAIConfig(input: unknown, existingKey = ''): AIConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AIConfigError('模型配置必须是有效的对象。');
  }
  const value = input as Record<string, unknown>;
  const field = (name: string, label: string, limit: number) => {
    const raw = value[name];
    if (typeof raw !== 'string' || raw.length > limit || /[\x00-\x1f\x7f]/.test(raw)) {
      throw new AIConfigError(`${label}格式不正确。`);
    }
    return raw.trim();
  };
  const baseURL = field('baseURL', '接口地址', 2048).replace(/\/+$/, '');
  const model = field('model', '模型名称', 200);
  const apiKey = (value.apiKey === undefined ? '' : field('apiKey', 'API Key', 4096)) || existingKey;
  if (!apiKey || apiKey.length > 4096 || /[\s\x00-\x1f\x7f]/.test(apiKey)) throw new AIConfigError('请填写有效的 API Key。');
  if (!model) throw new AIConfigError('请填写模型名称。');
  if (value.mode !== 'chat' && value.mode !== 'responses') {
    throw new AIConfigError('请选择 Chat Completions 或 Responses 接口类型。');
  }
  let url: URL;
  try { url = new URL(baseURL); }
  catch { throw new AIConfigError('请输入有效的 HTTP 或 HTTPS 接口地址。'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new AIConfigError('接口地址仅支持 HTTP 或 HTTPS，不能包含账号、密码、查询参数或锚点。');
  }
  if (/\/(?:chat\/completions|responses|keys|api-keys)$/i.test(url.pathname)) {
    throw new AIConfigError('请填写 API Base URL（通常以 /v1 结尾），不要填写完整接口或密钥管理页面地址。');
  }
  const options: AIRequestSettings = {};
  for (const [key, label, min, max] of [
    ['maxOutputTokens', '输出 token 额度', 1, Number.MAX_SAFE_INTEGER],
    ['requestTimeoutSeconds', '请求超时秒数', 1, 2_147_483],
    ['maxRequestBytes', '请求容量字节数', 1024, 2_147_483_647],
  ] as const) {
    const number = value[key];
    if (number === undefined || number === null) continue;
    if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < min || number > max) {
      throw new AIConfigError(`${label}必须是 ${min}–${max} 范围内的整数。`);
    }
    options[key] = number;
  }
  return { baseURL, model, mode: value.mode, apiKey, ...options };
}

export function getAIEndpoint(config: AIConfig): URL {
  return new URL(`${config.baseURL}/${config.mode === 'responses' ? 'responses' : 'chat/completions'}`);
}
