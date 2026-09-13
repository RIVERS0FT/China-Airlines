import { describe, expect, it } from 'vitest';
import { createUiPreferences, normalizeUiScale, UI_SCALE_KEY } from '../src/ui/ui-preferences.js';

 describe('local UI scale preference', () => {
  it.each([[.1, .75], [2, 1.5], [1.13, 1.15], [1.12, 1.1], [1, 1]])('bounds and rounds %s to %s', (value, expected) => {
    expect(normalizeUiScale(value)).toBe(expected);
  });
  it.each([null, undefined, '1.25', {}, [], NaN, Infinity])('defaults invalid data %s without affecting game state', value => {
    expect(normalizeUiScale(value)).toBe(1);
  });
  it('persists a standalone preference and restores it in a new session', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    const a = createUiPreferences(storage);
    expect(a.getState().uiScale).toBe(1);
    a.getState().setUiScale(1.25);
    expect([...data.keys()]).toEqual([UI_SCALE_KEY]);
    expect(createUiPreferences(storage).getState().uiScale).toBe(1.25);
    a.getState().setUiScale(1);
    expect(createUiPreferences(storage).getState().uiScale).toBe(1);
  });
  it('keeps the control usable when storage is blocked', () => {
    const store = createUiPreferences({ getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('quota'); } });
    expect(store.getState().uiScale).toBe(1);
    store.getState().setUiScale(1.5);
    expect(store.getState().uiScale).toBe(1.5);
    expect(store.getState().persisted).toBe(false);
  });
  it.each(['{broken', 'null', '"1.5"', '{}', '[]'])('safely handles corrupt stored data %s', raw => {
    const store = createUiPreferences({ getItem: () => raw, setItem: () => {} });
    expect(store.getState().uiScale).toBe(1);
  });
});
