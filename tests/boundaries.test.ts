import { describe, expect, it } from 'vitest';
import { GameCore, validateSave } from '../src/core/game.js';

const NOW = 1_800_000_000_000;

function routeWithTwoPlanes(): GameCore {
  const core = new GameCore(NOW);
  core.execute({ type: 'buy', modelId: 'lark', airportId: 'PEK' }, NOW);
  core.execute({ type: 'route', from: 'PEK', to: 'PVG' }, NOW);
  for (const plane of core.snapshot().fleet) {
    core.execute({ type: 'dispatch', planeId: plane.id, to: 'PVG', auto: true }, NOW);
  }
  return core;
}

describe('clock boundaries', () => {
  it.each([-1, NaN, Infinity, 8.64e15 + 1])('rejects invalid initial time %s', now => {
    expect(() => new GameCore(now)).toThrow('无效的系统时间');
  });

  it.each([-1, NaN, Infinity, 8.64e15 + 1])('rejects invalid ticks without changing state: %s', now => {
    const core = routeWithTwoPlanes();
    const before = core.snapshot();
    expect(() => core.tick(now)).toThrow('无效的系统时间');
    expect(core.snapshot()).toEqual(before);
  });
});

describe('consistent flight state', () => {
  it('rejects departure before ground turnaround is complete', () => {
    const state = routeWithTwoPlanes().snapshot();
    state.fleet[0]!.readyAt = state.fleet[0]!.flight!.departAt + 1;
    expect(() => validateSave(state)).toThrow();
  });

  it('settles simultaneous flights once and preserves deterministic order', () => {
    const incremental = routeWithTwoPlanes();
    const batch = routeWithTwoPlanes();
    for (let seconds = 1; seconds <= 3600; seconds++) incremental.tick(NOW + seconds * 1000);
    batch.tick(NOW + 3_600_000);
    expect(batch.snapshot()).toEqual(incremental.snapshot());
    expect(batch.snapshot().stats.flights).toBeGreaterThan(50);
    const saved = batch.snapshot();
    const reloaded = new GameCore(NOW + 3_600_000, saved);
    expect(reloaded.tick(NOW + 3_600_000).flights).toBe(0);
    expect(reloaded.snapshot()).toEqual(saved);
    expect(() => validateSave(saved)).not.toThrow();
  });
});
