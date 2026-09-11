import { aircraftSpecs, emptyUpgrades, retrofitPrice, hangarPrice, UPGRADE_LABEL, type Upgrades, type UpgradeKey, airport, model, routeId, TASKS, upgradePrice, distance } from './catalog.js';
import { GameCore as LegacyCore, validateSave as validateV1, type GameState as LegacyState, type Plane as LegacyPlane, type Command as LegacyCommand, type AdvanceReport } from './legacy.js';
export { MAX_FLEET, OFFLINE_LIMIT, TURNAROUND } from './legacy.js';
export type { Flight, AdvanceReport } from './legacy.js';
import { MAX_FLEET, OFFLINE_LIMIT, TURNAROUND } from './legacy.js';

import { validateV2, type GameState as V2State } from './save-v2.js';
import { validateSave as validateV3 } from './save-v3.js';
import { validateSave as validateV4 } from './save-v4.js';
import { fullEnergy, energyRequired, energyDepartureReason, ENERGY_CAPACITY_SECONDS, ENERGY_SERVICE_SECONDS, type EnergyBudget } from './energy.js';
import { DISPATCHER_PRICE, resaleValue } from './management.js';
export const SAVE_VERSION = 5;
export type TutorialState = 'available' | 'active' | 'completed' | 'skipped';
export const MAX_PLAN_LEGS = 5;
export interface Plane extends LegacyPlane { upgrades: Upgrades; itinerary: string[]; dispatcher: boolean; energy: EnergyBudget }
export const DEMAND_INTERVAL = 120;
export const ORDER_LIFETIME = 360;
export const MAX_WAITING = 24;
export interface Order {
  id: string; kind: 'passengers' | 'cargo'; from: string; to: string; amount: number;
  reward: number; location: string; createdAt: number; expiresAt: number | null;
}
export interface GameState extends Omit<LegacyState, 'version' | 'fleet'> {
  version: 5; fleet: Plane[]; hangarSlots: number; orders: Order[]; nextOrderId: number; nextDemandAt: number; fleetPeak: number; tutorial: TutorialState;
}
export type Command = LegacyCommand
  | { type: 'load' | 'unload'; planeId: string; orderId: string }
  | { type: 'load-destination'; planeId: string; to: string }
  | { type: 'retrofit'; planeId: string; upgrade: UpgradeKey }
  | { type: 'expand-hangar' }
  | { type: 'dispatch-plan' | 'open-plan-routes'; planeId: string; stops: string[] }
  | { type: 'cancel-plan'; planeId: string }
  | { type: 'hire-dispatcher' | 'dismiss-dispatcher' | 'sell-plane'; planeId: string }
  | { type: 'start-duty'; planeId: string; to: string }
  | { type: 'service-energy' | 'cancel-energy-service'; planeId: string }
  | { type: 'tutorial'; action: 'start' | 'skip' | 'finish' };
const check = (ok: unknown, message: string): void => { if (!ok) throw new Error(message); };
const owned = (s: GameState, id: string) => s.airports.find(a => a.id === id);
const clock = (now: number) => check(Number.isFinite(now) && now >= 0 && now <= 8.64e15, '无效的系统时间');
function note(s: GameState, text: string, amount = 0) {
  s.log.unshift({ at: s.simTime, text, amount }); s.log.length = Math.min(s.log.length, 60);
}
function spend(s: GameState, amount: number) { check(s.credits >= amount, '运营资金不足'); s.credits -= amount; }
function ensureRoute(s: GameState, from: string, to: string) {
  const id = routeId(from, to);
  if (!s.routes.some(r => r.id === id)) s.routes.push({ id, from, to });
  return id;
}
export function taskProgress(s: GameState, taskId: string) {
  const t = TASKS.find(t => t.id === taskId);
  return !t ? 0 : t.metric === 'flights' ? s.stats.flights : t.metric === 'fleet' ? s.fleetPeak : s.airports.length;
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
  check(p!.energy.serviceUntil === null, '地勤补能中，请完成或取消补能');
  check(s.simTime >= p!.readyAt, '飞机正在地面周转');
  check(!p!.autoRouteId, '请先停止自动往返再手动装卸');
  check(!p!.itinerary.length, '请先取消剩余运输计划');
  return p!;
}
function fits(s: GameState, p: Plane, o: Order) {
  const m = aircraftSpecs(p), total = loadSummary(s, p.id);
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
function depart(s: GameState, p: Plane, to: string, auto: boolean) {
  check(!p.flight, '飞机正在飞行'); check(s.simTime >= p.readyAt, '飞机正在地面周转');
  check(!auto || p.dispatcher, '请先在机库雇用随航调度员');
  check(!auto || manifest(s, p.id).every(o => o.to === to), '自动往返只支持全部订单直达，请先卸下中转订单');
  check(!auto || manifest(s, p.id).length > 0, '自动往返需要先装载客货');
  const q = quote(s, p, to);
  const energyError = energyDepartureReason(p.energy, q.duration); check(!energyError, energyError);
  spend(s, q.cost); p.energy.availableSeconds -= energyRequired(q.duration); p.energy.reservedSeconds = q.duration; s.stats.costs += q.cost;
  const id = ensureRoute(s, p.airportId, to); p.autoRouteId = auto ? id : null;
  p.flight = { id: `FL${s.nextId++}`, routeId: id, from: p.airportId, to, departAt: s.simTime,
    arriveAt: s.simTime + q.duration, passengers: q.passengers, cargo: q.cargo, revenue: q.revenue, cost: q.cost };
  note(s, `${p.id} ${airport(p.airportId).city} → ${airport(to).city} 起飞`, -q.cost);
}
function arrive(s: GameState, p: Plane) {
  const f = p.flight!, delivered = manifest(s, p.id).filter(o => o.to === f.to);
  const ids = new Set(delivered.map(o => o.id));
  s.orders = s.orders.filter(o => !ids.has(o.id));
  p.energy.reservedSeconds = 0;
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
      const time = p.energy.serviceUntil ?? p.flight?.arriveAt ?? (p.autoRouteId || p.itinerary.length ? Math.max(s.simTime, p.readyAt) : Infinity);
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
    if (next.energy.serviceUntil !== null) {
      next.energy = fullEnergy(); note(s, `${next.id} 地勤补能完成 · 可用能量 240 点`); continue;
    }
    if (next.flight) { arrive(s, next); continue; }
    if (next.itinerary.length) {
      try {
        depart(s, next, next.itinerary[0]!, false);
        next.itinerary.shift();
      } catch (error) {
        next.itinerary = []; next.readyAt = s.simTime;
        note(s, `${next.id} 运输计划停止：${error instanceof Error ? error.message : '无法起飞'}`);
      }
      continue;
    }
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
    if (saved === undefined) this.state.tutorial = 'available';
  }
  snapshot(): GameState { return structuredClone(this.state); }
  tick(now: number): AdvanceReport { return advance(this.state, now); }
  static imported(value: unknown, now: number) {
    clock(now); const s = validateSave(value); s.lastWallTime = now; return new GameCore(now, s);
  }
  execute(command: Command, now: number) {
    this.tick(now); const s = this.snapshot();
    switch (command.type) {
      case 'service-energy': {
        const p = planeAtGate(s, command.planeId);
        check(p.energy.availableSeconds < ENERGY_CAPACITY_SECONDS, '能量已满，无需补能');
        p.energy.serviceUntil = s.simTime + ENERGY_SERVICE_SECONDS;
        note(s, `${p.id} 开始地勤补能 · 120 秒后补满，费用 0`); break;
      }
      case 'cancel-energy-service': {
        const p = s.fleet.find(p => p.id === command.planeId); check(p, '未找到这架飞机');
        check(p!.energy.serviceUntil !== null, '这架飞机没有进行补能');
        p!.energy.serviceUntil = null;
        note(s, `${p!.id} 已取消补能，能量余额未增加`); break;
      }
      case 'hire-dispatcher': {
        const p = planeAtGate(s, command.planeId);
        check(!p.dispatcher, '这架飞机已有调度员'); spend(s, DISPATCHER_PRICE); p.dispatcher = true;
        note(s, `${p.id} 随航调度员已入职`, -DISPATCHER_PRICE); break;
      }
      case 'dismiss-dispatcher': {
        const p = planeAtGate(s, command.planeId); check(p.dispatcher, '这架飞机没有调度员');
        p.dispatcher = false; note(s, `${p.id} 调度员已解聘，雇用费用不退还`); break;
      }
      case 'start-duty': {
        const p = planeAtGate(s, command.planeId); check(p.dispatcher, '请先在机库雇用随航调度员');
        legQuote(s, p, p.airportId, command.to);
        const id = routeId(p.airportId, command.to);
        check(manifest(s, p.id).every(o => o.to === command.to), '自动值勤只运送直达订单，请先卸下中转订单');
        loadForDestination(s, p, command.to);
        if (manifest(s, p.id).length) depart(s, p, command.to, true);
        else { ensureRoute(s, p.airportId, command.to); p.autoRouteId = id; p.readyAt = s.nextDemandAt; }
        note(s, `${p.id} 自动值勤已开始 · ${p.flight ? '装载起飞' : '等待真实客源'}`); break;
      }
      case 'sell-plane': {
        const p = planeAtGate(s, command.planeId);
        check(s.fleet.length > 1, '必须保留至少一架飞机');
        check(manifest(s, p.id).length === 0, '请先卸下全部客货，不能随飞机删除订单');
        const value = resaleValue(p); s.fleet = s.fleet.filter(item => item.id !== p.id); s.credits += value;
        note(s, `${p.id} 已出售，机位已释放${p.dispatcher ? '，随航调度员合同已结束' : ''}`, value); break;
      }
      case 'tutorial': {
        check(['start', 'skip', 'finish'].includes(command.action), '无效的引导操作');
        if (command.action === 'finish') check(s.claimedTasks.includes('first-flight'), '请先完成首航并领取奖励');
        s.tutorial = command.action === 'start' ? 'active' : command.action === 'skip' ? 'skipped' : 'completed';
        note(s, command.action === 'start' ? '起航引导已打开' : command.action === 'skip' ? '已跳过引导，可从帮助重新打开' : '起航引导已完成'); break;
      }
      case 'retrofit': {
        check(Object.hasOwn(UPGRADE_LABEL, command.upgrade), '未知改装项目');
        const p = planeAtGate(s, command.planeId), key = command.upgrade;
        check(p.upgrades[key] < 3, '改装已达到最高等级');
        const price = retrofitPrice(p, key); spend(s, price); p.upgrades[key]++;
        note(s, `${p.id} ${UPGRADE_LABEL[key]}升至 ${p.upgrades[key]} 级`, -price); break;
      }
      case 'expand-hangar': {
        check(s.hangarSlots < MAX_FLEET, '机库已达到最高容量');
        const price = hangarPrice(s.hangarSlots); spend(s, price); s.hangarSlots = Math.min(MAX_FLEET, s.hangarSlots + 2);
        note(s, `机库扩建至 ${s.hangarSlots} 个机位`, -price); break;
      }
      case 'open-plan-routes': {
        const p = planeAtGate(s, command.planeId); planQuote(s, p, command.stops); break;
      }
      case 'dispatch-plan': {
        const p = planeAtGate(s, command.planeId); planQuote(s, p, command.stops);
        depart(s, p, command.stops[0]!, false); p.itinerary = command.stops.slice(1);
        note(s, `${p.id} 运输计划开始 · ${command.stops.map(id => airport(id).city).join(' → ')}`); break;
      }
      case 'cancel-plan': {
        const p = s.fleet.find(p => p.id === command.planeId); check(p, '未找到这架飞机');
        check(p!.itinerary.length, '没有剩余运输计划'); p!.itinerary = [];
        note(s, `${p!.id} 剩余计划已取消，当前航班不受影响`); break;
      }
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
        check(a && a.level >= m.level, `交付机场需要达到 ${m.level} 级`); check(s.fleet.length < s.hangarSlots, '机库机位不足，请先扩建机库');
        spend(s, m.price); const id = `AC${String(s.nextId++).padStart(4, '0')}`;
        s.fleet.push({ id, modelId: m.id, airportId: command.airportId, readyAt: s.simTime, autoRouteId: null, flight: null, upgrades: emptyUpgrades(), itinerary: [], dispatcher: false, energy: fullEnergy() });
        s.fleetPeak = Math.max(s.fleetPeak, s.fleet.length);
        note(s, `${m.name} 加入机队 · ${id}`, -m.price); break;
      }
      case 'route': {
        check(command.from !== command.to, '航线需要两个不同机场'); check(owned(s, command.from) && owned(s, command.to), '请先解锁两端机场');
        ensureRoute(s, command.from, command.to); break;
      }
      case 'dispatch': {
        const p = s.fleet.find(p => p.id === command.planeId); check(p, '未找到这架飞机'); check(typeof command.auto === 'boolean', '自动往返参数无效');
        check(!p!.itinerary.length, '请先取消剩余运输计划');
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
  const s: GameState = { ...old, version: 5, fleetPeak: old.fleet.length, tutorial: 'skipped', fleet: old.fleet.map(p => ({ ...p, upgrades: emptyUpgrades(), itinerary: [], dispatcher: true, energy: fullEnergy() })), hangarSlots: Math.max(4, Math.ceil(old.fleet.length / 2) * 2), orders: [], nextOrderId: 1, nextDemandAt: old.simTime + DEMAND_INTERVAL };
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
  return { ...old, version: 5, fleetPeak: old.fleet.length, tutorial: 'skipped', hangarSlots: Math.max(4, Math.ceil(old.fleet.length / 2) * 2),
    fleet: old.fleet.map(p => ({ ...p, upgrades: emptyUpgrades(), itinerary: [], dispatcher: true, energy: fullEnergy() })) };
}
/** Preserve all old automatic permissions without charging or changing locked flights. */
export function migrateV3(value: unknown): GameState {
  const old = validateV3(value);
  return { ...old, version: 5, fleetPeak: old.fleet.length, tutorial: 'skipped',
    fleet: old.fleet.map(p => ({ ...p, dispatcher: true, energy: fullEnergy() })) };
}
/** Validate the entire frozen schema first; existing flights are grandfathered,
 * with no retroactive charge or change to their locked schedule and payment. */
export function migrateV4(value: unknown): GameState {
  const old = validateV4(value);
  return { ...old, version: 5, fleet: old.fleet.map(p => ({ ...p, energy: fullEnergy() })) };
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
  if (version === 4) return validateSave(migrateV4(value));
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

export function parseSave(raw: string) {
  check(new TextEncoder().encode(raw).length <= 1_000_000, '存档文件过大（上限 1 MB）');
  let value: unknown; try { value = JSON.parse(raw); } catch { throw new Error('无法解析 JSON 存档，原进度未被覆盖'); }
  return validateSave(value);
}