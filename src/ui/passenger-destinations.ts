import type { GameState } from '../core/game.js';

/** Read-only UI projection of loaded passenger demand for the selected aircraft. */
export function passengerDestinationCounts(game: GameState, planeId?: string) {
  const counts = new Map<string, number>();
  if (!planeId) return counts;
  for (const order of game.orders) {
    if (order.kind !== 'passengers' || order.location !== planeId) continue;
    counts.set(order.to, (counts.get(order.to) ?? 0) + order.amount);
  }
  return counts;
}

export function passengerDestinationKey(counts: Map<string, number>) {
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([airportId, amount]) => `${airportId}:${amount}`)
    .join(',');
}
