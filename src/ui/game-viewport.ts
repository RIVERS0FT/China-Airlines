/** All UI dimensions are measured in a 900-unit short-edge design space.
 * Only the aspect ratio affects layout; actual CSS pixels affect scale alone. */
export const DESIGN_SHORT_EDGE = 900;
export interface ViewportLayout { width: number; height: number; scale: number }

export function viewportLayout(width: number, height: number, uiScale = 1): ViewportLayout {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new RangeError('Viewport dimensions must be finite and positive');
  if (!Number.isFinite(uiScale) || uiScale <= 0)
    throw new RangeError('UI scale must be finite and positive');
  const scale = Math.min(width, height) / DESIGN_SHORT_EDGE * uiScale;
  return { width: width / scale, height: height / scale, scale };
}

/** Pointer coordinates are physical CSS pixels; Pixi and scrollLeft use design units. */
export function logicalPoint(x: number, y: number,
  bounds: { left: number; top: number; width: number; height: number }, width: number, height: number) {
  return {
    x: bounds.width > 0 ? (x - bounds.left) * width / bounds.width : 0,
    y: bounds.height > 0 ? (y - bounds.top) * height / bounds.height : 0,
  };
}
