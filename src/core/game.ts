import { airport, model, routeId, routePrice, TASKS, upgradePrice, distance } from './catalog.js';
import { GameCore as LegacyCore, validateSave as validateV1, quote as routeQuote, type GameState as LegacyState, type Plane, type Command as LegacyCommand, type AdvanceReport } from './legacy.js';
export { MAX_FLEET, OFFLINE_LIMIT, TURNAROUND } from './legacy.js';
export type { Plane, Flight, AdvanceReport } from './legacy.js';
import { MAX_FLEET, OFFLINE_LIMIT, TURNAROUND } from './legacy.js';

export const SAVE_VERSION = 2;
export const DEMAND_INTERVAL = 120;
export const ORDER_LIFETIME = 360;
export const MAX_WAITING = 24;
export interface Order {
  id: string; kind: 'passengers' | 'cargo'; from: string; to: string; amount: number;
  reward: number; location: string; createdAt: number; expiresAt: number | null;
}
export interface GameState extends Omit<LegacyState, 'version'> {
  version: 2; orders: Order[]; nextOrderId: number; nextDemandAt: number;
}
export type Command = LegacyCommand
  | { type: 'load' | 'unload'; planeId: string; orderId: string }
  | { type: 'load-destination'; planeId: string; to: string };
const check = (ok: unknown, message: string): void => { if (!ok) throw new Error(message); };
const owned = (s: GameState, id: string) => s.airports.find(a => a.id === id);
const clock = (now: number) => check(Number.isFinite(now) && now >= 0 && now <= 8.64e15, '无效的系统时间');
const base = (s: GameState) => s as unknown as LegacyState;
function note(s: GameState, text: string, amount = 0) {
  s.log.unshift({ at: s.simTime, text, amount }); s.log.length = Math.min(s.log.length, 60);
}
function spend(s: GameState, amount: number) { check(s.credits >= amount, '运营资金不足'); s.credits -= amount; }
export function taskProgress(s: GameState, taskId: string) {
  const t = TASKS.find(t => t.id === taskId);
  return !t ? 0 : t.metric === 'flights' ? s.stats.flights : t.metric === 'fleet' ? s.fleet.length : s.airports.length;
}
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
function planeAtGate(s: GameState, planeId: string) {
  const p = s.fleet.find(p => p.id === planeId); check(p, '未找到这架飞机');
  check(!p!.flight, '飞机正在飞行，不能装卸');
  check(s.simTime >= p!.readyAt, '飞机正在地面周转');
  check(!p!.autoRouteId, '请先停止自动往返再手动装卸');
  return p!;
}
function fits(s: GameState, p: Plane, o: Order) {
  const m = model(p.modelId), total = loadSummary(s, p.id);
  return o.kind === 'passengers' ? total.passengers + o.amount <= m.seats : total.cargo + o.amount <= m.cargo;
}
function loadForDestination(s: GameState, p: Plane, to: string) {
  check(owned(s, to) && to !== p.airportId, '请选择已解锁的其他机场');
  let count = 0;
  for (const o of waiting(s, p.airportId).filter(o => o.to === to)) {
    if (fits(s, p, o)) { o.location = p.id; o.expiresAt = null; count++; }
  }
  return count;
}
export function quote(s: GameState, p: Plane, to: string) {
  const plan = routeQuote(base(s), p, to), total = loadSummary(s, p.id);
  const revenue = manifest(s, p.id).filter(o => o.to === to).reduce((n, o) => n + o.reward, 0);
  return { ...plan, ...total, revenue, profit: revenue - plan.cost };
}
function depart(s: GameState, p: Plane, to: string, auto: boolean) {
  check(!p.flight, '飞机正在飞行'); check(s.simTime >= p.readyAt, '飞机正在地面周转');
  const id = routeId(p.airportId, to); check(s.routes.some(r => r.id === id), '请先开通这条航线');
  check(!auto || manifest(s, p.id).every(o => o.to === to), '自动往返只支持全部订单直达，请先卸下中转订单');
  check(!auto || manifest(s, p.id).length > 0, '自动往返需要先装载客货');
  const q = quote(s, p, to); spend(s, q.cost); s.stats.costs += q.cost; p.autoRouteId = auto ? id : null;
  p.flight = { id: `FL${s.nextId++}`, routeId: id, from: p.airportId, to, departAt: s.simTime,
    arriveAt: s.simTime + q.duration, passengers: q.passengers, cargo: q.cargo, revenue: q.revenue, cost: q.cost };
  note(s, `${p.id} ${airport(p.airportId).city} → ${airport(to).city} 起飞`, -q.cost);
}
function arrive(s: GameState, p: Plane) {
  const f = p.flight!, delivered = manifest(s, p.id).filter(o => o.to === f.to);
  const ids = new Set(delivered.map(o => o.id));
  s.orders = s.orders.filter(o => !ids.has(o.id));
  p.airportId = f.to; p.flight = null; p.readyAt = s.simTime + TURNAROUND;
  s.credits += f.revenue; s.stats.revenue += f.revenue; s.stats.flights++;
  for (const o of delivered) s.stats[o.kind] += o.amount;
  note(s, `${p.id} 抵达${airport(f.to).city} · 交付 ${delivered.length} 单`, f.revenue);
}
function advance(s: GameState, now: number): AdvanceReport {
  clock(now);
  const gap = (now - s.lastWallTime) / 1000, elapsed = Math.min(OFFLINE_LIMIT, Math.max(0, gap));
  s.lastWallTime = now;
  const end = s.simTime + elapsed, before = { ...s.stats };
  for (;;) {
    let next: Plane | undefined, at = Math.min(s.nextDemandAt, ...s.orders.filter(o => o.expiresAt !== null).map(o => o.expiresAt!));
    for (const p of s.fleet) {
      const time = p.flight?.arriveAt ?? (p.autoRouteId ? Math.max(s.simTime, p.readyAt) : Infinity);
      if (time < at) { next = p; at = time; }
    }
    if (at > end) break;
    s.simTime = at;
    // Supply refresh has priority at equal timestamps, then fleet array order.
    if (!next) {
      if (at === s.nextDemandAt) { replenish(s); s.nextDemandAt += DEMAND_INTERVAL; }
      else s.orders = s.orders.filter(o => o.expiresAt === null || o.expiresAt > s.simTime);
      continue;
    }
    if (next.flight) { arrive(s, next); continue; }
    const r = s.routes.find(r => r.id === next!.autoRouteId);
    try {
      check(r, '自动航线不存在'); const to = r!.from === next.airportId ? r!.to : r!.from;
      loadForDestination(s, next, to);
      if (!manifest(s, next.id).length) { next.readyAt = s.nextDemandAt; continue; }
      depart(s, next, to, true);
    } catch (error) {
      next.autoRouteId = null; next.readyAt = s.simTime;
      note(s, `${next.id} 自动往返已停止：${error instanceof Error ? error.message : '无法起飞'}`);
    }
  }
  s.simTime = end;
  return { elapsed, flights: s.stats.flights - before.flights, revenue: s.stats.revenue - before.revenue,
    profit: s.stats.revenue - before.revenue - (s.stats.costs - before.costs), capped: gap > OFFLINE_LIMIT, clockBack: gap < 0 };
}
export class GameCore {
  private state: GameState;
  constructor(now: number, saved?: unknown) {
    clock(now); this.state = saved === undefined ? migrateV1(new LegacyCore(now).snapshot()) : validateSave(saved);
  }
  snapshot(): GameState { return structuredClone(this.state); }
  tick(now: number): AdvanceReport { return advance(this.state, now); }
  static imported(value: unknown, now: number) {
    clock(now); const s = validateSave(value); s.lastWallTime = now; return new GameCore(now, s);
  }
  execute(command: Command, now: number) {
    this.tick(now); const s = this.snapshot();
    switch (command.type) {
      case 'load': {
        const p = planeAtGate(s, command.planeId), o = s.orders.find(o => o.id === command.orderId);
        check(o && o.location === p.airportId, '订单不在当前机场或已被装载'); check(fits(s, p, o!), '剩余客舱或货舱容量不足');
        o!.location = p.id; o!.expiresAt = null; note(s, `${p.id} 已装载 ${o!.id} · 前往${airport(o!.to).city}`); break;
      }
      case 'unload': {
        const p = planeAtGate(s, command.planeId), o = s.orders.find(o => o.id === command.orderId);
        check(o && o.location === p.id, '订单不在这架飞机上'); check(waiting(s, p.airportId).length < MAX_WAITING, '机场候运区已满');
        o!.location = p.airportId; o!.expiresAt = null; note(s, `${o!.id} 已卸至${airport(p.airportId).city}，等待转运`); break;
      }
      case 'load-destination': {
        const p = planeAtGate(s, command.planeId), count = loadForDestination(s, p, command.to);
        check(count > 0, '没有可装载的同目的地订单，或容量不足'); note(s, `${p.id} 已装载 ${count} 单 · 前往${airport(command.to).city}`); break;
      }
      case 'unlock': {
        const a = airport(command.airportId); check(!owned(s, a.id), '机场已经解锁'); spend(s, a.price);
        s.airports.push({ id: a.id, level: 1 }); replenish(s); note(s, `解锁${a.city}机场`, -a.price); break;
      }
      case 'upgrade': {
        const a = owned(s, command.airportId); check(a, '机场尚未解锁'); check(a!.level < 3, '机场已达到最高等级');
        const price = upgradePrice(a!.level); spend(s, price); a!.level++;
        note(s, `${airport(a!.id).city}机场升至 ${a!.level} 级`, -price); break;
      }
      case 'buy': {
        const m = model(command.modelId), a = owned(s, command.airportId);
        check(a && a.level >= m.level, `交付机场需要达到 ${m.level} 级`); check(s.fleet.length < MAX_FLEET, `机队上限为 ${MAX_FLEET} 架`);
        spend(s, m.price); const id = `AC${String(s.nextId++).padStart(4, '0')}`;
        s.fleet.push({ id, modelId: m.id, airportId: command.airportId, readyAt: s.simTime, autoRouteId: null, flight: null });
        note(s, `${m.name} 加入机队 · ${id}`, -m.price); break;
      }
      case 'route': {
        check(command.from !== command.to, '航线需要两个不同机场'); check(owned(s, command.from) && owned(s, command.to), '请先解锁两端机场');
        const id = routeId(command.from, command.to); check(!s.routes.some(r => r.id === id), '航线已经开通');
        const price = routePrice(command.from, command.to); spend(s, price); s.routes.push({ id, from: command.from, to: command.to });
        note(s, `开通${airport(command.from).city} ↔ ${airport(command.to).city}`, -price); break;
      }
      case 'dispatch': {
        const p = s.fleet.find(p => p.id === command.planeId); check(p, '未找到这架飞机'); check(typeof command.auto === 'boolean', '自动往返参数无效');
        depart(s, p!, command.to, command.auto); break;
      }
      case 'stop': {
        const p = s.fleet.find(p => p.id === command.planeId); check(p, '未找到这架飞机'); p!.autoRouteId = null;
        if (!p!.flight) p!.readyAt = Math.min(p!.readyAt, s.simTime + TURNAROUND);
        note(s, `${p!.id} 已关闭自动往返，当前航班仍将正常到达`); break;
      }
      case 'claim': {
        const t = TASKS.find(t => t.id === command.taskId); check(t, '未知任务'); check(!s.claimedTasks.includes(command.taskId), '奖励已经领取');
        check(taskProgress(s, command.taskId) >= t!.target, '任务尚未完成'); s.claimedTasks.push(command.taskId); s.credits += t!.reward;
        note(s, `完成任务：${t!.title}`, t!.reward); break;
      }
      default: throw new Error('未知经营命令');
    }
    this.state = s;
  }
}

/** Validate v1 first; preserve a legacy in-flight manifest and its exact locked payment. */
export function migrateV1(value: unknown): GameState {
  const old = validateV1(value);
  const s: GameState = { ...old, version: 2, orders: [], nextOrderId: 1, nextDemandAt: old.simTime + DEMAND_INTERVAL };
  for (const p of s.fleet) {
    const f = p.flight; if (!f) continue;
    const passengerReward = orderReward(f.from, f.to, 'passengers', f.passengers);
    if (f.passengers) issue(s, f.from, f.to, 'passengers', f.passengers, p.id, f.cargo ? passengerReward : f.revenue, f.departAt);
    if (f.cargo) issue(s, f.from, f.to, 'cargo', f.cargo, p.id, f.revenue - (f.passengers ? passengerReward : 0), f.departAt);
  }
  replenish(s); return s;
}
export function validateSave(value: unknown): GameState {
  const fail = (): never => { throw new Error('存档结构或经营数据无效，原进度未被覆盖'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const version = (value as { version?: unknown }).version;
  if (version === 1) return validateSave(migrateV1(value));
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
export function parseSave(raw: string) {
  check(new TextEncoder().encode(raw).length <= 1_000_000, '存档文件过大（上限 1 MB）');
  let value: unknown; try { value = JSON.parse(raw); } catch { throw new Error('无法解析 JSON 存档，原进度未被覆盖'); }
  return validateSave(value);
}
