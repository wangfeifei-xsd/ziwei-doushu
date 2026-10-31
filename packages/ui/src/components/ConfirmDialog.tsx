'use client';
import {useEffect,useRef,useId,type ReactNode} from 'react';
import {useModal} from '@ziwei/runtime/modal';
export default function ConfirmDialog({open,title,children,busy,onCancel,onConfirm}:{open:boolean;title:string;children:ReactNode;busy:boolean;onCancel():void;onConfirm():void}){
 const dialog=useRef<HTMLDialogElement>(null);const id=useId();useModal(open,()=>{if(!busy)onCancel();});
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();return()=>dialog.current?.close();},[open]);
 return <dialog ref={dialog} aria-labelledby={id} onCancel={event=>{event.preventDefault();if(!busy)onCancel();}} className="rounded-2xl border p-6 max-w-md w-[calc(100%-32px)] backdrop:bg-black/60" style={{background:'var(--bg-0)',color:'var(--tx-1)',borderColor:'var(--bdr-med)'}}>
  <h2 id={id} className="text-xl mb-4">{title}</h2><div className="text-sm leading-7" style={{color:'var(--tx-2)'}}>{children}</div>
  <div className="mt-6 flex justify-end gap-3"><button type="button" className="btn-secondary min-h-11" disabled={busy} onClick={onCancel}>取消</button><button type="button" className="btn-primary min-h-11" disabled={busy} onClick={onConfirm}>{busy?'正在处理…':'确认清除'}</button></div>
 </dialog>;
}
