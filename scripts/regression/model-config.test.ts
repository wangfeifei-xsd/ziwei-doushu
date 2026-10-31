import assert from 'node:assert/strict';
import { getAIEndpoint, parseAIConfig } from '../../lib/ai/config';

const input = { baseURL: 'https://models.example.com/v1', model: 'example-model', mode: 'chat', apiKey: 'test-secret' };
const chat = parseAIConfig(input);
assert.equal(getAIEndpoint(chat).href, 'https://models.example.com/v1/chat/completions');
const responses = parseAIConfig({ ...input, mode: 'responses' });
assert.equal(getAIEndpoint(responses).href, 'https://models.example.com/v1/responses');
assert.equal(parseAIConfig({ ...input, baseURL: ` ${input.baseURL}/// ` }).baseURL, input.baseURL);
assert.equal(parseAIConfig({ ...input, baseURL: 'http://127.0.0.1:8080/api' }).baseURL, 'http://127.0.0.1:8080/api');
assert.equal(parseAIConfig({ ...input, apiKey: '' }, 'existing-secret').apiKey, 'existing-secret');
assert.equal(parseAIConfig({ ...input, apiKey: undefined }, 'existing-secret').apiKey, 'existing-secret');
assert.equal(parseAIConfig({ ...input, apiKey: 'new-secret' }, 'existing-secret').apiKey, 'new-secret');
assert.throws(() => parseAIConfig({ ...input, apiKey: '' }, 'invalid\0existing-key'), /有效的 API Key/);

for (const invalid of [
  null, [], {},
  { ...input, baseURL: '' },
  { ...input, baseURL: 'not-a-url' },
  { ...input, baseURL: 'file:///private/data' },
  { ...input, baseURL: 'https://user:password@models.example.com/v1' },
  { ...input, baseURL: 'https://models.example.com/v1?api_key=secret' },
  { ...input, baseURL: 'https://models.example.com/v1#fragment' },
  ...['/chat/completions', '/responses', '/keys', '/api-keys'].map(suffix => ({ ...input, baseURL: input.baseURL + suffix })),
  { ...input, baseURL: input.baseURL + '\n' },
  { ...input, baseURL: 'https://models.example.com/' + 'a'.repeat(2048) },
  { ...input, model: '' },
  { ...input, model: 42 },
  { ...input, model: 'a'.repeat(201) },
  { ...input, model: 'model\nname' },
  { ...input, mode: 'unsupported' },
  { ...input, apiKey: '' },
  { ...input, apiKey: 'secret with spaces' },
  { ...input, apiKey: 'secret\r\nheader' },
  { ...input, apiKey: 'a'.repeat(4097) },
]) {
  assert.throws(() => parseAIConfig(invalid), Error);
}

console.log('✓ 模型配置回归通过：两种接口路径、地址校验、密钥保留与替换、字段类型和长度限制。');
