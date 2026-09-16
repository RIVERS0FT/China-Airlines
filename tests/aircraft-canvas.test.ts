import { describe, expect, it } from 'vitest';
import { ALL_MODELS } from '../src/core/catalog.js';
import { GameCore, waiting } from '../src/core/game.js';
import { cabinArtLayout, paintedAnchors, paintedDeck, cabinPlacement, fitAircraft } from '../src/ui/cabin-art-layout.js';
import { passengerFrame } from '../src/ui/passenger-art.js';

const orders = waiting(new GameCore(1_800_000_000_000).snapshot(), 'PEK');
describe('one aircraft canvas and fixed furniture', () => {
  it('uses one isotropic fit with a separate 44-logical-pixel footer, including unmeasured frames', () => {
    for (const [width, height] of [[1400, 500], [700, 400], [410, 220], [280, 150]]) {
      const fit = fitAircraft(width!, height!);
      expect(fit.scale).toBeCloseTo(Math.min(width! / 1536, (height! - 44) / 590));
      expect(fit.left).toBeGreaterThanOrEqual(-1e-10);
      expect(fit.top).toBeGreaterThanOrEqual(0);
      expect(fit.left + 1536 * fit.scale).toBeLessThanOrEqual(width! + 1e-10);
      expect(fit.top + 590 * fit.scale + 44).toBeCloseTo(height!);
    }
    for (const [width, height] of [[0, 0], [NaN, Infinity], [-1, -1], [400, 44]]) {
      const fit = fitAircraft(width!, height!);
      expect(fit.scale).toBe(0);
      expect(Object.values(fit).every(Number.isFinite)).toBe(true);
    }
  });
  for (const model of ALL_MODELS) it(`${model.id}: empty and all occupied slots keep the same furniture and painted floor`, () => {
    const art = cabinArtLayout({ modelId: model.id });
    for (const kind of ['passengers', 'cargo'] as const) {
      if (!art.decks[kind]) continue;
      const room = paintedDeck(art, kind), anchor = paintedAnchors(art, kind)[0]!;
      const order = orders.find(order => order.kind === kind)!;
      const empty = cabinPlacement(anchor, room.width, room.height, null);
      for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
        const place = cabinPlacement(anchor, room.width, room.height, { ...order, id });
        for (const key of ['ground', 'furnitureWidth', 'furnitureHeight', 'furnitureBottom', 'furnitureOffsetX'] as const) expect(place[key]).toBe(empty[key]);
        expect(room.y + place.ground).toBeCloseTo(room.floorY);
        expect(room.height - place.occupantBottom - place.occupantHeight).toBeGreaterThanOrEqual(0);
        const left = room.width * anchor.width / 2 + place.occupantOffsetX - place.occupantWidth / 2;
        expect(left).toBeGreaterThanOrEqual(0);
        expect(place.furnitureOffsetX).toBe(0);
        expect(left + place.occupantWidth).toBeLessThanOrEqual(room.width * anchor.width);
        if (kind === 'passengers') {
          const anatomy = passengerFrame(id, 'seated').anchors;
          const top = room.height - place.occupantBottom - place.occupantHeight;
          expect(top + anatomy.hipY! * place.occupantHeight).toBeCloseTo(place.seatCushion!);
          expect(top + anatomy.footY * place.occupantHeight).toBeCloseTo(place.ground);
          expect(left + anatomy.hipX * place.occupantWidth).toBeCloseTo(place.seatCushionX!);
        } else expect(place.occupantFoot).toBeCloseTo(place.palletTop!);
      }
    }
  });
  it('uses every model capacity as its reviewed cabin rhythm', () => {
    for (const model of ALL_MODELS) {
      const art = cabinArtLayout({ modelId: model.id });
      if (model.seats) expect(paintedAnchors(art, 'passengers'), model.id).toHaveLength(model.seats);
      else expect(art.decks.passengers, model.id).toBeUndefined();
      if (model.cargo) expect(paintedAnchors(art, 'cargo'), model.id).toHaveLength(model.cargo);
      else expect(art.decks.cargo, model.id).toBeUndefined();
      const revision = 'v7';
      expect(art.hull, model.id).toBe(`aircraft-${model.id}-cutaway-${revision}.png`);
      expect(art.exterior, model.id).toBe(`aircraft-${model.id}-exterior-${revision}.png`);
      expect(model.art, model.id).toBe(art.exterior);
    }
  });
});
