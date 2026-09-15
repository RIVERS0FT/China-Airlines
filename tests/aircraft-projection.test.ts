import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import layouts from '../src/ui/aircraft-layer-layouts.json';
import { aircraftArtBounds, aircraftRectStyle, fitAircraftArt } from '../src/ui/aircraft-projection.js';

const canvas = { width: 1536, height: 590 };
const viewports = [{ width: 1400, height: 500 }, { width: 900, height: 410 },
  { width: 667, height: 230 }, { width: 400, height: 600 }];

for (const [id, art] of Object.entries(layouts)) describe(id, () => {
  it.each(viewports)('fits all registered layers without stretching at $width × $height', viewport => {
    const fit = fitAircraftArt(viewport, canvas, art.nearBounds);
    expect(fit.width / canvas.width).toBeCloseTo(fit.height / canvas.height, 12);
    for (const rect of [{ x: 0, y: 0, ...canvas }, art.nearBounds, art.interior]) {
      const x = fit.x + rect.x * fit.scale, y = fit.y + rect.y * fit.scale;
      expect(x).toBeGreaterThanOrEqual(-1e-8); expect(y).toBeGreaterThanOrEqual(-1e-8);
      expect(x + rect.width * fit.scale).toBeLessThanOrEqual(viewport.width + 1e-8);
      expect(y + rect.height * fit.scale).toBeLessThanOrEqual(viewport.height + 1e-8);
    }
    const bounds = aircraftArtBounds(canvas, art.nearBounds);
    expect(fit.y + (bounds.y + bounds.height) * fit.scale).toBeCloseTo(viewport.height, 10);
    expect(fit.x + (bounds.x + bounds.width / 2) * fit.scale).toBeCloseTo(viewport.width / 2, 10);
    const doubled = fitAircraftArt({ width: viewport.width * 2, height: viewport.height * 2 }, canvas, art.nearBounds);
    for (const key of ['x', 'y', 'width', 'height', 'scale'] as const) expect(doubled[key]).toBeCloseTo(fit[key] * 2, 10);
  });
  it('keeps interior registration in the same original canvas', () => {
    const style = aircraftRectStyle(art.interior, canvas);
    expect(parseFloat(style.left) * canvas.width / 100).toBeCloseTo(art.interior.x, 10);
    expect(parseFloat(style.top) * canvas.height / 100).toBeCloseTo(art.interior.y, 10);
    expect(parseFloat(style.width) * canvas.width / 100).toBeCloseTo(art.interior.width, 10);
    expect(parseFloat(style.height) * canvas.height / 100).toBeCloseTo(art.interior.height, 10);
  });
  it('matches the existing PNG source dimensions before registration', () => {
    for (const [part, height] of [['cutaway', 590], ['near', 434]] as const) {
      const bytes = readFileSync(`public/art/aircraft-${id}-${part}-v4.png`);
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(bytes.readUInt32BE(16)).toBe(canvas.width);
      expect(bytes.readUInt32BE(20)).toBe(height);
    }
  });
});

it('handles unmeasured or temporarily hidden containers without NaN', () => {
  for (const viewport of [{ width: 0, height: 0 }, { width: NaN, height: -10 }]) {
    const fit = fitAircraftArt(viewport, canvas, layouts['starter-swift'].nearBounds);
    expect(fit.scale).toBe(0);
    expect(Object.values(fit).every(Number.isFinite)).toBe(true);
  }
});
it('rejects malformed source registration instead of silently distorting artwork', () => {
  expect(() => aircraftArtBounds(canvas, { x: NaN, y: 0, width: 1, height: 1 })).toThrow(RangeError);
  expect(() => aircraftArtBounds({ width: 0, height: 590 }, { x: 0, y: 0, width: 1, height: 1 })).toThrow(RangeError);
});
