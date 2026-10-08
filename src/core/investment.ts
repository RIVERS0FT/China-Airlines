import { airport, distance, hangarPrice, model } from './catalog.js';
import type { GameState } from './game.js';

/** Necessary capital costs for one aircraft and two endpoints. No side effects. */
export function aircraftProjectQuote(s: GameState, modelId: string, from: string, to: string) {
  const m = model(modelId);
  const endpoints = [...new Set([from, to])];
  let airports = 0;
  for (const id of endpoints) {
    const existing = s.airports.find(a => a.id === id);
    if (!existing) airports += airport(id).price;
  }
  const hangar = s.fleet.length >= s.hangarSlots ? hangarPrice(s.hangarSlots) : 0;
  return { aircraft: m.price, airports, upgrades: 0, hangar, total: m.price + airports + hangar,
    compatibleAirports: endpoints.every(id => airport(id).stars >= m.level),
    inRange: from !== to && distance(from, to) <= m.range };
}
