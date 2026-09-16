import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { GameCore, type GameState } from '../src/core/game.js';
import { SaveRepository } from '../src/persistence/saves.js';
const databases: SaveRepository[] = [];
function database() { const db = new SaveRepository(`save-boundary-${crypto.randomUUID()}`); databases.push(db); return db; }
afterEach(async () => { for (const db of databases) await db.delete(); databases.length = 0; });
const retired = (version: number) => ({ version }) as unknown as GameState;

describe('unsupported storage records stay non-destructive', () => {
  it.each([1, 2, 3, 4, 5, 6])('rejects a v%s write without changing either slot or revision', async version => {
    const db = database(), state = new GameCore(1000).snapshot();
    await db.save(state, 0); const revision = await db.save(state, 1);
    const before = await db.saves.toArray();
    await expect(db.save(retired(version), revision)).rejects.toThrow('不再支持');
    expect(await db.saves.toArray()).toEqual(before);
    expect((await db.load()).revision).toBe(revision);
  });
  it.each(['fleet', 'stored', 'museum'] as const)('rejects retired %s models without overwriting a good save or backup', async location => {
    const db = database(), state = new GameCore(1000).snapshot();
    await db.save(state, 0); await db.save(state, 1);
    const before = await db.saves.toArray(), bad = structuredClone(state);
    if (location === 'fleet') bad.fleet[0]!.modelId = 'lark';
    else if (location === 'stored') bad.career.stored.push({ ...bad.fleet[0]!, modelId: 'lark' });
    else bad.career.museum.push('lark');
    await expect(db.save(bad, 2)).rejects.toThrow('不再支持');
    expect(await db.saves.toArray()).toEqual(before);
  });
  it.each([1, 2, 3, 4, 5, 6])('recovers a current backup behind a v%s main record without silently rewriting disk', async version => {
    const db = database(), state = new GameCore(1000).snapshot();
    await db.save(state, 0); await db.save(state, 1);
    await db.saves.update('main', { state: retired(version) });
    const before = await db.saves.toArray();
    expect(await db.load()).toEqual({ state, recovered: true, hasData: true, revision: 2 });
    expect(await db.saves.toArray()).toEqual(before);
    await db.save(state, 2);
    expect(await db.backup()).toEqual(state);
    expect((await db.load()).revision).toBe(3);
  });
  it('reports unsupported main and backup without resetting player progress', async () => {
    const db = database(), state = new GameCore(1000).snapshot();
    await db.save(state, 0); await db.save(state, 1);
    await db.saves.update('main', { state: retired(4) });
    await db.saves.update('backup', { state: retired(5) });
    const before = await db.saves.toArray();
    expect(await db.load()).toEqual({ state: null, recovered: false, hasData: true, revision: 2 });
    await expect(db.backup()).rejects.toThrow('不再支持');
    expect(await db.saves.toArray()).toEqual(before);
  });
});
