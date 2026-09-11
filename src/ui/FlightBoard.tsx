import { useState } from 'react';
import { aircraftSpecs, AIRCRAFT_KIND_LABEL, airport } from '../core/catalog.js';
import type { GameState } from '../core/game.js';
import { currentFlight, fleetStatuses, type FleetFilter } from './flight-status.js';
import { duration, money } from './Panels.js';

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
  const [filter, setFilter] = useState<FleetFilter>('all');
  const all = fleetStatuses(game), shown = all.filter(s => filter === 'all' || s.phase === filter);
  return <section className="fleet-operations" aria-label="机队运行清单">
    <div className="flight-board-toolbar"><div role="group" aria-label="运行状态筛选">
      {(['all', 'ready', 'flying'] as const).map(key => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
        {{ all: '全部飞机', ready: '待命飞机', flying: '飞行中的飞机' }[key]}<b>{key === 'all' ? all.length : all.filter(s => s.phase === key).length}</b>
      </button>)}
    </div><p>待命不包含周转或自动值勤中的飞机。</p></div>
    <div className="flight-list">
      {shown.map(status => {
        const p = game.fleet.find(p => p.id === status.planeId)!, spec = aircraftSpecs(p), f = status.flight;
        return <article key={p.id} className={`flight-card phase-${status.phase}`} data-testid="flight-row" data-plane-id={p.id} data-phase={status.phase}>
          <header><div><strong>{spec.name} · {p.id}</strong><small>{AIRCRAFT_KIND_LABEL[spec.kind]}{selectedId === p.id ? ' · 当前查看' : ''}</small></div><span className="flight-status-tag">{status.label}</span></header>
          <div className="flight-route"><strong>{airport(status.from).city}{status.to ? ` → ${airport(status.to).city}` : '航空港'}</strong><span>{f ? f.id : '地面状态'}</span></div>
          {f && <progress className="fleet-flight-progress" aria-label={`${p.id}航班进度`} max={1} value={f.progress}/>}
          <p className="flight-clock">{status.remaining === null ? '可进入机场继续装载' : `${duration(status.remaining)} 后${status.nextEvent}`}</p>
          <p className="flight-load">机上 {status.orders} 单 · 旅客 {status.load.passengers} 人 · 货物 {status.load.cargo} 吨</p>
          {f ? <FlightMoney flight={f}/> : <p className="flight-ground-note">尚未起飞，不预记下一班收入或成本。</p>}
          {status.onward.length > 0 && <p className="flight-onward">后续：{status.onward.map(id => airport(id).city).join(' → ')}</p>}
          <button className="flight-enter" onClick={() => onSelect(p.id)} aria-label={`查看${p.id}飞机`}>{f ? '查看飞行场景' : '进入机场装载'} →</button>
        </article>;
      })}
    </div>
    {!shown.length && <div className="flight-list-empty"><p>{filter === 'ready' ? '暂无可立即装载的待命飞机。' : '当前没有飞行中的飞机。'}</p><button onClick={() => setFilter('all')}>显示全部飞机</button></div>}
    <p className="flight-board-note">金额来自当前航班锁定数据。成本已在起飞时扣除；仅本段到达最终目的地的订单会交付，其余继续留在机上。</p>
  </section>;
}
