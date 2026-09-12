import { airport, aircraftSpecs, upgradePrice } from '../core/catalog.js';
import { MAX_WAITING, type GameState, type Plane } from '../core/game.js';
import { controller, useGame } from '../runtime.js';
import { airportTraffic } from './airport-presentation.js';
import { money, duration, ignore } from './Panels.js';

export function AirportDetails({ game, id, busy, backLabel = '返回机场目录', onBack, onUnlocked, onVisit, onPlane, onRoute }: {
  game: GameState; id: string; busy: boolean; backLabel?: string; onBack: () => void; onUnlocked?: (id: string) => void;
  onVisit: (id: string) => void; onPlane: (id: string) => void; onRoute: (id: string) => void;
}) {
  const a = airportTraffic(game, id), view = useGame();
  const price = a.level ? upgradePrice(a.level) : a.price;
  async function changeAirport() {
    const wasLocked = a.level === 0;
    try {
      await controller.command({ type: a.level ? 'upgrade' : 'unlock', airportId: id });
      if (wasLocked) onUnlocked?.(id);
    } catch { /* Controller exposes error. */ }
  }
  const flightRow = (p: Plane) => <li key={p.id}><span><b>{p.id} · {aircraftSpecs(p).name}</b><small>{airport(p.flight!.from).city} → {airport(p.flight!.to).city} · {duration(p.flight!.arriveAt - game.simTime)} 后到达</small></span><button onClick={() => onPlane(p.id)} aria-label={`查看航班${p.id}`}>查看航班</button></li>;
  return <section className="airport-details">
    <div className="airport-detail-hero"><span className="airport-code-badge">{a.id}</span><div><h3>{a.city}航空港</h3><p>{a.region} · {a.level ? `${a.level} 级机场` : '尚未开放'}</p></div><button onClick={onBack}>{backLabel}</button></div>
    <div className="airport-detail-actions">
      {a.level > 0 && <><button className="primary" onClick={() => onVisit(id)}>进入候机大厅</button><button onClick={() => onRoute(id)}>安排飞机飞来</button></>}
      {a.level < 3 ? <button disabled={busy || game.credits < price} onClick={() => ignore(changeAirport())}>
        {a.level ? '升级机场' : '解锁机场'} {money(price)}
      </button> : <strong>机场已满级</strong>}
      {a.level < 3 && game.credits < price && <span className="airport-funds">运营资金不足</span>}
    </div>
    {view.error && <p className="workshop-feedback" role="alert">{view.error}</p>}
    {view.notice && <p className="workshop-feedback" role="status">{view.notice}</p>}
    {!a.level ? <p className="airport-empty">解锁后可浏览候机大厅、接收客货并购买飞机交付到此处。解锁不会把已有飞机移动到本机场。</p> : <>
      <div className="airport-facts" data-testid="airport-traffic-summary"><span>候运 <b>{a.orders} / {MAX_WAITING} 单</b></span><span>旅客 <b>{a.passengers} 人</b></span><span>货物 <b>{a.cargo} 吨</b></span><span>中转 <b>{a.transfers} 单</b></span></div>
      <p className="airport-explanation">{duration(game.nextDemandAt - game.simTime)} 后检查客源补充。中转订单已经接受、不会过期；查看页面不会刷新订单。</p>
      <div className="airport-detail-columns">
        <section><h4>候运去向</h4><ul className="airport-destinations">{a.destinations.map(d => <li key={d.id}><strong>{d.city} · {d.id}</strong><span>{d.passengers} 人 / {d.cargo} 吨 · {d.orders} 单{d.transfers > 0 ? `（中转 ${d.transfers} 单）` : ''}</span></li>)}</ul>{!a.destinations.length && <p className="airport-empty">暂无候运客货。</p>}</section>
        <section><h4>停靠飞机 · {a.parked.length}</h4><ul className="airport-flight-list" data-testid="airport-parked">{a.parked.map(p => <li key={p.id}><span><b>{p.id} · {aircraftSpecs(p).name}</b><small>{p.energy.serviceUntil !== null ? `补能剩余 ${duration(p.energy.serviceUntil - game.simTime)}` : p.autoRouteId ? '自动值勤' : p.itinerary.length ? '运输计划中' : p.readyAt > game.simTime ? `周转剩余 ${duration(p.readyAt - game.simTime)}` : '等待装载'}</small></span><button onClick={() => onPlane(p.id)} aria-label={`操作飞机${p.id}`}>选择飞机</button></li>)}</ul>{!a.parked.length && <p className="airport-empty">停机坪暂无飞机；已起飞的飞机不列为停靠。</p>}</section>
        <section><h4>飞来航班 · {a.incoming.length}</h4><ul className="airport-flight-list" data-testid="airport-incoming">{a.incoming.map(flightRow)}</ul>{!a.incoming.length && <p className="airport-empty">暂无飞来航班。</p>}</section>
        <section><h4>已起飞航班 · {a.outgoing.length}</h4><ul className="airport-flight-list" data-testid="airport-outgoing">{a.outgoing.map(flightRow)}</ul>{!a.outgoing.length && <p className="airport-empty">暂无从此处起飞的在途航班。</p>}</section>
      </div>
    </>}
  </section>;
}
