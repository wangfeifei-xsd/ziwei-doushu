'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BirthForm, { type BirthFormState } from './BirthForm';
import { type BirthProfile } from '@/lib/ziwei/profiles';
import { formToSearchParams } from '@/lib/ziwei/share';

export default function BirthProfiles() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<BirthProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
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

  const remove = async (id: string) => {
    setDeleting(id);
    setActionError('');
    setNotice('');
    try {
      const response = await fetch(`/api/profiles/${id}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) {
        const data = await response.json();
        throw new Error(data.error || '删除失败，请重试。');
      }
      setProfiles(previous => previous.filter(profile => profile.id !== id));
      setConfirmDelete(null);
      setNotice('档案已删除。');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '删除失败，请重试。');
    } finally { setDeleting(null); }
  };

  return (
    <section id="birth-profiles" aria-labelledby="birth-profiles-title"
      className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-8 text-center">
        <h1 id="birth-profiles-title" className="text-2xl font-semibold tracking-widest" style={{ color: 'var(--ac)' }}>
          起盘与档案
        </h1>
        <p className="mt-3 text-sm" style={{ color: 'var(--tx-2)' }}>
          保存出生资料，下次选择档案即可直接起盘。
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
            <h3 className="text-lg font-medium" style={{ color: 'var(--tx-0)' }}>已保存的档案</h3>
            <button type="button" onClick={() => void load()} disabled={loading}
              className="text-sm disabled:opacity-50" style={{ color: 'var(--ac)' }}>
              {loading ? '读取中…' : '刷新'}
            </button>
          </div>
          <p className="mb-6 text-xs leading-relaxed" style={{ color: 'var(--tx-2)' }}>
            档案保存在当前服务中，关闭或重启项目后仍可使用。
          </p>
          {loadError && <p role="alert" className="mb-4 text-sm text-red-500">{loadError}</p>}
          {!loading && !loadError && profiles.length === 0 && (
            <div className="rounded-2xl border border-dashed px-5 py-12 text-center" style={{ borderColor: 'var(--bdr-med)' }}>
              <p style={{ color: 'var(--tx-1)' }}>还没有保存的档案</p>
              <p className="mt-2 text-xs" style={{ color: 'var(--tx-2)' }}>填写出生资料后，点击「保存档案」。</p>
            </div>
          )}
          <ul className="max-h-[620px] space-y-3 overflow-y-auto" aria-label="已保存的档案">
            {profiles.map(profile => {
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
                  <div className="mt-3 flex items-center justify-end gap-3 text-xs">
                    {confirmDelete === profile.id ? <>
                      <span style={{ color: 'var(--tx-2)' }}>确定删除？</span>
                      <button type="button" onClick={() => void remove(profile.id)} disabled={deleting === profile.id}
                        className="text-red-500 disabled:opacity-50">{deleting === profile.id ? '删除中…' : '确定删除'}</button>
                      <button type="button" onClick={() => setConfirmDelete(null)} disabled={deleting === profile.id}
                        style={{ color: 'var(--tx-2)' }}>取消</button>
                    </> : <button type="button" onClick={() => setConfirmDelete(profile.id)}
                      aria-label={`删除${title}档案`} style={{ color: 'var(--tx-2)' }}>删除档案</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
