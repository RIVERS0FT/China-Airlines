import { describe, expect, it } from 'vitest';
import { floorPoint } from '../src/ui/CabinFloor.js';

describe('floor camera shared with the seat cushion', () => {
  it('keeps both cushion-edge directions when the deck aspect ratio changes', () => {
    for (const [width, height] of [[180, 50], [480, 80], [1000, 70]]) {
      const origin = floorPoint(0, 0, width!, height!);
      const wide = floorPoint(100, 0, width!, height!);
      const deep = floorPoint(0, 100, width!, height!);
      expect((wide.y - origin.y) / (wide.x - origin.x)).toBeCloseTo(45 / 385);
      expect((deep.y - origin.y) / (deep.x - origin.x)).toBeCloseTo(-79 / 148);
    }
  });
  it('makes separated depth rails converge to a shared distant vanishing point', () => {
    const width = 600, height = 80;
    const vanishing = { x: width / 2 + 24000, y: height / 2 - 24000 * 79 / 148 };
    for (const u of [-600, 0, 600]) {
      const a = floorPoint(u, 0, width, height), b = floorPoint(u, 100, width, height);
      const cross = (b.x - a.x) * (vanishing.y - a.y) - (b.y - a.y) * (vanishing.x - a.x);
      expect(cross).toBeCloseTo(0, 6);
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(0);
    }
  });
});
