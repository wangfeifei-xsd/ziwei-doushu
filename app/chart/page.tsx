'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import BirthForm, { type BirthFormState } from '@/components/BirthForm';
import ChartBoard from '@/components/ChartBoard';
import InsightPanel from '@/components/InsightPanel';
import TimeNav, { type TimeView } from '@/components/TimeNav';
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
  const [view, setView] = useState<TimeView>('mingpan');
  const [liunianYear, setLiunianYear] = useState(() => new Date().getFullYear());
  const [loading, setLoading] = useState(Boolean(query));
  const [error, setError] = useState('');
  const [initialForm, setInitialForm] = useState<BirthFormState | undefined>();

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setChart(null);
    setSelectedPalace(null);
    setView('mingpan');
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

  // ── 未起盘：展示出生信息表单 ──
  if (!chart) {
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px' }}>
        <Link href="/qipan" className="mb-6 inline-block text-sm" style={{ color: 'var(--ac)' }}>← 返回起盘与档案</Link>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>紫微斗数排盘</h1>
        <p style={{ color: '#888', marginBottom: 32, fontSize: 14, lineHeight: 1.7 }}>
          输入出生年月日时，开源排盘引擎即时生成命盘。
          <br />
          （本页为引擎 Demo，完整商业版界面不在开源范围；排盘内核完全开放。）
        </p>
        {error && <p role="alert" className="mb-5 text-sm text-red-500">{error}</p>}
        <BirthForm key={JSON.stringify(initialForm)} initialData={initialForm} onSubmit={submit} />
      </main>
    );
  }

  // ── 已起盘：命盘 + 解读 ──
  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 16px' }}>
      <Link href="/qipan" className="mr-4 inline-block text-sm" style={{ color: 'var(--ac)' }}>← 起盘与档案</Link>
      <button
        type="button"
        onClick={() => {
          setChart(null); setSelectedPalace(null); setError('');
          setView('mingpan'); router.replace('/chart');
        }}
        style={{
          marginBottom: 16, padding: '6px 14px', cursor: 'pointer',
          border: '1px solid #ccc', borderRadius: 8, background: 'transparent',
        }}
      >
        ← 重新起盘
      </button>

      <TimeNav
        chart={chart}
        view={view}
        liunianYear={liunianYear}
        onViewChange={setView}
        onYearChange={setLiunianYear}
      />

      <div className="mt-4 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <ChartBoard chart={chart} onPalaceSelect={setSelectedPalace} />
        <InsightPanel chart={chart} selectedPalace={selectedPalace} />
      </div>
    </main>
  );
}

export default function ChartPage() {
  return <Suspense fallback={<p className="p-8" role="status">正在载入命盘…</p>}><ChartContent /></Suspense>;
}
