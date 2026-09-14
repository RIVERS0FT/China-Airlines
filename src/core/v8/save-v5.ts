/** Frozen v5 validator from main 5b79d57. Accepts both historical aggregated
 * orders / lark aircraft and the later unit-order / starter-lark variant.
 * No commands or settlement. Never import the expanding current catalogue. */
import { aircraftSpecs, UPGRADE_LABEL, model, routeId, TASKS, distance } from './catalog-v5.js';
import { validateSave as validateV1, type GameState as LegacyState } from './legacy.js';
import { MAX_FLEET, TURNAROUND } from './legacy.js';
import type { GameState as V4State } from './save-v4.js';
import type { EnergyBudget } from './energy.js';
const SAVE_VERSION = 5, DEMAND_INTERVAL = 120, ORDER_LIFETIME = 360, MAX_WAITING = 24, MAX_PLAN_LEGS = 5;
const ENERGY_CAPACITY_SECONDS = 14400, ENERGY_SERVICE_SECONDS = 120;
export type V5State = Omit<V4State, 'version' | 'fleet'> & {
  version: 5; fleet: (V4State['fleet'][number] & { energy: EnergyBudget })[];
};
type GameState = V5State;
type Plane = V5State['fleet'][number];
type Order = V5State['orders'][number];
const check = (ok: unknown, message: string): void => { if (!ok) throw new Error(message); };
const owned = (s: GameState, id: string) => s.airports.find(a => a.id === id);
const manifest = (s: GameState, planeId: string) => s.orders.filter(o => o.location === planeId);
const waiting = (s: GameState, airportId: string) => s.orders.filter(o => o.location === airportId);
function loadSummary(s: GameState, planeId: string) {
  const jobs = manifest(s, planeId);
  return { passengers: jobs.filter(o => o.kind === 'passengers').reduce((n, o) => n + o.amount, 0),
    cargo: jobs.filter(o => o.kind === 'cargo').reduce((n, o) => n + o.amount, 0) };
}
function orderReward(from: string, to: string, kind: Order['kind'], amount: number) {
  const km = distance(from, to);
  return Math.round(amount * (kind === 'passengers' ? 100 + km * 0.18 : 300 + km * 0.4));
}
function legQuote(s: GameState, p: Plane, from: string, to: string) {
  const m = aircraftSpecs(p), a = owned(s, from), b = owned(s, to);
  check(from !== to, '请选择不同的目的地'); check(a && b, '请先解锁两端机场');
  check(a!.level >= m.level && b!.level >= m.level, `该机型需要两端机场达到 ${m.level} 级`);
  const km = distance(from, to); check(km <= m.range, '航线超出这架飞机的航程');
  return { km, duration: Math.max(30, Math.ceil(km / m.speed * 45)), cost: Math.round(500 + km * m.costKm) };
}
function quote(s: GameState, p: Plane, to: string) {
  const leg = legQuote(s, p, p.airportId, to), total = loadSummary(s, p.id);
  const revenue = manifest(s, p.id).filter(o => o.to === to).reduce((n, o) => n + o.reward, 0);
  return { ...leg, ...total, revenue, profit: revenue - leg.cost };
}
function planQuote(s: GameState, p: Plane, stops: string[]) {
  check(Array.isArray(stops) && stops.length > 0 && stops.length <= MAX_PLAN_LEGS, '运输计划需要 1 至 5 个航段');
  let from = p.airportId;
  const delivered = new Set<string>();
  const legs = stops.map(to => {
    const leg = legQuote(s, p, from, to);
    const revenue = manifest(s, p.id).filter(o => o.to === to && !delivered.has(o.id))
      .reduce((n, o) => { delivered.add(o.id); return n + o.reward; }, 0);
    const opened = s.routes.some(r => r.id === routeId(from, to));
    const result = { ...leg, from, to, opened, openingCost: 0, revenue };
    from = to; return result;
  });
  const cost = legs.reduce((n, l) => n + l.cost, 0), revenue = legs.reduce((n, l) => n + l.revenue, 0);
  return { legs, cost, revenue, profit: revenue - cost, openingCost: 0,
    duration: legs.reduce((n, l) => n + l.duration, 0) + (legs.length - 1) * TURNAROUND,
    undelivered: manifest(s, p.id).filter(o => !delivered.has(o.id)).length };
}
export function validateV5(value: unknown): V5State {
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
  // Real v5 aircraft, upgrades, plans and flights are checked below, never projected for settlement.
  const { orders: _orders, nextOrderId: _id, nextDemandAt: _time, hangarSlots: _slots, fleetPeak: _peak, tutorial: _tutorial, ...rest } = s;
  const projection: LegacyState = { ...rest, version: 1,
    claimedTasks: s.claimedTasks.filter(id => TASKS.find(t => t.id === id)!.metric !== 'fleet'), fleet: s.fleet.map(p => {
    record(p, ['id','modelId','airportId','readyAt','autoRouteId','flight','upgrades','itinerary','dispatcher','energy']);
    record(p.energy, ['availableSeconds','reservedSeconds','serviceUntil']);
    number(p.energy.availableSeconds, ENERGY_CAPACITY_SECONDS);
    number(p.energy.reservedSeconds, ENERGY_CAPACITY_SECONDS);
    if (p.energy.availableSeconds + p.energy.reservedSeconds > ENERGY_CAPACITY_SECONDS ||
      (!p.flight && p.energy.reservedSeconds !== 0) ||
      (p.flight && p.energy.reservedSeconds !== 0 && p.flight.arriveAt !== p.flight.departAt + p.energy.reservedSeconds)) fail();
    if (p.energy.serviceUntil !== null) {
      number(p.energy.serviceUntil, 1e12, false);
      if (p.energy.serviceUntil <= s.simTime || p.energy.serviceUntil > s.simTime + ENERGY_SERVICE_SECONDS ||
        p.energy.availableSeconds === ENERGY_CAPACITY_SECONDS || p.flight !== null || p.autoRouteId !== null ||
        !Array.isArray(p.itinerary) || p.itinerary.length || p.readyAt > s.simTime) fail();
    }
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

