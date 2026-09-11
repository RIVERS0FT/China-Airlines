import { describe, it, expect } from 'vitest';
import { mapLayout, MIN_MAP_SCALE } from '../src/ui/map-camera.js';

describe('readable map camera', () => {
  it('uses a centered overview when the full map fits at readable scale', () => {
    const view = mapLayout(1440, 670, { x: 810, y: 310 });
    expect(view).toEqual({ scale: 1, regional: false, x: 240, y: 20 });
  });
  it('focuses the selected city instead of shrinking labels on a short map', () => {
    const focus = { x: 810, y: 310 }, view = mapLayout(840, 100, focus);
    expect(view.regional).toBe(true);
    expect(view.scale).toBe(MIN_MAP_SCALE);
    expect(18 * view.scale).toBeGreaterThanOrEqual(13);
    expect(view.x + focus.x * view.scale).toBe(420);
    expect(view.y + focus.y * view.scale).toBe(50);
  });
  it('keeps distant western cities in the same reachable regional frame', () => {
    const focus = { x: 145, y: 130 }, view = mapLayout(664, 90, focus);
    expect(view.x + focus.x * view.scale).toBe(332);
    expect(view.y + focus.y * view.scale).toBe(45);
  });
});
