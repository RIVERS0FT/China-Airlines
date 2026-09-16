import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const read = (path: string) => readFileSync(new URL(`../src/ui/${path}`, import.meta.url), 'utf8');

describe('shared decorative flight motion', () => {
  it('has one title/flight keyframe definition and one reduced-motion boundary', () => {
    const motion = read('flight-motion.css');
    expect(read('styles/index.ts')).toContain("import '../flight-motion.css'");
    expect(motion).toMatch(/\.start-aircraft,\s*\.is-flying \.airplane-display > svg/);
    expect(motion).toContain('6s ease-in-out infinite');
    expect(motion).toContain('@media(prefers-reduced-motion:reduce)');
    expect(motion).toContain('pointer-events:none');
    for (const old of ['scene.css', 'start-screen.css']) {
      expect(read(old)).not.toMatch(/@keyframes (start-aircraft-cruise|flight-aircraft-cruise|flight-cloud-drift)/);
    }
    expect(motion.match(/@keyframes start-aircraft-cruise/g)).toHaveLength(1);
  });
  it('keeps the actual aircraft sprite and never uses motion to settle a flight', () => {
    const scene = read('AviationScene.tsx');
    expect(scene).toContain('Boolean(plane?.flight)');
    expect(scene).toContain('href={artAsset(m!.art)}');
    expect(scene).not.toMatch(/onAnimationEnd|onTransitionEnd|controller\.command|setInterval/);
    expect(read('FlightSky.tsx')).not.toMatch(/controller|setInterval|requestAnimationFrame/);
  });
});
