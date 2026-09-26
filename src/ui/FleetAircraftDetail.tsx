import { useRef, type Ref } from 'react';
import { aircraftSpecs, airport } from '../core/catalog.js';
import type { GameState, Plane } from '../core/game.js';
import { useI18n } from '../i18n/I18n.js';
import { artAsset } from './art-assets.js';
import { duration } from './Panels.js';
import { FlightMoney } from './FlightMoney.js';
import { AircraftWorkshop } from './AircraftWorkshop.js';
import { EmployeePortrait } from './EmployeePortrait.js';
import { employeeDisplayName } from './organization-presentation.js';
import type { FleetStatus } from './FleetRoster.js';

export function FleetAircraftDetail({ game, plane, status, busy, headingRef, filteredOut, onReset, onReturn, onSelect, onEmployee }: {
  game: GameState; plane: Plane; status: FleetStatus; busy: boolean; headingRef: Ref<HTMLHeadingElement>;
  filteredOut: boolean; onReset: () => void; onReturn: () => void; onSelect: (id: string) => void; onEmployee?: (id: number) => void;
}) {
  const { ui, locale, airportName, modelName } = useI18n(), spec = aircraftSpecs(plane);
  const pilot = game.career.employees.find(e => e.planeId === plane.id), flight = status.flight;
  const detail = useRef<HTMLElement>(null);
  function locate(selector: string) {
    const target = detail.current?.querySelector<HTMLElement>(selector);
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'start' });
  }
  return <section ref={detail} className="fleet-detail" id="fleet-aircraft-detail" aria-label={ui('飞机详情')}>
    <header className="fleet-detail-header"><h3 id="fleet-detail-heading" ref={headingRef} tabIndex={-1}>{modelName(plane.modelId, spec.name)} <small>{plane.id}</small></h3><button type="button" onClick={onReturn}>{ui('返回飞机列表')}</button></header>
    {filteredOut && <p className="fleet-filtered-selection">{ui('所选飞机不在当前筛选中。')}<button type="button" onClick={onReset}>{ui('清除筛选')}</button></p>}
    <div className="fleet-aircraft-hero">
      <img className="fleet-aircraft-art" src={artAsset(spec.art)} alt={modelName(plane.modelId, spec.name)}/>
      <div className="fleet-aircraft-specs"><span>{ui('总容量 {capacity} 格', { capacity: spec.capacity })}</span><span>{ui('客位 {passengers} · 货位 {cargo}', { passengers: spec.seats, cargo: spec.cargo })}</span><span>{ui('航程 {range} km', { range: spec.range })}</span></div>
      <button type="button" className="fleet-airport-action" aria-label={ui('前往这架飞机')} onClick={() => onSelect(plane.id)}>{ui('前往这架飞机')}<small>{ui(flight ? '查看飞行画面' : '机场装载与航线规划')}</small></button>
    </div>
    <div className="fleet-action-shortcuts" role="group" aria-label={ui('管理快捷入口')}>
      {([['飞机补能', '.energy-service'], ['客货改装', '.cabin-allocation'], ['性能改装', '.fleet-upgrades'], ['自动值勤', '.crew-card']] as const).map(([label, selector]) => <button key={selector} type="button" onClick={() => locate(selector)}>{ui(label)}</button>)}
    </div>
    <section className={`fleet-mission phase-${status.phase}`} aria-label={ui('当前任务')}>
      <header><h3>{ui('当前任务')}</h3><span className="flight-status-tag">{ui(status.label)}</span>{flight && <small>{flight.id}</small>}</header>
      <div className="fleet-mission-route"><strong>{airportName(status.from, airport(status.from).city)}{status.to ? ` → ${airportName(status.to, airport(status.to).city)}` : ui('航空港')}</strong><span>{status.remaining === null ? ui('地面待命，可装载后制定航线') : ui('{time} 后{event}', { time: duration(status.remaining), event: ui(status.nextEvent) })}</span></div>
      {flight && <progress className="fleet-flight-progress" aria-label={`${plane.id} ${ui('航班')}`} max={1} value={flight.progress}/>}
      <p>{ui('机上 {orders} 单 · 旅客 {passengers} 人 · 货物 {cargo} 吨', { orders: status.orders, passengers: status.load.passengers, cargo: status.load.cargo })}</p>
      {flight ? <><FlightMoney flight={flight}/><small>{ui('成本已在起飞时扣除，到达最终目的地后交付收入。')}</small></> : <small>{ui('尚未起飞，不预记下一班收入或成本。')}</small>}
      {status.onward.length > 0 && <p className="flight-onward">{ui('后续：{route}', { route: status.onward.map(id => airportName(id, airport(id).city)).join(' → ') })}</p>}
    </section>
    {pilot && onEmployee && <button className="fleet-employee-link" onClick={() => onEmployee(pilot.id)}><EmployeePortrait id={pilot.id}/><span>{locale === 'en-US' ? 'Assigned pilot' : '负责飞行员'} · {employeeDisplayName(pilot)}</span></button>}
    <AircraftWorkshop game={game} plane={plane} busy={busy}/>
  </section>;
}
