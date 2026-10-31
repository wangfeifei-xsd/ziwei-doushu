import type { Metadata } from 'next';
export const metadata = { title: '服务条款 · 紫微命盘', description: '紫微命盘服务条款与用户协议' };

import SharedPage from '@ziwei/features/pages/terms';
export default function Page() { return <SharedPage />; }
