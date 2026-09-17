import { describe, expect, it } from 'vitest';
import { aircraftSpecs, distance } from '../src/core/catalog.js';
import {
  railwayDistanceUnits,
  railwayEvolutionMultiplier,
  railwayLegCosts,
  railwayOrderReward,
  railwayRevenue,
  railwayRouteCost,
} from '../src/core/economy.js';
import {
  GameCore,
  manifest,
  planQuote,
  quote,
} from '../src/core/game.js';

const NOW = 1_800_000_000_000;
const PLANE = 'AC0001';

describe('China Railway 2.0.9 economy formula', () => {
  it('prices every normal passenger and cargo unit at D + 50 without service multipliers', () => {
    const state = new GameCore(NOW).snapshot();
    for (const order of state.orders) {
      expect(order.reward).toBe(
        railwayOrderReward(distance(order.from, order.to), order.amount),
      );
    }
    const pekToPvg = state.orders.filter(order => order.from === 'PEK' && order.to === 'PVG');
    expect(new Set(pekToPvg.map(order => order.reward))).toEqual(
      new Set([railwayDistanceUnits(distance('PEK', 'PVG')) + 50]),
    );
  });

  it('never adds a full-load multiplier and applies the verified evolution curve once', () => {
    const core = new GameCore(NOW);
    core.execute({ type: 'load-destination', planeId: PLANE, to: 'PVG' }, NOW);
    const full = core.snapshot();
    const base = manifest(full, PLANE).reduce((sum, order) => sum + order.reward, 0);
    expect(quote(full, full.fleet[0]!, 'PVG').revenue).toBe(base);

    const evolved = structuredClone(full);
    evolved.fleet[0]!.tuning.group = 2;
    evolved.fleet[0]!.tuning.evolution = 1;
    expect(quote(evolved, evolved.fleet[0]!, 'PVG').revenue).toBe(
      railwayRevenue(base, 2, 1),
    );
    expect(railwayEvolutionMultiplier(0)).toBe(1);
    expect(railwayEvolutionMultiplier(1)).toBeCloseTo(1.0102, 10);
    expect(railwayEvolutionMultiplier(20)).toBeCloseTo(
      1 + 1.02 ** 20 / 100,
      10,
    );
  });

  it('rounds a multi-stop route once and allocates that exact cost across legs', () => {
    const core = new GameCore(NOW);
    core.execute({ type: 'unlock', airportId: 'WUH' }, NOW);
    const state = core.snapshot(), plane = state.fleet[0]!, specs = aircraftSpecs(plane);
    const legs = [
      railwayDistanceUnits(distance('PEK', 'WUH')),
      railwayDistanceUnits(distance('WUH', 'PVG')),
    ];
    const expected = railwayRouteCost(
      legs.reduce((sum, leg) => sum + leg, 0),
      specs.weight,
      specs.speed,
      plane.tuning.group,
      1 + plane.upgrades.capacity + plane.tuning.cabins,
    );
    const plan = planQuote(state, plane, ['WUH', 'PVG']);
    expect(plan.cost).toBe(expected);
    expect(plan.legs.map(leg => leg.cost)).toEqual(
      railwayLegCosts(legs, specs.weight, specs.speed, 0, 1),
    );
    expect(plan.legs.reduce((sum, leg) => sum + leg.cost, 0)).toBe(expected);
  });

  it('includes all cabins in cost and allows the verified formula to round to zero', () => {
    expect(railwayRouteCost(1, 1, 1, 0, 1)).toBe(0);
    expect(railwayRouteCost(100, 220, 360, 0, 3)).toBe(
      Math.floor((100 * 220 * 360 * 3) / 400000),
    );
  });
});
