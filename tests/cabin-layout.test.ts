import { describe, expect, it } from 'vitest';
import { GameCore, manifest, waiting, validateSave } from '../src/core/game.js';
import { aircraftSpecs } from '../src/core/catalog.js';
import { cabinLayout, cabinPage, orderArtFile } from '../src/ui/cabin-layout.js';
import { passengerFrame } from '../src/ui/passenger-art.js';
import { cabinArtLayout, cabinAnchors, cabinPlacement } from '../src/ui/cabin-art-layout.js';
import { ALL_MODELS } from '../src/core/catalog.js';


const NOW = 1_800_000_000_000, ID = 'AC0001';

describe('real orders inside the aircraft', () => {
  it('aligns passenger hips to cushions, feet to the floor and cargo to pallet tops', () => {
    const core = new GameCore(NOW), state = core.snapshot();
    for (const order of waiting(state, 'PEK')) for (const [width, height] of [[120, 140], [240, 230]]) {
      const anchor = cabinAnchors(order.kind, width!, 8)[0]!;
      const p = cabinPlacement(anchor, width!, height!, order);
      expect(p.ground).toBeGreaterThan(height! * .65);
      expect(p.furnitureWidth).toBeLessThanOrEqual(width! * anchor.width);
      if (order.kind === 'passengers') {
        expect(p.occupantFoot).toBeCloseTo(p.ground);
        expect(p.occupantHip).toBeCloseTo(p.seatCushion!);
        expect(p.occupantHipX).toBeCloseTo(p.seatCushionX!);
        expect(p.occupantHeight).toBeGreaterThan(p.furnitureHeight * .95);
      } else {
        expect(p.occupantWidth).toBeLessThanOrEqual(p.furnitureWidth * .72);
        expect(p.occupantFoot).toBeCloseTo(p.palletTop!);
        expect(p.occupantHeight).toBeLessThanOrEqual(92);
      }
      expect(p.labelTop).toBeGreaterThan(p.ground);
    }
  });
  it('fits all six seated silhouettes and their horizontal contact points at narrow and wide sizes', () => {
    const order = waiting(new GameCore(NOW).snapshot(), 'PEK').find(o => o.kind === 'passengers')!;
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) for (const [width, height] of [[96, 140], [120, 180], [240, 230]]) {
      const anchor = cabinAnchors('passengers', width!, 8)[0]!;
      const p = cabinPlacement(anchor, width!, height!, { ...order, id });
      const frame = passengerFrame(id, 'seated');
      const left = width! * anchor.width / 2 + p.occupantOffsetX - p.occupantWidth / 2;
      const top = height! - p.occupantBottom - p.occupantHeight;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + p.occupantWidth).toBeLessThanOrEqual(width! * anchor.width);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(left + frame.anchors.hipX * p.occupantWidth).toBeCloseTo(p.seatCushionX!);
      expect(top + frame.anchors.hipY! * p.occupantHeight).toBeCloseTo(p.seatCushion!);
      expect(top + frame.anchors.footY * p.occupantHeight).toBeCloseTo(p.ground);
    }
  });
  it('keeps short stacked decks on the floor with cargo fully above its pallet and captions below',()=>{
    const state=new GameCore(NOW).snapshot();
    for(const order of waiting(state,'PEK'))for(const height of [56,77,89,140]){
      const p=cabinPlacement(cabinAnchors(order.kind,110,8)[0]!,110,height,order);
      expect(p.ground).toBeGreaterThan(height*.55);expect(p.ground).toBeLessThan(height);
      expect(height-p.occupantBottom-p.occupantHeight).toBeGreaterThanOrEqual(0);
      expect(p.labelTop+(height<90?14:44)).toBeLessThanOrEqual(height+.01);
    }
  });
  it('keeps every current model mapped to an in-bounds left-facing cabin', () => {
    for (const aircraft of ALL_MODELS) {
      const art = cabinArtLayout({ modelId: aircraft.id });
      expect(art.direction).toBe('left');
      expect(art.interior.x).toBeGreaterThan(0);
      expect(art.interior.y).toBeGreaterThan(0);
      expect(art.interior.x + art.interior.width).toBeLessThan(art.canvas.width);
      expect(art.interior.y + art.interior.height).toBeLessThan(art.canvas.height);
      for (const width of [96, 240, 480, 1200]) {
        for (const kind of ['passengers', 'cargo'] as const) {
          const anchors = cabinAnchors(kind, width, art.maxAnchors);
          expect(new Set(anchors.map(a => a.id)).size).toBe(anchors.length);
          expect(anchors.length).toBeLessThanOrEqual(art.maxAnchors);
          for (const [i, anchor] of anchors.entries()) {
            expect(anchor.x - anchor.width / 2).toBeGreaterThanOrEqual(-1e-12);
            expect(anchor.x + anchor.width / 2).toBeLessThanOrEqual(1 + 1e-12);
            expect(anchor.width * width).toBeGreaterThanOrEqual(96);
            if (i) expect(anchor.x - anchor.width / 2).toBeCloseTo(anchors[i - 1]!.x + anchors[i - 1]!.width / 2);
          }
        }
      }
    }
  });

  it('reflows anchor pages without losing or duplicating real loaded orders', () => {
    const core = new GameCore(NOW);
    core.execute({ type: 'load-destination', planeId: ID, to: 'PVG' }, NOW);
    const state = core.snapshot(), before = structuredClone(state), art = cabinArtLayout(state.fleet[0]!);
    for (const deck of cabinLayout(state, state.fleet[0]!)) for (const width of [96, 240, 900]) {
      const size = cabinAnchors(deck.kind, width, art.maxAnchors).length;
      const pages = cabinPage(deck, 0, size).pages;
      const ids = Array.from({ length: pages }, (_, i) => cabinPage(deck, i, size).items).flat().flatMap(item => item.order ? [item.order.id] : []);
      expect(ids).toEqual(deck.orders.map(order => order.id));
    }
    expect(state).toEqual(before);
  });
  it('starts empty, moves the same artwork and order in/out, and never mutates the snapshot', () => {
    const core = new GameCore(NOW), initial = core.snapshot(), order = waiting(initial, 'PEK')[0]!;
    expect(cabinLayout(initial, initial.fleet[0]!)).toMatchObject([
      { kind: 'passengers', capacity: 3, used: 0, orders: [] },
      { kind: 'cargo', capacity: 2, used: 0, orders: [] },
    ]);
    core.execute({ type: 'load', planeId: ID, orderId: order.id }, NOW);
    const loaded = core.snapshot(), before = structuredClone(loaded);
    const deck = cabinLayout(loaded, loaded.fleet[0]!)[0]!;
    expect(cabinPage(deck, 0, 3).items.map(item => item.order?.id ?? null)).toEqual([order.id, null, null]);
    expect(orderArtFile(deck.orders[0]!)).toBe(orderArtFile(order));
    const standing = passengerFrame(order.id, 'standing'), seated = passengerFrame(deck.orders[0]!.id, 'seated');
    expect(seated.variant).toBe(standing.variant);
    expect(seated.viewBox).not.toBe(standing.viewBox);
    expect(loaded).toEqual(before);
    core.execute({ type: 'unload', planeId: ID, orderId: order.id }, NOW);
    const unloaded = core.snapshot();
    expect(cabinLayout(unloaded, unloaded.fleet[0]!)[0]!.used).toBe(0);
    expect(waiting(unloaded, 'PEK').some(item => item.id === order.id)).toBe(true);
    expect(passengerFrame(waiting(unloaded, 'PEK').find(item => item.id === order.id)!.id, 'standing')).toEqual(standing);
    expect(unloaded.credits).toBe(initial.credits);
  });

  it('isolates other aircraft, respects upgrades and omits nonexistent compartments', () => {
    const core = new GameCore(NOW);
    core.execute({ type: 'load-destination', planeId: ID, to: 'PVG' }, NOW);
    core.execute({ type: 'buy', modelId: 'swift-f', airportId: 'PEK' }, NOW);
    const state = core.snapshot(), cargoPlane = state.fleet[1]!;
    expect(cabinLayout(state, cargoPlane)).toEqual([{ kind: 'cargo', capacity: 3, used: 0, orders: [] }]);
    cargoPlane.modelId = 'swift-p'; cargoPlane.upgrades.capacity = 2;
    expect(cabinLayout(state, cargoPlane)).toEqual([{ kind: 'passengers', capacity: 12, used: 0, orders: [] }]);
  });

  it('pages every order and empty slot without changing capacity or the snapshot', () => {
    const core = new GameCore(NOW), state = core.snapshot(), plane = state.fleet[0]!;
    plane.upgrades.capacity = 9;
    const enlarged = new GameCore(NOW, validateSave(state));
    enlarged.execute({ type: 'load-destination', planeId: ID, to: 'PVG' }, NOW);
    const loaded = enlarged.snapshot(), before = structuredClone(loaded);
    for (const deck of cabinLayout(loaded, loaded.fleet[0]!)) {
      const visible = Array.from({ length: cabinPage(deck, 0, 3).pages }, (_, index) => cabinPage(deck, index, 3).items).flat();
      expect(visible.filter(item => item.order).map(item => item.order!.id)).toEqual(deck.orders.map(order => order.id));
      expect(visible.filter(item => !item.order)).toHaveLength(deck.capacity - deck.used);
      expect(cabinPage(deck, 1000, 3).page).toBe(cabinPage(deck, 0, 3).pages - 1);
      expect(cabinPage(deck, -1, 3).page).toBe(0);
    }
    expect(loaded).toEqual(before);
  });

  it('keeps aggregate orders on current aircraft intact and counts their actual occupied capacity', () => {
    const c=new GameCore(NOW);c.execute({type:'load-destination',planeId:ID,to:'PVG'},NOW);
    const state=c.snapshot(), jobs=state.orders.filter(o=>o.location===ID&&o.kind==='passengers');
    jobs[0]!.amount=jobs.length;jobs[0]!.reward=jobs.reduce((n,o)=>n+o.reward,0);state.orders=state.orders.filter(o=>!jobs.slice(1).includes(o));
    const before=structuredClone(state),plane=state.fleet[0]!;
    for (const deck of cabinLayout(state, plane)) {
      expect(deck.used).toBe(manifest(state, plane.id).filter(order => order.kind === deck.kind).reduce((sum, order) => sum + order.amount, 0));
      expect(cabinPage(deck, 0, 12).free).toBe((deck.kind === 'passengers' ? aircraftSpecs(plane).seats : aircraftSpecs(plane).cargo) - deck.used);
    }
    expect(cabinLayout(state, plane)[0]!.orders[0]!.amount).toBe(3);
    expect(state).toEqual(before);
  });
});
