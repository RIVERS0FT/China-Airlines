import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { GameCore, type GameState } from '../../src/core/game.js';
import { SaveRepository } from '../../src/persistence/saves.js';
let db: SaveRepository;
beforeEach(() => { db = new SaveRepository(`company-${crypto.randomUUID()}`); });
afterEach(async () => { await db.delete(); });

it('restores company identity and preserves both slots after a rejected import', async () => {
  const core = new GameCore(1000);
  core.execute({ type: 'found-company', company: { name: '星海航空', logo: { kind: 'preset', id: 'orbit' } } }, 1000);
  const initial = core.snapshot();
  let revision = await db.save(initial, 0);
  core.execute({ type: 'unlock', airportId: 'PVG' }, 1000);
  revision = await db.save(core.snapshot(), revision);
  expect((await db.load()).state?.company).toEqual(initial.company);
  expect((await db.backup()).company).toEqual(initial.company);
  const slots = await db.saves.toArray();
  for (const company of [{ name: '', logo: initial.company!.logo }, { name: 'Forged', logo: { kind: 'custom', data: 'https://example.com/a.png' } }]) {
    await expect(db.save({ ...initial, company } as GameState, revision)).rejects.toThrow();
    expect(await db.saves.toArray()).toEqual(slots);
  }
});

it('keeps v15 data untouched and asks for recovery', async () => {
  const { company: _company, ...old } = new GameCore(1000).snapshot();
  await db.saves.put({ slot: 'main', revision: 3, savedAt: 1000, state: { ...old, version: 15 } as unknown as GameState });
  const before = await db.saves.toArray();
  expect(await db.load()).toMatchObject({ state: null, hasData: true, incompatibleVersion: true });
  expect(await db.saves.toArray()).toEqual(before);
});
