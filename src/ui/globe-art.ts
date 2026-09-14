export type MeshEdge = readonly [number, number];
export interface ArtVector { x: number; y: number; z: number }

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Returns only the outer edges of a triangle mesh, excluding shared diagonals. */
export function boundaryEdges(faces: readonly (readonly number[])[]): MeshEdge[] {
  const edges = new Map<string, { edge: MeshEdge; count: number }>();
  for (const face of faces) {
    for (let i = 0; i < face.length; i++) {
      const from = face[i]!, to = face[(i + 1) % face.length]!;
      const edge: MeshEdge = from < to ? [from, to] : [to, from];
      const key = `${edge[0]}:${edge[1]}`, current = edges.get(key);
      if (current) current.count += 1;
      else edges.set(key, { edge, count: 1 });
    }
  }
  return [...edges.values()].filter(item => item.count === 1).map(item => item.edge);
}

export function mixColor(from: number, to: number, amount: number) {
  const t = clamp01(amount), channel = (shift: number) =>
    Math.round(((from >> shift) & 0xff) * (1 - t) + ((to >> shift) & 0xff) * t);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Deep teal oceans keep route and airport labels readable at every zoom level. */
export const oceanTone = (light: number) => mixColor(0x12384f, 0x287f96, clamp01(light));

/** Land uses a restrained forest-to-sunlit-olive ramp instead of flat green facets. */
export function terrainTone(light: number) {
  const t = clamp01(light);
  return t < .68 ? mixColor(0x294f4d, 0x78a66d, t / .68) : mixColor(0x78a66d, 0xc1c982, (t - .68) / .32);
}

/** Keeps the geographic great-circle direction while lifting its altitude on a parabola. */
export function parabolicLift(point: ArtVector, progress: number, height = .1): ArtVector {
  const t = clamp01(progress), scale = 1 + Math.max(0, height) * 4 * t * (1 - t);
  return { ...point, x: point.x * scale, y: point.y * scale, z: point.z * scale };
}

export function parabolicRoute(points: readonly ArtVector[], height = .1): ArtVector[] {
  const last = Math.max(1, points.length - 1);
  return points.map((point, index) => parabolicLift(point, index / last, height));
}

/** The source aircraft art faces left; mirror eastbound flights and rotate along the screen tangent. */
export function aircraftPose(dx: number, dy: number) {
  const heading = Math.atan2(dy, dx), flipX = dx >= 0;
  let rotation = flipX ? heading : heading - Math.PI;
  if (rotation <= -Math.PI) rotation += Math.PI * 2;
  if (rotation > Math.PI) rotation -= Math.PI * 2;
  return { flipX, rotation };
}
