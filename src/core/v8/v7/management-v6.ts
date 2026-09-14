import { model, type Upgrades } from './catalog-v6.js';

/** Aviation adaptation values, not the reference game's exact economy. */
export const DISPATCHER_PRICE = 12000;
export function resaleValue(plane: { modelId: string; upgrades: Upgrades }): number {
  const base = model(plane.modelId).price;
  const invested = Object.values(plane.upgrades).reduce((sum, level) => {
    for (let i = 1; i <= level; i++) sum += Math.round(base * .12 * i);
    return sum;
  }, 0);
  return Math.floor(base * .5 + invested * .25);
}
