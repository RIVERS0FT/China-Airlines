import { departmentPrice } from '../core/organization.js';
import { useState } from 'react';
import { upgradeLimit } from '../core/career-catalog.js';
import { EnergyService } from './EnergyService.js';
import { AircraftService } from './AircraftService.js';
import './management.css';
import './cabin-allocation.css';
import { aircraftSpecs, cabinAllocationPrice, UPGRADE_LABEL, retrofitPrice, type UpgradeKey } from '../core/catalog.js';
import type { GameState, Plane } from '../core/game.js';
import { controller, useGame } from '../runtime.js';
import { Icon, money, ignore } from './Panels.js';

function CabinAllocation({ plane, busy, reason, credits }: { plane: Plane; busy: boolean; reason: string; credits: number }) {
  const capacity = aircraftSpecs(plane).capacity;
  const [passengers, setPassengers] = useState(plane.allocation.passengers);
  const [cargo, setCargo] = useState(plane.allocation.cargo);
  const valid = Number.isSafeInteger(passengers) && Number.isSafeInteger(cargo) && passengers >= 0 && cargo >= 0 && passengers + cargo <= capacity;
  const price = valid ? cabinAllocationPrice(plane.allocation, { passengers, cargo }) : 0;
  const changed = passengers !== plane.allocation.passengers || cargo !== plane.allocation.cargo;
  return <section className="cabin-allocation" tabIndex={-1} aria-label="客货容量分配">
    <h4>客货舱位改装</h4><p>总容量 {capacity} 格 · 已分配 {plane.allocation.passengers + plane.allocation.cargo} 格 · 空闲 {capacity - plane.allocation.passengers - plane.allocation.cargo} 格</p>
    <div className="allocation-controls"><label>客位<input type="number" min="0" max={capacity} step="1" value={passengers} onChange={e=>setPassengers(e.target.valueAsNumber)}/></label><label>货位<input type="number" min="0" max={capacity} step="1" value={cargo} onChange={e=>setCargo(e.target.valueAsNumber)}/></label></div>
    <p className="service-reason">{reason || '可调整客货舱位，已装客货需保留足够空间'}</p>
    <small>{valid ? `改装费用 ${money(price)}；减少舱位不退款` : `客位与货位之和不得超过 ${capacity} 格`}</small>
    <button disabled={busy || Boolean(reason) || !valid || !changed || credits < price} onClick={()=>ignore(controller.command({ type: 'allocate-cabin', planeId: plane.id, passengers, cargo }))}>确认客货改装</button>
  </section>;
}
export function AircraftWorkshop({ game, busy, plane: p }: { game: GameState; busy: boolean; plane: Plane }) {
  const m = aircraftSpecs(p);
  const view = useGame();
  const reason = p.energy.serviceUntil !== null ? '地勤补能中' : p.flight ? '飞行中，抵达并完成周转后可改装' : p.autoRouteId ? '请先停止自动往返' : p.itinerary.length ? '请先取消剩余运输计划' : p.readyAt > game.simTime ? '地面周转中' : '';
  const details: Record<UpgradeKey, string> = {
    capacity: `总容量 ${m.capacity} 格`, engine: `速度参数 ${m.speed}`,
    range: `单段航程 ${m.range} km`, efficiency: `机体重量 ${m.weight}`
  };
  return <section className="fleet-workshop" aria-label="飞机管理操作">
    <div className="fleet-maintenance-grid">
      <EnergyService game={game} plane={p} busy={busy}/>
      <CabinAllocation key={p.id} plane={p} busy={busy} reason={reason} credits={game.credits}/>
    </div>
    <section className="fleet-upgrades" tabIndex={-1} aria-label="性能改装"><h3>性能改装</h3>
        <div className="upgrade-grid">{(Object.keys(UPGRADE_LABEL) as UpgradeKey[]).filter(key=>key!=='capacity').map(key => {
          const max = p.upgrades[key] >= upgradeLimit(p,key), price = departmentPrice(game, 'engineering', retrofitPrice(p, key)), next = aircraftSpecs({ ...p, upgrades: { ...p.upgrades, [key]: Math.min(upgradeLimit(p,key), p.upgrades[key] + 1) } });
          const nextText = key === 'engine' ? `${next.speed}` : key === 'range' ? `${next.range} km` : `重量 ${next.weight}`;
          return <article key={key} data-testid={`upgrade-${key}`}><header><strong><Icon name="maintenance"/>{UPGRADE_LABEL[key]}</strong><span>Lv.{p.upgrades[key]} / {upgradeLimit(p,key)}</span></header><p>{details[key]}</p><small>{max ? '已达到最高等级' : `下一级 → ${nextText}`}</small><button disabled={busy || max || Boolean(reason) || game.credits < price} aria-label={`升级${UPGRADE_LABEL[key]}`} onClick={() => ignore(controller.command({ type: 'retrofit', planeId: p.id, upgrade: key }))}>{max ? '已满级' : reason ? '暂不可改装' : game.credits < price ? '运营资金不足' : `改装 · ${money(price)}`}</button></article>;
        })}</div>
    </section>
    <AircraftService key={p.id} game={game} plane={p} busy={busy}/>
    {view.error && <p role="alert" className="workshop-feedback">{view.error}</p>}{view.notice && <p role="status" className="workshop-feedback">{view.notice}</p>}
  </section>;
}
