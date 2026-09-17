export type AircraftKind = 'mixed' | 'passengers' | 'cargo';

export const AIRCRAFT_KIND_LABEL = {
  mixed: '客货两用',
  passengers: '纯客机',
  cargo: '纯货机',
} as const;

export const UPGRADE_LABEL = {
  capacity: '舱位扩充',
  engine: '发动机',
  range: '航程改装',
  efficiency: '节能改装',
} as const;

export type UpgradeKey = keyof typeof UPGRADE_LABEL;
export type Upgrades = Record<UpgradeKey, number>;
export const emptyUpgrades = (): Upgrades => ({
  capacity: 0,
  engine: 0,
  range: 0,
  efficiency: 0,
});

export const TASKS = [
  { id: 'first-flight', title: '第一道航迹', description: '完成 1 次运输航班', metric: 'flights', target: 1, reward: 30000 },
  { id: 'three-airports', title: '连接更多城市', description: '拥有 3 座机场', metric: 'airports', target: 3, reward: 18000 },
  { id: 'three-planes', title: '一支真正的机队', description: '机队曾达到 3 架飞机', metric: 'fleet', target: 3, reward: 40000 },
  { id: 'ten-flights', title: '准点的日常', description: '完成 10 次运输航班', metric: 'flights', target: 10, reward: 65000 },
] as const;

export const routeId = (a: string, b: string) => [a, b].sort().join('-');
