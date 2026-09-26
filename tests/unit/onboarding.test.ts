import { describe, expect, it } from 'vitest';
import { GameCore, manifest, parseSave, validateSave } from '../../src/core/game.js';
import { guideStep } from '../../src/core/onboarding.js';

const NOW = 1_800_000_000_000;
const step = (core: GameCore, purchaseOpen = false, screen = 'airport') => {
  const state = core.snapshot();
  return guideStep(state, state.fleet[0], screen, 'PVG', purchaseOpen);
};
const restore = (core: GameCore) => new GameCore(core.snapshot().lastWallTime, parseSave(JSON.stringify(core.snapshot())));

describe('new-company guide follows committed gameplay', () => {
  it('saves an empty new fleet and refuses removed aircraft or an erased established fleet', () => {
    const core = new GameCore(NOW), initial = core.snapshot();
    expect(initial).toMatchObject({ version: 13, credits: 18000, fleet: [], fleetPeak: 0, airports: [{ id: 'PEK', level: 1 }], tutorial: 'active' });
    expect(restore(core).snapshot()).toEqual(initial);
    core.execute({ type: 'buy', modelId: 'diamond-da40', airportId: 'PEK', passengers: 1, cargo: 0 }, NOW);
    const bought = core.snapshot(), erased = structuredClone(bought);
    erased.fleet = [];
    expect(() => validateSave(erased)).toThrow();
    bought.fleet[0]!.modelId = 'starter-swift';
    expect(() => validateSave(bought)).toThrow();
    expect(() => validateSave({ ...initial, version: 12 })).toThrow(/版本/);
  });

  it.each([{ passengers: 1, cargo: 0 }, { passengers: 0, cargo: 1 }])('buys and configures one slot atomically, restores every step, and completes a real flight (%j)', allocation => {
    let core = new GameCore(NOW);
    expect(step(core).id).toBe('unlock');
    core.execute({ type: 'unlock', airportId: 'PVG' }, NOW);
    core = restore(core);
    expect(core.snapshot().credits).toBe(14000);
    expect(step(core).id).toBe('buy');
    const before = core.snapshot();
    expect(step(core, true).id).toBe('configure');
    expect(step(core, false).id).toBe('buy');
    expect(core.snapshot()).toEqual(before);
    expect(() => core.execute({ type: 'buy', modelId: 'diamond-da40', airportId: 'PEK', passengers: 0, cargo: 0 }, NOW)).toThrow();
    expect(core.snapshot()).toEqual(before);
    core.execute({ type: 'buy', modelId: 'diamond-da40', airportId: 'PEK', ...allocation }, NOW);
    core = restore(core);
    expect(core.snapshot().credits).toBe(11700);
    expect(core.snapshot().fleet[0]!.allocation).toEqual(allocation);
    expect(step(core).id).toBe('load');
    const offered = core.snapshot().orders;
    core.execute({ type: 'load-destination', planeId: 'AC0001', to: 'PVG' }, NOW);
    core = restore(core);
    const loaded = manifest(core.snapshot(), 'AC0001');
    expect(loaded).toHaveLength(1);
    expect(offered.some(order => order.id === loaded[0]!.id)).toBe(true);
    expect(step(core).id).toBe('map');
    expect(step(core, false, 'map').id).toBe('dispatch');
    core.execute({ type: 'dispatch', planeId: 'AC0001', to: 'PVG', auto: false }, NOW);
    core = restore(core);
    expect(step(core).id).toBe('flight');
    const arrival = NOW + core.snapshot().fleet[0]!.flight!.arriveAt * 1000;
    core.tick(arrival);
    core = restore(core);
    expect(step(core).id).toBe('reward');
    expect(core.snapshot().credits).toBe(11930);
    core.execute({ type: 'claim', taskId: 'first-flight' }, arrival);
    core = restore(core);
    expect(step(core).id).toBe('done');
    expect(core.snapshot().credits).toBe(13430);
    core.execute({ type: 'tutorial', action: 'finish' }, arrival);
    expect(restore(core).snapshot().tutorial).toBe('completed');
    const finished = core.snapshot();
    expect(() => core.execute({ type: 'claim', taskId: 'first-flight' }, arrival)).toThrow();
    expect(core.snapshot()).toEqual(finished);
  });

  it('skips and resumes with no money, aircraft, order or statistics changes; cannot finish early', () => {
    const core = new GameCore(NOW), before = core.snapshot();
    expect(() => core.execute({ type: 'tutorial', action: 'finish' }, NOW)).toThrow();
    expect(core.snapshot()).toEqual(before);
    for (const action of ['skip', 'start'] as const) {
      core.execute({ type: 'tutorial', action }, NOW);
      const saved = restore(core).snapshot();
      expect(saved.tutorial).toBe(action === 'skip' ? 'skipped' : 'active');
      for (const field of ['credits', 'fleet', 'airports', 'orders', 'stats', 'career'] as const) expect(saved[field]).toEqual(before[field]);
      expect(step(core).id).toBe('unlock');
    }
  });
});
