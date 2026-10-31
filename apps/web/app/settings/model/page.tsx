import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: '模型配置 · 紫微命盘',
  description: '配置 AI 命盘解读与合盘分析使用的模型服务。',
  robots: { index: false, follow: false },
};

import SharedPage from '@ziwei/features/pages/model';
export default function Page() { return <SharedPage />; }
