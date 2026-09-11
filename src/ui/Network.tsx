import { energyDepartureReason } from '../core/energy.js';
import { energyText } from './EnergyService.js';
import { useState } from 'react';
import { AIRPORTS, airport, routeId, routePrice, upgradePrice } from '../core/catalog.js';
import { manifest, quote, planQuote, type GameState, type Plane, type Command } from '../core/game.js';
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
  const [planMode, setPlanMode] = useState(false), [stops, setStops] = useState<string[]>([]);
  const [auto, setAuto] = useState(false); const a = airport(destination), own = game.airports.find(x => x.id === destination);
  const from = plane?.airportId ?? 'PEK', active = plane ? currentFlight(game, plane) : null;
  const opened = game.routes.some(r => r.id === routeId(from, destination));
  let q: ReturnType<typeof quote> | null = null, error = '';
  if (!active && plane && own && from !== destination) { try { q = quote(game, plane, destination); } catch (e) { error = e instanceof Error ? e.message : '无法飞行'; } }
  const energyReason = !active && plane && q ? energyDepartureReason(plane.energy, q.duration) : '';
  let summary: Pick<NonNullable<typeof q>, 'duration' | 'cost' | 'revenue' | 'profit'> | null = q;
  if (planMode) {
    try { summary = plane && stops.length ? planQuote(game, plane, stops) : null; }
    catch { summary = null; }
  }
  if (active) summary = active;
  const inFlight = Boolean(active), cooling = plane && (game.simTime < plane.readyAt || plane.itinerary.length > 0 || Boolean(plane.autoRouteId) || plane.energy.serviceUntil !== null);
  const preview = plane && !inFlight ? routePreview(game, plane, planMode ? stops : from === destination ? [] : [destination]) : null;
  const incompatible = Boolean(auto && plane && (manifest(game, plane.id).length === 0 || manifest(game, plane.id).some(o => o.to !== destination)));
  async function dispatch() {
    if (!plane) return;
    if (q && q.passengers === 0 && q.cargo === 0 && !window.confirm('当前为空机调机，只有成本、没有运输收入。确定起飞？')) return;
    try { await act({ type: 'dispatch', planeId: plane.id, to: destination, auto }); onDepart(); } catch { /* Controller exposes error. */ }
  }
  return <section className={`network-view${planMode ? ' is-planning' : ''}`}><div className="network-summary" data-testid="network-summary"><button onClick={onReturn}>← 返回机场装载</button><strong>{active ? `${airport(active.from).city} → ${airport(active.to).city} · ${active.id}` : planMode ? '多段运输计划' : `${airport(from).city} → ${a.city}`}</strong><span>{active ? '剩余' : planMode ? '总用时' : '用时'} <b>{active ? duration(active.remaining) : summary ? duration(summary.duration) : '—'}</b></span><span>{active ? '已付成本' : '成本'} <b data-testid="network-cost">{summary ? money(summary.cost) : '—'}</b></span><span>{active ? '到达交付' : planMode ? '总交付' : '本段交付'} <b data-testid="network-revenue">{summary ? money(summary.revenue) : '—'}</b></span><span>运输净收益 <b data-testid="network-profit">{summary ? money(summary.profit) : '—'}</b></span></div>
    <div className="network-mode">{active ? <span className="flight-browse-note">当前航班已锁定 · 下方仅浏览机场，不会更改航班目的地</span> : <><button aria-pressed={!planMode} onClick={() => setPlanMode(false)}>单段派航</button><button aria-pressed={planMode} onClick={() => { setPlanMode(true); setAuto(false); }}>多段计划</button></>}{plane && <span className="network-energy" data-testid="network-energy">可用 {energyText(plane.energy.availableSeconds)} 点{!active && !planMode && q ? ` · 本段需 ${energyText(q.duration)} 点` : active ? plane.energy.reservedSeconds ? " · 当前航段已预留" : " · 旧航班免扣" : ""}</span>}</div>
    <div className="network-map"><MapView game={game} selected={destination} onSelect={setDestination} preview={preview}/></div>
    <div className="network-controls"><label>目的地<select aria-label="选择机场" value={destination} onChange={e => setDestination(e.target.value)}>{AIRPORTS.map(a => <option value={a.id} key={a.id}>{a.city} · {a.id}{game.airports.some(x => x.id === a.id) ? '' : ' · 未解锁'}</option>)}</select></label>
      <div className="destination-detail"><button className="airport-detail-link" aria-label={`查看${a.city}机场详情`} onClick={() => onInspect(destination)}>{a.city}机场 · {own ? `${own.level} 级` : '未解锁'} ›</button><small>{error || energyReason || (inFlight ? '当前飞机正在飞行，可选其他飞机继续规划' : plane?.autoRouteId ? '请先停止自动值勤再手动派航' : cooling ? '地面周转或计划执行中' : from === destination ? '请选择其他机场' : incompatible ? '自动往返需装载且全部订单直达' : q?.revenue === 0 ? '本段无交付收入；未到最终目的地的订单留在机上' : '只在订单最终目的地付款，中转不重复结算')}</small></div>
      {!own ? <button className="gold-button" disabled={busy || game.credits < a.price} onClick={() => ignore(act({ type: 'unlock', airportId: destination }))}>解锁机场 {money(a.price)}</button> : <>
        {own.level < 3 && <button disabled={busy || game.credits < upgradePrice(own.level)} onClick={() => ignore(act({ type: 'upgrade', airportId: destination }))}>升级机场 {money(upgradePrice(own.level))}</button>}
        {!inFlight && !planMode && (from !== destination && !opened ? <button data-guide="open-route" className="gold-button" disabled={busy || game.credits < routePrice(from, destination)} onClick={() => ignore(act({ type: 'route', from, to: destination }))}>开通航线 {money(routePrice(from, destination))}</button> : <><label className="auto-choice"><input type="checkbox" checked={auto} disabled={!plane?.dispatcher} onChange={e => setAuto(e.target.checked)}/>自动往返{!plane?.dispatcher && <small className="crew-note">需在机库雇用调度员</small>}</label><button className="gold-button launch" data-testid="dispatch" disabled={busy || !q || !plane || inFlight || cooling || incompatible || Boolean(energyReason) || game.credits < (q?.cost ?? 0)} onClick={() => ignore(dispatch())}>确认起飞</button></>)}
      </>}
    </div>
    {!inFlight && planMode && plane && <PlanControls game={game} plane={plane} stops={stops} setStops={setStops} candidate={destination} busy={busy} onDepart={onDepart}/>}
  </section>;
}
