import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { ALL_MODELS } from '../src/core/catalog.js';
import { cabinArtLayout } from '../src/ui/cabin-art-layout.js';

describe('dedicated aircraft layer resources',()=>{
  it('ships distinct cutaway, near exterior and composed preview for all 13 current aircraft',()=>{
    const hashes=new Set<string>(),names=new Set<string>();
    for(const m of ALL_MODELS){
      const art=cabinArtLayout({modelId:m.id});
      for(const file of [art.hull,art.near,m.art]){
        names.add(file);expect(file).toContain(`aircraft-${m.id}-`);
        const bytes=readFileSync(`public/art/${file}`);hashes.add(createHash('sha256').update(bytes).digest('hex'));
        expect(bytes.readUInt32BE(16)).toBe(1536);expect(bytes[25]).toBe(6);
        expect(bytes.readUInt32BE(20)).toBe(file===art.near?434:590);
      }
    }
    expect(names.size).toBe(39);expect(hashes.size).toBe(39);
  });
});
