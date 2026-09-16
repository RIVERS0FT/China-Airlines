import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../scripts/aircraft-png.mjs';

const root = 'art/aircraft-pair-v6';
const manifest = JSON.parse(readFileSync(`${root}/manifest.json`, 'utf8')) as {
  status: string;
  modelId: string;
  direction: string;
  capacity: { passengers: number; cargo: number };
  canvas: { width: number; height: number };
  cutaway: string;
  exterior: string;
};

function visibleBounds(file: string, threshold = 8) {
  const image = decodePng(readFileSync(`${root}/${file}`));
  let left = image.width, top = image.height, right = -1, bottom = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.data[(y * image.width + x) * 4 + 3]! < threshold) continue;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) throw new Error(`${file}: empty artwork`);
  return { image, left, top, right: right + 1, bottom: bottom + 1,
    width: right - left + 1, height: bottom - top + 1 };
}

function significantComponents(file: string, threshold = 8) {
  const image = decodePng(readFileSync(`${root}/${file}`));
  const pixels = image.width * image.height, pending = new Uint8Array(pixels);
  for (let index = 0; index < pixels; index += 1) pending[index] = image.data[index * 4 + 3]! >= threshold ? 1 : 0;
  let count = 0;
  for (let seed = 0; seed < pixels; seed += 1) {
    if (!pending[seed]) continue;
    count += 1; pending[seed] = 0; const queue = [seed];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor]!, y = Math.floor(index / image.width), x = index - y * image.width;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if ((!dx && !dy) || x + dx < 0 || x + dx >= image.width || y + dy < 0 || y + dy >= image.height) continue;
        const next = index + dy * image.width + dx;
        if (pending[next]) { pending[next] = 0; queue.push(next); }
      }
    }
  }
  return count;
}

describe('independent cutaway and exterior aircraft artwork', () => {
  it('records the approved DA40 catalogue boundary', () => {
    expect(manifest).toMatchObject({
      status: 'catalogued-as-diamond-da40-v6', modelId: 'diamond-da40', direction: 'left',
      capacity: { passengers: 1, cargo: 0 }, canvas: { width: 1536, height: 590 },
    });
  });

  it('keeps both complete views on equal transparent canvases with matched scale and baseline', () => {
    const cutaway = visibleBounds(manifest.cutaway);
    const exterior = visibleBounds(manifest.exterior);
    for (const art of [cutaway, exterior]) {
      expect([art.image.width, art.image.height]).toEqual([1536, 590]);
      const cornerOffsets = [0, (art.image.width - 1) * 4,
        (art.image.height - 1) * art.image.width * 4,
        (art.image.width * art.image.height - 1) * 4];
      expect(cornerOffsets.map(offset => art.image.data[offset + 3])).toEqual([0, 0, 0, 0]);
      expect(art.left).toBeGreaterThanOrEqual(48);
      expect(art.right).toBeLessThanOrEqual(1488);
      expect(art.bottom).toBeLessThanOrEqual(562);
    }
    expect(significantComponents(manifest.cutaway)).toBe(1);
    expect(significantComponents(manifest.exterior)).toBe(1);
    expect(Math.abs(cutaway.width - exterior.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(cutaway.bottom - exterior.bottom)).toBeLessThanOrEqual(1);
    expect(Math.abs(cutaway.height - exterior.height)).toBeLessThanOrEqual(12);
  });
});
