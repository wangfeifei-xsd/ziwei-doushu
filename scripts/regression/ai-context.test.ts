import assert from 'node:assert/strict';
import { astro } from 'iztro';
import { Lunar } from 'lunar-javascript';
import { analysisClock } from '@ziwei/domain/ai/analysis';
import { generateChart } from '@ziwei/domain/ziwei/algorithm';
import { BRANCHES } from '@ziwei/domain/ziwei/constants';
import { getParagraphById } from '@ziwei/content/classics';
import { classicsReferences } from '@ziwei/content/classics/references';
import { buildChartContext } from '@ziwei/features/ai/context';
import { interpretMessages, hemingMessages } from '@ziwei/features/ai/prompts';

const now = new Date('2026-11-07T04:00:00Z');
const birth = { year: 1990, month: 5, day: 10, hour: 4, gender: 'male' as const, name: '不得透传的姓名', city: '不得透传的城市' };
const chart = generateChart(birth);
const selection = { view: 'liunian', liunianYear: 2007 } as const;
const { context } = buildChartContext(chart, selection, now);
assert.equal(context.analysis.selection.liunianYear, 2007);
assert.equal(context.analysis.currentYear.year, 2026);
assert.equal(context.analysis.selectedYear.age, 18);
assert.ok(context.analysis.selectedYearDaXian);
assert.notEqual(context.analysis.selectedYearDaXian.index, context.analysis.currentDaXian?.index, '历史流年应使用当年所属大限');
assert.equal(context.analysis.selectedYearDaXian.startAge <= 18 && context.analysis.selectedYearDaXian.endAge >= 18, true);
assert.equal(context.analysis.selectedYear.mingGongBranch, '亥');

// 用排盘依赖的真实运限结果交叉验证十二宫映射（避免子起/寅起索引混淆）。
const astrolabe = astro.bySolar('1990-5-10', 4, '男', true, 'zh-CN');
for (const year of [2007, 2026, 2027]) {
  const solar = Lunar.fromYmd(year, 1, 1).getSolar();
  const expected = astrolabe.horoscope(`${solar.getYear()}-${solar.getMonth()}-${solar.getDay()}`);
  const actual = buildChartContext(chart, { view: 'liunian', liunianYear: year }, now).context;
  for (const palace of actual.analysis.selectedYear.palaces) {
    const index = astrolabe.palaces.findIndex(p => p.earthlyBranch === palace.branch);
    assert.equal(palace.name.replace('宫', '').replace('交友', '仆役'), expected.yearly.palaceNames[index].replace('宫', ''));
  }
  assert.deepEqual(actual.analysis.selectedYear.siHuaOverlay?.stars.map(s => s.starName), expected.yearly.mutagen);
}

assert.equal(context.lunarInfo.fourPillars?.length, 4);
assert.equal(context.lunarInfo.fourPillarsLunar?.length, 4);
assert.equal(context.mingZhu, chart.mingZhu);
assert.equal(context.shenZhu, chart.shenZhu);
assert.equal(context.daXians.length, chart.daXians.length);
for (const palace of context.palaces) {
  const branch = BRANCHES.indexOf(palace.branch);
  assert.equal(palace.sanFangSiZheng.opposite.branch, BRANCHES[(branch + 6) % 12]);
  assert.deepEqual(palace.sanFangSiZheng.trines.map(p => p.branch), [BRANCHES[(branch + 4) % 12], BRANCHES[(branch + 8) % 12]]);
  if (palace.isEmpty) {
    assert.equal(palace.borrowedFrom?.branch, palace.sanFangSiZheng.opposite.branch);
    const opposite = chart.palaces.find(p => p.branch === (branch + 6) % 12)!;
    assert.deepEqual(palace.borrowedStars, opposite.stars.filter(s => s.type === 'major').map(s => s.name));
  }
}
assert.ok(context.palaces.some(p => p.isEmpty), '样本覆盖空宫');
assert.ok(context.patterns.some(p => p.conditions?.required.length));
assert.ok(context.patterns.every(p => p.level && p.palaces));

// 春节前以农历年计算虚岁，不以公历元旦换运。
assert.equal(analysisClock(new Date('2026-02-16T04:00:00Z')).lunarYear, 2025);
assert.equal(analysisClock(new Date('2026-02-17T04:00:00Z')).lunarYear, 2026);
assert.equal(analysisClock(new Date('2026-02-16T17:00:00Z')).date, '2026-02-17');
const preSpringBirth = generateChart({ year: 2000, month: 1, day: 31, hour: 4, gender: 'female' });
assert.equal(buildChartContext(preSpringBirth, undefined, now).context.currentAge, 28);
const first = chart.daXians[0];
const childhoodYear = chart.lunarInfo.lunarYear + first.startAge - 2;
const childhood = buildChartContext(chart, { view: 'liunian', liunianYear: childhoodYear }, now).context;
assert.equal(childhood.analysis.selectedYearDaXian, null);
assert.match(childhood.analysis.selectedYear.status, /童限/);
const beforeBirth = buildChartContext(chart, { view: 'liunian', liunianYear: 1989 }, now).context;
assert.equal(beforeBirth.analysis.selectedYearDaXian, null);
assert.deepEqual(beforeBirth.analysis.selectedYear.palaces, []);
assert.equal(beforeBirth.analysis.selectedYear.siHuaOverlay, null);
const start = buildChartContext(chart, { view: 'liunian', liunianYear: childhoodYear + 1 }, now).context;
assert.equal(start.analysis.selectedYearDaXian?.index, 0);

const siHua = context.analysis.selectedYear.siHuaOverlay!.stars[0];
assert.doesNotThrow(() => buildChartContext(chart, { ...selection, siHua: { ...siHua, view: 'liunian' } }, now));
assert.throws(() => buildChartContext(chart, { ...selection, siHua: { starName: '不存在', siHua: '禄', view: 'liunian' } }, now), /不属于/);
assert.throws(() => buildChartContext(chart, { view: 'liunian', liunianYear: '2027' }, now), /年份/);
assert.throws(() => buildChartContext(chart, { ...selection, topic: 'invalid-topic' }, now), /主题/);
assert.throws(() => buildChartContext({ ...chart, birthInfo: { ...birth, month: 2, day: 30 } }, selection, now), /日期不存在/);
assert.throws(() => buildChartContext({ ...chart, daXians: [{ ...first, endAge: first.startAge - 1 }] }, selection, now), /大限/);
assert.throws(() => buildChartContext({ ...chart, lunarInfo: { ...chart.lunarInfo, fourPillars: ['伪造'] } }, selection, now), /四柱/);

const injected = { ...chart, notes: '不能透传的额外备注', lunarInfo: { ...chart.lunarInfo, extra: '不能透传的额外备注' } };
const history = Array.from({ length: 81 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: index === 80 ? '感情婚姻如何？' : `测试${index}` }));
const messages = interpretMessages({ chart: injected, selection, messages: history });
assert.equal(messages.length, history.length + 2);
assert.deepEqual(messages.slice(2), history, '当前会话的所有问答必须按原顺序保留，不能截成最近 20 条');
const payload = JSON.parse(messages[1].content.slice(messages[1].content.indexOf('\n') + 1));
assert.equal(payload.analysis.selection.liunianYear, 2007);
assert.doesNotMatch(messages[1].content, /不得透传|不能透传/);
assert.ok(payload.references.entries.length > 0);
assert.ok(payload.references.entries.some((entry: { chapterTitle: string }) => entry.chapterTitle.includes('夫妻')));
const selectedMessages = interpretMessages({
  chart, selection: { ...selection, topic: 'wealth', palaceBranch: 5, siHua: { ...siHua, view: 'liunian' } },
  messages: [{ role: 'user', content: '有哪些需要留意的地方？' }],
});
const selectedPayload = JSON.parse(selectedMessages[1].content.split('\n').slice(1).join('\n'));
assert.equal(selectedPayload.analysis.selection.topic, 'wealth');
assert.equal(selectedPayload.analysis.selection.palaceBranch, 5);
assert.equal(selectedPayload.analysis.selection.siHua.starName, siHua.starName);
assert.equal(selectedPayload.birth.year, birth.year);
assert.equal(selectedPayload.birth.gender, birth.gender);
assert.equal(selectedPayload.palaces.length, 12);
assert.equal(selectedMessages.at(-1)?.content, '有哪些需要留意的地方？', '所选内容不能替换手动问题');
const topicOnlyMessages = interpretMessages({
  chart, selection: { ...selection, topic: 'wealth' }, messages: [{ role: 'user', content: '有哪些需要留意的地方？' }],
});
const topicOnlyPayload = JSON.parse(topicOnlyMessages[1].content.split('\n').slice(1).join('\n'));
assert.ok(topicOnlyPayload.references.entries.some((entry: { chapterTitle: string }) => entry.chapterTitle.includes('财帛')), '泛指问题也应按所选主题检索资料');
assert.throws(() => interpretMessages({ chart, messages: [] }), /问题/);
assert.throws(() => interpretMessages({ chart, messages: [{ role: 'user', content: '   ' }] }), /聊天记录/);
assert.throws(() => interpretMessages({ chart, messages: [{ role: 'assistant', content: '上次回答' }] }), /用户问题/);
const references = classicsReferences([chart], '夫妻宫的感情婚姻');
assert.ok(references.entries.length <= 6);
assert.ok(references.entries.reduce((sum, entry) => sum + entry.text.length, 0) <= 3600);
for (const entry of references.entries) {
  const original = getParagraphById(entry.paragraphId)!;
  assert.ok(original.paragraph.text.startsWith(entry.text), '引用必须是库内真实文本');
  assert.equal(entry.path, `/library/${original.book.slug}/${original.chapterIdx}#${original.paragraph.id}`);
}
assert.notDeepEqual(classicsReferences([chart], '财帛宫的财运').entries, references.entries);
const heming = hemingMessages({ chartA: injected, chartB: preSpringBirth, question: '双方如何相处？' });
assert.match(heming[1].content, /参考条目/);
assert.match(heming[1].content, /currentDaXian/);
assert.doesNotMatch(heming[1].content, /不得透传|不能透传/);
console.log('✓ AI 上下文：完整本命字段、空宫/三方、历史流年与所属大限、春节/童限边界、四化来源、主题检索、引用溯源、合盘、完整会话历史与隐私白名单。');
