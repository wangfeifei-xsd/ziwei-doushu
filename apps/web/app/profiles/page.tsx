import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: '档案管理 · 紫微命盘',
  description: '集中管理出生档案，查找、编辑出生资料，随时打开紫微命盘。',
  alternates: { canonical: '/profiles' },
  robots: { index: false, follow: false },
};

import SharedPage from '@ziwei/features/pages/profiles';
export default function Page() { return <SharedPage />; }
