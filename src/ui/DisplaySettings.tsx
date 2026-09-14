import { useGameViewport } from './GameViewport.js';
import { DEFAULT_UI_SCALE, MIN_UI_SCALE, MAX_UI_SCALE, UI_SCALE_STEP } from './viewport.js';
import { useI18n } from '../i18n/I18n.js';

export function DisplaySettings() {
  const { uiScale, setUiScale, storageWarning } = useGameViewport();
  const { t, text } = useI18n();
  return <section className="display-settings" aria-labelledby="display-settings-title">
    <div className="display-settings-heading"><h3 id="display-settings-title">{t('settings.display')}</h3><output htmlFor="ui-scale" aria-live="polite">{uiScale}%</output></div>
    <p id="ui-scale-description">{t('settings.scaleHelp')}</p>
    <div className="ui-scale-slider">
      <button aria-label={t('settings.scaleDown')} disabled={uiScale <= MIN_UI_SCALE} onClick={() => setUiScale(uiScale - UI_SCALE_STEP)}>−</button>
      <label className="sr-only" htmlFor="ui-scale">{t('settings.scaleLabel')}</label>
      <input id="ui-scale" type="range" min={MIN_UI_SCALE} max={MAX_UI_SCALE} step={UI_SCALE_STEP} value={uiScale} aria-valuetext={`${uiScale}%`} aria-describedby="ui-scale-description" onChange={event => setUiScale(Number(event.target.value))}/>
      <button aria-label={t('settings.scaleUp')} disabled={uiScale >= MAX_UI_SCALE} onClick={() => setUiScale(uiScale + UI_SCALE_STEP)}>＋</button>
    </div>
    <div className="ui-scale-presets" role="group" aria-label={t('settings.scalePresets')}>{[75, 100, 125, 150].map(value => <button key={value} aria-pressed={uiScale === value} onClick={() => setUiScale(value)}>{value}%</button>)}<button onClick={() => setUiScale(DEFAULT_UI_SCALE)}>{t('settings.scaleReset')}</button></div>
    <small>{t('settings.scaleStored')}</small>
    {storageWarning && <p role="status">{text(storageWarning)}</p>}
  </section>;
}
