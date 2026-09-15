import { aircraftSpecs } from '../core/catalog.js';
import { manifest, type GameState, type Plane, type Order } from '../core/game.js';
import { cargoAppearance } from './cargo-art.js';

export function orderArtFile(order: Pick<Order, 'id' | 'kind' | 'service' | 'product'>): string {
  return order.kind === 'cargo' ? cargoAppearance(order).file : 'passenger-standing-seated-v2.png';
}

export interface CabinDeckData { kind: Order['kind']; capacity: number; used: number; orders: Order[] }
/** Stable, read-only placement. A historical aggregate order stays one labeled group. */
export function cabinLayout(game: GameState, plane: Plane): CabinDeckData[] {
  const spec = aircraftSpecs(plane);
  const orders = manifest(game, plane.id).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id, undefined, { numeric: true }));
  return (['passengers', 'cargo'] as const).map(kind => {
    const items = orders.filter(order => order.kind === kind);
    return { kind, capacity: kind === 'passengers' ? spec.seats : spec.cargo, used: items.reduce((sum, order) => sum + order.amount, 0), orders: items };
  }).filter(deck => deck.capacity > 0);
}

/** Page slots without allocating every empty seat on a large upgraded aircraft. */
export function cabinPage(deck: CabinDeckData, requested: number, size: number) {
  const pageSize = Math.max(1, Math.floor(size));
  const free = Math.max(0, deck.capacity - deck.used), slots = deck.orders.length + free;
  const pages = Math.max(1, Math.ceil(slots / pageSize));
  const page = Math.max(0, Math.min(pages - 1, Math.floor(requested)));
  const start = page * pageSize;
  const items = Array.from({ length: Math.max(0, Math.min(pageSize, slots - start)) }, (_, i) => ({
    slot: start + i, order: deck.orders[start + i] ?? null,
  }));
  return { items, page, pages, free };
}
