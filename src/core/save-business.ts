import type { GameState } from './game.js';
import { BUSINESS_CATALOG, BUSINESS_KINDS, MAX_BUSINESS_LEVEL, MAX_BUSINESS_TEAMS, businessCapacity, businessWorkers } from './company-business.js';

/** Validate the business graph against the one authoritative employee roster. */
export function validateBusiness(s: GameState): void {
  const fail = (): never => { throw new Error('存档公司业务数据无效，原进度未被覆盖'); };
  const fields = (v: unknown, keys: string[]) => {
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join('|') !== [...keys].sort().join('|')) fail();
  };
  const number = (v: unknown, max: number, min = 0) => {
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) fail();
  };
  fields(s.business, ['teams', 'nextId', 'remainder', 'earned', 'wallPeak']);
  const b = s.business;
  if (typeof b.wallPeak !== "number" || !Number.isFinite(b.wallPeak) || b.wallPeak < s.lastWallTime || b.wallPeak > 8.64e15) fail();
  number(b.nextId, 1e12, 1); number(b.remainder, 999999); number(b.earned, 1e12);
  if (!Array.isArray(b.teams) || b.teams.length > MAX_BUSINESS_TEAMS) fail();
  if (b.teams.length && (!s.stats.flights || !s.stats.revenue)) fail();
  const ids = new Set<number>(), managers = new Set<number>(), positions = new Set<string>();
  for (const t of b.teams) {
    fields(t, ['id', 'airportId', 'kind', 'managerId', 'level']);
    number(t.id, b.nextId - 1, 1); number(t.managerId, s.career.nextId - 1, 1); number(t.level, MAX_BUSINESS_LEVEL, 1);
    if (!BUSINESS_KINDS.includes(t.kind)) fail();
    const spec = BUSINESS_CATALOG[t.kind], owned = s.airports.find(a => a.id === t.airportId), key = `${t.airportId}:${t.kind}`;
    if (!owned || owned.level < spec.airportLevel || t.level > owned.level + 2 || ids.has(t.id) || managers.has(t.managerId) || positions.has(key)) fail();
    ids.add(t.id); managers.add(t.managerId); positions.add(key);
    const leader = s.career.employees.find(e => e.id === t.managerId);
    if (!leader || leader.department !== 'business' || leader.role !== 'manager') fail();
    const workers = businessWorkers(s, t);
    if (workers.length < 1 || workers.length > businessCapacity(t)) fail();
  }
  for (const e of s.career.employees.filter(e => e.department === 'business')) {
    if (e.paidUntil !== 0 || e.planeId !== null || e.airportId !== null || e.flights !== 0 || e.deliveries !== 0 || e.joinedAt === null) fail();
    if (e.role === 'manager') {
      if (!managers.has(e.id)) fail();
    } else if (e.managerId === null || !managers.has(e.managerId) || e.skill < 1 || e.management !== 0) fail();
  }
}
