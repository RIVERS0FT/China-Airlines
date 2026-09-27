import { describe, expect, it } from 'vitest';
import { canPlaceMapLabel, clientBoxToMap } from '../../src/ui/map-label-layout.js';
import { retargetMapLabel, sampleMapLabel } from '../../src/ui/map-label-motion.js';

describe('floating map overlays', () => {
  it.each([.5, 1, 1.25, 1.5])('converts actual button bounds at display scale %s', scale => {
    const viewport = { left: 10, top: 50, width: 1000 * scale, height: 600 * scale };
    const button = { left: 10 + 12 * scale, top: 50 + 510 * scale, width: 84 * scale, height: 78 * scale };
    expect(clientBoxToMap(button, viewport, 1000, 600)).toEqual({ x: 12, y: 510, w: 84, h: 78 });
  });
  it('keeps labels in the bottom band to the right of real buttons', () => {
    const buttons = [{ x: 12, y: 510, w: 544, h: 78 }];
    expect(canPlaceMapLabel({ x: 580, y: 560, w: 70, h: 35 }, 1000, 600, buttons, [])).toBe(true);
    expect(canPlaceMapLabel({ x: 100, y: 560, w: 70, h: 35 }, 1000, 600, buttons, [])).toBe(false);
  });
  it('retains inter-label spacing, button clearance and viewport clipping', () => {
    const box = { x: 600, y: 560, w: 80, h: 35 };
    expect(canPlaceMapLabel(box, 1000, 600, [], [{ x: 682, y: 560, w: 70, h: 35 }])).toBe(false);
    expect(canPlaceMapLabel(box, 1000, 600, [{ x: 682, y: 560, w: 70, h: 35 }], [])).toBe(false);
    expect(canPlaceMapLabel({ ...box, y: 561 }, 1000, 600, [], [])).toBe(false);
    expect(canPlaceMapLabel({ ...box, x: 921 }, 1000, 600, [], [])).toBe(false);
  });
});

describe('map label layout-offset interpolation relative to the airport point', () => {
  const start = { x: 100, y: 60, w: 70, h: 35 }, target = { x: 180, y: 100, w: 70, h: 35 };

  it('places a newly visible label directly at its target', () => {
    const motion = retargetMapLabel(undefined, target, 1000);
    expect(sampleMapLabel(motion, 1000)).toEqual({ box: target, active: false });
    expect(sampleMapLabel(motion, 1050)).toEqual({ box: target, active: false });
  });

  it('moves a changed layout offset through bounded intermediate positions and finishes after 160ms', () => {
    const initial = retargetMapLabel(undefined, start, 0);
    const motion = retargetMapLabel(initial, target, 1000);
    for (const [elapsed, progress] of [[0, 0], [40, .4375], [80, .75], [160, 1], [1000, 1]]) {
      const sampled = sampleMapLabel(motion, 1000 + elapsed!);
      expect(sampled.box.x).toBeCloseTo(start.x + (target.x - start.x) * progress!);
      expect(sampled.box.y).toBeCloseTo(start.y + (target.y - start.y) * progress!);
      expect(sampled.box.w).toBe(target.w); expect(sampled.box.h).toBe(target.h);
      expect(sampled.active).toBe(elapsed! < 160);
    }
  });

  it('continues a changing target from the currently displayed offset without a jump', () => {
    const motion = retargetMapLabel(retargetMapLabel(undefined, start, 0), target, 1000);
    const current = sampleMapLabel(motion, 1080).box;
    const next = retargetMapLabel(motion, { ...target, x: 70, y: 20 }, 1080);
    expect(sampleMapLabel(next, 1080).box).toEqual(current);
    const middle = sampleMapLabel(next, 1160);
    expect(middle.box.x).toBeGreaterThan(70); expect(middle.box.x).toBeLessThan(current.x);
    expect(middle.box.y).toBeGreaterThan(20); expect(middle.box.y).toBeLessThan(current.y);
    expect(sampleMapLabel(next, 1240)).toEqual({ box: { ...target, x: 70, y: 20 }, active: false });
  });

  it('does not restart an animation when the layout target has not changed', () => {
    const motion = retargetMapLabel(retargetMapLabel(undefined, start, 0), target, 1000);
    const same = retargetMapLabel(motion, { ...target }, 1080);
    expect(same.startedAt).toBe(1000);
    expect(sampleMapLabel(same, 1160)).toEqual({ box: target, active: false });
  });

  it('updates text bounds immediately while interpolating only the layout offset', () => {
    const resized = { ...target, w: 110, h: 57 };
    const motion = retargetMapLabel(retargetMapLabel(undefined, start, 0), resized, 1000);
    expect(sampleMapLabel(motion, 1000).box).toEqual({ ...start, w: 110, h: 57 });
    expect(sampleMapLabel(motion, 1080).box).toMatchObject({ w: 110, h: 57 });
    expect(sampleMapLabel(motion, 1160)).toEqual({ box: resized, active: false });
  });

  it('snaps immediately when reduced motion is enabled, including during an existing transition', () => {
    const initial = retargetMapLabel(undefined, start, 0);
    expect(sampleMapLabel(retargetMapLabel(initial, target, 1000, true), 1000)).toEqual({ box: target, active: false });
    const running = retargetMapLabel(initial, target, 1000);
    expect(sampleMapLabel(running, 1040, true)).toEqual({ box: target, active: false });
  });

  it('does not continue an old transition when a hidden label reappears', () => {
    const old = retargetMapLabel(retargetMapLabel(undefined, start, 0), target, 1000);
    expect(sampleMapLabel(old, 1040).active).toBe(true);
    // The renderer drops the previous motion as soon as a label is hidden.
    const reappeared = { x: 30, y: 200, w: 70, h: 35 };
    expect(sampleMapLabel(retargetMapLabel(undefined, reappeared, 1050), 1050)).toEqual({ box: reappeared, active: false });
  });
});
