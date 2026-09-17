/** Gameplay fixtures, not navigation data or administrative boundaries. */
export const DOMESTIC_AIRPORTS = [
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
  { id: 'URC', city: '乌鲁木齐', region: '西域门户', lat: 43.9, lon: 87.5, x: 145, y: 130, price: 88000, demand: 0.75 },
] as const;
