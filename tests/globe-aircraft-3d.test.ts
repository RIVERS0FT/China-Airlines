import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { Box3, Group, Mesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { validateSave } from '../src/core/game.js';
import flying from './fixtures/v5-unit-flying.json';
import { aircraftFrame, projectAircraftFrame } from '../src/ui/globe-aircraft-pose.js';
import { dot, globeCamera, greatCircle, screenPoint, toVector, viewVector } from '../src/ui/globe-geometry.js';
import { airport } from '../src/core/catalog.js';
import { AIRLINER_A, disposeAircraftModel, prepareAircraftModel } from '../src/ui/MapAircraftLayer.js';

describe('map aircraft follows a real 3D frame', () => {
  it.each([['PEK', 'PVG'], ['PVG', 'PEK'], ['NRT', 'HNL'], ['ANC', 'AKL'], ['PEK', 'PEK']])('keeps a right-handed upright basis for %s to %s, including endpoints', (from, to) => {
    const plane = validateSave(flying).fleet[0]!;
    plane.flight = { ...plane.flight!, from, to };
    const original = structuredClone(plane), f = plane.flight!;
    for (const progress of [-1, 0, .25, .5, .75, 1, 2]) {
      const frame = aircraftFrame(plane, f.departAt + (f.arriveAt - f.departAt) * progress);
      for (const vector of [frame.forward, frame.up, frame.right]) expect(Math.hypot(vector.x, vector.y, vector.z)).toBeCloseTo(1, 8);
      expect(dot(frame.forward, frame.up)).toBeCloseTo(0, 8);
      expect(dot(frame.forward, frame.right)).toBeCloseTo(0, 8);
      expect(dot(frame.up, frame.right)).toBeCloseTo(0, 8);
      const cross = new Vector3(frame.right.x, frame.right.y, frame.right.z).cross(new Vector3(frame.up.x, frame.up.y, frame.up.z));
      expect(cross.distanceTo(new Vector3(frame.forward.x, frame.forward.y, frame.forward.z))).toBeLessThan(1e-8);
      expect(dot(frame.up, frame.position)).toBeGreaterThan(0);
      if (from !== to && progress >= 0 && progress <= 1) {
        const before = greatCircle(toVector(airport(from)), toVector(airport(to)), progress - .0001);
        const after = greatCircle(toVector(airport(from)), toVector(airport(to)), progress + .0001);
        expect(dot(frame.forward, { x: after.x - before.x, y: after.y - before.y, z: after.z - before.z })).toBeGreaterThan(0);
      }
    }
    expect(plane).toEqual(original);
  });

  it.each([1, 3, 6])('matches existing sphere projection at zoom %s, including a hidden back-side aircraft', scale => {
    const plane = validateSave(flying).fleet[0]!;
    const frame = aircraftFrame(plane, plane.flight!.departAt + 10);
    for (const lon of [0, 110, -70, 179]) {
      const camera = globeCamera(844, 390, { lat: 31, lon }, scale);
      const expected = screenPoint(viewVector(frame.position, camera), camera);
      const projected = projectAircraftFrame(frame, camera);
      expect(camera.cx + projected.position.x).toBeCloseTo(expected.x, 8);
      expect(camera.cy - projected.position.y).toBeCloseTo(expected.y, 8);
      expect(projected.visible).toBe(expected.visible);
    }
  });
});

describe('selected A model intake', () => {
  it('loads the supplied CC-BY A model without external resources and hides only its landing gear', async () => {
    const bytes = await readFile('public/models/low-poly-airliner.glb');
    const jsonLength = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
    expect(json.asset.extras.source).toContain('f06d488f08764e3ca26f2917d4053c69');
    expect(json.asset.extras.license).toContain('CC-BY-4.0');
    expect(json.images ?? []).toHaveLength(0);
    expect(json.buffers.every((buffer: { uri?: string }) => !buffer.uri)).toBe(true);
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const disposers: ReturnType<typeof vi.spyOn>[] = [];
    const materials = new Set();
    gltf.scene.traverse(node => {
      if (!(node instanceof Mesh)) return;
      disposers.push(vi.spyOn(node.geometry, 'dispose'));
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!materials.has(material)) { disposers.push(vi.spyOn(material, 'dispose')); materials.add(material); }
      }
    });
    const parts = prepareAircraftModel(gltf.scene, AIRLINER_A);
    expect(parts).toHaveLength(2);
    expect(parts.reduce((sum, part) => sum + part.geometry.index!.count / 3, 0)).toBe(2284);
    const bounds = new Box3();
    for (const part of parts) { part.geometry.computeBoundingBox(); bounds.union(part.geometry.boundingBox!); }
    expect(bounds.getSize(new Vector3()).z).toBeCloseTo(1, 8);
    expect(bounds.getCenter(new Vector3()).length()).toBeLessThan(1e-7);
    for (const node of AIRLINER_A.hiddenNodes) expect(gltf.scene.getObjectByName(node)?.visible).toBe(false);
    for (const part of parts) part.geometry.dispose();
    disposeAircraftModel(gltf.scene);
    for (const disposer of disposers) expect(disposer).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty model instead of marking 3D loading complete', () => {
    expect(() => prepareAircraftModel(new Group(), AIRLINER_A)).toThrow('no usable length');
  });
});
