import Link from '@ziwei/runtime/navigation';
import CelestialWheel from '@ziwei/ui/components/CelestialWheel';

export default function NotFound() {
  return <main className="not-found-page">
    <CelestialWheel compact />
    <p className="eyebrow">星图之外 · 另寻一径</p>
    <h1>此处尚未有星光</h1>
    <p>你寻找的页面暂未收录。<br />回到星曜知识，继续探索紫微世界。</p>
    <Link href="/knowledge" className="button-gold">返回星曜知识 <span aria-hidden="true">→</span></Link>
  </main>;
}
