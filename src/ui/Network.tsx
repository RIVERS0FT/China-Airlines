import { searchAirports, type ContinentFilter } from './airport-search.js';
import { useState } from 'react';
import { AIRPORTS, CONTINENTS, airport } from '../core/catalog.js';
import { MAX_PLAN_LEGS, type GameState, type Plane } from '../core/game.js';
import { MapView } from './MapView.js';
import { PlanControls } from './PlanControls.js';
import { DispatchDialog } from './DispatchDialog.js';
import { dispatchPresentation } from './dispatch-presentation.js';
import { routePreview } from './route-preview.js';
import { LanguagePicker, useI18n } from '../i18n/I18n.js';

let tipSeen = false;
export function Network({ game, plane, destination, setDestination, onReturn, onSettings, onDepart, onInspect, busy, mode }: {
  game: GameState; plane?: Plane; destination: string; setDestination: (id: string) => void;
  mode: 'browse' | 'dispatch';
  onReturn: () => void; onSettings: () => void; onDepart: () => void; onInspect: (id: string, afterUnlock?: () => void) => void; busy: boolean;
}) {
  const { t, money: formatMoney, duration: formatDuration, airportName, continentName } = useI18n();
  const [stops, setStops] = useState<string[]>([]), [auto, setAuto] = useState(false);
  const [citiesOpen, setCitiesOpen] = useState(false), [showOthers, setShowOthers] = useState(true);
  const [tip, setTip] = useState(!tipSeen);
  const [citySearch, setCitySearch] = useState(''), [continent, setContinent] = useState<ContinentFilter>('all');
  const cities = searchAirports(citySearch, continent);
  const browsing = mode === 'browse';
  const view = dispatchPresentation(game, plane, stops, auto, busy), { active, summary } = view;
  const inFlight = Boolean(active), from = plane?.airportId ?? 'PEK';
  const preview = !browsing && plane && !inFlight ? routePreview(game, plane, stops) : null;
  function dismissTip() { if (!browsing) { tipSeen = true; setTip(false); } }
  function appendUnlockedStop(id: string) {
    if (browsing || !plane || inFlight || id === (stops.at(-1) ?? plane.airportId) || stops.length >= MAX_PLAN_LEGS) return;
    setStops(previous => {
      if (id === (previous.at(-1) ?? plane.airportId) || previous.length >= MAX_PLAN_LEGS) return previous;
      return [...previous, id];
    });
    // Appending a second destination invalidates automatic round trips.
    if (stops.length >= 1) setAuto(false);
  }
  function chooseAirport(id: string) {
    if (busy) return;
    dismissTip(); setCitiesOpen(false); setDestination(id);
    if (browsing) { onInspect(id); return; }
    if (!plane || inFlight) return;
    if (!game.airports.some(item => item.id === id)) { onInspect(id, () => appendUnlockedStop(id)); return; }
    appendUnlockedStop(id);
  }
  function inspectSelected() {
    setCitiesOpen(false); dismissTip();
    onInspect(destination, !browsing && !inFlight && !game.airports.some(item => item.id === destination) ? () => appendUnlockedStop(destination) : undefined);
  }
  const city = (id: string) => airportName(id, airport(id).city);
  const destinationText = active ? city(active.to) : stops.length ? city(stops.at(-1)!) : '—';
  const timeText = active ? formatDuration(active.remaining) : summary ? formatDuration(summary.duration) : '—';
  return <section className={`network-view route-dispatch-view ${browsing ? 'world-map-view' : ''}`} aria-label={browsing ? t('map.a11yBrowse') : inFlight ? t('map.a11yFlight') : t('map.a11yPlan')}>
    {browsing ? <header className="world-map-toolbar">
      <button type="button" onClick={onReturn}>{plane?.flight ? t('map.returnFlight') : t('map.returnAirport')}</button>
      <h2>{t('map.title')} <small>{t('map.unlocked', { open:game.airports.length, total:AIRPORTS.length })}</small></h2>
      <strong className="world-map-funds">{formatMoney(game.credits)}</strong>
      <button className="primary" aria-haspopup="dialog" onClick={() => { setCitySearch(''); setContinent('all'); setCitiesOpen(true); }}>{t('map.find')}</button>
      <LanguagePicker compact/><button type="button" onClick={onSettings}>{t('common.settings')}</button>
    </header> : <div className="dispatch-readout" data-testid="network-summary">
      <button className="dispatch-stat dispatch-destination" aria-label={t('map.selectDestination')} aria-haspopup="dialog" onClick={() => { dismissTip(); setCitySearch(''); setContinent('all'); setCitiesOpen(true); }}>
        <span>{t('map.destination')}</span><strong data-testid="network-destination">{destinationText}<i aria-hidden="true">▾</i></strong>
      </button>
      <div className="dispatch-stat dispatch-time"><span>{active ? t('map.remaining') : t('map.estimated')}</span><strong data-testid="network-time">{timeText}</strong></div>
      <div className="dispatch-stat dispatch-profit"><span>{t('map.profit')}</span><strong data-testid="network-profit">{summary ? formatMoney(summary.profit) : stops.length ? '—' : formatMoney(0)}</strong></div>
      <div className="dispatch-stat dispatch-cost"><span>{t('map.cost')}</span><strong data-testid="network-cost">{summary ? formatMoney(summary.cost) : stops.length ? '—' : formatMoney(0)}</strong></div>
    </div>}
    <div className="network-map">
      <MapView game={game} plane={plane} selected={destination} onSelect={chooseAirport} preview={preview} planning={!browsing} showOthers={showOthers} onToggleOthers={() => { dismissTip(); setShowOthers(value => !value); }}/>
      {browsing && <p className="world-map-guide">{t('map.guide')}</p>}
      {!browsing && tip && !active && <div className="dispatch-tip" role="status"><span>{t('map.routeTip')}</span><button aria-label={t('map.closeTip')} onClick={dismissTip}>×</button></div>}
      {!browsing && <PlanControls game={game} plane={plane} stops={stops} setStops={value => { dismissTip(); setStops(value); if (value.length !== 1) setAuto(false); }} auto={auto} setAuto={setAuto} busy={busy} onDepart={onDepart} onCancel={onReturn} onDetails={dismissTip}/>}
    </div>
    {citiesOpen && <DispatchDialog title={t('map.selectCity')} onClose={() => setCitiesOpen(false)}>
      <p>{browsing ? t('map.selectCityBrowse') : active ? t('map.selectCityFlight') : t('map.selectCityPlan', { city:city(from), count:MAX_PLAN_LEGS })}</p>
      <div className="dispatch-world-search">
        <label>{t('map.search')}<input type="search" aria-label={t('map.search')} value={citySearch} placeholder={t('map.searchPlaceholder')} autoComplete="off" onChange={e => setCitySearch(e.target.value)}/></label>
        <label>{t('map.region')}<select aria-label={t('map.cityRegion')} value={continent} onChange={e => setContinent(e.target.value as ContinentFilter)}><option value="all">{t('map.allRegions')}</option>{CONTINENTS.map(c => <option key={c} value={c}>{continentName(c)}</option>)}</select></label>
      </div>
      {!cities.length && <p role="status">{t('map.noResults')}<button onClick={() => { setCitySearch(''); setContinent('all'); }}>{t('map.clearFilters')}</button></p>}
      <label className="dispatch-city-field">{browsing || active ? t('map.browseCity') : t('map.addCity')}<select autoFocus aria-label={t('map.selectAirport')} disabled={busy} value="" onChange={e => chooseAirport(e.target.value)}>
        <option value="" disabled>{t('map.chooseCity')}</option>{cities.map(item => <option value={item.id} key={item.id}>{airportName(item.id, item.city)} · {item.id} · {continentName(item.continent)}{game.airports.some(x => x.id === item.id) ? '' : ` · ${t('map.locked')}`}</option>)}
      </select></label>
      {!browsing && <><button className="dispatch-inspect" disabled={busy} aria-label={t('map.inspect', { city:city(destination) })} onClick={inspectSelected}>{t('map.inspect', { city:city(destination) })}</button>
      <p className="dispatch-dialog-note">{t('map.catalogNote')}</p></>}
    </DispatchDialog>}
  </section>;
}
