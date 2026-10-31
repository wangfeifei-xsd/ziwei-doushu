import type { Metadata } from 'next';
import Link from 'next/link';
import BirthProfiles from '@/components/BirthProfiles';
import StarField from '@/components/StarField';
import ThemeToggle from '@/components/ThemeToggle';

export const metadata: Metadata = {
  title: '起盘与档案 · 紫微命盘',
  description: '填写出生资料生成紫微斗数命盘，或选择已保存的档案直接起盘。',
  alternates: { canonical: '/qipan' },
};

export default function QipanPage() {
  return (
    <div className="min-h-svh" style={{ background: 'var(--bg-page)' }}>
      <StarField />
      <header className="sticky top-0 z-50 flex h-[52px] items-center gap-3 border-b px-4 sm:gap-4 sm:px-6"
        style={{ background: 'var(--bg-page)', borderColor: 'var(--bdr)' }}>
        <Link href="/" className="flex shrink-0 items-center gap-1 text-sm" style={{ color: 'var(--tx-3)' }}>
          <span aria-hidden="true" className="text-base">‹</span>
          返回
        </Link>
        <div aria-hidden="true" className="h-5 w-px" style={{ background: 'var(--bdr-med)' }} />
        <span className="text-xs tracking-[0.2em]" style={{ color: 'var(--ac)' }}>紫微起盘</span>
        <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-4">
          <ThemeToggle />
          <Link href="/heming" className="text-xs" style={{ color: 'var(--ac)' }}>合盘</Link>
        </div>
      </header>
      <main>
        <BirthProfiles />
      </main>
    </div>
  );
}
