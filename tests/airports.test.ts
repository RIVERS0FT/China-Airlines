import { describe, expect, it } from 'vitest';
import { GameCore, manifest, waiting } from '../src/core/game.js';
import { airportTraffic, airportDirectory, airportScene } from '../src/ui/airport-presentation.js';
import { orderBlockReason } from '../src/ui/order-presentation.js';
const NOW = 1_800_000_000_000;
function airborne() {
  const core = new GameCore(NOW);
  core.execute({ type: 'load-destination', planeId: 'AC0001', to: 'PVG' }, NOW);
  core.execute({ type: 'route', from: 'PEK', to: 'PVG' }, NOW);
  core.execute({ type: 'dispatch', planeId: 'AC0001', to: 'PVG', auto: false }, NOW);
  return core;
}
describe('read-only airport views', () => {
  it('counts people, tonnes and orders separately without changing any game state', () => {
    const state = new GameCore(NOW).snapshot(), original = structuredClone(state);
    const a = airportTraffic(state, 'PEK');
    expect(a.orders).toBe(12); expect(a.passengers).toBe(140); expect(a.cargo).toBe(4);
    expect(a.transfers).toBe(0); expect(a.destinations).toHaveLength(1);
    expect(a.parked.map(p => p.id)).toEqual(['AC0001']);
    expect(airportDirectory(state, 'all', '')).toHaveLength(50);
    expect(state).toEqual(original);
  });
  it('filters owned/unopened airports and matches trimmed city, code and region', () => {
    const s = new GameCore(NOW).snapshot();
    expect(airportDirectory(s, 'open', '')).toHaveLength(2);
    expect(airportDirectory(s, 'locked', '')).toHaveLength(48);
    for (const text of ['上海', ' pVg ', '华东']) expect(airportDirectory(s, 'open', text).map(a => a.id)).toEqual(['PVG']);
    expect(airportDirectory(s, 'locked', 'PVG')).toHaveLength(0);
    expect(airportDirectory(s, 'all', '不存在')).toHaveLength(0);
  });
  it('never invents demand for an unopened airport', () => {
    const a = airportTraffic(new GameCore(NOW).snapshot(), 'WUH');
    expect(a.level).toBe(0); expect(a.orders).toBe(0); expect(a.parked).toHaveLength(0);
  });
  it('does not count a departed aircraft as parked even when airportId is its origin', () => {
    const s = airborne().snapshot(), before = structuredClone(s);
    expect(s.fleet[0]!.airportId).toBe('PEK');
    expect(airportTraffic(s, 'PEK').parked).toHaveLength(0);
    expect(airportTraffic(s, 'PEK').outgoing).toHaveLength(1);
    expect(airportTraffic(s, 'PVG').incoming).toHaveLength(1);
    expect(airportTraffic(s, 'PVG').parked).toHaveLength(0);
    expect(s).toEqual(before);
  });
  it('updates incoming and parked groups after the core settles arrival, without a second payment', () => {
    const core = airborne(), arrival = core.snapshot().fleet[0]!.flight!.arriveAt;
    core.tick(NOW + arrival * 1000);
    const s = core.snapshot(), before = structuredClone(s);
    expect(airportTraffic(s, 'PVG').incoming).toHaveLength(0);
    expect(airportTraffic(s, 'PVG').parked).toHaveLength(1);
    expect(airportTraffic(s, 'PEK').outgoing).toHaveLength(0);
    expect(manifest(s, 'AC0001')).toHaveLength(0); expect(s).toEqual(before);
    expect(core.tick(NOW + arrival * 1000).revenue).toBe(0);
  });
  it('reports accepted transfer orders at the actual hub, not at the destination', () => {
    const core = new GameCore(NOW);
    core.execute({ type: 'unlock', airportId: 'WUH' }, NOW);
    core.execute({ type: 'load-destination', planeId: 'AC0001', to: 'PVG' }, NOW);
    core.execute({ type: 'route', from: 'PEK', to: 'WUH' }, NOW);
    core.execute({ type: 'dispatch', planeId: 'AC0001', to: 'WUH', auto: false }, NOW);
    const time = NOW + (core.snapshot().fleet[0]!.flight!.arriveAt + 8) * 1000;
    core.tick(time);
    const orders = manifest(core.snapshot(), 'AC0001');
    for (const o of orders) core.execute({ type: 'unload', planeId: 'AC0001', orderId: o.id }, time);
    const s = core.snapshot(), a = airportTraffic(s, 'WUH');
    expect(a.transfers).toBe(orders.length);
    expect(a.destinations.find(d => d.id === 'PVG')!.transfers).toBe(orders.length);
    expect(s.stats.revenue).toBe(0);
  });
});
describe('airport inspection is not aircraft movement', () => {
  it('shows no aircraft at an empty remote airport and retains the chosen plane elsewhere', () => {
    const s = new GameCore(NOW).snapshot(), before = structuredClone(s);
    const view = airportScene(s, 'AC0001', 'PVG');
    expect(view.airportId).toBe('PVG'); expect(view.plane).toBeUndefined(); expect(view.choices).toHaveLength(0);
    expect(view.selected.airportId).toBe('PEK'); expect(s).toEqual(before);
  });
  it('selects only local ground planes in an inspected airport', () => {
    const core = new GameCore(NOW); core.execute({ type: 'buy', modelId: 'lark', airportId: 'PVG' }, NOW);
    const view = airportScene(core.snapshot(), 'AC0001', 'PVG');
    expect(view.plane!.id).toBe('AC0002'); expect(view.selected.id).toBe('AC0001');
    expect(view.choices.map(p => p.id)).toEqual(['AC0002']);
  });
  it('follows in-flight aircraft only outside pinned airport inspection', () => {
    const s = airborne().snapshot();
    expect(airportScene(s, 'AC0001', 'PEK').plane).toBeUndefined();
    expect(airportScene(s, 'AC0001', 'PVG').plane).toBeUndefined();
    expect(airportScene(s, 'AC0001', null).plane!.flight).not.toBeNull();
  });
  it('selects arrivals without ending their ground turnaround', () => {
    const core = airborne(); core.tick(NOW + core.snapshot().fleet[0]!.flight!.arriveAt * 1000);
    const s = core.snapshot(), view = airportScene(s, 'AC0001', 'PVG');
    expect(view.plane!.airportId).toBe('PVG');
    expect(orderBlockReason(s, view.plane, waiting(s, 'PVG')[0]!, false)).toBe('地面周转中');
  });
  it('falls back safely after resale or importing an unrelated save with different selections', () => {
    const core = new GameCore(NOW); core.execute({ type: 'buy', modelId: 'lark', airportId: 'PEK' }, NOW);
    core.execute({ type: 'sell-plane', planeId: 'AC0001' }, NOW);
    const view = airportScene(core.snapshot(), 'AC0001', 'WUH');
    expect(view.selected.id).toBe('AC0002'); expect(view.pinned).toBeNull(); expect(view.plane!.id).toBe('AC0002');
    expect(airportScene(core.snapshot(), 'missing', 'unknown').airportId).toBe('PEK');
  });
  it('keeps remote or misidentified orders disabled even with a valid selected plane', () => {
    const s = new GameCore(NOW).snapshot(), p = s.fleet[0]!;
    expect(orderBlockReason(s, p, waiting(s, 'PVG')[0]!, false)).toBe('订单不在当前机场');
    expect(orderBlockReason(s, p, waiting(s, 'PEK')[0]!, true)).toBe('订单不在这架飞机上');
    expect(orderBlockReason(s, undefined, waiting(s, 'PVG')[0]!, false)).toBe('请先选择飞机');
  });
});
