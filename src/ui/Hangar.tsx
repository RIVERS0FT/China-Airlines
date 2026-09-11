import { useState } from 'react';
import { aircraftSpecs, AIRCRAFT_KIND_LABEL, UPGRADE_LABEL, retrofitPrice, hangarPrice, airport, type UpgradeKey } from '../core/catalog.js';
import { MAX_FLEET, manifest, type GameState } from '../core/game.js';
import { controller, useGame } from '../runtime.js';
import { PlaneArt, money, ignore } from './Panels.js';

export function Hangar({ game, busy, onSelect }: { game: GameState; busy: boolean; onSelect: (id: string) => void }) {
  const [selected, setSelected] = useState(game.fleet[0]!.id);
  const p = game.fleet.find(p => p.id === selected) ?? game.fleet[0]!, m = aircraftSpecs(p);
  const view = useGame();
  const reason = p.flight ? '飞行中，抵达并完成周转后可改装' : p.autoRouteId ? '请先停止自动往返' : p.itinerary.length ? '请先取消剩余运输计划' : p.readyAt > game.simTime ? '地面周转中' : '';
  const full = game.hangarSlots >= MAX_FLEET;
  const details: Record<UpgradeKey, string> = {
    capacity: `客舱 ${m.seats} 人 / 货舱 ${m.cargo} 吨`, engine: `速度参数 ${m.speed}`,
    range: `单段航程 ${m.range} km`, efficiency: `每公里成本 ${m.costKm.toFixed(2)} 币`
  };
  return <section className="hangar-workshop">
    <div className="hangar-capacity"><div><strong data-testid="hangar-capacity">机位 {game.fleet.length} / {game.hangarSlots}</strong><small>扩建机库后才能继续增加飞机，最高 {MAX_FLEET} 架。</small></div>
      <button disabled={busy || full || game.credits < hangarPrice(game.hangarSlots)} onClick={() => ignore(controller.command({ type: 'expand-hangar' }))}>{full ? '机库容量已满级' : `扩建 2 个机位 · ${money(hangarPrice(game.hangarSlots))}`}</button></div>
    <div className="workshop-grid"><aside className="hangar-selector" aria-label="机库飞机列表">{game.fleet.map(item => <button key={item.id} aria-pressed={p.id === item.id} onClick={() => setSelected(item.id)}><strong>{aircraftSpecs(item).name}</strong><span>{item.id} · {item.flight ? '飞行中' : airport(item.airportId).city}</span><small>{AIRCRAFT_KIND_LABEL[aircraftSpecs(item).kind]}</small></button>)}</aside>
      <div className="workshop-detail"><div className="workshop-plane"><span className={`type-ribbon ${m.kind}`}>{AIRCRAFT_KIND_LABEL[m.kind]}</span><PlaneArt variant={m.family === 'lark' ? 0 : m.family === 'swallow' ? 1 : 2} cargo={m.kind === 'cargo'}/><h3>{m.name} · {p.id}</h3><p>机上 {manifest(game, p.id).length} 单 · {reason || '地面待命，可进行改装'}</p><button onClick={() => onSelect(p.id)}>前往这架飞机</button></div>
        <div className="upgrade-grid">{(Object.keys(UPGRADE_LABEL) as UpgradeKey[]).map(key => {
          const max = p.upgrades[key] >= 3, price = retrofitPrice(p, key), next = aircraftSpecs({ ...p, upgrades: { ...p.upgrades, [key]: Math.min(3, p.upgrades[key] + 1) } });
          const nextText = key === 'capacity' ? `${next.seats} 人 / ${next.cargo} 吨` : key === 'engine' ? `${next.speed}` : key === 'range' ? `${next.range} km` : `${next.costKm.toFixed(2)} 币/km`;
          return <article key={key} data-testid={`upgrade-${key}`}><header><strong>{UPGRADE_LABEL[key]}</strong><span>Lv.{p.upgrades[key]} / 3</span></header><p>{details[key]}</p><small>{max ? '已达到最高等级' : `下一级 → ${nextText}`}</small><button disabled={busy || max || Boolean(reason) || game.credits < price} aria-label={`升级${UPGRADE_LABEL[key]}`} onClick={() => ignore(controller.command({ type: 'retrofit', planeId: p.id, upgrade: key }))}>{max ? '已满级' : reason ? '暂不可改装' : game.credits < price ? '运营资金不足' : `改装 · ${money(price)}`}</button></article>;
        })}</div>
      </div></div>
    {view.error && <p role="alert" className="workshop-feedback">{view.error}</p>}{view.notice && <p role="status" className="workshop-feedback">{view.notice}</p>}
    <p className="workshop-note">改装立即生效；不改变机型类别、已有订单报酬或在途航班。纯客机不增设货舱，纯货机不增设座位。数值为航空化游戏配置。</p>
  </section>;
}
