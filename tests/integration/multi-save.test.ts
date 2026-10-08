import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, expect, it } from 'vitest';
import { GameCore, type GameState } from '../../src/core/game.js';
import { MAX_SAVE_SLOTS, SaveConflictError, SaveRepository } from '../../src/persistence/saves.js';

const databases: SaveRepository[] = [];
function database(name = `slots-${crypto.randomUUID()}`) { const db = new SaveRepository(name); databases.push(db); return db; }
function company(name: string) {
  const core = new GameCore(1000);
  core.execute({ type: 'found-company', company: { name, logo: { kind: 'preset', id: 'wing' } } }, 1000);
  return core.snapshot();
}
afterEach(async () => { for (const db of databases) await db.delete(); databases.length = 0; });

it('creates independent companies, backups and recent selection without overwriting either slot', async () => {
  const db = database(), a = company('甲航空'), b = company('乙航空');
  const first = await db.create(a), second = await db.create(b);
  expect(await db.recent()).toBe(second);
  const changed = new GameCore(1000, a); changed.execute({ type: 'unlock', airportId: 'PVG' }, 1000);
  await db.save(changed.snapshot(), 1, first);
  expect((await db.load(first)).state!.credits).toBe(5900);
  expect(await db.backup(first)).toEqual(a);
  expect((await db.load(second)).state).toEqual(b);
  await expect(db.backup(second)).rejects.toThrow('暂无');
  await db.select(first, 2);
  expect(await db.recent()).toBe(first);
  expect(await db.list()).toEqual(expect.arrayContaining([expect.objectContaining({ id: first, company: a.company, level: 1, planes: 0, playable: true })]));
});
it.each([16, 17, 18])('upgrades the v1 directory while preserving v%s main and backup bytes', async version => {
  const name = `legacy-${crypto.randomUUID()}`, old = new Dexie(name);
  old.version(1).stores({ saves: 'slot' });
  const state = { ...company('旧公司'), version };
  const records = [{ slot: 'main', revision: 8, savedAt: 1000, state }, { slot: 'backup', revision: 7, savedAt: 900, state }];
  await old.table('saves').bulkPut(records); old.close();
  const db = database(name);
  expect(await db.recent()).toBe('main');
  expect(await db.list()).toMatchObject([{ id: 'main', revision: 8, incompatibleVersion: version !== 18, playable: version === 18 }]);
  expect(await db.saves.toArray()).toEqual([...records].reverse());
  await db.create(company('新公司'));
  expect(await db.saves.get('main')).toEqual(records[0]);
  expect(await db.saves.get('backup')).toEqual(records[1]);
});
it('rejects invalid new saves and rolls back a failed creation without changing the selected company', async () => {
  const db = database(), state = company('原公司'), first = await db.create(state);
  await expect(db.create({ ...state, credits: -1 })).rejects.toThrow();
  db.saves.hook('creating', () => { throw new Error('disk full'); });
  await expect(db.create(company('失败'))).rejects.toThrow('disk full');
  expect((await db.list()).map(slot => slot.id)).toEqual([first]);
  expect(await db.recent()).toBe(first);
  expect((await db.load(first)).state).toEqual(state);
});
it('resolves competing creations atomically at the slot limit', async () => {
  const db = database();
  for (let n = 0; n < MAX_SAVE_SLOTS - 1; n++) await db.create(company(`公司${n}`));
  const results = await Promise.allSettled([db.create(company('最后一格')), db.create(company('超额'))]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(await db.list()).toHaveLength(MAX_SAVE_SLOTS);
  expect(await db.saves.count()).toBe(MAX_SAVE_SLOTS);
});
it('conflicts only on the same slot, including a concurrent deletion or stale selection', async () => {
  const db = database(), state = company('公司'), a = await db.create(state), b = await db.create(state);
  await Promise.all([db.save(state, 1, a), db.save(state, 1, b)]);
  await expect(db.save(state, 1, a)).rejects.toBeInstanceOf(SaveConflictError);
  await expect(db.select(a, 1)).rejects.toBeInstanceOf(SaveConflictError);
  await expect(db.remove(a, 1)).rejects.toBeInstanceOf(SaveConflictError);
  await db.remove(a, 2);
  await expect(db.save(state, 2, a)).rejects.toBeInstanceOf(SaveConflictError);
  expect((await db.load(b)).revision).toBe(2);
  expect(await db.saves.count()).toBe(2);
  expect(await db.create(state)).not.toBe(a);
});
it('recovers only the selected slot backup and never rotates saves just by listing or loading', async () => {
  const db = database(), state = company('备份公司'), a = await db.create(state), b = await db.create(company('其他公司'));
  await db.save(state, 1, a);
  await db.saves.update(`${a}:main`, { state: { version: 999 } as unknown as GameState });
  const before = await db.saves.toArray();
  expect((await db.load(a)).recovered).toBe(true);
  expect((await db.list()).find(slot => slot.id === a)?.recovered).toBe(true);
  expect((await db.load(b)).state!.company!.name).toBe('其他公司');
  expect(await db.saves.toArray()).toEqual(before);
});
it('deleting all slots frees capacity without resurrecting a removed legacy backup', async () => {
  const db = database(), state = company('旧备份');
  await db.saves.put({ slot: 'backup', revision: 1, savedAt: 1000, state });
  await db.select('main', 0);
  await db.remove('main', 0);
  await expect(db.save(state, 0, 'main')).rejects.toBeInstanceOf(SaveConflictError);
  expect(await db.recent()).toBeNull();
  expect(await db.list()).toEqual([]);
  expect(await db.saves.count()).toBe(0);
  await db.create(state);
  expect(await db.list()).toHaveLength(1);
});
