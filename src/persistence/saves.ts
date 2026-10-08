import Dexie, { type Table } from 'dexie';
import { SAVE_VERSION, validateSave, type GameState } from '../core/game.js';
import { careerLevel } from '../core/career.js';
interface SaveRecord { slot: string; revision: number; savedAt: number; state: GameState }
interface SlotRecord { id: string; lastPlayedAt: number }
interface Preference { key: string; value: string }
export const MAX_SAVE_SLOTS = 5;
export const LEGACY_SLOT = 'main';
const keys = (id: string) => id === LEGACY_SLOT ? ['main', 'backup'] : [`${id}:main`, `${id}:backup`];
export interface SaveSlot {
  id: string; revision: number; savedAt: number; lastPlayedAt: number;
  company: GameState['company']; level: number; credits: number; planes: number;
  playable: boolean; recovered: boolean; incompatibleVersion: boolean;
}
export class SaveConflictError extends Error {
  constructor() { super('另一个窗口已经更新存档。此窗口已停止写入，请重新载入。'); }
}
export class SaveRepository extends Dexie {
  saves!: Table<SaveRecord, string>;
  slots!: Table<SlotRecord, string>;
  preferences!: Table<Preference, string>;
  constructor(name = 'china-airlines') {
    super(name);
    // Database schema version is independent of GameState.version.
    this.version(1).stores({ saves: 'slot' });
    this.version(2).stores({ saves: 'slot', slots: 'id', preferences: 'key' }).upgrade(async tx => {
      const record = await tx.table('saves').get('main') ?? await tx.table('saves').get('backup');
      if (record) {
        await tx.table('slots').put({ id: LEGACY_SLOT, lastPlayedAt: record.savedAt });
        await tx.table('preferences').put({ key: 'recent', value: LEGACY_SLOT });
      }
    });
  }
  async load(id = LEGACY_SLOT): Promise<{ state: GameState | null; revision: number; recovered: boolean; hasData: boolean; incompatibleVersion: boolean }> {
    return this.transaction('r', this.saves, async () => {
      const [mainKey, backupKey] = keys(id);
      const main = await this.saves.get(mainKey!), backup = await this.saves.get(backupKey!);
      const revision = main?.revision ?? 0;
      if (main) { try { return { state: validateSave(main.state), revision, recovered: false, hasData: true, incompatibleVersion: false }; } catch { /* Try a verified backup. */ } }
      if (backup) { try { return { state: validateSave(backup.state), revision, recovered: true, hasData: true, incompatibleVersion: false }; } catch { /* Never replace corrupt saves silently. */ } }
      const incompatibleVersion = [main, backup].some(record => record?.state?.version !== undefined && record.state.version !== SAVE_VERSION);
      return { state: null, revision, recovered: false, hasData: Boolean(main || backup), incompatibleVersion };
    });
  }
  async save(state: GameState, expectedRevision: number, id?: string): Promise<number> {
    const mustExist = id !== undefined;
    id ??= LEGACY_SLOT;
    const validated = validateSave(state);
    return this.transaction('rw', this.saves, this.slots, async () => {
      const [mainKey, backupKey] = keys(id);
      const current = await this.saves.get(mainKey!);
      if ((current?.revision ?? 0) !== expectedRevision) throw new SaveConflictError();
      if (mustExist && !await this.slots.get(id) && !current && !await this.saves.get(backupKey!)) throw new SaveConflictError();
      if (current) {
        let previous: GameState | null = null;
        try { previous = validateSave(current.state); } catch { /* Preserve the last good backup. */ }
        if (previous) await this.saves.put({ ...current, slot: backupKey!, state: previous });
      }
      const revision = expectedRevision + 1;
      await this.saves.put({ slot: mainKey!, revision, savedAt: Date.now(), state: validated });
      if (!await this.slots.get(id)) await this.slots.put({ id, lastPlayedAt: Date.now() });
      return revision;
    });
  }
  async backup(id = LEGACY_SLOT): Promise<GameState> {
    const record = await this.saves.get(keys(id)[1]!);
    if (!record) throw new Error('暂无可用备份');
    return validateSave(record.state);
  }
  private async directory(): Promise<SlotRecord[]> {
    const slots = await this.slots.toArray();
    if (!slots.some(slot => slot.id === LEGACY_SLOT)) {
      const legacy = await this.saves.get('main') ?? await this.saves.get('backup');
      if (legacy) slots.push({ id: LEGACY_SLOT, lastPlayedAt: legacy.savedAt });
    }
    return slots;
  }
  async list(): Promise<SaveSlot[]> {
    return this.transaction('r', this.saves, this.slots, async () => {
      const result: SaveSlot[] = [];
      for (const slot of await this.directory()) {
        const loaded = await this.load(slot.id), state = loaded.state;
        const record = await this.saves.get(keys(slot.id)[loaded.recovered ? 1 : 0]!);
        result.push({ ...slot, revision: loaded.revision, savedAt: record?.savedAt ?? 0,
          company: state?.company ?? null, level: state ? careerLevel(state) : 0,
          credits: state?.credits ?? 0, planes: state?.fleet.length ?? 0,
          playable: Boolean(state?.company), recovered: loaded.recovered, incompatibleVersion: loaded.incompatibleVersion });
      }
      return result.sort((a, b) => b.lastPlayedAt - a.lastPlayedAt || a.id.localeCompare(b.id));
    });
  }
  async recent(): Promise<string | null> {
    return (await this.preferences.get('recent'))?.value ?? (await this.list())[0]?.id ?? null;
  }
  async create(state: GameState): Promise<string> {
    const validated = validateSave(state);
    if (!validated.company) throw new Error('请先创建航空公司');
    return this.transaction('rw', this.saves, this.slots, this.preferences, async () => {
      if ((await this.directory()).length >= MAX_SAVE_SLOTS) throw new Error('存档已满，请先在载入存档中删除不需要的存档。');
      const id = crypto.randomUUID(), now = Date.now();
      await this.slots.add({ id, lastPlayedAt: now });
      await this.saves.add({ slot: keys(id)[0]!, revision: 1, savedAt: now, state: validated });
      await this.preferences.put({ key: 'recent', value: id });
      return id;
    });
  }
  async select(id: string, revision: number) {
    await this.transaction('rw', this.saves, this.slots, this.preferences, async () => {
      const loaded = await this.load(id);
      if (!loaded.state || loaded.revision !== revision) throw new SaveConflictError();
      await this.slots.put({ id, lastPlayedAt: Date.now() });
      await this.preferences.put({ key: 'recent', value: id });
    });
  }
  async remove(id: string, revision: number) {
    await this.transaction('rw', this.saves, this.slots, this.preferences, async () => {
      const loaded = await this.load(id);
      if (!loaded.hasData || loaded.revision !== revision) throw new SaveConflictError();
      await this.saves.bulkDelete(keys(id));
      await this.slots.delete(id);
      if ((await this.preferences.get('recent'))?.value === id) await this.preferences.delete('recent');
    });
  }
}
