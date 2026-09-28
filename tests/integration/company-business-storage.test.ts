import 'fake-indexeddb/auto';
import { afterEach, expect, it } from 'vitest';
import { GameCore, type Command, type GameState } from '../../src/core/game.js';
import { SaveConflictError, SaveRepository } from '../../src/persistence/saves.js';

const NOW = Date.parse('2026-09-28T00:00:00Z');
const databases: SaveRepository[] = [];
const database = () => {
  const db = new SaveRepository(`business-${crypto.randomUUID()}`);
  databases.push(db);
  return db;
};
afterEach(async () => { for (const db of databases) await db.delete(); databases.length = 0; });
function businessGame() {
  const core = new GameCore(NOW);
  const send = (command: Command) => core.execute(command, core.snapshot().lastWallTime);
  send({ type: 'tutorial', action: 'skip' });
  send({ type: 'unlock', airportId: 'PVG' });
  send({ type: 'buy', modelId: 'diamond-da40', airportId: 'PEK', passengers: 1, cargo: 0 });
  const planeId = core.snapshot().fleet[0]!.id;
  send({ type: 'load-destination', planeId, to: 'PVG' });
  send({ type: 'dispatch', planeId, to: 'PVG', auto: false });
  core.tick(NOW + core.snapshot().fleet[0]!.flight!.arriveAt * 1000);
  send({ type: 'open-business-team', airportId: 'PEK', kind: 'ticketing' });
  return core;
}

it('persists business income once and rejects corrupt business imports without changing primary or backup', async () => {
  const db = database(), core = businessGame(), initial = core.snapshot();
  let revision = await db.save(initial, 0);
  core.tick(initial.lastWallTime + 10_000);
  const earned = core.snapshot();
  expect(earned.credits - initial.credits).toBe(4);
  expect(earned.business.remainder).toBe(180_000);
  expect(earned.stats).toEqual(initial.stats);
  revision = await db.save(earned, revision);
  expect((await db.load()).state).toEqual(earned);
  expect(await db.backup()).toEqual(initial);
  const records = await db.saves.toArray();
  const bad = structuredClone(earned);
  bad.business.teams[0]!.managerId = bad.career.employees[1]!.id;
  for (const candidate of [bad, { ...earned, version: 14 } as unknown as GameState]) {
    await expect(db.save(candidate, revision)).rejects.toThrow();
    expect(await db.saves.toArray()).toEqual(records);
  }
  const loaded = (await db.load()).state!;
  const restored = new GameCore(loaded.lastWallTime, loaded);
  restored.tick(loaded.lastWallTime);
  expect(restored.snapshot()).toEqual(earned);
});

it('recovers the intact business backup without minting hidden-time income or overwriting evidence', async () => {
  const db = database(), core = businessGame(), initial = core.snapshot();
  let revision = await db.save(initial, 0);
  core.tick(initial.lastWallTime + 10_000);
  revision = await db.save(core.snapshot(), revision);
  const corrupt = core.snapshot(); corrupt.business.remainder = 1_000_000;
  await db.saves.update('main', { state: corrupt });
  const before = await db.saves.toArray(), loaded = await db.load();
  expect(loaded.recovered).toBe(true);
  expect(loaded.state).toEqual(initial);
  expect(await db.saves.toArray()).toEqual(before);
  const recovered = new GameCore(initial.lastWallTime, loaded.state!);
  recovered.tick(initial.lastWallTime + 3_600_000, { businessIncome: false });
  expect(recovered.snapshot().credits).toBe(initial.credits);
  expect(recovered.snapshot().business.earned).toBe(0);
  expect(recovered.snapshot().business.remainder).toBe(0);
  await db.save(recovered.snapshot(), revision);
  expect((await db.load()).state).toEqual(recovered.snapshot());
  expect(await db.backup()).toEqual(initial);
});

it('cannot replay a stale tab over a newer business payout', async () => {
  const db = database(), core = businessGame(), initial = core.snapshot();
  const revision = await db.save(initial, 0);
  core.tick(initial.lastWallTime + 10_000);
  await db.save(core.snapshot(), revision);
  const before = await db.saves.toArray();
  await expect(db.save(initial, revision)).rejects.toBeInstanceOf(SaveConflictError);
  expect(await db.saves.toArray()).toEqual(before);
});
