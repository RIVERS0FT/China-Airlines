/** Keep city labels readable; short maps show a pannable region instead of a tiny overview. */
export const MIN_MAP_SCALE = 0.75;
export function mapLayout(width: number, height: number, focus: { x: number; y: number }) {
  const fit = Math.min(width / 1000, height / 670);
  const scale = Math.max(MIN_MAP_SCALE, fit);
  const regional = fit < MIN_MAP_SCALE;
  return {
    scale, regional,
    x: (width - (regional ? focus.x * 2 : 960) * scale) / 2,
    y: (height - (regional ? focus.y * 2 : 630) * scale) / 2,
  };
}
