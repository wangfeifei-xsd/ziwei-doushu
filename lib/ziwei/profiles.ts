import type { BirthFormState } from '@/components/BirthForm';

export interface BirthProfile {
  id: string;
  form: BirthFormState;
  savedAt: number;
}

export function isProfileId(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

/** Keep the original clock input; apply chart date/time rules only when opening it. */
export function parseProfileForm(value: unknown): BirthFormState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('请填写完整的出生资料。');
  }
  const input = value as Record<string, unknown>;
  const text = (key: string, label: string) => {
    const result = input[key];
    if (typeof result !== 'string' || result.length > 80) {
      throw new Error(`${label}格式不正确，最多填写 80 个字。`);
    }
    return result.trim();
  };
  const integer = (key: string, label: string, min: number, max: number) => {
    const result = input[key];
    if (typeof result !== 'string' || !/^\d{1,4}$/.test(result)
      || Number(result) < min || Number(result) > max) {
      throw new Error(`请填写有效的${label}（${min}–${max}）。`);
    }
    return Number(result);
  };
  const year = integer('year', '年份', 1900, new Date().getFullYear());
  const month = integer('month', '月份', 1, 12);
  const day = integer('day', '日期', 1, 31);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`${year} 年 ${month} 月没有 ${day} 日，请检查出生日期。`);
  }
  const clockHour = integer('clockHour', '小时', 0, 23);
  const clockMinute = integer('clockMinute', '分钟', 0, 59);
  if (typeof input.unknownTime !== 'boolean') throw new Error('请选择是否知道出生时间。');
  if (input.gender !== 'male' && input.gender !== 'female') throw new Error('请选择有效的性别。');
  if (typeof input.longitude !== 'number' || !Number.isFinite(input.longitude)
    || input.longitude < -180 || input.longitude > 180) {
    throw new Error('出生地经度必须在 -180° 到 180° 之间。');
  }
  // A fixed field order makes identical, normalized forms share one archive ID.
  return {
    name: text('name', '姓名'),
    year: String(year), month: String(month), day: String(day),
    clockHour: String(clockHour), clockMinute: String(clockMinute),
    unknownTime: input.unknownTime,
    province: text('province', '省份'), city: text('city', '城市'),
    longitude: input.longitude, gender: input.gender,
  };
}
