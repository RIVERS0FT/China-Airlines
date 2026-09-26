import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../../scripts/aircraft-png.mjs';

describe('painted flight layers', () => {
  it('ships a fully opaque panorama below the offline cache size limit', () => {
    const bytes = readFileSync('public/art/flight-cloudscape-v1.png');
    const image = decodePng(bytes);
    expect([image.width, image.height]).toEqual([1536, 1024]);
    expect(bytes.length).toBeLessThan(5 * 1024 * 1024);
    for (let offset = 3; offset < image.data.length; offset += 4) {
      if (image.data[offset] !== 255) throw new Error('The sky panorama must cover the full scene');
    }
  });
  it('preserves genuine cloud transparency and soft edges for layered scrolling', () => {
    const bytes = readFileSync('public/art/flight-cloud-bank-v1.png');
    const image = decodePng(bytes);
    expect(bytes.length).toBeLessThan(5 * 1024 * 1024);
    expect([image.width, image.height]).toEqual([1536, 1024]);
    let clear = 0, soft = 0, dense = 0;
    for (let offset = 3; offset < image.data.length; offset += 4) {
      const alpha = image.data[offset]!;
      if (alpha === 0) clear++;
      else if (alpha < 255) soft++;
      if (alpha > 220) dense++;
    }
    expect(clear / (image.width * image.height)).toBeGreaterThan(.4);
    expect(soft).toBeGreaterThan(1000);
    expect(dense).toBeGreaterThan(1000);
    for (const [x, y] of [[0, 0], [1535, 0], [0, 1023], [1535, 1023]]) {
      expect(image.data[(y! * image.width + x!) * 4 + 3]).toBe(0);
    }
  });
});
