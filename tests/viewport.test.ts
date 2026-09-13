import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { clientToLogical, normalizeUiScale, parseUiScale, viewportLayout } from '../src/ui/viewport.js';
const require = createRequire(import.meta.url);
const postcss = require('postcss');
const viewportCss = require('../scripts/viewport-css.cjs');

describe('resolution-independent UI', () => {
  for (const ratio of [16 / 9, 19.5 / 9, 4 / 3, 16 / 10, 9 / 16]) {
    for (const scale of [75, 100, 125, 150]) {
      it(`keeps logical layout at aspect ${ratio}, UI ${scale}%`, () => {
        const small = viewportLayout(360 * ratio, 360, scale), large = viewportLayout(1080 * ratio, 1080, scale);
        expect(small.width).toBeCloseTo(large.width, 8); expect(small.height).toBeCloseTo(large.height, 8);
        expect(large.scale).toBeCloseTo(small.scale * 3, 8);
        expect(small.width * small.scale).toBeCloseTo(360 * ratio, 8);
        expect(small.height * small.scale).toBeCloseTo(360, 8);
      });
    }
  }
  it('bounds and validates stored preferences', () => {
    for (const invalid of [NaN, Infinity, undefined, null, '125']) expect(normalizeUiScale(invalid)).toBe(100);
    for (const invalid of [null, '', 'NaN', 'Infinity', 'true', '{}', '-1']) expect(parseUiScale(invalid)).toBe(100);
    expect(normalizeUiScale(1)).toBe(75); expect(normalizeUiScale(900)).toBe(150);
    expect(normalizeUiScale(127)).toBe(125); expect(parseUiScale('125')).toBe(125);
    expect(viewportLayout(0, NaN)).toEqual({ width:1280, height:720, scale:1 });
  });
  it('converts mouse and touch positions through non-unit scales and viewport offsets', () => {
    for (const factor of [.5, 1, 1.25, 2.5]) {
      const result = clientToLogical(20 + 300 * factor, 30 + 200 * factor, {left:20, top:30, width:1000 * factor, height:600 * factor}, 1000, 600);
      expect(result.x).toBeCloseTo(300); expect(result.y).toBeCloseTo(200);
    }
  });
  it('compiles size queries and viewport units against the logical canvas only', async () => {
    const css = '@media(max-width:950px) and (orientation:landscape){.x{height:100dvh;width:min(94vw,800px)}} @media(prefers-reduced-motion:reduce){.x{transition:none}}';
    const result = await postcss([viewportCss()]).process(css, { from:'/src/ui/scene.css' });
    expect(result.css).toContain('@container game-viewport (max-width:950px)');
    expect(result.css).toContain('var(--game-vh) * 100'); expect(result.css).toContain('var(--game-vw) * 94');
    expect(result.css).toContain('@media(prefers-reduced-motion:reduce)');
    expect((await postcss([viewportCss()]).process(css, { from:'/src/ui/viewport.css' })).css).toBe(css);
  });
});
