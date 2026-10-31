import type { Metadata } from 'next';
import ProfileManager from './ProfileManager';
import styles from './profiles.module.css';

export const metadata: Metadata = {
  title: '档案管理 · 紫微命盘',
  description: '集中管理出生档案，查找、编辑出生资料，随时打开紫微命盘。',
  alternates: { canonical: '/profiles' },
  robots: { index: false, follow: false },
};

export default function ProfilesPage() {
  return (
    <div className={styles.page}>

      <main className={styles.main}>
        <ProfileManager />
      </main>
      <footer className={styles.footer}>紫微为门 · 知行合一</footer>
    </div>
  );
}
