/** Aviation balance values; the reference game informs distance and base fares only. */
export const distanceUnits = (kilometres: number) => Math.floor(kilometres / 4);
export const baseOrderReward = (kilometres: number, amount: number) =>
  amount * (distanceUnits(kilometres) + 50);

export const formationRevenueMultiplier = (level: number) => 1 + level * 0.2;
export const evolutionMultiplier = (level: number) => 1 + level * 0.015;
export const transportRevenue = (baseReward: number, groupLevel: number, evolutionLevel: number) =>
  Math.floor(baseReward * (100 + groupLevel * 20) * (1000 + evolutionLevel * 15) / 100000);

/** Rated airframe capacity carries costs even with an empty/unallocated cabin.
 * Each takeoff adds a handling charge. Integer coefficients keep rounding exact.
 */
export function routeOperatingCost(
  routeDistanceUnits: number, weight: number, speed: number,
  groupLevel: number, capacity: number, legCount = 1,
) {
  // (D * (capacity * 0.24 + weight * speed / 600000) + legs * capacity * 12)
  // * (1 + groupLevel * 0.12)
  return Math.floor(
    (routeDistanceUnits * (capacity * 144000 + weight * speed) + legCount * capacity * 7200000)
    * (100 + groupLevel * 12) / 60000000,
  );
}

/** Round the plan once; cumulative differences preserve exact staged payments. */
export function legOperatingCosts(
  legDistances: readonly number[], weight: number, speed: number,
  groupLevel: number, capacity: number,
) {
  let cumulativeDistance = 0, previousCost = 0;
  return legDistances.map((legDistance, index) => {
    cumulativeDistance += legDistance;
    const cumulativeCost = routeOperatingCost(cumulativeDistance, weight, speed, groupLevel, capacity, index + 1);
    const cost = cumulativeCost - previousCost;
    previousCost = cumulativeCost;
    return cost;
  });
}
