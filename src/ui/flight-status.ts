import { loadSummary, manifest, type GameState, type Plane } from '../core/game.js';

export type FlightPhase = 'ready' | 'flying' | 'turnaround' | 'automatic' | 'planned' | 'service';
export type FleetFilter = 'all' | 'ready' | 'flying';

/** Read locked flight values, never re-price them using a map selection or a new quote. */
export function currentFlight(game: GameState, plane: Plane) {
  const f = plane.flight;
  if (!f) return null;
  const duration = Math.max(0, f.arriveAt - f.departAt);
  return {
    id: f.id, from: f.from, to: f.to, duration,
    remaining: Math.max(0, f.arriveAt - game.simTime),
    progress: duration > 0 ? Math.min(1, Math.max(0, (game.simTime - f.departAt) / duration)) : 0,
    cost: f.cost, revenue: f.revenue, profit: f.revenue - f.cost,
    passengers: f.passengers, cargo: f.cargo
  };
}

/** One view projection for the airport header and the fleet list; no timers or commands. */
export function flightStatus(game: GameState, plane: Plane) {
  const flight = currentFlight(game, plane);
  let phase: FlightPhase, label: string, nextEvent: string;
  if (flight) { phase = 'flying'; label = '飞行中'; nextEvent = '抵达'; }
  else if (plane.energy.serviceUntil !== null) { phase = 'service'; label = '地勤补能'; nextEvent = '补能完成'; }
  else if (plane.autoRouteId) { phase = 'automatic'; label = '自动值勤'; nextEvent = '下次调度检查'; }
  else if (plane.itinerary.length) { phase = 'planned'; label = '计划周转'; nextEvent = '尝试下一段'; }
  else if (plane.readyAt > game.simTime) { phase = 'turnaround'; label = '地面周转'; nextEvent = '可操作'; }
  else { phase = 'ready'; label = '待命'; nextEvent = ''; }
  const route = plane.autoRouteId ? game.routes.find(r => r.id === plane.autoRouteId) : undefined;
  const nextTo = plane.itinerary[0] ?? (route ? (route.from === plane.airportId ? route.to : route.from) : null);
  return {
    planeId: plane.id, phase, label, nextEvent, flight,
    remaining: flight ? flight.remaining : phase === 'ready' ? null : Math.max(0, (plane.energy.serviceUntil ?? plane.readyAt) - game.simTime),
    from: flight?.from ?? plane.airportId, to: flight?.to ?? nextTo,
    orders: manifest(game, plane.id).length,
    load: flight ? { passengers: flight.passengers, cargo: flight.cargo } : loadSummary(game, plane.id),
    onward: [...plane.itinerary]
  };
}

/** Preserve fleet order while clocks advance, so keyboard focus does not jump between rows. */
export function fleetStatuses(game: GameState, filter: FleetFilter = 'all') {
  return game.fleet.map(p => flightStatus(game, p)).filter(s => filter === 'all' || s.phase === filter);
}
