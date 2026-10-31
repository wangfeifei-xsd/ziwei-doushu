'use client';
import { useModal } from '@ziwei/runtime/modal';
import { useServices } from '@ziwei/runtime/services';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from '@ziwei/runtime/navigation';
import BirthForm, { type BirthFormState } from '@ziwei/ui/components/BirthForm';
import type { BirthProfile } from '@ziwei/domain/ziwei/profiles';
import styles from './profiles.module.css';

const PAGE_SIZE = 12;
const collator = new Intl.Collator('zh-CN', { numeric: true });
type Filter = 'all' | 'male' | 'female' | 'unknown';
type Sort = 'recent' | 'name' | 'birthday';

const paths = {
  archive: 'M3 3h18v5H3z M5 8v13h14V8 M9 12h6',
  plus: 'M12 5v14 M5 12h14',
  search: 'M21 21l-5-5 M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0',
  refresh: 'M20 7v5h-5 M4 17v-5h5 M6.1 6.1a8 8 0 0 1 13.2 3 M4.7 14.9a8 8 0 0 0 13.2 3',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  edit: 'M16 3l5 5 M4 15L16 3l5 5L9 20l-6 1z',
  trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
  close: 'M6 6l12 12 M6 18L18 6',
  calendar: 'M4 5h16v16H4z M8 3v4 M16 3v4 M4 11h16',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2',
  pin: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0 M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
} as const;

function Icon({ name, size = 18 }: { name: keyof typeof paths; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

function titleOf(profile: BirthProfile) { return profile.form.name || '未命名档案'; }
function birthdayOf(form: BirthFormState) {
  return `${form.year}-${form.month.padStart(2, '0')}-${form.day.padStart(2, '0')}`;
}
function savedDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function Modal({ title, description, busy, onClose, children }: {
  title: string; description: string; busy: boolean; onClose: () => void; children: ReactNode;
}) {
  useModal(true,()=>{if(!busy)onClose();});
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => { dialog.close(); };
  }, []);

  return (
    <dialog ref={ref} className={styles.modal} aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
      <div className={styles.modalHeader}>
        <div><h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p></div>
        <button type="button" className={styles.iconButton} onClick={onClose} disabled={busy} aria-label="关闭弹窗">
          <Icon name="close" />
        </button>
      </div>
      <div className={styles.modalBody}>{children}</div>
    </dialog>
  );
}

export default function ProfileManager() {
  const services = useServices();
  const [profiles, setProfiles] = useState<BirthProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<BirthProfile | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<BirthProfile[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const loadController = useRef<AbortController | null>(null);
  const saveErrorRef = useRef<HTMLParagraphElement>(null);

  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true);
    setLoadError('');
    try {
      const next = await services.profiles.list(controller.signal);
      if (controller.signal.aborted) return;
      setProfiles(next);
      setSelected(previous => new Set([...previous].filter(id => next.some(profile => profile.id === id))));
    } catch (error) {
      if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : '档案读取失败，请重试。');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); return () => loadController.current?.abort(); }, [load]);
  useEffect(() => { if (saveError) saveErrorRef.current?.scrollIntoView({ block: 'center' }); }, [saveError]);

  const counts = useMemo(() => ({
    all: profiles.length,
    male: profiles.filter(profile => profile.form.gender === 'male').length,
    female: profiles.filter(profile => profile.form.gender === 'female').length,
    unknown: profiles.filter(profile => profile.form.unknownTime).length,
  }), [profiles]);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return profiles.filter(profile => {
      const { form } = profile;
      if (filter === 'unknown' && !form.unknownTime) return false;
      if ((filter === 'male' || filter === 'female') && form.gender !== filter) return false;
      const text = [titleOf(profile), form.province, form.city, birthdayOf(form),
        `${form.year}年${form.month}月${form.day}日`, `${form.year}/${form.month}/${form.day}`].join(' ').toLowerCase();
      return !search || text.includes(search);
    }).sort((a, b) => {
      if (sort === 'name') return collator.compare(titleOf(a), titleOf(b)) || b.savedAt - a.savedAt;
      if (sort === 'birthday') return birthdayOf(a.form).localeCompare(birthdayOf(b.form)) || b.savedAt - a.savedAt;
      return b.savedAt - a.savedAt || a.id.localeCompare(b.id);
    });
  }, [profiles, query, filter, sort]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const allVisibleSelected = visible.length > 0 && visible.every(profile => selected.has(profile.id));
  const hasFilters = query !== '' || filter !== 'all';

  function openEditor(profile: BirthProfile | 'new') {
    setSaveError(''); setNotice(''); setEditor(profile);
  }

  async function save(form: BirthFormState) {
    if (!editor || saving) return;
    const originalId = editor === 'new' ? null : editor.id;
    setSaving(true); setSaveError('');
    try {
      const profile = originalId ? await services.profiles.update(originalId, form) : await services.profiles.save(form);
      setProfiles(previous => [profile, ...previous.filter(item => item.id !== originalId && item.id !== profile.id)]);
      setSelected(previous => { const next = new Set(previous); if (originalId) next.delete(originalId); return next; });
      setEditor(null); setQuery(''); setFilter('all'); setSort('recent'); setPage(1);
      setNotice(originalId ? `「${titleOf(profile)}」的资料已更新。` : `「${titleOf(profile)}」已保存，可直接查看命盘。`);
      void load();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '档案保存失败，请重试。');
    } finally { setSaving(false); }
  }

  function confirmDelete(items: BirthProfile[]) {
    setDeleteError(''); setNotice(''); setPendingDelete(items);
  }

  async function remove() {
    if (deleting || pendingDelete.length === 0) return;
    setDeleting(true); setDeleteError('');
    const results = await Promise.allSettled(pendingDelete.map(async profile => {
      await services.profiles.remove(profile.id);
      return profile.id;
    }));
    const removed = new Set<string>();
    const failed: BirthProfile[] = [];
    let message = '';
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') removed.add(result.value);
      else { failed.push(pendingDelete[index]); message = result.reason instanceof Error ? result.reason.message : '删除失败，请重试。'; }
    });
    setProfiles(previous => previous.filter(profile => !removed.has(profile.id)));
    setSelected(previous => new Set([...previous].filter(id => !removed.has(id))));
    setPendingDelete(failed); setDeleting(false);
    if (failed.length) setDeleteError(`${removed.size ? `已删除 ${removed.size} 份档案；` : ''}${failed.length} 份未能删除。${message}`);
    else setNotice(`已删除 ${removed.size} 份档案。`);
    void load();
  }

  function toggleSelected(id: string) {
    setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  return (
    <>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}><Icon name="archive" size={15} /> 我的生辰簿</p>
          <h1>档案管理<span className={styles.titleDot} aria-hidden="true">.</span></h1>
          <p className={styles.description}>妥善保存出生资料，让每一次起盘都从容开始。</p>
        </div>
        <button type="button" className={styles.primaryButton} onClick={() => openEditor('new')}>
          <Icon name="plus" /> 新建档案
        </button>
      </div>

      <dl className={styles.stats} aria-label="档案概览">
        {([['全部档案', 'all'], ['男性档案', 'male'], ['女性档案', 'female'], ['时辰不详', 'unknown']] as const).map(([label, key]) => (
          <div key={key}><dt>{label}</dt><dd>{(loading || loadError) && profiles.length === 0 ? '—' : counts[key]}<span>份</span></dd></div>
        ))}
      </dl>

      <section className={styles.collection} aria-label="出生档案">
        <div className={styles.toolbar}>
          <div className={styles.search}>
            <Icon name="search" />
            <input type="search" aria-label="搜索档案" placeholder="搜索姓名、出生地或出生日期"
              value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} />
            {query && <button type="button" aria-label="清空搜索" className={styles.iconButton} onClick={() => { setQuery(''); setPage(1); }}><Icon name="close" size={15} /></button>}
          </div>
          <div className={styles.toolbarActions}>
            <label className="sr-only" htmlFor="profile-sort">档案排序</label>
            <select id="profile-sort" className={styles.sort} value={sort} onChange={event => { setSort(event.target.value as Sort); setPage(1); }}>
              <option value="recent">最近保存</option><option value="name">姓名排序</option><option value="birthday">出生日期</option>
            </select>
            <button type="button" className={styles.iconButton} aria-label="刷新档案" title="刷新档案" disabled={loading} onClick={() => void load()}>
              <span className={loading ? styles.spinning : undefined}><Icon name="refresh" /></span>
            </button>
          </div>
        </div>

        <div className={styles.filterRow}>
          <div className={styles.filters} aria-label="筛选档案">
            {([['all', '全部'], ['male', '男性'], ['female', '女性'], ['unknown', '时辰不详']] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={filter === value} className={filter === value ? styles.activeFilter : styles.filter}
                onClick={() => { setFilter(value); setPage(1); }}>{label}<span>{counts[value]}</span></button>
            ))}
          </div>
          {visible.length > 0 && <label className={styles.selectAll}>
            <input type="checkbox" checked={allVisibleSelected} onChange={() => setSelected(previous => {
              const next = new Set(previous);
              visible.forEach(profile => { if (allVisibleSelected) next.delete(profile.id); else next.add(profile.id); });
              return next;
            })} /> 选择本页
          </label>}
        </div>

        {selected.size > 0 && <div className={styles.selectionBar}>
          <span>已选择 <strong>{selected.size}</strong> 份档案</span>
          <div>
            <button type="button" className={styles.textButton} onClick={() => setSelected(new Set())}>取消选择</button>
            <button type="button" className={styles.dangerButton} onClick={() => confirmDelete(profiles.filter(profile => selected.has(profile.id)))}>
              <Icon name="trash" size={15} /> 删除所选
            </button>
          </div>
        </div>}

        {notice && <p role="status" className={styles.notice}>✓ {notice}</p>}
        {loadError && <div role="alert" className={styles.error}>
          <p>{loadError}</p><button type="button" className={styles.textButton} onClick={() => void load()} disabled={loading}>重新读取</button>
        </div>}

        {loading && profiles.length === 0 ? <div role="status" className={styles.loading}>
          <span className={styles.spinning}><Icon name="refresh" size={24} /></span><p>正在读取档案…</p>
        </div> : !loadError && profiles.length === 0 ? <div className={styles.empty}>
          <div className={styles.emptyIcon}><Icon name="archive" size={32} /></div>
          <h2>从第一份档案开始</h2><p>保存自己或亲友的出生资料，下次无需重复填写。</p>
          <button type="button" className={styles.primaryButton} onClick={() => openEditor('new')}><Icon name="plus" size={17} /> 新建第一份档案</button>
        </div> : profiles.length > 0 && filtered.length === 0 ? <div className={styles.empty}>
          <div className={styles.emptyIcon}><Icon name="search" size={30} /></div>
          <h2>没有找到匹配的档案</h2><p>试试其他姓名、出生地，或调整筛选条件。</p>
          <button type="button" className={styles.secondaryButton} onClick={() => { setQuery(''); setFilter('all'); setPage(1); }}>清除筛选</button>
        </div> : <ul className={styles.grid} aria-label="档案列表" aria-busy={loading}>
          {visible.map(profile => {
            const { form } = profile;
            const title = titleOf(profile);
            const checked = selected.has(profile.id);
            return <li key={profile.id} className={`${styles.card} ${checked ? styles.selectedCard : ''}`}>
              <div className={styles.cardTop}>
                <span className={styles.avatar} aria-hidden="true">{Array.from(title)[0]}</span>
                <div className={styles.identity}><h2 title={title}>{title}</h2><span>{form.gender === 'male' ? '男' : '女'} · 出生档案</span></div>
                <input type="checkbox" className={styles.cardCheckbox} checked={checked} aria-label={`选择${title}档案`} onChange={() => toggleSelected(profile.id)} />
              </div>
              <dl className={styles.details}>
                <div><dt><Icon name="calendar" size={16} /><span className="sr-only">出生日期</span></dt><dd><time dateTime={birthdayOf(form)}>{form.year} 年 {form.month} 月 {form.day} 日</time><span className={styles.solarLabel}>公历</span></dd></div>
                <div><dt><Icon name="clock" size={16} /><span className="sr-only">出生时间</span></dt><dd>{form.unknownTime ? <span className={styles.unknownTime}>时辰不详 · 以子时起盘</span> : <>{form.clockHour.padStart(2, '0')}:{form.clockMinute.padStart(2, '0')}<span className={styles.solarLabel}>北京时间</span></>}</dd></div>
                <div><dt><Icon name="pin" size={16} /><span className="sr-only">出生地</span></dt><dd title={[form.province, form.city].filter(Boolean).join(' ')}>{[form.province, form.city].filter(Boolean).join(' · ') || '未填写出生地'}</dd></div>
              </dl>
              <div className={styles.savedAt}>保存于 <time dateTime={new Date(profile.savedAt).toISOString()}>{savedDate(profile.savedAt)}</time></div>
              <div className={styles.cardFooter}>
                <Link href={`/chart?profile=${profile.id}`} className={styles.chartLink} aria-label={`查看${title}的命盘`}>查看命盘 <Icon name="arrow" size={16} /></Link>
                <div>
                  <button type="button" className={styles.iconButton} aria-label={`编辑${title}档案`} title="编辑档案" onClick={() => openEditor(profile)}><Icon name="edit" size={16} /></button>
                  <button type="button" className={`${styles.iconButton} ${styles.deleteButton}`} aria-label={`删除${title}档案`} title="删除档案" onClick={() => confirmDelete([profile])}><Icon name="trash" size={16} /></button>
                </div>
              </div>
            </li>;
          })}
        </ul>}

        {filtered.length > 0 && <div className={styles.pagination}>
          <p>{hasFilters ? `找到 ${filtered.length} 份档案` : `共 ${profiles.length} 份档案`}<span> · 每页 {PAGE_SIZE} 份</span></p>
          {totalPages > 1 && <nav aria-label="档案分页">
            <button type="button" className={styles.pageButton} disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label="上一页">‹</button>
            <span aria-live="polite">{currentPage} / {totalPages}</span>
            <button type="button" className={styles.pageButton} disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)} aria-label="下一页">›</button>
          </nav>}
        </div>}
      </section>

      {editor && <Modal title={editor === 'new' ? '新建档案' : '编辑档案'} description="请填写公历出生日期，保留原始出生时间。"
        busy={saving} onClose={() => setEditor(null)}>
        {saveError && <p ref={saveErrorRef} role="alert" className={styles.error}>{saveError}</p>}
        <BirthForm key={editor === 'new' ? 'new' : editor.id} initialData={editor === 'new' ? undefined : editor.form}
          loading={saving} submitLabel={editor === 'new' ? '保存档案' : '保存修改'} loadingLabel="正在保存…"
          onSubmit={(_info, form) => void save(form)} />
      </Modal>}

      {pendingDelete.length > 0 && <Modal title={pendingDelete.length === 1 ? '删除这份档案？' : `删除 ${pendingDelete.length} 份档案？`}
        description="删除后无法恢复，请确认这些档案已不再需要。" busy={deleting} onClose={() => setPendingDelete([])}>
        <ul className={styles.deleteList}>{pendingDelete.slice(0, 5).map(profile => <li key={profile.id}><span>{titleOf(profile)}</span><span>{birthdayOf(profile.form)}</span></li>)}</ul>
        {pendingDelete.length > 5 && <p className={styles.description}>另有 {pendingDelete.length - 5} 份已选档案</p>}
        {deleteError && <p role="alert" className={styles.error}>{deleteError}</p>}
        <div className={styles.modalActions}>
          <button type="button" autoFocus className={styles.secondaryButton} disabled={deleting} onClick={() => setPendingDelete([])}>保留档案</button>
          <button type="button" className={styles.dangerButton} disabled={deleting} onClick={() => void remove()}><Icon name="trash" size={16} />{deleting ? '正在删除…' : '确认删除'}</button>
        </div>
      </Modal>}
    </>
  );
}
