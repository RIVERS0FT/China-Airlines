/**
 * Verified China Railway 2.0.9 transport-economy core, adapted to the
 * aviation globe scale. Keep these functions free of UI and persistence.
 */
export const railwayDistanceUnits = (kilometres: number) =>
  Math.floor(kilometres / 4);

export const railwayOrderReward = (kilometres: number, amount: number) =>
  amount * (railwayDistanceUnits(kilometres) + 50);

export const railwayEvolutionMultiplier = (level: number) =>
  level < 1 ? 1 : 1 + Math.pow(1.02, level) / 100;

export const railwayRevenue = (
  baseReward: number,
  groupLevel: number,
  evolutionLevel: number,
) =>
  Math.floor(
    baseReward *
      2 ** groupLevel *
      railwayEvolutionMultiplier(evolutionLevel),
  );

export const railwayRouteCost = (
  distanceUnits: number,
  weight: number,
  speed: number,
  groupLevel: number,
  cabins: number,
) =>
  Math.floor(
    (distanceUnits * weight * speed * 2 ** groupLevel * cabins) / 400000,
  );

/**
 * Allocates one route-level cost across its legs without changing the final
 * total. This preserves staged payments while rounding only the route total.
 */
export function railwayLegCosts(
  legDistanceUnits: readonly number[],
  weight: number,
  speed: number,
  groupLevel: number,
  cabins: number,
  distanceBefore = 0,
) {
  let cumulative = distanceBefore;
  return legDistanceUnits.map((legDistance) => {
    const before = railwayRouteCost(
      cumulative,
      weight,
      speed,
      groupLevel,
      cabins,
    );
    cumulative += legDistance;
    return (
      railwayRouteCost(cumulative, weight, speed, groupLevel, cabins) - before
    );
  });
}
