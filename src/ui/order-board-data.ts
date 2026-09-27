import { shallow } from 'zustand/vanilla/shallow';
import { AIRPORTS } from '../core/catalog.js';
import type { Order } from '../core/game.js';
import type { LoadingContext } from './order-presentation.js';

export interface OrderBoardData {
  orders: Order[];
  loading: LoadingContext;
  airportId: string;
  busy: boolean;
}

/** Published snapshots are cloned. Compare only inputs that can change this board. */
export function sameOrderBoardData(a: OrderBoardData, b: OrderBoardData) {
  return a.airportId === b.airportId && a.busy === b.busy && shallow(a.loading, b.loading)
    && a.orders.length === b.orders.length && a.orders.every((order, index) => shallow(order, b.orders[index]));
}

const destinationRank = new Map(AIRPORTS.map((airport, index) => [airport.id, index]));
/** Keep destination stations in catalog order even when their oldest order leaves. */
export function groupWaitingOrders(orders: Order[]) {
  const groups = new Map<string, Order[]>();
  for (const order of [...orders].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id, undefined, { numeric: true }))) {
    const group = groups.get(order.to);
    if (group) group.push(order); else groups.set(order.to, [order]);
  }
  return [...groups].sort(([a], [b]) => destinationRank.get(a)! - destinationRank.get(b)!);
}
