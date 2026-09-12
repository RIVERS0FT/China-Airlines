import { energyText } from './EnergyService.js';
import { useId, useRef, useState } from 'react';
import { aircraftSpecs, AIRCRAFT_KIND_LABEL, airport } from '../core/catalog.js';
import type { GameState } from '../core/game.js';
import { currentFlight, fleetStatuses, type FlightPhase } from './flight-status.js';
import { duration, money } from './Panels.js';
import './browse-ux.css';

const extraPhases = ['turnaround', 'service', 'automatic', 'planned'] as const;
const phaseLabels: Record<FlightPhase, string> = {
  ready: '待命飞机', flying: '飞行中的飞机', turnaround: '地面周转',
  service: '地勤补能', automatic: '自动值勤', planned: '计划周转'
};

export function FlightMoney({ flight }: { flight: NonNullable<ReturnType<typeof currentFlight>> }) {
  return <div className="flight-money" role="group" aria-label="当前航班收支">
    <span><small>已付成本</small><strong data-testid="flight-cost">{money(flight.cost)}</strong></span>
    <span><small>到达交付</small><strong data-testid="flight-revenue">{money(flight.revenue)}</strong></span>
    <span><small>本段净收益</small><strong data-testid="flight-profit">{money(flight.profit)}</strong></span>
  </div>;
}

/** A scene switcher, not another writer of economic state. */
export function FlightBoard({ game, selectedId, onSelect }: {
  game: GameState; selectedId?: string; onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | FlightPhase>('all'), [search, setSearch] = useState('');
  const input = useRef<HTMLInputElement>(null), listId = useId();
  const all = fleetStatuses(game), term = search.trim().toLowerCase();
  const shown = all.filter(status => {
    if (filter !== 'all' && status.phase !== filter) return false;
    const plane = game.fleet.find(p => p.id === status.planeId)!;
    const from = airport(status.from), to = status.to ? airport(status.to) : null;
    return !term || [plane.id, aircraftSpecs(plane).name, status.flight?.id, from.id, from.city, to?.id, to?.city]
      .some(value => value?.toLowerCase().includes(term));
  });
  function clearSearch() { setSearch(''); input.current?.focus({ preventScroll: true }); }
  function resetFilters() { setFilter('all'); setSearch(''); input.current?.focus({ preventScroll: true }); }

  return <section className="fleet-operations" aria-label="机队运行清单">
    <div className="flight-board-toolbar"><div role="group" aria-label="运行状态筛选">
      {(['all', 'ready', 'flying'] as const).map(key => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
        {key === 'all' ? '全部飞机' : phaseLabels[key]}<b>{key === 'all' ? all.length : all.filter(s => s.phase === key).length}</b>
      </button>)}
    </div><p>待命不包含周转、补能或自动值勤中的飞机。</p></div>
    <div className="flight-search-controls">
      <div className="browse-search-field">
        <label htmlFor={`${listId}-search`}>查找飞机</label>
        <div className="browse-search-control">
          <input ref={input} id={`${listId}-search`} type="search" aria-label="搜索飞机" aria-controls={listId} placeholder="编号、机型、城市或机场代码" autoComplete="off" spellCheck={false} value={search} onChange={e => setSearch(e.target.value)}/>
          <button type="button" aria-label="清空飞机搜索" disabled={!search} onClick={clearSearch}>清空</button>
        </div>
      </div>
      <label className="flight-extra-filter">更多运行状态
        <select aria-label="更多运行状态" value={extraPhases.some(phase => phase === filter) ? filter : ''} onChange={e => {
          const next = extraPhases.find(phase => phase === e.target.value);
          setFilter(next ?? 'all');
        }}>
          <option value="">选择其他状态</option>
          {extraPhases.map(phase => <option key={phase} value={phase}>{phaseLabels[phase]}（{all.filter(s => s.phase === phase).length}）</option>)}
        </select>
      </label>
    </div>
    <p role="status" aria-live="polite" aria-atomic="true" className="browse-result-summary">显示 {shown.length} / {all.length} 架飞机 · {filter === 'all' ? '全部状态' : phaseLabels[filter]}</p>
    <div id={listId} className="flight-list">
      {shown.map(status => {
        const p = game.fleet.find(p => p.id === status.planeId)!, spec = aircraftSpecs(p), f = status.flight;
        return <article key={p.id} className={`flight-card phase-${status.phase}`} data-testid="flight-row" data-plane-id={p.id} data-phase={status.phase} data-current={selectedId === p.id}>
          <header><div><strong>{spec.name} · {p.id}</strong><small>{AIRCRAFT_KIND_LABEL[spec.kind]}{selectedId === p.id ? ' · 当前查看' : ''}</small></div><span className="flight-status-tag">{status.label}</span></header>
          <div className="flight-route"><strong>{airport(status.from).city}{status.to ? ` → ${airport(status.to).city}` : '航空港'}</strong><span>{f ? f.id : '地面状态'}</span></div>
          {f && <progress className="fleet-flight-progress" aria-label={`${p.id}航班进度`} max={1} value={f.progress}/>}
          <p className="flight-clock">{status.remaining === null ? '可进入机场继续装载' : `${duration(status.remaining)} 后${status.nextEvent}`}</p>
          <p className="flight-load">机上 {status.orders} 单 · 旅客 {status.load.passengers} 人 · 货物 {status.load.cargo} 吨</p>
          <p className="flight-load">可用能量 {energyText(p.energy.availableSeconds)} 点{p.flight ? p.energy.reservedSeconds ? '（已预留本段）' : '（旧航班免扣）' : ''}</p>
          {f ? <FlightMoney flight={f}/> : <p className="flight-ground-note">尚未起飞，不预记下一班收入或成本。</p>}
          {status.onward.length > 0 && <p className="flight-onward">后续：{status.onward.map(id => airport(id).city).join(' → ')}</p>}
          <button type="button" className="flight-enter" onClick={() => onSelect(p.id)} aria-label={`查看${p.id}飞机`}>{f ? '查看飞行场景' : status.phase === 'ready' ? '进入机场装载' : '查看飞机状态'} →</button>
        </article>;
      })}
    </div>
    {!shown.length && <div className="flight-list-empty">
      <p>{term ? '没有匹配的飞机。可清空搜索或显示全部飞机。' : filter === 'ready' ? '暂无可立即装载的待命飞机。' : filter === 'flying' ? '当前没有飞行中的飞机。' : filter === 'all' ? '当前没有飞机。' : `当前没有处于「${phaseLabels[filter]}」状态的飞机。`}</p>
      <button type="button" onClick={resetFilters}>显示全部飞机</button>
    </div>}
    <p className="flight-board-note">金额来自当前航班锁定数据。成本已在起飞时扣除；仅本段到达最终目的地的订单会交付，其余继续留在机上。</p>
  </section>;
}
