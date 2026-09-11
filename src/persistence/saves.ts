import Dexie, { type Table } from 'dexie';
import { validateSave, type GameState } from '../core/game.js';
interface SaveRecord { slot: 'main' | 'backup'; revision: number; savedAt: number; state: GameState }
export class SaveConflictError extends Error {
  constructor() { super('另一个窗口已经更新存档。此窗口已停止写入，请重新载入。'); }
}
export class SaveRepository extends Dexie {
  saves!: Table<SaveRecord, string>;
  constructor(name = 'china-airlines') {
    super(name);
    // Database schema version is independent of GameState.version.
    this.version(1).stores({ saves: 'slot' });
  }
  async load(): Promise<{ state: GameState | null; revision: number; recovered: boolean; hasData: boolean }> {
    return this.transaction('r', this.saves, async () => {
      const main = await this.saves.get('main'), backup = await this.saves.get('backup');
      const revision = main?.revision ?? 0;
      if (main) { try { return { state: validateSave(main.state), revision, recovered: false, hasData: true }; } catch { /* Try a verified backup. */ } }
      if (backup) { try { return { state: validateSave(backup.state), revision, recovered: true, hasData: true }; } catch { /* Never replace corrupt saves silently. */ } }
      return { state: null, revision, recovered: false, hasData: Boolean(main || backup) };
    });
  }
  async save(state: GameState, expectedRevision: number): Promise<number> {
    const validated = validateSave(state);
    return this.transaction('rw', this.saves, async () => {
      const current = await this.saves.get('main');
      if ((current?.revision ?? 0) !== expectedRevision) throw new SaveConflictError();
      if (current) {
        let previous: GameState | null = null;
        try { previous = validateSave(current.state); } catch { /* Preserve the last good backup. */ }
        if (previous) await this.saves.put({ ...current, slot: 'backup', state: previous });
      }
      const revision = expectedRevision + 1;
      await this.saves.put({ slot: 'main', revision, savedAt: Date.now(), state: validated });
      return revision;
    });
  }
  async backup(): Promise<GameState> {
    const record = await this.saves.get('backup');
    if (!record) throw new Error('暂无可用备份');
    return validateSave(record.state);
  }
}
