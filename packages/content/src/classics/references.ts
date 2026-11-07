import type { ZiweiChart } from '@ziwei/domain/ziwei/types';
import { ALL_BOOKS } from './index';

const TOPIC_TERMS: [RegExp, string][] = [
  [/感情|婚姻|夫妻|恋爱|合盘/, '夫妻'], [/事业|工作|职业|官禄/, '官禄'],
  [/财运|财富|收入|财帛|理财/, '财帛'], [/健康|疾厄/, '疾厄'],
  [/房产|田宅|财库/, '田宅'], [/性格|命格|总览|命宫/, '命宫'],
  [/人际|朋友|交友|仆役/, '交友'], [/子女|孩子/, '子女'],
  [/父母|长辈/, '父母'], [/迁移|外出/, '迁移'], [/福德|精神/, '福德'],
];

/** 有界的本地检索；按本次问题和重点宫位选取，不能把全库当作当前命盘事实。 */
export function classicsReferences(charts: ZiweiChart[], question: string, palaceBranch?: number) {
  const terms = new Map<string, number>();
  const add = (term: string, weight: number) => terms.set(term, Math.max(terms.get(term) ?? 0, weight));
  const topics = TOPIC_TERMS.filter(([pattern]) => pattern.test(question)).map(([, term]) => term);
  topics.forEach(term => add(term, 6));
  for (const chart of charts) {
    const focused = chart.palaces.filter(palace => palace.branch === palaceBranch ||
      topics.some(topic => palace.name.replace('宫', '').replace('仆役', '交友') === topic.replace('宫', '')));
    if (!focused.length) focused.push(chart.palaces.find(palace => palace.branch === chart.mingGongBranch)!);
    for (const palace of focused) {
      add(palace.name.replace('宫', '').replace('仆役', '交友'), 6);
      const starPalace = palace.stars.some(star => star.type === 'major') ? palace
        : chart.palaces.find(other => other.branch === (palace.branch + 6) % 12)!;
      starPalace.stars.filter(star => star.type === 'major').forEach(star => add(star.name, 3));
    }
    chart.palaces.flatMap(p => p.stars).forEach(star => {
      if (question.includes(star.name)) add(star.name, 8);
    });
  }
  for (const term of ['化禄', '化权', '化科', '化忌', '三方四正', '大限', '流年', '空宫']) {
    if (question.includes(term)) add(term, 4);
  }
  const ranked = ALL_BOOKS.flatMap(book => book.chapters.flatMap((chapter, chapterIndex) => chapter.paragraphs.map(paragraph => ({
    bookTitle: book.title, chapterTitle: chapter.title, paragraphId: paragraph.id,
    path: `/library/${book.slug}/${chapterIndex}#${paragraph.id}`,
    text: paragraph.text,
    score: [...terms].reduce((score, [term, weight]) => score +
      (paragraph.text.includes(term) ? weight : 0) + (chapter.title.includes(term) ? weight * 2 : 0), 0),
  })))).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.paragraphId.localeCompare(b.paragraphId));
  const perChapter = new Map<string, number>();
  let remaining = 3600;
  const entries = [];
  for (const item of ranked) {
    const key = `${item.bookTitle}/${item.chapterTitle}`;
    if ((perChapter.get(key) ?? 0) >= 2) continue;
    const text = item.text.slice(0, Math.min(720, remaining));
    entries.push({ bookTitle: item.bookTitle, chapterTitle: item.chapterTitle, paragraphId: item.paragraphId,
      path: item.path, text, truncated: text.length < item.text.length });
    remaining -= text.length;
    perChapter.set(key, (perChapter.get(key) ?? 0) + 1);
    if (entries.length >= 6 || remaining < 100) break;
  }
  return {
    source: '仓库古籍整理条目，含摘录与现代说明；未逐字校勘原典',
    entries,
  };
}
