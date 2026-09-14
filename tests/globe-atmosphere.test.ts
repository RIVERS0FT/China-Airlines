import { describe, expect, it } from 'vitest';
import { GraphicsContext, Polygon } from 'pixi.js';
import { drawGlobeAtmosphere } from '../src/ui/globe-atmosphere.js';

function arcPolygon(context: GraphicsContext, index: number): Polygon {
  const instruction = context.instructions[index]!;
  expect(instruction.action).toBe('stroke');
  if (instruction.action !== 'stroke') throw new Error('Expected a stroke');
  const shapes = instruction.data.path.shapePath.shapePrimitives;
  expect(shapes).toHaveLength(1);
  const shape = shapes[0]!.shape;
  expect(shape).toBeInstanceOf(Polygon);
  if (!(shape instanceof Polygon)) throw new Error('Expected an open arc polygon');
  return shape;
}

function expectRimOnly(context: GraphicsContext, cx: number, cy: number, radius: number) {
  expect(context.instructions).toHaveLength(3);
  for (const [index, inset, start, end, color, alpha] of [
    [1, 3, Math.PI * .7, Math.PI * 1.55, 0xd6f5e8, .42],
    [2, 2, -Math.PI * .3, Math.PI * .48, 0x0b2638, .32],
  ] as const) {
    const instruction = context.instructions[index]!;
    if (instruction.action !== 'stroke') throw new Error('Expected a stroke');
    expect(instruction.data.style).toMatchObject({ color, width: 4, alpha });
    expect(instruction.data.path.instructions.map(command => command.action)).toEqual(['moveTo', 'arc']);
    const { points } = arcPolygon(context, index), r = radius - inset;
    expect(points.length).toBeGreaterThan(4);
    expect(points[0]).toBeCloseTo(cx + Math.cos(start) * r, 6);
    expect(points[1]).toBeCloseTo(cy + Math.sin(start) * r, 6);
    expect(points.at(-2)).toBeCloseTo(cx + Math.cos(end) * r, 6);
    expect(points.at(-1)).toBeCloseTo(cy + Math.sin(end) * r, 6);
    for (let i = 0; i < points.length; i += 2) {
      expect(Math.hypot(points[i]! - cx, points[i + 1]! - cy)).toBeCloseTo(r, 6);
      if (i > 0) {
        // A retained origin or the other arc's endpoint would create a long chord.
        expect(Math.hypot(points[i]! - points[i - 2]!, points[i + 1]! - points[i - 1]!)).toBeLessThan(r * .2);
      }
    }
  }
}

describe('globe atmosphere paths', () => {
  it.each([
    { cx: 768, cy: 320, radius: 300 },
    { cx: 640, cy: 330, radius: 375 },
    { cx: 720, cy: 400, radius: 1800 },
  ])('keeps both arcs on their own circumference at radius $radius', ({ cx, cy, radius }) => {
    const context = new GraphicsContext();
    try {
      drawGlobeAtmosphere(context, cx, cy, radius);
      expectRimOnly(context, cx, cy, radius);
      const rim = context.instructions[0]!;
      if (rim.action !== 'stroke') throw new Error('Expected the globe rim');
      expect(rim.data.style).toMatchObject({ color: 0x8ddbe1, width: 2, alpha: .72 });
      expect(rim.data.path.shapePath.shapePrimitives[0]!.shape).toMatchObject({ x: cx, y: cy, radius });
    } finally { context.destroy(); }
  });

  it('discards previous endpoints and geometry when the camera resizes or zooms', () => {
    const context = new GraphicsContext();
    try {
      context.moveTo(-2000, -2000).lineTo(0, 0).stroke({ width: 4 });
      drawGlobeAtmosphere(context, 768, 320, 300);
      expectRimOnly(context, 768, 320, 300);
      drawGlobeAtmosphere(context, 640, 330, 375);
      expectRimOnly(context, 640, 330, 375);
    } finally { context.destroy(); }
  });

  it('reproduces the old origin-to-arc connector with the actual Pixi path builder', () => {
    const context = new GraphicsContext();
    try {
      context.circle(768, 320, 300).stroke({ width: 2 });
      context.arc(768, 320, 297, Math.PI * .7, Math.PI * 1.55).stroke({ width: 4 });
      const { points } = arcPolygon(context, 1);
      expect(Math.hypot(points[0]! - 768, points[1]! - 320)).toBeGreaterThan(600);
    } finally { context.destroy(); }
  });
});
