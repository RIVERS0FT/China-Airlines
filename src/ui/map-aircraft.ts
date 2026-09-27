import { AIRPORTS } from '../core/catalog.js';
import type { Plane } from '../core/game.js';
import { dot, greatCircle, screenPoint, toVector, viewVector, type GlobeCamera, type Vec3 } from './globe-geometry.js';

export const MAP_AIRCRAFT_ART = 'map-aircraft-topdown-v1.png';
const geography = new Map(AIRPORTS.map(airport => [airport.id, toVector(airport)]));

/** The route and its aircraft share this unit sphere; visual motion never changes flight state. */
export function aircraftSurfacePoint(plane: Plane, time: number): Vec3 {
  const flight = plane.flight;
  if (!flight) return geography.get(plane.airportId)!;
  return greatCircle(geography.get(flight.from)!, geography.get(flight.to)!,
    (time - flight.departAt) / Math.max(1, flight.arriveAt - flight.departAt));
}

export function shouldShowMapAircraft(plane: Plane, currentId: string | undefined, showOthers: boolean): boolean {
  return Boolean(plane.flight) && (plane.id === currentId || showOthers);
}

const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/** Project the image's right and forward axes from the local tangent plane, including foreshortening. */
export function projectMapAircraft(plane: Plane, time: number, camera: GlobeCamera) {
  const normal = aircraftSurfacePoint(plane, time), point = screenPoint(viewVector(normal, camera), camera);
  // North is a deterministic fallback for grounded/coincident routes; at a pole use the X axis.
  let forward: Vec3 = Math.abs(normal.z) < .999 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  const flight = plane.flight;
  if (flight && flight.from !== flight.to) {
    const duration = Math.max(1, flight.arriveAt - flight.departAt);
    const progress = Math.max(0, Math.min(1, (time - flight.departAt) / duration));
    const before = aircraftSurfacePoint(plane, flight.departAt + Math.max(0, progress - .0001) * duration);
    const after = aircraftSurfacePoint(plane, flight.departAt + Math.min(1, progress + .0001) * duration);
    const delta = { x: after.x - before.x, y: after.y - before.y, z: after.z - before.z };
    if (Math.hypot(delta.x, delta.y, delta.z) > 1e-10) forward = delta;
  }
  const radial = dot(forward, normal);
  forward = { x: forward.x - radial * normal.x, y: forward.y - radial * normal.y, z: forward.z - radial * normal.z };
  const length = Math.hypot(forward.x, forward.y, forward.z);
  forward = { x: forward.x / length, y: forward.y / length, z: forward.z / length };
  const rightView = viewVector(cross(forward, normal), camera), forwardView = viewVector(forward, camera);
  // Image +Y points toward the tail; screen +Y points down. Do not normalize these projected axes:
  // their shrinking lengths and shear make the image lie on the sphere rather than face the camera.
  const transform = { a: rightView.x, b: -rightView.y, c: -forwardView.x, d: forwardView.y };
  const rotation = Math.hypot(transform.c, transform.d) < 1e-8 ? 0 : Math.atan2(-transform.c, transform.d);
  return { ...point, flipX: false, rotation, transform };
}

/** Unprojected icon size stays fixed as the globe zooms; the tangent projection foreshortens it. */
export function mapAircraftSize(imageWidth = 36, imageHeight = 44) {
  const ratio = Number.isFinite(imageWidth) && Number.isFinite(imageHeight) && imageWidth > 0 && imageHeight > 0
    ? imageWidth / imageHeight : 36 / 44;
  return { width: 44 * ratio, height: 44 };
}
