import { describe, expect, it } from 'vitest';
import { airport } from '../../src/core/catalog.js';
import { GameCore } from '../helpers/configured-game.js';
import { arcPoints, dot, fromVector, globeCamera, projectGeo, screenPoint, toVector, viewVector, type Vec3 } from '../../src/ui/globe-geometry.js';
import { aircraftSurfacePoint, MAP_AIRCRAFT_ART, mapAircraftSize, projectMapAircraft, shouldShowMapAircraft } from '../../src/ui/map-aircraft.js';

const NOW = 1800000000000;
function flying(from = 'PEK', to = 'PVG') {
  const core = new GameCore(NOW);
  core.execute({ type: 'dispatch', planeId: 'AC0001', to: 'PVG', auto: false }, NOW);
  const plane = core.snapshot().fleet[0]!;
  plane.flight = { ...plane.flight!, from, to };
  return plane;
}
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const angle = (a: Vec3, b: Vec3) => Math.acos(Math.max(-1, Math.min(1, dot(a, b))));

describe('map aircraft visibility and shared top-down art', () => {
  it('shows only real flights and keeps the current flight when other aircraft are hidden', () => {
    const grounded = new GameCore(NOW).snapshot().fleet[0]!;
    expect(shouldShowMapAircraft(grounded, grounded.id, true)).toBe(false);
    expect(shouldShowMapAircraft(grounded, grounded.id, false)).toBe(false);
    const plane = flying();
    expect(shouldShowMapAircraft(plane, plane.id, false)).toBe(true);
    expect(shouldShowMapAircraft(plane, 'AC9999', false)).toBe(false);
    expect(shouldShowMapAircraft(plane, undefined, false)).toBe(false);
    expect(shouldShowMapAircraft(plane, 'AC9999', true)).toBe(true);
  });

  it('uses one local top-down image and retains its aspect ratio at a fixed map size', () => {
    expect(MAP_AIRCRAFT_ART).toBe('map-aircraft-topdown-v1.png');
    expect(mapAircraftSize()).toEqual({ width: 36, height: 44 });
    expect(mapAircraftSize(1024, 1536)).toEqual({ width: 44 * 1024 / 1536, height: 44 });
    expect(mapAircraftSize(1536, 1024)).toEqual({ width: 66, height: 44 });
    for (const [width, height] of [[0, 0], [-1, 44], [36, Infinity], [NaN, 44]]) {
      expect(mapAircraftSize(width, height)).toEqual({ width: 36, height: 44 });
    }
  });
});

describe('aircraft and route share the unit sphere', () => {
  it.each([['PEK', 'PVG'], ['PVG', 'PEK'], ['NRT', 'HNL'], ['ANC', 'AKL'], ['PEK', 'PEK']])('follows the shortest surface arc from %s to %s without mutating the flight', (from, to) => {
    const plane = flying(from, to), original = structuredClone(plane), flight = plane.flight!;
    const a = toVector(airport(from)), b = toVector(airport(to)), normal = cross(a, b);
    for (const progress of [-1, 0, .25, .5, .75, 1, 2]) {
      const point = aircraftSurfacePoint(plane, flight.departAt + (flight.arriveAt - flight.departAt) * progress);
      expect(Math.hypot(point.x, point.y, point.z)).toBeCloseTo(1, 10);
      expect(dot(point, normal)).toBeCloseTo(0, 10);
      expect(angle(a, point)).toBeCloseTo(angle(a, b) * Math.max(0, Math.min(1, progress)), 6);
      if (progress <= 0) expect(point).toEqual(a);
      if (progress >= 1) expect(point).toEqual(b);
    }
    const route = arcPoints(airport(from), airport(to));
    for (let i = 0; i < route.length; i++) {
      const point = aircraftSurfacePoint(plane, flight.departAt + (flight.arriveAt - flight.departAt) * i / (route.length - 1));
      expect(point.x).toBeCloseTo(route[i]!.x, 8);
      expect(point.y).toBeCloseTo(route[i]!.y, 8);
      expect(point.z).toBeCloseTo(route[i]!.z, 8);
    }
    expect(plane).toEqual(original);
  });

  it.each([1, 3, 6])('uses the globe camera and the same horizon at zoom %s', scale => {
    const plane = flying(), time = plane.flight!.departAt + 10;
    for (const lon of [0, 110, -70, 179]) {
      const camera = globeCamera(844, 390, { lat: 31, lon }, scale);
      const expected = screenPoint(viewVector(aircraftSurfacePoint(plane, time), camera), camera);
      const projected = projectMapAircraft(plane, time, camera);
      expect(projected.x).toBeCloseTo(expected.x, 8);
      expect(projected.y).toBeCloseTo(expected.y, 8);
      expect(projected.depth).toBeCloseTo(expected.depth, 8);
      expect(projected.visible).toBe(expected.visible);
      expect(Math.hypot(projected.x - camera.cx, projected.y - camera.cy)).toBeLessThanOrEqual(camera.radius * scale + 1e-8);
    }
    const departure = airport(plane.flight!.from);
    expect(projectMapAircraft(plane, plane.flight!.departAt, globeCamera(844, 390, departure, scale)).visible).toBe(true);
    expect(projectMapAircraft(plane, plane.flight!.departAt,
      globeCamera(844, 390, { lat: -departure.lat, lon: departure.lon + 180 }, scale)).visible).toBe(false);
  });

  it.each([['PEK', 'PVG'], ['PVG', 'PEK'], ['NRT', 'HNL'], ['ANC', 'AKL']])('points the top-down nose along the projected tangent from %s to %s without mirroring', (from, to) => {
    const plane = flying(from, to), flight = plane.flight!;
    const normal = cross(toVector(airport(from)), toVector(airport(to)));
    for (const progress of [0, .25, .5, .75, 1]) {
      const time = flight.departAt + (flight.arriveAt - flight.departAt) * progress;
      const point = aircraftSurfacePoint(plane, time), tangent = cross(normal, point);
      for (const lon of [0, 110, -70, 179]) {
        const camera = globeCamera(844, 390, { lat: 31, lon });
        const projected = projectMapAircraft(plane, time, camera), direction = viewVector(tangent, camera);
        const length = Math.hypot(direction.x, direction.y);
        expect(projected.flipX).toBe(false);
        // The image nose is (0,-1); the actual matrix must keep it on the flight tangent.
        const { c, d } = projected.transform, projectedLength = Math.hypot(c, d);
        expect(-c / projectedLength).toBeCloseTo(direction.x / length, 8);
        expect(-d / projectedLength).toBeCloseTo(-direction.y / length, 8);
        expect(Math.sin(projected.rotation)).toBeCloseTo(direction.x / length, 3);
        expect(-Math.cos(projected.rotation)).toBeCloseTo(-direction.y / length, 3);
      }
    }
  });

  it('keeps a grounded or coincident route finite without inventing movement', () => {
    const grounded = new GameCore(NOW).snapshot().fleet[0]!, camera = globeCamera(844, 390, airport('PEK'));
    expect(aircraftSurfacePoint(grounded, 0)).toEqual(toVector(airport(grounded.airportId)));
    const stationary = projectMapAircraft(grounded, 0, camera);
    expect(stationary).toMatchObject({ ...projectGeo(airport(grounded.airportId), camera), flipX: false });
    for (const value of Object.values(stationary.transform)) expect(Number.isFinite(value)).toBe(true);
    const plane = flying('PEK', 'PEK'), flight = plane.flight!;
    for (const time of [flight.departAt, (flight.departAt + flight.arriveAt) / 2, flight.arriveAt]) {
      expect(projectMapAircraft(plane, time, camera)).toEqual(stationary);
    }
  });

  it.each([['PEK', 'PVG'], ['PVG', 'PEK'], ['NRT', 'HNL'], ['ANC', 'AKL'], ['PEK', 'PEK']])('foreshortens the tangent plane toward the horizon without enlarging or mirroring %s to %s', (from, to) => {
    const plane = flying(from, to), flight = plane.flight!;
    for (const progress of [0, .4, 1]) {
      const time = flight.departAt + (flight.arriveAt - flight.departAt) * progress;
      const surface = aircraftSurfacePoint(plane, time), location = fromVector(surface);
      const cameras = [globeCamera(844, 390, location),
        ...[45, 75, 89.999999, 90, 90.000001, 135].map(offset => globeCamera(844, 390, { lat: 0, lon: location.lon + offset })),
        globeCamera(844, 390, { lat: 90, lon: 0 }), globeCamera(844, 390, { lat: -90, lon: 0 })];
      for (const camera of cameras) {
        const pose = projectMapAircraft(plane, time, camera), { a, b, c, d } = pose.transform;
        for (const value of [a, b, c, d, pose.rotation]) expect(Number.isFinite(value)).toBe(true);
        const normal = viewVector(surface, camera);
        // Projection of a unit tangent disk has radii 1 and |depth|, independent of heading.
        expect(a * d - b * c).toBeCloseTo(normal.z, 8);
        expect(a * a + c * c).toBeCloseTo(1 - normal.x * normal.x, 8);
        expect(b * b + d * d).toBeCloseTo(1 - normal.y * normal.y, 8);
        expect(a * b + c * d).toBeCloseTo(normal.x * normal.y, 8);
        expect(Math.hypot(a, b)).toBeLessThanOrEqual(1 + 1e-10);
        expect(Math.hypot(c, d)).toBeLessThanOrEqual(1 + 1e-10);
        if (pose.visible) expect(a * d - b * c).toBeGreaterThanOrEqual(-1e-10);
      }
      const front = projectMapAircraft(plane, time, cameras[0]!).transform;
      expect(Math.hypot(front.a, front.b)).toBeCloseTo(1, 8);
      expect(Math.hypot(front.c, front.d)).toBeCloseTo(1, 8);
      expect(front.a * front.c + front.b * front.d).toBeCloseTo(0, 8);
    }
  });
});
