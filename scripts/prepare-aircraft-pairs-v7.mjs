import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePng, encodePng, registerLayer } from './aircraft-png.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const artRoot = resolve(root, 'art/aircraft-pair-v7');

function neighbors(index, width, height, visit) {
  const y = Math.floor(index / width), x = index - y * width;
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    if ((!dx && !dy) || x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
    visit(index + dy * width + dx);
  }
}

function splitBoard(source, upper, splitY) {
  const data = Buffer.alloc(source.data.length);
  for (let y = upper ? 0 : splitY; y < (upper ? splitY : source.height); y += 1) {
    const start = y * source.width * 4;
    source.data.copy(data, start, start, start + source.width * 4);
  }
  return { ...source, data };
}

function keyChromaGreen(source) {
  const data = Buffer.from(source.data);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const excess = g - Math.max(r, b);
    const alpha = Math.round(255 * (1 - Math.max(0, Math.min(1, (excess - 20) / 160))));
    if (alpha === 0) data.fill(0, i, i + 4);
    else {
      if (alpha < 255) data[i + 1] = Math.min(g, Math.max(r, b));
      data[i + 3] = alpha;
    }
  }
  return { ...source, data };
}

function bestSplitY(source, threshold = 8) {
  let best = { y: Math.floor(source.height / 2), count: Infinity };
  // Imagegen boards reserve the first and second half for one complete view
  // each. Search only the real inter-view gutter so landing gear in the upper
  // view cannot be mistaken for the separator.
  for (let y = 500; y <= 570; y += 1) {
    let count = 0;
    for (let x = 0; x < source.width; x += 1) if (source.data[(y * source.width + x) * 4 + 3] >= threshold) count += 1;
    if (count < best.count) best = { y, count };
  }
  return best.y;
}

function significantArtwork(image, threshold = 8) {
  const pixels = image.width * image.height, visited = new Uint8Array(pixels);
  const components = [];
  for (let seed = 0; seed < pixels; seed += 1) {
    if (visited[seed] || image.data[seed * 4 + 3] < threshold) continue;
    const component = [], queue = [seed]; visited[seed] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor]; component.push(index);
      neighbors(index, image.width, image.height, next => {
        if (!visited[next] && image.data[next * 4 + 3] >= threshold) { visited[next] = 1; queue.push(next); }
      });
    }
    components.push(component);
  }
  components.sort((a, b) => b.length - a.length);
  const primary = components[0] ?? [];
  if (!primary.length) throw new Error('No connected aircraft artwork');

  // A strict side view may leave a propeller, far-side engine, antenna or wheel
  // separated by a sub-pixel transparent gap. Keep every material component,
  // while discarding only isolated imagegen specks.
  const material = components.filter(component => component.length >= Math.max(64, primary.length * .0005));
  const keep = new Uint8Array(pixels), queue = material.flat();
  for (const index of queue) keep[index] = 1;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    neighbors(queue[cursor], image.width, image.height, next => {
      if (!keep[next] && image.data[next * 4 + 3] > 0) { keep[next] = 1; queue.push(next); }
    });
  }
  const data = Buffer.alloc(image.data.length);
  for (let index = 0; index < pixels; index += 1) if (keep[index]) image.data.copy(data, index * 4, index * 4, index * 4 + 4);
  return { ...image, data };
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

export function prepareAircraftPairsV7() {
  const manifest = JSON.parse(readFileSync(resolve(artRoot, 'manifest.json'), 'utf8'));
  const report = [];
  for (const entry of manifest.aircraft) {
    const rawSource = decodePng(readFileSync(resolve(artRoot, entry.source)));
    const source = keyChromaGreen(rawSource);
    if (source.width !== manifest.sourceBoard.width || source.height !== manifest.sourceBoard.height) {
      throw new Error(`${entry.id}: expected ${manifest.sourceBoard.width}x${manifest.sourceBoard.height} source board`);
    }
    const corners = [3, (source.width - 1) * 4 + 3, (source.height - 1) * source.width * 4 + 3, (source.width * source.height - 1) * 4 + 3];
    if (corners.some(offset => source.data[offset] !== 0)) throw new Error(`${entry.id}: source background is not chroma green`);

    const splitY = bestSplitY(source);
    const isolated = {
      cutaway: significantArtwork(splitBoard(source, true, splitY)),
      exterior: significantArtwork(splitBoard(source, false, splitY)),
    };
    const bounds = Object.fromEntries(Object.entries(isolated).map(([name, image]) => [name, visibleBounds(image)]));
    const outputBounds = {};
    for (const name of ['cutaway', 'exterior']) {
      const sourceCrop = crop(isolated[name], bounds[name]);
      // Imagegen may leave slightly different margins/scales on the two rows.
      // Register each reviewed view to the same visible width and baseline so
      // the UI can switch images without a visual jump.
      const scale = Math.min(
        manifest.targetVisibleWidth / sourceCrop.width,
        (manifest.targetBaseline - 18) / sourceCrop.height,
      );
      const width = sourceCrop.width * scale, height = sourceCrop.height * scale;
      const output = registerLayer(sourceCrop, manifest.canvas, {
        x: (manifest.canvas.width - width) / 2,
        y: manifest.targetBaseline - height,
        width,
        height,
      });
      const target = resolve(artRoot, entry[name]);
      writeFileSync(target, encodePng(output));
      outputBounds[name] = visibleBounds(output);
    }
    report.push({ id: entry.id, splitY, sourceBounds: bounds, ...outputBounds });
  }
  mkdirSync(resolve(root, 'artifacts'), { recursive: true });
  writeFileSync(resolve(root, 'artifacts/aircraft-pair-v7.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Prepared ${report.length} v7 aircraft pairs from real-prototype source boards.`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) prepareAircraftPairsV7();
