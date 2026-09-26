import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { decodePng } from './aircraft-png.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const layouts = readJson('src/ui/aircraft-cabin-layouts.json');
const manifest = readJson('art/aircraft-exteriors-v8/manifest.json');
const canvas = readJson('src/ui/aircraft-canvas.json').canvas;

if (manifest.aircraft.length !== Object.keys(layouts).length) throw new Error('Aircraft exterior manifest and cabin layouts differ');
for (const entry of manifest.aircraft) {
  const layout = layouts[entry.id];
  if (!layout || layout.exteriorSource !== `art/aircraft-exteriors-v8/${entry.exterior}`) throw new Error(`${entry.id}: missing exterior source`);
  const source = decodePng(readFileSync(resolve(root, layout.exteriorSource)));
  const runtime = decodePng(readFileSync(resolve(root, `public/art/aircraft-${entry.id}-exterior-${layout.revision}.png`)));
  for (const [name, image] of [['source', source], ['runtime', runtime]]) {
    if (image.width !== canvas.width || image.height !== canvas.height) throw new Error(`${entry.id}: invalid ${name} canvas`);
    const corners = [0, image.width - 1, (image.height - 1) * image.width, image.width * image.height - 1];
    if (corners.some(index => image.data[index * 4 + 3] !== 0)) throw new Error(`${entry.id}: ${name} canvas corners are not transparent`);
  }
  if (!source.data.equals(runtime.data)) throw new Error(`${entry.id}: exterior source and runtime differ`);
}
console.log(`Verified ${manifest.aircraft.length} exterior images and procedural cabin layouts.`);
