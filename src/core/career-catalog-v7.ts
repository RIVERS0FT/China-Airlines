import { RAILWAY_LEVELS } from "./railway-observations.js";
import {
  MODELS as HISTORIC_MODELS,
  STARTER_MODEL as HISTORIC_STARTER,
  aircraftSpecs as oldSpecs,
  retrofitPrice as oldPrice,
  TASKS as OLD_TASKS,
  type Upgrades,
} from "./catalog-v5.js";
export {
  AIRCRAFT_KIND_LABEL,
  UPGRADE_LABEL,
  emptyUpgrades,
  routeId,
} from "./catalog-v5.js";
export type { AircraftKind, UpgradeKey, Upgrades } from "./catalog-v5.js";
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
  kind: "mixed" | "passengers" | "cargo";
  seats: number;
  cargo: number;
  range: number;
  speed: number;
  price: number;
  level: number;
  costKm: number;
  weight: number;
  energy: number;
  rank: number;
  art: string;
}
const families = [
  {
    id: "swift",
    name: "雨燕",
    range: 2000,
    speed: 360,
    price: 7000,
    level: 1,
    rank: 1,
    seats: 4,
    cargo: 3,
    weight: 220,
    energy: 200,
    art: "light",
  },
  {
    id: "heron",
    name: "苍鹭",
    range: 4400,
    speed: 560,
    price: 26000,
    level: 1,
    rank: 3,
    seats: 8,
    cargo: 6,
    weight: 380,
    energy: 280,
    art: "regional",
  },
  {
    id: "albatross",
    name: "信天翁",
    range: 8500,
    speed: 740,
    price: 85000,
    level: 2,
    rank: 6,
    seats: 12,
    cargo: 9,
    weight: 560,
    energy: 400,
    art: "heavy",
  },
  {
    id: "aurora",
    name: "极光",
    range: 16000,
    speed: 880,
    price: 220000,
    level: 3,
    rank: 10,
    seats: 18,
    cargo: 14,
    weight: 750,
    energy: 600,
    art: "heavy",
  },
] as const;
export const MODELS: readonly AircraftModel[] = families.flatMap((f) =>
  (["passengers", "cargo", "mixed"] as const).map((kind, i) => ({
    id: `${f.id}-${["p", "f", "m"][i]}`,
    family: f.id,
    name: `${f.name} ${["客运型", "货运型", "客货型"][i]}`,
    role: `${["纯客运输", "专业货运", "灵活客货"][i]}`,
    kind,
    seats:
      kind === "cargo"
        ? 0
        : kind === "mixed"
          ? Math.ceil(f.seats / 2)
          : f.seats,
    cargo:
      kind === "passengers"
        ? 0
        : kind === "mixed"
          ? Math.ceil(f.cargo / 2)
          : f.cargo,
    range: f.range,
    speed: f.speed,
    price: Math.round(f.price * [1, 0.95, 1.1][i]!),
    level: f.level,
    costKm: 0.12,
    weight: f.weight,
    energy: f.energy,
    rank: f.rank,
    art: `aircraft-${f.art}-${kind === "cargo" ? "cargo" : "passenger"}-v2.png`,
  })),
);
export const STARTER_MODEL: AircraftModel = {
  ...MODELS[2]!,
  id: "starter-swift",
  name: "雨燕 初航号",
  seats: 3,
  cargo: 2,
  price: 6000,
  role: "初始客货机",
};
export const ALL_MODELS: readonly AircraftModel[] = [
  STARTER_MODEL,
  ...MODELS,
  HISTORIC_STARTER,
  ...HISTORIC_MODELS,
].map((m) =>
  "energy" in m
    ? m
    : { ...m, weight: 1000, energy: 240, rank: 1, art: "aircraft-v1.png" },
);
export const model = (id: string): AircraftModel => {
  const m = ALL_MODELS.find((m) => m.id === id);
  if (!m) throw new Error("未知机型");
  return m;
};
export const modernModel = (id: string) =>
  id === STARTER_MODEL.id || MODELS.some((m) => m.id === id);
export function aircraftSpecs(p: {
  modelId: string;
  upgrades: Upgrades;
  tuning?: Tuning;
}) {
  const m = model(p.modelId),
    t = p.tuning ?? emptyTuning();
  if (!modernModel(m.id))
    return { ...m, ...oldSpecs(p), energy: m.energy, weight: m.weight };
  const level = (n: number) => RAILWAY_LEVELS[Math.min(99, Math.max(0, n))]!;
  const cabins = 1 + p.upgrades.capacity + t.cabins;
  return {
    ...m,
    seats: m.seats * cabins,
    cargo: m.cargo * cabins,
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
  modernModel(p.modelId)
    ? Math.ceil(model(p.modelId).price * 0.025 * (1 + p.upgrades[key] * 0.12))
    : oldPrice(p, key);
export const upgradeLimit = (p: { modelId: string }, key: keyof Upgrades) =>
  modernModel(p.modelId) ? (key === "capacity" ? 9 : 99) : 3;
export const upgradeTickets = (
  p: { modelId: string; upgrades: Upgrades },
  key: keyof Upgrades,
) =>
  modernModel(p.modelId)
    ? Math.max(
        1,
        Math.ceil(RAILWAY_LEVELS[Math.min(99, p.upgrades[key])]![5] / 4),
      )
    : 0;
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
    rate: 100,
    art: "cargo-v1.png",
    special: "none",
  },
  {
    id: "express",
    name: "航空快件",
    kind: "cargo",
    rate: 120,
    art: "cargo-express-v2.png",
    special: "none",
  },
  {
    id: "cold",
    name: "冷链药品",
    kind: "cargo",
    rate: 170,
    art: "cargo-cold-v2.png",
    special: "cold",
  },
  {
    id: "industrial",
    name: "工业设备",
    kind: "cargo",
    rate: 150,
    art: "cargo-industrial-v2.png",
    special: "industrial",
  },
  {
    id: "tourist",
    name: "休闲旅客",
    kind: "passengers",
    rate: 100,
    art: "passenger-02-v1.png",
    special: "none",
  },
  {
    id: "business",
    name: "商务旅客",
    kind: "passengers",
    rate: 130,
    art: "passenger-01-v1.png",
    special: "none",
  },
  {
    id: "family",
    name: "探亲旅客",
    kind: "passengers",
    rate: 110,
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
export const CAREER_TASKS = [
  {
    id: "deliver-10",
    title: "十份托付",
    metric: "deliveries",
    target: 10,
    gold: 1500,
    tickets: 8,
  },
  {
    id: "network-3",
    title: "三城航网",
    metric: "airports",
    target: 3,
    gold: 3000,
    tickets: 12,
  },
  {
    id: "flights-10",
    title: "稳定班期",
    metric: "flights",
    target: 10,
    gold: 5000,
    tickets: 20,
  },
  {
    id: "crew-1",
    title: "专业团队",
    metric: "crew",
    target: 1,
    gold: 1000,
    tickets: 10,
  },
  {
    id: "assembly-1",
    title: "亲手造飞机",
    metric: "assemblies",
    target: 1,
    gold: 4000,
    tickets: 20,
  },
  {
    id: "production-5",
    title: "物流新引擎",
    metric: "production",
    target: 5,
    gold: 5000,
    tickets: 25,
  },
  {
    id: "museum-1",
    title: "航空收藏家",
    metric: "museum",
    target: 1,
    gold: 3000,
    tickets: 25,
  },
  {
    id: "trade-3",
    title: "跨城供应链",
    metric: "trades",
    target: 3,
    gold: 5000,
    tickets: 30,
  },
] as const;

export const TASKS = OLD_TASKS.map((t, i) => ({
  ...t,
  reward: [1500, 3000, 4000, 6000][i]!,
}));
export const hangarPrice = (slots: number) => 2000 + slots * 500;
export const upgradePrice = (level: number) => (level === 1 ? 6000 : 18000);
