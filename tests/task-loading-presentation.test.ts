import { describe, expect, it } from 'vitest';
import { GameCore, manifest, waiting, MAX_WAITING } from '../src/core/game.js';
import { aircraftSpecs } from '../src/core/catalog.js';
import { careerExecute } from '../src/core/career.js';
import { taskItems, taskOverview } from '../src/ui/task-presentation.js';
import { orderPresentation } from '../src/ui/order-presentation.js';
const NOW = 1_800_000_000_000, ID = 'AC0001';

describe('unified task eligibility is read-only and agrees with core', () => {
  it('shows exactly the initial gift, and removes it only after a successful claim', () => {
    const core = new GameCore(NOW), game = core.snapshot(), before = structuredClone(game);
    expect(taskOverview(game).count).toBe(1);
    expect(taskOverview(game).task?.id).toBe('checkin-0');
    expect(game).toEqual(before);
    core.execute({ type: 'career-claim', id: 'checkin-0' }, NOW);
    expect(taskOverview(core.snapshot()).count).toBe(0);
    expect(taskOverview(core.snapshot()).task?.id).toBe('first-flight');
    expect(taskItems(core.snapshot()).find(t => t.id === 'checkin-0')?.state).toBe('claimed');
  });
  it('matches every enabled/disabled claim before and after a real completed flight', () => {
    const core = new GameCore(NOW), states = [core.snapshot()];
    core.execute({ type: 'load-destination', planeId: ID, to: 'PVG' }, NOW);
    core.execute({ type: 'dispatch', planeId: ID, to: 'PVG', auto: false }, NOW);
    core.tick(NOW + 600_000); states.push(core.snapshot());
    for (const game of states) {
      const before = structuredClone(game), items = taskItems(game);
      expect(new Set(items.map(t => t.key)).size).toBe(items.length);
      expect(taskOverview(game).count).toBe(items.filter(t => t.state === 'claimable').length);
      for (const task of items) {
        const check = new GameCore(game.lastWallTime, game);
        if (task.state === 'claimable') {
          check.execute(task.command, game.lastWallTime);
          expect(taskItems(check.snapshot()).find(t => t.key === task.key)?.state).toBe('claimed');
          const claimed = check.snapshot();
          expect(() => check.execute(task.command, game.lastWallTime)).toThrow();
          expect(check.snapshot()).toEqual(claimed);
        } else {
          expect(() => check.execute(task.command, game.lastWallTime)).toThrow();
          expect(check.snapshot()).toEqual(game);
        }
      }
      expect(game).toEqual(before);
    }
  });
  it('requires previous region claims even with sufficient revenue', () => {
    const game = new GameCore(NOW).snapshot(); game.stats.revenue = 180000;
    expect(taskItems(game).find(t => t.id === 'boss-2')).toMatchObject({ state: 'active', reason: '请先领取上一区奖励' });
    expect(() => careerExecute(structuredClone(game), { type: 'career-claim', id: 'boss-2' })).toThrow();
    careerExecute(game, { type: 'career-claim', id: 'boss-1' });
    expect(taskItems(game).find(t => t.id === 'boss-1')?.state).toBe('claimed');
    expect(taskItems(game).find(t => t.id === 'boss-2')?.state).toBe('claimable');
  });
  it('preserves old daily records without adding expired claims or repeating the seventh gift', () => {
    const game = new GameCore(NOW).snapshot(); game.career.day = 9; game.career.dailyDeliveries = 7;
    game.career.claimed.push('daily-2', 'checkin-0');
    const items = taskItems(game);
    expect(items.find(t => t.id === 'daily-2')?.state).toBe('claimed');
    expect(items.find(t => t.id === 'daily-9')?.state).toBe('active');
    expect(items.find(t => t.id === 'checkin-1')).toBeUndefined();
    expect(items.find(t => t.id === 'checkin-6')).toMatchObject({ state: 'claimable', tickets: 17 });
    careerExecute(game, { type: 'career-claim', id: 'checkin-6' });
    expect(taskItems(game).find(t => t.id === 'checkin-6')?.state).toBe('claimed');
    game.career.dailyDeliveries = 8;
    expect(taskItems(game).find(t => t.id === 'daily-9')?.state).toBe('claimable');
  });
});

describe('order state separates physical load from action permission', () => {
  it('keeps loaded orders green when full and updates only the released capacity', () => {
    const core = new GameCore(NOW); core.execute({ type: 'load-destination', planeId: ID, to: 'PVG' }, NOW);
    const game = core.snapshot(), before = structuredClone(game), plane = game.fleet[0]!;
    const person = manifest(game, ID).find(o => o.kind === 'passengers')!, remaining = waiting(game, 'PEK').find(o => o.kind === 'passengers')!;
    expect(manifest(game, ID).filter(o => o.kind === 'passengers')).toHaveLength(aircraftSpecs(plane).seats);
    expect(orderPresentation(game, plane, person)).toMatchObject({ state: 'loaded', disabled: false, label: '已装机', action: '卸载' });
    expect(orderPresentation(game, plane, remaining)).toMatchObject({ state: 'blocked', disabled: true, reason: '剩余客舱不足' });
    expect(game).toEqual(before);
    core.execute({ type: 'unload', planeId: ID, orderId: person.id }, NOW);
    const next = core.snapshot();
    expect(orderPresentation(next, next.fleet[0], remaining)).toMatchObject({ state: 'waiting', disabled: false });
    const unloaded = next.orders.find(o => o.id === person.id)!;
    expect(orderPresentation(next, next.fleet[0], unloaded)).toMatchObject({ state: 'waiting', transfer: true, label: '待装机' });
    expect(orderPresentation(next, next.fleet[0], manifest(next, ID).find(o => o.kind === 'cargo')!)).toMatchObject({ state: 'loaded' });
  });
  it('retains loaded state during service, flight and a full waiting room', () => {
    const core = new GameCore(NOW); core.execute({ type: 'load-destination', planeId: ID, to: 'PVG' }, NOW);
    const game = core.snapshot(), plane = game.fleet[0]!, onboard = manifest(game, ID)[0]!;
    expect(orderPresentation(game, { ...plane, energy: { ...plane.energy, serviceUntil: 120 } }, onboard)).toMatchObject({ state: 'loaded', disabled: true, reason: '地勤补能中，不能装卸' });
    const crowded = { ...game, orders: [...game.orders, ...Array.from({ length: MAX_WAITING }, (_, i) => ({ ...waiting(game, 'PEK')[0]!, id: `crowd-${i}` }))] };
    expect(orderPresentation(crowded, plane, onboard)).toMatchObject({ state: 'loaded', disabled: true, reason: '机场候运区已满' });
    core.execute({ type: 'dispatch', planeId: ID, to: 'PVG', auto: false }, NOW);
    const flying = core.snapshot();
    expect(orderPresentation(flying, flying.fleet[0], onboard)).toMatchObject({ state: 'loaded', disabled: true, reason: '飞行中，不能装卸' });
  });
  it('busy state never invents a capacity failure and another plane does not own the order', () => {
    const game = new GameCore(NOW).snapshot(), plane = game.fleet[0]!, order = waiting(game, 'PEK')[0]!;
    expect(orderPresentation(game, plane, order, true)).toMatchObject({ state: 'waiting', disabled: true, action: '保存中…' });
    expect(orderPresentation(game, undefined, order)).toMatchObject({ state: 'blocked', reason: '请先选择飞机' });
    expect(orderPresentation(game, plane, { ...order, location: 'AC0002', expiresAt: null })).toMatchObject({ state: 'blocked', aboard: false, reason: '订单不在当前机场' });
  });
});
