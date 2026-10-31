import { preferences } from './preferences';
import { SCHOOL_DEFAULT_CONFIG, DEFAULT_LEAP_MONTH, normalizeBrightness, type SchoolConfig } from '@ziwei/domain/ziwei/school-config';
// ─── preferences 持久化 key ───────────────────────────────────────────
export const SCHOOL_CONFIG_LS_KEY = 'ziwei-school-config-v1';
/** 2026-09-05 闰月默认 prev-month→split 的一次性迁移标记（见 loadSchoolConfig） */
export const SCHOOL_LEAP_MIGRATED_KEY = 'ziwei-school-leap-split-migrated';

/**
 * ★ 2026-10-20 键名统一改名：早期版本存在 `ziwei-<旧名>-config-v1` / `ziwei-<旧名>-leap-split-migrated`。
 * 新键还没有时，把旧键里的流派配置（认 brightnessSchool 字段）与闰月迁移标记搬过来、删掉旧键；只认这两种形状，不碰别的键。
 */
function migrateLegacyKeys(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < preferences.length; i++) { const k = preferences.key(i); if (k) keys.push(k); }
    if (preferences.getItem(SCHOOL_CONFIG_LS_KEY) === null) {
      for (const k of keys) {
        if (k === SCHOOL_CONFIG_LS_KEY || !/^ziwei-[a-z]+-config-v1$/.test(k)) continue;
        const raw = preferences.getItem(k);
        let parsed: unknown = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch { /* 不是流派配置 */ }
        if (!parsed || typeof parsed !== 'object' || !('brightnessSchool' in parsed)) continue;
        preferences.setItem(SCHOOL_CONFIG_LS_KEY, raw as string);
        preferences.removeItem(k);
        break;
      }
    }
    for (const k of keys) {
      if (k === SCHOOL_LEAP_MIGRATED_KEY || !/^ziwei-[a-z]+-leap-split-migrated$/.test(k)) continue;
      if (preferences.getItem(SCHOOL_LEAP_MIGRATED_KEY) === null) preferences.setItem(SCHOOL_LEAP_MIGRATED_KEY, preferences.getItem(k) ?? '1');
      preferences.removeItem(k);
    }
  } catch { /* preferences 被禁：照旧走默认 */ }
}

/**
 * 读 preferences 配置（安全 fallback 到默认）
 * 浏览器端调用，服务端返回默认
 */
export function loadSchoolConfig(): SchoolConfig {
  if (typeof window === 'undefined') return SCHOOL_DEFAULT_CONFIG;
  migrateLegacyKeys();
  try {
    const raw = preferences.getItem(SCHOOL_CONFIG_LS_KEY);
    if (!raw) return SCHOOL_DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<SchoolConfig>;
    // ★ 2026-09-05 一次性迁移：旧默认 prev-month 是被整份存进 preferences 的（抽屉存完整配置），分不清「默认」还是「手选」；
    //   而旧选项本身就标着「默认」，选它的人要的也是对齐默认口径 → 统一迁到新默认 split，只迁一次（迁移标记），之后再手选 prev-month 就尊重
    if (parsed.leapMonth === 'prev-month' && !preferences.getItem(SCHOOL_LEAP_MIGRATED_KEY)) {
      parsed.leapMonth = DEFAULT_LEAP_MONTH;
      try { preferences.setItem(SCHOOL_LEAP_MIGRATED_KEY, '1'); preferences.setItem(SCHOOL_CONFIG_LS_KEY, JSON.stringify({ ...SCHOOL_DEFAULT_CONFIG, ...parsed })); } catch { /* noop */ }
    }
    return normalizeBrightness({ ...SCHOOL_DEFAULT_CONFIG, ...parsed });
  } catch {
    return SCHOOL_DEFAULT_CONFIG;
  }
}

/**
 * ★ 2026-10-18 默认项与它底层的那张表只留一项（站长：两项排出来一样，别并排摆）。
 * ★ 2026-10-20 默认改成《斗数全书》（主流排盘默认口径，见 algorithm.ts setBrightnessSchool），归并方向随之改：
 *   手选 QS（本机存的、分享链接 bs=QS）一律当默认，勾落在「《斗数全书》派（默认）」；
 *   XD2 不再归并——它现在是单独一项「现代修正 v2」，手选了就尊重。
 *   10-18 到 10-20 之间被归成 'default' 的老 XD2 选择分不出来，随默认一起变成全书（站长定：跟默认口径走）。
 */


/** 保存配置到 preferences */
export function saveSchoolConfig(cfg: SchoolConfig): void {
  if (typeof window === 'undefined') return;
  try {
    preferences.setItem(SCHOOL_CONFIG_LS_KEY, JSON.stringify(cfg));
  } catch { /* preferences 满或被禁 */ }
}

/** 重置为默认 */
export function resetSchoolConfig(): void {
  if (typeof window === 'undefined') return;
  try { preferences.removeItem(SCHOOL_CONFIG_LS_KEY); } catch { /* noop */ }
}
