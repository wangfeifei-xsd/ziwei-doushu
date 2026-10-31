import Link from 'next/link';

export default function ModelSettingsLink() {
  return (
    <Link href="/settings/model" aria-label="模型配置" title="模型配置"
      className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-full px-1.5 text-xs sm:px-2"
      style={{ color: 'var(--ac)' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m9 3-.6 2.3-2 .9-2.2-.7-2 3.5 1.7 1.6v2.8L2.2 15l2 3.5 2.2-.7 2 .9L9 21h4l.6-2.3 2-.9 2.2.7 2-3.5-1.7-1.6v-2.8L19.8 9l-2-3.5-2.2.7-2-.9L13 3Z" transform="translate(1 0)" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <span className="hidden sm:inline">模型配置</span>
    </Link>
  );
}
