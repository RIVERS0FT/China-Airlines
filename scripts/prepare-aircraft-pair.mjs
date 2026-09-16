import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng, registerLayer } from './aircraft-png.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const artRoot = resolve(root, 'art/aircraft-pair-v6');
const manifest = JSON.parse(readFileSync(resolve(artRoot, 'manifest.json'), 'utf8'));
const source = decodePng(readFileSync(resolve(artRoot, manifest.source)));
if (source.width !== 1536 || source.height !== 1024) throw new Error('Expected the reviewed 1536x1024 imagegen board');

const splitY = x => x < 1050 ? 570 : Math.round(570 - (x - 1050) * 120 / (1536 - 1050));
function isolate(upper) {
  const data = Buffer.alloc(source.data.length);
  for (let y = 0; y < source.height; y += 1) for (let x = 0; x < source.width; x += 1) {
    if ((y < splitY(x)) !== upper) continue;
    const offset = (y * source.width + x) * 4, alpha = source.data[offset + 3];
    if (!alpha) continue;
    data[offset] = source.data[offset]; data[offset + 1] = source.data[offset + 1]; data[offset + 2] = source.data[offset + 2];
    data[offset + 3] = Math.min(255, Math.round(alpha * 255 / 254));
  }
  return { width: source.width, height: source.height, data };
}
function primaryConnectedArtwork(image, seedThreshold = 8) {
  const pixels = image.width * image.height, visited = new Uint8Array(pixels);
  let primary = [];
  const neighbors = (index, visit) => {
    const y = Math.floor(index / image.width), x = index - y * image.width;
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      if ((!dx && !dy) || x + dx < 0 || x + dx >= image.width || y + dy < 0 || y + dy >= image.height) continue;
      visit(index + dy * image.width + dx);
    }
  };
  let significantComponents = 0;
  for (let seed = 0; seed < pixels; seed += 1) {
    if (visited[seed] || image.data[seed * 4 + 3] < seedThreshold) continue;
    significantComponents += 1;
    const component = [], queue = [seed]; visited[seed] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor]; component.push(index);
      neighbors(index, next => {
        if (!visited[next] && image.data[next * 4 + 3] >= seedThreshold) {
          visited[next] = 1; queue.push(next);
        }
      });
    }
    if (component.length > primary.length) primary = component;
  }
  if (!primary.length) throw new Error('No connected aircraft artwork');

  // Restore the antialiased fringe connected to the solid primary aircraft, but
  // reject detached pieces leaked from the other view and isolated imagegen specks.
  const keep = new Uint8Array(pixels), queue = [...primary];
  for (const index of primary) keep[index] = 1;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    neighbors(queue[cursor], next => {
      if (!keep[next] && image.data[next * 4 + 3] > 0) { keep[next] = 1; queue.push(next); }
    });
  }
  const data = Buffer.alloc(image.data.length);
  for (let index = 0; index < pixels; index += 1) if (keep[index]) {
    image.data.copy(data, index * 4, index * 4, index * 4 + 4);
  }
  return { image: { ...image, data }, significantComponents, primaryPixels: primary.length };
}
function visibleBounds(image, threshold = 8) {
  let left = image.width, top = image.height, right = -1, bottom = -1;
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    if (image.data[(y * image.width + x) * 4 + 3] < threshold) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < left || bottom < top) throw new Error('Empty aircraft layer');
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
function crop(image, bounds) {
  const data = Buffer.alloc(bounds.width * bounds.height * 4);
  for (let y = 0; y < bounds.height; y += 1) {
    const start = ((bounds.y + y) * image.width + bounds.x) * 4;
    image.data.copy(data, y * bounds.width * 4, start, start + bounds.width * 4);
  }
  return { width: bounds.width, height: bounds.height, data };
}

const cleanup = {
  cutaway: primaryConnectedArtwork(isolate(true)),
  exterior: primaryConnectedArtwork(isolate(false)),
};
const isolated = Object.fromEntries(Object.entries(cleanup).map(([name, result]) => [name, result.image]));
const bounds = Object.fromEntries(Object.entries(isolated).map(([name, image]) => [name, visibleBounds(image)]));
const scale = 1430 / Math.max(bounds.cutaway.width, bounds.exterior.width);
for (const name of ['cutaway', 'exterior']) {
  const sourceCrop = crop(isolated[name], bounds[name]);
  const width = sourceCrop.width * scale, height = sourceCrop.height * scale;
  const output = registerLayer(sourceCrop, manifest.canvas, {
    x: (manifest.canvas.width - width) / 2, y: 560 - height, width, height,
  });
  const file = manifest[name];
  writeFileSync(resolve(artRoot, file), encodePng(output));
  const visible = visibleBounds(output);
  console.log(`${name}: ${file} ${output.width}x${output.height} visible=${JSON.stringify(visible)} sourceComponents=${cleanup[name].significantComponents}`);
}
