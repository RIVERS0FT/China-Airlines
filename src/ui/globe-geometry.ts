/** Pure spherical geometry, independent of rendering, clocks and economic state. */
export interface GeoPoint { lat: number; lon: number }
export interface Vec3 { x: number; y: number; z: number }
export interface GlobeCamera extends GeoPoint { cx: number; cy: number; radius: number; scale: number }
const RAD = Math.PI / 180;
export const wrapLongitude = (lon: number) => ((lon + 180) % 360 + 360) % 360 - 180;
export function globeCamera(width: number, height: number, focus: GeoPoint, scale = 1): GlobeCamera {
  return { lat: Math.max(-90, Math.min(90, focus.lat)), lon: wrapLongitude(focus.lon),
    cx: width / 2, cy: height / 2 - Math.min(8, height / 20),
    radius: Math.max(20, Math.min(width * .43, (height - 28) / 2)), scale: Math.max(1, Math.min(6, scale)) };
}
export function toVector(p: GeoPoint): Vec3 {
  const lat = p.lat * RAD, lon = p.lon * RAD;
  return { x: Math.cos(lat) * Math.cos(lon), y: Math.cos(lat) * Math.sin(lon), z: Math.sin(lat) };
}
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const normalize = (v: Vec3): Vec3 => { const n = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / n, y: v.y / n, z: v.z / n }; };
export function fromVector(v: Vec3): GeoPoint {
  return { lat: Math.asin(Math.max(-1, Math.min(1, v.z))) / RAD, lon: wrapLongitude(Math.atan2(v.y, v.x) / RAD) };
}
/** Stable at coincident points, the dateline and the antipodal degeneracy. */
export function greatCircle(a: Vec3, b: Vec3, progress: number): Vec3 {
  const t = Math.max(0, Math.min(1, progress));
  if (t === 0) return a; if (t === 1) return b;
  const d = Math.max(-1, Math.min(1, dot(a, b))), angle = Math.acos(d);
  if (angle < 1e-8) return a;
  let tangent = { x: b.x - d * a.x, y: b.y - d * a.y, z: b.z - d * a.z };
  if (Math.hypot(tangent.x, tangent.y, tangent.z) < 1e-8) {
    // A deterministic perpendicular defines one of the equally short antipodal arcs.
    tangent = Math.abs(a.z) < .9 ? { x: -a.y, y: a.x, z: 0 } : { x: a.z, y: 0, z: -a.x };
  }
  tangent = normalize(tangent);
  const c = Math.cos(angle * t), s = Math.sin(angle * t);
  return normalize({ x: a.x * c + tangent.x * s, y: a.y * c + tangent.y * s, z: a.z * c + tangent.z * s });
}
export function arcPoints(a: GeoPoint, b: GeoPoint): Vec3[] {
  const u = toVector(a), v = toVector(b), steps = Math.max(16, Math.ceil(Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) / RAD / 2));
  return Array.from({ length: steps + 1 }, (_, i) => greatCircle(u, v, i / steps));
}
export function viewVector(v: Vec3, camera: GeoPoint): Vec3 {
  const lon = camera.lon * RAD, lat = camera.lat * RAD, c = Math.cos(lon), s = Math.sin(lon);
  const horizontal = c * v.x + s * v.y;
  return { x: -s * v.x + c * v.y, y: -Math.sin(lat) * horizontal + Math.cos(lat) * v.z,
    z: Math.cos(lat) * horizontal + Math.sin(lat) * v.z };
}
export function screenPoint(v: Vec3, camera: GlobeCamera) {
  const r = camera.radius * camera.scale;
  return { x: camera.cx + v.x * r, y: camera.cy - v.y * r, depth: v.z, visible: v.z >= 0 };
}
export const projectGeo = (p: GeoPoint, camera: GlobeCamera) => screenPoint(viewVector(toVector(p), camera), camera);
function horizon(a: Vec3, b: Vec3): Vec3 {
  const t = a.z / (a.z - b.z);
  return normalize({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: 0 });
}
/** Never draw a chord through the globe to join hidden path segments. */
export function frontSegment(a: Vec3, b: Vec3): [Vec3, Vec3] | null {
  if (a.z < 0 && b.z < 0) return null;
  return [a.z < 0 ? horizon(a, b) : a, b.z < 0 ? horizon(a, b) : b];
}
/** Land is a mesh of small triangles, so horizon clipping stays convex. */
export function frontPolygon(points: Vec3[]): Vec3[] {
  const result: Vec3[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!;
    if (a.z >= 0) result.push(a);
    if ((a.z < 0) !== (b.z < 0)) result.push(horizon(a, b));
  }
  return result;
}
/** True small circle on the sphere, using the same 6371 km Earth radius as core distance. */
export function rangePoints(origin: GeoPoint, km: number): Vec3[] {
  const v = toVector(origin), lon = origin.lon * RAD, lat = origin.lat * RAD;
  const east = { x: -Math.sin(lon), y: Math.cos(lon), z: 0 };
  const north = { x: -Math.sin(lat) * Math.cos(lon), y: -Math.sin(lat) * Math.sin(lon), z: Math.cos(lat) };
  const angle = Math.min(Math.PI, Math.max(0, km / 6371)), c = Math.cos(angle), s = Math.sin(angle);
  return Array.from({ length: 145 }, (_, i) => {
    const bearing = i / 144 * Math.PI * 2, n = Math.cos(bearing) * s, e = Math.sin(bearing) * s;
    return { x: v.x * c + north.x * n + east.x * e, y: v.y * c + north.y * n + east.y * e, z: v.z * c + north.z * n };
  });
}
