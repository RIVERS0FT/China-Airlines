import { describe, expect, it } from 'vitest';
import { GameCore, manifest, waiting, validateSave } from '../src/core/game.js';
import { aircraftSpecs } from '../src/core/catalog.js';
import { cabinLayout, cabinPage, orderArtFile } from '../src/ui/cabin-layout.js';
import { passengerFrame } from '../src/ui/passenger-art.js';
import legacy from './fixtures/v1-flying.json';

const NOW = 1_800_000_000_000, ID = 'AC0001';

describe('real orders inside the aircraft', () => {
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

  it('keeps historical aggregate orders intact and counts their actual occupied capacity', () => {
    const state = validateSave(legacy), before = structuredClone(state), plane = state.fleet[0]!;
    for (const deck of cabinLayout(state, plane)) {
      expect(deck.used).toBe(manifest(state, plane.id).filter(order => order.kind === deck.kind).reduce((sum, order) => sum + order.amount, 0));
      expect(cabinPage(deck, 0, 12).free).toBe((deck.kind === 'passengers' ? aircraftSpecs(plane).seats : aircraftSpecs(plane).cargo) - deck.used);
    }
    expect(cabinLayout(state, plane)[0]!.orders[0]!.amount).toBe(56);
    expect(state).toEqual(before);
  });
});
