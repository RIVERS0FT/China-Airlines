import { useEffect, useReducer, useRef, useState } from 'react';
import { controller, useGame } from '../runtime.js';
import { CareerHub } from './CareerHub.js';
import { CompanyOrganization } from './CompanyOrganization.js';
import { Network } from './Network.js';
import { AirportDirectory } from './AirportDirectory.js';
import { AirportDetails } from './AirportDetails.js';
import { airportScene } from './airport-presentation.js';
import { AirportWorkspace } from './AirportWorkspace.js';
import { Tutorial } from './Tutorial.js';
import { FleetManagement, type FleetTab } from './FleetManagement.js';
import { TaskCenter } from './TaskCenter.js';
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

export function App() {
  const view = useGame(), game = view.game;
  const { locale, t, money, duration, text } = useI18n();
  const [playing, setPlaying] = useState(() => sessionValue(PLAYING_KEY) === 'true');
  const [navigation, navigate] = useReducer(navigationReducer, sessionValue(SCREEN_KEY), initialNavigation);
  const screen = navigation.scene === 'airport' ? 'airport' : 'map';
  const mapMode: MapMode = navigation.scene === 'dispatch' ? 'dispatch' : 'browse';
  const workPage = isWorkPage(navigation.page) ? navigation.page : null;
  const [planeId, setPlaneId] = useState('AC0001');
  const [destination, setDestination] = useState('PEK'), [aboard, setAboard] = useState(false);
  const [orderViewKey, setOrderViewKey] = useState(0);
  const [organizationTarget, setOrganizationTarget] = useState<{ id: number | null; training: boolean }>({ id: null, training: false });
  const [modal, setModal] = useState<ModalName | null>(null);
  const [fleetTab, setFleetTab] = useState<FleetTab | undefined>();
  const [fleetEntry, setFleetEntry] = useState(0);
  const [browsedAirport, setBrowsedAirport] = useState<string | null>(null);
  const [detailAirport, setDetailAirport] = useState('PEK');
  const [detailBack, setDetailBack] = useState<'directory' | 'map' | 'close'>('directory');
  const mapReturn = useRef<{ planeId: string; browsedAirport: string | null; aboard: boolean } | null>(null);
  const routeUnlockResume = useRef<(() => void) | null>(null);
  const workspaceOpener = useRef<HTMLElement | null>(null);
  const context = game ? airportScene(game, planeId, browsedAirport) : null;
  const plane = context?.plane, current = context?.airportId ?? 'PEK';
  const to = game?.airports.some(a => a.id === destination && a.id !== current)
    ? destination : game?.airports.find(a => a.id !== current)?.id ?? 'PVG';
  const isDispatch = navigation.page === 'dispatch';
  const flight = plane?.flight;
  const cooling = plane && game && plane.readyAt > game.simTime;
  const departureReason = !plane ? t('airport.noPlane') : view.busy ? t('airport.saving') : flight ? t('airport.flying')
    : plane.energy.serviceUntil !== null ? t('airport.servicing') : cooling ? t('airport.turnaround') : '';

  useEffect(() => {
    if (!view.notice) return;
    const timer = setTimeout(() => useGame.setState({ notice: null }), 4000);
    return () => clearTimeout(timer);
  }, [view.notice]);
  useEffect(() => {
    if (!playing) return;
    try { sessionStorage.setItem(PLAYING_KEY, 'true'); sessionStorage.setItem(SCREEN_KEY, screen); } catch { /* Presentation preferences are optional. */ }
  }, [playing, screen]);

  function openPage(page: WorkPage) {
    workspaceOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    navigate({ type: 'open', page }); setModal(null);
  }
  function closePage() {
    const opener = workspaceOpener.current;
    navigate({ type: 'return' });
    // Focus restoration does not depend on animation or the simulation clock.
    queueMicrotask(() => {
      if (document.querySelector('dialog[open]')) return;
      const target = opener?.isConnected && opener.getClientRects().length ? opener : document.querySelector<HTMLElement>('.game-dock [aria-current="page"]');
      target?.focus({ preventScroll: true });
    });
  }
  function openOrganization(id: number | null = null, training = false) { setOrganizationTarget({ id, training }); openPage('organization'); }
  function openFleet(tab?: FleetTab) {
    // Repeated HUD requests must open Flights even when Fleet is already active.
    setFleetTab(tab); setFleetEntry(value => value + 1); openPage('fleet');
  }
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
  function resumeRouteUnlock() {
    const resume = routeUnlockResume.current; routeUnlockResume.current = null;
    if (resume) { setModal(null); resume(); }
  }
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
    if (page === navigation.page && page !== 'airport') return;
    if (page === 'map') {
      if (navigation.scene === 'map') { navigate({ type: 'open', page }); setModal(null); }
      else showMap(undefined, 'browse');
    } else if (page === 'airport') {
      if (screen === 'map') returnFromMap(); else { navigate({ type: 'open', page }); showOrders(false); }
    } else if (page === 'fleet') openFleet();
    else if (page === 'organization') openOrganization();
    else if (isWorkPage(page)) openPage(page);
  }
  function enterGame() {
    if (!game || view.recovery) return;
    const selected = context?.selected ?? game.fleet[0];
    if (selected) { setPlaneId(selected.id); setDestination(selected.flight?.to ?? selected.airportId); }
    setBrowsedAirport(null); navigate({ type: 'open', page: 'map' }); setPlaying(true);
  }
  function finishDeparture() { mapReturn.current = null; navigate({ type: 'open', page: 'airport' }); setAboard(true); }
  function locateTutorial(target: string) {
    if (target === 'tasks') setModal('tasks');
    else if (target === 'map') showMap();
    else { navigate({ type: 'open', page: 'airport' }); setAboard(false); }
  }
  function nextTask(step: string) {
    if (step === 'map') showMap();
    else if (step === 'flight') openFleet('flights');
    else { if (context) selectPlane((plane ?? context.selected).id); showOrders(false); }
  }
  function startTutorial() {
    ignore(controller.command({ type: 'tutorial', action: 'start' }).then(() => {
      setModal(null); setBrowsedAirport(null); navigate({ type: 'open', page: 'airport' });
    }));
  }
  const pageTitles: Record<WorkPage, string> = {
    career:t('modal.career'), shop:t('modal.shop'), fleet:t('modal.fleet'), airports:t('modal.airports'), organization:t('nav.organization'),
  };
  const modalTitles: Record<ModalName, string> = {
    tasks:t('modal.tasks'), settings:t('common.settings'), help:t('modal.help'), 'airport-detail':t('modal.airportDetails'),
  };
  const detailBackLabel = detailBack === 'directory' ? (locale === 'zh-CN' ? '返回机场目录' : 'Back to Directory')
    : detailBack === 'map' ? (mapMode === 'browse' ? (locale === 'zh-CN' ? '返回地图' : 'Back to Map') : (locale === 'zh-CN' ? '返回制定路线' : 'Back to Route Plan'))
    : (locale === 'zh-CN' ? '返回机场装载' : 'Back to Airport');
  const blocking = view.blocked && <div className="blocking-screen" role="alert"><h2>{t('status.blocked')}</h2><p>{t('status.blockedText')}</p><button className="primary" onClick={() => location.reload()}>{t('status.reload')}</button></div>;
  const rotate = <div className="rotate-screen"><Icon name="rotate"/><h2>{t('rotate.title')}</h2><p>{t('rotate.subtitle')}</p></div>;

  if (!playing) return <>
    <StartScreen ready={Boolean(game) && !view.booting} recovery={view.recovery} error={view.error} onEnter={enterGame} onSettings={() => setModal('settings')}/>
    <OverlayHost>{modal === 'settings' && <Settings onClose={() => setModal(null)}/>}{blocking}{rotate}</OverlayHost>
  </>;

  return <>
    <GameShell page={navigation.page} modalOpen={Boolean(modal && (game || modal === 'settings'))} training={navigation.page === 'airport' && game?.tutorial === 'active' && Boolean(plane) && !modal}
      header={<TopStatusBar hidden={isDispatch} onFleet={() => openFleet('flights')} onHelp={() => setModal('help')} onSettings={() => setModal('settings')}/>}
      navigation={game && <MainNavigation page={navigation.page} onNavigate={selectPage} departure={{ disabled: !plane || view.busy || Boolean(flight) || Boolean(cooling) || plane?.energy.serviceUntil !== null, reason: departureReason, onClick: () => showMap() }}/> }>
      {navigation.page === 'airport' && game && plane && game.tutorial === 'active' && !modal && <Tutorial game={game} plane={plane} screen={screen} destination={to} busy={view.busy} onLocate={locateTutorial}/>}
      {!game ? <main className="startup"><h2>{view.booting ? t('start.loading') : t('startup.missing')}</h2><p>{view.error}</p><button onClick={() => setModal('settings')}>{t('startup.recover')}</button></main> : <main className="game-workspace" style={{ display: workPage ? 'none' : undefined }} aria-label={screen === 'airport' ? t('nav.airport') : mapMode === 'browse' ? t('map.a11yBrowse') : t('map.a11yPlan')}>
        {screen === 'map' ? <Network key={`${plane?.id}-${mapMode}`} mode={mapMode} onInspect={(id, afterUnlock) => inspectAirport(id, afterUnlock, 'map')} game={game} plane={plane} destination={destination} setDestination={setDestination} onReturn={returnFromMap} onDepart={finishDeparture} busy={view.busy}/>
          : context && <AirportWorkspace game={game} context={context} busy={view.busy} aboard={aboard} orderViewKey={orderViewKey} onInspect={id => inspectAirport(id)} onSelectPlane={selectPlane} onCycle={cycle} onCabin={() => flight ? openFleet('flights') : showOrders(true)} onTasks={() => setModal('tasks')}/>}
      </main>}
      {game && workPage && <PageFrame key={workPage} page={workPage} title={pageTitles[workPage]} closeLabel={t('modal.close', { title: pageTitles[workPage] })} onClose={closePage} layout={workPage === 'organization' ? 'tree' : 'workspace'}>
        {workPage === 'career' ? <CareerHub game={game} busy={view.busy} selected={plane?.id ?? context?.selected.id} airportId={current}/>
          : workPage === 'airports' ? <AirportDirectory game={game} onInspect={id => inspectAirport(id, undefined, 'directory')}/>
          : workPage === 'shop' ? <Shop game={game} busy={view.busy} selected={current}/>
          : workPage === 'fleet' ? <FleetManagement key={fleetEntry} onEmployee={id => openOrganization(id)} game={game} busy={view.busy} selectedPlaneId={plane?.id ?? context?.selected.id} initialTab={fleetTab} onSelect={selectPlane}/>
          : <CompanyOrganization game={game} busy={view.busy} initialEmployeeId={organizationTarget.id} initialTraining={organizationTarget.training} onClose={closePage} onPlane={selectPlane} onAirport={visitAirport}/>}
      </PageFrame>}
    </GameShell>
    <OverlayHost>
      {modal === 'settings' && <Settings onClose={() => setModal(null)}/>}
      {game && modal && modal !== 'settings' && <GameDialog key={modal} title={modalTitles[modal]} className={`game-modal ${modal === 'help' ? 'help-modal' : ''}`} onClose={closeModal}>
        {modal === 'airport-detail' ? <AirportDetails game={game} id={detailAirport} busy={view.busy} backLabel={detailBackLabel} onBack={closeModal} onUnlocked={resumeRouteUnlock} onVisit={visitAirport} onPlane={selectPlane} onRoute={id => showMap(id)}/>
          : modal === 'tasks' ? <TaskCenter onEmployee={(id, training) => openOrganization(id, training)} game={game} plane={plane ?? context?.selected} busy={view.busy} onNext={nextTask}/>
          : <HelpContent busy={view.busy} onStart={startTutorial}/>}
      </GameDialog>}
      {view.notice && !modal && !isDispatch && !workPage && <div className="toast" role="status"><Icon name="check"/><span>{text(view.notice)}</span><button aria-label={t('common.closeNotice')} onClick={() => useGame.setState({ notice:null })}>×</button></div>}
      {view.error && game && !modal && !view.blocked && !workPage && <div className="error-toast" role="alert"><span>{text(view.error)}</span>{isDispatch && <button onClick={() => setModal('settings')}>{t('map.settings')}</button>}<button onClick={() => useGame.setState({ error:null })}>{t('common.close')}</button></div>}
      {view.report && !modal && !isDispatch && !workPage && <div className="return-report" role="status"><h3>{view.report.clockBack ? t('status.clockBack') : t('status.offlineReport')}</h3><p>{t('status.offlineSummary', { elapsed:duration(view.report.elapsed), flights:view.report.flights, profit:money(view.report.profit) })}</p>{view.report.capped && <p>{t('status.offlineCap')}</p>}<button className="primary" onClick={() => useGame.setState({ report:null })}>{t('status.continue')}</button></div>}
      {view.updateAvailable && !modal && !isDispatch && <button className="update-notice" onClick={() => setModal('settings')}>{t('status.update')}</button>}
      {blocking}{rotate}
    </OverlayHost>
  </>;
}
