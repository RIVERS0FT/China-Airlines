import { useState } from 'react';
import { AIRPORTS, airport, upgradePrice } from '../core/catalog.js';
import { MAX_PLAN_LEGS, manifest, planQuote, type GameState, type Plane, type Command } from '../core/game.js';
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
  const from = plane?.airportId ?? 'PEK', active = plane ? currentFlight(game, plane) : null;
  const initiallySelected = plane && !active && destination !== from && game.airports.some(a => a.id === destination) ? [destination] : [];
  const [stops, setStopsState] = useState<string[]>(initiallySelected), [auto, setAuto] = useState(false);
  const a = airport(destination), own = game.airports.find(x => x.id === destination);
  const inFlight = Boolean(active), cooling = plane && (game.simTime < plane.readyAt || plane.itinerary.length > 0 || Boolean(plane.autoRouteId));

  function setStops(next: string[]) {
    setStopsState(next);
    if (next.length !== 1) setAuto(false);
    const last = next.at(-1);
    if (last) setDestination(last);
  }
  function chooseAirport(id: string) {
    setDestination(id);
    if (!plane || inFlight || !game.airports.some(a => a.id === id)) return;
    const last = stops.at(-1) ?? from;
    if (id === last || stops.length >= MAX_PLAN_LEGS) return;
    setStops([...stops, id]);
  }
  async function unlockSelected() {
    try {
      await act({ type: 'unlock', airportId: destination });
      if (!plane || inFlight || stops.length >= MAX_PLAN_LEGS) return;
      const last = stops.at(-1) ?? from;
      if (destination !== last) setStops([...stops, destination]);
    } catch { /* Controller exposes the error. */ }
  }

  let summary: ReturnType<typeof planQuote> | ReturnType<typeof currentFlight> | null = null, routeError = '';
  if (active) summary = active;
  else if (plane && stops.length) {
    try { summary = planQuote(game, plane, stops); }
    catch (e) { routeError = e instanceof Error ? e.message : '路线不可用'; }
  }
  const preview = plane && !inFlight ? routePreview(game, plane, stops) : null;
  const incompatible = Boolean(auto && plane && (stops.length !== 1 || manifest(game, plane.id).length === 0 || manifest(game, plane.id).some(o => o.to !== stops[0])));
  const routeTitle = stops.length ? [from, ...stops].map(id => airport(id).city).join(' → ') : `${airport(from).city} · 点击城市规划路线`;
  const guidance = !own ? '先解锁城市；解锁后即可直接加入路线，无需另开航线'
    : inFlight ? '当前飞机正在飞行；浏览地图不会更改已锁定航班'
    : plane?.autoRouteId ? '请先停止自动值勤再手动规划'
    : cooling ? '飞机正在地面周转或执行后续路线'
    : routeError || (stops.length >= MAX_PLAN_LEGS && destination !== stops.at(-1) ? '已达到 5 个航段上限，可撤销末站或清空路线' : incompatible ? '自动往返只支持单一目的地且机上订单全部直达' : '依次点击地图城市；点击顺序就是飞行顺序');

  return <section className={`network-view${!inFlight ? ' is-planning' : ''}`}>
    <div className="network-summary" data-testid="network-summary"><button onClick={onReturn}>← 返回机场装载</button><strong>{active ? `${airport(active.from).city} → ${airport(active.to).city} · ${active.id}` : routeTitle}</strong><span>{active ? '剩余' : '总用时'} <b>{active ? duration(active.remaining) : summary ? duration(summary.duration) : '—'}</b></span><span>{active ? '已付成本' : '成本'} <b data-testid="network-cost">{summary ? money(summary.cost) : '—'}</b></span><span>{active ? '到达交付' : '总交付'} <b data-testid="network-revenue">{summary ? money(summary.revenue) : '—'}</b></span><span>运输净收益 <b data-testid="network-profit">{summary ? money(summary.profit) : '—'}</b></span></div>
    <div className="network-map"><MapView game={game} selected={destination} onSelect={chooseAirport} preview={preview}/></div>
    <div className="network-controls"><label>城市<select aria-label="选择机场" value={destination} onChange={e => chooseAirport(e.target.value)}>{AIRPORTS.map(item => <option value={item.id} key={item.id}>{item.city} · {item.id}{game.airports.some(x => x.id === item.id) ? '' : ' · 未解锁'}</option>)}</select></label>
      <div className="destination-detail"><button className="airport-detail-link" aria-label={`查看${a.city}机场详情`} onClick={() => onInspect(destination)}>{a.city}机场 · {own ? `${own.level} 级` : '未解锁'} ›</button><small>{guidance}</small></div>
      {!inFlight && !own ? <button className="gold-button" disabled={busy || game.credits < a.price} onClick={() => ignore(unlockSelected())}>解锁机场 {money(a.price)}</button> : <>
        {!inFlight && own && own.level < 3 && <button disabled={busy || game.credits < upgradePrice(own.level)} onClick={() => ignore(act({ type: 'upgrade', airportId: destination }))}>升级机场 {money(upgradePrice(own.level))}</button>}
        {!inFlight && plane && stops.length === 1 && <label className="auto-choice"><input type="checkbox" checked={auto} disabled={!plane.dispatcher} onChange={e => setAuto(e.target.checked)}/>自动往返{!plane.dispatcher && <small className="crew-note">需在机库雇用调度员</small>}</label>}
      </>}
    </div>
    {!inFlight && plane && <PlanControls game={game} plane={plane} stops={stops} setStops={setStops} auto={auto} busy={busy} onDepart={onDepart}/>}
  </section>;
}
