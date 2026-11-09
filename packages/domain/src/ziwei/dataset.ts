import type { BirthInfo, ZiweiChart } from './types';
import { TOPIC_LABEL, type TopicKey } from './db-analysis';
import { detectPatterns } from './patterns';

export const DATASET_VERSION = 'ca268829f7a9';
export const DATASET_SOURCE = 'https://github.com/Renhuai123/ziwei-doushu/releases/tag/v4.0-13d';
export const DATASET_GENERATED_AT = '2026-10-15';
export const DATASET_ENGINE_COMMIT = 'c25dd495';
export const DATASET_TOPICS = Object.keys(TOPIC_LABEL) as TopicKey[];
export { TOPIC_LABEL };
export interface DatasetRecord { k: string; y: number; m: number; d: number; h: number; g: 'male' | 'female'; ms: string | null; t: Record<TopicKey, number>; c: Record<TopicKey, string> }
export interface DatasetQuery { year: number; offset?: number; limit?: number; topic?: TopicKey; text?: string; primaryStar?: string }
export interface DatasetPage { items: DatasetRecord[]; scanned: number; nextOffset: number | null; year: number }
export interface DatasetStatus { version: string; years: number; records: number; compressedBytes: number; cachedRecords: number; cacheLimit: number; mode: string }
export interface DatasetRepository {
  read(key: string, signal?: AbortSignal): Promise<DatasetRecord | null>;
  search(query: DatasetQuery, signal?: AbortSignal): Promise<DatasetPage>;
  status(signal?: AbortSignal): Promise<DatasetStatus>;
  clearCache(): Promise<void>;
}
export interface DatasetLoadStatus {
  person: '当前盘' | '甲方' | '乙方';
  key: string;
  status: '完整档案已加载' | '未找到同生辰记录' | '超出资料覆盖范围' | '资料不完整' | '资料暂不可用';
  reason?: string;
  integrity: { expectedTopics: number; actualTopics: number; sourceCharacters: number; injectedCharacters: number; complete: boolean };
}
export interface DatasetContext extends DatasetLoadStatus {
  version: string;
  generatedAt: string;
  engineCommit: string;
  source: string;
  licenses: { dataset: string; embeddedExcerpts: string };
  topics: { topic: TopicKey; title: string; text: string }[];
}
export function datasetLoadStatus(person: DatasetLoadStatus['person'], key: string, status: DatasetLoadStatus['status'], reason?: string): DatasetLoadStatus {
  return { person, key, status, ...(reason ? { reason } : {}), integrity: {
    expectedTopics: DATASET_TOPICS.length, actualTopics: 0, sourceCharacters: 0, injectedCharacters: 0, complete: false,
  } };
}

/** Preserve every source string, including headings, whitespace, repetitions and historical statements. */
export function fullDatasetContext(record: DatasetRecord, key: string, person: DatasetLoadStatus['person']): DatasetContext {
  const birth = datasetBirth(key);
  if (record.k !== key || record.y !== birth.year || record.m !== birth.month || record.d !== birth.day || record.h !== birth.hour || record.g !== birth.gender) {
    throw new Error('档案生辰不一致。');
  }
  const topics = DATASET_TOPICS.filter(topic => typeof record.c?.[topic] === 'string' && record.c[topic].trim().length > 0)
    .map(topic => ({ topic, title: TOPIC_LABEL[topic], text: record.c[topic] }));
  const complete = topics.length === DATASET_TOPICS.length;
  const sourceCharacters = topics.reduce((sum, item) => sum + item.text.length, 0);
  return {
    ...datasetLoadStatus(person, key, complete ? '完整档案已加载' : '资料不完整', complete ? undefined : '档案缺少专题正文，本次未注入档案。'),
    version: DATASET_VERSION, generatedAt: DATASET_GENERATED_AT, engineCommit: DATASET_ENGINE_COMMIT, source: DATASET_SOURCE,
    licenses: { dataset: 'CC BY 4.0', embeddedExcerpts: '《天纪》引文依 CC BY-NC-SA 4.0 单独授权' },
    integrity: { expectedTopics: DATASET_TOPICS.length, actualTopics: topics.length, sourceCharacters, injectedCharacters: complete ? sourceCharacters : 0, complete },
    topics: complete ? topics : [],
  };
}
export function datasetKey(b: BirthInfo): string { return `${b.year}-${String(b.month).padStart(2,'0')}-${String(b.day).padStart(2,'0')}-${b.hour}-${b.gender}`; }
export function datasetBirth(key: string): BirthInfo {
  const m = /^(\d{4})-(\d{2})-(\d{2})-(\d|1[01])-(male|female)$/.exec(key);
  if (!m) throw new Error('生辰键格式不正确。');
  const [year,month,day,hour] = m.slice(1,5).map(Number);
  const date = new Date(Date.UTC(year,month-1,day));
  if (year<1950 || year>2026 || date.getUTCFullYear()!==year || date.getUTCMonth()!==month-1 || date.getUTCDate()!==day) throw new Error('资料仅覆盖 1950–2026 年的真实公历日期。');
  return {year,month,day,hour,gender:m[5] as BirthInfo['gender']};
}
export function recordBirth(r: DatasetRecord): BirthInfo { return datasetBirth(r.k); }
export function paragraphFlags(text: string): string[] {
  const flags: string[] = [];
  if (/(?:19|20)\d{2}年?|当前|今年|明年|大限|流年|流月|流日|流时|\d+[–—-]\d+岁/.test(text)) flags.push('时间快照');
  if (/庙|旺|落陷|亮度|失辉|失陷|得地|平地/.test(text)) flags.push('旧版亮度');
  if (/天纪|倪师|倪海厦/.test(text)) flags.push('独立许可引文');
  return flags;
}
export function datasetParagraphs(record: DatasetRecord, topic: TopicKey) {
  return record.c[topic].split(/\n\s*\n/).map((text,index)=>({ id:`${record.k}/${topic}/${index}`, index, text:text.trim(), flags:paragraphFlags(text) })).filter(p=>p.text);
}
export function chartFeatures(chart: ZiweiChart) {
  const ming=chart.palaces.find(p=>p.isMingGong || p.branch===chart.mingGongBranch)!;
  return { key:datasetKey(chart.birthInfo), ming:ming.name, branch:chart.mingGongBranch,
    majors:ming.stars.filter(s=>s.type==='major').map(s=>s.name), bodyPalace:chart.palaces.find(p=>p.branch===chart.shenGongBranch)?.name || '',
    empty:!ming.stars.some(s=>s.type==='major'), patterns:detectPatterns(chart).map(p=>p.name),
    stars:chart.palaces.flatMap(p=>p.stars.map(s=>`${p.name}:${s.name}:${s.siHua||''}:${s.brightnessRaw||''}`)),
    transformations:chart.palaces.flatMap(p=>p.stars.filter(s=>s.siHua).map(s=>`${p.name}:${s.name}化${s.siHua}`)) };
}
export function compareCharts(a: ZiweiChart,b: ZiweiChart) {
  const x=chartFeatures(a),y=chartFeatures(b);const left=new Set(x.stars),right=new Set(y.stars);
  const shared=x.stars.filter(s=>right.has(s));
  return {a:x,b:y,shared,onlyA:x.stars.filter(s=>!right.has(s)),onlyB:y.stars.filter(s=>!left.has(s)),similarity:Math.round(shared.length/Math.max(1,new Set([...x.stars,...y.stars]).size)*100)};
}
export function chartExercises(chart: ZiweiChart) {
  const f=chartFeatures(chart);const ming=chart.palaces.find(p=>p.branch===chart.mingGongBranch)!;
  return [
    {id:'majors',question:'命宫实坐哪些十四主星？',answer:f.majors.join('、')||'无主星',explanation:'按当前盘面命宫的 major 星曜核对；借星不计作实坐。'},
    {id:'body',question:'身宫落在哪个宫位？',answer:f.bodyPalace,explanation:'按当前引擎的身宫地支与十二宫对应。'},
    {id:'opposite',question:'命宫对宫是什么宫？',answer:chart.palaces.find(p=>p.branch===(ming.branch+6)%12)!.name,explanation:'命宫地支加六取模，核对对宫。'},
    {id:'sihua',question:'请列出这张盘的生年四化。',answer:f.transformations.join('；'),explanation:'只读当前本命盘四化；不混入流年或大限叠层。'},
  ];
}
