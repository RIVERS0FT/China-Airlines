import type { MapBox } from './map-label-layout.js';

export const MAP_LABEL_MOTION_MS = 160;
/** Positions are offsets from the airport anchor, which always follows the camera immediately. */
export interface MapLabelMotion { from: MapBox; target: MapBox; startedAt: number }

/** New labels appear immediately; moving labels resume from their currently painted position. */
export function retargetMapLabel(previous: MapLabelMotion | undefined, target: MapBox, nowMs: number, reducedMotion = false): MapLabelMotion {
  if (!previous || reducedMotion) return { from: { ...target }, target: { ...target }, startedAt: nowMs };
  if (previous.target.x === target.x && previous.target.y === target.y) {
    return { ...previous, target: { ...target } };
  }
  return { from: sampleMapLabel(previous, nowMs).box, target: { ...target }, startedAt: nowMs };
}

/** Finite easing allows the map to stop drawing exactly when every label settles. */
export function sampleMapLabel(motion: MapLabelMotion, nowMs: number, reducedMotion = false): { box: MapBox; active: boolean } {
  const progress = Math.max(0, Math.min(1, (nowMs - motion.startedAt) / MAP_LABEL_MOTION_MS));
  if (reducedMotion || progress >= 1 || (motion.from.x === motion.target.x && motion.from.y === motion.target.y)) {
    return { box: { ...motion.target }, active: false };
  }
  const eased = 1 - (1 - progress) ** 2;
  return { box: { ...motion.target, x: motion.from.x + (motion.target.x - motion.from.x) * eased,
    y: motion.from.y + (motion.target.y - motion.from.y) * eased }, active: true };
}
