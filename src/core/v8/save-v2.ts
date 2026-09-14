/** Frozen v0.2 save validator. Never used to run the v3 simulation. */
import { model, distance } from './legacy-catalog.js';
import { validateSave as validateV1, quote as routeQuote, type GameState as LegacyState, type Plane } from './legacy.js';
import { TURNAROUND } from './legacy.js';
const SAVE_VERSION = 2, DEMAND_INTERVAL = 120, ORDER_LIFETIME = 360, MAX_WAITING = 24;
export interface Order {
  id: string; kind: 'passengers' | 'cargo'; from: string; to: string; amount: number;
  reward: number; location: string; createdAt: number; expiresAt: number | null;
}
export interface GameState extends Omit<LegacyState, 'version'> {
  version: 2; orders: Order[]; nextOrderId: number; nextDemandAt: number;
}
const base = (s: GameState) => s as unknown as LegacyState;
export const manifest = (s: GameState, planeId: string) => s.orders.filter(o => o.location === planeId);
export const waiting = (s: GameState, airportId: string) => s.orders.filter(o => o.location === airportId);
export function loadSummary(s: GameState, planeId: string) {
  const jobs = manifest(s, planeId);
  return { passengers: jobs.filter(o => o.kind === 'passengers').reduce((n, o) => n + o.amount, 0),
    cargo: jobs.filter(o => o.kind === 'cargo').reduce((n, o) => n + o.amount, 0) };
}
export function orderReward(from: string, to: string, kind: Order['kind'], amount: number) {
  const km = distance(from, to);
  return Math.round(amount * (kind === 'passengers' ? 100 + km * 0.18 : 300 + km * 0.4));
}
export function quote(s: GameState, p: Plane, to: string) {
  const plan = routeQuote(base(s), p, to), total = loadSummary(s, p.id);
  const revenue = manifest(s, p.id).filter(o => o.to === to).reduce((n, o) => n + o.reward, 0);
  return { ...plan, ...total, revenue, profit: revenue - plan.cost };
}
export function validateV2(value: unknown): GameState {
  const fail = (): never => { throw new Error('存档结构或经营数据无效，原进度未被覆盖'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const version = (value as { version?: unknown }).version;
  if (version !== SAVE_VERSION) throw new Error('不支持此存档版本；请使用对应版本的游戏');
  const keys = (v: object, fields: string[]) => {
    if (Object.keys(v).sort().join('|') !== [...fields].sort().join('|')) fail();
  };
  const number = (v: unknown, max = 1e12, integer = true): number => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max || (integer && !Number.isSafeInteger(v))) return fail(); return v;
  };
  const s = structuredClone(value) as GameState;
  keys(s, ['version','credits','simTime','lastWallTime','nextId','airports','fleet','routes','stats','claimedTasks','log','orders','nextOrderId','nextDemandAt']);
  number(s.simTime, 1e12, false); number(s.nextDemandAt, 1e12, false); number(s.nextOrderId);
  if (s.nextOrderId < 1 || s.nextDemandAt <= s.simTime || s.nextDemandAt > s.simTime + DEMAND_INTERVAL) fail();
  if (!Array.isArray(s.fleet) || !Array.isArray(s.orders) || s.orders.length > 4096) fail();
  // Reuse the frozen v1 validator for common infrastructure and flight geometry only.
  // Its old fare formula is projected here, never used for v2 settlement.
  const { orders: _orders, nextOrderId: _id, nextDemandAt: _time, ...rest } = s;
  const projection = structuredClone({ ...rest, version: 1 }) as LegacyState;
  for (const p of projection.fleet) {
    if (!p || typeof p !== 'object') fail();
    if (p.flight) {
      number(p.flight.revenue);
      const km = distance(p.flight.from, p.flight.to);
      p.flight.revenue = Math.round(p.flight.passengers * (100 + km * .18) + p.flight.cargo * (300 + km * .4));
    } else if (p.autoRouteId) {
      number(p.readyAt, s.simTime + DEMAND_INTERVAL, false); p.readyAt = Math.min(p.readyAt, s.simTime + TURNAROUND);
    }
  }
  validateV1(projection);
  const ids = new Set<string>(), airports = new Set(s.airports.map(a => a.id)), planes = new Map(s.fleet.map(p => [p.id, p]));
  for (const o of s.orders) {
    if (!o || typeof o !== 'object') fail();
    keys(o, ['id','kind','from','to','amount','reward','location','createdAt','expiresAt']);
    if (typeof o.id !== 'string' || !/^JB\d{1,12}$/.test(o.id) || Number(o.id.slice(2)) < 1 || Number(o.id.slice(2)) >= s.nextOrderId || ids.has(o.id)) fail();
    ids.add(o.id);
    if (!airports.has(o.from) || !airports.has(o.to) || o.from === o.to || !['passengers','cargo'].includes(o.kind)) fail();
    if (number(o.amount, o.kind === 'passengers' ? 280 : 14) < 1) fail();
    number(o.reward); number(o.createdAt, s.simTime, false);
    // v1 rounded combined fares; the migrated last component can differ by one coin.
    if (Math.abs(o.reward - orderReward(o.from, o.to, o.kind, o.amount)) > 1) fail();
    const plane = planes.get(o.location);
    if (plane) {
      if (o.expiresAt !== null || (plane.flight && o.createdAt > plane.flight.departAt)) fail();
    } else {
      if (!airports.has(o.location) || o.location === o.to) fail();
      if (o.expiresAt !== null) {
        number(o.expiresAt, 1e12, false);
        if (o.location !== o.from || o.expiresAt !== o.createdAt + ORDER_LIFETIME || o.expiresAt <= s.simTime) fail();
      }
    }
  }
  for (const a of s.airports) if (waiting(s, a.id).length > MAX_WAITING) fail();
  for (const p of s.fleet) {
    const total = loadSummary(s, p.id), m = model(p.modelId);
    if (total.passengers > m.seats || total.cargo > m.cargo) fail();
    if (p.flight) {
      const q = quote(s, p, p.flight.to);
      if (p.flight.passengers !== total.passengers || p.flight.cargo !== total.cargo || p.flight.revenue !== q.revenue) fail();
      if (p.autoRouteId && manifest(s, p.id).some(o => o.to !== p.flight!.to)) fail();
    }
  }
  return s;
}