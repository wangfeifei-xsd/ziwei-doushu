'use client';
import { useState } from 'react';
import { useServices } from '@ziwei/runtime/services';
import { validateProfileExport, type ProfileExportV1 } from '@ziwei/domain/profiles-transfer';

export default function ProfileTransferPanel({ onImported }: { onImported(): void }) {
  const services = useServices();
  const [pending, setPending] = useState<ProfileExportV1 | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function action(run: () => Promise<void>) { setBusy(true); setMessage(''); try { await run(); } catch(e) { setMessage(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }
  return <section className="mb-6 rounded-xl border p-4 space-y-3" style={{ borderColor:'var(--bdr)', background:'var(--bg-card)' }} aria-label="档案备份与迁移">
    <div className="flex flex-wrap gap-3">
      <button className="btn-secondary" disabled={busy} onClick={() => void action(async () => {
        const data: ProfileExportV1 = services.transfer ? await services.transfer.exportData() : { format:'ziwei-profiles',version:1,exportedAt:new Date().toISOString(),profiles:await services.profiles.list() };
        const saved = await services.files.exportJSON(`紫微档案_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(data,null,2));
        setMessage(saved === 'saved' ? `已导出 ${data.profiles.length} 份档案。` : saved === 'shared' ? '已打开系统分享，可选择保存到文件。' : '已取消导出。');
      })}>导出档案备份</button>
      {services.transfer && <button className="btn-secondary" disabled={busy} onClick={() => void action(async () => {
        setPending(null);
        const text = await services.files.importJSON(); if (text === null) return;
        if (new TextEncoder().encode(text).length > 16 * 1024 * 1024) throw new Error('备份不能超过 16 MB。');
        const data = await validateProfileExport(JSON.parse(text)); const existing = new Set((await services.profiles.list()).map(p=>p.id));
        const ids = [...new Set(data.profiles.map(p=>p.id))]; setPending(data);
        setMessage(`已验证 ${data.profiles.length} 条记录，待新增 ${ids.filter(id=>!existing.has(id)).length} 份，已有 ${ids.filter(id=>existing.has(id)).length} 份。确认后原子导入。`);
      })}>选择备份导入</button>}
    </div>
    {message && <p role="status" className="text-sm" style={{color:'var(--tx-2)'}}>{message}</p>}
    {pending && <div className="flex gap-3">
      <button className="btn-primary" disabled={busy} onClick={() => void action(async () => { const result = await services.transfer!.importData(pending); setPending(null); setMessage(`新增 ${result.added} 份，跳过 ${result.skipped} 份。`); onImported(); })}>确认导入</button>
      <button disabled={busy} onClick={()=>{setPending(null);setMessage('已取消导入。');}}>取消</button>
    </div>}
  </section>;
}
