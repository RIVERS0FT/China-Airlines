import { describe, expect, it } from 'vitest';
import { arcPoints, dot, frontPolygon, frontSegment, globeCamera, greatCircle, projectGeo, rangePoints, toVector, viewVector, wrapLongitude } from '../src/ui/globe-geometry.js';
import { LAND_VERTICES, LAND_FACES } from '../src/ui/world-land.js';
describe('spherical camera and routes', () => {
  it.each([[1440, 840], [844, 342], [667, 327], [664, 100]])('centers a selected place without shrinking UI text at %sx%s', (w, h) => {
    const focus = { lat: 40.1, lon: 116.6 }, camera = globeCamera(w, h, focus), p = projectGeo(focus, camera);
    expect(p.x).toBeCloseTo(camera.cx); expect(p.y).toBeCloseTo(camera.cy); expect(p.depth).toBeCloseTo(1);
    expect(camera.radius).toBeGreaterThan(0); expect(camera.scale).toBe(1);
  });
  it('hides the far side even when it projects to the same screen position', () => {
    const camera = globeCamera(800, 400, { lat: 0, lon: 0 });
    expect(projectGeo({ lat: 0, lon: 0 }, camera).visible).toBe(true);
    expect(projectGeo({ lat: 0, lon: 180 }, camera).visible).toBe(false);
    expect(projectGeo({ lat: 0, lon: 180 }, camera).x).toBeCloseTo(camera.cx);
  });
  it('bounds zoom and latitude while longitude wraps across repeated rotations', () => {
    const c = globeCamera(800, 400, { lat: 300, lon: 1081 }, 999);
    expect(c.lat).toBe(90); expect(c.lon).toBe(1); expect(c.scale).toBe(6);
    expect(wrapLongitude(-1081)).toBe(-1);
    expect(globeCamera(800, 400, c, .01).scale).toBe(1);
  });
  it('takes the short great-circle route across the date line', () => {
    const a = toVector({ lat: 0, lon: 179 }), b = toVector({ lat: 0, lon: -179 }), mid = greatCircle(a, b, .5);
    expect(mid.x).toBeCloseTo(-1); expect(mid.y).toBeCloseTo(0);
    expect(dot(mid, a)).toBeGreaterThan(.999);
  });
  it('keeps coincident, antipodal and polar paths finite and on the sphere', () => {
    for (const [a, b] of [[{ lat: 0, lon: 0 }, { lat: 0, lon: 180 }], [{ lat: 90, lon: 0 }, { lat: -90, lon: 0 }], [{ lat: 20, lon: 50 }, { lat: 20, lon: 50 }]]) {
      for (const p of arcPoints(a!, b!)) expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(1, 8);
    }
  });
  it('clips lines and triangles at the horizon instead of drawing through the globe', () => {
    const a = { x: .8, y: 0, z: .6 }, b = { x: .8, y: 0, z: -.6 };
    const clipped = frontSegment(a, b)!; expect(clipped[1].z).toBe(0); expect(clipped[1].x).toBeCloseTo(1);
    expect(frontSegment(b, b)).toBeNull(); expect(frontPolygon([b, b, b])).toHaveLength(0);
    for (const v of frontPolygon([a, b, { x: 0, y: .8, z: .6 }])) expect(v.z).toBeGreaterThanOrEqual(0);
  });
  it.each([{ lat: 40.1, lon: 116.6 }, { lat: 90, lon: 0 }, { lat: -37, lon: 174.8 }])('uses an actual kilometre radius around %o', origin => {
    const v = toVector(origin), points = rangePoints(origin, 8000);
    for (const point of points) expect(Math.acos(dot(v, point)) * 6371).toBeCloseTo(8000, 5);
    expect(points[0]!.x).toBeCloseTo(points.at(-1)!.x, 10);
  });
  it('bundles a bounded, finite land mesh without administrative borders', () => {
    expect(LAND_VERTICES).toHaveLength(1395); expect(LAND_FACES).toHaveLength(1225);
    for (const [lon, lat] of LAND_VERTICES) { expect(Math.abs(lon)).toBeLessThanOrEqual(180); expect(Math.abs(lat)).toBeLessThanOrEqual(90); }
    for (const f of LAND_FACES) for (const i of f) expect(i).toBeLessThan(LAND_VERTICES.length);
    const camera = globeCamera(800, 400, { lat: 0, lon: 180 });
    for (const [lon, lat] of LAND_VERTICES) expect(Number.isFinite(viewVector(toVector({ lon, lat }), camera).z)).toBe(true);
  });
});
