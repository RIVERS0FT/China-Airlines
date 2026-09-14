import { describe, expect, it } from 'vitest';
import { canPlaceMapLabel, clientBoxToMap } from '../src/ui/map-label-layout.js';

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
