/** Frozen v7 validator; organization migration only runs AFTER this succeeds. */
import { aircraftSpecs, UPGRADE_LABEL, type UpgradeKey, routeId, TASKS, distance } from './catalog-v7.js';
import { validateSave as validateV6 } from './save-v6.js';
import { MAX_FLEET, TURNAROUND } from './legacy.js';
import { validateInfrastructure } from './save-infrastructure-v7.js';
import { ENERGY_SERVICE_SECONDS, type EnergyBudget } from './energy-v6.js';
import { modernModel, emptyTuning, upgradeLimit, service, MATERIALS } from './career-catalog-v7.js';
import { newCareer } from './career-validation-v7.js';
import { validateCareer, validateTuning } from './save-career-v7.js';
import type { GameState, Plane, Order } from './types-v7.js';
export const SAVE_VERSION = 7;
const MAX_PLAN_LEGS=12, DEMAND_INTERVAL=120, ORDER_LIFETIME=360, MAX_WAITING=24;
const check = (ok: unknown, message: string): void => { if (!ok) throw new Error(message); };
const owned = (s: GameState, id: string) => s.airports.find(a => a.id === id);
export const manifest = (s: GameState, planeId: string) => s.orders.filter(o => o.location === planeId);
export const waiting = (s: GameState, airportId: string) => s.orders.filter(o => o.location === airportId);
export function loadSummary(s: GameState, planeId: string) {
  const jobs = manifest(s, planeId);
  return { passengers: jobs.filter(o => o.kind === 'passengers').reduce((n, o) => n + o.amount, 0),
    cargo: jobs.filter(o => o.kind === 'cargo').reduce((n, o) => n + o.amount, 0) };
}
export function orderReward(from: string, to: string, kind: Order['kind'], amount: number, serviceId = 'legacy') {
  const km = distance(from, to);
  if (serviceId !== 'legacy') return Math.floor(amount * (Math.floor(km / 4) + 50) * (service(serviceId)?.rate ?? 100) / 100);
  return Math.round(amount * (kind === 'passengers' ? 100 + km * 0.18 : 300 + km * 0.4));
}
export function legQuote(s: GameState, p: Plane, from: string, to: string) {
  const m = aircraftSpecs(p), a = owned(s, from), b = owned(s, to);
  check(from !== to, '请选择不同的目的地'); check(a && b, '请先解锁两端机场');
  check(a!.level >= m.level && b!.level >= m.level, `该机型需要两端机场达到 ${m.level} 级`);
  const km = distance(from, to); check(km <= m.range, '航线超出这架飞机的航程');
  if (modernModel(p.modelId)) {
    const d = Math.floor(km / 4), factor = 2 ** p.tuning.group;
    return { km, duration: Math.max(30, Math.floor(d * 450 / m.speed)), cost: Math.max(1, Math.floor(d * m.weight * m.speed * factor * (1 + p.upgrades.capacity) / 400000)) };
  }
  return { km, duration: Math.max(30, Math.ceil(km / m.speed * 45)), cost: Math.round(500 + km * m.costKm) };
}
export const flightEnergy = (p: Plane, seconds: number) => modernModel(p.modelId) ? Math.max(1, Math.floor(seconds / 60)) * 60 : Math.ceil(seconds);
export const energyCapacity = (p: Plane) => aircraftSpecs(p).energy * 60;
export const planeEnergy = (p: Plane): EnergyBudget => ({ availableSeconds: energyCapacity(p), reservedSeconds: 0, serviceUntil: null });
export function departureEnergyReason(p: Plane, seconds: number) { return p.energy.serviceUntil !== null ? '地勤补能中，请完成或取消补能' : p.energy.availableSeconds < flightEnergy(p,seconds) ? '能量不足，请到机库补能' : ''; }
function destinationRevenue(s: GameState, p: Plane, to: string) {
  const orders = manifest(s,p.id).filter(o=>o.to===to), base=orders.reduce((n,o)=>n+o.reward,0);
  if (!modernModel(p.modelId)) return base;
  const m=aircraftSpecs(p), pax=orders.filter(o=>o.kind==='passengers').reduce((n,o)=>n+o.amount,0), cargo=orders.filter(o=>o.kind==='cargo').reduce((n,o)=>n+o.amount,0);
  const full=pax===m.seats&&cargo===m.cargo;
  return Math.floor(base * (full ? 1.25 : 1) * 2 ** p.tuning.group * (1 + p.tuning.evolution * .05));
}
export function quote(s: GameState, p: Plane, to: string) {
  const leg = legQuote(s, p, p.airportId, to), total = loadSummary(s, p.id);
  const revenue = destinationRevenue(s,p,to);
  return { ...leg, ...total, revenue, profit: revenue - leg.cost };
}
export function planQuote(s: GameState, p: Plane, stops: string[]) {
  check(Array.isArray(stops) && stops.length > 0 && stops.length <= MAX_PLAN_LEGS, '运输计划需要 1 至 12 个航段');
  let from = p.airportId;
  const delivered = new Set<string>();
  const legs = stops.map(to => {
    const leg = legQuote(s, p, from, to);
    const due = manifest(s,p.id).filter(o=>o.to===to&&!delivered.has(o.id));
    const revenue = due.length ? destinationRevenue(s,p,to) : 0;
    due.forEach(o=>delivered.add(o.id));
    const opened = s.routes.some(r => r.id === routeId(from, to));
    const result = { ...leg, from, to, opened, openingCost: 0, revenue };
    from = to; return result;
  });
  const cost = legs.reduce((n, l) => n + l.cost, 0), revenue = legs.reduce((n, l) => n + l.revenue, 0);
  return { legs, cost, revenue, profit: revenue - cost, openingCost: 0,
    duration: legs.reduce((n, l) => n + l.duration, 0) + (legs.length - 1) * TURNAROUND,
    undelivered: manifest(s, p.id).filter(o => !delivered.has(o.id)).length };
}
/** Older saves always pass their frozen validators before any migration. */
export function migrateV6(value: unknown): GameState {
  const old=validateV6(value),career=newCareer(old.simTime,old.lastWallTime);career.airportPeak=old.airports.length;
  return {...old,version:7,career,fleet:old.fleet.map(p=>({...p,tuning:emptyTuning()})),orders:old.orders.map(o=>({...o,service:'legacy',product:null}))};
}
export const migrateV1=migrateV6, migrateV2=migrateV6, migrateV3=migrateV6, migrateV4=migrateV6, migrateV5=migrateV6;
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
  if (version === 4) return validateSave(migrateV4(value));
  if (version === 5) return validateSave(migrateV5(value));
  if (version === 6) return validateSave(migrateV6(value));
  if (version !== SAVE_VERSION) throw new Error('不支持此存档版本；请使用对应版本的游戏');
  const s = structuredClone(value) as GameState;
  record(s, ['version','credits','simTime','lastWallTime','nextId','airports','fleet','routes','stats','claimedTasks','log','orders','nextOrderId','nextDemandAt','hangarSlots','fleetPeak','tutorial','career']);
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
  validateCareer(s);
  validateInfrastructure(s);
  // v6 validates the expanded registry directly; never relax frozen legacy schemas.
  for (const p of [...s.fleet,...s.career.stored]) {
    record(p, ['id','modelId','airportId','readyAt','autoRouteId','flight','upgrades','itinerary','dispatcher','energy','tuning']);
    validateTuning(p);
    record(p.energy, ['availableSeconds','reservedSeconds','serviceUntil']);
    number(p.energy.availableSeconds, energyCapacity(p));
    number(p.energy.reservedSeconds, energyCapacity(p));
    if (p.energy.availableSeconds + p.energy.reservedSeconds > energyCapacity(p) ||
      (!p.flight && p.energy.reservedSeconds !== 0) ||
      (p.flight && (modernModel(p.modelId) || p.energy.reservedSeconds !== 0) && p.energy.reservedSeconds !== flightEnergy(p,Math.round(p.flight.arriveAt-p.flight.departAt)))) fail();
    if (p.energy.serviceUntil !== null) {
      number(p.energy.serviceUntil, 1e12, false);
      if (p.energy.serviceUntil <= s.simTime || p.energy.serviceUntil > s.simTime + ENERGY_SERVICE_SECONDS ||
        p.energy.availableSeconds === energyCapacity(p) || p.flight !== null || p.autoRouteId !== null ||
        !Array.isArray(p.itinerary) || p.itinerary.length || p.readyAt > s.simTime) fail();
    }
    if (typeof p.dispatcher !== 'boolean') fail();
    record(p.upgrades, Object.keys(UPGRADE_LABEL));
    for (const key of Object.keys(UPGRADE_LABEL) as UpgradeKey[]) number(p.upgrades[key], upgradeLimit(p,key));
    if (!Array.isArray(p.itinerary) || p.itinerary.length > MAX_PLAN_LEGS - 1) fail();
    number(p.readyAt, 1e12, false);
  }
  const ids = new Set<string>(), airports = new Set(s.airports.map(a => a.id)), planes = new Map(s.fleet.map(p => [p.id, p]));
  for (const o of s.orders) {
    record(o, ['id','kind','from','to','amount','reward','location','createdAt','expiresAt','service','product']);
    if (typeof o.id !== 'string' || !/^JB[1-9]\d{0,11}$/.test(o.id) || Number(o.id.slice(2)) >= s.nextOrderId || ids.has(o.id)) fail();
    ids.add(o.id);
    if (!airports.has(o.from) || !airports.has(o.to) || o.from === o.to || !['passengers','cargo'].includes(o.kind)) fail();
    if (number(o.amount, o.kind === 'passengers' ? 500 : 200) < 1) fail();
    number(o.reward); number(o.createdAt, s.simTime, false);
    if (o.service !== 'legacy' && (!service(o.service) || service(o.service)!.kind !== o.kind)) fail();
    if (o.product !== null) { if (!Object.hasOwn(MATERIALS,o.product) || o.kind !== 'cargo' || o.service !== 'general' || o.reward !== 0 || o.expiresAt !== null) fail(); }
    else if (Math.abs(o.reward - orderReward(o.from, o.to, o.kind, o.amount,o.service)) > (o.service === 'legacy' ? 1 : 0)) fail();
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
    if (manifest(s,p.id).some(o=>service(o.service)?.special !== undefined && service(o.service)!.special !== 'none' && service(o.service)!.special !== p.tuning.special)) fail();
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
