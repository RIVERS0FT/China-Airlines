import { MAX_SAVE_BYTES } from '../core/balance-policy.js';
import { useEffect, useRef, useState } from 'react';
import { controller, useGame } from '../runtime.js';
import { MAX_SAVE_SLOTS } from '../persistence/saves.js';
import { formatMoney, useI18n } from '../i18n/I18n.js';
import { CompanyLogo } from './CompanyLogo.js';
import { GameDialog } from './components/GameDialog.js';
import './save-picker-layout.css';

export function SavePicker({ onClose, onLoaded }: { onClose: () => void; onLoaded: () => void }) {
  const { t, text, locale } = useI18n(), view = useGame();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(true), [error, setError] = useState('');
  const busy = pending || view.busy;
  useEffect(() => {
    let mounted = true;
    controller.refreshSlots().catch(cause => { if (mounted) setError(text(cause instanceof Error ? cause.message : '操作失败')); })
      .finally(() => { if (mounted) setPending(false); });
    return () => { mounted = false; };
  }, []);
  async function act(action: () => Promise<unknown>, enter = false) {
    setPending(true); setError('');
    try { await action(); if (enter) onLoaded(); }
    catch (cause) { setError(text(cause instanceof Error ? cause.message : '操作失败')); }
    finally { setPending(false); }
  }
  async function importFile(file?: File) {
    if (!file) return;
    if (file.size > MAX_SAVE_BYTES) { setError(t('settings.importLarge')); return; }
    await act(async () => controller.import(await file.text(), true), true);
  }
  return <GameDialog title={t('start.load')} className="save-picker" busy={busy} onClose={onClose}
    footer={<div className="save-picker-footer"><span>{t('saves.count', { count: view.slots.length, max: MAX_SAVE_SLOTS })}</span><button type="button" disabled={busy || view.slots.length >= MAX_SAVE_SLOTS} onClick={() => input.current?.click()}>{t('settings.import')}</button></div>}>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <div className="save-picker-rotate"><h3>{t('rotate.title')}</h3><p>{t('rotate.subtitle')}</p></div>
    {!view.slots.length && <p className="save-empty" role="status">{pending ? t('start.loading') : t('saves.empty')}</p>}
    <div className="save-list">{view.slots.map((slot, index) => <article className="save-card" key={slot.id} data-testid="save-slot">
      <div className="save-card-identity">{slot.company ? <CompanyLogo logo={slot.company.logo}/> : <span className="save-slot-number">{index + 1}</span>}
        <div><h3>{slot.company?.name ?? t('saves.unnamed')}</h3><p>{slot.playable ? t('saves.details', { level: slot.level, planes: slot.planes, money: formatMoney(slot.credits) }) : slot.incompatibleVersion ? t('saves.incompatible') : t('saves.unreadable')}</p>
          {slot.savedAt > 0 && <time dateTime={new Date(slot.savedAt).toISOString()}>{t('saves.saved', { time: new Date(slot.savedAt).toLocaleString(locale) })}</time>}
          {slot.recovered && <p>{t('saves.backup')}</p>}
        </div>
      </div>
      <div className="save-card-actions"><button type="button" className="primary" disabled={busy || !slot.playable} aria-label={t('saves.loadNamed', { name: slot.company?.name ?? t('saves.unnamed') })} onClick={() => void act(() => controller.loadSlot(slot.id), true)}>{t('saves.load')}</button>
        <button type="button" className="danger" disabled={busy} aria-label={t('saves.deleteNamed', { name: slot.company?.name ?? t('saves.unnamed') })} onClick={() => {
          if (window.confirm(t('saves.deleteConfirm', { name: slot.company?.name ?? t('saves.unnamed') }))) void act(() => controller.deleteSlot(slot.id, slot.revision));
        }}>{t('saves.delete')}</button></div>
    </article>)}</div>
    <input ref={input} type="file" accept=".json,application/json" className="file-input" aria-label={t('settings.chooseFile')} disabled={busy} onChange={event => { void importFile(event.target.files?.[0]); event.target.value = ''; }}/>
  </GameDialog>;
}
