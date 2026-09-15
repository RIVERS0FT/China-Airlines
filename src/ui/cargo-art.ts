import { MATERIALS, type Material } from '../core/career-catalog.js';
import type { Order } from '../core/game.js';
import { CARGO_ART } from './cargo-art-catalog.js';

type CargoId = keyof typeof CARGO_ART;
const CABIN_VISUAL_SCALE: Readonly<Record<CargoId, number>> = {
  steak: .88, strawberries: .82, watermelon: .72, pears: .78,
  apples: .78, grapes: .82, rice: .84, fish: .88,
  suitcase: .78, knitwear: .78, noodles: .82, teddy: .76,
  computer: .84, crate: .88, parcel: .86, duffel: .80,
  oil: .76, coal: .82, gems: .76, medicine: .84,
  relief: .76, liquor: .82, alpaca: .68, whitechest: .86,
};
const VARIANTS: Readonly<Record<string, readonly CargoId[]>> = {
  general: ['suitcase', 'knitwear', 'noodles', 'teddy', 'computer', 'crate', 'duffel', 'strawberries', 'watermelon', 'pears', 'apples', 'grapes', 'rice', 'gems', 'relief', 'liquor', 'alpaca', 'whitechest'],
  express: ['parcel', 'suitcase', 'duffel', 'teddy', 'computer', 'knitwear', 'relief'],
  cold: ['medicine', 'fish', 'steak', 'strawberries', 'grapes'],
  industrial: ['oil', 'coal', 'computer', 'crate'],
};
const MATERIAL_ART: Readonly<Record<Material, CargoId>> = {
  frame: 'crate', engine: 'crate', wing: 'crate', blueprint: 'parcel', alloy: 'whitechest',
  fabric: 'knitwear', food: 'rice', electronics: 'computer', parcel: 'whitechest', meal: 'noodles', research: 'parcel',
};

/** Decorative category only. Never changes service, price, product or save data. */
export function cargoAppearance(order: Pick<Order, 'id' | 'service' | 'product'>) {
  const variants = VARIANTS[order.service] ?? VARIANTS.general!;
  const hash = Array.from(order.id).reduce((value, char) => (Math.imul(value, 31) + char.charCodeAt(0)) >>> 0, 0);
  const key = order.product ? MATERIAL_ART[order.product] : variants[hash % variants.length]!;
  const frame = CARGO_ART[key];
  return { ...frame, key, name: order.product ? MATERIALS[order.product] : frame.name,
    cabinVisualScale: CABIN_VISUAL_SCALE[key],
    viewBox: `${frame.x} ${frame.y} ${frame.width} ${frame.height}` };
}
