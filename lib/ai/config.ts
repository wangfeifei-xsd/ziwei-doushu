export type AIAPIMode = 'chat' | 'responses';

export interface AIConfig {
  baseURL: string;
  model: string;
  mode: AIAPIMode;
  apiKey: string;
}

export interface ModelSettings {
  baseURL: string;
  model: string;
  mode: AIAPIMode;
  hasApiKey: boolean;
  configured: boolean;
  source: 'environment' | 'saved';
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
  if (!apiKey || /\s/.test(apiKey)) throw new AIConfigError('请填写有效的 API Key。');
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
  return { baseURL, model, mode: value.mode, apiKey };
}

export function getAIEndpoint(config: AIConfig): URL {
  return new URL(`${config.baseURL}/${config.mode === 'responses' ? 'responses' : 'chat/completions'}`);
}
