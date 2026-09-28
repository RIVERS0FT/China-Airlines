import { describe, expect, it } from 'vitest';
import { ALL_MODELS, AIRPORTS, airport, aircraftSpecs, distance, model } from '../../src/core/catalog.js';
import { assemblyPrice, growthPrice, emptyTuning } from '../../src/core/career-catalog.js';
import { resaleValue } from '../../src/core/management.js';
import {
  distanceUnits, evolutionMultiplier, formationRevenueMultiplier,
  legOperatingCosts, baseOrderReward, transportRevenue, routeOperatingCost,
} from '../../src/core/economy.js';
import { GameCore, manifest, planQuote, quote, validateSave, type GameState } from '../helpers/configured-game.js';
import { GameCore as FreshGameCore } from '../../src/core/game.js';

const NOW = 1_800_000_000_000, PLANE = 'AC0001';

function flightScenario(modelId: string, count: number, from = 'PEK', to = 'PVG') {
  const state = new GameCore(NOW).snapshot(), m = model(modelId), p = state.fleet[0]!;
  state.airports = AIRPORTS.map(a => ({ id: a.id, level: 3 }));
  state.career.airportPeak = state.airports.length;
  p.modelId = modelId; p.airportId = from;
  p.allocation = { passengers: m.capacity, cargo: 0 };
  p.energy.availableSeconds = m.energy * 60;
  state.orders = Array.from({ length: count }, (_, i) => ({
    id: `JB${i + 1}`, kind: 'passengers', from, to, amount: 1,
    reward: baseOrderReward(distance(from, to), 1), location: PLANE,
    createdAt: 0, expiresAt: null, service: 'tourist', product: null,
  }));
  state.nextOrderId = count + 1;
  return state;
}

describe('moderate aviation economy', () => {
  it('prices real ordinary orders by their origin and final destination without service multipliers', () => {
    const state = new GameCore(NOW).snapshot();
    for (const order of state.orders) expect(order.reward).toBe(baseOrderReward(distance(order.from, order.to), order.amount));
    expect(baseOrderReward(distance('PEK', 'PVG'), 1)).toBe(326);
  });

  it('gives the five-slot Heron a 1141 coin full-flight profit and breaks even at two of five slots', () => {
    const full = flightScenario('heron-p', 5), partial = flightScenario('heron-p', 2), sparse = flightScenario('heron-p', 1);
    expect(quote(full, full.fleet[0]!, 'PVG')).toMatchObject({ revenue: 1630, cost: 489, profit: 1141, duration: 221 });
    expect(quote(partial, partial.fleet[0]!, 'PVG').profit).toBe(163);
    expect(quote(sparse, sparse.fleet[0]!, 'PVG').profit).toBe(-163);
    expect(validateSave(full)).toEqual(full);
  });

  it('keeps every base aircraft profitable at half load and at 65-76 percent full-load margin on the starter route', () => {
    let previousMinuteProfit = 0;
    for (const m of ALL_MODELS) {
      const full = flightScenario(m.id, m.capacity), half = flightScenario(m.id, Math.ceil(m.capacity / 2));
      const q = quote(full, full.fleet[0]!, 'PVG');
      expect(q.profit / q.revenue, m.id).toBeGreaterThanOrEqual(0.65);
      expect(q.profit / q.revenue, m.id).toBeLessThanOrEqual(0.76);
      expect(quote(half, half.fleet[0]!, 'PVG').profit, m.id).toBeGreaterThan(0);
      const minuteProfit = q.profit * 60 / (q.duration + 8);
      expect(minuteProfit, m.id).toBeGreaterThan(previousMinuteProfit);
      previousMinuteProfit = minuteProfit;
    }
  });

  it('does not let zero allocation or empty repositioning erase airframe costs', () => {
    for (const m of ALL_MODELS) {
      const empty = flightScenario(m.id, 0), allocatedCost = quote(empty, empty.fleet[0]!, 'PVG').cost;
      empty.fleet[0]!.allocation = { passengers: 0, cargo: 0 };
      const q = quote(empty, empty.fleet[0]!, 'PVG');
      expect(q.cost, m.id).toBe(allocatedCost);
      expect(q.profit, m.id).toBeLessThan(0);
    }
  });

  it('bounds formation/evolution growth and keeps fare independent of fullness', () => {
    expect(formationRevenueMultiplier(0)).toBe(1);
    expect(formationRevenueMultiplier(6)).toBeCloseTo(2.2);
    expect(evolutionMultiplier(20)).toBeCloseTo(1.3);
    expect(transportRevenue(1000, 6, 20)).toBe(2860);
    expect(transportRevenue(1000, 1, 0)).toBe(1200);
    expect(transportRevenue(2000, 1, 0)).toBe(2400);
    const state = flightScenario('heron-p', 5);
    state.fleet[0]!.tuning.group = 6; state.fleet[0]!.tuning.evolution = 20;
    const q = quote(state, state.fleet[0]!, 'PVG');
    expect(q.cost).toBe(841); expect(q.revenue).toBe(4661);
  });

  it('charges extra stops and conserves the route total with cumulative rounding', () => {
    const core = new GameCore(NOW); core.execute({ type: 'unlock', airportId: 'WUH' }, NOW);
    core.execute({ type: 'load-destination', planeId: PLANE, to: 'PVG' }, NOW);
    const s = core.snapshot(), p = s.fleet[0]!, specs = aircraftSpecs(p);
    const legs = [distanceUnits(distance('PEK', 'WUH')), distanceUnits(distance('WUH', 'PVG'))];
    const plan = planQuote(s, p, ['WUH', 'PVG']);
    expect(plan.cost).toBe(routeOperatingCost(legs[0]! + legs[1]!, specs.weight, specs.speed, 0, specs.capacity, 2));
    expect(plan.legs.map(l => l.cost)).toEqual(legOperatingCosts(legs, specs.weight, specs.speed, 0, specs.capacity));
    expect(plan.legs[0]!.revenue).toBe(0);
    expect(plan.revenue).toBe(manifest(s, PLANE).reduce((n, o) => n + o.reward, 0));
    expect(plan.cost).toBeGreaterThan(quote(s, p, 'PVG').cost);
    for (const group of [0, 1, 6]) for (const capacity of [1, 5, 10]) for (const ds of [[1, 1, 1], [276, 299, 276], Array<number>(12).fill(497)]) {
      expect(legOperatingCosts(ds, 220, 360, group, capacity).reduce((a, b) => a + b, 0))
        .toBe(routeOperatingCost(ds.reduce((a, b) => a + b, 0), 220, 360, group, capacity, ds.length));
    }
  });

  it('makes a first airport affordable while the two airport rewards cannot repay its price', () => {
    const c = new GameCore(NOW), before = c.snapshot().credits;
    c.execute({ type: 'unlock', airportId: 'WUH' }, NOW);
    c.execute({ type: 'claim', taskId: 'three-airports' }, NOW);
    c.execute({ type: 'career-claim', id: 'network-3' }, NOW);
    expect(before - c.snapshot().credits).toBe(3500);
    expect(c.snapshot().credits).toBeGreaterThan(quote(c.snapshot(), c.snapshot().fleet[0]!, 'PVG').cost * 10);
    expect(airport('WUH').price).toBe(6500); expect(airport('XIY').price).toBe(8500);
    expect(airport('SIN').price).toBeGreaterThan(airport('NRT').price);
    expect(airport('JFK').price).toBeGreaterThan(airport('SIN').price * 3);
  });

  it('funds two configured planes and the purchased destination while retaining departure reserves from a real new game', () => {
    const c = new FreshGameCore(NOW);
    c.execute({ type: 'unlock', airportId: 'PVG' }, NOW);
    c.execute({ type: 'buy', modelId: 'diamond-da40', airportId: 'PEK', passengers: 1, cargo: 0 }, NOW);
    c.execute({ type: 'buy', modelId: 'swift-p', airportId: 'PVG', passengers: 2, cargo: 0 }, NOW);
    expect(c.snapshot().credits).toBe(6200);
    c.execute({ type: 'load-destination', planeId: PLANE, to: 'PVG' }, NOW);
    c.execute({ type: 'load-destination', planeId: 'AC0002', to: 'PEK' }, NOW);
    c.execute({ type: 'dispatch', planeId: PLANE, to: 'PVG', auto: false }, NOW);
    c.execute({ type: 'dispatch', planeId: 'AC0002', to: 'PEK', auto: false }, NOW);
    expect(c.snapshot().credits).toBe(5912);
    expect(c.snapshot().fleet.every(p => p.flight)).toBe(true);
    expect(validateSave(c.snapshot())).toEqual(c.snapshot());
  });

  it('raises growth investment by model and level and prevents assembly-resale arbitrage', () => {
    const starter = { modelId: 'heron-p', tuning: emptyTuning() };
    expect(growthPrice(starter, 'group')).toEqual({ gold: 4400, tickets: 2 });
    expect(growthPrice({ ...starter, tuning: { ...starter.tuning, group: 5 } }, 'group').gold).toBeGreaterThan(15000);
    expect(growthPrice({ ...starter, modelId: 'aurora-p' }, 'group').gold).toBeGreaterThan(30000);
    for (const m of ALL_MODELS) {
      const p = { modelId: m.id, upgrades: { capacity: 0, engine: 0, range: 0, efficiency: 0 } };
      expect(assemblyPrice(m.id), m.id).toBeGreaterThan(resaleValue(p));
    }
  });

  it('validates the new cost contract and rejects v11 without changing a live state', () => {
    const s = flightScenario('heron-p', 5), c = new GameCore(NOW, s);
    c.execute({ type: 'dispatch-plan', planeId: PLANE, stops: ['PVG', 'PEK'] }, NOW);
    expect(validateSave(c.snapshot())).toEqual(c.snapshot());
    const tampered = c.snapshot(); tampered.fleet[0]!.flight!.cost--;
    expect(() => validateSave(tampered)).toThrow();
    const previous = structuredClone(s) as Omit<GameState, 'version'> & { version: number }; previous.version = 11;
    expect(() => validateSave(previous)).toThrow(/版本/);
    expect(c.snapshot().version).toBe(15);
  });
});
