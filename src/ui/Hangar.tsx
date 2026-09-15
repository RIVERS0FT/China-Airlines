import { upgradeLimit, upgradeTickets } from '../core/career-catalog.js';
import { artAsset } from './art-assets.js';
import { EnergyService } from './EnergyService.js';
import { AircraftService } from './AircraftService.js';
import './management.css';
import { aircraftSpecs, AIRCRAFT_KIND_LABEL, UPGRADE_LABEL, retrofitPrice, hangarPrice, airport, type UpgradeKey } from '../core/catalog.js';
import { MAX_FLEET, manifest, type GameState } from '../core/game.js';
import { flightStatus } from './flight-status.js';
import { FlightMoney } from './FlightBoard.js';
import { orderPresentation } from './order-presentation.js';
import { controller, useGame } from '../runtime.js';
import { Icon, money, duration, ignore } from './Panels.js';

export function Hangar({ game, busy, selectedPlaneId, onInspect, onSelect }: { game: GameState; busy: boolean; selectedPlaneId?: string; onInspect: (id: string) => void; onSelect: (id: string) => void }) {
  const p = game.fleet.find(p => p.id === selectedPlaneId) ?? game.fleet[0]!, m = aircraftSpecs(p);
  const view = useGame(), status = flightStatus(game, p), orders = manifest(game, p.id);
  const reason = p.energy.serviceUntil !== null ? '地勤补能中' : p.flight ? '飞行中，抵达并完成周转后可改装' : p.autoRouteId ? '请先停止自动往返' : p.itinerary.length ? '请先取消剩余运输计划' : p.readyAt > game.simTime ? '地面周转中' : '';
  const full = game.hangarSlots >= MAX_FLEET;
  const details: Record<UpgradeKey, string> = {
    capacity: `客舱 ${m.seats} 人 / 货舱 ${m.cargo} 吨`, engine: `速度参数 ${m.speed}`,
    range: `单段航程 ${m.range} km`, efficiency: `机体重量 ${m.weight}`
  };
  return <section className="hangar-workshop">
    <div className="hangar-capacity"><div><strong data-testid="hangar-capacity">机位 {game.fleet.length} / {game.hangarSlots}</strong><small>扩建机库后才能继续增加飞机，最高 {MAX_FLEET} 架。</small></div>
      <button disabled={busy || full || game.credits < hangarPrice(game.hangarSlots)} onClick={() => ignore(controller.command({ type: 'expand-hangar' }))}>{full ? '机库容量已满级' : `扩建 2 个机位 · ${money(hangarPrice(game.hangarSlots))}`}</button></div>
    <div className="workshop-grid"><aside className="hangar-selector" aria-label="机库飞机列表">{game.fleet.map(item => {
      const itemStatus = flightStatus(game, item), spec = aircraftSpecs(item);
      return <button key={item.id} aria-pressed={p.id === item.id} onClick={() => onInspect(item.id)}><strong>{spec.name} · {item.id}</strong><span>{itemStatus.label} · {airport(itemStatus.from).city}{itemStatus.to ? ` → ${airport(itemStatus.to).city}` : ''}</span><small>旅客 {itemStatus.load.passengers}/{spec.seats} · 货物 {itemStatus.load.cargo}/{spec.cargo}</small>{itemStatus.remaining !== null && <small>{duration(itemStatus.remaining)} 后{itemStatus.nextEvent}</small>}</button>;
    })}</aside>
      <div className="workshop-detail"><div className="workshop-plane"><span className={`type-ribbon ${m.kind}`}>{AIRCRAFT_KIND_LABEL[m.kind]}</span><img className="painted-aircraft" src={artAsset(m.art)} alt={m.name}/><h3>{m.name} · {p.id}</h3><p>{status.label} · {airport(status.from).city}{status.to ? ` → ${airport(status.to).city}` : ''}{status.remaining !== null ? ` · ${duration(status.remaining)} 后${status.nextEvent}` : ''}</p>
          <p>机上 {orders.length} 单 · 旅客 {status.load.passengers}/{m.seats} 人 · 货物 {status.load.cargo}/{m.cargo} 吨</p><p>{reason || '地面待命，可进行改装'}</p>
          {status.flight && <FlightMoney flight={status.flight}/>}
          <button onClick={() => onSelect(p.id)}>前往这架飞机</button>
          <details className="fleet-manifest"><summary>机上清单 · {orders.length} 单</summary>{orders.length ? <ul>{orders.map(order => <li key={order.id} data-testid="fleet-onboard-order"><strong>✓ 已装机</strong><span>{airport(order.to).city} · {order.amount}{order.kind === 'passengers' ? '位旅客' : '吨货物'}</span><small>{orderPresentation(game, p, order).reason || '前往机场可卸载'}</small></li>)}</ul> : <p>暂无已装机客货。</p>}</details></div>
        <div className="upgrade-grid">{(Object.keys(UPGRADE_LABEL) as UpgradeKey[]).map(key => {
          const max = p.upgrades[key] >= upgradeLimit(p,key), price = retrofitPrice(p, key), next = aircraftSpecs({ ...p, upgrades: { ...p.upgrades, [key]: Math.min(upgradeLimit(p,key), p.upgrades[key] + 1) } });
          const nextText = key === 'capacity' ? `${next.seats} 人 / ${next.cargo} 吨` : key === 'engine' ? `${next.speed}` : key === 'range' ? `${next.range} km` : `重量 ${next.weight}`;
          return <article key={key} data-testid={`upgrade-${key}`}><header><strong><Icon name="maintenance"/>{UPGRADE_LABEL[key]}</strong><span>Lv.{p.upgrades[key]} / {upgradeLimit(p,key)}</span></header><p>{details[key]}</p><small>{max ? '已达到最高等级' : `下一级 → ${nextText}`}</small><button disabled={busy || max || Boolean(reason) || game.credits < price || game.career.tickets < upgradeTickets(p,key)} aria-label={`升级${UPGRADE_LABEL[key]}`} onClick={() => ignore(controller.command({ type: 'retrofit', planeId: p.id, upgrade: key }))}>{max ? '已满级' : reason ? '暂不可改装' : game.credits < price ? '运营资金不足' : `改装 · ${money(price)}＋${upgradeTickets(p,key)}券`}</button></article>;
        })}</div>
      </div></div>
    <EnergyService game={game} plane={p} busy={busy}/>
    <AircraftService key={p.id} game={game} plane={p} busy={busy}/>
    {view.error && <p role="alert" className="workshop-feedback">{view.error}</p>}{view.notice && <p role="status" className="workshop-feedback">{view.notice}</p>}
    <p className="workshop-note">改装立即生效；不改变机型类别、已有订单报酬或在途航班。纯客机不增设货舱，纯货机不增设座位。数值为航空化游戏配置。</p>
  </section>;
}
