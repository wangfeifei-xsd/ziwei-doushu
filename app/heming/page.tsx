'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import BirthForm, { type BirthFormState } from '@/components/BirthForm';
import { formToBirthInfo } from '@/lib/ziwei/share';
import { generateChart as buildChart } from '@/lib/ziwei/algorithm';
import type { BirthInfo, ZiweiChart } from '@/lib/ziwei/types';
import { useTheme } from '@/components/ThemeProvider';
import { readAIResponse } from '@/lib/ai/stream';
import type { BirthProfile } from '@/lib/ziwei/profiles';

function SavedProfileSelect({ side, profiles, selectedId, loading, onSelect }: {
  side: 'a' | 'b';
  profiles: BirthProfile[];
  selectedId?: string;
  loading: boolean;
  onSelect: (profile: BirthProfile | null) => void;
}) {
  const id = `heming-profile-${side}`;
  return (
    <div style={{ marginBottom: '16px' }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: '12px', color: 'var(--tx-2)', marginBottom: '8px' }}>
        从已保存档案选择
      </label>
      <select
        id={id}
        aria-label={`${side === 'a' ? '甲' : '乙'}方选择已保存档案`}
        value={selectedId ?? ''}
        disabled={loading || (profiles.length === 0 && !selectedId)}
        onChange={event => onSelect(profiles.find(profile => profile.id === event.target.value) ?? null)}
        className="input-base"
        style={{ width: '100%', minWidth: 0, fontSize: '13px', textOverflow: 'ellipsis' }}
      >
        <option value="">{loading ? '正在读取档案…' : '手动填写出生信息'}</option>
        {selectedId && !profiles.some(profile => profile.id === selectedId) && (
          <option value={selectedId}>已填入的档案资料（原档案已移除）</option>
        )}
        {profiles.map(({ id: profileId, form }) => (
          <option key={profileId} value={profileId}>
            {form.name || '未命名档案'} · {form.gender === 'male' ? '男' : '女'} · {form.year}/{form.month}/{form.day}
            {' · '}{form.unknownTime ? '时辰不详' : `${form.clockHour.padStart(2, '0')}:${form.clockMinute.padStart(2, '0')}`}
          </option>
        ))}
      </select>
      {selectedId && <p style={{ marginTop: '8px', fontSize: '11px', color: 'var(--tx-3)', lineHeight: 1.6 }}>
        已填入档案资料，可继续修改。
      </p>}
    </div>
  );
}

// ─── AiContent 渲染器（与 InsightPanel 一致）────────────────
function AiContent({ text, streaming }: { text: string; streaming?: boolean }) {
  const lines = text.split('\n');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {lines.map((line, i) => {
        const sectionMatch = line.match(/^\*\*【(.+?)】\*\*$/);
        if (sectionMatch) {
          return (
            <div key={i} style={{ paddingTop: i === 0 ? 0 : '14px', paddingBottom: '4px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ac)', letterSpacing: '0.04em' }}>
                【{sectionMatch[1]}】
              </span>
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} style={{ height: '4px' }} />;
        const parts = line.split(/\*\*(.+?)\*\*/);
        return (
          <div key={i} style={{ fontSize: '13px', lineHeight: 1.75, color: 'var(--tx-2)' }}>
            {parts.map((part, j) =>
              j % 2 === 0
                ? part
                : <strong key={j} style={{ fontWeight: 500, color: 'var(--tx-0)' }}>{part}</strong>
            )}
          </div>
        );
      })}
      {streaming && (
        <span style={{
          display: 'inline-block', width: '7px', height: '13px',
          background: 'var(--ac)', opacity: 0.5, borderRadius: '2px',
          animation: 'pulse 1s ease-in-out infinite',
          verticalAlign: 'middle', marginLeft: '2px',
        }} />
      )}
    </div>
  );
}

export default function HemingPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // ─── 双方命盘状态 ─────────────────────────────────────────
  const [chartA, setChartA] = useState<ZiweiChart | null>(null);
  const [chartB, setChartB] = useState<ZiweiChart | null>(null);
  // 双方表单状态由 BirthForm onFormSave 同步到此处，统一按钮触发起盘
  const [formA, setFormA] = useState<BirthFormState | null>(null);
  const [formB, setFormB] = useState<BirthFormState | null>(null);
  const [profiles, setProfiles] = useState<BirthProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profilesError, setProfilesError] = useState('');
  const [profileA, setProfileA] = useState<BirthProfile | null>(null);
  const [profileB, setProfileB] = useState<BirthProfile | null>(null);

  const loadProfiles = useCallback(async (signal?: AbortSignal) => {
    setProfilesLoading(true);
    setProfilesError('');
    try {
      const response = await fetch('/api/profiles', { cache: 'no-store', signal });
      if (!response.ok) throw new Error('Profile load failed');
      const data: { profiles: BirthProfile[] } = await response.json();
      setProfiles(data.profiles);
    } catch {
      if (!signal?.aborted) setProfilesError('暂时无法读取已保存的档案，请重试或手动填写。');
    } finally {
      if (!signal?.aborted) setProfilesLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadProfiles(controller.signal);
    return () => controller.abort();
  }, [loadProfiles]);

  // ─── AI 合盘分析状态 ─────────────────────────────────────
  const [analysis, setAnalysis] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [question, setQuestion] = useState('');
  const [analysisError, setAnalysisError] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const analysisRef = useRef<HTMLDivElement>(null);

  const resetAnalysis = useCallback(() => {
    setAnalysis('');
    setAnalysisError('');
    setFormError(null);
    setQuestion('');
  }, []);

  const updateFormA = useCallback((form: BirthFormState) => {
    setFormA(form);
    setChartA(null);
    resetAnalysis();
  }, [resetAnalysis]);

  const updateFormB = useCallback((form: BirthFormState) => {
    setFormB(form);
    setChartB(null);
    resetAnalysis();
  }, [resetAnalysis]);

  // ─── 起盘（单次调用，返回 chart 给统一流程使用）──────────
  // 开源版不含后端 /api/generate：直接用本仓库的排盘引擎在浏览器里起盘
  const generateChart = useCallback(async (info: BirthInfo): Promise<ZiweiChart | null> => {
    try {
      return buildChart(info);
    } catch {
      return null;
    }
  }, []);

  // 表单是否填齐
  const isFormReady = (f: BirthFormState | null): boolean =>
    !!(f && f.year && f.month && f.day && f.gender && (f.unknownTime || (f.clockHour !== '' && f.clockMinute !== '')));

  // ─── 统一入口：起盘 + 合盘分析 ─────────────────────────────
  const runAnalysis = useCallback(async (q?: string) => {
    setFormError(null);
    if (!isFormReady(formA) || !isFormReady(formB)) {
      setFormError('请先填写双方完整出生信息');
      return;
    }
    setAnalyzing(true);
    setAnalysis('');
    setAnalysisError('');

    try {
      // 并行起两张盘（如果还没起）
      let cA = chartA;
      let cB = chartB;
      const [newA, newB] = await Promise.all([
        cA ? Promise.resolve(cA) : generateChart(formToBirthInfo(formA!)),
        cB ? Promise.resolve(cB) : generateChart(formToBirthInfo(formB!)),
      ]);
      cA = newA;
      cB = newB;
      if (!cA || !cB) {
        setAnalysisError('无法生成双方命盘，请检查出生信息后重试。');
        setAnalyzing(false);
        return;
      }
      if (!chartA) setChartA(cA);
      if (!chartB) setChartB(cB);

      const res = await fetch('/api/heming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartA: cA, chartB: cB, question: q ?? undefined }),
      });
      await readAIResponse(res, setAnalysis);
      // scroll to analysis
      setTimeout(() => analysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : '分析暂时不可用，请重试。');
    } finally {
      setAnalyzing(false);
    }
  }, [chartA, chartB, formA, formB, generateChart]);

  const cardStyle = {
    minWidth: 0,
    background: 'var(--bg-card)',
    border: '1px solid var(--bdr-med)',
    borderRadius: '16px',
    padding: '24px',
  };

  const labelStyle = {
    fontSize: '10px', letterSpacing: '0.4em', color: 'var(--ac)', opacity: 0.7,
    marginBottom: '16px', display: 'block',
  };

  return (
    <div className="heming-page" style={{ minHeight: '100vh', background: 'var(--bg-0)' }}>
      {/* 主体 */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px 80px' }}>

        {/* 标题 */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{ fontSize: '28px', color: 'var(--ac)', opacity: 0.15, marginBottom: '12px' }}>☯</div>
          <h1 style={{ fontSize: '34px', fontWeight: 500, letterSpacing: '0.15em', color: 'var(--tx-0)', marginBottom: '8px' }}>
            紫微合盘
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--tx-3)', lineHeight: 1.6 }}>
            选择已保存的档案或输入两个人的出生信息，AI 基于倪海厦体系分析双方命盘的缘分匹配度、感情走向与相处建议
          </p>
        </div>

        <div style={{ marginBottom: '16px', fontSize: '12px', color: 'var(--tx-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <span role="status">
              {profilesLoading ? '正在读取已保存的档案…' : profilesError
                ? '可先手动填写双方资料。' : profiles.length > 0
                ? '甲方和乙方可分别选择档案，或手动填写。'
                : '还没有保存的档案，可手动填写双方资料。'}
            </span>
            <button type="button" onClick={() => void loadProfiles()} disabled={profilesLoading || analyzing}
              style={{ flexShrink: 0, color: 'var(--ac)', cursor: profilesLoading || analyzing ? 'wait' : 'pointer' }}>
              {profilesLoading ? '读取中…' : '刷新档案'}
            </button>
          </div>
          {profilesError && <p role="alert" style={{ marginTop: '8px', color: isDark ? '#f87171' : '#dc2626' }}>{profilesError}</p>}
          <Link href="/profiles" style={{ display: 'inline-block', marginTop: '8px', color: 'var(--ac)' }}>
            管理出生档案 →
          </Link>
        </div>

        {/* 双栏表单 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}
          className="heming-grid">
          {/* 甲方 */}
          <div style={cardStyle}>
            <span style={labelStyle}>甲方 — A</span>
            <fieldset disabled={analyzing} style={{ minWidth: 0 }}>
              <SavedProfileSelect side="a" profiles={profiles} selectedId={profileA?.id} loading={profilesLoading}
                onSelect={profile => {
                  setProfileA(profile);
                  setFormA(profile?.form ?? null);
                  setChartA(null);
                  resetAnalysis();
                }} />
              <BirthForm
                key={profileA?.id ?? 'manual'}
                initialData={profileA?.form}
                hideSubmit
                onSubmit={() => {}}
                onFormSave={updateFormA}
              />
            </fieldset>
          </div>

          {/* 乙方 */}
          <div style={cardStyle}>
            <span style={labelStyle}>乙方 — B</span>
            <fieldset disabled={analyzing} style={{ minWidth: 0 }}>
              <SavedProfileSelect side="b" profiles={profiles} selectedId={profileB?.id} loading={profilesLoading}
                onSelect={profile => {
                  setProfileB(profile);
                  setFormB(profile?.form ?? null);
                  setChartB(null);
                  resetAnalysis();
                }} />
              <BirthForm
                key={profileB?.id ?? 'manual'}
                initialData={profileB?.form}
                hideSubmit
                onSubmit={() => {}}
                onFormSave={updateFormB}
              />
            </fieldset>
          </div>
        </div>

        {/* ═══ 大合盘分析框（视觉中心，始终显示）════════════════ */}
        <div ref={analysisRef} style={{
          ...cardStyle,
          minHeight: '320px',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: (!analysis && !analyzing) ? 'center' : 'flex-start',
        }}>
          {/* 区块标题 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: (analysis || analyzing) ? '20px' : '24px' }}>
            <span style={{ color: 'var(--ac)', opacity: 0.6 }}>◉</span>
            <span style={{ fontSize: '11px', letterSpacing: '0.3em', color: 'var(--tx-3)' }}>合盘分析 · HEMING</span>
          </div>

          {/* 状态分支 */}
          {!analysis && !analyzing && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: '13px', color: 'var(--tx-3)', marginBottom: '24px', lineHeight: 1.7 }}>
                选择档案或填好双方出生信息后，点击下方按钮<br />
                AI 将基于倪海厦体系深度分析两人缘分匹配度
              </div>
              <button
                onClick={() => runAnalysis()}
                style={{
                  padding: '14px 40px', borderRadius: 'var(--r-pill)', border: 'none',
                  background: 'linear-gradient(135deg, #9a6210, #c88020)',
                  color: '#fff8e8', fontSize: '14px', fontWeight: 600,
                  letterSpacing: '0.15em', cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(140,100,20,0.25)',
                  transition: 'transform 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
              >
                开始合盘分析
              </button>
              {formError && (
                <div style={{ marginTop: '20px', fontSize: '13px', color: '#dc2626' }}>
                  {formError}
                </div>
              )}
            </div>
          )}

          {analyzing && !analysis && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '40px 0', color: 'var(--tx-3)', fontSize: '13px' }}>
              <div style={{
                width: '14px', height: '14px',
                border: '2px solid var(--bdr-med)', borderTopColor: 'var(--ac)',
                borderRadius: '50%', animation: 'spin 0.8s linear infinite',
              }} />
              正在对比双方命盘…
            </div>
          )}

          {analysis && <AiContent text={analysis} streaming={analyzing} />}

          {analysisError && (
            <div style={{ padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--bdr)', background: 'var(--bg-card)', fontSize: '13px', color: 'var(--tx-2)', marginTop: '12px' }}>
              {analysisError}
            </div>
          )}
        </div>

        {/* ═══ 针对合盘的追问聊天框（仅分析完成后显示）═══════════ */}
        {analysis && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
            <div style={{ fontSize: '11px', letterSpacing: '0.2em', color: 'var(--tx-3)', marginBottom: '4px' }}>
              针对此次合盘继续追问
            </div>

            {/* 快捷问题 */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                '感情匹配度如何？',
                '适合合伙创业吗？',
                '两人结婚是否合适？',
                '哪方面最容易产生矛盾？',
                '财运是否互补？',
              ].map(q => (
                <button
                  key={q}
                  onClick={() => { setQuestion(q); runAnalysis(q); }}
                  disabled={analyzing}
                  style={{
                    fontSize: '12px', padding: '6px 14px',
                    borderRadius: 'var(--r-pill)',
                    border: '1px solid var(--bdr-med)',
                    background: 'transparent', color: 'var(--tx-2)',
                    cursor: analyzing ? 'not-allowed' : 'pointer',
                    opacity: analyzing ? 0.5 : 1,
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => { if (!analyzing) (e.currentTarget as HTMLElement).style.borderColor = 'var(--ac-bdr)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--bdr-med)'; }}
                >
                  {q}
                </button>
              ))}
            </div>

            {/* 输入框 + 追问按钮 */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !analyzing) runAnalysis(question || undefined); }}
                placeholder="继续追问，如：哪几年是两人感情关键期？"
                disabled={analyzing}
                className="input-base"
                style={{ fontSize: '13px', flex: 1 }}
              />
              <button
                onClick={() => runAnalysis(question || undefined)}
                disabled={analyzing}
                style={{
                  padding: '10px 20px', borderRadius: 'var(--r-sm)', border: 'none',
                  background: analyzing ? 'var(--bg-2)' : 'var(--tx-0)',
                  color: analyzing ? 'var(--tx-3)' : 'white',
                  fontSize: '13px', fontWeight: 500,
                  cursor: analyzing ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}
              >
                {analyzing ? '分析中…' : '继续追问'}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 680px) {
          .heming-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
