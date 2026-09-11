import { energyDepartureReason } from '../core/energy.js';
import { energyText } from './EnergyService.js';
import { useState } from 'react';
import { AIRPORTS, airport, upgradePrice } from '../core/catalog.js';
import { MAX_PLAN_LEGS, planQuote, type GameState, type Plane, type Command } from '../core/game.js';
import { controller } from '../runtime.js';
import { MapView } from './MapView.js';
import { PlanControls } from './PlanControls.js';
import { currentFlight } from './flight-status.js';
import { routePreview } from './route-preview.js';
import { money, duration, ignore } from './Panels.js';
const act = (command: Command) => controller.command(command);

export function Network({ game, plane, destination, setDestination, onReturn, onDepart, onInspect, busy }: {
  game: GameState; plane?: Plane; destination: string; setDestination: (id: string) => void;
  onReturn: () => void; onDepart: () => void; onInspect: (id: string) => void; busy: boolean;
}) {
  const [stops, setStops] = useState<string[]>([]), [auto, setAuto] = useState(false);
  const a = airport(destination), own = game.airports.find(x => x.id === destination);
  const from = plane?.airportId ?? 'PEK', active = plane ? currentFlight(game, plane) : null;
  let draft: ReturnType<typeof planQuote> | null = null, error = '';
  if (!active && plane && stops.length) {
    try { draft = planQuote(game, plane, stops); }
    catch (e) { error = e instanceof Error ? e.message : '路线不可用'; }
  }
  const energyReason = plane && draft ? energyDepartureReason(plane.energy, draft.legs[0]!.duration) : '';
  const summary = active ?? draft;
  const inFlight = Boolean(active), cooling = plane && (game.simTime < plane.readyAt || plane.itinerary.length > 0 || Boolean(plane.autoRouteId) || plane.energy.serviceUntil !== null);
  const preview = plane && !inFlight ? routePreview(game, plane, stops) : null;
  const last = stops.at(-1) ?? from;
  function appendStop(id: string) {
    if (!plane || inFlight || !game.airports.some(item => item.id === id) || id === last || stops.length >= MAX_PLAN_LEGS) return;
    if (stops.length >= 1) setAuto(false);
    setStops([...stops, id]);
  }
  function chooseAirport(id: string) {
    setDestination(id);
    appendStop(id);
  }
  async function unlockSelected() {
    try {
      await act({ type: 'unlock', airportId: destination });
      if (!plane || inFlight || stops.length >= MAX_PLAN_LEGS || destination === last) return;
      if (stops.length >= 1) setAuto(false);
      setStops([...stops, destination]);
    } catch { /* Controller exposes error. */ }
  }
  const routeTitle = active
    ? `${airport(active.from).city} → ${airport(active.to).city} · ${active.id}`
    : stops.length ? [from, ...stops].map(id => airport(id).city).join(' → ') : `${airport(from).city} · 点击城市规划路线`;
  return <section className={`network-view${stops.length > 1 ? ' is-planning' : ''}`}><div className="network-summary" data-testid="network-summary"><button onClick={onReturn}>← 返回机场装载</button><strong>{routeTitle}</strong><span>{active ? '剩余' : '总用时'} <b>{active ? duration(active.remaining) : summary ? duration(summary.duration) : '—'}</b></span><span>{active ? '已付成本' : '成本'} <b data-testid="network-cost">{summary ? money(summary.cost) : '—'}</b></span><span>{active ? '到达交付' : '总交付'} <b data-testid="network-revenue">{summary ? money(summary.revenue) : '—'}</b></span><span>运输净收益 <b data-testid="network-profit">{summary ? money(summary.profit) : '—'}</b></span></div>
    <div className="network-mode">{active ? <span className="flight-browse-note">当前航班已锁定 · 下方仅浏览机场，不会更改航班目的地</span> : <span className="flight-browse-note" data-testid="route-instruction">依次点击已解锁城市组成路线 · 最多 {MAX_PLAN_LEGS} 段 · 无需另行开通航线</span>}{plane && <span className="network-energy" data-testid="network-energy">可用 {energyText(plane.energy.availableSeconds)} 点{draft && stops.length === 1 ? ` · 本段需 ${energyText(draft.legs[0]!.duration)} 点` : active ? plane.energy.reservedSeconds ? " · 当前航段已预留" : " · 旧航班免扣" : ""}</span>}</div>
    <div className="network-map"><MapView game={game} selected={destination} onSelect={chooseAirport} preview={preview}/></div>
    <div className="network-controls"><label>城市<select aria-label="选择机场" value={destination} onChange={e => chooseAirport(e.target.value)}>{AIRPORTS.map(item => <option value={item.id} key={item.id}>{item.city} · {item.id}{game.airports.some(x => x.id === item.id) ? '' : ' · 未解锁'}</option>)}</select></label>
      <div className="destination-detail"><button className="airport-detail-link" aria-label={`查看${a.city}机场详情`} onClick={() => onInspect(destination)}>{a.city}机场 · {own ? `${own.level} 级` : '未解锁'} ›</button><small>{inFlight ? '当前飞机正在飞行，可浏览城市但不能修改本航班' : plane?.autoRouteId ? '请先停止自动值勤再手动派航' : cooling ? '地面周转或已有计划执行中，路线可预览但暂不能起飞' : !own ? '先解锁城市；解锁后即可直接加入路线，无航线建设费' : error || energyReason || (stops.length >= MAX_PLAN_LEGS ? '路线已达 5 段，可撤销末段后继续修改' : '点击地图或按顺序选择城市，会依次追加到当前路线')}</small></div>
      {!own ? <button className="gold-button" disabled={busy || game.credits < a.price} onClick={() => ignore(unlockSelected())}>解锁机场 {money(a.price)}</button> : <>
        {own.level < 3 && <button disabled={busy || game.credits < upgradePrice(own.level)} onClick={() => ignore(act({ type: 'upgrade', airportId: destination }))}>升级机场 {money(upgradePrice(own.level))}</button>}
        {!inFlight && <label className="auto-choice"><input type="checkbox" checked={auto} disabled={!plane?.dispatcher || stops.length !== 1} onChange={e => setAuto(e.target.checked)}/>自动往返{!plane?.dispatcher ? <small className="crew-note">需在机库雇用调度员</small> : stops.length !== 1 ? <small className="crew-note">仅单一目的地可用</small> : null}</label>}
      </>}
    </div>
    {!inFlight && plane && <PlanControls game={game} plane={plane} stops={stops} setStops={value => { setStops(value); if (value.length !== 1) setAuto(false); }} auto={auto} busy={busy} onDepart={onDepart}/>}
  </section>;
}
