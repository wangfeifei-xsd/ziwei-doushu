import { Solar } from 'lunar-javascript';

export type AnalysisView = 'mingpan' | 'daxian' | 'liunian';

export const ANALYSIS_TOPICS = [
  { key: 'overview', label: '命格' },
  { key: 'love', label: '感情' },
  { key: 'career', label: '事业' },
  { key: 'wealth', label: '财运' },
  { key: 'health', label: '健康' },
  { key: 'personality', label: '性格' },
] as const;

export type AnalysisTopic = typeof ANALYSIS_TOPICS[number]['key'];

export interface SelectedSiHua {
  starName: string;
  siHua: string;
  view: AnalysisView;
}

export interface AnalysisSelection {
  view: AnalysisView;
  /** 农历流年编号，以正月初一换年。 */
  liunianYear: number;
  topic?: AnalysisTopic;
  palaceBranch?: number;
  siHua?: SelectedSiHua;
}

/** Web 服务端与原生客户端使用同一时区，避免春节前把公历年份当成流年。 */
export function analysisClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (name: string) => Number(parts.find(part => part.type === name)!.value);
  const year = get('year'), month = get('month'), day = get('day');
  return {
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    timeZone: 'Asia/Shanghai',
    lunarYear: Solar.fromYmd(year, month, day).getLunar().getYear(),
  };
}
