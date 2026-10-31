'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import BirthForm, { type BirthFormState } from '@/components/BirthForm';
import ChartBoard from '@/components/ChartBoard';
import InsightPanel from '@/components/InsightPanel';
import { generateChart } from '@/lib/ziwei/algorithm';
import type { BirthInfo, ZiweiChart, Palace } from '@/lib/ziwei/types';
import { formToBirthInfo, searchParamsToForm } from '@/lib/ziwei/share';
import { isProfileId, parseProfileForm } from '@/lib/ziwei/profiles';

/**
 * 命盘页 —— 开源版「排盘引擎 Demo」
 *
 * 这是一个最小可运行示例：用本仓库的排盘引擎 generateChart() 配合基础 UI
 * 组件，渲染一张完整紫微命盘 + 基础解读，并支持本命 / 大限 / 流年切换。
 *
 * 说明：线上商业版的完整交互界面（重设计的新 UI、合盘图谱、分享
 * 卡片等）不在开源范围内；但排盘内核——安星算法、四化、格局识别、古籍库——
 * 完全开放（见 lib/ziwei/*），可自由二次开发出你自己的界面。
 */
function ChartContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const [chart, setChart] = useState<ZiweiChart | null>(null);
  const [selectedPalace, setSelectedPalace] = useState<Palace | null>(null);
  const [loading, setLoading] = useState(Boolean(query));
  const [error, setError] = useState('');
  const [initialForm, setInitialForm] = useState<BirthFormState | undefined>();

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setChart(null);
    setSelectedPalace(null);
    if (!query) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    const open = async () => {
      try {
        const params = new URLSearchParams(query);
        let input: unknown;
        if (params.has('profile')) {
          const id = params.get('profile') || '';
          if (!isProfileId(id)) throw new Error('档案编号无效，请返回起盘页重新选择。');
          const response = await fetch(`/api/profiles/${id}`, { cache: 'no-store', signal: controller.signal });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || '暂时无法读取档案。');
          input = data.profile.form;
        } else {
          input = searchParamsToForm(params);
        }
        const form = parseProfileForm(input);
        if (controller.signal.aborted) return;
        setInitialForm(form);
        setChart(generateChart(formToBirthInfo(form)));
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '起盘失败，请检查出生资料。');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void open();
    return () => controller.abort();
  }, [query]);

  const submit = (info: BirthInfo) => {
    try { setChart(generateChart(info)); setError(''); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '起盘失败，请检查出生资料。'); }
  };

  if (loading) {
    return <main className="mx-auto max-w-3xl px-5 py-12"><p role="status">正在读取出生资料并起盘…</p></main>;
  }

  if (!chart) {
    return (
      <main className="chart-form-main">
        <div className="chart-breadcrumb"><Link href="/qipan">紫微起盘</Link><span>/</span><span>生辰资料</span></div>
        <p className="eyebrow"><span />安星定宫 · 观照人生</p>
        <h1>开启你的紫微命盘</h1>
        <p className="chart-form-description">填写出生资料，以星曜为引，探索十二宫位中的人生图景。<br />支持真太阳时校正，让每一颗星各归其位。</p>
        {error && <p role="alert" className="mb-5 text-sm" style={{ color: 'var(--ji)' }}>{error}</p>}
        <BirthForm key={JSON.stringify(initialForm)} initialData={initialForm} onSubmit={submit} />
      </main>
    );
  }

  return (
    <main className="chart-main">
      <div className="chart-breadcrumb"><Link href="/qipan">紫微起盘</Link><span>/</span><span>我的命盘</span></div>
      <div className="chart-page-heading">
        <div>
          <h1>{chart.birthInfo.name ? `${chart.birthInfo.name}的` : '我的'}紫微命盘</h1>
          <p>公历 {chart.birthInfo.year} 年 {chart.birthInfo.month} 月 {chart.birthInfo.day} 日<span className="mx-2">·</span>{chart.birthInfo.gender === 'male' ? '男命' : '女命'}<span className="mx-2">·</span>{chart.wuxingJuName}</p>
        </div>
        <button type="button" className="chart-restart" onClick={() => {
          setChart(null); setSelectedPalace(null); setError(''); router.replace('/chart');
        }}>↻ 重新起盘</button>
      </div>
      <div className="chart-layout">
        <ChartBoard chart={chart} onPalaceSelect={setSelectedPalace} />
        <InsightPanel chart={chart} selectedPalace={selectedPalace} />
      </div>
    </main>
  );
}

export default function ChartPage() {
  return <Suspense fallback={<p className="p-8" role="status">正在载入命盘…</p>}><ChartContent /></Suspense>;
}
