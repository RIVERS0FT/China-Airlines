import { model } from '../core/catalog.js';
import type { Plane, Order } from '../core/game.js';
import { passengerFrame } from './passenger-art.js';
import { cargoAppearance } from './cargo-art.js';
import layerLayouts from './aircraft-layer-layouts.json';

export type CabinFamily = 'light' | 'regional' | 'heavy';
export interface CabinAnchor {
  id: string;
  kind: Order['kind'];
  /** Local coordinates inside the deck's usable floor, normalized to 0..1. */
  x: number;
  floorY: number;
  width: number;
  z: number;
}
export interface CabinArtLayout {
  modelId: string;
  family: CabinFamily;
  direction: 'left';
  hull: string;
  near: string;
  nearBounds: { x: number; y: number; width: number; height: number };
  /** Original left-facing artwork canvas. Interior rectangle in canvas pixels. */
  canvas: { width: number; height: number };
  interior: { x: number; y: number; width: number; height: number };
  maxAnchors: number;
}


const SEAT = {
  width: 678, height: 804,
  floorY: 796 / 804,
  /** Contact on the shallow cushion plane, measured in the cropped v3 sprite. */
  cushionX: 305 / 678, cushionY: 603 / 804,
} as const;
const PALLET = { width: 787, height: 237, floorY: 228 / 237, topX: .5, topY: 78 / 237 } as const;

/** Artwork selection never alters the model or its effective capacity. */
export function cabinArtLayout(plane: Pick<Plane, 'modelId'>): CabinArtLayout {
  const aircraft = model(plane.modelId);
  const registered = layerLayouts[aircraft.id as keyof typeof layerLayouts];
  const family = registered.family as CabinFamily;
  return { modelId: aircraft.id, family, direction: 'left',
    hull: `aircraft-${aircraft.id}-cutaway-v4.png`, near: `aircraft-${aircraft.id}-near-v4.png`,
    canvas: { width: 1536, height: 590 }, interior: registered.interior,
    nearBounds: registered.nearBounds, maxAnchors: family === 'light' ? 8 : family === 'regional' ? 10 : 12 };
}

/** A responsive template of reusable anchor positions; never allocates full upgraded capacity. */
export function cabinAnchors(kind: Order['kind'], logicalWidth: number, limit: number): CabinAnchor[] {
  const width = Number.isFinite(logicalWidth) ? Math.max(0, logicalWidth) : 0;
  const count = Math.max(1, Math.min(limit, Math.floor(width / 96)));
  return Array.from({ length: count }, (_, i) => ({
    id: `${kind}-${i + 1}`, kind, x: (i + .5) / count, floorY: .78,
    width: 1 / count, z: 2,
  }));
}

/** Pixel geometry for a shared ground contact; captions never move the sprites. */
export function cabinPlacement(anchor: CabinAnchor, deckWidth: number, deckHeight: number, order: Order | null) {
  const slotWidth = deckWidth * anchor.width;
  // Choose a ground line inside the painted floor, with a separate caption lane.
  const ground = Math.min(deckHeight * anchor.floorY, deckHeight - (deckHeight < 90 ? 16 : 46));
  const availableHeight = Math.max(1, ground - deckHeight * .08);
  const frame = order ? order.kind === 'passengers' ? passengerFrame(order.id, 'seated') : cargoAppearance(order) : null;
  const ratio = frame ? frame.width / frame.height : anchor.kind === 'passengers' ? .62 : 1;
  if (anchor.kind === 'passengers') {
    const rearRatio = SEAT.width / SEAT.height;
    const anchors = frame && 'anchors' in frame ? frame.anchors : { hipX: .55, hipY: .78, footY: .985 };
    const hipY = anchors.hipY ?? .78, footY = anchors.footY;
    // Scale from hip-to-foot distance, then place the transparent frame so the
    // actual foot anchor touches the floor. This replaces the old equal-height
    // shortcut which made the person stand in front of the chair.
    const personScale = (SEAT.floorY - SEAT.cushionY) / (footY - hipY);
    // Fit both the chair and the actual person's frame before positioning;
    // CSS must not shrink one axis after the anatomical anchors are aligned.
    const furnitureHeight = Math.min(150, availableHeight * .95 / Math.max(1, personScale),
      slotWidth * .80 / Math.max(rearRatio, personScale * ratio));
    const cushionRise = furnitureHeight * (SEAT.floorY - SEAT.cushionY);
    const occupantHeight = cushionRise / (footY - hipY);
    const occupantBottom = deckHeight - ground - (1 - footY) * occupantHeight;
    const furnitureBottom = deckHeight - ground - (1 - SEAT.floorY) * furnitureHeight;
    const furnitureOffsetX = 0;
    const seatCushionX = slotWidth / 2 + (SEAT.cushionX - .5) * furnitureHeight * rearRatio;
    const occupantOffsetX = seatCushionX - slotWidth / 2 - (anchors.hipX - .5) * occupantHeight * ratio;
    const occupantHipX = slotWidth / 2 + occupantOffsetX + (anchors.hipX - .5) * occupantHeight * ratio;
    const occupantFoot = deckHeight - occupantBottom - occupantHeight + footY * occupantHeight;
    const occupantHip = deckHeight - occupantBottom - occupantHeight + hipY * occupantHeight;
    const seatCushion = ground - cushionRise;
    return { ground, occupantWidth: occupantHeight * ratio, occupantHeight, occupantBottom,
      occupantFoot, occupantHip, occupantHipX, occupantOffsetX, seatCushion, seatCushionX, palletTop: null,
      furnitureWidth: furnitureHeight * rearRatio, furnitureHeight, furnitureBottom,
      furnitureOffsetX,
      labelTop: ground + 2 };
  }
  const scale = frame && 'cabinVisualScale' in frame ? frame.cabinVisualScale : .84;
  const furnitureWidth = Math.min(slotWidth * .80, 118, availableHeight * .44 * PALLET.width / (PALLET.height * (PALLET.floorY - PALLET.topY)));
  const furnitureHeight = furnitureWidth * PALLET.height / PALLET.width;
  const maxCargoHeight = Math.min(92, availableHeight * .56);
  const occupantWidth = Math.min(furnitureWidth * .72 * scale, maxCargoHeight * ratio, 84);
  const palletTop = ground - furnitureHeight * (PALLET.floorY - PALLET.topY);
  return { ground, occupantWidth, occupantHeight: occupantWidth / ratio,
    occupantBottom: deckHeight - palletTop, occupantFoot: palletTop, occupantHip: null, occupantHipX: null,
    occupantOffsetX: (PALLET.topX - .5) * furnitureWidth, seatCushion: null, seatCushionX: null,
    furnitureWidth, furnitureHeight,
    furnitureBottom: deckHeight - ground - (1 - PALLET.floorY) * furnitureHeight,
    furnitureOffsetX: 0,
    palletTop, labelTop: ground + 2 };
}
