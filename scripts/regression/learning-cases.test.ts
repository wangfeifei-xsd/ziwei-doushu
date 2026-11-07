import assert from 'node:assert/strict';
import { LEARNING_CASES } from '@ziwei/domain/ziwei/learning-cases';
import { generateChart } from '@ziwei/domain/ziwei/algorithm';
import { interpretMessages } from '@ziwei/features/ai/prompts';

assert.equal(LEARNING_CASES.length, 10);
assert.equal(new Set(LEARNING_CASES.map(lesson => lesson.id)).size, 10);
assert.equal(new Set(LEARNING_CASES.map(lesson => JSON.stringify(lesson.birth))).size, 10);
for (const lesson of LEARNING_CASES) {
  const chart = generateChart({ ...lesson.birth });
  const ming = chart.palaces.find(p => p.branch === chart.mingGongBranch)!;
  const opposite = chart.palaces.find(p => p.branch === (ming.branch + 6) % 12)!;
  const stars = ming.stars.map(s => s.name);
  const sanfang = chart.palaces.filter(p => [ming.branch, (ming.branch + 4) % 12, (ming.branch + 6) % 12, (ming.branch + 8) % 12].includes(p.branch)).flatMap(p => p.stars);
  switch (lesson.id) {
    case 'zifu': assert.ok(['紫微', '天府'].every(s => stars.includes(s))); break;
    case 'jiyuetongliang': assert.ok(['天机', '太阴', '天同', '天梁'].every(s => sanfang.some(star => star.name === s))); break;
    case 'shapolang': assert.ok(stars.includes('七杀')); assert.ok(['七杀', '破军', '贪狼'].every(s => sanfang.some(star => star.name === s))); break;
    case 'riyue': assert.ok(['太阳', '太阴', '擎羊'].every(s => stars.includes(s))); assert.ok(ming.stars.some(s => s.name === '太阴' && s.siHua === '禄')); break;
    case 'wutan': assert.ok(['武曲', '贪狼', '火星'].every(s => stars.includes(s))); assert.ok(ming.stars.some(s => s.name === '武曲' && s.siHua === '科')); break;
    case 'empty': assert.ok(ming.stars.every(s => s.type !== 'major')); assert.equal(opposite.stars.filter(s => s.type === 'major').length, 2); break;
    case 'doublelu': assert.ok(sanfang.some(s => s.name === '禄存')); assert.ok(sanfang.some(s => s.siHua === '禄')); break;
    case 'bodycareer': assert.equal(chart.palaces.find(p => p.branch === chart.shenGongBranch)!.name, '官禄'); assert.notEqual(chart.mingGongBranch, chart.shenGongBranch); break;
    case 'huaji': assert.ok(ming.stars.some(s => s.name === '天同' && s.siHua === '忌')); break;
    case 'huotan': assert.ok(['火星', '贪狼', '廉贞'].every(s => stars.includes(s))); break;
    default: assert.fail(`未核验的教学例盘：${lesson.id}`);
  }
  const messages = interpretMessages({ chart, learningCaseId: lesson.id,
    selection: { view: 'liunian', liunianYear: 2027, palaceBranch: ming.branch },
    messages: [{ role: 'user', content: lesson.questions[0] }],
  });
  const context = JSON.parse(messages[1].content.split('\n').slice(1).join('\n'));
  assert.equal(context.learning.caseId, lesson.id);
  assert.deepEqual(context.learning.learningPoints, lesson.learningPoints);
  assert.equal(context.palaces.length, 12);
  assert.ok(context.daXians.length);
  assert.ok(context.references.entries.length);
  assert.equal(context.analysis.selection.liunianYear, 2027);
  assert.equal(context.analysis.selection.palaceBranch, ming.branch);
  assert.equal(Object.keys(context.learning.starBasics).length, 14);
  assert.match(messages[0].content, /这张模拟盘/);
  assert.equal(messages.at(-1)!.content, lesson.questions[0]);
}

const lesson = LEARNING_CASES[0];
const chart = generateChart({ ...lesson.birth });
const request = { chart, learningCaseId: lesson.id, messages: [{ role: 'user', content: '命宫有什么特点？' }] };
assert.throws(() => interpretMessages({ ...request, learningCaseId: 'missing' }), /示例不存在/);
assert.throws(() => interpretMessages({ ...request, learningCaseId: 1 }), /示例不存在/);
assert.throws(() => interpretMessages({ ...request, learningCaseId: LEARNING_CASES[1].id }), /不一致/);
assert.throws(() => interpretMessages({ ...request, chart: undefined }), /不一致/);
const tampered = structuredClone(chart);
tampered.palaces[0].stars.push({ name: '客户端伪造星', type: 'major' });
const messages = interpretMessages({ ...request, chart: tampered, learning: { title: '客户端伪造课程' } });
assert.ok(!messages[1].content.includes('客户端伪造'), '教学事实应由可信目录重新排盘');
const normal = interpretMessages({ chart, messages: request.messages });
assert.equal(JSON.parse(normal[1].content.split('\n').slice(1).join('\n')).learning, undefined, '普通排盘不应附带教学示例');
console.log('✓ 十组模拟生辰特点、学习上下文、错盘拒绝和重新排盘通过');
