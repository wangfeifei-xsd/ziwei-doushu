const PALACES = ['命宫', '兄弟', '夫妻', '子女', '财帛', '疾厄', '迁移', '交友', '官禄', '田宅', '福德', '父母'];

/** A code-native celestial atlas, kept crisp at every screen size. */
export default function CelestialWheel({ compact = false }: { compact?: boolean }) {
  const point = (radius: number, angle: number) => ({
    x: 300 + radius * Math.sin(angle * Math.PI / 180),
    y: 300 - radius * Math.cos(angle * Math.PI / 180),
  });
  return (
    <svg viewBox="0 0 600 600" fill="none" className={`celestial-wheel${compact ? ' celestial-wheel-compact' : ''}`} aria-hidden="true">
      <g stroke="currentColor">
        {[274, 268, 251, 243, 188, 116, 105, 76].map((r, i) => <circle key={r} cx="300" cy="300" r={r} strokeWidth={i === 2 ? 1.2 : .65} opacity={i < 4 ? .7 : .4} />)}
        <circle cx="300" cy="300" r="283" strokeDasharray="1 7" opacity=".4" />
        {Array.from({ length: 120 }, (_, i) => {
          const a = point(i % 10 === 0 ? 253 : 260, i * 3), b = point(266, i * 3);
          return <path key={i} d={`M${a.x},${a.y}L${b.x},${b.y}`} strokeWidth={i % 10 === 0 ? 1 : .65} opacity=".7" />;
        })}
        {PALACES.map((name, i) => {
          const a = point(118, i * 30 + 15), b = point(242, i * 30 + 15), t = point(218, i * 30);
          return <g key={name}><path d={`M${a.x},${a.y}L${b.x},${b.y}`} opacity=".35" strokeWidth=".7" /><text x={t.x} y={t.y} fill="currentColor" stroke="none" textAnchor="middle" dominantBaseline="middle" fontSize="12" letterSpacing="3" className="celestial-palace-label">{name}</text></g>;
        })}
        <path d="M202 278L241 247L291 259L333 230L366 183L401 167L430 188" strokeWidth="1.3" opacity=".85" />
        {[[202,278],[241,247],[291,259],[333,230],[366,183],[401,167],[430,188]].map(([x,y],i) => <g key={i}><circle cx={x} cy={y} r={i === 3 ? 4 : 3} fill="currentColor" stroke="none" /><circle cx={x} cy={y} r="8" opacity=".2" strokeWidth=".6" /></g>)}
        <path d="M178 374L201 405L249 395L275 431M371 367L403 392L430 360M197 176L224 193L250 172" opacity=".45" strokeWidth=".7" />
        {[[178,374],[201,405],[249,395],[275,431],[371,367],[403,392],[430,360],[197,176],[224,193],[250,172]].map(([x,y])=><circle key={`${x}-${y}`} cx={x} cy={y} r="2" fill="currentColor" stroke="none" opacity=".65" />)}
        {[0,90,180,270].map(a=>{const p=point(274,a);return <g key={a}><circle cx={p.x} cy={p.y} r="5" fill="var(--bg-0)" /><path d={`M${p.x-9},${p.y}h18M${p.x},${p.y-9}v18`} strokeWidth=".65" /></g>;})}
        <path d="M300 224v-18m0 188v-18M224 300h-18m188 0h-18" opacity=".55" />
      </g>
      <circle cx="300" cy="300" r="44" fill="var(--bg-0)" stroke="currentColor" strokeWidth=".8" />
      <path d="M300 264a36 36 0 0 1 0 72 18 18 0 0 1 0-36 18 18 0 0 0 0-36Z" fill="currentColor" opacity=".85" />
      <circle cx="300" cy="282" r="4" fill="var(--bg-0)" /><circle cx="300" cy="318" r="4" fill="currentColor" />
    </svg>
  );
}
