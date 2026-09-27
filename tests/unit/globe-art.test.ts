import { describe, expect, it } from 'vitest';
import { boundaryEdges, mixColor, oceanTone, terrainTone } from '../../src/ui/globe-art.js';

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

});
