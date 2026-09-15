import { airport } from '../core/catalog.js';
import type { Plane } from '../core/game.js';
import { parabolicLift } from './globe-art.js';
import { greatCircle, toVector, viewVector, type GlobeCamera, type Vec3 } from './globe-geometry.js';

const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
const unit = (v: Vec3): Vec3 => {
  const size = length(v);
  return { x: v.x / size, y: v.y / size, z: v.z / size };
};

export interface AircraftFrame {
  position: Vec3;
  right: Vec3;
  up: Vec3;
  forward: Vec3;
}

/** Model convention: +Z nose, +Y roof, +X right wing. No screen-space mirroring. */
export function aircraftFrame(plane: Plane, time: number): AircraftFrame {
  const flight = plane.flight;
  const start = toVector(airport(flight?.from ?? plane.airportId));
  const end = flight ? toVector(airport(flight.to)) : start;
  const progress = flight ? Math.max(0, Math.min(1, (time - flight.departAt) / (flight.arriveAt - flight.departAt))) : 0;
  const surface = greatCircle(start, end, progress);
  const position = parabolicLift(surface, progress, flight ? .1 : 0);
  const before = Math.max(0, progress - .0001), after = Math.min(1, progress + .0001);
  const a = parabolicLift(greatCircle(start, end, before), before, .1);
  const b = parabolicLift(greatCircle(start, end, after), after, .1);
  let forward = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  // Stationary/coincident routes face east, with a deterministic polar fallback.
  if (!flight || length(forward) < 1e-8 || length(cross(surface, forward)) < 1e-8) {
    forward = Math.abs(surface.z) < .9999 ? { x: -surface.y, y: surface.x, z: 0 } : { x: 1, y: 0, z: 0 };
  }
  forward = unit(forward);
  const right = unit(cross(surface, forward));
  return { position, forward, right, up: unit(cross(forward, right)) };
}

/** Apply exactly the globe camera's rotation, then convert unit lengths to pixels. */
export function projectAircraftFrame(frame: AircraftFrame, camera: GlobeCamera, parked = false): AircraftFrame & { visible: boolean } {
  const point = viewVector(frame.position, camera), radius = camera.radius * camera.scale;
  return {
    position: { x: point.x * radius, y: point.y * radius + (parked ? 20 : 0), z: point.z * radius },
    right: viewVector(frame.right, camera), up: viewVector(frame.up, camera), forward: viewVector(frame.forward, camera),
    visible: point.z >= 0,
  };
}
