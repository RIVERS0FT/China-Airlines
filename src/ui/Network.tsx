import { energyText } from './EnergyService.js';
import { useState } from 'react';
import { AIRPORTS, airport } from '../core/catalog.js';
import { MAX_PLAN_LEGS, planQuote, type GameState, type Plane } from '../core/game.js';
import { MapView } from './MapView.js';
import { PlanControls } from './PlanControls.js';
import { currentFlight } from './flight-status.js';
import { routePreview } from './route-preview.js';
import { money, duration } from './Panels.js';

export function Network({ game, plane, destination, setDestination, onReturn, onDepart, onInspect, busy }: {
  game: GameState; plane?: Plane; destination: string; setDestination: (id: string) => void;
  onReturn: () => void; onDepart: () => void; onInspect: (id: string, afterUnlock?: () => void) => void; busy: boolean;
}) {
  const [stops, setStops] = useState<string[]>([]), [auto, setAuto] = useState(false);
  const from = plane?.airportId ?? 'PEK', active = plane ? currentFlight(game, plane) : null;
  let draft: ReturnType<typeof planQuote> | null = null;
  if (!active && plane && stops.length) {
    try { draft = planQuote(game, plane, stops); }
    catch { draft = null; }
  }
  const summary = active ?? draft;
  const inFlight = Boolean(active);
  const preview = plane && !inFlight ? routePreview(game, plane, stops) : null;
  function appendUnlockedStop(id: string) {
    if (!plane || inFlight) return;
    const last = stops.at(-1) ?? plane.airportId;
    if (id === last || stops.length >= MAX_PLAN_LEGS) return;
    if (stops.length >= 1) setAuto(false);
    setStops([...stops, id]);
  }
  function chooseAirport(id: string) {
    if (busy) return;
    setDestination(id);
    if (!plane || inFlight) return;
    if (!game.airports.some(item => item.id === id)) {
      onInspect(id, () => appendUnlockedStop(id));
      return;
    }
    appendUnlockedStop(id);
  }
  function inspectSelected() {
    const afterUnlock = !inFlight && !game.airports.some(item => item.id === destination)
      ? () => appendUnlockedStop(destination)
      : undefined;
    onInspect(destination, afterUnlock);
  }
  const routeTitle = active
    ? `${airport(active.from).city} → ${airport(active.to).city} · ${active.id}`
    : stops.length ? [from, ...stops].map(id => airport(id).city).join(' → ') : `${airport(from).city} · 点击城市规划路线`;
  return <section className={`network-view${stops.length > 1 ? ' is-planning' : ''}`}><div className="network-summary" data-testid="network-summary"><button onClick={onReturn}>← 返回机场装载</button><strong>{routeTitle}</strong><span>{active ? '剩余' : '总用时'} <b>{active ? duration(active.remaining) : summary ? duration(summary.duration) : '—'}</b></span><span>{active ? '已付成本' : '成本'} <b data-testid="network-cost">{summary ? money(summary.cost) : '—'}</b></span><span>{active ? '到达交付' : '总交付'} <b data-testid="network-revenue">{summary ? money(summary.revenue) : '—'}</b></span><span>运输净收益 <b data-testid="network-profit">{summary ? money(summary.profit) : '—'}</b></span></div>
    <div className="network-mode">{active ? <><span className="flight-browse-note">当前航班已锁定 · 选择城市只浏览，不会更改航班目的地</span><div className="network-browse-tools"><label>浏览城市<select aria-label="选择机场" disabled={busy} value={destination} onChange={e => chooseAirport(e.target.value)}>{AIRPORTS.map(item => <option value={item.id} key={item.id}>{item.city} · {item.id}{game.airports.some(x => x.id === item.id) ? '' : ' · 未解锁'}</option>)}</select></label><button aria-label={`查看${airport(destination).city}机场详情`} onClick={inspectSelected}>城市详情</button></div></> : <span className="flight-browse-note" data-testid="route-instruction">依次点击已解锁城市组成路线 · 最多 {MAX_PLAN_LEGS} 段 · 城市管理按需打开</span>}{plane && <span className="network-energy" data-testid="network-energy">可用 {energyText(plane.energy.availableSeconds)} 点{draft && stops.length === 1 ? ` · 本段需 ${energyText(draft.legs[0]!.duration)} 点` : active ? plane.energy.reservedSeconds ? " · 当前航段已预留" : " · 旧航班免扣" : ""}</span>}</div>
    <div className="network-map"><MapView game={game} selected={destination} onSelect={chooseAirport} preview={preview}/></div>
    {!inFlight && plane && <PlanControls game={game} plane={plane} stops={stops} setStops={value => { setStops(value); if (value.length !== 1) setAuto(false); }} destination={destination} onChoose={chooseAirport} onInspect={inspectSelected} auto={auto} setAuto={setAuto} busy={busy} onDepart={onDepart}/>} 
  </section>;
}
