import { modernModel, retrofitPrice } from './career-catalog.js';
import { model, type Upgrades } from './catalog.js';

/** Aviation adaptation values, not the reference game's exact economy. */
export const DISPATCHER_PRICE = 1800;
export function resaleValue(plane: { modelId: string; upgrades: Upgrades }): number {
  const base = model(plane.modelId).price;
  if(modernModel(plane.modelId)){let invested=0;for(const key of Object.keys(plane.upgrades) as (keyof Upgrades)[])for(let i=0;i<plane.upgrades[key];i++)invested+=retrofitPrice({...plane,upgrades:{...plane.upgrades,[key]:i}},key);return Math.floor(base*.5+invested*.25);}
  const invested = Object.values(plane.upgrades).reduce((sum, level) => {
    for (let i = 1; i <= level; i++) sum += Math.round(base * .12 * i);
    return sum;
  }, 0);
  return Math.floor(base * .5 + invested * .25);
}
