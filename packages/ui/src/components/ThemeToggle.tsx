'use client';
import { useTheme } from '@ziwei/ui/components/ThemeProvider';

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button type="button" onClick={toggle} className="theme-toggle" aria-label={isDark ? '切换亮色主题' : '切换暗色主题'} title={isDark ? '切换为宣纸墨金' : '切换为玄青星图'}>
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><circle cx="10" cy="10" r="3" /><path d="M10 1v2m0 14v2M1 10h2m14 0h2M3.6 3.6 5 5m10 10 1.4 1.4M3.6 16.4 5 15M15 5l1.4-1.4" /></svg>
      <span className="theme-toggle-track"><span /></span>
      <svg viewBox="0 0 20 20" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M14 2a8 8 0 1 0 4 11A7 7 0 0 1 14 2Z" /></svg>
    </button>
  );
}
