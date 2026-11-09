export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class AIRequestError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

/** Classify provider errors without exposing raw messages or request contents. */
export function upstreamFailure(status: number, payload?: unknown): string {
  if (status === 401 || status === 403) return '模型服务认证失败，请检查 API Key 和模型访问权限。';
  if (status === 404) return '模型或接口不存在，请检查接口地址和模型名。';
  if (status === 429) return '模型服务额度不足或请求过于频繁，请检查额度后重试。';
  if (status === 413) return '模型服务拒绝了请求体大小，请调整服务商请求容量或更换模型服务；完整资料未裁剪。';
  const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const error = root.error && typeof root.error === 'object' ? root.error as Record<string, unknown> : root;
  const description = [error.code, error.type, error.param, error.message, typeof root.error === 'string' ? root.error : '']
    .filter(value => typeof value === 'string').join(' ').toLowerCase();
  if (/context_length|context_window|context window|maximum context|too many tokens|prompt.{0,30}too long|input.{0,30}too long|exceed.{0,30}context/.test(description)) {
    return '模型上下文容量不足，完整资料未裁剪。请选择支持更长上下文的模型后重试。';
  }
  if (/max_output_tokens|max_completion_tokens|max_tokens|output.{0,20}tokens/.test(description)) {
    return '模型输出 token 配置不兼容，请在模型配置中调整输出额度后重试。';
  }
  return '模型服务暂时不可用，请稍后重试。';
}
