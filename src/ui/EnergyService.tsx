import { type GameState, type Plane } from '../core/game.js';
import { ENERGY_CAPACITY_SECONDS, ENERGY_SECONDS_PER_POINT, ENERGY_SERVICE_SECONDS } from '../core/energy.js';
import { controller } from '../runtime.js';
import { Icon, duration, ignore } from './Panels.js';
import './energy.css';
/** Exact seconds remain in the save; only the display rounds points. */
export const energyText = (seconds: number) => (seconds / ENERGY_SECONDS_PER_POINT).toFixed(2);
export function EnergyService({ game, plane, busy }: { game: GameState; plane: Plane; busy: boolean }) {
  const e = plane.energy, servicing = e.serviceUntil !== null;
  const reason = plane.flight ? (e.reservedSeconds ? `飞行中，当前航段已预留 ${energyText(e.reservedSeconds)} 点` : '旧版在途航班豁免，不追扣能量') : plane.autoRouteId ? '请先停止自动值勤' : plane.itinerary.length ? '请先取消剩余计划' : plane.readyAt > game.simTime ? '地面周转中' : '';
  return <section className="energy-service" aria-label="飞机能量管理">
    <header><h3><Icon name="energy"/>飞机能量</h3><strong data-testid="hangar-energy">{energyText(e.availableSeconds)} / {ENERGY_CAPACITY_SECONDS / ENERGY_SECONDS_PER_POINT} 点</strong></header>
    <progress aria-label="可用能量" value={e.availableSeconds} max={ENERGY_CAPACITY_SECONDS}/>
    <p>可再飞 {duration(e.availableSeconds)}。每飞行 60 秒需要 1 点，起飞前预留整段；不到一分钟按秒计算。</p>
    <p data-testid="energy-service-status">{servicing ? `地勤补能中 · ${duration(e.serviceUntil! - game.simTime)} 后补满` : reason || (e.availableSeconds === ENERGY_CAPACITY_SECONDS ? '能量已满' : '可安排地勤补能')}</p>
    {servicing ? <button disabled={busy} onClick={() => ignore(controller.command({ type: 'cancel-energy-service', planeId: plane.id }))}>取消地勤补能</button> : <button disabled={busy || Boolean(reason) || e.availableSeconds === ENERGY_CAPACITY_SECONDS} onClick={() => ignore(controller.command({ type: 'service-energy', planeId: plane.id }))}>开始地勤补能</button>}
    <small>补能 {ENERGY_SERVICE_SECONDS} 秒，费用 0，完成前不增加能量；取消不补能。240 点容量采用旧版攻略示例，免费补能是航空化暂定规则，并非已核实的原版恢复方式。</small>
  </section>;
}
