import { describe, expect, it } from 'vitest';
import { aircraftPose, boundaryEdges, mixColor, oceanTone, parabolicLift, parabolicRoute, terrainTone } from '../src/ui/globe-art.js';

describe('globe art helpers', () => {
  it('keeps the outside of a triangle mesh and removes its shared diagonal', () => {
    expect(boundaryEdges([[0, 1, 2], [2, 1, 3]])).toEqual([[0, 1], [0, 2], [1, 3], [2, 3]]);
  });

  it('clamps and blends palette colors deterministically', () => {
    expect(mixColor(0x000000, 0xffffff, .5)).toBe(0x808080);
    expect(mixColor(0x123456, 0xffffff, -1)).toBe(0x123456);
    expect(mixColor(0x123456, 0xffffff, 2)).toBe(0xffffff);
    expect(oceanTone(0)).toBe(0x12384f);
    expect(oceanTone(1)).toBe(0x287f96);
    expect(terrainTone(1)).toBe(0xc1c982);
  });

  it('lifts route altitude with a bounded parabola and preserves both endpoints', () => {
    const points = [{ x: 1, y: 0, z: 0 }, { x: .7, y: .7, z: 0 }, { x: 0, y: 1, z: 0 }];
    expect(parabolicRoute(points, .12)).toEqual([points[0], { x: .784, y: .784, z: 0 }, points[2]]);
    expect(Math.hypot(...Object.values(parabolicLift({ x: 1, y: 0, z: 0 }, .5, .12)))).toBeCloseTo(1.12);
    expect(parabolicLift({ x: 1, y: 0, z: 0 }, 2, .12)).toEqual({ x: 1, y: 0, z: 0 });
  });

  it.each([[1, 0], [-1, 0], [2, 3], [-2, 3], [0, -4]])('points the model nose along the screen tangent %s,%s', (dx, dy) => {
    const pose = aircraftPose(dx, dy), forward = pose.flipX ? 1 : -1, length = Math.hypot(dx, dy);
    expect(forward * Math.cos(pose.rotation)).toBeCloseTo(dx / length, 8);
    expect(forward * Math.sin(pose.rotation)).toBeCloseTo(dy / length, 8);
    expect(Math.abs(pose.rotation)).toBeLessThanOrEqual(Math.PI / 2);
  });
});
