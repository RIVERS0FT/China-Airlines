import { airport, distance } from './catalog.js';
import { BASE_DEMAND_DIRECTIONS } from './demand-directions.js';
import { DEMAND_LIMITS, PROMOTION_ORDERS, PRIMARY_DEMAND_WEIGHT } from './balance-policy.js';

export const demandCapacity = (airportId: string, level: number, promoted = false) =>
  Math.round(airport(airportId).baseDemand * DEMAND_LIMITS[level - 1]! / DEMAND_LIMITS[0]) + (promoted ? PROMOTION_ORDERS : 0);

/** Static preferred directions, filled by stable geographical distance when closed. */
export function demandDestinations(from: string, openIds: readonly string[]) {
  const ids = [...new Set(openIds)].filter(id => id !== from).sort();
  const primary = (BASE_DEMAND_DIRECTIONS[from] ?? []).filter(id => ids.includes(id));
  const nearest = ids.filter(id => !primary.includes(id)).sort((a, b) => distance(from, a) - distance(from, b) || a.localeCompare(b));
  primary.push(...nearest.slice(0, Math.max(0, 3 - primary.length)));
  return ids.map(id => ({ id, primary: primary.includes(id) }));
}

/** Largest remainders; rational integer weights avoid floating tie-breaking. */
export function allocateDemand(count: number, destinations: readonly { id: string; primary: boolean }[]) {
  if (!count || !destinations.length) return [];
  const p = destinations.filter(d => d.primary).length, other = destinations.length - p;
  const denominator = p && other ? 100 * p * other : destinations.length;
  const shares = destinations.map(d => {
    const weight = p && other ? (d.primary ? PRIMARY_DEMAND_WEIGHT * other : (100 - PRIMARY_DEMAND_WEIGHT) * p) : 1;
    const numerator = count * weight;
    return { id: d.id, count: Math.floor(numerator / denominator), remainder: numerator % denominator };
  });
  const missing = count - shares.reduce((n, d) => n + d.count, 0);
  shares.sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id));
  for (let i = 0; i < missing; i++) shares[i]!.count++;
  return shares.sort((a, b) => a.id.localeCompare(b.id)).map(({ id, count }) => ({ id, count }));
}
