import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AIConfigError, parseAIConfig, type AIConfig, type ModelSettings } from './config';

function settingsDirectory() {
  return process.env.AI_CONFIG_DIR || process.env.H2_DATA_DIR || path.join(process.cwd(), 'data');
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
  try { return { config: parseAIConfig(JSON.parse(contents)), source: 'saved' }; }
  catch { throw new AIConfigError('已保存的模型配置无法读取，请检查配置文件。', 503); }
}

export async function getAIConfig(): Promise<AIConfig> {
  const { config } = await readAISettings();
  try { return parseAIConfig(config); }
  catch (error) {
    throw new AIConfigError(error instanceof Error ? error.message : 'AI 服务尚未配置完成。', 503);
  }
}

export function publicModelSettings(config: AIConfig, source: ModelSettings['source']): ModelSettings {
  let configured = false;
  try { parseAIConfig(config); configured = true; } catch { /* Incomplete environment settings can still be edited. */ }
  return {
    baseURL: config.baseURL,
    model: config.model,
    mode: config.mode === 'responses' ? 'responses' : 'chat',
    hasApiKey: Boolean(config.apiKey),
    configured,
    source,
  };
}

export async function saveAISettings(config: AIConfig): Promise<ModelSettings> {
  const validated = parseAIConfig(config);
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
  return publicModelSettings(validated, 'saved');
}
