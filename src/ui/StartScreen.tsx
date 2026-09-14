import { useEffect, useRef } from 'react';
import { LanguagePicker, useI18n } from '../i18n/I18n.js';
import { artAsset } from './art-assets.js';
import { FlightSky } from './FlightSky.js';

export function StartScreen({ ready, recovery, error, onEnter, onSettings }: {
  ready: boolean; recovery: boolean; error: string | null; onEnter: () => void; onSettings: () => void;
}) {
  const { t, text } = useI18n();
  const enter = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (ready && !recovery) enter.current?.focus({ preventScroll: true }); }, [ready, recovery]);
  return <main className="start-screen" data-testid="start-screen">
    <FlightSky className="start-flight-sky"/>
    <div className="start-aircraft" aria-hidden="true"><img src={artAsset('aircraft-flight-v1.png')} alt="" draggable={false}/></div>
    <header className="start-utility"><LanguagePicker compact/><button type="button" onClick={onSettings}>{t('start.settings')}</button></header>
    <section className="start-panel" aria-labelledby="start-title">
      <span className="start-kicker">{t('start.kicker')}</span>
      <h1 id="start-title">{t('app.name')}</h1>
      <p className="start-subtitle">{t('app.tagline')}</p>
      <p className="start-status" role="status" aria-live="polite">{recovery ? t('start.recovery') : ready ? t('start.ready') : t('start.loading')}</p>
      {error && <p className="start-error" role="alert">{text(error)}</p>}
      <div className="start-actions">
        <button ref={enter} type="button" className="start-enter" disabled={!ready || recovery} onClick={onEnter}>{t('start.enter')}</button>
        {recovery && <button type="button" onClick={onSettings}>{t('start.settings')}</button>}
      </div>
    </section>
  </main>;
}
