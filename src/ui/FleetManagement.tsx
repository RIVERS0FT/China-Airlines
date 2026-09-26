import { useId, useRef } from 'react';
import { MAX_FLEET, type GameState } from '../core/game.js';
import { aircraftSpecs, airport, hangarPrice } from '../core/catalog.js';
import { controller } from '../runtime.js';
import { FleetRoster } from './FleetRoster.js';
import { FleetAircraftDetail } from './FleetAircraftDetail.js';
import { fleetStatuses, type FlightPhase } from './flight-status.js';
import { ignore, money } from './Panels.js';
import { useI18n } from '../i18n/I18n.js';
import { usePageState } from './shell/PageState.js';
import { PageToolbar } from './layout/PageFrame.js';
import './browse-ux.css';
import './fleet-management.css';

const phaseLabels: Record<FlightPhase, string> = {
  ready: '待命飞机', flying: '飞行中的飞机', turnaround: '地面周转',
  service: '地勤补能', automatic: '自动值勤', planned: '计划周转',
};
const extraPhases = ['turnaround', 'automatic', 'planned'] as const;

export function FleetManagement({ game, busy, selectedPlaneId, onSelect, onEmployee }: {
  game: GameState; busy: boolean; selectedPlaneId?: string; onSelect: (id: string) => void; onEmployee?: (id: number) => void;
}) {
  const [selectedId, setSelected] = usePageState('fleet.selected', selectedPlaneId ?? game.fleet[0]?.id ?? '');
  const [filter, setFilter] = usePageState<'all' | FlightPhase>('fleet.filter', 'all');
  const [search, setSearch] = usePageState('fleet.search', '');
  const selected = game.fleet.find(plane => plane.id === selectedId) ?? game.fleet[0];
  const { ui, modelName, airportName } = useI18n();
  const full = game.hangarSlots >= MAX_FLEET;
  const list = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null), input = useRef<HTMLInputElement>(null), listId = useId();
  const all = fleetStatuses(game), selectedStatus = all.find(status => status.planeId === selected?.id)!;
  if (!selected) return <section className="fleet-management"><p>{ui('尚无飞机，请前往飞机商店购买首架飞机并配置容量。')}</p></section>;
  const phaseName = (phase: FlightPhase) => ui(phaseLabels[phase]);
  const term = search.trim().toLowerCase();
  const shown = all.filter(status => {
    if (filter !== 'all' && status.phase !== filter) return false;
    const plane = game.fleet.find(item => item.id === status.planeId)!;
    return !term || [plane.id, aircraftSpecs(plane).name, modelName(plane.modelId, aircraftSpecs(plane).name), status.flight?.id,
      ...[status.from, status.to].filter((id): id is string => Boolean(id)).flatMap(id => [id, airport(id).city, airportName(id, airport(id).city)])]
      .some(value => value?.toLowerCase().includes(term));
  });
  function inspect(id: string) {
    setSelected(id);
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: 'start' });
  }
  function returnToList() {
    const target = list.current?.querySelector<HTMLElement>('.flight-enter[aria-pressed=true]') ?? input.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'center' });
  }
  function resetFilters() { setFilter('all'); setSearch(''); input.current?.focus({ preventScroll: true }); }
  return <section className="fleet-management">
    <PageToolbar className="fleet-management-toolbar hangar-capacity">
      <div><strong data-testid="hangar-capacity">{ui('机位 {used} / {capacity}', { used: game.fleet.length, capacity: game.hangarSlots })}</strong><small>{ui('扩建机库后才能继续增加飞机，最高 {max} 架。', { max: MAX_FLEET })}</small></div>
      <button disabled={busy || full || game.credits < hangarPrice(game.hangarSlots)} onClick={() => ignore(controller.command({ type: 'expand-hangar' }))}>{full ? ui('机库容量已满级') : ui('扩建 2 个机位 · {price}', { price: money(hangarPrice(game.hangarSlots)) })}</button>
    </PageToolbar>
    <div className="fleet-workspace">
      <section className="fleet-operations" aria-label={ui('机队运行清单')}>
        <div className="flight-board-toolbar"><div role="group" aria-label={ui('运行状态筛选')}>
          {(['all', 'ready', 'flying', 'service'] as const).map(key => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
            <span>{key === 'all' ? ui('全部飞机') : phaseName(key)}</span><b>{key === 'all' ? all.length : all.filter(status => status.phase === key).length}</b>
          </button>)}
        </div></div>
        <div className="flight-search-controls">
          <div className="browse-search-field"><label htmlFor={`${listId}-search`}>{ui('查找飞机')}</label><div className="browse-search-control">
            <input ref={input} id={`${listId}-search`} type="search" aria-label={ui('搜索飞机')} aria-controls={listId} placeholder={ui('编号、机型或城市')} autoComplete="off" spellCheck={false} value={search} onChange={event => setSearch(event.target.value)}/>
            <button type="button" aria-label={ui('清空飞机搜索')} disabled={!search} onClick={() => { setSearch(''); input.current?.focus({ preventScroll: true }); }}>{ui('清空')}</button>
          </div></div>
          <label className="flight-extra-filter">{ui('更多运行状态')}<select aria-label={ui('更多运行状态')} value={extraPhases.some(phase => phase === filter) ? filter : ''} onChange={event => setFilter(extraPhases.find(phase => phase === event.target.value) ?? 'all')}>
            <option value="">{ui('选择其他状态')}</option>{extraPhases.map(phase => <option key={phase} value={phase}>{phaseName(phase)} ({all.filter(status => status.phase === phase).length})</option>)}
          </select></label>
        </div>
        <p role="status" aria-live="polite" aria-atomic="true" className="browse-result-summary">{ui('显示 {shown} / {all} 架飞机 · {status}', { shown: shown.length, all: all.length, status: filter === 'all' ? ui('全部状态') : phaseName(filter) })}</p>
        <div ref={list} id={listId}><FleetRoster game={game} statuses={shown} selectedId={selected.id} onSelect={inspect}/></div>
        {!shown.length && <div className="flight-list-empty"><p>{term ? ui('没有匹配的飞机。可清空搜索或显示全部飞机。') : filter === 'ready' ? ui('暂无可立即装载的待命飞机。') : filter === 'flying' ? ui('当前没有飞行中的飞机。') : `${phaseName(filter as FlightPhase)}: 0`}</p><button type="button" onClick={resetFilters}>{ui('显示全部飞机')}</button></div>}
        <p className="flight-board-note">{ui('待命不包含周转、补能或自动值勤中的飞机。')}</p>
      </section>
      <FleetAircraftDetail game={game} plane={selected} status={selectedStatus} busy={busy} headingRef={heading} filteredOut={!shown.some(status => status.planeId === selected.id)} onReset={resetFilters} onReturn={returnToList} onSelect={onSelect} onEmployee={onEmployee}/>
    </div>
  </section>;
}
