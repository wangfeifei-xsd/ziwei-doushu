'use client';
import { useEffect, useState } from 'react';
import Link from '@ziwei/runtime/navigation';
import ChartBoard from '@ziwei/ui/components/ChartBoard';
import { generateChart } from '@ziwei/domain/ziwei/algorithm';
import { LEARNING_CASES, type LearningCase } from '@ziwei/domain/ziwei/learning-cases';
import { BRANCHES, SHICHEN } from '@ziwei/domain/ziwei/constants';
import { analysisClock, type AnalysisView, type SelectedSiHua } from '@ziwei/domain/ai/analysis';
import type { Palace } from '@ziwei/domain/ziwei/types';
import LearningChatPanel from '../components/LearningChatPanel';
import {datasetKey,datasetPath} from '@ziwei/domain/ziwei/dataset';

function LearningSession({ lesson, index, onSelect }: { lesson: LearningCase; index: number; onSelect: (id: string) => void }) {
  const [chart] = useState(() => generateChart({ ...lesson.birth }));
  const [view, setView] = useState<AnalysisView>('mingpan');
  const [year, setYear] = useState(() => analysisClock().lunarYear);
  const [palace, setPalace] = useState<Palace | null>(null);
  const [siHua, setSiHua] = useState<SelectedSiHua | null>(null);
  const { birth } = lesson;
  return <div className="learn-layout">
    <section className="learn-chart-side" aria-label="模拟命盘">
      <div className="learn-picker-heading"><h2>选择模拟命盘</h2><span>{String(index + 1).padStart(2, '0')} / 10</span></div>
      <div className="learn-cases" role="group" aria-label="十组模拟生辰">
        {LEARNING_CASES.map((item, i) => <button key={item.id} type="button" aria-pressed={item.id === lesson.id}
          onClick={() => onSelect(item.id)}><span>{String(i + 1).padStart(2, '0')}</span><strong>{item.title}</strong><small>{item.topic}</small></button>)}
      </div>
      <div className="learn-case-intro">
        <div className="learn-case-title"><h2>{lesson.title}</h2><span>模拟例盘 {String(index + 1).padStart(2, '0')}</span></div>
        <p className="learn-birth" aria-label="模拟生辰">公历 {birth.year} 年 {birth.month} 月 {birth.day} 日 · {SHICHEN[birth.hour].name} · {birth.gender === 'male' ? '男命' : '女命'}</p>
        <p className="learn-case-summary">{lesson.summary}</p>
        <ul className="learn-points" aria-label="本例学习要点">{lesson.learningPoints.map(point => <li key={point}>{point}</li>)}</ul>
      </div>
      <ChartBoard chart={chart} timeView={view} liunianYear={year}
        onTimeViewChange={next => { setView(next); setSiHua(null); }}
        onLiunianYearChange={next => { setYear(next); setSiHua(null); }}
        onPalaceSelect={next => { setPalace(next); setSiHua(null); }}
        onSiHuaClick={(starName, value, source) => { setSiHua({ starName, siHua: value as SelectedSiHua['siHua'], view: source }); }} />
      <div className="learn-chart-note"><span>命宫在{BRANCHES[chart.mingGongBranch]} · 身宫在{BRANCHES[chart.shenGongBranch]} · {chart.wuxingJuName}</span>
        <p><Link href={datasetPath(datasetKey(chart.birthInfo))}>阅读本盘十三专题资料 · 对照与练习 →</Link></p>
        <p>教学合成生辰，按所示公历排盘日与时辰起盘，未作真太阳时校正；子时日期已按排盘日表示。</p>
      </div>
    </section>
    <LearningChatPanel lesson={lesson} chart={chart} selection={{ view, liunianYear: year,
      ...(palace ? { palaceBranch: palace.branch } : {}), ...(siHua ? { siHua } : {}),
    }} />
  </div>;
}

export default function LearnPage() {
  const [ready, setReady] = useState(false);
  const [caseId, setCaseId] = useState(LEARNING_CASES[0].id);
  // 当前大限和流年在打开课堂时计算，避免静态 HTML 固定在构建日期。
  useEffect(() => { setReady(true); }, []);
  const index = LEARNING_CASES.findIndex(item => item.id === caseId);
  const lesson = LEARNING_CASES[index];
  return <main className="learn-main">
    <header className="learn-page-heading">
      <div><p className="eyebrow"><span />以盘为课 · 循理而学</p><h1>命盘学习</h1>
        <p>十组特色生辰，一边看盘，一边提问。从认识星曜，到理解它们的关系。</p></div>
      <Link href="/library" className="learn-library-link">查阅古籍 <span aria-hidden="true">↗</span></Link>
    </header>
    {/* 换盘重新创建完整会话：视图、输入、历史及未完成的请求都属于各自例盘。 */}
    {ready ? <LearningSession key={caseId} lesson={lesson} index={index} onSelect={setCaseId} />
      : <p role="status" className="learn-chart-note">正在准备模拟命盘…</p>}
  </main>;
}
