/** Frozen v5 schema = the frozen v4 business schema plus the v5 energy contract.
 * Never send this validation projection to a controller or use it for settlement. */
import { validateSave as validateV4, type GameState as V4State } from './save-v4.js';
import type { EnergyBudget } from './energy.js';
export type V5State = Omit<V4State, 'version' | 'fleet'> & {
  version: 5; fleet: (V4State['fleet'][number] & { energy: EnergyBudget })[];
};
export function validateV5(value: unknown): V5State {
  const fail = (): never => { throw new Error('存档结构或经营数据无效，原进度未被覆盖'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const s = structuredClone(value) as V5State;
  if (s.version !== 5 || !Array.isArray(s.fleet)) return fail();
  const fleet = s.fleet.map(p => {
    if (!p || typeof p !== 'object' || !p.energy || typeof p.energy !== 'object' || Array.isArray(p.energy) ||
      Object.keys(p.energy).sort().join('|') !== 'availableSeconds|reservedSeconds|serviceUntil') return fail();
    const e = p.energy;
    for (const amount of [e.availableSeconds, e.reservedSeconds]) {
      if (!Number.isSafeInteger(amount) || amount < 0 || amount > 14400) return fail();
    }
    if (e.availableSeconds + e.reservedSeconds > 14400 || (!p.flight && e.reservedSeconds !== 0) ||
      (p.flight && e.reservedSeconds !== 0 && p.flight.arriveAt !== p.flight.departAt + e.reservedSeconds)) return fail();
    if (e.serviceUntil !== null && (typeof e.serviceUntil !== 'number' || !Number.isFinite(e.serviceUntil) ||
      e.serviceUntil < 0 || e.serviceUntil > 1e12 || e.serviceUntil <= s.simTime || e.serviceUntil > s.simTime + 120 ||
      e.availableSeconds === 14400 || p.flight !== null || p.autoRouteId !== null ||
      !Array.isArray(p.itinerary) || p.itinerary.length || p.readyAt > s.simTime)) return fail();
    const { energy: _energy, ...oldPlane } = p;
    return oldPlane;
  });
  // v4 rejects unknown/extra fields, foreign airports, bad clocks, manifests, plans,
  // references, costs and rewards. v5 adds no other business-schema differences.
  validateV4({ ...s, version: 4, fleet });
  return s;
}
