/** One fitted coordinate system for the hull, furniture anchors and near shell. */
export interface ArtSize { width: number; height: number }
export interface ArtRect extends ArtSize { x: number; y: number }

function validSize(size: ArtSize): boolean {
  return Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0;
}

/** Include registered overhangs so wings/engines do not escape the scene. */
export function aircraftArtBounds(canvas: ArtSize, near: ArtRect): ArtRect {
  if (!validSize(canvas) || !validSize(near) || !Number.isFinite(near.x) || !Number.isFinite(near.y)) {
    throw new RangeError('Invalid aircraft art registration');
  }
  const x = Math.min(0, near.x), y = Math.min(0, near.y);
  return { x, y, width: Math.max(canvas.width, near.x + near.width) - x,
    height: Math.max(canvas.height, near.y + near.height) - y };
}

/** Fit once, bottom-centred. Both view modes reserve the same complete bounds. */
export function fitAircraftArt(viewport: ArtSize, canvas: ArtSize, near: ArtRect) {
  const bounds = aircraftArtBounds(canvas, near);
  const width = Number.isFinite(viewport.width) ? Math.max(0, viewport.width) : 0;
  const height = Number.isFinite(viewport.height) ? Math.max(0, viewport.height) : 0;
  const scale = Math.min(width / bounds.width, height / bounds.height);
  return { x: (width - bounds.width * scale) / 2 - bounds.x * scale,
    y: height - bounds.height * scale - bounds.y * scale,
    width: canvas.width * scale, height: canvas.height * scale, scale };
}

/** Rectangles stay in artwork pixels until their common parent is fitted. */
export function aircraftRectStyle(rect: ArtRect, canvas: ArtSize) {
  return { left: `${rect.x / canvas.width * 100}%`, top: `${rect.y / canvas.height * 100}%`,
    width: `${rect.width / canvas.width * 100}%`, height: `${rect.height / canvas.height * 100}%` };
}
