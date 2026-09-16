import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_MODELS } from '../src/core/catalog.js';
import { decodePng } from '../scripts/aircraft-png.mjs';

const root = 'art/aircraft-pair-v7';
const manifest = JSON.parse(readFileSync(`${root}/manifest.json`, 'utf8')) as {
  revision: string;
  direction: string;
  canvas: { width: number; height: number };
  sourceBoard: { width: number; height: number };
  aircraft: Array<{ id: string; prototype: string; capacity: { passengers: number; cargo: number }; source: string; cutaway: string; exterior: string }>;
};

function visibleBounds(file: string, threshold = 8) {
  const image = decodePng(readFileSync(`${root}/${file}`));
  let left = image.width, top = image.height, right = -1, bottom = -1;
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    if (image.data[(y * image.width + x) * 4 + 3]! < threshold) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < left || bottom < top) throw new Error(`${file}: empty artwork`);
  return { image, left, top, right: right + 1, bottom: bottom + 1, width: right - left + 1, height: bottom - top + 1 };
}

describe('real-prototype compartment cutaway and exterior aircraft artwork', () => {
  it('covers every current aircraft on the v7 boundary', () => {
    expect(manifest).toMatchObject({ revision: 'v7', direction: 'left', canvas: { width: 1536, height: 590 }, sourceBoard: { width: 1536, height: 1024 } });
    expect(manifest.aircraft.map(entry => entry.id)).toEqual(ALL_MODELS.map(model => model.id));
    for (const entry of manifest.aircraft) {
      const model = ALL_MODELS.find(candidate => candidate.id === entry.id)!;
      const prototypeManufacturer = model.reference.prototype.split(' ')[0]!;
      const prototypeVariants = model.reference.prototype.split(' / ').map(value => value.split(' ').at(-1)!);
      expect(entry.prototype).toContain(prototypeManufacturer);
      expect(prototypeVariants.some(value => entry.prototype.includes(value))).toBe(true);
      expect(entry.capacity).toEqual({ passengers: model.seats, cargo: model.cargo });
    }
  });

  it('retains reproducible chroma sources and exports matched transparent pairs', () => {
    const hashes = new Set<string>();
    for (const entry of manifest.aircraft) {
      const source = decodePng(readFileSync(`${root}/${entry.source}`));
      expect([source.width, source.height]).toEqual([1536, 1024]);
      for (const index of [0, source.width - 1, (source.height - 1) * source.width, source.width * source.height - 1]) {
        const r = source.data[index * 4]!, g = source.data[index * 4 + 1]!, b = source.data[index * 4 + 2]!;
        expect(g - Math.max(r, b)).toBeGreaterThan(150);
      }
      const cutaway = visibleBounds(entry.cutaway), exterior = visibleBounds(entry.exterior);
      for (const art of [cutaway, exterior]) {
        expect([art.image.width, art.image.height]).toEqual([1536, 590]);
        const corners = [0, art.image.width - 1, (art.image.height - 1) * art.image.width, art.image.width * art.image.height - 1];
        expect(corners.map(index => art.image.data[index * 4 + 3])).toEqual([0, 0, 0, 0]);
        expect(art.left).toBeGreaterThanOrEqual(48);
        expect(art.right).toBeLessThanOrEqual(1488);
        expect(art.bottom).toBeLessThanOrEqual(562);
        hashes.add(createHash('sha256').update(art.image.data).digest('hex'));
      }
      expect(Math.abs(cutaway.width - exterior.width)).toBeLessThanOrEqual(2);
      expect(Math.abs(cutaway.bottom - exterior.bottom)).toBeLessThanOrEqual(1);
      expect(cutaway.image.data.equals(exterior.image.data)).toBe(false);
    }
    expect(hashes.size).toBe(manifest.aircraft.length * 2);
  });
});
