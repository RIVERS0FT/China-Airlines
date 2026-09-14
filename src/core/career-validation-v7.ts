import type { GameState } from './types-v7.js';
import { MATERIALS, RECIPES, type Material } from './career-catalog-v7.js';
export const inventory = (): Record<Material, number> =>
  Object.fromEntries(Object.keys(MATERIALS).map((k) => [k, 0])) as Record<
    Material,
    number
  >;
export const newCareer = (simTime: number, now: number): import("./types-v7.js").Career => ({
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
  pilots: [],
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
export const taskValue = (s: GameState, metric: string) =>
  ({
    deliveries: s.stats.passengers + s.stats.cargo,
    airports: s.career.airportPeak,
    flights: s.stats.flights,
    crew: s.career.pilots.length,
    assemblies: s.career.assemblies,
    production: s.career.produced,
    museum: s.career.museum.length,
    trades: s.career.trades,
  })[metric] ?? 0;
