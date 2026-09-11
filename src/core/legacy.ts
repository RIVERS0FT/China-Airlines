import { airport, AIRPORTS, distance, model, MODELS, routeId, routePrice, TASKS, upgradePrice } from './legacy-catalog.js';
export const SAVE_VERSION = 1;
export const OFFLINE_LIMIT = 8 * 3600;
export const MAX_FLEET = 16;
export const TURNAROUND = 8;
export interface Flight { id: string; routeId: string; from: string; to: string; departAt: number; arriveAt: number; passengers: number; cargo: number; revenue: number; cost: number }
export interface Plane { id: string; modelId: string; airportId: string; readyAt: number; autoRouteId: string | null; flight: Flight | null }
export interface Route { id: string; from: string; to: string }
export interface GameState {
  version: 1; credits: number; simTime: number; lastWallTime: number; nextId: number;
  airports: { id: string; level: number }[]; fleet: Plane[]; routes: Route[];
  stats: { flights: number; passengers: number; cargo: number; revenue: number; costs: number };
  claimedTasks: string[]; log: { at: number; text: string; amount: number }[];
}
export type Command =
  | { type: 'unlock'; airportId: string } | { type: 'upgrade'; airportId: string }
  | { type: 'buy'; modelId: string; airportId: string } | { type: 'route'; from: string; to: string }
  | { type: 'dispatch'; planeId: string; to: string; auto: boolean }
  | { type: 'stop'; planeId: string } | { type: 'claim'; taskId: string };
export interface AdvanceReport { elapsed: number; flights: number; revenue: number; profit: number; capped: boolean; clockBack: boolean }
const check = (ok: unknown, message: string): void => { if (!ok) throw new Error(message); };
const owned = (s: GameState, id: string) => s.airports.find(a => a.id === id);
function note(s: GameState, text: string, amount = 0) { s.log.unshift({ at: s.simTime, text, amount }); s.log.length = Math.min(s.log.length, 60); }
function spend(s: GameState, value: number) { check(s.credits >= value, '运营资金不足'); s.credits -= value; }
export function taskProgress(s: GameState, taskId: string): number {
  const t = TASKS.find(t => t.id === taskId); if (!t) return 0;
  return t.metric === 'flights' ? s.stats.flights : t.metric === 'fleet' ? s.fleet.length : s.airports.length;
}
export function quote(s: GameState, plane: Plane, to: string) {
  const from = plane.airportId, m = model(plane.modelId), a = owned(s, from), b = owned(s, to);
  check(from !== to, '请选择不同的目的地'); check(a && b, '请先解锁两端机场');
  check(a!.level >= m.level && b!.level >= m.level, `该机型需要两端机场达到 ${m.level} 级`);
  const km = distance(from, to); check(km <= m.range, '航线超出这架飞机的航程');
  const demand = Math.min(1, (airport(from).demand + airport(to).demand) / 2 * (0.75 + 0.05 * Math.min(a!.level, b!.level)));
  const passengers = Math.floor(m.seats * demand), cargo = Math.max(1, Math.floor(m.cargo * demand));
  const duration = Math.max(30, Math.ceil(km / m.speed * 45));
  const cost = Math.round(500 + km * m.costKm), revenue = fare(km, passengers, cargo);
  return { km, passengers, cargo, duration, cost, revenue, profit: revenue - cost };
}
const fare = (km: number, passengers: number, cargo: number) => Math.round(passengers * (100 + km * 0.18) + cargo * (300 + km * 0.4));
function depart(s: GameState, p: Plane, to: string, auto: boolean) {
  check(!p.flight, '飞机正在飞行'); check(s.simTime >= p.readyAt, '飞机正在地面周转');
  const id = routeId(p.airportId, to); check(s.routes.some(r => r.id === id), '请先开通这条航线');
  const q = quote(s, p, to); spend(s, q.cost); s.stats.costs += q.cost;
  p.autoRouteId = auto ? id : null;
  p.flight = { id: `FL${s.nextId++}`, routeId: id, from: p.airportId, to, departAt: s.simTime, arriveAt: s.simTime + q.duration,
    passengers: q.passengers, cargo: q.cargo, revenue: q.revenue, cost: q.cost };
  note(s, `${p.id} ${airport(p.airportId).city} → ${airport(to).city} 起飞`, -q.cost);
}
function advance(s: GameState, now: number): AdvanceReport {
  check(Number.isFinite(now) && now >= 0 && now <= 8.64e15, '无效的系统时间');
  const gap = (now - s.lastWallTime) / 1000, elapsed = Math.min(OFFLINE_LIMIT, Math.max(0, gap));
  // Consume the whole wall-clock gap, including discarded time, exactly once.
  s.lastWallTime = now;
  const end = s.simTime + elapsed, before = { ...s.stats };
  for (;;) {
    let next: Plane | undefined, at = Infinity;
    for (const p of s.fleet) {
      const time = p.flight?.arriveAt ?? (p.autoRouteId ? Math.max(s.simTime, p.readyAt) : Infinity);
      if (time <= end && time < at) { next = p; at = time; }
    }
    if (!next) break;
    s.simTime = at;
    if (next.flight) {
      const f = next.flight;
      next.airportId = f.to; next.flight = null; next.readyAt = at + TURNAROUND;
      s.credits += f.revenue; s.stats.revenue += f.revenue; s.stats.flights++;
      s.stats.passengers += f.passengers; s.stats.cargo += f.cargo;
      note(s, `${next.id} 抵达${airport(f.to).city} · 运输完成`, f.revenue);
    } else {
      const r = s.routes.find(r => r.id === next!.autoRouteId);
      try {
        check(r, '自动航线不存在');
        depart(s, next, r!.from === next.airportId ? r!.to : r!.from, true);
      } catch (error) {
        next.autoRouteId = null;
        note(s, `${next.id} 自动往返已停止：${error instanceof Error ? error.message : '无法起飞'}`);
      }
    }
  }
  s.simTime = end;
  return { elapsed, flights: s.stats.flights - before.flights, revenue: s.stats.revenue - before.revenue,
    profit: s.stats.revenue - before.revenue - (s.stats.costs - before.costs), capped: gap > OFFLINE_LIMIT, clockBack: gap < 0 };
}
export class GameCore {
  private state: GameState;
  constructor(now: number, saved?: GameState) {
    check(Number.isFinite(now) && now >= 0 && now <= 8.64e15, '无效的系统时间');
    this.state = saved ? validateSave(saved) : { version: 1, credits: 180000, simTime: 0, lastWallTime: now, nextId: 2,
      airports: [{ id: 'PEK', level: 1 }, { id: 'PVG', level: 1 }],
      fleet: [{ id: 'AC0001', modelId: 'lark', airportId: 'PEK', readyAt: 0, autoRouteId: null, flight: null }], routes: [],
      stats: { flights: 0, passengers: 0, cargo: 0, revenue: 0, costs: 0 }, claimedTasks: [],
      log: [{ at: 0, text: '公司成立 · 北京与上海机场已开放', amount: 180000 }] };
  }
  snapshot(): GameState { return structuredClone(this.state); }
  tick(now: number): AdvanceReport { return advance(this.state, now); }
  /** Imported saves never receive income based on an untrusted file timestamp. */
  static imported(value: unknown, now: number): GameCore {
    const s = validateSave(value); s.lastWallTime = now; return new GameCore(now, s);
  }
  execute(command: Command, now: number): void {
    this.tick(now);
    const s = this.snapshot();
    switch (command.type) {
      case 'unlock': {
        const a = airport(command.airportId); check(!owned(s, a.id), '机场已经解锁'); spend(s, a.price);
        s.airports.push({ id: a.id, level: 1 }); note(s, `解锁${a.city}机场`, -a.price); break;
      }
      case 'upgrade': {
        const a = owned(s, command.airportId); check(a, '机场尚未解锁'); check(a!.level < 3, '机场已达到最高等级');
        const price = upgradePrice(a!.level); spend(s, price); a!.level++; note(s, `${airport(a!.id).city}机场升至 ${a!.level} 级`, -price); break;
      }
      case 'buy': {
        const m = model(command.modelId), a = owned(s, command.airportId);
        check(a && a.level >= m.level, `交付机场需要达到 ${m.level} 级`); check(s.fleet.length < MAX_FLEET, `机队上限为 ${MAX_FLEET} 架`);
        spend(s, m.price); const id = `AC${String(s.nextId++).padStart(4, '0')}`;
        s.fleet.push({ id, modelId: m.id, airportId: command.airportId, readyAt: s.simTime, autoRouteId: null, flight: null });
        note(s, `${m.name} 加入机队 · ${id}`, -m.price); break;
      }
      case 'route': {
        check(command.from !== command.to, '航线需要两个不同机场');
        check(owned(s, command.from) && owned(s, command.to), '请先解锁两端机场');
        const id = routeId(command.from, command.to); check(!s.routes.some(r => r.id === id), '航线已经开通');
        const price = routePrice(command.from, command.to); spend(s, price);
        s.routes.push({ id, from: command.from, to: command.to });
        note(s, `开通${airport(command.from).city} ↔ ${airport(command.to).city}`, -price); break;
      }
      case 'dispatch': {
        const p = s.fleet.find(p => p.id === command.planeId); check(p, '未找到这架飞机'); depart(s, p!, command.to, command.auto); break;
      }
      case 'stop': {
        const p = s.fleet.find(p => p.id === command.planeId); check(p, '未找到这架飞机');
        p!.autoRouteId = null; note(s, `${p!.id} 已关闭自动往返，当前航班仍将正常到达`); break;
      }
      case 'claim': {
        const t = TASKS.find(t => t.id === command.taskId); check(t, '未知任务'); check(!s.claimedTasks.includes(command.taskId), '奖励已经领取');
        check(taskProgress(s, command.taskId) >= t!.target, '任务尚未完成');
        s.claimedTasks.push(command.taskId); s.credits += t!.reward; note(s, `完成任务：${t!.title}`, t!.reward); break;
      }
      default: throw new Error('未知经营命令');
    }
    this.state = s;
  }
}

/** Strict schema + reference validation. No coerced fields, unknown keys, or partial imports. */
export function validateSave(value: unknown): GameState {
  const fail = () => { throw new Error('存档结构或经营数据无效，原进度未被覆盖'); };
  const obj = (v: unknown, keys: string[]): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join('|') !== keys.sort().join('|')) return fail();
    return v as Record<string, unknown>;
  };
  const num = (v: unknown, max = 1e12, integer = true): number => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max || (integer && !Number.isInteger(v))) return fail(); return v;
  };
  const list = (v: unknown, max: number): unknown[] => { if (!Array.isArray(v) || v.length > max) return fail(); return v; };
  const text = (v: unknown, max = 200): string => { if (typeof v !== 'string' || !v.length || v.length > max) return fail(); return v; };
  const unique = (values: string[]) => { if (new Set(values).size !== values.length) fail(); };
  const o = obj(value, ['version', 'credits', 'simTime', 'lastWallTime', 'nextId', 'airports', 'fleet', 'routes', 'stats', 'claimedTasks', 'log']);
  if (o.version !== SAVE_VERSION) throw new Error('不支持此存档版本；请使用对应版本的游戏');
  num(o.credits); num(o.simTime, 1e12, false); num(o.lastWallTime, 8.64e15, false); num(o.nextId, 1e9);
  const airportIds: string[] = [];
  for (const a of list(o.airports, AIRPORTS.length)) {
    const v = obj(a, ['id', 'level']); const id = text(v.id, 3);
    if (!AIRPORTS.some(a => a.id === id) || num(v.level, 3) < 1) fail(); airportIds.push(id);
  }
  unique(airportIds); if (!airportIds.includes('PEK') || !airportIds.includes('PVG')) fail();
  const routeIds: string[] = [];
  for (const r of list(o.routes, 66)) {
    const v = obj(r, ['id', 'from', 'to']), from = text(v.from, 3), to = text(v.to, 3);
    if (from === to || !airportIds.includes(from) || !airportIds.includes(to) || v.id !== routeId(from, to)) fail();
    routeIds.push(text(v.id, 7));
  }
  unique(routeIds);
  const planeIds: string[] = [], flightIds: string[] = [], s = value as GameState;
  for (const plane of list(o.fleet, MAX_FLEET)) {
    const p = obj(plane, ['id', 'modelId', 'airportId', 'readyAt', 'autoRouteId', 'flight']);
    const id = text(p.id, 16); if (!/^AC\d{4,9}$/.test(id) || Number(id.slice(2)) >= (o.nextId as number)) fail(); planeIds.push(id);
    if (!MODELS.some(m => m.id === p.modelId) || !airportIds.includes(text(p.airportId, 3))) fail();
    const m = model(p.modelId as string); if (owned(s, p.airportId as string)!.level < m.level) fail();
    num(p.readyAt, 1e12, false);
    if (p.autoRouteId !== null) {
      if (!routeIds.includes(text(p.autoRouteId, 7))) fail();
      const r = s.routes.find(r => r.id === p.autoRouteId)!;
      if (r.from !== p.airportId && r.to !== p.airportId) fail();
      quote(s, plane as Plane, r.from === p.airportId ? r.to : r.from);
    }
    if (p.flight !== null) {
      const f = obj(p.flight, ['id', 'routeId', 'from', 'to', 'departAt', 'arriveAt', 'passengers', 'cargo', 'revenue', 'cost']);
      const fid = text(f.id, 16); if (!/^FL\d{1,9}$/.test(fid) || Number(fid.slice(2)) >= (o.nextId as number)) fail(); flightIds.push(fid);
      if (!routeIds.includes(text(f.routeId, 7)) || f.from !== p.airportId || f.from === f.to || f.routeId !== routeId(text(f.from, 3), text(f.to, 3))) fail();
      const q = quote(s, plane as Plane, text(f.to, 3));
      const departAt = num(f.departAt, 1e12, false), arriveAt = num(f.arriveAt, 1e12, false);
      if ((p.readyAt as number) > departAt || departAt > s.simTime || arriveAt <= s.simTime || arriveAt !== departAt + q.duration) fail();
      const passengers = num(f.passengers, m.seats), cargo = num(f.cargo, m.cargo);
      if (num(f.revenue) !== fare(q.km, passengers, cargo) || num(f.cost) !== q.cost) fail();
      if (p.autoRouteId !== null && p.autoRouteId !== f.routeId) fail();
    } else if ((p.readyAt as number) > s.simTime + TURNAROUND) fail();
  }
  if (!planeIds.length) fail(); unique(planeIds); unique(flightIds);
  const stats = obj(o.stats, ['flights', 'passengers', 'cargo', 'revenue', 'costs']); for (const v of Object.values(stats)) num(v);
  const claimed = list(o.claimedTasks, TASKS.length).map(v => text(v, 32)); unique(claimed);
  for (const id of claimed) { const t = TASKS.find(t => t.id === id); if (!t || taskProgress(s, id) < t.target) fail(); }
  for (const log of list(o.log, 60)) {
    const l = obj(log, ['at', 'text', 'amount']); num(l.at, s.simTime, false); text(l.text);
    if (typeof l.amount !== 'number' || !Number.isSafeInteger(l.amount) || Math.abs(l.amount) > 1e12) fail();
  }
  return structuredClone(s);
}
export function parseSave(raw: string): GameState {
  check(raw.length <= 1_000_000, '存档文件过大（上限 1 MB）');
  let value: unknown; try { value = JSON.parse(raw); } catch { throw new Error('无法解析 JSON 存档，原进度未被覆盖'); }
  return validateSave(value);
}
