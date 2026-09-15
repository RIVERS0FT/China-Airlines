/** Pixel bounds in the approved original atlas; no APK artwork is bundled. */
const FRAMES = [
  { standing: [55, 34, 228, 465], seated: [57, 508, 221, 366] },
  { standing: [342, 52, 235, 447], seated: [346, 518, 227, 357] },
  { standing: [621, 44, 221, 456], seated: [627, 513, 214, 362] },
  { standing: [933, 49, 202, 451], seated: [933, 514, 196, 362] },
  { standing: [1190, 52, 264, 447], seated: [1192, 516, 255, 358] },
  { standing: [1506, 49, 215, 451], seated: [1509, 516, 209, 360] },
] as const;

/** Normalized anatomy anchors inside each seated frame. The slight per-person
 * adjustment follows the approved atlas silhouettes; these are render-only and
 * never become seat assignments or save data. */
const SEATED_ANCHORS = [
  { hipX: .55, hipY: .77, footY: .985 },
  { hipX: .54, hipY: .79, footY: .985 },
  { hipX: .56, hipY: .78, footY: .985 },
  { hipX: .54, hipY: .78, footY: .985 },
  { hipX: .52, hipY: .81, footY: .985 },
  { hipX: .58, hipY: .79, footY: .985 },
] as const;

export type PassengerPose = 'standing' | 'seated';

export function passengerFrame(orderId: string, pose: PassengerPose) {
  // Preserve the existing order-ID assignment across loading, refresh and saves.
  const index = Array.from(orderId).reduce((sum, char) => sum + char.charCodeAt(0), 0) % FRAMES.length;
  const [x, y, width, height] = FRAMES[index]![pose];
  return { variant: index + 1, x: x - 4, y: y - 4, width: width + 8, height: height + 8,
    viewBox: `${x - 4} ${y - 4} ${width + 8} ${height + 8}`,
    anchors: pose === 'seated' ? SEATED_ANCHORS[index]! : { hipX: .5, hipY: null, footY: .99 } };
}
