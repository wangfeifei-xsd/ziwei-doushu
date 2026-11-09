import assert from 'node:assert/strict';
import { DEFAULT_AI_REQUEST_BYTES, DEFAULT_AI_TIMEOUT_SECONDS, getAIEndpoint, parseAIConfig } from '../../packages/domain/src/ai/config';
import { requestBody } from '@ziwei/features/ai/client';

const input = { baseURL: 'https://models.example.com/v1', model: 'example-model', mode: 'chat', apiKey: 'test-secret' };
const chat = parseAIConfig(input);
assert.equal(DEFAULT_AI_REQUEST_BYTES,16*1024*1024);
assert.equal(DEFAULT_AI_TIMEOUT_SECONDS,600);
assert.equal(chat.maxOutputTokens,undefined);
assert.equal(chat.maxRequestBytes,undefined);
assert.equal(chat.requestTimeoutSeconds,undefined);
const extended=parseAIConfig({...input,maxOutputTokens:32768,requestTimeoutSeconds:900,maxRequestBytes:32*1024*1024});
assert.equal(extended.maxOutputTokens,32768);
assert.equal(extended.requestTimeoutSeconds,900);
assert.equal(extended.maxRequestBytes,33554432);
assert.deepEqual(parseAIConfig({...extended,maxOutputTokens:null,requestTimeoutSeconds:null,maxRequestBytes:null}),chat,'null clears optional settings for old/new config interoperability');
for(const mode of ['chat','responses'] as const){
  const basic=requestBody(mode,'fixture',[{role:'user',content:'问题'}]);
  assert.equal('max_tokens' in basic,false);assert.equal('max_output_tokens' in basic,false);assert.equal('max_completion_tokens' in basic,false);
  const custom=requestBody(mode,'fixture',[{role:'user',content:'问题'}],extended);
  assert.equal(custom[mode==='chat'?'max_completion_tokens':'max_output_tokens'],32768);
  assert.equal('requestTimeoutSeconds' in custom,false);assert.equal('maxRequestBytes' in custom,false);
}
for(const [field,invalid] of [
  ['maxOutputTokens',[0,-1,1.5,Infinity,NaN,'32768',Number.MAX_SAFE_INTEGER+1]],
  ['requestTimeoutSeconds',[0,-1,0.5,2147484,'600']],
  ['maxRequestBytes',[0,1023,1024.5,2147483648,'16777216']],
] as const){for(const value of invalid)assert.throws(()=>parseAIConfig({...input,[field]:value}));}
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

console.log('✓ 模型配置：两种接口、地址/密钥校验、兼容旧配置、可选输出/超时/容量校验、未配置时省略输出参数。');
