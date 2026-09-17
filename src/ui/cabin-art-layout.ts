import { model } from '../core/catalog.js';
import type { Plane, Order } from '../core/game.js';
import { passengerFrame } from './passenger-art.js';
import { cargoAppearance } from './cargo-art.js';
import layerLayouts from './aircraft-layer-layouts.json';
import format from './aircraft-canvas.json';

export type CabinFamily = 'light' | 'regional' | 'heavy';
export interface CabinAnchor { id: string; kind: Order['kind']; x: number; floorY: number; width: number; z: number }
export interface PaintedDeck { x: number; y: number; width: number; height: number; floorY: number; count: number }
export interface CabinArtLayout {
  modelId: string; family: CabinFamily; direction: 'left'; hull: string; exterior: string;
  canvas: { width: number; height: number };
  interior: { x: number; y: number; width: number; height: number };
  decks: Partial<Record<Order['kind'], PaintedDeck>>;
}
const SEAT = { width: 678, height: 804, floorY: 796 / 804, cushionX: 305 / 678, cushionY: 603 / 804 } as const;
const PALLET = { width: 787, height: 237, floorY: 228 / 237, topX: .5, topY: 78 / 237 } as const;
// The six consecutive IDs cover the atlas's six stable appearance buckets.
// Fit this common envelope once, not the particular occupant currently aboard.
const silhouettes = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => {
  const frame = passengerFrame(id, 'seated'), { hipX, hipY, footY } = frame.anchors;
  const scale = (SEAT.floorY - SEAT.cushionY) / (footY - hipY!);
  const width = scale * frame.width / frame.height;
  const offset = (SEAT.cushionX - .5) * SEAT.width / SEAT.height - (hipX - .5) * width;
  return { scale, halfWidth: Math.abs(offset) + width / 2 };
});
const envelopeHeight = Math.max(1, ...silhouettes.map(frame => frame.scale));
const envelopeWidth = Math.max(SEAT.width / SEAT.height, ...silhouettes.map(frame => frame.halfWidth * 2));

/** Registered PNGs share their full canvas; registration metadata is build-time only. */
export function cabinArtLayout(plane: Pick<Plane, 'modelId'>): CabinArtLayout {
  const aircraft = model(plane.modelId), registered = layerLayouts[aircraft.id as keyof typeof layerLayouts];
  const family = registered.family as CabinFamily;
  const revision = 'revision' in registered ? registered.revision : 'v4';
  return { modelId: aircraft.id, family, direction: 'left',
    hull: `aircraft-${aircraft.id}-cutaway-${revision}.png`, exterior: `aircraft-${aircraft.id}-exterior-${revision}.png`,
    canvas: format.canvas, interior: registered.interior, decks: registered.decks };
}

export function paintedDeck(art: CabinArtLayout, kind: Order['kind']): PaintedDeck {
  const deck = art.decks[kind];
  if (!deck) throw new Error(`Missing ${kind} coordinates for ${art.modelId}`);
  return deck;
}
export function paintedAnchors(art: CabinArtLayout, kind: Order['kind']): CabinAnchor[] {
  const deck = paintedDeck(art, kind);
  return Array.from({ length: deck.count }, (_, i) => ({ id: `${kind}-${i + 1}`, kind,
    x: (i + .5) / deck.count, width: 1 / deck.count, floorY: (deck.floorY - deck.y) / deck.height, z: 2 }));
}
export function fitAircraft(width: number, height: number, canvas = format.canvas) {
  const usableWidth = Number.isFinite(width) ? Math.max(0, width) : 0;
  const usableHeight = Number.isFinite(height) ? Math.max(0, height - 44) : 0;
  const scale = Math.min(usableWidth / canvas.width, usableHeight / canvas.height);
  return { scale, left: (usableWidth - canvas.width * scale) / 2, top: Math.max(0, usableHeight - canvas.height * scale) };
}

/** Furniture is fixed before resolving a passenger/cargo sprite. Text has no input here. */
export function cabinPlacement(anchor: CabinAnchor, deckWidth: number, deckHeight: number, order: Order | null) {
  const slotWidth = deckWidth * anchor.width;
  const ground = deckHeight * anchor.floorY;
  const availableHeight = Math.max(1, ground - deckHeight * .05);
  const frame = order ? order.kind === 'passengers' ? passengerFrame(order.id, 'seated') : cargoAppearance(order) : null;
  const ratio = frame ? frame.width / frame.height : anchor.kind === 'passengers' ? .62 : 1;
  // Captions are below the load, so furniture can use the centered width of the slot.
  const furnitureOffsetX = 0;
  if (anchor.kind === 'passengers') {
    const rearRatio = SEAT.width / SEAT.height;
    const anatomy = frame && 'anchors' in frame ? frame.anchors : { hipX: .55, hipY: .78, footY: .985 };
    const hipY = anatomy.hipY ?? .78, footY = anatomy.footY;
    const furnitureHeight = Math.min(150, availableHeight * .95 / envelopeHeight, slotWidth * .82 / envelopeWidth);
    const cushionRise = furnitureHeight * (SEAT.floorY - SEAT.cushionY);
    const occupantHeight = cushionRise / (footY - hipY);
    const occupantBottom = deckHeight - ground - (1 - footY) * occupantHeight;
    const furnitureBottom = deckHeight - ground - (1 - SEAT.floorY) * furnitureHeight;
    const seatCushionX = slotWidth / 2 + furnitureOffsetX + (SEAT.cushionX - .5) * furnitureHeight * rearRatio;
    const occupantOffsetX = seatCushionX - slotWidth / 2 - (anatomy.hipX - .5) * occupantHeight * ratio;
    return { ground, occupantWidth: occupantHeight * ratio, occupantHeight, occupantBottom,
      occupantFoot: ground, occupantHip: ground - cushionRise, occupantHipX: seatCushionX,
      occupantOffsetX, seatCushion: ground - cushionRise, seatCushionX, palletTop: null,
      furnitureWidth: furnitureHeight * rearRatio, furnitureHeight, furnitureBottom, furnitureOffsetX };
  }
  const scale = frame && 'cabinVisualScale' in frame ? frame.cabinVisualScale : .84;
  const furnitureWidth = Math.min(slotWidth * .82, 150, availableHeight * .44 * PALLET.width / (PALLET.height * (PALLET.floorY - PALLET.topY)));
  const furnitureHeight = furnitureWidth * PALLET.height / PALLET.width;
  const maxCargoHeight = Math.min(92, availableHeight * .56);
  const occupantWidth = Math.min(furnitureWidth * .72 * scale, maxCargoHeight * ratio, 84);
  const palletTop = ground - furnitureHeight * (PALLET.floorY - PALLET.topY);
  return { ground, occupantWidth, occupantHeight: occupantWidth / ratio,
    occupantBottom: deckHeight - palletTop, occupantFoot: palletTop, occupantHip: null, occupantHipX: null,
    occupantOffsetX: furnitureOffsetX + (PALLET.topX - .5) * furnitureWidth, seatCushion: null, seatCushionX: null,
    furnitureWidth, furnitureHeight, furnitureBottom: deckHeight - ground - (1 - PALLET.floorY) * furnitureHeight,
    furnitureOffsetX, palletTop };
}
