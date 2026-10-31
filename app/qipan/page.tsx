import type { Metadata } from 'next';
import BirthProfiles from '@/components/BirthProfiles';

export const metadata: Metadata = {
  title: '紫微起盘 · 紫微命盘',
  description: '填写出生资料生成紫微斗数命盘，或选择已保存的档案直接起盘。',
  alternates: { canonical: '/qipan' },
};

export default function QipanPage() {
  return (
    <div className="min-h-svh" style={{ background: 'var(--bg-page)' }}>

      <main>
        <BirthProfiles />
      </main>
    </div>
  );
}
