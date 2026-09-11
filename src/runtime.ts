import { create } from 'zustand';
import { GameCore, parseSave, type AdvanceReport, type Command, type GameState } from './core/game.js';
import { SaveConflictError, SaveRepository } from './persistence/saves.js';
interface ViewState {
  game: GameState | null; booting: boolean; busy: boolean; blocked: boolean; error: string | null;
  notice: string | null; savedAt: number | null; report: AdvanceReport | null; recovery: boolean;
  offlineReady: boolean; updateAvailable: boolean; online: boolean;
}
export const useGame = create<ViewState>(() => ({
  game: null, booting: true, busy: false, blocked: false, error: null, notice: null, savedAt: null,
  report: null, recovery: false, offlineReady: false, updateAvailable: false, online: navigator.onLine
}));
const message = (e: unknown) => e instanceof Error ? e.message : '操作失败，请保留导出的进度并重试';
class Controller {
  private core: GameCore | null = null;
  private db = new SaveRepository();
  private revision = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private started = false;
  private lastAutosave = Date.now();
  private publish() { useGame.setState({ game: this.core?.snapshot() ?? null }); }
  private run<T>(fn: () => T | Promise<T>): Promise<T> {
    const next = this.tail.then(async () => {
      if (useGame.getState().blocked) throw new SaveConflictError();
      useGame.setState({ busy: true, error: null });
      try { return await fn(); }
      catch (error) { useGame.setState({ error: message(error), blocked: error instanceof SaveConflictError }); throw error; }
      finally { this.publish(); useGame.setState({ busy: false }); }
    });
    this.tail = next.catch(() => undefined);
    return next;
  }
  private async persist() {
    if (!this.core) throw new Error('尚未载入游戏');
    this.revision = await this.db.save(this.core.snapshot(), this.revision);
    this.lastAutosave = Date.now(); useGame.setState({ savedAt: this.lastAutosave });
  }
  private advance() {
    if (!this.core) return;
    const report = this.core.tick(Date.now());
    if (report.elapsed >= 30 || report.clockBack) useGame.setState({ report });
    this.publish();
  }
  async start() {
    if (this.started) return;
    this.started = true;
    try {
      await this.run(async () => {
        const loaded = await this.db.load(); this.revision = loaded.revision;
        if (!loaded.state && loaded.hasData) {
          useGame.setState({ recovery: true, error: '主存档与备份均无法读取。请导入有效存档，或确认重新开始。' }); return;
        }
        this.core = new GameCore(Date.now(), loaded.state ?? undefined);
        this.advance(); await this.persist();
        if (loaded.recovered) useGame.setState({ notice: '主存档损坏，已从上一份有效备份恢复。' });
      });
    } catch { /* The recovery screen exposes retry/import without discarding data. */ }
    useGame.setState({ booting: false });
    window.setInterval(() => {
      const view = useGame.getState();
      if (!this.core || view.busy || view.blocked || document.hidden) return;
      this.advance();
      if (Date.now() - this.lastAutosave >= 10000) void this.save().catch(() => { this.lastAutosave = Date.now(); });
    }, 250);
    const checkpoint = () => { if (this.core && !useGame.getState().blocked) void this.save().catch(() => undefined); };
    document.addEventListener('visibilitychange', checkpoint);
    window.addEventListener('pagehide', checkpoint);
    window.addEventListener('online', () => useGame.setState({ online: true }));
    window.addEventListener('offline', () => useGame.setState({ online: false }));
  }
  command(command: Command) {
    return this.run(async () => {
      if (!this.core) throw new Error('尚未载入游戏');
      this.core.execute(command, Date.now());
      // Publish success only after the IndexedDB transaction commits. Otherwise an
      // immediate reload after a visible purchase can lose that purchase.
      await this.persist();
      // The guide already provides persistent feedback. A duplicate toast obscures
      // the passenger cards that the player is being asked to select.
      useGame.setState({ notice: command.type === 'tutorial' ? null : this.core.snapshot().log[0]?.text ?? '操作完成' });
    });
  }
  save() { return this.run(async () => { this.advance(); await this.persist(); }); }
  export() { return this.run(() => { this.advance(); if (!this.core) throw new Error('没有可导出的进度'); return JSON.stringify(this.core.snapshot(), null, 2); }); }
  import(raw: string) {
    return this.run(async () => {
      const candidate = GameCore.imported(parseSave(raw), Date.now());
      // Persist first. A rejected import cannot touch the in-memory or on-disk game.
      this.revision = await this.db.save(candidate.snapshot(), this.revision); this.core = candidate;
      useGame.setState({ savedAt: Date.now(), recovery: false, notice: '存档导入成功，旧进度已保留为备份。', report: null });
    });
  }
  restoreBackup() {
    return this.run(async () => {
      const candidate = GameCore.imported(await this.db.backup(), Date.now());
      this.revision = await this.db.save(candidate.snapshot(), this.revision); this.core = candidate;
      useGame.setState({ savedAt: Date.now(), recovery: false, notice: '已恢复上一份有效备份。', report: null });
    });
  }
  restart() {
    return this.run(async () => {
      const candidate = new GameCore(Date.now());
      this.revision = await this.db.save(candidate.snapshot(), this.revision); this.core = candidate;
      useGame.setState({ savedAt: Date.now(), recovery: false, notice: '已重新开始。', report: null });
    });
  }
}
export const controller = new Controller();
