import { parseProfileForm, type BirthProfile } from './ziwei/profiles';

export interface ProfileExportV1 {
  format: 'ziwei-profiles';
  version: 1;
  exportedAt: string;
  profiles: BirthProfile[];
}
export interface ImportSummary { added: number; skipped: number }
export function canonicalForm(input: unknown): string { return JSON.stringify(parseProfileForm(input)); }
export async function profileID(input: unknown): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalForm(input)));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function validateProfileExport(input: unknown): Promise<ProfileExportV1> {
  if (!input || typeof input !== 'object') throw new Error('不是有效的档案备份。');
  const data = input as Record<string, unknown>;
  if (data.format !== 'ziwei-profiles' || data.version !== 1 || !Array.isArray(data.profiles)
      || data.profiles.length > 10_000 || typeof data.exportedAt !== 'string' || !Number.isFinite(Date.parse(data.exportedAt))) {
    throw new Error('备份格式/版本不支持，或档案超过 10000 条。');
  }
  const profiles: BirthProfile[] = [];
  const ids = new Map<string, string>();
  for (const [index, raw] of data.profiles.entries()) {
    try {
      const profile = raw as BirthProfile;
      const form = parseProfileForm(profile.form);
      if (profile.id !== await profileID(form) || !Number.isSafeInteger(profile.savedAt) || profile.savedAt < 0) throw new Error('编号或保存时间无效');
      const canonical = canonicalForm(form);
      if (ids.has(profile.id) && ids.get(profile.id) !== canonical) throw new Error('编号内容冲突');
      ids.set(profile.id, canonical);
      profiles.push({ id: profile.id, form, savedAt: profile.savedAt });
    } catch (error) { throw new Error(`第 ${index + 1} 条档案：${error instanceof Error ? error.message : '格式无效'}`); }
  }
  return { format: 'ziwei-profiles', version: 1, exportedAt: data.exportedAt, profiles };
}
