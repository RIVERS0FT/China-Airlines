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
export function orderBlockReason(game: GameState, plane: Plane | undefined, order: Order, aboard: boolean): string {
  const locked = loadingLock(game, plane);
  if (locked || !plane) return locked;
  if (order.location !== (aboard ? plane.id : plane.airportId)) return aboard ? '订单不在这架飞机上' : '订单不在当前机场';
  if (aboard) return waiting(game, plane.airportId).length >= MAX_WAITING ? '机场候运区已满' : '';
  const specs = aircraftSpecs(plane), total = loadSummary(game, plane.id);
  if (order.kind === 'passengers') {
    if (!specs.seats) return '纯货机不载客';
    return total.passengers + order.amount > specs.seats ? '剩余客舱不足' : '';
  }
  const special = service(order.service)?.special;
  if(special && special !== 'none' && plane.tuning.special !== special)return special==='cold'?'需要冷链货舱':'需要工业货舱';
  if (!specs.cargo) return '纯客机不载货';
  return total.cargo + order.amount > specs.cargo ? '剩余货舱不足' : '';
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
  const aboard = Boolean(plane && order.location === plane.id);
  const reason = orderBlockReason(game, plane, order, aboard);
  const state: OrderState = aboard ? 'loaded' : reason ? 'blocked' : 'waiting';
  const action = busy ? '保存中…' : reason || (aboard ? '卸载' : '装机');
  return { state, aboard, reason, disabled: busy || Boolean(reason),
    label: aboard ? '已装机' : reason ? '不可装' : '待装机',
    action,
    caption: `${aboard ? '已装机 · ' : ''}${!busy && reason ? shortLoadingReason[reason] ?? reason : action}`,
    transfer: !aboard && order.expiresAt === null,
  };
}
