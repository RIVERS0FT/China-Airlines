// Frozen v0.4 validator and migration parameters. Never execute current simulation here.
import { aircraftSpecs, emptyUpgrades, UPGRADE_LABEL, type Upgrades, model, routeId, routePrice, TASKS, distance } from './catalog-v4.js';
import { validateSave as validateV1, type GameState as LegacyState, type Plane as LegacyPlane } from './legacy.js';
import { MAX_FLEET, TURNAROUND } from './legacy.js';

import { validateV2, type GameState as V2State } from './save-v2.js';
import { validateSave as validateV3 } from './save-v3.js';
export const SAVE_VERSION = 4;
export type TutorialState = 'available' | 'active' | 'completed' | 'skipped';
export const MAX_PLAN_LEGS = 5;
export interface Plane extends LegacyPlane { upgrades: Upgrades; itinerary: string[]; dispatcher: boolean }
export const DEMAND_INTERVAL = 120;
export const ORDER_LIFETIME = 360;
export const MAX_WAITING = 24;
export interface Order {
  id: string; kind: 'passengers' | 'cargo'; from: string; to: string; amount: number;
  reward: number; location: string; createdAt: number; expiresAt: number | null;
}
export interface GameState extends Omit<LegacyState, 'version' | 'fleet'> {
  version: 4; fleet: Plane[]; hangarSlots: number; orders: Order[]; nextOrderId: number; nextDemandAt: number; fleetPeak: number; tutorial: TutorialState;
}
const check = (ok: unknown, message: string): void => { if (!ok) throw new Error(message); };
const owned = (s: GameState, id: string) => s.airports.find(a => a.id === id);
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
function issue(s: GameState, from: string, to: string, kind: Order['kind'], amount: number, location = from, reward?: number, createdAt = s.simTime) {
  s.orders.push({ id: `JB${s.nextOrderId++}`, from, to, kind, amount, location,
    reward: reward ?? orderReward(from, to, kind, amount), createdAt,
    expiresAt: location === from ? s.simTime + ORDER_LIFETIME : null });
}
/** Time-driven, deterministic, bounded supply. No jobs are invented by a flight. */
function replenish(s: GameState) {
  s.orders = s.orders.filter(o => o.expiresAt === null || o.expiresAt > s.simTime);
  for (const a of s.airports) {
    const destinations = s.airports.filter(b => b.id !== a.id);
    let count = waiting(s, a.id).length;
    while (count < 12 && destinations.length) {
      const index = s.nextOrderId;
      const to = destinations[Math.floor((index - 1) / 3) % destinations.length]!.id;
      const kind = index % 3 === 0 ? 'cargo' : 'passengers';
      issue(s, a.id, to, kind, kind === 'cargo' ? 1 : 10 + (index % 3) * 5);
      count++;
    }
  }
}
/** One source of truth for purchase cards, upgrades, range checks and flight costs. */
export function legQuote(s: GameState, p: Plane, from: string, to: string) {
  const m = aircraftSpecs(p), a = owned(s, from), b = owned(s, to);
  check(from !== to, '请选择不同的目的地'); check(a && b, '请先解锁两端机场');
  check(a!.level >= m.level && b!.level >= m.level, `该机型需要两端机场达到 ${m.level} 级`);
  const km = distance(from, to); check(km <= m.range, '航线超出这架飞机的航程');
  return { km, duration: Math.max(30, Math.ceil(km / m.speed * 45)), cost: Math.round(500 + km * m.costKm) };
}
export function quote(s: GameState, p: Plane, to: string) {
  const leg = legQuote(s, p, p.airportId, to), total = loadSummary(s, p.id);
  const revenue = manifest(s, p.id).filter(o => o.to === to).reduce((n, o) => n + o.reward, 0);
  return { ...leg, ...total, revenue, profit: revenue - leg.cost };
}
export function planQuote(s: GameState, p: Plane, stops: string[]) {
  check(Array.isArray(stops) && stops.length > 0 && stops.length <= MAX_PLAN_LEGS, '运输计划需要 1 至 5 个航段');
  let from = p.airportId;
  const delivered = new Set<string>(), unopened = new Set<string>();
  const legs = stops.map(to => {
    const leg = legQuote(s, p, from, to), id = routeId(from, to);
    const revenue = manifest(s, p.id).filter(o => o.to === to && !delivered.has(o.id))
      .reduce((n, o) => { delivered.add(o.id); return n + o.reward; }, 0);
    const opened = s.routes.some(r => r.id === id);
    const openingCost = opened || unopened.has(id) ? 0 : routePrice(from, to);
    if (!opened) unopened.add(id);
    const result = { ...leg, from, to, opened, openingCost, revenue };
    from = to; return result;
  });
  const cost = legs.reduce((n, l) => n + l.cost, 0), revenue = legs.reduce((n, l) => n + l.revenue, 0);
  return { legs, cost, revenue, profit: revenue - cost, openingCost: legs.reduce((n, l) => n + l.openingCost, 0),
    duration: legs.reduce((n, l) => n + l.duration, 0) + (legs.length - 1) * TURNAROUND,
    undelivered: manifest(s, p.id).filter(o => !delivered.has(o.id)).length };
}
/** Validate v1 first; preserve a legacy in-flight manifest and its exact locked payment. */
export function migrateV1(value: unknown): GameState {
  const old = validateV1(value);
  const s: GameState = { ...old, version: 4, fleetPeak: old.fleet.length, tutorial: 'skipped', fleet: old.fleet.map(p => ({ ...p, upgrades: emptyUpgrades(), itinerary: [], dispatcher: true })), hangarSlots: Math.max(4, Math.ceil(old.fleet.length / 2) * 2), orders: [], nextOrderId: 1, nextDemandAt: old.simTime + DEMAND_INTERVAL };
  for (const p of s.fleet) {
    const f = p.flight; if (!f) continue;
    const passengerReward = orderReward(f.from, f.to, 'passengers', f.passengers);
    if (f.passengers) issue(s, f.from, f.to, 'passengers', f.passengers, p.id, f.cargo ? passengerReward : f.revenue, f.departAt);
    if (f.cargo) issue(s, f.from, f.to, 'cargo', f.cargo, p.id, f.revenue - (f.passengers ? passengerReward : 0), f.departAt);
  }
  replenish(s); return s;
}
/** Upgrade v2 without moving orders, resetting clocks, or recalculating in-flight income. */
export function migrateV2(value: unknown): GameState {
  const old: V2State = validateV2(value);
  return { ...old, version: 4, fleetPeak: old.fleet.length, tutorial: 'skipped', hangarSlots: Math.max(4, Math.ceil(old.fleet.length / 2) * 2),
    fleet: old.fleet.map(p => ({ ...p, upgrades: emptyUpgrades(), itinerary: [], dispatcher: true })) };
}
/** Preserve all old automatic permissions without charging or changing locked flights. */
export function migrateV3(value: unknown): GameState {
  const old = validateV3(value);
  return { ...old, version: 4, fleetPeak: old.fleet.length, tutorial: 'skipped',
    fleet: old.fleet.map(p => ({ ...p, dispatcher: true })) };
}
export function validateSave(value: unknown): GameState {
  const fail = (): never => { throw new Error('存档结构或经营数据无效，原进度未被覆盖'); };
  const record = (v: unknown, fields: string[]): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v) ||
      Object.keys(v).sort().join('|') !== [...fields].sort().join('|')) return fail();
    return v as Record<string, unknown>;
  };
  const number = (v: unknown, max = 1e12, integer = true): number => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max || (integer && !Number.isSafeInteger(v))) return fail();
    return v;
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const version = (value as { version?: unknown }).version;
  if (version === 1) return validateSave(migrateV1(value));
  if (version === 2) return validateSave(migrateV2(value));
  if (version === 3) return validateSave(migrateV3(value));
  if (version !== SAVE_VERSION) throw new Error('不支持此存档版本；请使用对应版本的游戏');
  const s = structuredClone(value) as GameState;
  record(s, ['version','credits','simTime','lastWallTime','nextId','airports','fleet','routes','stats','claimedTasks','log','orders','nextOrderId','nextDemandAt','hangarSlots','fleetPeak','tutorial']);
  number(s.simTime, 1e12, false); number(s.nextDemandAt, 1e12, false); number(s.nextOrderId);
  if (s.nextOrderId < 1 || s.nextDemandAt <= s.simTime || s.nextDemandAt > s.simTime + DEMAND_INTERVAL) fail();
  number(s.hangarSlots, MAX_FLEET);
  if (s.hangarSlots < 4 || s.hangarSlots % 2 || !Array.isArray(s.fleet) || s.fleet.length > s.hangarSlots ||
    !Array.isArray(s.orders) || s.orders.length > 4096) fail();
  number(s.fleetPeak, MAX_FLEET);
  if (s.fleetPeak < s.fleet.length || !['available','active','completed','skipped'].includes(s.tutorial) ||
    !Array.isArray(s.claimedTasks) || new Set(s.claimedTasks).size !== s.claimedTasks.length ||
    s.claimedTasks.some(id => !TASKS.some(t => t.id === id))) fail();
  if (s.tutorial === 'completed' && !s.claimedTasks.includes('first-flight')) fail();
  for (const id of s.claimedTasks) {
    const task = TASKS.find(t => t.id === id)!;
    if (task.metric === 'fleet' && s.fleetPeak < task.target) fail();
  }
  // The frozen validator checks infrastructure, IDs, stats, clocks and tasks only.
  // Real v4 aircraft, upgrades, plans and flights are checked below, never projected for settlement.
  const { orders: _orders, nextOrderId: _id, nextDemandAt: _time, hangarSlots: _slots, fleetPeak: _peak, tutorial: _tutorial, ...rest } = s;
  const projection: LegacyState = { ...rest, version: 1,
    claimedTasks: s.claimedTasks.filter(id => TASKS.find(t => t.id === id)!.metric !== 'fleet'), fleet: s.fleet.map(p => {
    record(p, ['id','modelId','airportId','readyAt','autoRouteId','flight','upgrades','itinerary','dispatcher']);
    if (typeof p.dispatcher !== 'boolean') fail();
    record(p.upgrades, Object.keys(UPGRADE_LABEL));
    for (const level of Object.values(p.upgrades)) number(level, 3);
    if (!Array.isArray(p.itinerary) || p.itinerary.length > MAX_PLAN_LEGS - 1) fail();
    number(p.readyAt, 1e12, false);
    return { id: p.id, modelId: model(p.modelId).family, airportId: p.airportId, readyAt: 0, autoRouteId: null, flight: null };
  }) };
  validateV1(projection);
  const ids = new Set<string>(), airports = new Set(s.airports.map(a => a.id)), planes = new Map(s.fleet.map(p => [p.id, p]));
  for (const o of s.orders) {
    record(o, ['id','kind','from','to','amount','reward','location','createdAt','expiresAt']);
    if (typeof o.id !== 'string' || !/^JB[1-9]\d{0,11}$/.test(o.id) || Number(o.id.slice(2)) >= s.nextOrderId || ids.has(o.id)) fail();
    ids.add(o.id);
    if (!airports.has(o.from) || !airports.has(o.to) || o.from === o.to || !['passengers','cargo'].includes(o.kind)) fail();
    if (number(o.amount, o.kind === 'passengers' ? 429 : 65) < 1) fail();
    number(o.reward); number(o.createdAt, s.simTime, false);
    if (Math.abs(o.reward - orderReward(o.from, o.to, o.kind, o.amount)) > 1) fail();
    const plane = planes.get(o.location);
    if (plane) {
      if (o.expiresAt !== null || (plane.flight && o.createdAt > plane.flight.departAt) || (!plane.flight && o.to === plane.airportId)) fail();
    } else {
      if (!airports.has(o.location) || o.location === o.to) fail();
      if (o.expiresAt !== null) {
        number(o.expiresAt, 1e12, false);
        if (o.location !== o.from || o.expiresAt !== o.createdAt + ORDER_LIFETIME || o.expiresAt <= s.simTime) fail();
      }
    }
  }
  for (const a of s.airports) if (waiting(s, a.id).length > MAX_WAITING) fail();
  const flightIds = new Set<string>();
  for (const p of s.fleet) {
    if (Number(p.id.slice(2)) < 1) fail();
    const total = loadSummary(s, p.id), m = aircraftSpecs(p);
    if (total.passengers > m.seats || total.cargo > m.cargo) fail();
    if (p.autoRouteId !== null) {
      if (!p.dispatcher) fail();
      const r = s.routes.find(r => r.id === p.autoRouteId);
      if (!r || p.itinerary.length || (r.from !== p.airportId && r.to !== p.airportId)) fail();
      legQuote(s, p, p.airportId, r!.from === p.airportId ? r!.to : r!.from);
    }
    if (p.flight !== null) {
      const f = p.flight;
      record(f, ['id','routeId','from','to','departAt','arriveAt','passengers','cargo','revenue','cost']);
      if (typeof f.id !== 'string' || !/^FL[1-9]\d{0,8}$/.test(f.id) || Number(f.id.slice(2)) >= s.nextId || flightIds.has(f.id)) fail();
      flightIds.add(f.id);
      if (f.from !== p.airportId || f.routeId !== routeId(f.from, f.to) || !s.routes.some(r => r.id === f.routeId)) fail();
      const q = quote(s, p, f.to);
      number(f.departAt, s.simTime, false); number(f.arriveAt, 1e12, false);
      if (p.readyAt > f.departAt || f.arriveAt <= s.simTime || f.arriveAt !== f.departAt + q.duration ||
        f.cost !== q.cost || f.revenue !== q.revenue || f.passengers !== total.passengers || f.cargo !== total.cargo) fail();
      if (p.autoRouteId !== null && (p.autoRouteId !== f.routeId || manifest(s, p.id).some(o => o.to !== f.to))) fail();
    } else if (p.readyAt > s.simTime + (p.autoRouteId ? DEMAND_INTERVAL : TURNAROUND)) fail();
    if (p.itinerary.length) {
      const afterCurrent = { ...p, airportId: p.flight?.to ?? p.airportId };
      if (planQuote(s, afterCurrent, p.itinerary).openingCost !== 0) fail();
    }
  }
  return s;
}
