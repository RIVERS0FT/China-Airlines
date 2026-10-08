import { RAILWAY_LEVELS } from "./railway-observations.js";
import { CAREER_REWARDS, OPERATION_REWARDS, POINT_GOLD } from './balance-policy.js';
import {
  TASKS as OLD_TASKS,
  type Upgrades,
} from "./aircraft-basics.js";
export {
  UPGRADE_LABEL,
  emptyUpgrades,
  routeId,
} from "./aircraft-basics.js";
export type { UpgradeKey, Upgrades } from "./aircraft-basics.js";
export interface Tuning {
  group: number;
  cabins: number;
  evolution: number;
  power: number;
  special: "none" | "cold" | "industrial";
}
export const emptyTuning = (): Tuning => ({
  group: 0,
  cabins: 0,
  evolution: 0,
  power: 0,
  special: "none",
});
export interface AircraftModel {
  id: string;
  family: string;
  name: string;
  role: string;
  capacity: number;
  range: number;
  speed: number;
  price: number;
  /** Minimum fixed airport stars; independent of the player's facility level. */
  level: number;
  costKm: number;
  weight: number;
  energy: number;
  rank: number;
  art: string;
  reference: {
    prototype: string;
    capacity: string;
  };
}
const AIRCRAFT_ART_REVISION = "v8";
const families = [
  {
    id: "swift",
    name: "雨燕",
    range: 2000,
    speed: 360,
    price: 7000,
    level: 1,
    rank: 1,
    weight: 220,
    energy: 200,
    art: "light",
    reference: {
      prototype: "Cessna SkyCourier",
      capacity: "19座 · 最大有效载荷2,347 kg",
    },
  },
  {
    id: "heron",
    name: "苍鹭",
    range: 4400,
    speed: 560,
    price: 26000,
    level: 1,
    rank: 3,
    weight: 380,
    energy: 280,
    art: "regional",
    reference: {
      prototype: "ATR 72-600 / 72-600F",
      capacity: "最多78座 · 货运型最大载荷9,200 kg",
    },
  },
  {
    id: "albatross",
    name: "信天翁",
    range: 8500,
    speed: 740,
    price: 85000,
    level: 2,
    rank: 6,
    weight: 560,
    energy: 400,
    art: "heavy",
    reference: {
      prototype: "Airbus A321XLR / A321P2F",
      capacity: "最多244座 · 货运型最大载荷28.1 t",
    },
  },
  {
    id: "aurora",
    name: "极光",
    range: 16000,
    speed: 880,
    price: 220000,
    level: 3,
    rank: 10,
    weight: 750,
    energy: 600,
    art: "heavy",
    reference: {
      prototype: "Boeing 747-8I / 747-8F",
      capacity: "410座 · 货运型收益载荷133.1 t",
    },
  },
] as const;
const DA40_MODEL: AircraftModel = {
  id: "diamond-da40",
  family: "diamond",
  name: "钻石 DA40",
  role: "1 格轻型机身",
  capacity: 1,
  range: 1730,
  speed: 285,
  price: 2300,
  level: 1,
  costKm: 0.12,
  weight: 140,
  energy: 180,
  rank: 1,
  art: "aircraft-diamond-da40-exterior-v8.png",
  reference: {
    prototype: "Diamond DA40 NG",
    capacity: "4座（含飞行员）· 最大有效载荷407 kg",
  },
};
// Ten capacity grades each have an independent original exterior.
// The suffix only identifies the existing art asset; it is never a service type.
const grades = [
  ['swift-p', 0, 2, '雨燕 I', 5500, 1],
  ['swift-m', 0, 3, '雨燕 II', 8500, 1],
  ['swift-f', 0, 4, '雨燕 III', 12500, 1],
  ['heron-p', 1, 5, '苍鹭 I', 22000, 3],
  ['heron-m', 1, 6, '苍鹭 II', 32000, 4],
  ['heron-f', 1, 7, '苍鹭 III', 45000, 5],
  ['albatross-p', 2, 8, '信天翁 I', 80000, 6],
  ['albatross-m', 2, 9, '信天翁 II', 115000, 8],
  ['aurora-p', 3, 10, '极光', 180000, 10],
] as const;
const FAMILY_MODELS: AircraftModel[] = grades.map(([id, familyIndex, capacity, name, price, rank]) => {
  const f = families[familyIndex];
  return { id, family: f.id, name, role: `${capacity} 格通用机身`, capacity,
    range: f.range, speed: f.speed, price, level: f.level, costKm: 0.12,
    weight: f.weight, energy: f.energy, rank,
    art: `aircraft-${id}-exterior-${AIRCRAFT_ART_REVISION}.png`, reference: f.reference };
});
export const MODELS: readonly AircraftModel[] = [DA40_MODEL, ...FAMILY_MODELS];
export const ALL_MODELS: readonly AircraftModel[] = MODELS;
export const model = (id: string): AircraftModel => {
  const m = ALL_MODELS.find((m) => m.id === id);
  if (!m) throw new Error("未知机型");
  return m;
};
export const modernModel = (id: string) => MODELS.some((m) => m.id === id);
export function aircraftSpecs(p: {
  modelId: string;
  upgrades: Upgrades;
  tuning?: Tuning;
  allocation?: { passengers: number; cargo: number };
}) {
  const m = model(p.modelId),
    t = p.tuning ?? emptyTuning();
  const level = (n: number) => RAILWAY_LEVELS[Math.min(99, Math.max(0, n))]!;
  return {
    ...m,
    seats: p.allocation?.passengers ?? 0,
    cargo: p.allocation?.cargo ?? 0,
    range: Math.floor((m.range * level(p.upgrades.range)[1]) / 1000),
    speed: Math.floor((m.speed * level(p.upgrades.engine)[2]) / 1000),
    weight: Math.floor((m.weight * level(p.upgrades.efficiency)[3]) / 1000),
    energy: Math.floor((m.energy * level(t.power)[4]) / 1000),
  };
}
export const retrofitPrice = (
  p: { modelId: string; upgrades: Upgrades },
  key: keyof Upgrades,
) =>
  Math.ceil(model(p.modelId).price * 0.025 * (1 + p.upgrades[key] * 0.12)) +
  Math.max(1, Math.ceil(RAILWAY_LEVELS[Math.min(99, p.upgrades[key])]![5] / 4)) * POINT_GOLD;
export const cabinAllocationPrice = (
  current: { passengers: number; cargo: number },
  next: { passengers: number; cargo: number },
) => Math.max(0, next.passengers + next.cargo - current.passengers - current.cargo) * 120 +
  Math.max(0, next.passengers - current.passengers) * 80 +
  Math.max(0, next.cargo - current.cargo) * 100;
export function growthPrice(p: { modelId: string; tuning: Tuning }, key: 'group' | 'evolution' | 'power') {
  const next = p.tuning[key] + 1, price = model(p.modelId).price;
  const gold = key === 'group' ? Math.ceil(price * 0.2 * next ** 1.5 / 100) * 100
    : key === 'evolution' ? Math.ceil(price * 0.08 * next / 100) * 100 : next * 500;
  return { gold: gold + next * 2 * POINT_GOLD };
}
// Building an aircraft must not create a buy-parts/assemble/resell money loop.
export const assemblyPrice = (modelId: string) => Math.ceil(model(modelId).price * 0.6) + model(modelId).level * 2 * POINT_GOLD;
export const upgradeLimit = (_p: { modelId: string }, key: keyof Upgrades) =>
  key === "capacity" ? 0 : 99;
export const MATERIALS = {
  frame: "机身组件",
  engine: "动力组件",
  wing: "机翼组件",
  blueprint: "机型图纸",
  alloy: "航空合金",
  fabric: "复合纤维",
  food: "餐食原料",
  electronics: "电子元件",
  parcel: "精密货品",
  meal: "航空餐食",
  research: "研发图纸",
} as const;
export type Material = keyof typeof MATERIALS;
export const WORKSHOP_MATERIALS: readonly Material[] = [
  "frame",
  "engine",
  "wing",
  "blueprint",
  "alloy",
  "research",
];
export const CARGO_SERVICES = [
  {
    id: "general",
    name: "普通货物",
    kind: "cargo",
    art: "cargo-v1.png",
    special: "none",
  },
  {
    id: "express",
    name: "航空快件",
    kind: "cargo",
    art: "cargo-express-v2.png",
    special: "none",
  },
  {
    id: "cold",
    name: "冷链药品",
    kind: "cargo",
    art: "cargo-cold-v2.png",
    special: "cold",
  },
  {
    id: "industrial",
    name: "工业设备",
    kind: "cargo",
    art: "cargo-industrial-v2.png",
    special: "industrial",
  },
  {
    id: "tourist",
    name: "休闲旅客",
    kind: "passengers",
    art: "passenger-02-v1.png",
    special: "none",
  },
  {
    id: "business",
    name: "商务旅客",
    kind: "passengers",
    art: "passenger-01-v1.png",
    special: "none",
  },
  {
    id: "family",
    name: "探亲旅客",
    kind: "passengers",
    art: "passenger-04-v1.png",
    special: "none",
  },
] as const;
export const service = (id: string) => CARGO_SERVICES.find((s) => s.id === id);
export const BUILDINGS = {
  warehouse: "保税仓库",
  factory: "制造工厂",
  design: "设计院",
  research: "研究中心",
  trade: "贸易中心",
} as const;
export type Building = keyof typeof BUILDINGS;
export const RECIPES = [
  {
    id: "meal",
    name: "航空餐食",
    inputs: { food: 3 },
    output: "meal",
    amount: 2,
    seconds: 90,
    fee: 80,
  },
  {
    id: "parcel",
    name: "精密货品",
    inputs: { alloy: 2, electronics: 1 },
    output: "parcel",
    amount: 2,
    seconds: 180,
    fee: 150,
  },
  {
    id: "frame",
    name: "机身组件",
    inputs: { alloy: 4, fabric: 2 },
    output: "frame",
    amount: 1,
    seconds: 240,
    fee: 300,
  },
  {
    id: "engine",
    name: "动力组件",
    inputs: { alloy: 3, electronics: 3 },
    output: "engine",
    amount: 1,
    seconds: 300,
    fee: 400,
  },
  {
    id: "wing",
    name: "机翼组件",
    inputs: { alloy: 3, fabric: 3 },
    output: "wing",
    amount: 1,
    seconds: 240,
    fee: 300,
  },
] as const;
const CAREER_TASK_DEFINITIONS = [
  {
    id: "deliver-10",
    title: "十份托付",
    metric: "deliveries",
    target: 10,
    gold: 1500,
  },
  {
    id: "network-3",
    title: "三城航网",
    metric: "airports",
    target: 3,
    gold: 1800,
  },
  {
    id: "flights-10",
    title: "稳定班期",
    metric: "flights",
    target: 10,
    gold: 2500,
  },
  {
    id: "crew-1",
    title: "专业团队",
    metric: "crew",
    target: 1,
    gold: 1000,
  },
  {
    id: "assembly-1",
    title: "亲手造飞机",
    metric: "assemblies",
    target: 1,
    gold: 4000,
  },
  {
    id: "production-5",
    title: "物流新引擎",
    metric: "production",
    target: 5,
    gold: 5000,
  },
  {
    id: "museum-1",
    title: "航空收藏家",
    metric: "museum",
    target: 1,
    gold: 3000,
  },
  {
    id: "trade-3",
    title: "跨城供应链",
    metric: "trades",
    target: 3,
    gold: 5000,
  },
] as const;

export const CAREER_TASKS = CAREER_TASK_DEFINITIONS.map(task => ({ ...task, ...CAREER_REWARDS[task.id] }));

export const TASKS = OLD_TASKS.map(t => ({
  ...t,
  reward: OPERATION_REWARDS[t.id].gold,
  minRevenue: OPERATION_REWARDS[t.id].minRevenue,
}));
export const hangarPrice = (slots: number) => 2000 + slots * 500;
export const upgradePrice = (level: number) => (level === 1 ? 8000 : 24000);
