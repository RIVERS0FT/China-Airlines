import { useGameViewport } from './GameViewport.js';
import { aircraftSpecs } from '../core/catalog.js';
import { loadSummary, type GameState, type Plane } from '../core/game.js';
import { artAsset } from './art-assets.js';

/** Painted scene and aircraft; capacity overlays remain read-only projections of real orders. */
export function AviationScene({ game, plane, onCabin }: {
  game: GameState; plane?: Plane; onCabin: () => void;
}) {
  const viewport = useGameViewport();
  const compact = viewport.height <= 600 && viewport.width >= viewport.height;
  const flying = Boolean(plane?.flight);
  const total = plane ? loadSummary(game, plane.id) : { passengers: 0, cargo: 0 };
  const m = plane ? aircraftSpecs(plane) : null;
  const seatSlots = m ? Math.min(14, m.seats) : 0;
  const occupied = m && m.seats > 0 ? Math.ceil(total.passengers / m.seats * seatSlots) : 0;
  const bellySlots = m ? Math.min(4, m.cargo) : 0;
  return <div className={`aviation-stage ${flying ? 'is-flying' : ''}`} data-testid="airport-scene">
    <svg className="airport-backdrop" viewBox="0 0 1440 520" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs><linearGradient id="sky" x2="0" y2="1"><stop stopColor="#74c6ee"/><stop offset="1" stopColor="#e2f6fb"/></linearGradient><pattern id="terminal-windows" width="47" height="38" patternUnits="userSpaceOnUse"><rect width="43" height="33" rx="2" fill="#68abc7"/><path d="m2 2 34 29M23 2l18 16" stroke="#bcdeea" strokeWidth="3" opacity=".5"/></pattern></defs>
      <rect width="1440" height="520" fill="url(#sky)"/>
      <g fill="#fff" opacity=".8" className="scene-clouds"><path d="M70 120c-40-20-6-52 23-36 9-58 91-42 87 2 56-12 69 42 26 42H70ZM945 67c-10-22 19-41 42-26 5-49 76-39 81 5 42-18 78 20 42 39H960Z"/><path d="M490 63c-9-20 19-31 36-19 8-30 56-24 57 3 36-5 38 20 15 20H490Z"/></g>
      {!flying && <>
        <image href={artAsset('airport-day-v1.jpg')} width="1440" height="520" preserveAspectRatio="xMidYMid slice"/>
      </>}
      {flying && <><path d="M0 440q180-100 330 0t330 0 330 0 450-15v95H0Z" fill="#eaf7f7"/><path d="M0 485q200-65 430-5t540-15 470-5v60H0Z" fill="#fff"/></>}
    </svg>
    {!flying && <div className="ground-props" aria-hidden="true">
      <img className="ground-tug" src={artAsset('tug-v1.png')} alt=""/>
      <img className="ground-trailer" src={artAsset('baggage-trailer-v1.png')} alt=""/>
      <img className="ground-worker" src={artAsset('ground-crew-v1.png')} alt=""/>
      <img className="ground-cones" src={artAsset('cones-v1.png')} alt=""/>
    </div>}
    {plane && <button className="airplane-display" onClick={onCabin} aria-label={flying ? '查看当前航班' : '查看机上客货'} data-testid="plane-art">
      <svg viewBox={compact ? "90 50 840 280" : "0 0 1000 330"} role="img" aria-label={`${m!.name}客舱与货舱示意`}>
        {!flying && <ellipse cx="490" cy="286" rx="365" ry="15" fill="#456b78" opacity=".15"/>}
        <image data-testid="aircraft-sprite" href={artAsset(flying ? 'aircraft-flight-v1.png' : m?.art ?? 'aircraft-v1.png')} x="95" y="0" width="810" height="310"/>
        <g className="cabin-overlay" stroke="#466477" strokeWidth="1.5" strokeLinejoin="round">
          <rect x="317" y="148" width="310" height="47" rx="7" fill="#f1fbfff2"/>
          <text x="329" y="163" stroke="none" fill="#214f72" fontSize="12" fontWeight="800">{m!.name} · {plane.id}　旅客 {total.passengers}/{m!.seats}</text>
          {Array.from({ length: seatSlots }, (_, i) => <g key={i} transform={`translate(${330 + i * 20},170)`}><path d="M0 0h9v11h4v5H-2V5h2Z" fill={i < occupied ? '#32a98a' : '#aebdbb'}/></g>)}
          {m!.seats === 0 && <text x="329" y="183" stroke="none" fill="#214f72" fontSize="12">货运机型 · 无旅客位</text>}
          {m!.cargo > 0 && <g><rect x="317" y="201" width="150" height="27" rx="5" fill="#fff6dcf2"/>
            <text x="324" y="219" stroke="none" fill="#725527" fontSize="12">货 {total.cargo}/{m!.cargo}</text>
            {Array.from({ length: bellySlots }, (_, i) => <rect key={i} x={388 + i * 17} y="207" width="12" height="14" rx="1" fill={i < Math.ceil(total.cargo / m!.cargo * bellySlots) ? '#d59d55' : '#d2d1bc'}/>)}
          </g>}
        </g>
      </svg>
    </button>}
    {!plane && <div className="empty-apron">此机场暂无停靠飞机<br/><small>可在商店选择此处交付，或安排飞机飞来。</small></div>}
    <div className="scene-caption">{flying ? '航班运行中 · 可切换其他飞机继续经营' : plane ? '点击客货装载 · 点击飞机查看机上清单' : '机场浏览 · 选择停靠飞机后才能装载'}</div>
  </div>;
}
