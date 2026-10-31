import type { Metadata } from 'next';
export const metadata = {
  title: '紫微斗数知识库 · 14 主星 × 13 宫位 · GitHub开源档案',
  description: '依据GitHub开源档案与古籍《紫微斗数全集》《骨髓赋》编纂的紫微斗数知识库。覆盖 14 主星在 13 个宫位的完整论断，含一句话定调、核心论断、命盘依据、经典出处。',
  keywords: ['紫微斗数', 'GitHub开源', '开源紫微斗数', '紫微斗数全集', '紫微斗数全书', '14 主星', '12 宫位'],
};

import SharedPage from '@ziwei/features/pages/knowledge';
export default function Page() { return <SharedPage />; }
