import { useState } from 'react';
import { airport } from '../core/catalog.js';
import { legQuote, manifest, type GameState, type Plane } from '../core/game.js';
import { DISPATCHER_PRICE, resaleValue } from '../core/management.js';
import { controller } from '../runtime.js';
import { money, ignore } from './Panels.js';

/** Confirmations never change state; the core rechecks every operation. */
export function AircraftService({ game, plane, busy }: { game: GameState; plane: Plane; busy: boolean }) {
  const [selected, setSelected] = useState('');
  const destinations = game.airports.map(a => a.id).filter(id => id !== plane.airportId)
    .filter(id => { try { legQuote(game, plane, plane.airportId, id); return true; } catch { return false; } });
  const to = destinations.includes(selected) ? selected : destinations[0] ?? '';
  const reason = plane.flight ? '飞行中，请等待落地' : plane.autoRouteId ? '请先停止自动值勤' : plane.itinerary.length ? '请先取消剩余路线' : plane.readyAt > game.simTime ? '地面周转中' : '';
  const jobs = manifest(game, plane.id);
  const saleReason = reason || (game.fleet.length <= 1 ? '必须保留至少一架飞机' : jobs.length ? '请先卸下全部客货' : '');
  const incompatible = jobs.some(order => order.to !== to);
  const value = resaleValue(plane);
  function sell() {
    if (!window.confirm(`出售 ${plane.id}，收回 ${money(value)}？机位将释放，改装和随航调度员合同随飞机移除。此操作不能撤销。`)) return;
    ignore(controller.command({ type: 'sell-plane', planeId: plane.id }));
  }
  return <div className="aircraft-services">
    <section className="crew-card" aria-label="随航调度员">
      <header><span className="crew-avatar" aria-hidden="true">调</span><div><h3>随航调度员</h3><p data-testid="crew-status">{plane.dispatcher ? plane.autoRouteId ? '已上岗 · 自动值勤' : '已雇用 · 等待安排' : '未雇用 · 手动经营'}</p></div></header>
      <p>只装真实直达客货，按机型容量装载；无订单就等待，不空飞刷收益。</p>
      <small>一次雇用 {money(DISPATCHER_PRICE)}，无周期工资。首架及旧存档飞机保留免费调度员；新购飞机需单独雇用。</small>
      {!plane.dispatcher ? <button disabled={busy || Boolean(reason) || game.credits < DISPATCHER_PRICE} onClick={() => ignore(controller.command({ type: 'hire-dispatcher', planeId: plane.id }))}>雇用随航调度员</button> : <>
        {plane.autoRouteId ? <button disabled={busy} onClick={() => ignore(controller.command({ type: 'stop', planeId: plane.id }))}>停止自动值勤</button> : <div className="crew-duty-controls"><label>值勤目的地<select aria-label="值勤目的地" value={to} disabled={!destinations.length || busy || Boolean(reason)} onChange={e => setSelected(e.target.value)}>{!destinations.length && <option value="">暂无符合机型条件的已解锁城市</option>}{destinations.map(id => <option key={id} value={id}>{airport(id).city}</option>)}</select></label><button disabled={busy || Boolean(reason) || !to || incompatible} onClick={() => ignore(controller.command({ type: 'start-duty', planeId: plane.id, to }))}>启动自动值勤</button></div>}
        {incompatible && !plane.autoRouteId && to && <p>机上有其他目的地订单，请先卸下或手动完成运输。</p>}
        <button className="subtle-action" disabled={busy || Boolean(reason)} onClick={() => { if (window.confirm('解聘当前随航调度员？雇用费用不退还，重新雇用需再次付费。')) ignore(controller.command({ type: 'dismiss-dispatcher', planeId: plane.id })); }}>解聘调度员</button>
      </>}
      {reason && <p className="service-reason">{reason}</p>}
    </section>
    <section className="resale-card" aria-label="出售飞机">
      <h3>机队更新</h3><span className="resale-tag">预计收回</span><strong className="resale-price" data-testid="resale-value">{money(value)}</strong>
      <p>机体基础价的50%＋改装投入的25%。不退还雇用费或机库扩建费。</p>
      <p>必须卸空、停止自动运输并完成周转；不能出售最后一架。机场客货不会随飞机删除。</p>
      <button className="sell-aircraft" disabled={busy || Boolean(saleReason)} onClick={sell}>出售这架飞机</button>
      <small data-testid="sale-reason">{saleReason || '可出售 · 需再次确认，不能撤销'}</small>
      <small>机队历史最高规模：{game.fleetPeak} 架。已达成任务不因售机撤销，售机所得不计入运输收入。</small>
    </section>
  </div>;
}
