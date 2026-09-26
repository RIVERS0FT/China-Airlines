import { describe, expect, it } from 'vitest';
import { GameCore, manifest, waiting, type Command } from '../../src/core/game.js';
import { orderPresentation } from '../../src/ui/order-presentation.js';

const NOW = 1_800_000_000_000, PLANE = 'AC0001';
function purchased() {
 const core = new GameCore(NOW);
 core.execute({type:'unlock',airportId:'PVG'},NOW);
 core.execute({type:'buy',modelId:'diamond-da40',airportId:'PEK',passengers:1,cargo:0},NOW);
 return core;
}
describe('loading permissions match real command outcomes', () => {
  it('blocks an unconfigured cabin, permits real loading after allocation, and blocks the next passenger at capacity', () => {
    const core = purchased();
    core.execute({type:'allocate-cabin',planeId:PLANE,passengers:0,cargo:0},NOW);
    const initial = core.snapshot(), order = initial.orders.find(item => item.kind === 'passengers')!;
    expect(orderPresentation(initial, initial.fleet[0], order)).toMatchObject({ state: 'blocked', disabled: true });
    expect(() => core.execute({ type: 'load', planeId: PLANE, orderId: order.id }, NOW)).toThrow();
    expect(core.snapshot()).toEqual(initial);
    core.execute({ type: 'allocate-cabin', planeId: PLANE, passengers: 1, cargo: 0 }, NOW);
    let state = core.snapshot();
    expect(orderPresentation(state, state.fleet[0], order)).toMatchObject({ state: 'waiting', disabled: false });
    core.execute({ type: 'load', planeId: PLANE, orderId: order.id }, NOW);
    state = core.snapshot();
    expect(manifest(state, PLANE).map(item => item.id)).toEqual([order.id]);
    expect(orderPresentation(state, state.fleet[0], manifest(state, PLANE)[0]!)).toMatchObject({ state: 'loaded', aboard: true, disabled: false });
    const next = waiting(state, 'PEK').find(item => item.kind === 'passengers')!;
    expect(orderPresentation(state, state.fleet[0], next)).toMatchObject({ state: 'blocked', disabled: true });
    expect(() => core.execute({ type: 'load', planeId: PLANE, orderId: next.id }, NOW)).toThrow();
    expect(core.snapshot()).toEqual(state);
  });

  it.each(['flying', 'service'] as const)('preserves loaded order identities and rejects manual unload during %s', phase => {
    const core = purchased();
    core.execute({ type: 'load-destination', planeId: PLANE, to: 'PVG' }, NOW);
    if (phase === 'service') {
      core.execute({ type: 'dispatch', planeId: PLANE, to: 'PVG', auto: false }, NOW);
      const deadline = core.snapshot().fleet[0]!.flight!.arriveAt + 8;
      core.tick(NOW + deadline * 1000);
      core.execute({ type: 'load-destination', planeId: PLANE, to: 'PEK' }, NOW + deadline * 1000);
    }
    const now = core.snapshot().lastWallTime;
    const commands: Record<typeof phase, Command> = {
      flying: { type: 'dispatch', planeId: PLANE, to: 'PVG', auto: false },
      service: { type: 'service-energy', planeId: PLANE },
    };
    core.execute(commands[phase], now);
    const state = core.snapshot(), order = manifest(state, PLANE)[0]!;
    expect(orderPresentation(state, state.fleet[0], order)).toMatchObject({ state: 'loaded', aboard: true, disabled: true });
    expect(() => core.execute({ type: 'unload', planeId: PLANE, orderId: order.id }, now)).toThrow();
    expect(core.snapshot()).toEqual(state);
  });
});
