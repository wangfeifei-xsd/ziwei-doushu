import Link from '@ziwei/runtime/navigation';
import CelestialWheel from '@ziwei/ui/components/CelestialWheel';

const FEATURES = [
  { href: '/qipan', number: '壹', title: '紫微起盘', subtitle: '一纸命盘，观人生万象', text: '输入生辰，安星定宫，探索属于你的星曜格局。', icon: 'chart' },
  { href: '/heming', number: '贰', title: '双人合盘', subtitle: '两盘相照，知相处之道', text: '从双方命盘出发，理解关系中的默契与成长。', icon: 'moon' },
  { href: '/library', number: '叁', title: '古籍原典', subtitle: '溯源经典，研习星学', text: '读古籍原文，参考开源档案，在经典中寻得启发。', icon: 'book' },
];

export default function HomePage() {
  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="hero-landscape" aria-hidden="true" />
        <div className="home-hero-inner">
          <div className="hero-copy">
            <p className="eyebrow"><span />观天之道 · 执天之行</p>
            <h1><span>以星为引</span><br />观照人生<span className="title-seal" aria-hidden="true">紫微</span></h1>
            <p className="hero-lead">紫微为门，天地人为路，GitHub开源档案为依据。</p>
            <p className="hero-description">循星曜之序，探人生之理。<br />以传统星命智慧，照见人生的轨迹与可能。</p>
            <div className="hero-ctas">
              <Link href="/qipan" className="button-gold">开启我的命盘 <span aria-hidden="true">↗</span></Link>
              <Link href="/knowledge" className="hero-secondary">探索紫微知识 <span aria-hidden="true">→</span></Link>
            </div>
            <div className="hero-footnote"><span />开源体系 <i />真太阳时校正 <i />AI 深度解读</div>
          </div>
          <div className="hero-atlas">
            <div className="atlas-orbit" aria-hidden="true" />
            <CelestialWheel />
            <span className="atlas-caption">星垂于野 · 道在其中</span>
          </div>
        </div>
      </section>
      <div className="home-content">
        <div className="principles-strip">
          {[
            ['✧', '十四主星', '星曜流转，洞见本质'], ['◎', '十二宫位', '人生万象，各有所居'],
            ['☷', '开源体系', '承经典之脉，明天地之理'], ['◇', '知行合一', '知命而行，照见自己'],
          ].map(([icon, title, text]) => <div key={title}><span className="principle-icon" aria-hidden="true">{icon}</span><div><h2>{title}</h2><p>{text}</p></div></div>)}
        </div>
        <div className="home-features">
          {FEATURES.map(feature => <Link href={feature.href} className="feature-card" key={feature.href}>
            <div className={`feature-art feature-art-${feature.icon}`} aria-hidden="true">
              {feature.icon === 'chart' ? <CelestialWheel compact /> : feature.icon === 'moon' ? <svg viewBox="0 0 120 120" fill="none"><circle cx="46" cy="60" r="32" stroke="currentColor" strokeWidth=".8" /><circle cx="76" cy="60" r="32" stroke="currentColor" strokeWidth=".8" /><circle cx="46" cy="60" r="24" stroke="currentColor" strokeWidth=".5" strokeDasharray="2 4" /><path d="M46 28a32 32 0 0 1 0 64 25 25 0 0 0 0-64Z" fill="currentColor" opacity=".12" /></svg> : <svg viewBox="0 0 120 120" fill="none" stroke="currentColor"><path d="M17 29c20-7 30-5 43 4 13-9 23-11 43-4v65c-20-7-30-5-43 3-13-8-23-10-43-3Z" strokeWidth="1" /><path d="M60 33v64M26 42c11-3 18-1 26 3M26 53c11-3 18-1 26 3M26 64c11-3 18-1 26 3M26 75c11-3 18-1 26 3M69 45c8-4 15-6 26-3M69 56c8-4 15-6 26-3M69 67c8-4 15-6 26-3M69 78c8-4 15-6 26-3" strokeWidth=".7" /></svg>}
            </div>
            <div className="feature-copy"><p className="feature-number">{feature.number} · {feature.subtitle}</p><h2>{feature.title}</h2><p>{feature.text}</p></div>
            <span className="feature-arrow" aria-hidden="true">↗</span>
          </Link>)}
        </div>
        <footer className="home-footer"><span>紫微为门 · 知行合一</span><div><Link href="/privacy">隐私政策</Link><span>·</span><Link href="/terms">服务条款</Link></div></footer>
      </div>
    </div>
  );
}
