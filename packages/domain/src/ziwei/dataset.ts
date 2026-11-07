import type { BirthInfo, ZiweiChart } from './types';
import { TOPIC_LABEL, TOPIC_PALACE_NAME, type TopicKey } from './db-analysis';
import { detectPatterns } from './patterns';

export const DATASET_VERSION = 'ca268829f7a9';
export const DATASET_SOURCE = 'https://github.com/Renhuai123/ziwei-doushu/releases/tag/v4.0-13d';
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
export function datasetReferences(record: DatasetRecord, question: string, chart: ZiweiChart, topic?: string, palaceBranch?: number, budget=3600) {
  const hints: Partial<Record<TopicKey, RegExp>> = {career:/事业|工作|职业|官禄/,wealth:/钱|财|收入/,love:/感情|夫妻|婚|恋/,move:/迁移|外出|城市|搬家/,health:/健康|疾厄/,family:/兄弟|合伙/,children:/子女|孩子/,friends:/人际|朋友|贵人/,home:/房|田宅/,spirit:/福德|精神/,parents:/父母|长辈/,personality:/性格|脾气/};
  const palace = chart.palaces.find(p=>p.branch===palaceBranch)?.name;
  const topics=DATASET_TOPICS.map(key=>({key,score:(hints[key]?.test(question)?8:0)+(key===topic?3:0)+(TOPIC_PALACE_NAME[key]===palace?4:0)+(key==='overview'?1:0)})).sort((a,b)=>b.score-a.score).slice(0,3);
  const names=chart.palaces.flatMap(p=>p.stars.map(s=>s.name)).filter(n=>question.includes(n));
  const seen=new Set<string>();let used=0;
  const references=[];
  for(const {key} of topics){
    const candidates=datasetParagraphs(record,key).filter(p=>!p.flags.length && p.text.length>=35 && p.text.length<=1400)
      .sort((a,b)=>names.filter(n=>b.text.includes(n)).length-names.filter(n=>a.text.includes(n)).length);
    for(const p of candidates){if(seen.has(p.text)||used+p.text.length>budget)continue;seen.add(p.text);used+=p.text.length;
      references.push({...p,topic:key,version:DATASET_VERSION,birthKey:record.k,source:DATASET_SOURCE});if(references.length>=6)return references;}
  }
  return references;
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
