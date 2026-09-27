import { service } from '../core/career-catalog.js';
import { aircraftSpecs } from '../core/catalog.js';
import { loadSummary, MAX_WAITING, waiting, type GameState, type Plane, type Order } from '../core/game.js';

/** Read-only explanations. The core revalidates every actual load/unload command. */
export function loadingLock(game: GameState, plane?: Plane): string {
  if (!plane) return '请先选择飞机';
  if (plane.energy.serviceUntil !== null) return '地勤补能中，不能装卸';
  if (plane.flight) return '飞行中，不能装卸';
  if (plane.autoRouteId) return '请先停止自动值勤';
  if (plane.itinerary.length) return '请先取消剩余计划';
  if (plane.readyAt > game.simTime) return '地面周转中';
  return '';
}
/** Compute shared capacity and permission inputs once for a whole order list. */
export function loadingContext(game: GameState, plane?: Plane) {
  const specs = plane ? aircraftSpecs(plane) : null;
  const total = plane ? loadSummary(game, plane.id) : { passengers: 0, cargo: 0 };
  return {
    lock: loadingLock(game, plane), planeId: plane?.id ?? null, airportId: plane?.airportId ?? null,
    seats: specs?.seats ?? 0, cargo: specs?.cargo ?? 0,
    passengers: total.passengers, freight: total.cargo, special: plane?.tuning.special ?? 'none',
    waitingFull: Boolean(plane && waiting(game, plane.airportId).length >= MAX_WAITING),
  };
}
export type LoadingContext = ReturnType<typeof loadingContext>;
export function orderBlockReasonInContext(context: LoadingContext, order: Order, aboard: boolean): string {
  if (context.lock || !context.planeId) return context.lock;
  if (order.location !== (aboard ? context.planeId : context.airportId)) return aboard ? '订单不在这架飞机上' : '订单不在当前机场';
  if (aboard) return context.waitingFull ? '机场候运区已满' : '';
  if (order.kind === 'passengers') {
    if (!context.seats) return '请先分配客位';
    return context.passengers + order.amount > context.seats ? '剩余客舱不足' : '';
  }
  const special = service(order.service)?.special;
  if(special && special !== 'none' && context.special !== special)return special==='cold'?'需要冷链货舱':'需要工业货舱';
  if (!context.cargo) return '请先分配货位';
  return context.freight + order.amount > context.cargo ? '剩余货舱不足' : '';
}
export function orderBlockReason(game: GameState, plane: Plane | undefined, order: Order, aboard: boolean): string {
  return orderBlockReasonInContext(loadingContext(game, plane), order, aboard);
}

export type OrderState = 'loaded' | 'waiting' | 'blocked';
const shortLoadingReason: Record<string, string> = {
  '地勤补能中，不能装卸': '补能中',
  '飞行中，不能装卸': '飞行中',
  '请先停止自动值勤': '自动值勤中',
  '请先取消剩余计划': '执行计划中',
  '机场候运区已满': '候运区已满',
  '剩余客舱不足': '客舱不足',
  '剩余货舱不足': '货舱不足',
};
/** Loaded state is independent of permission to unload (flight, service, full apron). */
export function orderPresentation(game: GameState, plane: Plane | undefined, order: Order, busy = false) {
  return presentOrder(loadingContext(game, plane), order, busy);
}
export function presentOrder(context: LoadingContext, order: Order, busy = false) {
  const aboard = order.location === context.planeId;
  const reason = orderBlockReasonInContext(context, order, aboard);
  const state: OrderState = aboard ? 'loaded' : reason ? 'blocked' : 'waiting';
  const action = busy ? '保存中…' : reason || (aboard ? '卸载' : '装机');
  return { state, aboard, reason, disabled: busy || Boolean(reason),
    label: aboard ? '已装机' : reason ? '不可装' : '待装机',
    action,
    caption: `${aboard ? '已装机 · ' : ''}${!busy && reason ? shortLoadingReason[reason] ?? reason : action}`,
    transfer: !aboard && order.expiresAt === null,
  };
}
