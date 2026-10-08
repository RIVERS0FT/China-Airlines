import { create } from 'zustand';
import { GameCore, parseSave, type Command, type GameState } from './core/game.js';
import { SaveConflictError, SaveRepository, type SaveSlot } from './persistence/saves.js';
import type { CompanyIdentity } from './core/company-identity.js';
import { verifyCompanyLogo } from './media/company-logo.js';
interface ViewState {
  game: GameState | null; booting: boolean; busy: boolean; blocked: boolean; error: string | null;
  notice: string | null; savedAt: number | null; recovery: boolean;
  updateAvailable: boolean; online: boolean;
  slots: SaveSlot[]; activeSlot: string | null; recentSlot: string | null;
}
export const useGame = create<ViewState>(() => ({
  game: null, booting: true, busy: false, blocked: false, error: null, notice: null, savedAt: null,
  recovery: false, updateAvailable: false, online: navigator.onLine, slots: [], activeSlot: null, recentSlot: null
}));
const SLOT_KEY = 'china-airlines:slot:v1';
const sessionValue = (key: string) => { try { return sessionStorage.getItem(key); } catch { return null; } };
const message = (e: unknown) => e instanceof Error ? e.message : '操作失败，请保留导出的进度并重试';
class Controller {
  private core: GameCore | null = null;
  private db = new SaveRepository();
  private revision = 0;
  private slot: string | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  private started = false;
  private lastAutosave = Date.now();
  private playing = false;
  private active = false;
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
    if (!this.core || !this.slot) throw new Error('尚未载入游戏');
    this.revision = await this.db.save(this.core.snapshot(), this.revision, this.slot);
    this.lastAutosave = Date.now(); useGame.setState({ savedAt: this.lastAutosave });
  }
  private advance(active = this.active, now = Date.now()) {
    if (!this.core) return;
    return this.core.tick(now, { active });
  }
  private checkpoint(hidden: boolean) {
    const now = Date.now(), active = this.active;
    this.active = this.playing && !hidden;
    if (this.core && (this.playing || active) && !useGame.getState().blocked) void this.run(async () => { this.advance(active, now); await this.persist(); }).catch(() => undefined);
  }
  setPlaying(playing: boolean) {
    if (playing === this.playing) return;
    this.playing = playing;
    this.checkpoint(document.hidden);
  }
  async start() {
    if (this.started) return;
    this.started = true;
    try {
      await this.run(async () => {
        await this.refreshSlots();
        const pinned = sessionValue('china-airlines:playing:v1') === 'true' ? sessionValue(SLOT_KEY) : null;
        const slots = useGame.getState().slots;
        const id = slots.some(slot => slot.id === pinned) ? pinned : await this.db.recent();
        if (!id) return;
        const loaded = await this.db.load(id); this.revision = loaded.revision;
        this.slot = id; useGame.setState({ activeSlot: id, savedAt: slots.find(slot => slot.id === id)?.savedAt ?? null });
        if (!loaded.state && loaded.hasData) {
          useGame.setState({ recovery: true, error: loaded.incompatibleVersion
            ? '检测到版本不兼容的存档。当前仅接受 v18；原数据未被覆盖。可载入其他存档或新建游戏。'
            : '此存档与备份均无法读取。可载入其他存档或新建游戏。' }); return;
        }
        this.core = loaded.state ? GameCore.imported(loaded.state, Date.now()) : null;
        try { sessionStorage.setItem(SLOT_KEY, id); } catch { /* Optional tab preference. */ }
        if (loaded.recovered) useGame.setState({ notice: '主存档损坏，已从上一份有效备份恢复。' });
      });
    } catch { /* The recovery screen exposes retry/import without discarding data. */ }
    useGame.setState({ booting: false });
    window.setInterval(() => {
      const view = useGame.getState();
      if (!this.core || view.busy || view.blocked || !this.active || document.hidden) return;
      const report = this.advance();
      // Publish completed events only after saving; reload must not need catch-up
      // to recreate a flight arrival, refill or production already shown on screen.
      if (report?.events || Date.now() - this.lastAutosave >= 10000) void this.save().catch(() => { this.lastAutosave = Date.now(); });
      else this.publish();
    }, 250);
    document.addEventListener('visibilitychange', () => this.checkpoint(document.hidden));
    window.addEventListener('pagehide', () => this.checkpoint(true));
    window.addEventListener('pageshow', () => this.checkpoint(document.hidden));
    window.addEventListener('online', () => useGame.setState({ online: true }));
    window.addEventListener('offline', () => useGame.setState({ online: false }));
  }
  command(command: Command) {
    const now = Date.now(), active = this.active;
    return this.run(async () => {
      if (!this.core) throw new Error('尚未载入游戏');
      if (command.type === 'found-company') {
        const candidate = new GameCore(now, this.core.snapshot());
        candidate.execute(command, now, { active });
        await verifyCompanyLogo(command.company.logo);
        if (!this.slot) throw new Error('尚未载入游戏');
        this.revision = await this.db.save(candidate.snapshot(), this.revision, this.slot);
        this.core = candidate; this.lastAutosave = Date.now();
        useGame.setState({ savedAt: this.lastAutosave, notice: null });
        return;
      }
      this.core.execute(command, now, { active });
      // Publish success only after the IndexedDB transaction commits. Otherwise an
      // immediate reload after a visible purchase can lose that purchase.
      await this.persist();
      // Loading states, capacity readouts and the guide already provide feedback.
      // Keep routine loading/transfer logs out of toasts that obscure the orders;
      // clear any previous success notice too. Errors and recovery notices are separate.
      const quiet = command.type === 'tutorial' || command.type === 'load'
        || command.type === 'unload' || command.type === 'load-destination'
        || command.type === 'dispatch' || command.type === 'dispatch-plan';
      useGame.setState({ notice: quiet ? null : this.core.snapshot().log[0]?.text ?? '操作完成' });
    });
  }
  save() { const now = Date.now(), active = this.active; return this.run(async () => { this.advance(active, now); await this.persist(); }); }
  export() { const now = Date.now(), active = this.active; return this.run(() => { this.advance(active, now); if (!this.core) throw new Error('没有可导出的进度'); return JSON.stringify(this.core.snapshot(), null, 2); }); }
  import(raw: string, asNew = false) {
    const now = Date.now();
    return this.run(async () => {
      const candidate = GameCore.imported(parseSave(raw), now);
      const company = candidate.snapshot().company;
      if (company) await verifyCompanyLogo(company.logo);
      // Persist first. A rejected import cannot touch the in-memory or on-disk game.
      if (asNew || !this.slot) {
        const id = await this.db.create(candidate.snapshot());
        this.activate(id, candidate, 1);
      } else {
        this.revision = await this.db.save(candidate.snapshot(), this.revision, this.slot); this.core = candidate;
      }
      await this.refreshSlots();
      useGame.setState({ savedAt: Date.now(), recovery: false, notice: asNew ? '已导入新的存档。' : '存档导入成功，旧进度已保留为备份。' });
    });
  }
  restoreBackup() {
    const now = Date.now();
    return this.run(async () => {
      if (!this.slot) throw new Error('尚未载入游戏');
      const candidate = GameCore.imported(await this.db.backup(this.slot), now);
      const company = candidate.snapshot().company;
      if (company) await verifyCompanyLogo(company.logo);
      this.revision = await this.db.save(candidate.snapshot(), this.revision, this.slot); this.core = candidate;
      await this.refreshSlots();
      useGame.setState({ savedAt: Date.now(), recovery: false, notice: '已恢复上一份有效备份。' });
    });
  }
  newGame(company: CompanyIdentity) {
    const now = Date.now();
    return this.run(async () => {
      const candidate = new GameCore(now);
      candidate.execute({ type: 'found-company', company }, now);
      await verifyCompanyLogo(company.logo);
      const id = await this.db.create(candidate.snapshot());
      this.activate(id, candidate, 1);
      await this.refreshSlots();
    });
  }
  private activate(id: string, core: GameCore, revision: number) {
    this.slot = id; this.core = core; this.revision = revision; this.lastAutosave = Date.now();
    try { sessionStorage.setItem(SLOT_KEY, id); } catch { /* Optional tab preference. */ }
    useGame.setState({ activeSlot: id, recovery: false, notice: null, savedAt: this.lastAutosave });
  }
  async refreshSlots() {
    const slots = await this.db.list(), recentSlot = await this.db.recent();
    useGame.setState({ slots, recentSlot });
  }
  loadSlot(id?: string) {
    return this.run(async () => {
      const target = id ?? await this.db.recent();
      if (!target) throw new Error('暂无可载入的存档');
      const loaded = await this.db.load(target);
      if (!loaded.state?.company) throw new Error(loaded.incompatibleVersion ? '此存档版本不兼容' : '此存档无法读取');
      await verifyCompanyLogo(loaded.state.company.logo);
      await this.db.select(target, loaded.revision);
      this.activate(target, GameCore.imported(loaded.state, Date.now()), loaded.revision);
      await this.refreshSlots();
      useGame.setState({ notice: loaded.recovered ? '主存档损坏，已从上一份有效备份恢复。' : null });
    });
  }
  returnToTitle() {
    const now = Date.now(), active = this.active;
    this.playing = false; this.active = false;
    return this.run(async () => {
      if (this.core && this.slot) { this.advance(active, now); await this.persist(); await this.db.select(this.slot, this.revision); }
      await this.refreshSlots();
    }).catch(error => { this.playing = true; this.active = !document.hidden; throw error; });
  }
  deleteSlot(id: string, revision: number) {
    return this.run(async () => {
      await this.db.remove(id, revision);
      if (this.slot === id) {
        this.slot = null; this.core = null; this.revision = 0;
        try { sessionStorage.removeItem(SLOT_KEY); } catch { /* Optional tab preference. */ }
        useGame.setState({ activeSlot: null, savedAt: null, recovery: false });
      }
      await this.refreshSlots();
    });
  }
}
export const controller = new Controller();
