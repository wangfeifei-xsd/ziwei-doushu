'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ThemeToggle from './ThemeToggle';

const LINKS = [
  ['/', '首页'], ['/qipan', '紫微起盘'], ['/heming', '双人合盘'],
  ['/knowledge', '星曜知识'], ['/library', '古籍原典'], ['/profiles', '生辰档案'],
];

export default function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-brand" aria-label="紫微命盘首页">
          <svg viewBox="0 0 40 40" width="35" height="35" fill="none" aria-hidden="true"><circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth=".8" /><circle cx="20" cy="20" r="14" stroke="currentColor" strokeWidth=".5" /><path d="M20 2v36M2 20h36M10 12l10 8 10-8M10 28l10-8 10 8" stroke="currentColor" strokeWidth=".6" /><path d="m20 14 1.8 4.2L26 20l-4.2 1.8L20 26l-1.8-4.2L14 20l4.2-1.8Z" fill="currentColor" /></svg>
          <span>紫微命盘</span><span className="brand-seal" aria-hidden="true">观星</span>
        </Link>
        <nav className="site-nav" aria-label="主导航">
          {LINKS.map(([href, label]) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href) || (href === '/qipan' && pathname === '/chart');
            return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={active ? 'is-active' : ''}>{label}</Link>;
          })}
        </nav>
        <div className="site-header-actions">
          <Link href="/settings/model" className="site-settings-link" aria-label="模型配置" title="模型配置"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="m9 3-.7 2.6-2.6.7L4 9l1.8 2-1.8 2 1.7 2.7 2.6.7L9 19h4l.7-2.6 2.6-.7L18 13l-1.8-2L18 9l-1.7-2.7-2.6-.7L13 3Z" /><circle cx="11" cy="11" r="3" /></svg><span>模型配置</span></Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
