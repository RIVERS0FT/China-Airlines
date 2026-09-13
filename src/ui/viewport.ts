/** UI-only dimensions: never use device pixels or game/save state for layout. */
export const DESIGN_HEIGHT = 720;
export const DEFAULT_UI_SCALE = 100;
export const MIN_UI_SCALE = 75;
export const MAX_UI_SCALE = 150;
export const UI_SCALE_STEP = 5;
export const UI_SCALE_KEY = 'china-airlines:ui-scale:v1';

export function normalizeUiScale(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_UI_SCALE;
  return Math.max(MIN_UI_SCALE, Math.min(MAX_UI_SCALE, Math.round(value / UI_SCALE_STEP) * UI_SCALE_STEP));
}
export function parseUiScale(value: string | null): number {
  return value !== null && /^\d+(?:\.\d+)?$/.test(value) ? normalizeUiScale(Number(value)) : DEFAULT_UI_SCALE;
}
export function viewportLayout(width: number, height: number, uiScale = DEFAULT_UI_SCALE) {
  const w = Number.isFinite(width) && width > 0 ? width : 1280;
  const h = Number.isFinite(height) && height > 0 ? height : DESIGN_HEIGHT;
  const scale = h / DESIGN_HEIGHT * normalizeUiScale(uiScale) / 100;
  return { width: w / scale, height: h / scale, scale };
}
/** DOM pointer coordinates are physical CSS pixels; the rendered scene uses logical pixels. */
export function clientToLogical(x: number, y: number, rect: { left: number; top: number; width: number; height: number }, width: number, height: number) {
  return { x: (x - rect.left) * width / Math.max(1, rect.width), y: (y - rect.top) * height / Math.max(1, rect.height) };
}
