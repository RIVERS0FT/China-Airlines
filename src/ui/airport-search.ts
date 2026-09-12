import { AIRPORTS, type Continent } from '../core/catalog.js';
export type ContinentFilter = Continent | 'all';
/** Shared read-only catalogue search for the directory and the WebGL-free selector. */
export function searchAirports(query: string, continent: ContinentFilter = 'all') {
  const words = query.trim().toLocaleLowerCase('zh-CN').split(/\s+/).filter(Boolean);
  return AIRPORTS.filter(a => (continent === 'all' || a.continent === continent) &&
    words.every(word => `${a.city} ${a.id} ${a.region} ${a.continent}`.toLocaleLowerCase('zh-CN').includes(word)));
}
