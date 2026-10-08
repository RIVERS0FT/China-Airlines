import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { GameCore, manifest, parseSave, TURNAROUND, validateSave } from '../../src/core/game.js';
import { SaveRepository } from '../../src/persistence/saves.js';

const NOW = 1_800_000_000_000, PLANE = 'AC0001';
const databases: SaveRepository[] = [];
afterEach(async () => { for (const database of databases.splice(0)) await database.delete(); });
function database() {
  const db = new SaveRepository(`company-flow-${crypto.randomUUID()}`);
  databases.push(db);
  return db;
}
function configure(core: GameCore) {
  core.execute({ type: 'unlock', airportId: 'PVG' }, NOW);
  core.execute({ type: 'buy', modelId: 'diamond-da40', airportId: 'PEK', passengers: 1, cargo: 0 }, NOW);
}
function restore(core: GameCore) {
  const saved = core.snapshot();
  return new GameCore(saved.lastWallTime, parseSave(JSON.stringify(saved)));
}

describe('real new-company lifecycle across commands, time and persistence', () => {
  it('buys the destination and a configured one-slot aircraft, delivers real orders once, claims a reward and expands at the actual prices', async () => {
    let core = new GameCore(NOW);
    const initial = core.snapshot();
    expect(initial.fleet).toEqual([]);
    expect(initial.airports).toEqual([{ id: 'PEK', level: 1 }]);
    expect(() => core.execute({ type: 'load-destination', planeId: PLANE, to: 'PVG' }, NOW)).toThrow();
    expect(core.snapshot()).toEqual(initial);

    configure(core);
    expect(core.snapshot().credits).toBe(3600);
    const offered = core.snapshot().orders;
    core.execute({ type: 'load-destination', planeId: PLANE, to: 'PVG' }, NOW);
    const loaded = manifest(core.snapshot(), PLANE);
    expect(loaded).toHaveLength(1);
    expect(loaded.every(order => offered.some(item => item.id === order.id))).toBe(true);
    core.execute({ type: 'dispatch', planeId: PLANE, to: 'PVG', auto: false }, NOW);
    expect(core.snapshot()).toMatchObject({ credits: 3504, stats: { costs: 96, revenue: 0, flights: 0 } });
    const flight = core.snapshot().fleet[0]!.flight!;
    expect(flight).toMatchObject({ cost: 96, revenue: 326 });

    const db = database();
    let revision = await db.save(core.snapshot(), 0);
    core = new GameCore(NOW, (await db.load()).state);
    core.tick(NOW + (flight.arriveAt + TURNAROUND) * 1000);
    const arrived = core.snapshot();
    expect(arrived).toMatchObject({ credits: 3830, stats: { costs: 96, revenue: 326, flights: 1, passengers: 1, cargo: 0 } });
    expect(arrived.fleet[0]).toMatchObject({ airportId: 'PVG', flight: null });
    expect(arrived.orders.filter(order => loaded.some(item => item.id === order.id))).toEqual([]);
    revision = await db.save(arrived, revision);
    const now = arrived.lastWallTime;
    core = new GameCore(now, (await db.load()).state);
    core.tick(now);
    expect(core.snapshot()).toEqual(arrived);

    core.execute({ type: 'claim', taskId: 'first-flight' }, now);
    expect(core.snapshot().credits).toBe(4430);
    const rewarded = core.snapshot();
    expect(() => core.execute({ type: 'claim', taskId: 'first-flight' }, now)).toThrow();
    expect(core.snapshot()).toEqual(rewarded);
    core.execute({ type: 'unlock', airportId: 'WUH' }, now);
    const poor = core.snapshot();
    expect(() => core.execute({ type: 'buy', modelId: 'swift-p', airportId: 'WUH', passengers: 1, cargo: 1 }, now)).toThrow();
    expect(core.snapshot()).toEqual(poor);
    core = new GameCore(now, rewarded);
    core.execute({ type: 'buy', modelId: 'diamond-da40', airportId: 'PEK', passengers: 0, cargo: 1 }, now);
    expect(core.snapshot().credits).toBe(2130);
    const purchasedId = core.snapshot().fleet[1]!.id;
    expect(purchasedId).not.toBe(PLANE);
    expect(core.snapshot().fleet[1]).toMatchObject({ airportId: 'PEK', allocation: { passengers: 0, cargo: 1 } });
    const bought = restore(core);
    bought.execute({ type: 'allocate-cabin', planeId: purchasedId, passengers: 1, cargo: 0 }, now);
    expect(bought.snapshot().credits).toBe(2050);
    await db.save(bought.snapshot(), revision);
    expect((await db.load()).state).toEqual(bought.snapshot());
  });

  it('keeps transfer orders aboard through an intermediate stop and resumes the remaining route after reload', () => {
    let core = new GameCore(NOW);
    configure(core);
    core.execute({ type: 'unlock', airportId: 'WUH' }, NOW);
    core.execute({ type: 'load-destination', planeId: PLANE, to: 'PVG' }, NOW);
    const orders = manifest(core.snapshot(), PLANE), budget = core.snapshot().credits;
    core.execute({ type: 'dispatch-plan', planeId: PLANE, stops: ['WUH', 'PVG'] }, NOW);
    const first = core.snapshot().fleet[0]!.flight!;
    expect(first.revenue).toBe(0);
    core.tick(NOW + first.arriveAt * 1000);
    expect(core.snapshot().credits).toBe(budget - first.cost);
    expect(manifest(core.snapshot(), PLANE)).toEqual(orders);
    expect(core.snapshot().stats.revenue).toBe(0);

    core = restore(core);
    core.tick(NOW + (first.arriveAt + TURNAROUND) * 1000);
    const second = core.snapshot().fleet[0]!.flight!;
    expect(second).toMatchObject({ from: 'WUH', to: 'PVG', revenue: 326 });
    expect(core.snapshot().credits).toBe(budget - first.cost - second.cost);
    core = restore(core);
    core.tick(NOW + (second.arriveAt + TURNAROUND) * 1000);
    expect(core.snapshot().stats).toMatchObject({ flights: 2, revenue: 326, costs: first.cost + second.cost });
    expect(core.snapshot().credits).toBe(budget - first.cost - second.cost + 326);
    expect(manifest(core.snapshot(), PLANE)).toEqual([]);
    expect(restore(core).snapshot()).toEqual(core.snapshot());
  });

  it('stops automatic duty in flight, settles that flight once, then cancels and restarts energy service', () => {
    let core = new GameCore(NOW);
    configure(core);
    core.execute({ type: 'hire-dispatcher', planeId: PLANE }, NOW);
    const before = core.snapshot();
    core.execute({ type: 'start-duty', planeId: PLANE, to: 'PVG' }, NOW);
    const flight = core.snapshot().fleet[0]!.flight!;
    expect(flight.revenue).toBeGreaterThan(0);
    core.execute({ type: 'stop', planeId: PLANE }, NOW);
    expect(core.snapshot().fleet[0]).toMatchObject({ autoRouteId: null, flight });
    core = restore(core);
    const now = NOW + (flight.arriveAt + TURNAROUND) * 1000;
    core.tick(now);
    expect(core.snapshot().stats.flights).toBe(1);
    expect(core.snapshot().credits).toBe(before.credits - flight.cost + flight.revenue);
    const energy = core.snapshot().fleet[0]!.energy.availableSeconds;
    core.execute({ type: 'service-energy', planeId: PLANE }, now);
    const servicing = core.snapshot();
    expect(() => core.execute({ type: 'dispatch', planeId: PLANE, to: 'PEK', auto: false }, now)).toThrow();
    expect(core.snapshot()).toEqual(servicing);
    core.execute({ type: 'cancel-energy-service', planeId: PLANE }, now);
    expect(core.snapshot().fleet[0]!.energy).toMatchObject({ availableSeconds: energy, serviceUntil: null });
    core.execute({ type: 'service-energy', planeId: PLANE }, now);
    const deadline = core.snapshot().fleet[0]!.energy.serviceUntil!;
    core = restore(core);
    core.tick(NOW + deadline * 1000);
    expect(core.snapshot().fleet[0]!.energy).toEqual({ availableSeconds: 10800, reservedSeconds: 0, serviceUntil: null });
    expect(core.snapshot().stats.flights).toBe(1);
    expect(validateSave(core.snapshot())).toEqual(core.snapshot());
  });

  it('rejects a tampered in-flight import without damaging the committed main or backup, then recovers', async () => {
    const db = database(), core = new GameCore(NOW);
    configure(core);
    let revision = await db.save(core.snapshot(), 0);
    core.execute({ type: 'load-destination', planeId: PLANE, to: 'PVG' }, NOW);
    core.execute({ type: 'dispatch', planeId: PLANE, to: 'PVG', auto: false }, NOW);
    revision = await db.save(core.snapshot(), revision);
    const saved = await db.saves.toArray(), forged = core.snapshot();
    forged.fleet[0]!.flight!.revenue += 1;
    await expect(db.save(forged, revision)).rejects.toThrow();
    expect(await db.saves.toArray()).toEqual(saved);
    const loaded = await db.load(), restored = new GameCore(NOW, loaded.state);
    restored.tick(NOW + (restored.snapshot().fleet[0]!.flight!.arriveAt + TURNAROUND) * 1000);
    await db.save(restored.snapshot(), loaded.revision);
    expect((await db.backup()).fleet[0]!.flight).toEqual(core.snapshot().fleet[0]!.flight);
    expect((await db.load()).state!.stats).toMatchObject({ flights: 1, revenue: 326, costs: 96 });
  });
});
