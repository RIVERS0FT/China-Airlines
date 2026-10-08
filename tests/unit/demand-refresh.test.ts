import { describe, expect, it } from 'vitest';
import { GameCore, DEMAND_INTERVAL, MAX_WAITING, TURNAROUND, manifest, validateSave, waiting, type Command } from '../helpers/configured-game.js';

const NOW = 1_800_000_000_000;

function command(core: GameCore, action: Command) {
  core.execute(action, core.snapshot().lastWallTime);
}

function transferredOrder() {
  const core = new GameCore(NOW);
  const order = waiting(core.snapshot(), 'PEK')[0]!;
  command(core, { type: 'unlock', airportId: 'WUH' });
  command(core, { type: 'load', planeId: 'AC0001', orderId: order.id });
  command(core, { type: 'dispatch', planeId: 'AC0001', to: 'WUH', auto: false });
  const arrival = core.snapshot().fleet[0]!.flight!.arriveAt;
  core.tick(NOW + (arrival + TURNAROUND) * 1000);
  command(core, { type: 'unload', planeId: 'AC0001', orderId: order.id });
  return { core, order: waiting(core.snapshot(), 'WUH').find(item => item.id === order.id)! };
}

describe('airport-scoped manual demand refresh', () => {
  it('refreshes only the requested airport and leaves other gaps until the scheduled supply event', () => {
    const core = new GameCore(NOW);
    // Make a real supply gap in Shanghai by loading its own newly bought plane.
    command(core, { type: 'buy', modelId: 'diamond-da40', airportId: 'PVG', passengers: 1, cargo: 0 });
    const otherPlane = core.snapshot().fleet[1]!.id;
    const otherOrder = waiting(core.snapshot(), 'PVG').find(order => order.kind === 'passengers')!;
    command(core, { type: 'load', planeId: otherPlane, orderId: otherOrder.id });

    const accepted = waiting(core.snapshot(), 'PEK')[0]!;
    command(core, { type: 'load', planeId: 'AC0001', orderId: accepted.id });
    command(core, { type: 'unload', planeId: 'AC0001', orderId: accepted.id });
    const aboard = waiting(core.snapshot(), 'PEK').find(order => order.id !== accepted.id)!;
    command(core, { type: 'load', planeId: 'AC0001', orderId: aboard.id });
    const before = core.snapshot();
    expect(waiting(before, 'PVG')).toHaveLength(19);

    command(core, { type: 'refresh-demand', airportId: 'PEK' });
    const refreshed = core.snapshot();
    expect(refreshed.orders.filter(order => order.location !== 'PEK')).toEqual(before.orders.filter(order => order.location !== 'PEK'));
    expect(waiting(refreshed, 'PEK')).toHaveLength(18);
    expect(waiting(refreshed, 'PEK').find(order => order.id === accepted.id)).toEqual(before.orders.find(order => order.id === accepted.id));
    const replaced = new Set(waiting(before, 'PEK').filter(order => order.expiresAt !== null).map(order => order.id));
    expect(refreshed.orders.some(order => replaced.has(order.id))).toBe(false);
    expect(manifest(refreshed, 'AC0001')).toEqual(manifest(before, 'AC0001'));
    expect(refreshed.nextDemandAt).toBe(before.nextDemandAt);
    expect(refreshed.career.dailyBought['refresh-PEK']).toBe(1);
    expect(refreshed.career.dailyBought['refresh-PVG']).toBeUndefined();

    expect(validateSave(refreshed)).toEqual(refreshed);

    core.tick(NOW + (DEMAND_INTERVAL - 1) * 1000);
    expect(waiting(core.snapshot(), 'PVG')).toEqual(waiting(before, 'PVG'));
    core.tick(NOW + DEMAND_INTERVAL * 1000);
    expect(waiting(core.snapshot(), 'PVG')).toHaveLength(20);
    expect(core.snapshot().nextDemandAt).toBe(before.nextDemandAt + DEMAND_INTERVAL);
    expect(manifest(core.snapshot(), otherPlane)).toEqual(manifest(before, otherPlane));
    expect(validateSave(core.snapshot())).toEqual(core.snapshot());
  });

  it('preserves the same accepted transfer after a real flight and unloading', () => {
    const { core, order } = transferredOrder();
    const before = core.snapshot();
    expect(order).toMatchObject({ from: 'PEK', to: 'PVG', location: 'WUH', expiresAt: null });
    expect(before.stats.revenue).toBe(0);

    command(core, { type: 'refresh-demand', airportId: 'WUH' });
    const refreshed = core.snapshot();
    expect(refreshed.orders.find(item => item.id === order.id)).toEqual(order);
    expect(refreshed.orders.filter(item => item.location !== 'WUH')).toEqual(before.orders.filter(item => item.location !== 'WUH'));
    expect(refreshed.stats).toEqual(before.stats);
    expect(refreshed.credits).toBe(before.credits);
    expect(refreshed.nextDemandAt).toBe(before.nextDemandAt);
    expect(validateSave(refreshed)).toEqual(refreshed);
  });

  it('retains every accepted order in a full waiting area without exceeding capacity', () => {
    const { core, order } = transferredOrder();
    const state = core.snapshot();
    // A valid imported full transfer queue exercises the capacity boundary.
    state.orders = state.orders.filter(item => item.location !== 'WUH');
    for (let index = 0; index < MAX_WAITING; index++) {
      state.orders.push({ ...order, id: `JB${state.nextOrderId++}` });
    }
    const full = new GameCore(state.lastWallTime, state), before = full.snapshot();
    command(full, { type: 'refresh-demand', airportId: 'WUH' });
    const refreshed = full.snapshot();
    expect(waiting(refreshed, 'WUH')).toHaveLength(MAX_WAITING);
    expect(refreshed.orders).toEqual(before.orders);
    expect(refreshed.nextOrderId).toBe(before.nextOrderId);
    expect(refreshed.nextDemandAt).toBe(before.nextDemandAt);
    expect(refreshed.credits).toBe(before.credits);
    expect(validateSave(refreshed)).toEqual(refreshed);
  });
});
