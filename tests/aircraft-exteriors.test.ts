import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { ALL_MODELS } from '../src/core/catalog.js';
import { cabinArtLayout } from '../src/ui/cabin-art-layout.js';
import { decodePng, encodePng } from '../scripts/aircraft-png.mjs';
import format from '../src/ui/aircraft-canvas.json';

describe('dedicated exterior images and procedural cabin layout', () => {
  it('keeps every real prototype and game capacity in the exterior manifest', () => {
    const manifest = JSON.parse(readFileSync('art/aircraft-exteriors-v7/manifest.json', 'utf8')) as {
      aircraft: { id: string; prototype: string; capacity: { passengers: number; cargo: number }; exterior: string }[];
    };
    expect(manifest.aircraft).toHaveLength(14);
    expect(ALL_MODELS.every(model => manifest.aircraft.some(entry => entry.id === model.id))).toBe(true);
    for (const entry of manifest.aircraft) {
      expect(entry.prototype).toBeTruthy();
      expect(entry.capacity.passengers + entry.capacity.cargo).toBeGreaterThan(0);
      expect(entry.exterior).toBe(`${entry.id}-exterior-v7.png`);
      expect(entry).not.toHaveProperty('cutaway');
    }
  });
  it('ships one distinct complete exterior per model', () => {
    const hashes = new Set<string>();
    for (const model of ALL_MODELS) {
      const art = cabinArtLayout({ modelId: model.id });
      expect(model.art).toBe(art.exterior);
      expect(art).not.toHaveProperty('hull');
      const bytes = readFileSync(`public/art/${art.exterior}`);
      hashes.add(createHash('sha256').update(bytes).digest('hex'));
      expect(bytes.readUInt32BE(16)).toBe(format.canvas.width);
      expect(bytes.readUInt32BE(20)).toBe(format.canvas.height);
      expect(bytes[25]).toBe(6);
      const image = decodePng(bytes);
      for (const [x, y] of [[0, 0], [image.width - 1, 0], [0, image.height - 1], [image.width - 1, image.height - 1]]) {
        expect(image.data[(y! * image.width + x!) * 4 + 3]).toBe(0);
      }
    }
    expect(hashes.size).toBe(ALL_MODELS.length);
  });

  it('round-trips RGBA and rejects corrupt or truncated PNGs', () => {
    const rgba = { width: 2, height: 2, data: Buffer.from([255, 0, 0, 255, 0, 0, 255, 128, 99, 55, 33, 0, 1, 2, 3, 255]) };
    const encoded = encodePng(rgba);
    expect(decodePng(encoded)).toEqual(rgba);
    const corrupt = Buffer.from(encoded); corrupt[20] = corrupt[20]! ^ 1;
    expect(() => decodePng(corrupt)).toThrow(/checksum/);
    expect(() => decodePng(encoded.subarray(0, -7))).toThrow();
  });
});
