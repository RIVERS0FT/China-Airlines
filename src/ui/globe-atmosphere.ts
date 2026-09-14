import type { GraphicsContext } from 'pixi.js';

/** Rebuild the rim without connecting independent arcs to a previous path. */
export function drawGlobeAtmosphere(context: GraphicsContext, cx: number, cy: number, radius: number): void {
  context.clear().circle(cx, cy, radius).stroke({ color: 0x8ddbe1, width: 2, alpha: .72 });
  const lightRadius = radius - 3, lightStart = Math.PI * .7;
  // stroke() retains a path endpoint in PixiJS. Reset AND move to the arc start.
  context.beginPath().moveTo(cx + Math.cos(lightStart) * lightRadius, cy + Math.sin(lightStart) * lightRadius)
    .arc(cx, cy, lightRadius, lightStart, Math.PI * 1.55).stroke({ color: 0xd6f5e8, width: 4, alpha: .42 });
  const darkRadius = radius - 2, darkStart = -Math.PI * .3;
  context.beginPath().moveTo(cx + Math.cos(darkStart) * darkRadius, cy + Math.sin(darkStart) * darkRadius)
    .arc(cx, cy, darkRadius, darkStart, Math.PI * .48).stroke({ color: 0x0b2638, width: 4, alpha: .32 });
}
