'use client';
import { useEffect, useRef } from 'react';
const stack: Array<{ close(): void }> = [];
let originalOverflow='';
export function hasModal() { return stack.length > 0; }
export function closeTopModal() { const modal = stack.at(-1); if (!modal) return false; modal.close(); return true; }
export function useModal(open: boolean, onClose: () => void) {
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const entry = { close: () => close.current() };
    if(!stack.length)originalOverflow=document.body.style.overflow;
    stack.push(entry); document.body.style.overflow = 'hidden';
    window.dispatchEvent(new Event('ziwei-modal-change'));
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && stack.at(-1) === entry) { event.preventDefault(); entry.close(); } };
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', escape);
      const index = stack.indexOf(entry); if(index >= 0) stack.splice(index,1);
      document.body.style.overflow = stack.length ? 'hidden' : originalOverflow;
      window.dispatchEvent(new Event('ziwei-modal-change'));
    };
  }, [open]);
}
