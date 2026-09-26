import { aircraftSpecs, airport } from '../core/catalog.js';
import type { GameState } from '../core/game.js';
import { useI18n } from '../i18n/I18n.js';
import { artAsset } from './art-assets.js';
import { duration } from './Panels.js';
import { energyText } from './EnergyService.js';
import type { fleetStatuses } from './flight-status.js';

export type FleetStatus = ReturnType<typeof fleetStatuses>[number];

/** Compact, read-only selectors. The selected aircraft owns all management controls. */
export function FleetRoster({ game, statuses, selectedId, onSelect }: {
  game: GameState; statuses: FleetStatus[]; selectedId: string; onSelect: (id: string) => void;
}) {
  const { ui, airportName, modelName } = useI18n();
  return <div className="flight-list fleet-roster">
    {statuses.map(status => {
      const p = game.fleet.find(p => p.id === status.planeId)!, spec = aircraftSpecs(p);
      return <article key={p.id} className={`fleet-roster-item phase-${status.phase}`} data-testid="flight-row" data-plane-id={p.id} data-phase={status.phase} data-current={selectedId === p.id}>
        <button type="button" className="flight-enter" aria-pressed={selectedId === p.id} aria-controls="fleet-aircraft-detail" onClick={() => onSelect(p.id)} aria-label={ui(`查看${p.id}飞机`)}>
          <span className="fleet-roster-identity"><img src={artAsset(spec.art)} alt="" loading="lazy"/><span><strong>{modelName(p.modelId, spec.name)}</strong><small>{p.id}{selectedId === p.id ? ` · ${ui('当前查看')}` : ''}</small></span><span className="flight-status-tag">{ui(status.label)}</span></span>
          <span className="flight-route">{airportName(status.from, airport(status.from).city)}{status.to ? ` → ${airportName(status.to, airport(status.to).city)}` : ui('航空港')}</span>
          <span className="fleet-roster-clock">{status.remaining === null ? ui('可进入机场继续装载') : ui('{time} 后{event}', { time: duration(status.remaining), event: ui(status.nextEvent) })}</span>
          <span className="fleet-roster-load">{ui('旅客 {passengers}/{seats} · 货物 {cargo}/{holds}', { passengers: status.load.passengers, seats: spec.seats, cargo: status.load.cargo, holds: spec.cargo })}<span>{ui('能量 {value}', { value: energyText(p.energy.availableSeconds) })}</span></span>
        </button>
      </article>;
    })}
  </div>;
}
