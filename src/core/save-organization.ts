import type { GameState } from './game.js';
import { DEPARTMENTS, TRAITS, EMPLOYEE_LIMIT, HISTORY_LIMIT, type Employee, type FlightStaffing } from './organization.js';

const fail = (): never => { throw new Error('存档组织架构数据无效，原进度未被覆盖'); };
function record(v: unknown, keys: string[]): asserts v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join('|') !== [...keys].sort().join('|')) fail();
}
function number(v: unknown, max = 1e12, integer = true) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max || (integer && !Number.isSafeInteger(v))) fail();
}
export function validateEmployees(s: GameState): void {
  const all = s.career.employees;
  if (!Array.isArray(all) || all.length > (EMPLOYEE_LIMIT + 1) * 2) fail();
  const ids = new Set<number>(), planes = new Set<string>(), airports = new Set<string>();
  const managers = new Set<string>(), counts = { flight: 0, ground: 0 };
  for (const e of all) {
    record(e, ['id','name','department','role','planeId','airportId','paidUntil','skill','management','potential','trait','joinedAt','flights','deliveries','history']);
    number(e.id); if (e.id < 1 || e.id >= s.career.nextId || ids.has(e.id)) fail(); ids.add(e.id);
    if (typeof e.name !== 'string' || !e.name.length || (e.joinedAt !== null && !e.name.trim()) || e.name.length > 12 ||
      typeof e.department !== 'string' || !Object.hasOwn(DEPARTMENTS, e.department) || !['staff','manager'].includes(e.role) || typeof e.trait !== 'string' || !Object.hasOwn(TRAITS, e.trait)) fail();
    number(e.potential, 10); if (e.potential < 8) fail();
    number(e.skill, e.potential); number(e.management, e.potential); number(e.paidUntil, 1e12, false);
    number(e.flights, s.stats.flights); number(e.deliveries, s.stats.passengers + s.stats.cargo);
    if (e.joinedAt !== null) number(e.joinedAt, s.simTime, false);
    if (!Array.isArray(e.history) || !e.history.length || e.history.length > HISTORY_LIMIT) fail();
    let last = e.joinedAt ?? 0;
    for (const item of e.history) {
      record(item, ['at','text']); number(item.at, s.simTime, false);
      if (item.at < last || typeof item.text !== 'string' || !item.text.length || item.text.length > 100) fail();
      last = item.at;
    }
    if (e.role === 'manager') {
      if (e.planeId !== null || e.airportId !== null || managers.has(e.department) || e.management < 1 || e.skill < 2) fail();
      managers.add(e.department);
    } else {
      counts[e.department]++;
      if (counts[e.department] > EMPLOYEE_LIMIT) fail();
    }
    if (e.planeId !== null) {
      const p = s.fleet.find(p => p.id === e.planeId);
      if (e.department !== 'flight' || !p?.dispatcher || planes.has(e.planeId)) fail();
      planes.add(e.planeId);
    }
    if (e.airportId !== null) {
      if (e.department !== 'ground' || !s.airports.some(a => a.id === e.airportId) || airports.has(e.airportId)) fail();
      airports.add(e.airportId);
    }
    if ((e.department === 'flight' && e.airportId !== null) || (e.department === 'ground' && e.planeId !== null)) fail();
  }
}
export function validateFlightStaffing(s: GameState): void {
  const flights = s.fleet.flatMap(p => p.flight ? [p.flight] : []);
  const locks = s.career.flightStaffing;
  record(locks, flights.map(f => f.id));
  for (const flight of flights) {
    const f = locks[flight.id];
    // Explicit null denotes a grandfathered flight; migration does not grant a new bonus.
    if (f === null) continue;
    record(f, ['pilotId','managerId','management','mentor','workload']);
    const lock = f as unknown as FlightStaffing;
    const person = (id: unknown): Employee | undefined => {
      if (id === null) return undefined;
      number(id); const e = s.career.employees.find(e => e.id === id);
      if (!e || e.department !== 'flight') fail(); return e;
    };
    const p = person(lock.pilotId), m = person(lock.managerId);
    number(lock.management, 10); number(lock.workload, EMPLOYEE_LIMIT);
    if (typeof lock.mentor !== 'boolean') fail();
    if (!m) {
      if (lock.management !== 0 || lock.workload !== 0 || lock.mentor) fail();
    } else if (!p || p.paidUntil <= flight.departAt || p.id === m.id || lock.management < 1 || lock.management > m.management ||
      lock.workload < 1 || lock.mentor !== (m.trait === 'mentor') || m.paidUntil <= flight.departAt) fail();
    if (p && p.planeId !== s.fleet.find(p => p.flight?.id === flight.id)?.id) fail();
  }
}
