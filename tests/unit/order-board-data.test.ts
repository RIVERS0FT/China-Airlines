import { describe, expect, it } from 'vitest';
import { GameCore, waiting, type GameState, type Order } from '../helpers/configured-game.js';
import { groupWaitingOrders, sameOrderBoardData, type OrderBoardData } from '../../src/ui/order-board-data.js';
import { loadingContext, presentOrder } from '../../src/ui/order-presentation.js';

const NOW = 1_800_000_000_000;
function board(game: GameState): OrderBoardData {
  return { orders: waiting(game, 'PEK'), loading: loadingContext(game, game.fleet[0]), airportId: 'PEK', busy: false };
}

describe('order board update inputs', () => {
  it('ignores clock-only snapshots and refreshed orders at a different airport', () => {
    const core = new GameCore(NOW), before = board(core.snapshot());
    core.tick(NOW + 1000);
    expect(sameOrderBoardData(before, board(core.snapshot()))).toBe(true);
    core.execute({ type: 'refresh-demand', airportId: 'PVG' }, NOW + 1000);
    expect(sameOrderBoardData(before, board(core.snapshot()))).toBe(true);
    core.execute({ type: 'refresh-demand', airportId: 'PEK' }, NOW + 1000);
    expect(sameOrderBoardData(before, board(core.snapshot()))).toBe(false);
  });

  it('updates for capacity, busy status and turnaround completion without losing order identities', () => {
    const core = new GameCore(NOW), before = board(core.snapshot());
    expect(sameOrderBoardData(before, { ...before, busy: true })).toBe(false);
    core.execute({ type: 'allocate-cabin', planeId: 'AC0001', passengers: 2, cargo: 2 }, NOW);
    const allocated = board(core.snapshot());
    expect(allocated.orders).toEqual(before.orders);
    expect(sameOrderBoardData(before, allocated)).toBe(false);

    const game = core.snapshot();
    game.fleet[0]!.readyAt = game.simTime + 8;
    const cooling = board(game), person = cooling.orders.find(order => order.kind === 'passengers')!;
    expect(presentOrder(cooling.loading, person).disabled).toBe(true);
    const ready = board({ ...game, simTime: game.simTime + 8 });
    expect(sameOrderBoardData(cooling, ready)).toBe(false);
    expect(presentOrder(ready.loading, person).disabled).toBe(false);
  });

  it('updates changed order fields even when identifiers stay the same', () => {
    const data = board(new GameCore(NOW).snapshot());
    const changed = { ...data, orders: data.orders.map((order, index) => index ? order : { ...order, expiresAt: null }) };
    expect(sameOrderBoardData(data, changed)).toBe(false);
    expect(presentOrder(changed.loading, changed.orders[0]!).transfer).toBe(true);
  });

  it('keeps destination order after removing the oldest member and does not mutate input', () => {
    const source = new GameCore(NOW).snapshot().orders[0]!;
    const orders: Order[] = [
      { ...source, id: 'JB1', to: 'PVG', createdAt: 0 },
      { ...source, id: 'JB2', to: 'WUH', createdAt: 1 },
      { ...source, id: 'JB3', to: 'PVG', createdAt: 2 },
    ];
    const before = structuredClone(orders);
    expect(groupWaitingOrders(orders).map(([to]) => to)).toEqual(['PVG', 'WUH']);
    expect(groupWaitingOrders(orders.slice(1)).map(([to]) => to)).toEqual(['PVG', 'WUH']);
    expect(groupWaitingOrders([...orders].reverse())[0]![1].map(order => order.id)).toEqual(['JB1', 'JB3']);
    expect(orders).toEqual(before);
  });
});
