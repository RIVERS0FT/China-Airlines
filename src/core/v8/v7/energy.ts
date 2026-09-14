/** The 2016 guide specifies one point per minute; 240 points is its example,
 * not a verified capacity for every original vehicle. Service is an explicit
 * aviation adaptation. See docs/ENERGY.md before changing these constants. */
export const ENERGY_SECONDS_PER_POINT = 60;
export const ENERGY_CAPACITY_SECONDS = 240 * ENERGY_SECONDS_PER_POINT;
export const ENERGY_SERVICE_SECONDS = 120;
export interface EnergyBudget { availableSeconds: number; reservedSeconds: number; serviceUntil: number | null }
export const fullEnergy = (): EnergyBudget => ({ availableSeconds: ENERGY_CAPACITY_SECONDS, reservedSeconds: 0, serviceUntil: null });
/** Reserve integer flight seconds, so dividing a trip never rounds each leg to a point. */
export function energyRequired(flightSeconds: number): number {
  if (!Number.isSafeInteger(flightSeconds) || flightSeconds < 0) throw new Error('无效的飞行耗能时长');
  return flightSeconds;
}
export function energyDepartureReason(energy: EnergyBudget, flightSeconds: number): string {
  if (energy.serviceUntil !== null) return '地勤补能中，请完成或取消补能';
  return energy.availableSeconds < energyRequired(flightSeconds) ? '能量不足，请到机库补能' : '';
}
