import { aircraftSpecs } from '../core/catalog.js';
import { loadSummary, MAX_WAITING, waiting, type GameState, type Plane, type Order } from '../core/game.js';

/** Read-only explanations. The core revalidates every actual load/unload command. */
export function loadingLock(game: GameState, plane?: Plane): string {
  if (!plane) return '请先选择飞机';
  if (plane.flight) return '飞行中，不能装卸';
  if (plane.autoRouteId) return '请先停止自动值勤';
  if (plane.itinerary.length) return '请先取消剩余计划';
  if (plane.readyAt > game.simTime) return '地面周转中';
  return '';
}
export function orderBlockReason(game: GameState, plane: Plane | undefined, order: Order, aboard: boolean): string {
  const locked = loadingLock(game, plane);
  if (locked || !plane) return locked;
  if (aboard) return waiting(game, plane.airportId).length >= MAX_WAITING ? '机场候运区已满' : '';
  const specs = aircraftSpecs(plane), total = loadSummary(game, plane.id);
  if (order.kind === 'passengers') {
    if (!specs.seats) return '纯货机不载客';
    return total.passengers + order.amount > specs.seats ? '剩余客舱不足' : '';
  }
  if (!specs.cargo) return '纯客机不载货';
  return total.cargo + order.amount > specs.cargo ? '剩余货舱不足' : '';
}
