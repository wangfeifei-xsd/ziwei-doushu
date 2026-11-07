import type { Metadata } from 'next';
import SharedPage from '@ziwei/features/pages/learn';

export const metadata: Metadata = {
  title: '命盘学习 · 紫微命盘',
  description: '切换十组特色模拟生辰，对照十二宫星曜提问，逐步学习紫微斗数的看盘方法。',
  alternates: { canonical: '/learn' },
};

export default function Page() { return <SharedPage />; }
