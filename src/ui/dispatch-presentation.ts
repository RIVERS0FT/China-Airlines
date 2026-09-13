import { manifest, MAX_PLAN_LEGS, planQuote, type GameState, type Plane } from '../core/game.js';
import { departureEnergyReason, flightEnergy } from '../core/game.js';
import { autoAllowed } from '../core/career.js';
import { currentFlight } from './flight-status.js';

/** One read-only projection for both the four readouts and the launch control.
 * Core commands still validate the actual departure. No money or time is stored here. */
export function dispatchPresentation(game: GameState, plane: Plane | undefined, stops: readonly string[], auto: boolean, busy: boolean) {
  const active = plane ? currentFlight(game, plane) : null;
  let draft: ReturnType<typeof planQuote> | null = null, error = '';
  if (!active && plane && stops.length) {
    try { draft = planQuote(game, plane, [...stops]); }
    catch (cause) { error = cause instanceof Error ? cause.message : '路线不可用'; }
  }
  const lockedReason = !plane ? '请选择飞机' : active ? '航班正在飞行' : busy ? '正在保存，请稍候' :
    plane.energy.serviceUntil !== null ? '地勤补能中' : plane.autoRouteId ? '请先停止自动值勤' :
    plane.itinerary.length ? '请先取消剩余计划' : plane.readyAt > game.simTime ? '地面周转中' : '';
  const energyReason = plane && draft ? departureEnergyReason(plane, draft.legs[0]!.duration) : '';
  const jobs = plane ? manifest(game, plane.id) : [];
  const autoReason = auto && (!plane || !autoAllowed(game,plane) || stops.length !== 1 || !jobs.length || jobs.some(o => o.to !== stops[0]))
    ? '自动往返需有效飞行员合同及已装载的同城直达客货' : '';
  const reason = lockedReason || error || (!stops.length ? '请在地图选择城市' : energyReason || autoReason ||
    (draft && game.credits < draft.legs[0]!.cost ? '运营资金不足' : ''));
  const requiredEnergy = plane ? draft?.legs.reduce((sum, leg) => sum + flightEnergy(plane,leg.duration), 0) ?? 0 : 0;
  const warning = !reason && plane && requiredEnergy > plane.energy.availableSeconds
    ? '能量只能覆盖部分航段；不足时停航并保留客货' : '';
  return { active, draft, summary: active ?? draft, error, reason, lockedReason, requiredEnergy, warning,
    canLaunch: Boolean(draft && !reason), maxStops: MAX_PLAN_LEGS };
}
