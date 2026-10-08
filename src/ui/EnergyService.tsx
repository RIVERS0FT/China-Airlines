import { groundServiceQuote } from '../core/organization.js';
import { energyCapacity, type GameState, type Plane } from '../core/game.js';
import { ENERGY_SECONDS_PER_POINT } from '../core/energy.js';
import { controller } from '../runtime.js';
import { Icon, duration, ignore } from './Panels.js';
import './energy.css';
import { useI18n } from '../i18n/I18n.js';
/** Exact seconds remain in the save; only the display rounds points. */
export const energyText = (seconds: number) => (seconds / ENERGY_SECONDS_PER_POINT).toFixed(2);
export function EnergyService({ game, plane, busy }: { game: GameState; plane: Plane; busy: boolean }) {
  const service = groundServiceQuote(game, plane.airportId);
  const { ui } = useI18n();
  const e = plane.energy, servicing = e.serviceUntil !== null;
  const reason = plane.flight ? `飞行中，当前航段已预留 ${energyText(e.reservedSeconds)} 点` : plane.autoRouteId ? '请先停止自动值勤' : plane.itinerary.length ? '请先取消剩余计划' : plane.readyAt > game.simTime ? '地面周转中' : '';
  return <section className="energy-service" tabIndex={-1} aria-label={ui('飞机能量管理')}>
    <header><h3><Icon name="energy"/>{ui('飞机能量')}</h3><strong data-testid="hangar-energy">{energyText(e.availableSeconds)} / {energyCapacity(plane) / ENERGY_SECONDS_PER_POINT} {ui('点')}</strong></header>
    <progress aria-label={ui('可用能量')} value={e.availableSeconds} max={energyCapacity(plane)}/>
    <p data-testid="energy-service-status">{servicing ? ui('地勤补能中 · {time} 后补满',{time:duration(e.serviceUntil!-game.simTime)}) : ui(reason) || ui(e.availableSeconds===energyCapacity(plane)?'能量已满':'可安排地勤补能')}</p>
    {servicing ? <button disabled={busy} onClick={() => ignore(controller.command({ type: 'cancel-energy-service', planeId: plane.id }))}>{ui('取消地勤补能')}</button> : <button disabled={busy || Boolean(reason) || e.availableSeconds === energyCapacity(plane)} onClick={() => ignore(controller.command({ type: 'service-energy', planeId: plane.id }))}>{ui('开始地勤补能')}</button>}
    <small>{ui('下次补能 {seconds} 秒{detail}，费用 0', { seconds:service.seconds, detail:service.employee ? ui('（{name}负责，效率提升{reduction}%）', { name:service.employee.name, reduction:service.reduction }) : ui('（基础地勤）') })}</small>
  </section>;
}
