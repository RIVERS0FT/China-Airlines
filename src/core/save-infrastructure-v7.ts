import { MAX_FLEET } from './legacy.js';
import { AIRPORTS, ALL_MODELS, TASKS, routeId, model } from './catalog-v7.js';
import type { GameState } from './types-v7.js';
/** v6 infrastructure validation. Older schemas keep their frozen 12-airport registry. */
export function validateInfrastructure(s: GameState): void {
  const fail = (): never => { throw new Error('存档结构或经营数据无效，原进度未被覆盖'); };
  const record = (v: unknown, keys: string[]) => {
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join('|') !== keys.sort().join('|')) fail();
  };
  const number = (v: unknown, max = 1e12, integer = true) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max || (integer && !Number.isSafeInteger(v))) fail();
  };
  const list = (v: unknown, max: number) => { if (!Array.isArray(v) || v.length > max) fail(); };
  number(s.credits); number(s.simTime, 1e12, false); number(s.lastWallTime, 8.64e15, false); number(s.nextId, 1e9);
  list(s.airports, AIRPORTS.length);
  const airports = new Map<string, number>();
  for (const a of s.airports) {
    record(a, ['id', 'level']); number(a.level, 3);
    if (!AIRPORTS.some(def => def.id === a.id) || a.level < 1 || airports.has(a.id)) fail();
    airports.set(a.id, a.level);
  }
  if (!airports.has('PEK') || !airports.has('PVG')) fail();
  list(s.routes, AIRPORTS.length * (AIRPORTS.length - 1) / 2);
  const routes = new Set<string>();
  for (const r of s.routes) {
    record(r, ['id', 'from', 'to']);
    if (!airports.has(r.from) || !airports.has(r.to) || r.from === r.to || r.id !== routeId(r.from, r.to) || routes.has(r.id)) fail();
    routes.add(r.id);
  }
  list(s.fleet, MAX_FLEET);
  if (!s.fleet.length) fail();
  const planes = new Set<string>();
  for (const p of [...s.fleet,...s.career.stored]) {
    if (!p || typeof p.id !== 'string' || !/^AC\d{4,9}$/.test(p.id) || Number(p.id.slice(2)) < 1 ||
      Number(p.id.slice(2)) >= s.nextId || planes.has(p.id) || !ALL_MODELS.some(m => m.id === p.modelId) ||
      !airports.has(p.airportId) || airports.get(p.airportId)! < model(p.modelId).level) fail();
    planes.add(p.id);
  }
  record(s.stats, ['flights', 'passengers', 'cargo', 'revenue', 'costs']);
  for (const n of Object.values(s.stats)) number(n);
  list(s.claimedTasks, TASKS.length);
  if (new Set(s.claimedTasks).size !== s.claimedTasks.length) fail();
  for (const id of s.claimedTasks) {
    const t = TASKS.find(t => t.id === id);
    if (!t || (t.metric === 'flights' ? s.stats.flights : t.metric === 'fleet' ? s.fleetPeak : s.career.airportPeak) < t.target) fail();
  }
  list(s.log, 60);
  for (const l of s.log) {
    record(l, ['at', 'text', 'amount']); number(l.at, s.simTime, false);
    if (typeof l.text !== 'string' || !l.text.length || l.text.length > 200 ||
      !Number.isSafeInteger(l.amount) || Math.abs(l.amount) > 1e12) fail();
  }
}
