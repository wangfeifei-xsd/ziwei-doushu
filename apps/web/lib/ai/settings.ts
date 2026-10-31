import { defaultDataDir } from '../paths';
import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AIConfigError, parseAIConfig, type AIConfig, type ModelSettings } from '@ziwei/domain/ai/config';

function settingsDirectory() {
  return process.env.AI_CONFIG_DIR || process.env.H2_DATA_DIR || defaultDataDir();
}

export async function readAISettings(): Promise<{ config: AIConfig; source: ModelSettings['source'] }> {
  const file = path.join(settingsDirectory(), 'ai-config.json');
  let contents: string;
  try { contents = await readFile(/* turbopackIgnore: true */ file, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return {
      config: {
        baseURL: process.env.OPENAI_BASE_URL?.trim() || '',
        model: process.env.OPENAI_MODEL?.trim() || '',
        mode: (process.env.OPENAI_API_MODE?.trim() || 'chat') as AIConfig['mode'],
        apiKey: process.env.OPENAI_API_KEY?.trim() || '',
      },
      source: 'environment',
    };
  }
  try {
    const input=JSON.parse(contents);
    if(!input||['baseURL','model','apiKey'].some(key=>typeof input[key]!=='string'))throw new Error('Invalid settings');
    const config=parseAIConfig({...input,baseURL:input.baseURL||'https://incomplete.invalid',model:input.model||'incomplete'},'cleared-key-placeholder');
    config.baseURL=input.baseURL;config.model=input.model;
    if(input.apiKey==='')config.apiKey='';
    return { config, source: 'saved' };
  }
  catch { throw new AIConfigError('已保存的模型配置无法读取，请检查配置文件。', 503); }
}

export async function getAIConfig(): Promise<AIConfig> {
  const { config } = await readAISettings();
  try { return parseAIConfig(config); }
  catch (error) {
    throw new AIConfigError(error instanceof Error ? error.message : 'AI 服务尚未配置完成。', 503);
  }
}

export function modelSettingsForPage(config: AIConfig, source: ModelSettings['source']): ModelSettings {
  let configured = false;
  try { parseAIConfig(config); configured = true; } catch { /* Incomplete environment settings can still be edited. */ }
  return {
    baseURL: config.baseURL,
    model: config.model,
    mode: config.mode === 'responses' ? 'responses' : 'chat',
    apiKey: '',
    hasApiKey: Boolean(config.apiKey),
    configured,
    source,
  };
}

export async function saveAISettings(config: AIConfig): Promise<ModelSettings> {
  const validated = parseAIConfig(config);
  return writeSettings(validated);
}
export async function clearAIKey(): Promise<ModelSettings> {
  const {config}=await readAISettings();
  // Persist an explicit empty key, so environment fallback cannot silently reactivate it.
  return writeSettings({...config,apiKey:''});
}
async function writeSettings(validated: AIConfig): Promise<ModelSettings> {
  const directory = settingsDirectory();
  await mkdir(/* turbopackIgnore: true */ directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, 'ai-config.json');
  const temporary = path.join(directory, `.ai-config-${randomUUID()}.tmp`);
  try {
    await writeFile(/* turbopackIgnore: true */ temporary, `${JSON.stringify(validated, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    await rename(/* turbopackIgnore: true */ temporary, file);
  } finally {
    await rm(/* turbopackIgnore: true */ temporary, { force: true });
  }
  return modelSettingsForPage(validated, 'saved');
}
