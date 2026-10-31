import type { Metadata } from 'next';
import ModelSettingsForm from '@/components/ModelSettingsForm';

export const metadata: Metadata = {
  title: '模型配置 · 紫微命盘',
  description: '配置 AI 命盘解读与合盘分析使用的模型服务。',
  robots: { index: false, follow: false },
};

export default function ModelSettingsPage() {
  return (
    <div className="min-h-svh" style={{ background: 'var(--bg-page)' }}>

      <main className="relative z-10 mx-auto max-w-[1080px] px-4 pb-16 pt-9 sm:px-8 sm:pb-24 sm:pt-14">
        <div className="mb-8 sm:mb-10">
          <p className="mb-3 text-[10px] font-medium tracking-[0.3em]" style={{ color: 'var(--ac)' }}>AI · 模型服务</p>
          <h1 className="mb-3 text-[28px] font-semibold tracking-[0.08em] sm:text-[34px]" style={{ color: 'var(--tx-0)' }}>模型配置</h1>
          <p className="max-w-xl text-sm leading-7" style={{ color: 'var(--tx-2)' }}>连接你的模型服务，为命盘解读与合盘分析提供 AI 支持。</p>
        </div>
        <ModelSettingsForm />
      </main>
    </div>
  );
}
