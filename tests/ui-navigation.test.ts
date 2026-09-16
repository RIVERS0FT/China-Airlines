import { describe, expect, it } from 'vitest';
import { initialNavigation, isWorkPage, navigationReducer, WORK_PAGES } from '../src/ui/shell/navigation.js';

describe('UI navigation', () => {
  it('starts from the existing scene preference and rejects unrelated values', () => {
    expect(initialNavigation('airport')).toEqual({ page: 'airport', scene: 'airport' });
    for (const value of [null, 'map', 'career', 'unknown']) expect(initialNavigation(value)).toEqual({ page: 'map', scene: 'map' });
  });
  it('opens all workspaces without overwriting their return scene', () => {
    for (const scene of ['airport', 'map', 'dispatch'] as const) {
      let state = { page: scene, scene } as ReturnType<typeof initialNavigation>;
      for (const page of WORK_PAGES) {
        const before = state;
        state = navigationReducer(state, { type: 'open', page });
        expect(state).toEqual({ page, scene });
        expect(before.scene).toBe(scene);
        expect(state).not.toBe(before);
      }
      expect(navigationReducer(state, { type: 'return' })).toEqual({ page: scene, scene });
    }
  });
  it('replaces rather than stacks active pages', () => {
    const state = navigationReducer({ page: 'fleet', scene: 'map' }, { type: 'open', page: 'airport' });
    expect(state).toEqual({ page: 'airport', scene: 'airport' });
    expect(isWorkPage('dispatch')).toBe(false);
    expect(isWorkPage('organization')).toBe(true);
  });
});
