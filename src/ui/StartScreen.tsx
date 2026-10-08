import { useEffect, useRef, useState } from 'react';
import { LanguagePicker, useI18n } from '../i18n/I18n.js';
import { artAsset } from './art-assets.js';
import { FlightSky } from './FlightSky.js';
import { CompanySetup } from './CompanySetup.js';
import type { CompanyIdentity } from '../core/company-identity.js';
import { SavePicker } from './SavePicker.js';
import { MAX_SAVE_SLOTS } from '../persistence/saves.js';

export function StartScreen({ ready, busy, recovery, error, company, count, onCreate, onEnter, onLoaded, onSettings }: {
  ready: boolean; busy: boolean; recovery: boolean; error: string | null; onEnter: () => void; onSettings: () => void; onLoaded: () => void; count: number;
  company: CompanyIdentity | null; onCreate: (company: CompanyIdentity) => Promise<void>;
}) {
  const { t, text } = useI18n();
  const enter = useRef<HTMLButtonElement>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (ready) enter.current?.focus({ preventScroll: true }); }, [ready]);
  return <main className="start-screen" data-testid="start-screen">
    <FlightSky className="start-flight-sky"/>
    <div className="start-aircraft" aria-hidden="true"><img src={artAsset('aircraft-flight-v2.png')} alt="" draggable={false}/></div>
    <header className="start-utility"><LanguagePicker compact/><button type="button" onClick={onSettings}>{t('start.settings')}</button></header>
    <section className="start-panel" aria-labelledby="start-title">
      <h1 id="start-title">{t('app.name')}</h1>
      <p className="start-subtitle">{t('app.tagline')}</p>
      {(!ready || recovery) && <p className="start-status" role="status" aria-live="polite">{recovery ? t('start.recovery') : t('start.loading')}</p>}
      {error && <p className="start-error" role="alert">{text(error)}</p>}
      <div className="start-actions">
        <button ref={company ? enter : undefined} type="button" className={company ? 'start-enter' : ''} aria-label={t('start.continue')} disabled={!ready || busy || !company} onClick={onEnter}>{t('start.continue')}{company && <small>{company.name}</small>}</button>
        <button ref={company ? undefined : enter} type="button" className={!company ? 'start-enter' : ''} disabled={!ready || busy || count >= MAX_SAVE_SLOTS} onClick={() => setCreating(true)}>{t('start.new')}</button>
        <button type="button" disabled={!ready || busy} onClick={() => setLoading(true)}>{t('start.load')}</button>
      </div>
      {count >= MAX_SAVE_SLOTS && <p className="start-status">{t('saves.full')}</p>}
    </section>
    {creating && <CompanySetup onClose={() => setCreating(false)} onCreate={onCreate}/>}
    {loading && <SavePicker onClose={() => setLoading(false)} onLoaded={() => { setLoading(false); onLoaded(); }}/>}
  </main>;
}
