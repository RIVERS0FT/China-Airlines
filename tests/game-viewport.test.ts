import { describe, expect, it } from 'vitest';
import postcss from 'postcss';
import { gameViewportCss, logicalViewportUnits } from '../scripts/game-viewport-css.js';
import { logicalPoint, viewportLayout } from '../src/ui/game-viewport.js';

const file = '/project/src/ui/scene.css';
describe('aspect-ratio-only game viewport', () => {
  it.each([[640, 360], [800, 450], [844, 390], [667, 375], [1024, 768], [390, 844]])(
    'keeps the exact same design layout at %i x %i and every proportional size', (width, height) => {
      const a = viewportLayout(width, height);
      for (const factor of [.5, 1.5, 2, 3]) {
        const b = viewportLayout(width * factor, height * factor);
        expect(b.width).toBeCloseTo(a.width, 10);
        expect(b.height).toBeCloseTo(a.height, 10);
        expect(b.scale).toBeCloseTo(a.scale * factor, 10);
      }
      expect(a.width * a.scale).toBeCloseTo(width, 10);
      expect(a.height * a.scale).toBeCloseTo(height, 10);
    });
  it.each([.75, 1, 1.25, 1.5])('preserves aspect-only layout and full coverage at UI scale %s', uiScale => {
    const small = viewportLayout(640, 360, uiScale), large = viewportLayout(1920, 1080, uiScale);
    expect(small.width).toBeCloseTo(large.width, 10);
    expect(small.height).toBeCloseTo(large.height, 10);
    expect(small.width * small.scale).toBeCloseTo(640, 10);
    expect(small.height * small.scale).toBeCloseTo(360, 10);
    expect(small.scale).toBeCloseTo(.4 * uiScale, 10);
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid UI scale %s', value => {
    expect(() => viewportLayout(1600, 900, value)).toThrow(RangeError);
  });
  it('preserves the 1440 x 900 desktop design and extends wider viewports', () => {
    expect(viewportLayout(1440, 900)).toEqual({ width: 1440, height: 900, scale: 1 });
    expect(viewportLayout(1920, 1080).width).toBe(1600);
    expect(viewportLayout(2520, 1080).width).toBe(2100);
  });
  it.each([0, -1, NaN, Infinity])('rejects an invalid viewport dimension %s', n => {
    expect(() => viewportLayout(n, 900)).toThrow(RangeError);
    expect(() => viewportLayout(900, n)).toThrow(RangeError);
  });
  it.each([.25, .5, 1, 2, 3])('maps pointer, drag and scroll coordinates at scale %s', scale => {
    const bounds = { left: 15, top: 30, width: 1600 * scale, height: 800 * scale };
    expect(logicalPoint(15 + 700 * scale, 30 + 220 * scale, bounds, 1600, 800))
      .toEqual({ x: 700, y: 220 });
  });
  it('does not produce NaN for a hidden canvas', () => {
    expect(logicalPoint(0, 0, { left: 0, top: 0, width: 0, height: 0 }, 100, 100)).toEqual({ x: 0, y: 0 });
  });
});

describe('design-space CSS', () => {
  it('converts viewport units inside clamp/min/calc without changing pixels, strings or URLs', () => {
    expect(logicalViewportUnits('clamp(46px,12.3dvh,48px) min(760px,94vw) -2vmin'))
      .toBe('clamp(46px,calc(12.3 * var(--game-vh)),48px) min(760px,calc(94 * var(--game-vw))) calc(-2 * var(--game-vmin))');
    expect(logicalViewportUnits('"100vh" url("/image-100vw.png") 90svh 2lvw'))
      .toBe('"100vh" url("/image-100vw.png") calc(90 * var(--game-vh)) calc(2 * var(--game-vw))');
  });
  it('converts legacy size breakpoints, including portrait, but preserves motion preferences', async () => {
    const css = '@media(max-height:600px) and (orientation:landscape){.a{height:100dvh}}' +
      '@media(orientation:portrait) and (max-width:900px){.rotate-screen{display:flex}}' +
      '@media(prefers-reduced-motion:reduce){.a{transition:none}}';
    const result = await postcss([gameViewportCss()]).process(css, { from: file });
    expect(result.css).toContain('@container game-viewport (max-height:600px)');
    expect(result.css).toContain('@container game-viewport (orientation:portrait)');
    expect(result.css).toContain('height:calc(100 * var(--game-vh))');
    expect(result.css).toContain('@media(prefers-reduced-motion:reduce)');
  });
  it.each(['/project/src/ui/game-viewport.css', '/project/node_modules/library/style.css'])(
    'leaves the real viewport shell and vendor styles untouched: %s', async from => {
      const css = '@media(max-width:600px){.a{height:100dvh}}';
      expect((await postcss([gameViewportCss()]).process(css, { from })).css).toBe(css);
    });
  it('rejects mixed device/size queries rather than silently restoring device-dependent layout', async () => {
    await expect(postcss([gameViewportCss()]).process(
      '@media(max-width:600px) and (prefers-reduced-motion:reduce){.a{color:red}}', { from: file }))
      .rejects.toThrow('Nest device-preference');
  });
});
