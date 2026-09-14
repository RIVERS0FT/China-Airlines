import type { GameState } from './game.js';
import { HISTORY_LIMIT, MAX_EMPLOYEES, staffLimit, type Department, type EmployeeRole } from './organization.js';
/** Validate the complete identity graph, not only the currently visible tree. */
export function validateEmployees(s: GameState): void {
  const fail = (): never => { throw new Error('存档公司组织数据无效，原进度未被覆盖'); };
  const num = (v: unknown, max = 1e12, integer = true) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max || (integer && !Number.isSafeInteger(v))) fail();
  };
  const record = (v: unknown, keys: string[]) => {
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join('|') !== [...keys].sort().join('|')) fail();
  };
  const people = s.career.employees;
  if (!Array.isArray(people) || people.length > MAX_EMPLOYEES) fail();
  const ids = new Set<number>(), planes = new Set<string>(), airports = new Set<string>();
  for (const e of people) {
    record(e, ['id','name','planeId','paidUntil','skill','department','role','managerId','airportId','management','potential','trait','joinedAt','flights','deliveries','history']);
    num(e.id); num(e.paidUntil, 1e12, false); num(e.potential, 10); num(e.skill, e.potential); num(e.management, e.potential);
    num(e.flights, s.stats.flights); num(e.deliveries, s.stats.passengers + s.stats.cargo);
    if (e.id < 1 || e.id >= s.career.nextId || ids.has(e.id) || typeof e.name !== 'string' || !e.name.trim() || e.name.length > 12 ||
      e.potential < 6 || !['flight','ground'].includes(e.department) || !['specialist','manager'].includes(e.role) || !['mentor','efficient'].includes(e.trait)) fail();
    ids.add(e.id);
    if (e.joinedAt !== null) num(e.joinedAt, s.simTime, false);
    if (e.managerId !== null) { num(e.managerId); if (e.managerId < 1 || e.managerId === e.id) fail(); }
    if (e.role === 'manager' && (e.managerId !== null || e.planeId !== null || e.airportId !== null || e.skill < 2 || e.management < 1)) fail();
    if (e.planeId !== null) {
      if (typeof e.planeId !== 'string' || e.department !== 'flight' || e.role !== 'specialist' || planes.has(e.planeId) ||
        !s.fleet.some(p => p.id === e.planeId && p.dispatcher)) fail();
      planes.add(e.planeId);
    }
    if (e.airportId !== null) {
      if (typeof e.airportId !== 'string' || e.department !== 'ground' || e.role !== 'specialist' || airports.has(e.airportId) ||
        !s.airports.some(a => a.id === e.airportId)) fail();
      airports.add(e.airportId);
    }
    if (!Array.isArray(e.history) || e.history.length < 1 || e.history.length > HISTORY_LIMIT) fail();
    for (const [i, event] of e.history.entries()) {
      record(event, ['at','kind','text']); num(event.at, s.simTime, false);
      if (!['joined','migrated','assigned','reporting','promoted','demoted','trained','renewed','flight'].includes(event.kind) ||
        typeof event.text !== 'string' || !event.text.trim() || event.text.length > 200 ||
        (e.joinedAt !== null && event.at < e.joinedAt) || (i > 0 && event.at > e.history[i - 1]!.at)) fail();
    }
  }
  for (const e of people) if (e.managerId !== null && !people.some(m => m.id === e.managerId && m.role === 'manager' && m.department === e.department)) fail();
  for (const department of ['flight','ground'] as Department[]) for (const role of ['specialist','manager'] as EmployeeRole[]) {
    if (people.filter(e => e.department === department && e.role === role).length > staffLimit(department, role)) fail();
  }
}
