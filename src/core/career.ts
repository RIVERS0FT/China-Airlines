import { activePilots, organizationExecute, recordFlightWork, type Employee, type FlightStaffing, type OrganizationCommand } from './organization.js';
import type { GameState, Plane, Order } from "./game.js";
import { aircraftSpecs, airport, model, emptyUpgrades } from "./catalog.js";
import {
  BUILDINGS,
  MATERIALS,
  WORKSHOP_MATERIALS,
  RECIPES,
  CAREER_TASKS,
  emptyTuning,
  modernModel,
  type Material,
  type Building,
} from "./career-catalog.js";

export type Pilot = Employee;
export interface Production {
  id: number;
  recipe: string;
  airportId: string;
  count: number;
  finishAt: number;
}
export interface Career {
  tickets: number;
  xp: number;
  day: number;
  nextDayAt: number;
  seed: number;
  nextId: number;
  airportPeak: number;
  inventory: Record<Material, number>;
  warehouses: Record<string, Record<Material, number>>;
  stored: Plane[];
  employees: Employee[];
  flightStaffing: Record<string, FlightStaffing | null>;
  buildings: Record<Building, number>;
  production: Production[];
  claimed: string[];
  museum: string[];
  achievement: number;
  assemblies: number;
  produced: number;
  trades: number;
  dailyFlights: number;
  dailyDeliveries: number;
  dailyBought: Record<string, number>;
  weekly: number;
  demandOff: string[];
  promotions: Record<string, number>;
  savedRoutes: { name: string; stops: string[] }[];
  investment: { amount: number; finishAt: number } | null;
  licenses: string[];
  deliveredGoods: Record<string, Record<Material, number>>;
}
export type CareerCommand = OrganizationCommand
  | { type: "career-claim"; id: string }
  | { type: "career-supply"; material: Material; count: number }
  | {
      type:
        | "store-plane"
        | "restore-plane"
        | "dismantle-plane"
        | "museum-donate"
        | "evolve-plane"
        | "group-plane"
        | "power-upgrade";
      planeId: string;
    }
  | { type: "assemble-plane"; modelId: string; airportId: string }
  | {
      type: "specialize-plane";
      planeId: string;
      special: "none" | "cold" | "industrial";
    }
  | { type: "recruit-pilot" }
  | { type: "assign-pilot"; pilotId: number; planeId: string | null }
  | { type: "pay-pilot" | "train-pilot"; pilotId: number }
  | { type: "build-facility"; building: Building }
  | { type: "produce"; recipe: string; airportId: string; count: number }
  | {
      type: "purchase-resource";
      material: Material;
      airportId: string;
      count: number;
    }
  | {
      type: "withdraw-material";
      material: Material;
      airportId: string;
      count: number;
    }
  | { type: "research" }
  | { type: "design-blueprint" }
  | { type: "claim-trade"; airportId: string; weekly: boolean }
  | { type: "airport-demand"; airportId: string; enabled: boolean }
  | { type: "promote-airport" | "close-airport"; airportId: string }
  | { type: "save-route"; name: string; stops: string[] }
  | { type: "delete-route"; index: number }
  | { type: "invest"; amount: number }
  | { type: "collect-investment" }
  | { type: "activate-achievement" }
  | {
      type: "transport-resource";
      planeId: string;
      to: string;
      material: Material;
      count: number;
    };
export const inventory = (): Record<Material, number> =>
  Object.fromEntries(Object.keys(MATERIALS).map((k) => [k, 0])) as Record<
    Material,
    number
  >;
export const newCareer = (simTime: number, now: number): Career => ({
  tickets: 24,
  xp: 0,
  day: 0,
  nextDayAt: simTime + (86400 - ((Math.floor(now / 1000) + 28800) % 86400)),
  seed: 1709,
  nextId: 1,
  airportPeak: 2,
  inventory: inventory(),
  warehouses: {},
  stored: [],
  employees: [],
  flightStaffing: {},
  buildings: { warehouse: 0, factory: 0, design: 0, research: 0, trade: 0 },
  production: [],
  claimed: [],
  museum: [],
  achievement: 0,
  assemblies: 0,
  produced: 0,
  trades: 0,
  dailyFlights: 0,
  dailyDeliveries: 0,
  dailyBought: {},
  weekly: 0,
  demandOff: [],
  promotions: {},
  savedRoutes: [],
  investment: null,
  licenses: [],
  deliveredGoods: {},
});
export const careerLevel = (s: GameState) =>
  Math.min(30, 1 + Math.floor(Math.sqrt(s.career.xp / 150)));
export function guard(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
export const bill = (s: GameState, gold: number, tickets = 0) => {
  guard(
    Number.isSafeInteger(gold) &&
      gold >= 0 &&
      Number.isSafeInteger(tickets) &&
      tickets >= 0,
    "费用无效",
  );
  guard(s.credits >= gold, "金币不足");
  guard(s.career.tickets >= tickets, "点券不足");
  s.credits -= gold;
  s.career.tickets -= tickets;
};
export const consume = (
  bag: Record<Material, number>,
  items: Partial<Record<Material, number>>,
) => {
  for (const [key, n] of Object.entries(items))
    guard(
      Number.isSafeInteger(n) && n >= 0 && bag[key as Material] >= n,
      `${MATERIALS[key as Material]}不足`,
    );
  for (const [key, n] of Object.entries(items)) bag[key as Material] -= n;
};
export const stock = (s: GameState, id: string) =>
  s.career.warehouses[id] ?? (s.career.warehouses[id] = inventory());
export const warehouseCapacity = (s: GameState) =>
  100 + s.career.buildings.warehouse * 100;
export function warehouseUsed(s: GameState, id: string) {
  return (
    Object.values(s.career.warehouses[id] ?? {}).reduce((a, b) => a + b, 0) +
    s.orders
      .filter((o) => o.product && o.to === id)
      .reduce((a, o) => a + o.amount, 0) +
    s.career.production
      .filter((j) => j.airportId === id)
      .reduce(
        (a, j) => a + RECIPES.find((r) => r.id === j.recipe)!.amount * j.count,
        0,
      )
  );
}
export function putStock(
  s: GameState,
  id: string,
  material: Material,
  count: number,
) {
  guard(warehouseUsed(s, id) + count <= warehouseCapacity(s), "仓库容量不足");
  stock(s, id)[material] += count;
}
export function parked(s: GameState, id: string) {
  const p = s.fleet.find((p) => p.id === id);
  guard(p, "未找到飞机");
  guard(
    !p.flight &&
      !p.autoRouteId &&
      !p.itinerary.length &&
      p.energy.serviceUntil === null &&
      p.readyAt <= s.simTime,
    "请先停止运营并等待地面周转",
  );
  return p;
}
export function emptyPlane(s: GameState, id: string) {
  const p = parked(s, id);
  guard(!s.orders.some((o) => o.location === id), "请先卸下全部客货");
  return p;
}
const random = (s: GameState, n: number) => {
  s.career.seed = (Math.imul(s.career.seed, 1664525) + 1013904223) >>> 0;
  return s.career.seed % n;
};
export const assignedPilot = (s: GameState, p: Plane) =>
  activePilots(s).find((c) => c.planeId === p.id);
export function autoAllowed(s: GameState, p: Plane) {
  const pilot = assignedPilot(s, p);
  return (
    p.dispatcher &&
    (pilot ? pilot.paidUntil > s.simTime : !modernModel(p.modelId))
  );
}
export function onArrival(s: GameState, p: Plane, orders: Order[], staffing?: FlightStaffing | null) {
  const n = orders.filter((o) => !o.product).reduce((a, o) => a + o.amount, 0);
  if (n) {
    s.career.xp += Math.floor(
      (20 + n * 5) *
        (1 +
          (assignedPilot(s, p)?.skill ?? 0) * 0.03 +
          s.career.achievement * 0.05),
    );
    recordFlightWork(s, p, n, staffing);
    s.career.dailyFlights++;
    s.career.dailyDeliveries += n;
    s.career.tickets += Math.min(4, 1 + Math.floor(n / 5));
    s.career.inventory.alloy++;
  }
  for (const o of orders)
    if (o.product) {
      stock(s, p.airportId)[o.product] += o.amount;
      const bag =
        s.career.deliveredGoods[p.airportId] ??
        (s.career.deliveredGoods[p.airportId] = inventory());
      bag[o.product] += o.amount;
    }
}
export const nextCareerEvent = (s: GameState) =>
  Math.min(s.career.nextDayAt, ...s.career.production.map((j) => j.finishAt));
export function advanceCareer(s: GameState) {
  const c = s.career;
  if (s.simTime >= c.nextDayAt) {
    c.day++;
    c.nextDayAt += 86400;
    c.dailyFlights = 0;
    c.dailyDeliveries = 0;
    c.dailyBought = {};
    c.licenses = [];
    if (c.day % 7 === 0) c.weekly++;
    c.claimed = c.claimed.filter(
      (id) =>
        !id.startsWith("daily-") &&
        !id.startsWith("trade-day-") &&
        (!id.startsWith("trade-week-") ||
          id.startsWith(`trade-week-${c.weekly}-`)),
    );
    c.promotions = Object.fromEntries(
      Object.entries(c.promotions).filter(([, t]) => t > s.simTime),
    );
    for (const p of [...s.fleet, ...c.stored]) {
      const cap = aircraftSpecs(p).energy * 60;
      p.energy.availableSeconds = Math.max(0, cap - p.energy.reservedSeconds);
      p.energy.serviceUntil = null;
    }
  }
  for (const job of c.production.filter((j) => j.finishAt <= s.simTime)) {
    const recipe = RECIPES.find((r) => r.id === job.recipe)!;
    stock(s, job.airportId)[recipe.output] += recipe.amount * job.count;
    c.produced += job.count;
  }
  c.production = c.production.filter((j) => j.finishAt > s.simTime);
}
export const taskValue = (s: GameState, metric: string) =>
  ({
    deliveries: s.stats.passengers + s.stats.cargo,
    airports: s.career.airportPeak,
    flights: s.stats.flights,
    crew: s.career.employees.filter(e => e.department === "flight").length,
    assemblies: s.career.assemblies,
    production: s.career.produced,
    museum: s.career.museum.length,
    trades: s.career.trades,
  })[metric] ?? 0;
export function careerExecute(s: GameState, command: CareerCommand): string {
  const c = s.career;
  switch (command.type) {
    case "career-claim": {
      const id = command.id;
      guard(!c.claimed.includes(id), "奖励已领取");
      const task = CAREER_TASKS.find((t) => t.id === id);
      if (task) {
        guard(taskValue(s, task.metric) >= task.target, "任务尚未完成");
        s.credits += task.gold;
        c.tickets += task.tickets;
      } else if (id === `daily-${c.day}`) {
        guard(c.dailyDeliveries >= 8, "今日还需完成8份运输");
        s.credits += 1000;
        c.tickets += 8;
      } else if (id === `checkin-${Math.min(6, c.day)}`) {
        guard(!c.claimed.some((x) => x === id), "今日已领取");
        c.tickets += 5 + Math.min(c.day, 6) * 2;
        c.inventory.blueprint++;
      } else if (/^boss-[1-6]$/.test(id)) {
        const tier = Number(id.slice(5));
        guard(s.stats.revenue >= tier * tier * 5000, "运输业绩尚未达标");
        guard(
          tier === 1 || c.claimed.includes(`boss-${tier - 1}`),
          "请先完成上一地区挑战",
        );
        s.credits += tier * 1500;
        c.tickets += tier * 10;
        c.inventory.engine++;
      } else throw new Error("未知奖励");
      c.claimed.push(id);
      return "奖励已到账";
    }
    case "career-supply": {
      guard(
        WORKSHOP_MATERIALS.includes(command.material),
        "此物资需要在物流园生产采购",
      );
      guard(
        Number.isInteger(command.count) &&
          command.count >= 1 &&
          command.count <= 20,
        "数量应为1至20",
      );
      const k = command.material,
        used = c.dailyBought[k] ?? 0;
      guard(used + command.count <= 20, "今日物资已售罄");
      const premium = [
        "frame",
        "wing",
        "engine",
        "blueprint",
        "research",
      ].includes(k);
      bill(
        s,
        (premium ? 400 : 80) * command.count,
        premium ? command.count : 0,
      );
      c.inventory[k] += command.count;
      c.dailyBought[k] = used + command.count;
      return "物资已存入材料仓库";
    }
    case "store-plane": {
      const p = emptyPlane(s, command.planeId);
      guard(s.fleet.length > 1, "需保留至少一架服役飞机");
      guard(c.stored.length < 64, "封存仓库已满");
      guard(!assignedPilot(s, p), "请先安排飞行员下岗");
      p.dispatcher = false;
      s.fleet = s.fleet.filter((x) => x.id !== p.id);
      c.stored.push(p);
      return "飞机已封存，机位已释放";
    }
    case "restore-plane": {
      guard(s.fleet.length < s.hangarSlots, "机位不足");
      const p = c.stored.find((x) => x.id === command.planeId);
      guard(p, "未找到封存飞机");
      guard(
        s.airports.some((a) => a.id === p.airportId),
        "原停靠机场已关闭",
      );
      c.stored = c.stored.filter((x) => x.id !== p.id);
      s.fleet.push(p);
      s.fleetPeak = Math.max(s.fleetPeak, s.fleet.length);
      return "飞机已恢复服役";
    }
    case "dismantle-plane": {
      const p = c.stored.find((x) => x.id === command.planeId);
      guard(p, "只能拆解封存飞机");
      c.stored = c.stored.filter((x) => x.id !== p.id);
      for (const k of ["frame", "wing", "engine", "blueprint"] as const)
        c.inventory[k] += 1 + p.tuning.group;
      return "拆解完成，零件已入库";
    }
    case "assemble-plane": {
      const m = model(command.modelId);
      guard(modernModel(m.id) && m.id !== "starter-swift", "该机型不可组装");
      guard(careerLevel(s) >= m.rank, "公司等级不足");
      guard(
        s.airports.some(
          (a) => a.id === command.airportId && a.level >= m.level,
        ),
        "交付机场等级不足",
      );
      guard(s.fleet.length < s.hangarSlots, "机位不足");
      consume(c.inventory, {
        frame: m.level,
        wing: m.level,
        engine: m.level,
        blueprint: 1,
      });
      bill(s, Math.floor(m.price * 0.3), m.level * 2);
      const p: Plane = {
        id: `AC${String(s.nextId++).padStart(4, "0")}`,
        modelId: m.id,
        airportId: command.airportId,
        readyAt: s.simTime,
        autoRouteId: null,
        flight: null,
        upgrades: emptyUpgrades(),
        tuning: emptyTuning(),
        itinerary: [],
        dispatcher: false,
        energy: {
          availableSeconds: m.energy * 60,
          reservedSeconds: 0,
          serviceUntil: null,
        },
      };
      s.fleet.push(p);
      s.fleetPeak = Math.max(s.fleetPeak, s.fleet.length);
      c.assemblies++;
      return "新机组装完成";
    }
    case "museum-donate": {
      const p = c.stored.find((x) => x.id === command.planeId);
      guard(p, "请先将飞机封存");
      guard(!c.museum.includes(p.modelId), "该机型已入馆");
      bill(s, 1000);
      c.stored = c.stored.filter((x) => x.id !== p.id);
      c.museum.push(p.modelId);
      c.tickets += 15;
      c.xp += 100;
      return "展品已入馆，飞机已从封存仓库移出";
    }
    case "group-plane":
    case "evolve-plane":
    case "power-upgrade": {
      const p = emptyPlane(s, command.planeId);
      guard(modernModel(p.modelId), "历史机型保留原有改装体系");
      const key =
        command.type === "group-plane"
          ? "group"
          : command.type === "evolve-plane"
            ? "evolution"
            : "power";
      const limit = key === "group" ? 6 : key === "evolution" ? 20 : 99;
      guard(p.tuning[key] < limit, "已达到最高等级");
      guard(key !== "evolution" || p.tuning.group >= 2, "编队2级后可进化");
      const n = p.tuning[key] + 1;
      bill(s, n * 500, n * 2);
      if (key !== "power") consume(c.inventory, { frame: n, engine: n });
      p.tuning[key]++;
      return "机体成长完成";
    }
    case "specialize-plane": {
      const p = emptyPlane(s, command.planeId);
      guard(model(p.modelId).cargo > 0, "纯客机无法安装专业货舱");
      guard(
        ["none", "cold", "industrial"].includes(command.special),
        "未知专业货舱",
      );
      guard(p.tuning.special !== command.special, "货舱配置未变化");
      bill(
        s,
        command.special === "none" ? 0 : 1800,
        command.special === "none" ? 0 : 4,
      );
      if (command.special !== "none")
        consume(c.inventory, { alloy: 3, blueprint: 1 });
      p.tuning.special = command.special;
      return "专业货舱已更换";
    }
    case "recruit-pilot":
      return organizationExecute(s, { type: 'org-recruit', department: 'flight' });
    case "assign-pilot":
    case "pay-pilot":
    case "train-pilot": {
      const e = activePilots(s).find(e => e.id === command.pilotId);
      guard(e, '未找到飞行员');
      return organizationExecute(s, command.type === 'assign-pilot'
        ? {type:'org-assign',employeeId:e.id,assetId:command.planeId}
        : command.type === 'pay-pilot' ? {type:'org-renew',employeeId:e.id}
        : {type:'org-train',employeeId:e.id,ability:'skill'});
    }
    case 'org-recruit': case 'org-assign': case 'org-train':
    case 'org-renew': case 'org-appoint': case 'org-demote':
      return organizationExecute(s, command);
    case "build-facility": {
      guard(Object.hasOwn(BUILDINGS, command.building), "未知设施");
      const lv = c.buildings[command.building];
      guard(lv < 10, "设施已满级");
      bill(s, 1000 * (lv + 1), lv);
      consume(c.inventory, { alloy: lv * 2 });
      c.buildings[command.building]++;
      return `${BUILDINGS[command.building]}已升级`;
    }
    case "withdraw-material": {
      guard(
        s.airports.some((a) => a.id === command.airportId),
        "机场未开放",
      );
      guard(WORKSHOP_MATERIALS.includes(command.material), "只能调拨工坊材料");
      guard(
        Number.isInteger(command.count) &&
          command.count >= 1 &&
          command.count <= 100,
        "数量应为1至100",
      );
      consume(stock(s, command.airportId), {
        [command.material]: command.count,
      });
      c.inventory[command.material] += command.count;
      return "材料已由当地仓库调入机体工坊";
    }
    case "purchase-resource": {
      guard(
        s.airports.some((a) => a.id === command.airportId),
        "机场未开放",
      );
      guard(
        ["alloy", "fabric", "food", "electronics"].includes(command.material),
        "该城市不提供此资源",
      );
      guard(
        Number.isInteger(command.count) &&
          command.count > 0 &&
          command.count <= 20,
        "数量应为1至20",
      );
      const key = `resource-${command.airportId}-${command.material}`;
      guard((c.dailyBought[key] ?? 0) + command.count <= 30, "今日产出已售罄");
      const license = c.licenses.includes(command.airportId);
      bill(s, command.count * 35 + (license ? 0 : 200));
      putStock(s, command.airportId, command.material, command.count);
      c.dailyBought[key] = (c.dailyBought[key] ?? 0) + command.count;
      if (!license) c.licenses.push(command.airportId);
      return "原料已进入当地仓库";
    }
    case "produce": {
      guard(c.buildings.factory > 0, "请先建造制造工厂");
      guard(c.production.length < 3, "生产队列已满");
      guard(
        s.airports.some((a) => a.id === command.airportId),
        "机场未开放",
      );
      const r = RECIPES.find((x) => x.id === command.recipe);
      guard(r, "未知配方");
      guard(
        Number.isInteger(command.count) &&
          command.count >= 1 &&
          command.count <= 10,
        "批次应为1至10",
      );
      const bag = stock(s, command.airportId);
      const inputs = Object.fromEntries(
        Object.entries(r.inputs).map(([k, v]) => [k, v * command.count]),
      );
      consume(bag, inputs);
      bill(s, r.fee * command.count);
      guard(
        warehouseUsed(s, command.airportId) + r.amount * command.count <=
          warehouseCapacity(s),
        "生产产物将超过仓库容量",
      );
      c.production.push({
        id: c.nextId++,
        recipe: r.id,
        airportId: command.airportId,
        count: command.count,
        finishAt:
          s.simTime +
          Math.ceil(
            (r.seconds * command.count) / (1 + c.buildings.factory * 0.1),
          ),
      });
      return "生产已开始";
    }
    case "research":
    case "design-blueprint": {
      const building = command.type === "research" ? "research" : "design";
      guard(c.buildings[building] > 0, "请先建造对应设施");
      const key = `use-${building}`;
      guard(
        (c.dailyBought[key] ?? 0) < c.buildings[building] * 3,
        "今日次数已用完",
      );
      bill(s, 300, 1);
      c.dailyBought[key] = (c.dailyBought[key] ?? 0) + 1;
      const material: Material =
        building === "design"
          ? "blueprint"
          : (["frame", "engine", "wing", "research"] as const)[random(s, 4)]!;
      c.inventory[material]++;
      return `获得${MATERIALS[material]}`;
    }
    case "claim-trade": {
      guard(c.buildings.trade > 0, "请先建造贸易中心");
      guard(
        s.airports.some((a) => a.id === command.airportId),
        "机场未开放",
      );
      const id = `trade-${command.weekly ? "week-" + c.weekly : "day-" + c.day}-${command.airportId}`;
      guard(!c.claimed.includes(id), "该贸易订单已完成");
      const material = command.weekly ? "parcel" : "meal",
        amount = command.weekly ? 4 : 3;
      const delivered = c.deliveredGoods[command.airportId];
      guard(
        delivered && delivered[material] >= amount,
        "需要先从其他机场运输对应货品",
      );
      consume(stock(s, command.airportId), { [material]: amount });
      consume(delivered, { [material]: amount });
      s.credits += command.weekly ? 2500 : 1000;
      c.tickets += command.weekly ? 12 : 5;
      c.trades++;
      c.claimed.push(id);
      return "贸易已交付，奖励已到账";
    }
    case "airport-demand": {
      guard(
        s.airports.some((a) => a.id === command.airportId),
        "机场未开放",
      );
      guard(typeof command.enabled === "boolean", "客流参数无效");
      c.demandOff = c.demandOff.filter((id) => id !== command.airportId);
      if (!command.enabled) c.demandOff.push(command.airportId);
      return command.enabled
        ? "客流已开放"
        : "已关闭新的目的地客流，已接受订单继续运输";
    }
    case "promote-airport": {
      guard(
        s.airports.some((a) => a.id === command.airportId),
        "机场未开放",
      );
      bill(s, 500);
      c.promotions[command.airportId] = s.simTime + 3600;
      return "机场宣传已启动，持续1小时";
    }
    case "close-airport": {
      const id = command.airportId;
      guard(!c.employees.some(e => e.airportId === id), "请先调离当地地勤人员");
      guard(!["PEK", "PVG"].includes(id), "初始枢纽不能关闭");
      guard(
        s.airports.some((a) => a.id === id),
        "机场未开放",
      );
      guard(
        ![...s.fleet, ...c.stored].some(
          (p) =>
            p.airportId === id ||
            p.flight?.to === id ||
            p.itinerary.includes(id) ||
            (p.autoRouteId &&
              s.routes.some(
                (r) => r.id === p.autoRouteId && (r.from === id || r.to === id),
              )),
        ),
        "机场仍有飞机或在途计划",
      );
      guard(
        !s.orders.some(
          (o) =>
            (o.location.startsWith("AC") && (o.to === id || o.from === id)) ||
            (o.expiresAt === null &&
              (o.location === id || o.to === id || o.from === id)),
        ),
        "机场仍有已接受或中转订单",
      );
      guard(
        !c.production.some((j) => j.airportId === id) &&
          !Object.values(c.warehouses[id] ?? {}).some((n) => n > 0),
        "请先清空当地仓库与生产",
      );
      s.orders = s.orders.filter(
        (o) => o.to !== id && o.from !== id && o.location !== id,
      );
      s.routes = s.routes.filter((r) => r.from !== id && r.to !== id);
      s.airports = s.airports.filter((a) => a.id !== id);
      delete c.warehouses[id];
      delete c.deliveredGoods[id];
      c.claimed = c.claimed.filter(
        (k) => !k.startsWith("trade-") || !k.endsWith("-" + id),
      );
      c.dailyBought = Object.fromEntries(
        Object.entries(c.dailyBought).filter(
          ([k]) => !k.startsWith(`resource-${id}-`) && k !== `refresh-${id}`,
        ),
      );
      delete c.promotions[id];
      c.demandOff = c.demandOff.filter((x) => x !== id);
      c.licenses = c.licenses.filter((x) => x !== id);
      c.savedRoutes = c.savedRoutes.filter((r) => !r.stops.includes(id));
      s.credits += Math.floor(airport(id).price * 0.3);
      return "机场已关闭，退回30%开通费用";
    }
    case "save-route": {
      guard(
        command.name.trim().length > 0 && command.name.length <= 24,
        "路线名应为1至24字",
      );
      guard(c.savedRoutes.length < 12, "最多保存12条路线");
      guard(
        command.stops.length >= 2 &&
          command.stops.length <= 13 &&
          command.stops.every(
            (id, i) =>
              s.airports.some((a) => a.id === id) &&
              (i === 0 || id !== command.stops[i - 1]),
          ),
        "路线站点无效",
      );
      c.savedRoutes.push({
        name: command.name.trim(),
        stops: [...command.stops],
      });
      return "路线已保存，可在规划台正向或反向发航";
    }
    case "delete-route": {
      guard(
        Number.isInteger(command.index) &&
          command.index >= 0 &&
          command.index < c.savedRoutes.length,
        "路线不存在",
      );
      c.savedRoutes.splice(command.index, 1);
      return "路线已删除";
    }
    case "invest": {
      guard(!c.investment, "已有未领取投资");
      guard([1000, 5000, 10000].includes(command.amount), "无效投资档位");
      bill(s, command.amount);
      c.investment = { amount: command.amount, finishAt: s.simTime + 3600 };
      return "投资已存入，1小时后领取本金与5%收益";
    }
    case "collect-investment": {
      guard(c.investment && c.investment.finishAt <= s.simTime, "投资尚未到期");
      s.credits += Math.floor(c.investment.amount * 1.05);
      c.investment = null;
      return "投资本金与收益已领取";
    }
    case "activate-achievement": {
      guard(c.achievement < 6, "成就已满级");
      guard(c.museum.length >= c.achievement + 1, "请先增加不同机型展品");
      bill(s, 1000 * (c.achievement + 1), 5);
      consume(c.inventory, { research: 1 });
      c.achievement++;
      return "收藏成就已激活，额外运输经验永久生效";
    }
    case "transport-resource": {
      // GameCore handles this command atomically with the real Order manifest.
      // Prevent callers from moving warehouse stock through this narrower API.
      throw new Error("物资装机必须经过订单装载入口");
    }
  }
}
