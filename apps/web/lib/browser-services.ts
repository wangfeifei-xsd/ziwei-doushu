import type { AppServices, ModelDraft } from '@ziwei/runtime/services';
import type { BirthProfile } from '@ziwei/domain/ziwei/profiles';
import { normalizedEvents } from '@ziwei/features/ai/client';

async function json(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求失败，请重试。');
  return data;
}
function body(value: unknown, method: string): RequestInit { return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }; }
async function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30_000); return 'saved' as const;
}
export function browserServices(websiteURL: string): AppServices {
  return {
    platform: 'web', websiteURL,
    profiles: {
      list: async signal => (await json('/api/profiles', { signal })).profiles,
      get: async (id, signal) => { const response = await fetch(`/api/profiles/${id}`, { signal, cache: 'no-store' }); if (response.status === 404) return null; const data = await response.json(); if (!response.ok) throw new Error(data.error); return data.profile as BirthProfile; },
      save: async form => (await json('/api/profiles', body(form, 'POST'))).profile,
      update: async (id, form) => (await json(`/api/profiles/${id}`, body(form, 'PUT'))).profile,
      remove: async id => { const response = await fetch(`/api/profiles/${id}`, { method: 'DELETE' }); if (response.status === 404) return false; if (!response.ok) throw new Error((await response.json()).error); return true; },
    },
    ai: { async *stream(request, signal) { yield* normalizedEvents(await fetch(`/api/${request.kind}`, { ...body(request.body, 'POST'), signal })); } },
    model: {
      get: async signal => (await json('/api/settings/model', { signal })).settings,
      save: async (draft: ModelDraft) => (await json('/api/settings/model', body(draft, 'PUT'))).settings,
      test: (draft, signal) => json('/api/settings/model/test', { ...body(draft, 'POST'), signal }),
      clear: async () => (await json('/api/settings/model', { method: 'DELETE' })).settings,
    },
    files: {
      importJSON: () => new Promise(resolve => { const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json'; input.addEventListener('cancel', () => resolve(null)); input.onchange = async () => { const file = input.files?.[0]; if (!file) return resolve(null); if (file.size > 16 * 1024 * 1024) return resolve(null); resolve(await file.text()); }; input.click(); }),
      exportJSON: (name, data) => download(name, new Blob([data], { type: 'application/json' })),
      exportImage: (name, bytes) => download(name, new Blob([new Uint8Array(bytes)], { type: 'image/png' })),
      copyText: text => navigator.clipboard.writeText(text),
      openExternal: async url => { if (!/^https?:\/\//i.test(url)) throw new Error('仅支持 HTTP/HTTPS 外链。'); window.open(url, '_blank', 'noopener,noreferrer'); },
    },
  };
}
