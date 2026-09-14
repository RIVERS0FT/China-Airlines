/** Approximate gameplay locations, not navigation data. Prices are game balance fixtures. */
export const CONTINENTS = ['亚洲', '欧洲', '非洲', '北美洲', '南美洲', '大洋洲'] as const;
export type Continent = typeof CONTINENTS[number];
export interface AirportDefinition {
  id: string; city: string; region: string; continent: Continent;
  lat: number; lon: number; price: number; demand: number;
}
export const WORLD_AIRPORTS: readonly AirportDefinition[] = [
  { id: 'ICN', city: '首尔', region: '韩国 · 东亚', continent: '亚洲', lat: 37.5, lon: 126.4, price: 36000, demand: 0.9 },
  { id: 'NRT', city: '东京', region: '日本 · 东亚', continent: '亚洲', lat: 35.8, lon: 140.4, price: 64000, demand: 1 },
  { id: 'MNL', city: '马尼拉', region: '菲律宾 · 东南亚', continent: '亚洲', lat: 14.5, lon: 121, price: 48000, demand: 0.85 },
  { id: 'BKK', city: '曼谷', region: '泰国 · 东南亚', continent: '亚洲', lat: 13.7, lon: 100.8, price: 56000, demand: 0.9 },
  { id: 'SIN', city: '新加坡', region: '新加坡 · 东南亚', continent: '亚洲', lat: 1.4, lon: 104, price: 88000, demand: 1 },
  { id: 'CGK', city: '雅加达', region: '印度尼西亚 · 东南亚', continent: '亚洲', lat: -6.1, lon: 106.7, price: 68000, demand: 0.9 },
  { id: 'DEL', city: '德里', region: '印度 · 南亚', continent: '亚洲', lat: 28.6, lon: 77.1, price: 72000, demand: 0.95 },
  { id: 'BOM', city: '孟买', region: '印度 · 南亚', continent: '亚洲', lat: 19.1, lon: 72.9, price: 72000, demand: 0.95 },
  { id: 'DXB', city: '迪拜', region: '阿联酋 · 西亚', continent: '亚洲', lat: 25.3, lon: 55.4, price: 96000, demand: 1 },
  { id: 'IST', city: '伊斯坦布尔', region: '土耳其 · 欧亚门户', continent: '欧洲', lat: 41.3, lon: 28.8, price: 96000, demand: 0.95 },
  { id: 'LHR', city: '伦敦', region: '英国 · 西欧', continent: '欧洲', lat: 51.5, lon: -0.5, price: 120000, demand: 1 },
  { id: 'CDG', city: '巴黎', region: '法国 · 西欧', continent: '欧洲', lat: 49, lon: 2.6, price: 110000, demand: 1 },
  { id: 'FRA', city: '法兰克福', region: '德国 · 中欧', continent: '欧洲', lat: 50, lon: 8.6, price: 104000, demand: 0.95 },
  { id: 'FCO', city: '罗马', region: '意大利 · 南欧', continent: '欧洲', lat: 41.8, lon: 12.2, price: 88000, demand: 0.9 },
  { id: 'SVO', city: '莫斯科', region: '俄罗斯 · 东欧', continent: '欧洲', lat: 56, lon: 37.4, price: 92000, demand: 0.9 },
  { id: 'KEF', city: '雷克雅未克', region: '冰岛 · 北大西洋', continent: '欧洲', lat: 64, lon: -22.6, price: 76000, demand: 0.75 },
  { id: 'CAI', city: '开罗', region: '埃及 · 北非', continent: '非洲', lat: 30.1, lon: 31.4, price: 72000, demand: 0.9 },
  { id: 'ADD', city: '亚的斯亚贝巴', region: '埃塞俄比亚 · 东非', continent: '非洲', lat: 9, lon: 38.8, price: 64000, demand: 0.85 },
  { id: 'NBO', city: '内罗毕', region: '肯尼亚 · 东非', continent: '非洲', lat: -1.3, lon: 36.9, price: 64000, demand: 0.85 },
  { id: 'JNB', city: '约翰内斯堡', region: '南非 · 南部非洲', continent: '非洲', lat: -26.1, lon: 28.2, price: 92000, demand: 0.9 },
  { id: 'CPT', city: '开普敦', region: '南非 · 南部非洲', continent: '非洲', lat: -34, lon: 18.6, price: 76000, demand: 0.8 },
  { id: 'LOS', city: '拉各斯', region: '尼日利亚 · 西非', continent: '非洲', lat: 6.6, lon: 3.3, price: 68000, demand: 0.85 },
  { id: 'CMN', city: '卡萨布兰卡', region: '摩洛哥 · 北非', continent: '非洲', lat: 33.4, lon: -7.6, price: 64000, demand: 0.8 },
  { id: 'ANC', city: '安克雷奇', region: '美国 · 阿拉斯加', continent: '北美洲', lat: 61.2, lon: -150, price: 88000, demand: 0.8 },
  { id: 'HNL', city: '檀香山', region: '美国 · 夏威夷', continent: '北美洲', lat: 21.3, lon: -157.9, price: 96000, demand: 0.85 },
  { id: 'YVR', city: '温哥华', region: '加拿大 · 太平洋门户', continent: '北美洲', lat: 49.2, lon: -123.2, price: 104000, demand: 0.9 },
  { id: 'LAX', city: '洛杉矶', region: '美国 · 太平洋门户', continent: '北美洲', lat: 33.9, lon: -118.4, price: 120000, demand: 1 },
  { id: 'JFK', city: '纽约', region: '美国 · 大西洋门户', continent: '北美洲', lat: 40.6, lon: -73.8, price: 128000, demand: 1 },
  { id: 'MEX', city: '墨西哥城', region: '墨西哥 · 北美南部', continent: '北美洲', lat: 19.4, lon: -99.1, price: 88000, demand: 0.9 },
  { id: 'BOG', city: '波哥大', region: '哥伦比亚 · 南美北部', continent: '南美洲', lat: 4.7, lon: -74.1, price: 80000, demand: 0.85 },
  { id: 'LIM', city: '利马', region: '秘鲁 · 南美西部', continent: '南美洲', lat: -12, lon: -77.1, price: 80000, demand: 0.85 },
  { id: 'GRU', city: '圣保罗', region: '巴西 · 南美东部', continent: '南美洲', lat: -23.4, lon: -46.5, price: 112000, demand: 0.95 },
  { id: 'SCL', city: '圣地亚哥', region: '智利 · 南美西部', continent: '南美洲', lat: -33.4, lon: -70.8, price: 88000, demand: 0.85 },
  { id: 'EZE', city: '布宜诺斯艾利斯', region: '阿根廷 · 南美南部', continent: '南美洲', lat: -34.8, lon: -58.5, price: 96000, demand: 0.9 },
  { id: 'SYD', city: '悉尼', region: '澳大利亚 · 东部', continent: '大洋洲', lat: -33.9, lon: 151.2, price: 112000, demand: 0.95 },
  { id: 'PER', city: '珀斯', region: '澳大利亚 · 西部', continent: '大洋洲', lat: -31.9, lon: 116, price: 88000, demand: 0.8 },
  { id: 'AKL', city: '奥克兰', region: '新西兰 · 南太平洋', continent: '大洋洲', lat: -37, lon: 174.8, price: 96000, demand: 0.85 },
  { id: 'NAN', city: '楠迪', region: '斐济 · 南太平洋', continent: '大洋洲', lat: -17.8, lon: 177.4, price: 72000, demand: 0.75 }
];
