import type { GameState, Plane } from "./game.js";
import {
  ALL_MODELS,
  MATERIALS,
  BUILDINGS,
  RECIPES,
  CAREER_TASKS,
  modernModel,
  type Material,
} from "./career-catalog.js";
import { warehouseUsed, warehouseCapacity, taskValue } from "./career.js";

const fail = (): never => {
  throw new Error("存档经营扩展数据无效，原进度未被覆盖");
};
function record(
  value: unknown,
  keys?: string[],
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (keys && Object.keys(value).sort().join("|") !== [...keys].sort().join("|"))
  )
    fail();
}
function num(
  value: unknown,
  max = 1e12,
  integer = true,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  )
    fail();
}
function list(value: unknown, max: number): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > max) fail();
}
function unique(items: unknown[]) {
  if (new Set(items).size !== items.length) fail();
}
function bag(value: unknown) {
  record(value, Object.keys(MATERIALS));
  Object.values(value).forEach((n) => num(n));
}
export function validateTuning(p: Plane) {
  record(p.tuning, ["group", "cabins", "evolution", "power", "special"]);
  num(p.tuning.group, 6);
  num(p.tuning.cabins, 0);
  num(p.tuning.evolution, 20);
  num(p.tuning.power, 99);
  if (
    !["none", "cold", "industrial"].includes(p.tuning.special) ||
    (p.tuning.evolution && p.tuning.group < 2)
  )
    fail();
  const m = ALL_MODELS.find((m) => m.id === p.modelId);
  if (!m) fail();
  if (
    (!m!.cargo && p.tuning.special !== "none") ||
    (!modernModel(p.modelId) &&
      (p.tuning.group || p.tuning.evolution || p.tuning.power))
  )
    fail();
}
export function validateCareer(s: GameState) {
  const c = s.career;
  record(c, [
    "tickets",
    "xp",
    "day",
    "nextDayAt",
    "seed",
    "nextId",
    "airportPeak",
    "inventory",
    "warehouses",
    "stored",
    "pilots",
    "buildings",
    "production",
    "claimed",
    "museum",
    "achievement",
    "assemblies",
    "produced",
    "trades",
    "dailyFlights",
    "dailyDeliveries",
    "dailyBought",
    "weekly",
    "demandOff",
    "promotions",
    "savedRoutes",
    "investment",
    "licenses",
    "deliveredGoods",
  ]);
  for (const key of [
    "tickets",
    "xp",
    "day",
    "nextId",
    "assemblies",
    "produced",
    "trades",
    "dailyFlights",
    "dailyDeliveries",
    "weekly",
  ] as const)
    num(c[key]);
  num(c.seed, 4294967295);
  num(c.achievement, 6);
  num(c.airportPeak, 100);
  num(c.nextDayAt, 1e12, false);
  if (
    c.airportPeak < s.airports.length ||
    c.nextDayAt <= s.simTime ||
    c.nextDayAt > s.simTime + 86400 ||
    c.nextId < 1 ||
    c.weekly !== Math.floor(c.day / 7) ||
    c.dailyFlights > s.stats.flights ||
    c.dailyDeliveries > s.stats.passengers + s.stats.cargo
  )
    fail();
  bag(c.inventory);
  record(c.buildings, Object.keys(BUILDINGS));
  Object.values(c.buildings).forEach((n) => num(n, 10));
  const airports = new Set(s.airports.map((a) => a.id));
  for (const bags of [c.warehouses, c.deliveredGoods]) {
    record(bags);
    for (const [id, value] of Object.entries(bags)) {
      if (!airports.has(id)) fail();
      bag(value);
    }
  }
  list(c.production, 3);
  list(c.pilots, 8);
  list(c.stored, 64);
  list(c.museum, ALL_MODELS.length);
  unique(c.museum);
  if (
    c.museum.some((id) => !ALL_MODELS.some((m) => m.id === id)) ||
    c.achievement > c.museum.length
  )
    fail();
  const ids = new Set<number>(),
    planeIds = new Set<string>();
  function identity(id: number) {
    num(id);
    if (id < 1 || id >= c.nextId || ids.has(id)) fail();
    ids.add(id);
  }
  for (const pilot of c.pilots) {
    record(pilot, ["id", "name", "planeId", "paidUntil", "skill"]);
    identity(pilot.id);
    num(pilot.skill, 10);
    num(pilot.paidUntil, 1e12, false);
    if (
      typeof pilot.name !== "string" ||
      pilot.name.length < 1 ||
      pilot.name.length > 12
    )
      fail();
    if (pilot.planeId !== null) {
      const p = s.fleet.find((p) => p.id === pilot.planeId);
      if (!p || !p.dispatcher || planeIds.has(pilot.planeId)) fail();
      planeIds.add(pilot.planeId);
    }
  }
  for (const p of s.fleet)
    if (modernModel(p.modelId) && p.dispatcher && !planeIds.has(p.id)) fail();
  for (const job of c.production) {
    record(job, ["id", "recipe", "airportId", "count", "finishAt"]);
    identity(job.id);
    num(job.count, 10);
    num(job.finishAt, 1e12, false);
    const recipe = RECIPES.find((r) => r.id === job.recipe);
    if (
      !recipe ||
      !airports.has(job.airportId) ||
      !c.buildings.factory ||
      job.count < 1 ||
      job.finishAt <= s.simTime ||
      job.finishAt > s.simTime + recipe.seconds * job.count
    )
      fail();
  }
  for (const p of c.stored)
    if (
      p.flight !== null ||
      p.autoRouteId !== null ||
      p.itinerary.length ||
      p.dispatcher ||
      p.readyAt > s.simTime ||
      p.energy.serviceUntil !== null ||
      s.orders.some((o) => o.location === p.id)
    )
      fail();
  for (const id of airports)
    if (warehouseUsed(s, id) > warehouseCapacity(s)) fail();
  list(c.demandOff, airports.size);
  list(c.licenses, airports.size);
  unique(c.demandOff);
  unique(c.licenses);
  if ([...c.demandOff, ...c.licenses].some((id) => !airports.has(id))) fail();
  record(c.promotions);
  for (const [id, time] of Object.entries(c.promotions)) {
    num(time, 1e12, false);
    if (!airports.has(id) || time > s.simTime + 3600) fail();
  }
  record(c.dailyBought);
  for (const [id, value] of Object.entries(c.dailyBought)) {
    num(value, 30);
    if (Object.hasOwn(MATERIALS, id)) {
      if (value > 20) fail();
    } else if (id === "use-design" || id === "use-research") {
      const k = id === "use-design" ? "design" : "research";
      if (value > c.buildings[k] * 3) fail();
    } else {
      const match =
        /^resource-([A-Z]{3})-(alloy|fabric|food|electronics)$/.exec(id) ??
        /^refresh-([A-Z]{3})$/.exec(id);
      if (!match || !airports.has(match[1]!)) fail();
    }
  }
  list(c.savedRoutes, 12);
  for (const route of c.savedRoutes) {
    record(route, ["name", "stops"]);
    list(route.stops, 13);
    if (
      typeof route.name !== "string" ||
      !route.name.trim() ||
      route.name.length > 24 ||
      route.stops.length < 2 ||
      route.stops.some(
        (id, i) => !airports.has(id) || (i > 0 && route.stops[i - 1] === id),
      )
    )
      fail();
  }
  if (c.investment !== null) {
    record(c.investment, ["amount", "finishAt"]);
    num(c.investment.finishAt, 1e12, false);
    if (
      ![1000, 5000, 10000].includes(c.investment.amount) ||
      c.investment.finishAt > s.simTime + 3600
    )
      fail();
  }
  list(c.claimed, 15000);
  unique(c.claimed);
  for (const id of c.claimed) {
    if (typeof id !== "string") fail();
    const task = CAREER_TASKS.find((t) => t.id === id);
    if (task) {
      if (taskValue(s, task.metric) < task.target) fail();
      continue;
    }
    const daily = /^daily-(\d+)$/.exec(id),
      checkin = /^checkin-([0-6])$/.exec(id),
      boss = /^boss-([1-6])$/.exec(id),
      trade = /^trade-(day|week)-(\d+)-([A-Z]{3})$/.exec(id);
    if (daily) {
      if (Number(daily[1]) !== c.day || c.dailyDeliveries < 8) fail();
    } else if (checkin) {
      if (Number(checkin[1]) > c.day) fail();
    } else if (boss) {
      const n = Number(boss[1]);
      if (
        s.stats.revenue < n * n * 5000 ||
        (n > 1 && !c.claimed.includes(`boss-${n - 1}`))
      )
        fail();
    } else if (trade) {
      if (
        Number(trade[2]) !== (trade[1] === "day" ? c.day : c.weekly) ||
        !airports.has(trade[3]!)
      )
        fail();
    } else fail();
  }
  // Materials in manifests reserve capacity; counts remain finite and bounded even while offline.
  for (const value of Object.values(c.deliveredGoods))
    for (const key of Object.keys(MATERIALS) as Material[]) num(value[key]);
}
