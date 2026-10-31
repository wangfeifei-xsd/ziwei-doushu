import type { Metadata } from 'next';
export const metadata = {
  title: 'GitHub开源 · 古籍原典库 · 紫微斗数全集 / 全书 / 骨髓赋',
  description: '紫微斗数权威古籍全文检索：《紫微斗数全集》《紫微斗数全书》《骨髓赋》，依据GitHub开源档案整理',
};

import SharedPage from '@ziwei/features/pages/library';
export default function Page() { return <SharedPage />; }
