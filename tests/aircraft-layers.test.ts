import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { ALL_MODELS } from '../src/core/catalog.js';
import { cabinArtLayout } from '../src/ui/cabin-art-layout.js';
import { composite, decodePng, encodePng, registerLayer } from '../scripts/aircraft-png.mjs';
import format from '../src/ui/aircraft-canvas.json';

const image = (file: string) => decodePng(readFileSync(`public/art/${file}`));
describe('dedicated registered aircraft resources', () => {
  it('ships a distinct complete cutaway and exterior for every model on the same full canvas', () => {
    const hashes = new Set<string>(), names = new Set<string>();
    for (const model of ALL_MODELS) {
      const art = cabinArtLayout({ modelId: model.id });
      expect(art).not.toHaveProperty('nearBounds');
      expect(model.art).toBe(art.exterior);
      for (const file of [art.hull, art.exterior]) {
        names.add(file); expect(file).toContain(`aircraft-${model.id}-`);
        const bytes = readFileSync(`public/art/${file}`);
        hashes.add(createHash('sha256').update(bytes).digest('hex'));
        expect(bytes.readUInt32BE(16)).toBe(format.canvas.width);
        expect(bytes.readUInt32BE(20)).toBe(format.canvas.height);
        expect(bytes[25]).toBe(6);
      }
    }
    expect(names.size).toBe(ALL_MODELS.length * 2); expect(hashes.size).toBe(ALL_MODELS.length * 2);
  });

  for (const model of ALL_MODELS) it(`${model.id}: complete views retain transparent canvas corners`, () => {
    const art = cabinArtLayout({ modelId: model.id });
    const hull = image(art.hull), full = image(art.exterior);
    expect(full.data.equals(hull.data)).toBe(false);
    for (const layer of [hull, full]) {
      for (const [x, y] of [[0, 0], [layer.width - 1, 0], [0, layer.height - 1], [layer.width - 1, layer.height - 1]]) {
        expect(layer.data[(y! * layer.width + x!) * 4 + 3]).toBe(0);
      }
    }
    if (model.id !== 'diamond-da40') {
      const near = image(art.hull.replace('-cutaway-', '-near-'));
      expect(full.data.equals(composite(hull, near).data)).toBe(true);
      const room = art.interior;
      for (let u = .05; u < 1; u += .1) for (let v = .05; v < 1; v += .1) {
        const x = Math.floor(room.x + u * room.width), y = Math.floor(room.y + v * room.height);
        expect(near.data[(y * near.width + x) * 4 + 3]).toBeGreaterThan(245);
      }
    }
  });

  it('round-trips RGBA including partial alpha and rejects corrupt or truncated PNGs', () => {
    const rgba = { width: 2, height: 2, data: Buffer.from([255, 0, 0, 255, 0, 0, 255, 128, 99, 55, 33, 0, 1, 2, 3, 255]) };
    const encoded = encodePng(rgba);
    expect(decodePng(encoded)).toEqual(rgba);
    const corrupt = Buffer.from(encoded); corrupt[20] = corrupt[20]! ^ 1;
    expect(() => decodePng(corrupt)).toThrow(/checksum/);
    expect(() => decodePng(encoded.subarray(0, -7))).toThrow();
    expect(() => decodePng(Buffer.from('not artwork'))).toThrow(/PNG/);
  });

  it('normalizes reviewed RGB source atlases to opaque RGBA before their alpha masks are applied', () => {
    const rgb = decodePng(readFileSync('art/aircraft-capacity-v5/aurora-p-source.png'));
    expect(rgb.width).toBe(1536); expect(rgb.height).toBe(1024);
    expect(rgb.data.length).toBe(rgb.width * rgb.height * 4);
    expect(rgb.data[3]).toBe(255);
  });

  it('registers at the origin without changing pixels and composes source-over alpha', () => {
    const source = { width: 1, height: 1, data: Buffer.from([0, 0, 255, 128]) };
    const canvas = { width: 1, height: 1 };
    expect(registerLayer(source, canvas, { x: 0, y: 0, ...canvas })).toEqual(source);
    const base = { ...canvas, data: Buffer.from([255, 0, 0, 255]) };
    expect([...composite(base, source).data]).toEqual([127, 0, 128, 255]);
    expect(() => composite(base, { width: 2, height: 1, data: Buffer.alloc(8) })).toThrow(/canvas/);
    expect(() => registerLayer(source, canvas, { x: 0, y: 0, width: 0, height: 1 })).toThrow(/registration/);
  });
});
