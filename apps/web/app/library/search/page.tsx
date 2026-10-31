import type { Metadata } from 'next';
export const metadata = {
  title: '搜索 · 古籍原典库',
};

import SharedPage from '@ziwei/features/pages/search';
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) { const resolved = await searchParams;  return <SharedPage searchParams={resolved} />; }
