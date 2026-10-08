import type { GameState } from '../core/game.js';

export interface TrafficAmounts { passengers: number; cargo: number }
export interface DestinationKinds { passengers: boolean; cargo: boolean }
/** Fixed-size airport dots encode the combined passenger/cargo queue by color. */
export function trafficDotColor(amounts: TrafficAmounts) {
  const total = amounts.passengers + amounts.cargo;
  return total === 0 ? 0xa4b8b7 : total < 10 ? 0x8fe0a1 : total < 20 ? 0xffdf64 : total < 40 ? 0xffa24c : 0xef6965;
}
/** Read-only snapshot projection. Loaded destinations never expose quantities.
 * Accepted transfers remain waiting; expired unsigned jobs and in-flight loads do not. */
export function mapTraffic(game: GameState, planeId?: string) {
  const waiting = new Map<string, TrafficAmounts>(game.airports.map(a => [a.id, { passengers: 0, cargo: 0 }]));
  const destinations = new Map<string, DestinationKinds>();
  for (const order of game.orders) {
    const amounts = waiting.get(order.location);
    if (amounts && (order.expiresAt === null || order.expiresAt > game.simTime)) amounts[order.kind] += order.amount;
    if (planeId && order.location === planeId) {
      const kinds = destinations.get(order.to) ?? { passengers: false, cargo: false };
      kinds[order.kind] = true; destinations.set(order.to, kinds);
    }
  }
  const destinationKey = [...destinations].sort(([a], [b]) => a.localeCompare(b))
    .map(([id, kinds]) => `${id}:${[kinds.passengers ? 'passengers' : '', kinds.cargo ? 'cargo' : ''].filter(Boolean).join('+')}`).join(',');
  const waitingKey = [...waiting].sort(([a], [b]) => a.localeCompare(b))
    .map(([id, amounts]) => `${id}:${amounts.passengers}/${amounts.cargo}`).join(',');
  return { waiting, destinations, destinationKey, waitingKey, key: `${waitingKey}|${destinationKey}` };
}
