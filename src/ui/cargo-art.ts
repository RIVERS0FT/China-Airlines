import { MATERIALS, type Material } from '../core/career-catalog.js';
import type { Order } from '../core/game.js';
import { CARGO_ART } from './cargo-art-catalog.js';

type CargoId = keyof typeof CARGO_ART;
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
    viewBox: `${frame.x} ${frame.y} ${frame.width} ${frame.height}` };
}
