import { AIRPORTS as DOMESTIC_AIRPORTS } from './catalog-v4.js';
import { WORLD_AIRPORTS, type AirportDefinition } from './world-airports.js';
// Reuse unchanged aircraft/economic fixtures. Never modify a frozen catalogue to add airports.
export { MODELS, STARTER_MODEL, AIRCRAFT_KIND_LABEL, UPGRADE_LABEL, emptyUpgrades, aircraftSpecs, retrofitPrice,
  hangarPrice, TASKS, model, routeId, upgradePrice } from './catalog-v5.js';
export type { AircraftKind, AircraftModel, UpgradeKey, Upgrades } from './catalog-v5.js';
export { CONTINENTS, type Continent, type AirportDefinition } from './world-airports.js';
export const AIRPORTS: readonly AirportDefinition[] = [
  ...DOMESTIC_AIRPORTS.map(a => ({ ...a, continent: '亚洲' as const })), ...WORLD_AIRPORTS
];
export const airport = (id: string) => {
  const result = AIRPORTS.find(a => a.id === id);
  if (!result) throw new Error('未知机场');
  return result;
};
/** Great-circle kilometres. Existing coordinates and rounding remain unchanged. */
export function distance(from: string, to: string): number {
  const a = airport(from), b = airport(to), rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h))));
}
export const routePrice = (a: string, b: string) => 2500 + distance(a, b) * 5;
