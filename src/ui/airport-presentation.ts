import { searchAirports, type ContinentFilter } from './airport-search.js';
import { AIRPORTS, airport } from '../core/catalog.js';
import { waiting, type GameState } from '../core/game.js';

/** Read-only airport views. An airborne aircraft still stores its departure airport;
 * it must not appear on that airport's apron or accept any ground orders. */
export function airportTraffic(game: GameState, id: string) {
  const definition = airport(id);
  const owned = game.airports.find(a => a.id === id);
  const jobs = waiting(game, id);
  const destinations = AIRPORTS.map(a => {
    const group = jobs.filter(o => o.to === a.id);
    return {
      id: a.id, city: a.city, orders: group.length,
      passengers: group.filter(o => o.kind === 'passengers').reduce((n, o) => n + o.amount, 0),
      cargo: group.filter(o => o.kind === 'cargo').reduce((n, o) => n + o.amount, 0),
      transfers: group.filter(o => o.expiresAt === null && o.from !== id).length,
    };
  }).filter(a => a.orders > 0);
  const airborne = game.fleet.filter(p => p.flight !== null);
  const byArrival = (a: typeof airborne[number], b: typeof airborne[number]) =>
    a.flight!.arriveAt - b.flight!.arriveAt || a.id.localeCompare(b.id);
  return {
    ...definition, level: owned?.level ?? 0,
    orders: jobs.length,
    passengers: destinations.reduce((n, a) => n + a.passengers, 0),
    cargo: destinations.reduce((n, a) => n + a.cargo, 0),
    transfers: destinations.reduce((n, a) => n + a.transfers, 0),
    destinations,
    parked: game.fleet.filter(p => !p.flight && p.airportId === id),
    incoming: airborne.filter(p => p.flight!.to === id).sort(byArrival),
    outgoing: airborne.filter(p => p.flight!.from === id).sort(byArrival),
  };
}
export type AirportFilter = 'all' | 'open' | 'locked';
export function airportDirectory(game: GameState, filter: AirportFilter, query: string, continent: ContinentFilter = 'all') {
  return searchAirports(query, continent)
    .map(a => airportTraffic(game, a.id))
    .filter(a => filter === 'all' || (filter === 'open' ? a.level > 0 : a.level === 0));
}

/** Pinned inspection is UI-only: never move an aircraft to the airport being read.
 * Invalid pins/selection after import or resale fall back to a real surviving plane. */
export function airportScene(game: GameState, selectedId: string, requestedAirport: string | null) {
  const selected = game.fleet.find(p => p.id === selectedId) ?? game.fleet[0]!;
  const pinned = game.airports.some(a => a.id === requestedAirport) ? requestedAirport : null;
  const airportId = pinned ?? selected.airportId;
  const choices = pinned ? game.fleet.filter(p => !p.flight && p.airportId === pinned) : game.fleet;
  const plane = pinned ? choices.find(p => p.id === selected.id) ?? choices[0] : selected;
  return { selected, plane, airportId, pinned, choices };
}
