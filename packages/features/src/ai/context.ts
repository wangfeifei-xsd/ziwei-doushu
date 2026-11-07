import { ANALYSIS_TOPICS, analysisClock, type AnalysisSelection } from '@ziwei/domain/ai/analysis';
import { AIRequestError } from '@ziwei/domain/ai/errors';
import { BRANCHES, STEMS, PALACE_NAMES_ORDER } from '@ziwei/domain/ziwei/constants';
import { detectPatterns } from '@ziwei/domain/ziwei/patterns';
import { getDaXianSiHua, getLiuNianSiHua, getYearBranchIndex } from '@ziwei/domain/ziwei/sihua';
import { getDaXianIndexForYear, isChildhoodYear } from '@ziwei/domain/ziwei/yunxian-context';
import type { Palace, ZiweiChart } from '@ziwei/domain/ziwei/types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

export function shortString(value: unknown, max = 32): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function ageRange(value: unknown): boolean {
  return Array.isArray(value) && value.length === 2 && integer(value[0], 1, 300) && integer(value[1], value[0], 300);
}

function pillars(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.length === 4 && value.every(
    item => typeof item === 'string' && /^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/.test(item),
  ));
}

function validateChart(value: unknown): ZiweiChart {
  if (!isRecord(value) || !isRecord(value.birthInfo) || !Array.isArray(value.palaces) || value.palaces.length !== 12 ||
      !integer(value.mingGongBranch, 0, 11) || !integer(value.shenGongBranch, 0, 11)) {
    throw new AIRequestError('命盘数据不完整，请重新排盘后重试。');
  }
  const birth = value.birthInfo;
  if (!integer(birth.year, 1600, 2200) || !integer(birth.month, 1, 12) || !integer(birth.day, 1, 31) ||
      !integer(birth.hour, 0, 11) || !['male', 'female'].includes(String(birth.gender))) {
    throw new AIRequestError('命盘出生信息格式不正确，请重新排盘。');
  }
  const date = new Date(Date.UTC(birth.year, birth.month - 1, birth.day));
  if (date.getUTCMonth() !== birth.month - 1 || date.getUTCDate() !== birth.day) {
    throw new AIRequestError('命盘出生日期不存在，请重新排盘。');
  }
  if (birth.leapMonthPolicy !== undefined && !['split', 'next-month', 'prev-month', 'origin-month'].includes(String(birth.leapMonthPolicy))) {
    throw new AIRequestError('闰月排盘口径不正确，请重新排盘。');
  }
  const branches = new Set<number>();
  for (const palace of value.palaces) {
    if (!isRecord(palace) || !shortString(palace.name) || !integer(palace.branch, 0, 11) || !integer(palace.stem, 0, 9) ||
        branches.has(palace.branch) || !Array.isArray(palace.stars) || palace.stars.length > 64 ||
        (palace.daXianAge !== undefined && !ageRange(palace.daXianAge)) ||
        !palace.stars.every(star => isRecord(star) && shortString(star.name) &&
          ['major', 'minor', 'lucky', 'sha'].includes(String(star.type)) &&
          (star.siHua === undefined || star.siHua === '' || ['禄', '权', '科', '忌'].includes(String(star.siHua))) &&
          (star.brightness === undefined || ['bright', 'normal', 'dim'].includes(String(star.brightness))) &&
          (star.brightnessRaw === undefined || ['庙', '旺', '得', '利', '平', '不', '闲', '陷', '地'].includes(String(star.brightnessRaw))))) {
      throw new AIRequestError('十二宫或星曜数据格式不正确，请重新排盘。');
    }
    branches.add(palace.branch);
  }
  const lunar = value.lunarInfo;
  if (!isRecord(lunar) || !integer(lunar.lunarYear, 1599, 2201) || !integer(lunar.lunarMonth, 1, 12) ||
      !integer(lunar.lunarDay, 1, 30) || !integer(lunar.yearStem, 0, 9) || !integer(lunar.yearBranch, 0, 11) ||
      typeof lunar.isLeapMonth !== 'boolean' || !pillars(lunar.fourPillars) || !pillars(lunar.fourPillarsLunar)) {
    throw new AIRequestError('农历或四柱信息不完整，请重新排盘。');
  }
  if (!Array.isArray(value.daXians) || value.daXians.length > 12 || !value.daXians.every((dx, index, all) =>
    isRecord(dx) && ageRange([dx.startAge, dx.endAge]) && integer(dx.palaceBranch, 0, 11) &&
    (index === 0 || (dx.startAge as number) > all[index - 1].endAge))) {
    throw new AIRequestError('大限数据格式不正确，请重新排盘。');
  }
  return value as unknown as ZiweiChart;
}

function selectionContext(value: unknown, year: number): AnalysisSelection {
  if (value === undefined) return { view: 'mingpan', liunianYear: year };
  if (!isRecord(value) || !['mingpan', 'daxian', 'liunian'].includes(String(value.view)) ||
      !integer(value.liunianYear, 1600, 2200) ||
      (value.palaceBranch !== undefined && !integer(value.palaceBranch, 0, 11))) {
    throw new AIRequestError('分析视图或流年年份不正确，请重新选择。');
  }
  if (value.topic !== undefined && !ANALYSIS_TOPICS.some(topic => topic.key === value.topic)) {
    throw new AIRequestError('解读主题不正确，请重新选择。');
  }
  const siHua = value.siHua;
  if (siHua !== undefined && (!isRecord(siHua) || !shortString(siHua.starName) ||
      !['禄', '权', '科', '忌'].includes(String(siHua.siHua)) || siHua.view !== value.view)) {
    throw new AIRequestError('所选四化与当前视图不一致，请重新选择。');
  }
  return {
    view: value.view as AnalysisSelection['view'], liunianYear: value.liunianYear,
    topic: value.topic as AnalysisSelection['topic'],
    palaceBranch: value.palaceBranch as number | undefined,
    siHua: isRecord(siHua) ? { starName: String(siHua.starName), siHua: String(siHua.siHua), view: value.view as AnalysisSelection['view'] } : undefined,
  };
}

/** 显式白名单序列化。姓名、城市、客户端附加说明均不透传。 */
export function buildChartContext(value: unknown, selected?: unknown, now = new Date()) {
  const chart = validateChart(value);
  const clock = analysisClock(now);
  const selection = selectionContext(selected, clock.lunarYear);
  const birth = chart.birthInfo;
  const lunar = chart.lunarInfo;
  const currentAge = clock.lunarYear - lunar.lunarYear + 1;
  const currentDaXianIndex = getDaXianIndexForYear(chart, clock.lunarYear);
  const selectedDaXianIndex = getDaXianIndexForYear(chart, selection.liunianYear);
  const palaceAt = (branch: number) => chart.palaces.find(palace => palace.branch === (branch + 12) % 12)!;
  const palaceRef = (palace: Palace) => ({ name: palace.name, branch: BRANCHES[palace.branch] });
  const relations = (branch: number) => ({
    opposite: palaceRef(palaceAt(branch + 6)),
    trines: [palaceRef(palaceAt(branch + 4)), palaceRef(palaceAt(branch + 8))],
  });
  const periodPalaces = (mingBranch: number) => PALACE_NAMES_ORDER.map((name, index) => ({
    name, branch: BRANCHES[(mingBranch - index + 12) % 12],
    natalPalace: palaceAt(mingBranch - index).name,
  }));
  const transforms = (source: ReturnType<typeof getDaXianSiHua>) => source && ({
    stem: source.stemName,
    stars: Object.entries(source.transforms).map(([siHua, starName]) => ({
      siHua, starName, natalPalaces: chart.palaces.filter(p => p.stars.some(s => s.name === starName)).map(palaceRef),
    })),
  });
  const daXians = chart.daXians.map((dx, index) => ({
    index, startAge: dx.startAge, endAge: dx.endAge,
    startLunarYear: lunar.lunarYear + dx.startAge - 1, endLunarYear: lunar.lunarYear + dx.endAge - 1,
    palace: palaceRef(palaceAt(dx.palaceBranch)),
  }));
  const daXianContext = (index: number) => index < 0 ? null : ({
    ...daXians[index],
    palaces: periodPalaces(chart.daXians[index].palaceBranch),
    siHuaOverlay: transforms(getDaXianSiHua(chart, index)),
  });
  const annualContext = (year: number) => {
    const age = year - lunar.lunarYear + 1;
    return {
      year, age, ageBasis: '虚岁，按农历年差加一',
      status: age < 1 ? '出生前' : isChildhoodYear(chart, year) ? '童限，尚未进入首个大限' : '已出生',
      mingGongBranch: BRANCHES[getYearBranchIndex(year)],
      palaces: age < 1 ? [] : periodPalaces(getYearBranchIndex(year)),
      siHuaOverlay: age < 1 ? null : transforms(getLiuNianSiHua(year)),
    };
  };
  const currentDaXian = daXianContext(currentDaXianIndex);
  const selectedYear = annualContext(selection.liunianYear);
  const chosenTransforms = selection.view === 'daxian' ? currentDaXian?.siHuaOverlay : selectedYear.siHuaOverlay;
  if (selection.siHua) {
    const { starName, siHua } = selection.siHua;
    const exists = selection.view === 'mingpan'
      ? chart.palaces.some(p => p.stars.some(s => s.name === starName && s.siHua === siHua))
      : chosenTransforms?.stars.some(s => s.starName === starName && s.siHua === siHua);
    if (!exists) throw new AIRequestError('所选四化不属于当前运限，请重新选择。');
  }
  const original = birth.origInput;
  const originalClock = original && integer(original.year, 1600, 2200) && integer(original.month, 1, 12) &&
    integer(original.day, 1, 31) && integer(original.clockHour, 0, 23) && integer(original.clockMinute, 0, 59)
    ? { year: original.year, month: original.month, day: original.day, hour: original.clockHour, minute: original.clockMinute }
    : undefined;
  const context = {
    birth: {
      year: birth.year, month: birth.month, day: birth.day, hourBranch: BRANCHES[birth.hour], gender: birth.gender,
      dateBasis: '已完成起盘所需时辰及换日处理的公历排盘日', originalClock,
      leapMonthPolicy: (birth as unknown as Record<string, unknown>).leapMonthPolicy,
    },
    lunarInfo: {
      year: lunar.lunarYear, month: lunar.lunarMonth, day: lunar.lunarDay, isLeapMonth: lunar.isLeapMonth,
      yearStem: STEMS[lunar.yearStem], yearBranch: BRANCHES[lunar.yearBranch],
      fourPillars: lunar.fourPillars, fourPillarsLunar: lunar.fourPillarsLunar,
      fourPillarsBasis: 'fourPillars 为节气四柱，fourPillarsLunar 为农历四柱；顺序均为年/月/日/时，时刻按时辰中点近似',
    },
    wuxingJu: shortString(chart.wuxingJuName) ? chart.wuxingJuName : undefined,
    mingGongBranch: BRANCHES[chart.mingGongBranch], shenGongBranch: BRANCHES[chart.shenGongBranch],
    mingZhu: shortString(chart.mingZhu) ? chart.mingZhu : undefined,
    shenZhu: shortString(chart.shenZhu) ? chart.shenZhu : undefined,
    yinYangGender: ['阳男', '阴男', '阳女', '阴女'].includes(chart.yinYangGender ?? '') ? chart.yinYangGender : undefined,
    currentAge, ageBasis: '虚岁，按农历年差加一', currentDaXianIndex, daXians,
    palaces: chart.palaces.map(palace => {
      const isEmpty = !palace.stars.some(star => star.type === 'major');
      const opposite = palaceAt(palace.branch + 6);
      return {
        ...palaceRef(palace), stem: STEMS[palace.stem], daXianAge: palace.daXianAge?.slice(0, 2),
        isMingGong: palace.branch === chart.mingGongBranch, isShenGong: palace.branch === chart.shenGongBranch,
        isCurrentDaXian: currentDaXian?.palace.branch === BRANCHES[palace.branch],
        stars: palace.stars.map(star => ({ name: star.name, type: star.type, siHua: star.siHua || undefined, brightness: star.brightnessRaw ?? star.brightness })),
        sanFangSiZheng: relations(palace.branch), isEmpty,
        borrowedFrom: isEmpty ? palaceRef(opposite) : undefined,
        borrowedStars: isEmpty ? opposite.stars.filter(star => star.type === 'major').map(star => star.name) : undefined,
      };
    }),
    patterns: detectPatterns(chart).map(pattern => ({
      name: pattern.name, description: pattern.description, source: pattern.source,
      level: pattern.level, palaces: pattern.palaces, conditions: pattern.conditions,
    })),
    analysis: {
      ...clock, selection, currentDaXian,
      currentYear: selection.liunianYear === clock.lunarYear ? selectedYear : annualContext(clock.lunarYear),
      selectedYear, selectedYearDaXian: daXianContext(selectedDaXianIndex),
      selectedPalace: selection.palaceBranch === undefined ? undefined : palaceRef(palaceAt(selection.palaceBranch)),
      rules: {
        yearBoundary: '流年以农历正月初一换年；流年命宫取当年太岁地支，大限命宫取该限所在宫',
        siHua: '本命生年四化固定；siHuaOverlay 是页面按大限宫干或流年天干计算的独立叠层，必须标明来源，不能冒充本命四化',
        interpretation: '传统格局依本命星曜、宫位与三方四正；不自动引入宫干自化、来因宫等额外流派规则',
        coverage: '提供本命星曜、运限十二宫映射及四化叠层；未提供独立流曜和流月、流日、流时排盘，不据此断具体日期',
      },
    },
  };
  return { chart, context };
}
