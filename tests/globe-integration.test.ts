import { describe, expect, it } from 'vitest';
import { aircraftSpecs, MODELS } from '../src/core/catalog.js';
import { GameCore, loadSummary, manifest, orderReward, validateSave } from '../src/core/game.js';
import { validateV5 } from '../src/core/save-v5.js';
import aggregated from './fixtures/v5-flying.json';
import unitFlying from './fixtures/v5-unit-flying.json';
import unitServicing from './fixtures/v5-unit-servicing.json';
const NOW = 1_800_000_000_000;

describe('world integration keeps the shipped unit-order starter', () => {
  it('keeps six passenger seats, one cargo slot and nine shop models across a v6 reload', () => {
    const core = new GameCore(NOW);
    expect(core.snapshot().orders.every(o => o.amount === 1)).toBe(true);
    core.execute({ type: 'load-destination', planeId: 'AC0001', to: 'PVG' }, NOW);
    const saved = core.snapshot(), plane = saved.fleet[0]!;
    expect(plane.modelId).toBe('starter-lark');
    expect(aircraftSpecs(plane)).toMatchObject({ seats: 6, cargo: 1 });
    expect(loadSummary(saved, plane.id)).toEqual({ passengers: 6, cargo: 1 });
    expect(MODELS).toHaveLength(9);
    expect(MODELS.some(m => m.id === plane.modelId)).toBe(false);
    expect(new GameCore(NOW, saved).snapshot()).toEqual(saved);
  });

  it.each([aggregated, unitFlying, unitServicing])('migrates each shipped v5 variant without changing any field except version', old => {
    const original = structuredClone(old);
    expect(validateV5(old)).toEqual(original);
    const saved = validateSave(old);
    expect(saved).toEqual({ ...original, version: 6 });
    expect(old).toEqual(original);
    expect(validateSave(saved)).toEqual(saved);
  });

  it('does not shrink a historical lark or split its aggregated passengers', () => {
    const saved = validateSave(aggregated), plane = saved.fleet[0]!;
    expect(plane.modelId).toBe('lark');
    expect(aircraftSpecs(plane).seats).toBeGreaterThanOrEqual(70);
    expect(manifest(saved, plane.id).some(o => o.amount > 1)).toBe(true);
    expect(saved.orders).toEqual(aggregated.orders);
  });

  it('completes an imported unit-starter flight exactly once with its locked revenue', () => {
    const core = GameCore.imported(unitFlying, NOW), before = core.snapshot(), flight = before.fleet[0]!.flight!;
    const arrival = NOW + (flight.arriveAt - before.simTime) * 1000;
    core.tick(arrival);
    expect(core.snapshot().credits).toBe(before.credits + flight.revenue);
    expect(core.snapshot().stats.passengers).toBe(before.stats.passengers + 6);
    expect(core.snapshot().fleet[0]!.energy.reservedSeconds).toBe(0);
    const after = core.snapshot();
    expect(core.tick(arrival).revenue).toBe(0);
    expect(core.snapshot()).toEqual(after);
    expect(validateSave(after)).toEqual(after);
  });

  it('preserves a v5 starter service deadline and never gives early or repeated energy', () => {
    const core = GameCore.imported(unitServicing, NOW), before = core.snapshot(), plane = before.fleet[0]!;
    const completion = NOW + (plane.energy.serviceUntil! - before.simTime) * 1000;
    core.tick(completion - 1000);
    expect(core.snapshot().fleet[0]!.energy.availableSeconds).toBe(plane.energy.availableSeconds);
    core.tick(completion);
    expect(core.snapshot().fleet[0]!.energy).toEqual({ availableSeconds: 14400, reservedSeconds: 0, serviceUntil: null });
    expect(core.snapshot().credits).toBe(before.credits);
    const after = core.snapshot(); core.tick(completion); expect(core.snapshot()).toEqual(after);
  });

  it('rejects overloaded v5 starter manifests instead of validating them as a 70-seat aircraft', () => {
    const bad = structuredClone(unitFlying), order = bad.orders.find(o => o.location === 'AC0001' && o.kind === 'passengers')!;
    order.amount += 1;
    order.reward = orderReward(order.from, order.to, 'passengers', order.amount);
    const flight = bad.fleet[0]!.flight!;
    flight.passengers += 1;
    flight.revenue = bad.orders.filter(o => o.location === 'AC0001').reduce((sum, o) => sum + o.reward, 0);
    expect(() => validateV5(bad)).toThrow();
    expect(() => validateSave(bad)).toThrow();
  });

  it('does not widen historical model or airport registries while adding v6 support', () => {
    const foreign = structuredClone(unitFlying); foreign.airports.push({ id: 'ICN', level: 1 });
    expect(() => validateSave(foreign)).toThrow();
    const oldV4 = { ...unitFlying, version: 4, fleet: unitFlying.fleet.map(({ energy: _energy, ...p }) => p) };
    expect(() => validateSave(oldV4)).toThrow();
    const unknown = new GameCore(NOW).snapshot(); unknown.fleet[0]!.modelId = 'unknown-model';
    expect(() => validateSave(unknown)).toThrow();
  });
});
