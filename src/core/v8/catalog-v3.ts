/** Gameplay fixtures, not flight planning data or administrative boundaries. */
export const AIRPORTS = [
  { id: 'PEK', city: '北京', region: '华北枢纽', lat: 40.1, lon: 116.6, x: 650, y: 140, price: 0, demand: 1.0 },
  { id: 'PVG', city: '上海', region: '华东枢纽', lat: 31.1, lon: 121.8, x: 810, y: 310, price: 0, demand: 1.0 },
  { id: 'WUH', city: '武汉', region: '中部枢纽', lat: 30.8, lon: 114.2, x: 635, y: 335, price: 32000, demand: 0.8 },
  { id: 'XIY', city: '西安', region: '西北门户', lat: 34.4, lon: 108.8, x: 500, y: 260, price: 38000, demand: 0.85 },
  { id: 'CTU', city: '成都', region: '西南枢纽', lat: 30.6, lon: 103.9, x: 360, y: 335, price: 56000, demand: 0.9 },
  { id: 'CKG', city: '重庆', region: '山城空港', lat: 29.7, lon: 106.6, x: 475, y: 395, price: 42000, demand: 0.85 },
  { id: 'CAN', city: '广州', region: '华南枢纽', lat: 23.4, lon: 113.3, x: 615, y: 470, price: 62000, demand: 1.0 },
  { id: 'KMG', city: '昆明', region: '云岭门户', lat: 25.1, lon: 102.9, x: 350, y: 465, price: 48000, demand: 0.8 },
  { id: 'HKG', city: '香港', region: '海湾空港', lat: 22.3, lon: 113.9, x: 710, y: 535, price: 80000, demand: 0.95 },
  { id: 'TPE', city: '台北', region: '海岛空港', lat: 25.1, lon: 121.2, x: 870, y: 445, price: 70000, demand: 0.9 },
  { id: 'SYX', city: '三亚', region: '海滨空港', lat: 18.3, lon: 109.4, x: 530, y: 560, price: 44000, demand: 0.8 },
  { id: 'URC', city: '乌鲁木齐', region: '西域门户', lat: 43.9, lon: 87.5, x: 145, y: 130, price: 88000, demand: 0.75 }
] as const;
export type AircraftKind = 'mixed' | 'passengers' | 'cargo';
export interface AircraftModel {
  id: string; family: 'lark' | 'swallow' | 'horizon'; name: string; role: string;
  kind: AircraftKind; seats: number; cargo: number; range: number; speed: number;
  price: number; level: number; costKm: number;
}
export const MODELS: readonly AircraftModel[] = [
  { id: 'lark', family: 'lark', name: '云雀 70', role: '支线客货机', kind: 'mixed', seats: 70, cargo: 2, range: 1600, speed: 650, price: 85000, level: 1, costKm: 2 },
  { id: 'swallow', family: 'swallow', name: '海燕 160', role: '中程客货机', kind: 'mixed', seats: 160, cargo: 6, range: 4200, speed: 820, price: 280000, level: 2, costKm: 4 },
  { id: 'horizon', family: 'horizon', name: '天穹 280', role: '远程客货机', kind: 'mixed', seats: 280, cargo: 14, range: 8000, speed: 900, price: 650000, level: 3, costKm: 7 },
  { id: 'lark-p', family: 'lark', name: '云雀 90P', role: '支线纯客机', kind: 'passengers', seats: 90, cargo: 0, range: 1600, speed: 650, price: 90000, level: 1, costKm: 2 },
  { id: 'lark-f', family: 'lark', name: '云雀 8F', role: '支线纯货机', kind: 'cargo', seats: 0, cargo: 8, range: 1800, speed: 600, price: 78000, level: 1, costKm: 1.5 },
  { id: 'swallow-p', family: 'swallow', name: '海燕 190P', role: '干线纯客机', kind: 'passengers', seats: 190, cargo: 0, range: 4200, speed: 820, price: 300000, level: 2, costKm: 4 },
  { id: 'swallow-f', family: 'swallow', name: '海燕 24F', role: '干线纯货机', kind: 'cargo', seats: 0, cargo: 24, range: 4600, speed: 760, price: 260000, level: 2, costKm: 3 },
  { id: 'horizon-p', family: 'horizon', name: '天穹 330P', role: '宽体纯客机', kind: 'passengers', seats: 330, cargo: 0, range: 8000, speed: 900, price: 700000, level: 3, costKm: 7 },
  { id: 'horizon-f', family: 'horizon', name: '天穹 50F', role: '宽体纯货机', kind: 'cargo', seats: 0, cargo: 50, range: 8500, speed: 850, price: 610000, level: 3, costKm: 5 }
];
export const AIRCRAFT_KIND_LABEL = { mixed: '客货两用', passengers: '纯客机', cargo: '纯货机' } as const;
export const UPGRADE_LABEL = { capacity: '舱位扩充', engine: '发动机', range: '航程改装', efficiency: '节能改装' } as const;
export type UpgradeKey = keyof typeof UPGRADE_LABEL;
export type Upgrades = Record<UpgradeKey, number>;
export const emptyUpgrades = (): Upgrades => ({ capacity: 0, engine: 0, range: 0, efficiency: 0 });
export function aircraftSpecs(p: { modelId: string; upgrades: Upgrades }) {
  const m = model(p.modelId), u = p.upgrades;
  return { ...m, seats: Math.floor(m.seats * (1 + u.capacity * .1)),
    cargo: m.cargo + Math.ceil(m.cargo * .1) * u.capacity,
    range: Math.round(m.range * (1 + u.range * .1)),
    speed: Math.round(m.speed * (1 + u.engine * .05)),
    costKm: m.costKm * (1 - u.efficiency * .05) };
}
export const retrofitPrice = (p: { modelId: string; upgrades: Upgrades }, key: UpgradeKey) =>
  Math.round(model(p.modelId).price * .12 * (p.upgrades[key] + 1));
export const hangarPrice = (slots: number) => 40000 + (slots - 4) * 15000;
export const TASKS = [
  { id: 'first-flight', title: '第一道航迹', description: '完成 1 次运输航班', metric: 'flights', target: 1, reward: 30000 },
  { id: 'three-airports', title: '连接更多城市', description: '拥有 3 座机场', metric: 'airports', target: 3, reward: 18000 },
  { id: 'three-planes', title: '一支真正的机队', description: '拥有 3 架飞机', metric: 'fleet', target: 3, reward: 40000 },
  { id: 'ten-flights', title: '准点的日常', description: '完成 10 次运输航班', metric: 'flights', target: 10, reward: 65000 }
] as const;
export const airport = (id: string) => {
  const result = AIRPORTS.find(a => a.id === id);
  if (!result) throw new Error('未知机场');
  return result;
};
export const model = (id: string) => {
  const result = MODELS.find(m => m.id === id);
  if (!result) throw new Error('未知机型');
  return result;
};
export function distance(from: string, to: string): number {
  const a = airport(from), b = airport(to), rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h))));
}
export const routeId = (a: string, b: string) => [a, b].sort().join('-');
export const routePrice = (a: string, b: string) => 2500 + distance(a, b) * 5;
export const upgradePrice = (level: number) => level * 60000;
