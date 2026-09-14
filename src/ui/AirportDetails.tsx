import { airport, aircraftSpecs, upgradePrice } from '../core/catalog.js';
import { MAX_WAITING, type GameState, type Plane } from '../core/game.js';
import { controller, useGame } from '../runtime.js';
import { airportTraffic } from './airport-presentation.js';
import { money, duration, ignore } from './Panels.js';
import { useI18n } from '../i18n/I18n.js';

export function AirportDetails({ game, id, busy, backLabel = '返回机场目录', onBack, onUnlocked, onVisit, onPlane, onRoute }: {
  game: GameState; id: string; busy: boolean; backLabel?: string; onBack: () => void; onUnlocked?: (id: string) => void;
  onVisit: (id: string) => void; onPlane: (id: string) => void; onRoute: (id: string) => void;
}) {
  const a = airportTraffic(game, id), view = useGame();
  const { t, ui, text, airportName, airportRegion, modelName } = useI18n();
  const price = a.level ? upgradePrice(a.level) : a.price;
  async function changeAirport() {
    const wasLocked = a.level === 0;
    try {
      await controller.command({ type: a.level ? 'upgrade' : 'unlock', airportId: id });
      if (wasLocked) onUnlocked?.(id);
    } catch { /* Controller exposes error. */ }
  }
  const city = (airportId: string) => airportName(airportId, airport(airportId).city);
  const flightRow = (p: Plane) => <li key={p.id}><span><b>{p.id} · {modelName(p.modelId,aircraftSpecs(p).name)}</b><small>{city(p.flight!.from)} → {city(p.flight!.to)} · {ui('{time} 后{event}',{time:duration(p.flight!.arriveAt-game.simTime),event:ui('抵达')})}</small></span><button onClick={() => onPlane(p.id)} aria-label={ui(`查看航班${p.id}`)}>{ui('查看航班')}</button></li>;
  return <section className="airport-details">
    <div className="airport-detail-hero"><div><h3>{t('airport.name',{city:city(a.id)})}</h3><p>{airportRegion(a.id,a.region)} · {a.level ? ui('{value} 级机场',{value:a.level}) : ui('尚未开放')}</p></div><button onClick={onBack}>{backLabel === '返回机场目录' ? ui('返回机场目录') : backLabel}</button></div>
    <div className="airport-detail-actions">
      {a.level > 0 && <><button className="primary" onClick={() => onVisit(id)}>{ui('进入候机大厅')}</button><button onClick={() => onRoute(id)}>{ui('安排飞机飞来')}</button></>}
      {a.level < 3 ? <button disabled={busy || game.credits < price} onClick={() => ignore(changeAirport())}>
        {a.level ? ui('升级机场') : ui('解锁机场')} {money(price)}
      </button> : <strong>{ui('机场已满级')}</strong>}
      {a.level < 3 && game.credits < price && <span className="airport-funds">{ui('运营资金不足')}</span>}
    </div>
    {view.error && <p className="workshop-feedback" role="alert">{text(view.error)}</p>}
    {view.notice && <p className="workshop-feedback" role="status">{text(view.notice)}</p>}
    {!a.level ? <p className="airport-empty">{ui('解锁后可浏览候机大厅、接收客货并购买飞机交付到此处。解锁不会把已有飞机移动到本机场。')}</p> : <>
      <div className="airport-facts" data-testid="airport-traffic-summary"><span>{ui('候运')} <b>{a.orders} / {MAX_WAITING} {ui('单')}</b></span><span>{ui('旅客')} <b>{a.passengers} {ui('人')}</b></span><span>{ui('货物')} <b>{a.cargo} {ui('吨')}</b></span><span>{ui('中转')} <b>{a.transfers} {ui('单')}</b></span></div>
      <p className="airport-explanation">{ui('{time} 后检查客源补充。中转订单已经接受、不会过期；查看页面不会刷新订单。',{time:duration(game.nextDemandAt-game.simTime)})}</p>
      <div className="airport-detail-columns">
        <section><h4>{ui('候运去向')}</h4><ul className="airport-destinations">{a.destinations.map(d => <li key={d.id}><strong>{city(d.id)}</strong><span>{d.passengers} {ui('人')} / {d.cargo} {ui('吨')} · {d.orders} {ui('单')}{d.transfers > 0 ? ` (${ui('中转')} ${d.transfers} ${ui('单')})` : ''}</span></li>)}</ul>{!a.destinations.length && <p className="airport-empty">{ui('暂无候运客货。')}</p>}</section>
        <section><h4>{ui('停靠飞机 · {count}',{count:a.parked.length})}</h4><ul className="airport-flight-list" data-testid="airport-parked">{a.parked.map(p => <li key={p.id}><span><b>{p.id} · {modelName(p.modelId,aircraftSpecs(p).name)}</b><small>{p.energy.serviceUntil !== null ? ui('补能剩余 {time}',{time:duration(p.energy.serviceUntil-game.simTime)}) : p.autoRouteId ? ui('自动值勤') : p.itinerary.length ? ui('运输计划中') : p.readyAt > game.simTime ? ui('周转剩余 {time}',{time:duration(p.readyAt-game.simTime)}) : ui('等待装载')}</small></span><button onClick={() => onPlane(p.id)} aria-label={ui(`操作飞机${p.id}`)}>{ui('选择飞机')}</button></li>)}</ul>{!a.parked.length && <p className="airport-empty">{ui('停机坪暂无飞机；已起飞的飞机不列为停靠。')}</p>}</section>
        <section><h4>{ui('飞来航班 · {count}',{count:a.incoming.length})}</h4><ul className="airport-flight-list" data-testid="airport-incoming">{a.incoming.map(flightRow)}</ul>{!a.incoming.length && <p className="airport-empty">{ui('暂无飞来航班。')}</p>}</section>
        <section><h4>{ui('已起飞航班 · {count}',{count:a.outgoing.length})}</h4><ul className="airport-flight-list" data-testid="airport-outgoing">{a.outgoing.map(flightRow)}</ul>{!a.outgoing.length && <p className="airport-empty">{ui('暂无从此处起飞的在途航班。')}</p>}</section>
      </div>
    </>}
  </section>;
}
