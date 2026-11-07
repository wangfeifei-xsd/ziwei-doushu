import { Suspense } from 'react';
import type { Metadata } from 'next';
import SharedPage from '@ziwei/features/pages/dataset';
export const metadata: Metadata={title:'命盘资料研习 · 紫微命盘',description:'读取本地十三专题资料，检索、对照和练习命盘。'};
export default function Page(){return <Suspense fallback={<p>正在准备资料…</p>}><SharedPage/></Suspense>;}
