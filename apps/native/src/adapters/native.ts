import { invoke, Channel } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { open as openFile, writeFile } from '@tauri-apps/plugin-fs';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { openUrl } from '@tauri-apps/plugin-opener';
import { installPreferences } from '@ziwei/runtime/preferences';
import type { AppServices, ModelDraft, AIEvent, FileActionResult } from '@ziwei/runtime/services';
import { canonicalForm, validateProfileExport } from '@ziwei/domain/profiles-transfer';
import { interpretMessages, hemingMessages } from '@ziwei/features/ai/prompts';
import { requestBody, upstreamEvents, consumeAI } from '@ziwei/features/ai/client';
import type { ModelSettings } from '@ziwei/domain/ai/config';
import { createAIByteStream } from './ai-byte-stream';

async function call<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  try { return await invoke<T>(name, args); } catch(e) { throw new Error(typeof e === 'string' ? e : '原生操作失败，请重试。'); }
}
export async function createNativeServices(websiteURL: string) {
  const settings = await call<Record<string,string>>('bootstrap');
  const info = await call<{ mobile: boolean }>('platform_info');
  const cache = new Map(Object.entries(settings));
  let pending: Promise<void> = Promise.resolve();
  let persistenceError: Error | null = null;
  function persist(key: string, value: string | null) {
    pending = pending.then(() => call<void>('preference_set',{key,value})).catch(e => {
      persistenceError = e; window.dispatchEvent(new CustomEvent('ziwei-storage-error',{detail:e.message}));
    });
  }
  installPreferences({
    getItem: key => cache.get(key) ?? null,
    setItem: (key,value) => { cache.set(key,value); if(key==='ziwei-theme')localStorage.setItem(key,value); persist(key,value); },
    removeItem: key => { cache.delete(key); persist(key,null); },
    key: index => [...cache.keys()][index] ?? null,
    get length() { return cache.size; },
  });
  document.documentElement.dataset.theme = cache.get('ziwei-theme') === 'light' ? 'light' : 'dark';
  const active = new Set<string>();
  async function* streamRaw(body: unknown, mode: 'chat' | 'responses', signal: AbortSignal, draft?: ModelDraft): AsyncGenerator<AIEvent> {
    signal.throwIfAborted();
    const requestId = crypto.randomUUID();
    await call('ai_begin',{requestId}); active.add(requestId);
    let settled = false;
    const cancel = async () => { if(!settled) await call('ai_cancel',{requestId}).catch(()=>{}); };
    const {stream:bodyStream,enqueue,finish} = createAIByteStream(cancel);
    const channel = new Channel<{type:'chunk'; bytes:number[]}>();
    const abort = () => { finish(new DOMException('请求已取消','AbortError')); void cancel(); };
    channel.onmessage = event => enqueue(event.bytes);
    signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted)abort();
    const task = call<void>('ai_stream',{requestId,body,channel,draft:draft ?? null}).then(()=>{settled=true;finish();},error=>{settled=true;finish(error);});
    try { yield* upstreamEvents(bodyStream,mode); }
    finally { signal.removeEventListener('abort',abort); active.delete(requestId); await cancel(); await task; }
  }
  async function exportFile(name: string, bytes: Uint8Array, mime: string): Promise<FileActionResult> {
    if (info.mobile) { const result=await call<{status:FileActionResult}>('share_file',{name,bytes:Array.from(bytes),mime}); return result.status; }
    const file = await save({defaultPath:name,filters:[{name:mime==='image/png'?'PNG 图片':'JSON 档案',extensions:[mime==='image/png'?'png':'json']}]});
    if (!file) return 'cancelled'; await writeFile(file,bytes); return 'saved';
  }
  const services: AppServices = {
    platform:'native',websiteURL,
    profiles:{
      list: async signal => { const data=await call<Awaited<ReturnType<AppServices['profiles']['list']>>>('profile_list'); signal?.throwIfAborted(); return data; },
      get: async (id,signal) => { const data=await call<Awaited<ReturnType<AppServices['profiles']['get']>>>('profile_get',{id});signal?.throwIfAborted();return data; },
      save: form => call('profile_save',{canonical:canonicalForm(form)}),
      update: (id,form) => call('profile_update',{id,canonical:canonicalForm(form)}),
      remove: id => call('profile_delete',{id}),
    },
    transfer:{
      exportData: async () => ({format:'ziwei-profiles',version:1,exportedAt:new Date().toISOString(),profiles:await services.profiles.list()}),
      importData: async input => {const data=await validateProfileExport(input);return call('profile_import',{records:data.profiles.map(p=>({id:p.id,canonical:canonicalForm(p.form),savedAt:p.savedAt}))});},
    },
    ai:{ async *stream(request,signal) {
      const config=await services.model.get();signal.throwIfAborted();
      const messages=request.kind==='interpret'?interpretMessages(request.body):hemingMessages(request.body);
      yield* streamRaw(requestBody(config.mode,config.model,messages),config.mode,signal);
    } },
    model:{
      get: () => call<ModelSettings>('model_get'),save: draft => call('model_save',{draft}),
      clear: () => call('model_clear'),unlock:password=>call('model_unlock',{password}),lock:()=>call('model_lock'),
      test: async (draft,signal) => { const started=performance.now();await consumeAI(streamRaw(requestBody(draft.mode,draft.model,[{role:'user',content:'请仅回复 OK。'}]),draft.mode,signal,draft),()=>{}); return {latencyMs:Math.round(performance.now()-started)}; },
    },
    files:{
      importJSON: async () => {
        const path=await open({multiple:false,filters:[{name:'JSON 档案',extensions:['json']}]});if(!path)return null;
        const file=await openFile(path,{read:true});const chunks:Uint8Array[]=[];let size=0;
        try { while(true){const buffer=new Uint8Array(65536);const count=await file.read(buffer);if(count===null||count===0)break;size+=count;if(size>16*1024*1024)throw new Error('文件超过 16 MB。');chunks.push(buffer.slice(0,count));} }
        finally { await file.close(); }
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      },
      exportJSON:(name,data)=>exportFile(name,new TextEncoder().encode(data),'application/json'),
      exportImage:(name,bytes)=>exportFile(name,bytes,'image/png'),copyText:writeText,
      openExternal: async url=>{if(!/^https?:\/\//i.test(url))throw new Error('仅支持 HTTP/HTTPS 外链。');await openUrl(url);},
    },
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden){for(const requestId of active)void call('ai_cancel',{requestId}).catch(()=>{});}});
  return {services,flush:async()=>{await pending;if(persistenceError)throw persistenceError;}};
}
