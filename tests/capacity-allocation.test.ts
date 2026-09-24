import { describe, expect, it } from 'vitest';
import { GameCore, loadSummary, orderReward, quote, validateSave } from '../src/core/game.js';
import { MODELS, aircraftSpecs, cabinAllocationPrice } from '../src/core/catalog.js';

const NOW = 1_800_000_000_000;
const funded = () => {
  const state = new GameCore(NOW).snapshot();
  state.credits = 1_000_000;
  state.career.xp = 20000;
  state.airports[0]!.level = 3;
  return new GameCore(NOW, state);
};

describe('player allocated aircraft capacity', () => {
  it('delivers an empty starter and ten empty purchasable capacity grades', () => {
    const fresh = new GameCore(NOW).snapshot();
    expect(fresh.fleet[0]!.allocation).toEqual({ passengers: 0, cargo: 0 });
    expect(aircraftSpecs(fresh.fleet[0]!)).toMatchObject({ capacity: 5, seats: 0, cargo: 0 });
    expect(MODELS.map(model => model.capacity).sort((a, b) => a - b)).toEqual([1,2,3,4,5,6,7,8,9,10]);
    for (const model of MODELS) {
      const core = funded();
      core.execute({ type: 'buy', modelId: model.id, airportId: 'PEK' }, NOW);
      const plane = core.snapshot().fleet[1]!;
      expect(plane.allocation).toEqual({ passengers: 0, cargo: 0 });
      expect(aircraftSpecs(plane)).toMatchObject({ capacity: model.capacity, seats: 0, cargo: 0 });
      expect(validateSave(core.snapshot())).toEqual(core.snapshot());
    }
  });

  it('charges each new slot and pays only for real loaded orders', () => {
    const core = funded();
    core.execute({ type: 'buy', modelId: 'swift-m', airportId: 'PEK' }, NOW);
    const empty = core.snapshot(), planeId = empty.fleet[1]!.id;
    expect(cabinAllocationPrice({ passengers: 0, cargo: 0 }, { passengers: 2, cargo: 1 })).toBe(620);
    const emptyQuote = quote(empty, empty.fleet[1]!, 'PVG');
    expect(emptyQuote.revenue).toBe(0);
    core.execute({ type: 'allocate-cabin', planeId, passengers: 2, cargo: 1 }, NOW);
    expect(core.snapshot().credits).toBe(empty.credits - 620);
    core.execute({ type: 'load-destination', planeId, to: 'PVG' }, NOW);
    const loaded = core.snapshot(), fullQuote = quote(loaded, loaded.fleet[1]!, 'PVG');
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
      core.execute({ type: 'buy', modelId: model.id, airportId: 'PEK' }, NOW);
      const planeId = core.snapshot().fleet[1]!.id;
      const passengers = Math.ceil(model.capacity * 0.6), cargo = model.capacity - passengers;
      core.execute({ type: 'allocate-cabin', planeId, passengers, cargo }, NOW);
      core.execute({ type: 'load-destination', planeId, to: 'PVG' }, NOW);
      const loaded = core.snapshot();
      expect(loadSummary(loaded, planeId)).toEqual({ passengers, cargo });
      const economics = quote(loaded, loaded.fleet[1]!, 'PVG');
      expect(economics.revenue, model.id).toBeGreaterThan(economics.cost);
    }
  });

  it('rejects over-allocation, stranded loads, locked refits and tampered saves atomically', () => {
    const core = funded();
    core.execute({ type: 'buy', modelId: 'swift-m', airportId: 'PEK' }, NOW);
    const id = core.snapshot().fleet[1]!.id, before = core.snapshot();
    expect(() => core.execute({ type: 'allocate-cabin', planeId: id, passengers: 3, cargo: 1 }, NOW)).toThrow(/容量/);
    expect(core.snapshot()).toEqual(before);
    core.execute({ type: 'allocate-cabin', planeId: id, passengers: 2, cargo: 1 }, NOW);
    core.execute({ type: 'load-destination', planeId: id, to: 'PVG' }, NOW);
    const loaded = core.snapshot();
    expect(() => core.execute({ type: 'allocate-cabin', planeId: id, passengers: 0, cargo: 1 }, NOW)).toThrow(/卸下/);
    expect(core.snapshot()).toEqual(loaded);
    const tampered = structuredClone(loaded);
    tampered.fleet[1]!.allocation = { passengers: 3, cargo: 1 };
    expect(() => validateSave(tampered)).toThrow();
    const previous = structuredClone(loaded) as { version: number };
    previous.version = 10;
    expect(() => validateSave(previous)).toThrow(/版本/);
    core.execute({ type: 'dispatch', planeId: id, to: 'PVG', auto: false }, NOW);
    expect(() => core.execute({ type: 'allocate-cabin', planeId: id, passengers: 2, cargo: 0 }, NOW)).toThrow(/飞行/);
  });
});
