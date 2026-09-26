import { describe, expect, it } from 'vitest';
import { GameCore, loadSummary, orderReward, quote, validateSave, type Command } from '../../src/core/game.js';
import { MODELS, aircraftSpecs, cabinAllocationPrice } from '../../src/core/catalog.js';

const NOW = 1_800_000_000_000;
const funded = () => {
  const state = new GameCore(NOW).snapshot();
  state.credits = 1_000_000;
  state.career.xp = 20000;
  state.airports[0]!.level = 3;
  const core = new GameCore(NOW, state);
  core.execute({ type: 'unlock', airportId: 'PVG' }, NOW);
  return core;
};

describe('player allocated aircraft capacity', () => {
  it('starts without aircraft and delivers all ten purchased grades with free chosen cabins', () => {
    const fresh = new GameCore(NOW).snapshot();
    expect(fresh.fleet).toEqual([]);
    expect(fresh.airports).toEqual([{ id: 'PEK', level: 1 }]);
    expect(MODELS.map(model => model.capacity).sort((a, b) => a - b)).toEqual([1,2,3,4,5,6,7,8,9,10]);
    for (const model of MODELS) {
      const core = funded();
      const before = core.snapshot();
      core.execute({ type: 'buy', modelId: model.id, airportId: 'PEK', passengers: model.capacity, cargo: 0 }, NOW);
      const plane = core.snapshot().fleet[0]!;
      expect(core.snapshot().credits).toBe(before.credits - model.price);
      expect(plane.allocation).toEqual({ passengers: model.capacity, cargo: 0 });
      expect(aircraftSpecs(plane)).toMatchObject({ capacity: model.capacity, seats: model.capacity, cargo: 0 });
      expect(validateSave(core.snapshot())).toEqual(core.snapshot());
    }
  });

  it('charges each new slot and pays only for real loaded orders', () => {
    const core = funded();
    core.execute({ type: 'buy', modelId: 'swift-m', airportId: 'PEK', passengers: 1, cargo: 0 }, NOW);
    const empty = core.snapshot(), planeId = empty.fleet[0]!.id;
    expect(cabinAllocationPrice({ passengers: 0, cargo: 0 }, { passengers: 2, cargo: 1 })).toBe(620);
    const emptyQuote = quote(empty, empty.fleet[0]!, 'PVG');
    expect(emptyQuote.revenue).toBe(0);
    core.execute({ type: 'allocate-cabin', planeId, passengers: 2, cargo: 1 }, NOW);
    expect(core.snapshot().credits).toBe(empty.credits - 420);
    core.execute({ type: 'load-destination', planeId, to: 'PVG' }, NOW);
    const loaded = core.snapshot(), fullQuote = quote(loaded, loaded.fleet[0]!, 'PVG');
    expect(loadSummary(loaded, planeId)).toEqual({ passengers: 2, cargo: 1 });
    expect(fullQuote.revenue).toBeGreaterThan(fullQuote.cost);
    expect(fullQuote.revenue).toBeGreaterThan(emptyQuote.revenue);
    expect(validateSave(loaded)).toEqual(loaded);
  });

  it('keeps a fully loaded ordinary flight profitable at every capacity grade', () => {
    for (const model of MODELS) {
      const state = funded().snapshot();
      for (const airport of state.airports) airport.level = 3;
      for (const order of state.orders.filter(order => order.location === 'PEK')) {
        order.to = 'PVG';
        order.service = order.kind === 'passengers' ? 'tourist' : 'general';
        order.reward = orderReward('PEK', 'PVG', order.kind, order.amount);
      }
      const core = new GameCore(NOW, state);
      const passengers = Math.ceil(model.capacity * 0.6), cargo = model.capacity - passengers;
      core.execute({ type: 'buy', modelId: model.id, airportId: 'PEK', passengers, cargo }, NOW);
      const planeId = core.snapshot().fleet[0]!.id;
      core.execute({ type: 'load-destination', planeId, to: 'PVG' }, NOW);
      const loaded = core.snapshot();
      expect(loadSummary(loaded, planeId)).toEqual({ passengers, cargo });
      const economics = quote(loaded, loaded.fleet[0]!, 'PVG');
      expect(economics.revenue, model.id).toBeGreaterThan(economics.cost);
    }
  });

  it('rejects missing, empty, fractional, negative and excessive purchase selections without spending', () => {
    const core = funded(), before = core.snapshot();
    for (const [passengers, cargo] of [[undefined, undefined], [0, 0], [-1, 1], [1, -1], [1.5, 0], [0, 0.5], [4, 0], [2, 2], [NaN, 0], [0, Infinity]]) {
      expect(() => core.execute({ type: 'buy', modelId: 'swift-m', airportId: 'PEK', passengers, cargo } as Command, NOW)).toThrow(/选配/);
      expect(core.snapshot()).toEqual(before);
    }
  });

  it('charges later refits after reload and clearing the cabin cannot restore free configuration', () => {
    const core = funded();
    core.execute({ type: 'buy', modelId: 'swift-m', airportId: 'PEK', passengers: 2, cargo: 1 }, NOW);
    const saved = validateSave(core.snapshot()), restored = new GameCore(NOW, saved), id = saved.fleet[0]!.id;
    restored.execute({ type: 'allocate-cabin', planeId: id, passengers: 0, cargo: 3 }, NOW);
    expect(restored.snapshot().credits).toBe(saved.credits - 200);
    restored.execute({ type: 'allocate-cabin', planeId: id, passengers: 0, cargo: 0 }, NOW);
    restored.execute({ type: 'allocate-cabin', planeId: id, passengers: 2, cargo: 1 }, NOW);
    expect(restored.snapshot().credits).toBe(saved.credits - 820);
    expect(validateSave(restored.snapshot())).toEqual(restored.snapshot());
  });

  it('allows partial free configuration and requires only the airframe price to complete a purchase', () => {
    const state = funded().snapshot(); state.credits = 8500;
    const core = new GameCore(NOW, state);
    core.execute({ type: 'buy', modelId: 'swift-m', airportId: 'PEK', passengers: 0, cargo: 1 }, NOW);
    expect(core.snapshot().credits).toBe(0);
    expect(core.snapshot().fleet[0]!.allocation).toEqual({ passengers: 0, cargo: 1 });
    const before = core.snapshot();
    expect(() => core.execute({ type: 'allocate-cabin', planeId: before.fleet[0]!.id, passengers: 2, cargo: 1 }, NOW)).toThrow(/资金/);
    expect(core.snapshot()).toEqual(before);
  });

  it('rejects over-allocation, stranded loads, locked refits and tampered saves atomically', () => {
    const core = funded();
    core.execute({ type: 'buy', modelId: 'swift-m', airportId: 'PEK', passengers: 1, cargo: 0 }, NOW);
    const id = core.snapshot().fleet[0]!.id, before = core.snapshot();
    expect(() => core.execute({ type: 'allocate-cabin', planeId: id, passengers: 3, cargo: 1 }, NOW)).toThrow(/容量/);
    expect(core.snapshot()).toEqual(before);
    core.execute({ type: 'allocate-cabin', planeId: id, passengers: 2, cargo: 1 }, NOW);
    core.execute({ type: 'load-destination', planeId: id, to: 'PVG' }, NOW);
    const loaded = core.snapshot();
    expect(() => core.execute({ type: 'allocate-cabin', planeId: id, passengers: 0, cargo: 1 }, NOW)).toThrow(/卸下/);
    expect(core.snapshot()).toEqual(loaded);
    const tampered = structuredClone(loaded);
    tampered.fleet[0]!.allocation = { passengers: 3, cargo: 1 };
    expect(() => validateSave(tampered)).toThrow();
    const previous = structuredClone(loaded) as { version: number };
    previous.version = 11;
    expect(() => validateSave(previous)).toThrow(/版本/);
    core.execute({ type: 'dispatch', planeId: id, to: 'PVG', auto: false }, NOW);
    expect(() => core.execute({ type: 'allocate-cabin', planeId: id, passengers: 2, cargo: 0 }, NOW)).toThrow(/飞行/);
  });
});
