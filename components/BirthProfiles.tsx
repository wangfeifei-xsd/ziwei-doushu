'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import BirthForm, { type BirthFormState } from './BirthForm';
import { type BirthProfile } from '@/lib/ziwei/profiles';
import { formToSearchParams } from '@/lib/ziwei/share';

export default function BirthProfiles() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<BirthProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await fetch('/api/profiles', { cache: 'no-store', signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '暂时无法读取档案。');
      setProfiles(data.profiles);
    } catch (error) {
      if (!signal?.aborted) setLoadError(error instanceof Error ? error.message : '档案读取失败，请重试。');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const save = async (form: BirthFormState) => {
    setSaving(true);
    setActionError('');
    setNotice('');
    try {
      const response = await fetch('/api/profiles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '档案保存失败。');
      const profile: BirthProfile = data.profile;
      setProfiles(previous => [profile, ...previous.filter(item => item.id !== profile.id)]);
      setNotice('档案已保存，点击档案即可直接起盘。');
      // Refresh also recovers a list that failed to load before this save.
      void load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '档案保存失败，请重试。');
    } finally { setSaving(false); }
  };

  return (
    <section id="birth-profiles" aria-labelledby="birth-profiles-title"
      className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-8 text-center">
        <h1 id="birth-profiles-title" className="text-2xl font-semibold tracking-widest" style={{ color: 'var(--ac)' }}>
          紫微起盘
        </h1>
        <p className="mt-3 text-sm" style={{ color: 'var(--tx-2)' }}>
          填写出生资料，或从最近保存的档案中直接起盘。
        </p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div>
          <BirthForm saving={saving} onSaveProfile={save}
            onSubmit={(_info, form) => router.push(`/chart?${formToSearchParams(form)}`)} />
          {actionError && <p role="alert" className="mt-3 text-sm text-red-500">{actionError}</p>}
          <p role="status" className="mt-3 text-sm" style={{ color: 'var(--ac)' }}>{notice}</p>
        </div>
        <div className={`rounded-3xl border p-5 sm:p-7 ${profiles.length ? 'order-first lg:order-none' : ''}`}
          style={{ borderColor: 'var(--bdr-med)', background: 'var(--bg-card)' }}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium" style={{ color: 'var(--tx-0)' }}>最近保存的档案</h2>
            <button type="button" onClick={() => void load()} disabled={loading}
              className="text-sm disabled:opacity-50" style={{ color: 'var(--ac)' }}>
              {loading ? '读取中…' : '刷新'}
            </button>
          </div>
          <p className="mb-6 text-xs leading-relaxed" style={{ color: 'var(--tx-2)' }}>
            显示最近 4 份档案，更多资料可前往档案管理查看。
          </p>
          {loadError && <p role="alert" className="mb-4 text-sm text-red-500">{loadError}</p>}
          {!loading && !loadError && profiles.length === 0 && (
            <div className="rounded-2xl border border-dashed px-5 py-12 text-center" style={{ borderColor: 'var(--bdr-med)' }}>
              <p style={{ color: 'var(--tx-1)' }}>还没有保存的档案</p>
              <p className="mt-2 text-xs" style={{ color: 'var(--tx-2)' }}>填写出生资料后，点击「保存档案」。</p>
            </div>
          )}
          <ul className="max-h-[620px] space-y-3 overflow-y-auto" aria-label="已保存的档案">
            {profiles.slice(0, 4).map(profile => {
              const { form } = profile;
              const title = form.name || '未命名档案';
              return (
                <li key={profile.id} className="rounded-2xl border p-4" style={{ borderColor: 'var(--bdr-med)' }}>
                  <button type="button" onClick={() => router.push(`/chart?profile=${profile.id}`)}
                    aria-label={`使用${title}直接起盘`} className="block w-full text-left">
                    <span className="flex items-center justify-between gap-3">
                      <span className="break-all font-medium" style={{ color: 'var(--tx-0)' }}>{title}</span>
                      <span className="shrink-0 text-xs" style={{ color: 'var(--ac)' }}>直接起盘 →</span>
                    </span>
                    <span className="mt-2 block text-sm" style={{ color: 'var(--tx-2)' }}>
                      {form.year}年{form.month}月{form.day}日 · {form.gender === 'male' ? '男' : '女'}
                    </span>
                    <span className="mt-1 block text-xs" style={{ color: 'var(--tx-2)' }}>
                      {form.unknownTime ? '时辰不详（以子时起盘）' : `${form.clockHour.padStart(2, '0')}:${form.clockMinute.padStart(2, '0')}`}
                      {' · '}{[form.province, form.city].filter(Boolean).join(' ') || '未填写出生地'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Link href="/profiles" className="mt-5 flex items-center justify-between rounded-xl border px-4 py-3 text-sm"
            style={{ color: 'var(--ac)', borderColor: 'var(--ac-bdr)', background: 'var(--ac-bg)' }}>
            <span>档案管理{profiles.length > 0 ? ` · 全部 ${profiles.length} 份` : ''}</span><span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
