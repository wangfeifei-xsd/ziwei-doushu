'use client';
import ConfirmDialog from '@ziwei/ui/components/ConfirmDialog';
import { useServices } from '@ziwei/runtime/services';

import Link from '@ziwei/runtime/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AIAPIMode, ModelSettings } from '@ziwei/domain/ai/config';
import styles from './ModelSettingsForm.module.css';

type Draft = { baseURL: string; model: string; mode: AIAPIMode; apiKey: string };
type Notice = { kind: 'success' | 'error'; message: string };
const EMPTY: Draft = { baseURL: '', model: '', mode: 'chat', apiKey: '' };
const toDraft = (settings: ModelSettings): Draft => ({
  baseURL: settings.baseURL, model: settings.model, mode: settings.mode, apiKey: '',
});

function ConnectionIcon({ className }: { className?: string }) {
  return <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="8" y="8" width="8" height="8" rx="2" />
    <path d="M10 3v5m4-5v5m-4 8v5m4-5v5M3 10h5m-5 4h5m8-4h5m-5 4h5" />
  </svg>;
}

export default function ModelSettingsForm() {
  const services = useServices();
  const [settings, setSettings] = useState<ModelSettings | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | 'unlock' | 'lock' | 'clear' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [vaultNotice, setVaultNotice] = useState<Notice | null>(null);
  const [remember, setRemember] = useState(false);
  const [password, setPassword] = useState('');
  const [tested, setTested] = useState(false);
  const [confirmClear,setConfirmClear]=useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const actionController = useRef<AbortController | null>(null);
  const operationPending = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError('');
    try {
      const current = await services.model.get(signal);
      const data = { settings: current };
      if (!signal?.aborted) {
        setSettings(data.settings);
        setDraft(toDraft(data.settings));
        setRemember(data.settings.source==='saved' && Boolean(data.settings.hasVault));
        setPassword('');
      }
    } catch (error) {
      if (!signal?.aborted) setLoadError(error instanceof Error ? error.message : '暂时无法读取模型配置。');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => { controller.abort(); actionController.current?.abort(); };
  }, [load]);

  const dirty = Boolean(settings && (
    draft.baseURL.trim() !== settings.baseURL || draft.model.trim() !== settings.model ||
    draft.mode !== settings.mode || Boolean(draft.apiKey.trim()) || (services.platform === 'native' && (Boolean(password)||remember&&settings.source==='session'))
  ));

  function update<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft(current => ({ ...current, [field]: value }));
    setNotice(null);
    setTested(false);
  }

  async function run(action: 'save' | 'test') {
    if (operationPending.current || !formRef.current?.reportValidity()) return;
    if (services.platform === 'native' && settings?.locked && !draft.apiKey.trim()) {
      setVaultNotice({ kind: 'error', message: '请先输入密钥库密码并点击解锁，再测试或保存配置。' });
      document.getElementById('model-vault-password')?.focus();
      return;
    }
    operationPending.current = true;
    setBusy(action);
    setNotice(null);
    if (action === 'test') setTested(false);
    const controller = new AbortController();
    actionController.current = controller;
    try {
      const data = action === 'test'
        ? { ...await services.model.test({ ...draft, remember, password }, controller.signal), settings: settings! }
        : { settings: await services.model.save({ ...draft, remember, password }), latencyMs: 0 };
      if (controller.signal.aborted) return;
      if (action === 'save') {
        setSettings(data.settings);
        setDraft(toDraft(data.settings));
        setPassword('');
        setNotice({ kind: 'success', message: '配置已保存，新的 AI 解读与合盘分析将立即使用此配置。' });
      } else {
        setTested(true);
        setNotice({ kind: 'success', message: `连接成功，模型已返回有效响应。耗时 ${(data.latencyMs / 1000).toFixed(1)} 秒。${dirty ? '保存配置后即可应用。' : ''}` });
      }
    } catch (error) {
      if (!controller.signal.aborted) setNotice({ kind: 'error', message: error instanceof Error ? error.message : '请求失败，请稍后重试。' });
    } finally {
      operationPending.current = false;
      if (!controller.signal.aborted) setBusy(null);
    }
  }

  async function changeVault(action: 'unlock' | 'lock' | 'clear') {
    if (operationPending.current) return;
    if (action === 'unlock' && (Array.from(password).length < 8 || new TextEncoder().encode(password).length > 1024)) {
      setVaultNotice({ kind: 'error', message: '解锁密码至少需要 8 个字符，且不能过长。' });
      document.getElementById('model-vault-password')?.focus();
      return;
    }
    operationPending.current = true;
    setBusy(action);
    setNotice(null);
    setVaultNotice(null);
    setTested(false);
    const showNotice = action === 'clear' ? setNotice : setVaultNotice;
    const controller = new AbortController();
    actionController.current = controller;
    try {
      const next = action === 'clear' ? await services.model.clear()
        : action === 'unlock' ? await services.model.unlock!(password) : await services.model.lock!();
      if (controller.signal.aborted) return;
      if (action === 'unlock' && next.locked) throw new Error('密钥库仍未解锁，请检查密码后重试。');
      setSettings(next);
      setPassword('');
      if (action === 'clear') {
        setDraft(current => ({ ...current, apiKey: '' }));
        setRemember(false);
        setConfirmClear(false);
      }
      showNotice({ kind: 'success', message: action === 'unlock'
        ? '密钥库已解锁，本次启动可使用已保存的密钥。'
        : action === 'lock' ? '密钥库已锁定。' : '模型密钥已清除。' });
    } catch (error) {
      if (!controller.signal.aborted) {
        if (action === 'clear') setConfirmClear(false);
        showNotice({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      operationPending.current = false;
      if (!controller.signal.aborted) setBusy(null);
    }
  }

  if (loading) return <div className={`${styles.card} p-8 text-sm`} role="status" style={{ color: 'var(--tx-2)' }}>正在读取模型配置…</div>;
  if (loadError || !settings) return <div className={`${styles.card} p-6 sm:p-8`}>
    <p role="alert" className="mb-4 text-sm" style={{ color: 'var(--ji)' }}>{loadError || '暂时无法读取模型配置。'}</p>
    <button type="button" onClick={() => void load()} className={styles.secondaryButton}>重新加载</button>
  </div>;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-6">
      <ConfirmDialog open={confirmClear} title="清除模型密钥？" busy={busy === 'clear'} onCancel={()=>setConfirmClear(false)} onConfirm={()=>void changeVault('clear')}>清除后需重新填写 API Key。出生档案、主题和已有古籍不受影响。</ConfirmDialog>
      <form ref={formRef} onSubmit={event => { event.preventDefault(); void run('save'); }} className={styles.card}>
        <div className="flex items-center gap-3 border-b p-5 sm:px-7 sm:py-6" style={{ borderColor: 'var(--bdr)' }}>
          <div className={styles.iconBox}><ConnectionIcon /></div>
          <div>
            <h2 className="text-base font-medium" style={{ color: 'var(--tx-0)' }}>服务连接</h2>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--tx-3)' }}>支持 OpenAI 及兼容接口服务</p>
          </div>
          <span className={`${styles.badge} ml-auto shrink-0`}>{dirty ? '未保存' : settings.configured ? '已配置' : '待配置'}</span>
        </div>
        {services.platform === 'native' && <fieldset disabled={busy !== null} className="min-w-0 p-5 space-y-3" style={{ borderBottom: '1px solid var(--bdr)' }} aria-busy={busy === 'unlock' || busy === 'lock'}>
          <p className="text-xs" role="status">{settings.locked ? '密钥库已锁定；请解锁后使用 AI。' : '可仅本次使用，或用解锁密码加密保存。'}</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />加密保存密钥</label>
          {(remember || settings.hasVault) && <input id="model-vault-password" type="password" className="input-base" value={password} onChange={e => { setPassword(e.target.value); setVaultNotice(null); }} placeholder="密钥库解锁密码（至少 8 个字符）" aria-label="密钥库解锁密码" autoComplete="off" autoCapitalize="none" spellCheck={false}
            onKeyDown={event => { if (event.key === 'Enter' && settings.locked) { event.preventDefault(); void changeVault('unlock'); } }} />}
          {settings.hasVault && <button type="button" className={styles.secondaryButton} onClick={() => void changeVault(settings.locked ? 'unlock' : 'lock')}>
            {(busy === 'unlock' || busy === 'lock') && <span className={styles.spinner} aria-hidden="true" />}
            {busy === 'unlock' ? '正在解锁…' : busy === 'lock' ? '正在锁定…' : settings.locked ? '解锁' : '锁定密钥库'}
          </button>}
          {vaultNotice && <p role={vaultNotice.kind === 'error' ? 'alert' : 'status'} className={`${styles.notice} ${vaultNotice.kind === 'error' ? styles.noticeError : styles.noticeSuccess}`}>{vaultNotice.message}</p>}
        </fieldset>}
        <fieldset disabled={busy !== null} className="min-w-0 space-y-6 p-5 sm:p-7">
          <div>
            <label htmlFor="model-base-url" className={styles.label}>接口地址 <span className={styles.fieldAlias}>Base URL</span></label>
            <input id="model-base-url" name="baseURL" type="url" required maxLength={2048} autoComplete="off" spellCheck={false}
              value={draft.baseURL} onChange={event => update('baseURL', event.target.value)}
              placeholder="https://api.example.com/v1" aria-describedby="model-url-help" className={`input-base ${styles.input}`} />
            <p id="model-url-help" className={styles.help}>填写服务商提供的 API 根地址，通常以 /v1 结尾，无需填写 /responses 或 /chat/completions。</p>
          </div>
          <div>
            <label htmlFor="model-api-key" className={styles.label}>API Key <span className={styles.fieldAlias}>{settings.hasApiKey ? '已配置密钥' : '访问密钥'}</span></label>
            <input id="model-api-key" name="apiKey" type="password" required={!settings.hasApiKey} maxLength={4096}
              autoComplete="off" autoCapitalize="none" spellCheck={false} value={draft.apiKey}
              onChange={event => update('apiKey', event.target.value)}
              placeholder={settings.hasApiKey ? '留空保留现有密钥' : '输入服务商提供的 API Key'}
              aria-describedby="model-key-help" className={`input-base ${styles.input}`} />
            <p id="model-key-help" className={styles.help}>密钥不会回填显示；留空保存会保留现有密钥。</p>
          </div>
          <div>
            <label htmlFor="model-name" className={styles.label}>模型名称 <span className={styles.fieldAlias}>Model ID</span></label>
            <input id="model-name" name="model" type="text" required maxLength={200} autoComplete="off" autoCapitalize="none" spellCheck={false}
              value={draft.model} onChange={event => update('model', event.target.value)} placeholder="输入服务商提供的模型 ID"
              aria-describedby="model-name-help" className={`input-base ${styles.input}`} />
            <p id="model-name-help" className={styles.help}>请使用当前密钥有权限访问的完整模型名称。</p>
          </div>
          <fieldset>
            <legend className={styles.label}>接口类型 <span className={styles.fieldAlias}>API Mode</span></legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                { mode: 'chat', label: 'Chat Completions', path: '/chat/completions', detail: '适用于多数兼容服务' },
                { mode: 'responses', label: 'Responses', path: '/responses', detail: '适用于支持 Responses 的服务' },
              ] as const).map(option => (
                <label key={option.mode} className={`${styles.modeOption} ${draft.mode === option.mode ? styles.modeSelected : ''}`}>
                  <div className="flex items-center gap-2">
                    <input type="radio" name="mode" value={option.mode} checked={draft.mode === option.mode}
                      onChange={() => update('mode', option.mode)} className={styles.radio} />
                    <span className="text-[13px] font-medium" style={{ color: 'var(--tx-0)' }}>{option.label}</span>
                  </div>
                  <p className="mt-2 text-[11px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--tx-2)' }}>{option.path}</p>
                  <p className="mt-1 text-[11px]" style={{ color: 'var(--tx-3)' }}>{option.detail}</p>
                </label>
              ))}
            </div>
          </fieldset>
        </fieldset>
        <div className="border-t p-5 sm:px-7 sm:py-6" style={{ borderColor: 'var(--bdr)' }}>
          {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`${styles.notice} ${notice.kind === 'error' ? styles.noticeError : styles.noticeSuccess}`}>{notice.message}</p>}
          <div className="flex flex-wrap items-center gap-3">
            {settings.hasApiKey && <button type="button" className={styles.resetButton} disabled={busy !== null} onClick={() => setConfirmClear(true)}>清除密钥</button>}
            <button type="submit" disabled={busy !== null || !dirty} className={styles.primaryButton}>
              {busy === 'save' && <span className={styles.spinner} aria-hidden="true" />}{busy === 'save' ? '正在保存…' : '保存配置'}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => void run('test')} className={styles.secondaryButton}>
              {busy === 'test' && <span className={styles.spinner} aria-hidden="true" />}{busy === 'test' ? '正在测试…' : '测试连接'}
            </button>
            {dirty && <button type="button" disabled={busy !== null} className={styles.resetButton} onClick={() => {
              setDraft(toDraft(settings)); setNotice(null); setTested(false);
            }}>撤销修改</button>}
          </div>
          <p className="mt-3 text-[11px] leading-5" style={{ color: 'var(--tx-3)' }}>测试将发送一条简短请求，验证当前填写的配置；保存后立即生效，无需重启。</p>
        </div>
      </form>

      <aside className="space-y-5">
        <section className={`${styles.card} p-5 sm:p-6`}>
          <div className="mb-5 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium" style={{ color: 'var(--tx-0)' }}>当前生效配置</h2>
            <span className={styles.statusDot} data-ready={settings.configured} aria-label={settings.configured ? '已配置' : '尚未配置'} />
          </div>
          <dl className="space-y-5 text-xs">
            <div><dt className={styles.summaryLabel}>模型</dt><dd className={styles.summaryValue}>{settings.model || '尚未填写'}</dd></div>
            <div><dt className={styles.summaryLabel}>接口类型</dt><dd className={styles.summaryValue}>{settings.mode === 'chat' ? 'Chat Completions' : 'Responses'}</dd></div>
            <div><dt className={styles.summaryLabel}>接口地址</dt><dd className={`${styles.summaryValue} break-all`}>{settings.baseURL || '尚未填写'}</dd></div>
            <div className="border-t pt-4" style={{ borderColor: 'var(--bdr)' }}><dt className={styles.summaryLabel}>配置来源</dt><dd className={styles.summaryValue}>{settings.source === 'saved' ? '已保存的配置' : settings.source === 'session' ? '仅本次使用' : '环境变量'}</dd></div>
          </dl>
          {tested && <p className="mt-5 text-xs" role="status" style={{ color: 'var(--ac)' }}>✓ 当前表单配置已通过连接测试</p>}
        </section>
        <section className="rounded-xl border p-5 sm:p-6" style={{ borderColor: 'var(--ac-bdr)', background: 'var(--ac-bg)' }}>
          <h2 className="mb-3 text-sm font-medium" style={{ color: 'var(--ac)' }}>一处配置，两处使用</h2>
          <p className="text-xs leading-6" style={{ color: 'var(--tx-2)' }}>命盘解读与合盘分析共用此模型服务。保存配置后，新发起的分析会自动使用最新设置。</p>
          <div className="mt-5 flex flex-col gap-3 text-xs" style={{ color: 'var(--ac)' }}>
            <Link href="/qipan" className={styles.featureLink}>前往起盘与解读 <span aria-hidden="true">↗</span></Link>
            <Link href="/heming" className={styles.featureLink}>前往合盘分析 <span aria-hidden="true">↗</span></Link>
          </div>
        </section>
      </aside>
    </div>
  );
}
