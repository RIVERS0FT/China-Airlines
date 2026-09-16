import { useEffect, useReducer, useRef, useState } from 'react';
import { airport, aircraftSpecs } from '../core/catalog.js';
import { loadSummary, type Command } from '../core/game.js';
import { controller, useGame } from '../runtime.js';
import { CareerHub } from './CareerHub.js';
import { CompanyOrganization } from './CompanyOrganization.js';
import { Network } from './Network.js';
import { energyText } from './EnergyService.js';
import { FlightMoney } from './FlightBoard.js';
import { flightStatus } from './flight-status.js';
import { AirportDirectory } from './AirportDirectory.js';
import { AirportDetails } from './AirportDetails.js';
import { airportScene } from './airport-presentation.js';
import { OrderBoard } from './OrderBoard.js';
import { Tutorial } from './Tutorial.js';
import { FleetManagement, type FleetTab } from './FleetManagement.js';
import { TaskCenter } from './TaskCenter.js';
import { AviationScene } from './AviationScene.js';
import { AirportSceneTools } from './AirportSceneTools.js';
import { Icon, Settings, Shop, ignore } from './Panels.js';
import { StartScreen } from './StartScreen.js';
import { HelpContent } from './HelpContent.js';
import { useI18n } from '../i18n/I18n.js';
import { GameDialog } from './components/GameDialog.js';
import { PageFrame } from './layout/PageFrame.js';
import { GameShell, OverlayHost } from './shell/GameShell.js';
import { TopStatusBar } from './shell/TopStatusBar.js';
import { MainNavigation } from './shell/MainNavigation.js';
import { initialNavigation, isWorkPage, navigationReducer, type Page, type WorkPage } from './shell/navigation.js';
import './management.css';
import './workshop.css';

type MapMode = 'browse' | 'dispatch';
type ModalName = 'tasks' | 'settings' | 'help' | 'airport-detail';
const PLAYING_KEY = 'china-airlines:playing:v1';
const SCREEN_KEY = 'china-airlines:screen:v1';
const sessionValue = (key: string) => { try { return sessionStorage.getItem(key); } catch { return null; } };
const act = (command: Command) => controller.command(command);

export function App() {
  const view = useGame(), game = view.game;
  const { locale, t, money, duration, airportName, modelName, ui, text } = useI18n();
  const [playing, setPlaying] = useState(() => sessionValue(PLAYING_KEY) === 'true');
  const [navigation, navigate] = useReducer(navigationReducer, sessionValue(SCREEN_KEY), initialNavigation);
  const screen = navigation.scene === 'airport' ? 'airport' : 'map';
  const mapMode: MapMode = navigation.scene === 'dispatch' ? 'dispatch' : 'browse';
  const workPage = isWorkPage(navigation.page) ? navigation.page : null;
  const organizationOpen = workPage === 'organization';
  const [planeId, setPlaneId] = useState('AC0001');
  const [destination, setDestination] = useState('PEK'), [aboard, setAboard] = useState(false);
  const [orderViewKey, setOrderViewKey] = useState(0);
  const [organizationTarget, setOrganizationTarget] = useState<{ id: number | null; training: boolean }>({ id: null, training: false });
  const [modal, setModal] = useState<ModalName | null>(null);
  const [fleetTab, setFleetTab] = useState<FleetTab | undefined>();
  const [browsedAirport, setBrowsedAirport] = useState<string | null>(null);
  const [detailAirport, setDetailAirport] = useState('PEK');
  const [detailBack, setDetailBack] = useState<'directory' | 'map' | 'close'>('directory');
  const mapReturn = useRef<{ planeId: string; browsedAirport: string | null; aboard: boolean } | null>(null);
  const routeUnlockResume = useRef<(() => void) | null>(null);
  const context = game ? airportScene(game, planeId, browsedAirport) : null;
  const plane = context?.plane, current = context?.airportId ?? 'PEK';
  const to = game?.airports.some(a => a.id === destination && a.id !== current)
    ? destination : game?.airports.find(a => a.id !== current)?.id ?? 'PVG';
  const isDispatch = navigation.page === 'dispatch';

  useEffect(() => {
    if (!view.notice) return;
    const timer = setTimeout(() => useGame.setState({ notice: null }), 4000);
    return () => clearTimeout(timer);
  }, [view.notice]);
  useEffect(() => {
    if (!playing) return;
    try { sessionStorage.setItem(PLAYING_KEY, 'true'); sessionStorage.setItem(SCREEN_KEY, screen); } catch { /* Presentation preferences are optional. */ }
  }, [playing, screen]);

  function openPage(page: WorkPage) { navigate({ type: 'open', page }); setModal(null); }
  function closePage() {
    navigate({ type: 'return' });
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.game-dock [aria-current="page"]')?.focus({ preventScroll: true }));
  }
  function openOrganization(id: number | null = null, training = false) { setOrganizationTarget({ id, training }); openPage('organization'); }
  function openFleet(tab?: FleetTab) { setFleetTab(tab); openPage('fleet'); }
  function selectPlane(id: string) { setPlaneId(id); setBrowsedAirport(null); navigate({ type: 'open', page: 'airport' }); setAboard(false); setModal(null); }
  function showOrders(onboard: boolean) { setAboard(onboard); setOrderViewKey(key => key + 1); }
  function cycle(dir: number) {
    if (!context || !plane || !context.choices.length) return;
    const index = context.choices.findIndex(item => item.id === plane.id);
    setPlaneId(context.choices[(index + dir + context.choices.length) % context.choices.length]!.id);
    setAboard(false);
  }
  function inspectAirport(id: string, afterUnlock?: () => void, back: 'directory' | 'map' | 'close' = 'close') {
    routeUnlockResume.current = afterUnlock ?? null;
    setDetailBack(back); setDetailAirport(id); setModal('airport-detail');
  }
  function closeModal() { routeUnlockResume.current = null; setModal(null); }
  function visitAirport(id: string) {
    if (!game?.airports.some(item => item.id === id)) return;
    setBrowsedAirport(id); navigate({ type: 'open', page: 'airport' }); setAboard(false); setModal(null);
  }
  function showMap(target?: string, mode: MapMode = 'dispatch') {
    if (!context) return;
    if (screen !== 'map') mapReturn.current = { planeId, browsedAirport, aboard };
    const selected = plane ?? context.selected;
    setPlaneId(selected.id);
    setDestination(mode === 'browse' ? current : target ?? selected.flight?.to ?? (!plane && context.pinned ? context.pinned : to));
    setBrowsedAirport(null); navigate({ type: 'open', page: mode === 'browse' ? 'map' : 'dispatch' }); setModal(null);
  }
  function returnFromMap() {
    const previous = mapReturn.current;
    mapReturn.current = null; routeUnlockResume.current = null;
    if (previous) { setPlaneId(previous.planeId); setBrowsedAirport(previous.browsedAirport); setAboard(previous.aboard); }
    navigate({ type: 'open', page: 'airport' }); setModal(null);
  }
  function selectPage(page: Page) {
    if (page === navigation.page) return;
    if (page === 'map') showMap(undefined, 'browse');
    else if (page === 'airport') { if (screen === 'map') returnFromMap(); else { navigate({ type: 'open', page }); showOrders(false); } }
    else if (page === 'fleet') openFleet();
    else if (page === 'organization') openOrganization();
    else if (isWorkPage(page)) openPage(page);
  }
  function enterGame() {
    if (!game || view.recovery) return;
    const selected = context?.selected ?? game.fleet[0];
    if (selected) { setPlaneId(selected.id); setDestination(selected.flight?.to ?? selected.airportId); }
    setBrowsedAirport(null); navigate({ type: 'open', page: 'map' }); setPlaying(true);
  }

  const total = game && plane ? loadSummary(game, plane.id) : { passengers: 0, cargo: 0 };
  const model = plane ? aircraftSpecs(plane) : null;
  const status = game && plane ? flightStatus(game, plane) : null;
  const flight = plane?.flight;
  const cooling = plane && game && plane.readyAt > game.simTime;
  const departureReason = !plane ? t('airport.noPlane') : view.busy ? t('airport.saving') : flight ? t('airport.flying')
    : plane.energy.serviceUntil !== null ? t('airport.servicing') : cooling ? t('airport.turnaround') : '';
  const city = (id: string) => airportName(id, airport(id).city);
  const pageTitles: Record<WorkPage, string> = {
    career:t('modal.career'), shop:t('modal.shop'), fleet:t('modal.fleet'), airports:t('modal.airports'), organization:t('nav.organization'),
  };
  const modalTitles: Record<ModalName, string> = {
    tasks:t('modal.tasks'), settings:t('common.settings'), help:t('modal.help'), 'airport-detail':t('modal.airportDetails'),
  };

  if (!playing) return <>
    <StartScreen ready={Boolean(game) && !view.booting} recovery={view.recovery} error={view.error} onEnter={enterGame} onSettings={() => setModal('settings')}/>
    <OverlayHost>
      {modal === 'settings' && <Settings onClose={() => setModal(null)}/>}
      {view.blocked && <div className="blocking-screen" role="alert"><h2>{t('status.blocked')}</h2><p>{t('status.blockedText')}</p><button className="primary" onClick={() => location.reload()}>{t('status.reload')}</button></div>}
      <div className="rotate-screen"><Icon name="rotate"/><h2>{t('rotate.title')}</h2><p>{t('rotate.subtitle')}</p></div>
    </OverlayHost>
  </>;

  return <>
    <GameShell page={navigation.page} training={navigation.page === 'airport' && game?.tutorial === 'active' && Boolean(plane) && !modal}
      header={<TopStatusBar hidden={isDispatch} onFleet={() => openFleet('flights')} onHelp={() => setModal('help')} onSettings={() => setModal('settings')}/>}
      navigation={game && <MainNavigation page={navigation.page} onNavigate={selectPage} departure={{ disabled: !plane || view.busy || Boolean(flight) || Boolean(cooling) || plane?.energy.serviceUntil !== null, reason: departureReason, onClick: () => showMap() }}/> }>
      {navigation.page === 'airport' && game && plane && game.tutorial === 'active' && !modal && <Tutorial game={game} plane={plane} screen={screen} destination={to} busy={view.busy} onLocate={target => {
        if (target === 'tasks') setModal('tasks'); else if (target === 'map') showMap(); else { navigate({ type: 'open', page: 'airport' }); setAboard(false); }
      }/>}
      {!game ? <main className="startup"><h2>{view.booting ? t('start.loading') : t('startup.missing')}</h2><p>{view.error}</p><button onClick={() => setModal('settings')}>{t('startup.recover')}</button></main> : <main className="game-workspace" style={{ display: workPage ? 'none' : undefined }} aria-label={screen === 'airport' ? t('nav.airport') : mapMode === 'browse' ? t('map.a11yBrowse') : t('map.a11yPlan')}>
        {screen === 'map' ? <Network key={`${plane?.id}-${mapMode}`} mode={mapMode} onInspect={(id, afterUnlock) => inspectAirport(id, afterUnlock, 'map')} game={game} plane={plane} destination={destination} setDestination={setDestination} onReturn={returnFromMap} onDepart={() => { mapReturn.current = null; navigate({ type: 'open', page: 'airport' }); setAboard(true); }} busy={view.busy}/> : <>
          <div className="airport-titlebar">
            <button className="airport-info-trigger" aria-label={t('airport.currentDetails')} onClick={() => inspectAirport(current, undefined, 'close')} title={t('airport.detailsHint')}>{t('airport.details')}</button>
            <div className="gate-sign"><b>{flight ? t('airport.flight') : '01'}</b><div><strong>{flight ? t('flight.route', { from:city(flight.from), to:city(flight.to) }) : t('airport.name', { city:city(current) })}</strong><small>{t('common.level', { value:game.airports.find(item => item.id === current)?.level ?? 0 })}</small></div></div>
            <div className="plane-status"><strong>{plane ? `${modelName(plane.modelId, model!.name)} · ${plane.id}` : t('airport.browseEmpty')}</strong><span>{!plane ? t('airport.browseOnly') : status && status.remaining !== null ? `${ui(status.label)} · ${ui('{time} 后{event}',{time:duration(status.remaining),event:ui(status.nextEvent)})}` : t('airport.parked')}</span></div>
            <div className="capacity"><span data-testid="passenger-capacity">{t('airport.passengers', { used:total.passengers, capacity:model?.seats ?? 0 })}</span><span>{t('airport.cargo', { used:total.cargo, capacity:model?.cargo ?? 0 })}</span>{plane && <span className="plane-energy" data-testid="plane-energy">{t('airport.energy', { value:energyText(plane.energy.availableSeconds) })}</span>}</div>
            {plane && plane.itinerary.length > 0 && <button className="plan-cancel" disabled={view.busy} onClick={() => ignore(act({ type:'cancel-plan', planeId:plane.id }))}>{t('airport.cancelPlan')}</button>}
            {plane?.autoRouteId && <button disabled={view.busy} onClick={() => ignore(act({ type:'stop', planeId:plane.id }))}>{t('airport.stopAuto')}</button>}
          </div>
          <div className="scene-wrap">
            {context?.pinned && <button className="return-selected-plane" onClick={() => selectPlane(context.selected.id)}>{t('airport.backPlane', { id:context.selected.id })}</button>}
            {plane && plane.itinerary.length > 0 && <div className="itinerary-banner" data-testid="active-plan">{t('airport.onward', { route:plane.itinerary.map(city).join(' → ') })}</div>}
            <AviationScene game={game} plane={plane} busy={view.busy} cabinFocusKey={aboard ? orderViewKey : 0} onCabin={() => flight ? openFleet('flights') : showOrders(true)}/><AirportSceneTools game={game} plane={plane} onTasks={() => setModal('tasks')}/>
            <button className="switch-plane previous" aria-label={t('airport.previousPlane')} disabled={!context || context.choices.length < 2} onClick={() => cycle(-1)}>◀</button><button className="switch-plane next" aria-label={t('airport.nextPlane')} disabled={!context || context.choices.length < 2} onClick={() => cycle(1)}>▶</button>
            {flight && <div className="air-progress"><span>{city(flight.from)}</span><progress aria-label={t('flight.progress', { from:city(flight.from), to:city(flight.to) })} max={1} value={Math.max(0, (game.simTime - flight.departAt) / (flight.arriveAt - flight.departAt))}/><span>{city(flight.to)}</span></div>}
            {status?.flight && <div className="scene-flight-summary"><FlightMoney flight={status.flight}/></div>}
          </div>
          {!flight && <OrderBoard game={game} plane={plane} airportId={current} aboard={Boolean(plane) && aboard} viewKey={orderViewKey} busy={view.busy}/>}
        </>}
      </main>}
      {game && workPage && <PageFrame key={workPage} page={workPage} title={pageTitles[workPage]} closeLabel={t('modal.close', { title: pageTitles[workPage] })} onClose={closePage} layout={organizationOpen ? 'tree' : 'workspace'}>
        {workPage === 'career' ? <CareerHub game={game} busy={view.busy} selected={plane?.id ?? context?.selected.id} airportId={current}/>
          : workPage === 'airports' ? <AirportDirectory game={game} onInspect={id => inspectAirport(id, undefined, 'directory')}/>
          : workPage === 'shop' ? <Shop game={game} busy={view.busy} selected={current}/>
          : workPage === 'fleet' ? <FleetManagement onEmployee={id => openOrganization(id)} game={game} busy={view.busy} selectedPlaneId={plane?.id ?? context?.selected.id} initialTab={fleetTab} onSelect={selectPlane}/>
          : <CompanyOrganization game={game} busy={view.busy} initialEmployeeId={organizationTarget.id} initialTraining={organizationTarget.training} onClose={closePage} onPlane={selectPlane} onAirport={visitAirport}/>}
      </PageFrame>}
    </GameShell>
    <OverlayHost>
      {modal === 'settings' && <Settings onClose={() => setModal(null)}/>}
      {game && modal && modal !== 'settings' && <GameDialog key={modal} title={modalTitles[modal]} className={`game-modal ${modal === 'help' ? 'help-modal' : ''}`} onClose={closeModal}>
        {modal === 'airport-detail' ? <AirportDetails game={game} id={detailAirport} busy={view.busy} backLabel={detailBack === 'directory' ? (locale === 'zh-CN' ? '返回机场目录' : 'Back to Directory') : detailBack === 'map' ? (mapMode === 'browse' ? (locale === 'zh-CN' ? '返回地图' : 'Back to Map') : (locale === 'zh-CN' ? '返回制定路线' : 'Back to Route Plan')) : (locale === 'zh-CN' ? '返回机场装载' : 'Back to Airport')} onBack={closeModal} onUnlocked={() => { const resume = routeUnlockResume.current; routeUnlockResume.current = null; if (resume) { setModal(null); resume(); } }} onVisit={visitAirport} onPlane={selectPlane} onRoute={id => showMap(id)}/>
          : modal === 'tasks' ? <TaskCenter onEmployee={(id, training) => openOrganization(id, training)} game={game} plane={plane ?? context?.selected} busy={view.busy} onNext={step => { if (step === 'map') showMap(); else if (step === 'flight') openFleet('flights'); else { if (context) selectPlane((plane ?? context.selected).id); showOrders(false); } }}/>
          : <HelpContent busy={view.busy} onStart={() => { ignore(act({ type:'tutorial', action:'start' }).then(() => { setModal(null); setBrowsedAirport(null); navigate({ type: 'open', page: 'airport' }); })); }}/>}
      </GameDialog>}
      {view.notice && !modal && !isDispatch && !workPage && <div className="toast" role="status"><Icon name="check"/><span>{text(view.notice)}</span><button aria-label={t('common.closeNotice')} onClick={() => useGame.setState({ notice:null })}>×</button></div>}
      {view.error && game && !modal && !view.blocked && !workPage && <div className="error-toast" role="alert"><span>{text(view.error)}</span>{isDispatch && <button onClick={() => setModal('settings')}>{t('map.settings')}</button>}<button onClick={() => useGame.setState({ error:null })}>{t('common.close')}</button></div>}
      {view.report && !modal && !isDispatch && !workPage && <div className="return-report" role="status"><h3>{view.report.clockBack ? t('status.clockBack') : t('status.offlineReport')}</h3><p>{t('status.offlineSummary', { elapsed:duration(view.report.elapsed), flights:view.report.flights, profit:money(view.report.profit) })}</p>{view.report.capped && <p>{t('status.offlineCap')}</p>}<button className="primary" onClick={() => useGame.setState({ report:null })}>{t('status.continue')}</button></div>}
      {view.updateAvailable && !modal && !isDispatch && <button className="update-notice" onClick={() => setModal('settings')}>{t('status.update')}</button>}
      {view.blocked && <div className="blocking-screen" role="alert"><h2>{t('status.blocked')}</h2><p>{t('status.blockedText')}</p><button className="primary" onClick={() => location.reload()}>{t('status.reload')}</button></div>}
      <div className="rotate-screen"><Icon name="rotate"/><h2>{t('rotate.title')}</h2><p>{t('rotate.subtitle')}</p></div>
    </OverlayHost>
  </>;
}
