import { airport, aircraftSpecs } from '../core/catalog.js';
import { loadSummary, type GameState, type Plane } from '../core/game.js';

/** Original vector art. The cabin icons are a capacity diagram, not individual seats. */
export function AviationScene({ game, plane, airportId, onCabin }: {
  game: GameState; plane?: Plane; airportId: string; onCabin: () => void;
}) {
  const flying = Boolean(plane?.flight), a = airport(airportId);
  const total = plane ? loadSummary(game, plane.id) : { passengers: 0, cargo: 0 };
  const m = plane ? aircraftSpecs(plane) : null;
  const occupied = m && m.seats > 0 ? Math.ceil(total.passengers / m.seats * 14) : 0;
  return <div className={`aviation-stage ${flying ? 'is-flying' : ''}`} data-testid="airport-scene">
    <svg className="airport-backdrop" viewBox="0 0 1440 520" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs><linearGradient id="sky" x2="0" y2="1"><stop stopColor="#74c6ee"/><stop offset="1" stopColor="#e2f6fb"/></linearGradient><pattern id="terminal-windows" width="47" height="38" patternUnits="userSpaceOnUse"><rect width="43" height="33" rx="2" fill="#68abc7"/><path d="m2 2 34 29M23 2l18 16" stroke="#bcdeea" strokeWidth="3" opacity=".5"/></pattern></defs>
      <rect width="1440" height="520" fill="url(#sky)"/>
      <g fill="#fff" opacity=".8" className="scene-clouds"><path d="M70 120c-40-20-6-52 23-36 9-58 91-42 87 2 56-12 69 42 26 42H70ZM945 67c-10-22 19-41 42-26 5-49 76-39 81 5 42-18 78 20 42 39H960Z"/><path d="M490 63c-9-20 19-31 36-19 8-30 56-24 57 3 36-5 38 20 15 20H490Z"/></g>
      {!flying && <>
        <path d="M0 290 80 249l45 12 70-72 93 96 64-39 66 32 86-31 119 43 93-54 109 29 65-40 138 60 140-56 72 48v73H0Z" fill="#78b5ad"/>
        <path d="M0 315c160-61 295-17 417-7s233-54 379-11 373-63 644-6v84H0Z" fill="#83c5a2"/>
        <g stroke="#456b78" strokeWidth="3"><path d="M1115 320V144h58v176" fill="#ddd4bb"/><path d="M1088 113h111v47h-111z" fill="#5ca3bd"/><path d="m1080 112 20-24h88l23 24Z" fill="#386882"/><path d="M1144 88V61"/><rect x="1100" y="124" width="16" height="21" fill="#b0dcec"/><rect x="1129" y="124" width="16" height="21" fill="#b0dcec"/><rect x="1158" y="124" width="24" height="21" fill="#b0dcec"/>
          <path d="M-20 241h695v132H-20Z" fill="#ede2c8"/><path d="M-20 255h682v87H-20Z" fill="url(#terminal-windows)"/>
          <path d="m-30 240 74-38h525l119 38Z" fill="#f5eedc"/><path d="M55 342v-86m188 86v-86m188 86v-86m186 86v-86" strokeWidth="9"/>
          <path d="M591 312h233v31H591Z" fill="#d4dee0"/><path d="M610 317h190v19H610Z" fill="#70adc2"/>
        </g>
        <text x="345" y="229" textAnchor="middle" fontSize="22" fontWeight="800" fill="#305c70">{a.city}航空港 · {a.id}</text>
        <rect y="373" width="1440" height="147" fill="#acb7b5"/><path d="M0 403h1440" stroke="#eff2df" strokeWidth="4"/><path d="M0 501h1440" stroke="#f6db74" strokeWidth="5" strokeDasharray="70 25"/>
        <path d="m0 470 1440-24M250 373 68 520M1300 373l70 147" stroke="#d7dddd" strokeWidth="2"/>
        <g fill="#fae19b" stroke="#887a5b" strokeWidth="2"><path d="m1240 470 10-30 10 30Z"/><path d="m1280 470 10-30 10 30Z"/><path d="m148 470 10-30 10 30Z"/></g>
      </>}
      {flying && <><path d="M0 440q180-100 330 0t330 0 330 0 450-15v95H0Z" fill="#eaf7f7"/><path d="M0 485q200-65 430-5t540-15 470-5v60H0Z" fill="#fff"/></>}
    </svg>
    {plane && <button className="airplane-display" onClick={onCabin} aria-label="查看机上客货" data-testid="plane-art">
      <svg viewBox="0 0 1000 330" role="img" aria-label={`${m!.name}客舱与货舱示意`}>
        {!flying && <ellipse cx="490" cy="286" rx="365" ry="15" fill="#456b78" opacity=".15"/>}
        <g stroke="#466477" strokeWidth="3" strokeLinejoin="round">
          <path d="m694 151 75-117h54l-7 124Z" fill={(m!.kind === 'cargo' || m!.family === 'horizon') ? '#e79548' : '#2b8cc7'}/>
          <path d="m738 102 40-47h22l-11 47Z" fill="#f5ca59" stroke="none"/>
          <path d="M107 200c8-31 53-68 109-72h536l94 41 71 21-84 37H195c-55 0-100-8-88-27Z" fill="#fffdf1"/>
          <path d="M109 201h706l48-4-43 30H195c-51 0-81-6-86-26Z" fill="#76bbd0" stroke="none"/>
          <path d="M156 164q18-20 47-20v30h-58Z" fill="#476c87"/>
          <path d="m153 174 18-26m13 27v-30" stroke="#c2e4eb"/>
          <path d="m460 199 132 69 74-3-84-69" fill="#d8e6e7"/>
          <path d="m740 183 87 31 65-4-77-31" fill="#e0e7e4"/>
          <path d="M558 232h76v24h-76q-23-12 0-24Z" fill="#f2eee2"/><ellipse cx="553" cy="244" rx="9" ry="13" fill="#567689"/>
          {!flying && <><path d="M222 227v43m396-13v13"/><circle cx="219" cy="274" r="11" fill="#314657"/><circle cx="617" cy="275" r="11" fill="#314657"/><circle cx="641" cy="275" r="11" fill="#314657"/></>}
          <rect x="255" y="143" width="433" height="49" rx="8" fill="#d8e7e6"/>
          {m!.seats > 0 && Array.from({ length: 14 }, (_, i) => <g key={i} transform={`translate(${268 + i * 29},152)`}><path d="M0 0h14v20h6v7H-3V9h3Z" fill={i < occupied ? '#32a98a' : '#aebdbb'} strokeWidth="1.5"/><path d="M1 20h12" stroke="#f5ffff" strokeWidth="2"/></g>)}
          {m!.kind === 'cargo' && <g><rect x="290" y="148" width="340" height="41" rx="3" fill="#debb83"/>{Array.from({length:8},(_,i)=><rect key={i} x={301+i*40} y="151" width="33" height="35" fill={i < Math.ceil(total.cargo / m!.cargo * 8) ? "#b68548" : "#e6d7b5"} strokeWidth="1.5"/>)}</g>}
          {m!.cargo > 0 && <rect x="260" y="210" width="138" height="25" rx="3" fill="#eee7cb"/>}
          {m!.cargo > 0 && Array.from({ length: 4 }, (_, i) => <rect key={i} x={270 + i * 28} y="214" width="20" height="17" rx="1" fill={i < Math.ceil(total.cargo / m!.cargo * 4) ? '#d59d55' : '#d2d1bc'} strokeWidth="1"/>)}
        </g>
        <text x="459" y="124" textAnchor="middle" fill="#214f72" fontSize="19" fontWeight="800">中华航空 · {m!.name}</text>
        <text x="698" y="186" fill="#234f6b" fontSize="15" fontWeight="700">{plane.id}</text>
      </svg>
    </button>}
    {!plane && <div className="empty-apron">此机场暂无停靠飞机<br/><small>可在商店选择此处交付，或安排飞机飞来。</small></div>}
    <div className="scene-caption">{flying ? '航班运行中 · 可切换其他飞机继续经营' : '点击客货卡装载 · 点击飞机查看机上清单'}</div>
  </div>;
}
