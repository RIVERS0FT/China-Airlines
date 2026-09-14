/** Label geometry uses logical game pixels, never physical screen dimensions. */
export interface MapBox { x: number; y: number; w: number; h: number }
interface ClientBox { left: number; top: number; width: number; height: number }

export function clientBoxToMap(box: ClientBox, viewport: ClientBox, width: number, height: number): MapBox {
  const sx = viewport.width > 0 ? width / viewport.width : 1;
  const sy = viewport.height > 0 ? height / viewport.height : 1;
  return { x: (box.left - viewport.left) * sx, y: (box.top - viewport.top) * sy, w: box.width * sx, h: box.height * sy };
}

export function canPlaceMapLabel(box: MapBox, width: number, height: number, overlays: readonly MapBox[], occupied: readonly MapBox[]): boolean {
  if (box.x < 5 || box.y < 5 || box.x + box.w > width - 5 || box.y + box.h > height - 5) return false;
  const overlaps = (other: MapBox) => box.x < other.x + other.w + 4 && box.x + box.w + 4 > other.x
    && box.y < other.y + other.h + 3 && box.y + box.h + 3 > other.y;
  return !overlays.some(overlaps) && !occupied.some(overlaps);
}
