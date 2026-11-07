import type { BirthInfo } from './types';

export interface LearningCase {
  id: string;
  title: string;
  topic: string;
  birth: BirthInfo;
  summary: string;
  learningPoints: string[];
  questions: string[];
}

/** 教学用合成生辰；特点由真实排盘验证，不对应真实人物或人生经历。 */
export const LEARNING_CASES: readonly LearningCase[] = [
  {
    id: 'zifu', title: '紫府同宫', topic: '双星入门',
    birth: { year: 1983, month: 1, day: 6, hour: 4, gender: 'male' },
    summary: '紫微、天府同坐命宫，从一组双主星开始，练习由本宫看向三方四正。',
    learningPoints: ['紫微与天府的分工', '命、财、官、迁的联动', '格局成立与加减分条件'],
    questions: ['这张盘的紫微和天府在哪里？请一步步教我看紫府同宫。', '请带我找出命宫的三方四正，并解释各宫如何联动。', '紫府同宫有哪些成立条件？这张盘有哪些加分和限制？'],
  },
  {
    id: 'jiyuetongliang', title: '机月同梁', topic: '三方会照',
    birth: { year: 1992, month: 1, day: 16, hour: 1, gender: 'female' },
    summary: '天机坐命，天机、太阴、天同、天梁在命宫三方四正相会，练习跨宫看组合。',
    learningPoints: ['四颗星的实际落宫', '同宫与会照的区别', '辅星与煞曜的影响'],
    questions: ['请指出机月同梁四颗星各在哪一宫，为什么能组成会照？', '同宫和三方会照有什么区别？请用这张盘说明。', '这张盘的辅星和煞曜，会怎样修正机月同梁的解读？'],
  },
  {
    id: 'shapolang', title: '杀破狼', topic: '星系联动',
    birth: { year: 1978, month: 1, day: 6, hour: 0, gender: 'male' },
    summary: '七杀坐命，三方四正会见破军、贪狼，观察三颗主星不同的变化主题。',
    learningPoints: ['七杀、破军、贪狼的差异', '星系与单星的区别', '本命与运限分层'],
    questions: ['请用这张盘教我辨认杀破狼，三颗星各起什么作用？', '为什么不能看到七杀就直接断吉凶？还需要看哪些宫位？', '切换到大限时，哪些是本命信息，哪些是运限新增的信息？'],
  },
  {
    id: 'riyue', title: '日月同宫', topic: '亮度与四化',
    birth: { year: 1988, month: 2, day: 6, hour: 6, gender: 'female' },
    summary: '太阳、太阴同坐命宫，太阴带生年化禄，比较星曜亮度与四化的不同含义。',
    learningPoints: ['太阳与太阴的互补', '庙旺利陷的读法', '生年化禄的来源'],
    questions: ['太阳与太阴在这张盘中怎样同宫？两颗星的亮度如何理解？', '太阴为什么化禄？请区分生年四化和流年四化。', '日月同宫同时遇到擎羊时，应如何完整地分析？'],
  },
  {
    id: 'wutan', title: '武贪同宫', topic: '多重组合',
    birth: { year: 1995, month: 1, day: 26, hour: 6, gender: 'male' },
    summary: '武曲、贪狼同坐命宫，并见火星与武曲化科，练习分辨同一宫里的多重条件。',
    learningPoints: ['武曲与贪狼的组合', '化科与火星的不同层次', '财帛与官禄的交叉核对'],
    questions: ['请从星曜落宫开始，教我分析这张武贪同宫的模拟盘。', '武曲化科和火星同宫分别说明什么，能否直接判断财富？', '如何结合财帛宫和官禄宫，避免只看命宫就下结论？'],
  },
  {
    id: 'empty', title: '空宫借星', topic: '对宫关系',
    birth: { year: 1986, month: 1, day: 6, hour: 10, gender: 'female' },
    summary: '命宫没有十四主星，对宫有两颗主星；用这一盘练习借星与本宫辅煞的合看。',
    learningPoints: ['空宫不等于没有星', '对宫借星的边界', '本宫辅煞仍需核对'],
    questions: ['这张盘的命宫为什么叫空宫？应该向哪一宫借哪两颗主星？', '借来的主星和本宫实坐有什么区别？请结合这张盘解释。', '命宫里的左辅、文曲和陀罗，应如何与借星一起看？'],
  },
  {
    id: 'doublelu', title: '双禄会照', topic: '禄存与化禄',
    birth: { year: 1999, month: 1, day: 6, hour: 11, gender: 'male' },
    summary: '命宫三方四正同时见禄存与生年化禄，学习区分星曜、四化和组合条件。',
    learningPoints: ['禄存不是化禄', '两种禄的落宫关系', '成立条件与限制'],
    questions: ['请找出这张盘的禄存和化禄，它们怎样会照命宫？', '禄存和化禄有什么区别？为什么不能直接等同于有钱？', '这张盘的双禄会照还有哪些需要核对的限制条件？'],
  },
  {
    id: 'bodycareer', title: '身宫在官禄', topic: '命身分读',
    birth: { year: 1976, month: 1, day: 6, hour: 2, gender: 'female' },
    summary: '命宫与身宫分居两处，身宫落在官禄宫，练习从两个角度理解同一张盘。',
    learningPoints: ['命宫和身宫的区别', '身宫所落宫位', '大限中的观察重点'],
    questions: ['这张盘的命宫与身宫分别在哪？各自应如何解读？', '身宫在官禄宫意味着什么？还要结合哪些星曜？', '怎样把命宫、身宫和当前大限分层阅读，避免混为一谈？'],
  },
  {
    id: 'huaji', title: '天同化忌', topic: '四化辨析',
    birth: { year: 1990, month: 2, day: 6, hour: 11, gender: 'male' },
    summary: '天同在命宫带生年化忌，练习从四化来源、落宫与三方关系解释传统术语。',
    learningPoints: ['化忌的来源与落宫', '单一标记的解释边界', '生年忌与流年忌'],
    questions: ['这张盘的天同为什么化忌？请说明四化来源和落宫。', '如何理解天同化忌，又避免把它说成必然的不幸？', '如果切换流年，怎样分清生年化忌与流年化忌？'],
  },
  {
    id: 'huotan', title: '火贪同宫', topic: '条件辨格',
    birth: { year: 2001, month: 7, day: 21, hour: 2, gender: 'female' },
    summary: '贪狼与火星同坐命宫，并有廉贞，练习核对组合条件和其他星曜的修正作用。',
    learningPoints: ['火贪组合的事实依据', '廉贞同宫的影响', '格局名与具体判断的距离'],
    questions: ['请指出这张盘火星与贪狼的位置，并教我核对火贪组合。', '同宫还有廉贞，对火贪的解读有什么影响？', '看到火贪格还需要检查什么，为什么不能直接断定暴富？'],
  },
];

export function getLearningCase(id: unknown): LearningCase | undefined {
  return typeof id === 'string' ? LEARNING_CASES.find(item => item.id === id) : undefined;
}
