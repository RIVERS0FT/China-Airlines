import { artAsset } from './art-assets.js';

/** The v3 cushion's width edge runs (385,45), its depth edge (148,-79).
 * Keep this shallow plane in logical pixels: stretching a floor photograph to
 * each deck's aspect ratio would change those slopes relative to the chair.
 * Distant vanishing points match the sprites' nearly parallel projection. */
export function floorPoint(u: number, v: number, width: number, height: number) {
  const depth = 1 + u / 30000 + v / 24000;
  return { x: width / 2 + (u + v) / depth,
    y: height / 2 + (u * 45 / 385 - v * 79 / 148) / depth };
}

export function CabinFloor({ kind, width, height }: { kind: 'passengers' | 'cargo'; width: number; height: number }) {
  const cargo = kind === 'cargo';
  const line = (u1: number, v1: number, u2: number, v2: number) => {
    const a = floorPoint(u1, v1, width, height), b = floorPoint(u2, v2, width, height);
    return `M${a.x},${a.y}L${b.x},${b.y}`;
  };
  const reach = width + height * 3 + 300;
  const depthLines = Array.from({ length: Math.ceil(reach * 2 / 132) + 1 }, (_, i) => line(i * 132 - reach, -reach, i * 132 - reach, reach)).join('');
  const crossLines = Array.from({ length: Math.ceil(reach * 2 / 90) + 1 }, (_, i) => line(-reach, i * 90 - reach, reach, i * 90 - reach)).join('');
  return <svg className="cabin-floor-plane" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <rect width={width} height={height} fill={cargo ? '#928c7f' : '#999184'}/>
    {/* Sample only unmarked floor material; the old baked rails and their
        central vanishing point must not survive beneath the new projection. */}
    <svg width={width} height={height} viewBox={cargo ? '85 212 110 25' : '90 222 1250 20'} preserveAspectRatio="none" opacity=".55">
      <image href={artAsset(`cabin-interior-${kind}-v1.png`)} width={cargo ? 1452 : 1445} height={cargo ? 258 : 251}/>
    </svg>
    <path d={crossLines} fill="none" stroke={cargo ? '#655f55' : '#756e62'} strokeWidth={cargo ? 1 : .65} opacity={cargo ? .45 : .28}/>
    {cargo && <path d={depthLines} fill="none" stroke="#c6c1ae" strokeWidth="7" opacity=".8"/>}
    <path d={depthLines} fill="none" stroke={cargo ? '#686960' : '#776e61'} strokeWidth={cargo ? 4 : .8} opacity={cargo ? .85 : .32}/>
    {cargo && <path d={depthLines} fill="none" stroke="#3f4540" strokeWidth="2.5" strokeDasharray="3 10" strokeLinecap="round"/>}
  </svg>;
}
