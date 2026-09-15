import { describe, expect, it } from 'vitest';
import { cargoAppearance } from '../src/ui/cargo-art.js';
import { CARGO_ART } from '../src/ui/cargo-art-catalog.js';
import { MATERIALS } from '../src/core/career-catalog.js';
import { GameCore, validateSave, waiting } from '../src/core/game.js';

const NOW = 1_800_000_000_000;
describe('reference cargo categories are decoration', () => {
  it('covers 24 categories through existing services, with stable assignment', () => {
    const seen = new Set<string>();
    for (const service of ['general', 'express', 'cold', 'industrial']) for (let id = 100; id < 1100; id++) {
      const order = { id: `JB${id}`, service, product: null };
      const art = cargoAppearance(order);
      seen.add(art.key);
      expect(art.cabinVisualScale).toBeGreaterThanOrEqual(.68);
      expect(art.cabinVisualScale).toBeLessThanOrEqual(.88);
      expect(cargoAppearance(JSON.parse(JSON.stringify(order)))).toEqual(art);
    }
    expect(seen.size).toBe(24);
    expect(seen).toEqual(new Set(Object.keys(CARGO_ART)));
  });

  it('preserves every exact inventory material name instead of substituting a decorative cargo name', () => {
    for (const [product, name] of Object.entries(MATERIALS)) {
      expect(cargoAppearance({ id: 'JB42', service: 'general', product: product as keyof typeof MATERIALS }).name).toBe(name);
    }
  });

  it('retains names and artwork through actual load, save and unload without touching price or service', () => {
    const core = new GameCore(NOW), initial = core.snapshot();
    const order = waiting(initial, 'PEK').find(order => order.kind === 'cargo')!;
    const art = cargoAppearance(order), before = structuredClone(order);
    expect(order).toEqual(before);
    core.execute({ type: 'load', planeId: 'AC0001', orderId: order.id }, NOW);
    const restored = new GameCore(NOW, validateSave(JSON.parse(JSON.stringify(core.snapshot()))));
    const loaded = restored.snapshot().orders.find(item => item.id === order.id)!;
    expect(cargoAppearance(loaded)).toEqual(art);
    expect(loaded).toMatchObject({ reward: order.reward, service: order.service, amount: order.amount });
    restored.execute({ type: 'unload', planeId: 'AC0001', orderId: order.id }, NOW);
    // Existing loading rules remove the waiting expiry even after unloading.
    expect(restored.snapshot().orders.find(item => item.id === order.id)).toEqual({ ...before, expiresAt: null });
    expect(restored.snapshot().credits).toBe(initial.credits);
  });
});
