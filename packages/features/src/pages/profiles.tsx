import ProfileManager from '@ziwei/features/components/ProfileManager';
import styles from '../components/profiles.module.css';

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
