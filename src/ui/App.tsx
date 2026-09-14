import { CareerHub } from './CareerHub.js';
import { careerLevel } from '../core/career.js';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { airport, aircraftSpecs } from '../core/catalog.js';
import { loadSummary, type Command } from '../core/game.js';
import { controller, useGame } from '../runtime.js';
import { Network } from './Network.js';
import { energyText } from './EnergyService.js';
import { FlightMoney } from './FlightBoard.js';
import { flightStatus } from './flight-status.js';
import { AirportDirectory } from './AirportDirectory.js';
import { AirportDetails } from './AirportDetails.js';
import { airportScene } from './airport-presentation.js';
import { OrderBoard } from './OrderBoard.js';
import { Tutorial } from './Tutorial.js';
import './management.css';
import { FleetManagement, type FleetTab } from './FleetManagement.js';
import { TaskCenter } from './TaskCenter.js';
import './workshop.css';
import { AviationScene } from './AviationScene.js';
import { AirportSceneTools } from './AirportSceneTools.js';
import { Icon, Settings, Shop, ignore } from './Panels.js';
import { StartScreen } from './StartScreen.js';
import { useI18n } from '../i18n/I18n.js';

type Screen = 'airport' | 'map';
type MapMode = 'browse' | 'dispatch';
type ModalName = 'career' | 'shop' | 'fleet' | 'tasks' | 'settings' | 'help' | 'airports' | 'airport-detail';
const PLAYING_KEY = 'china-airlines:playing:v1';
const SCREEN_KEY = 'china-airlines:screen:v1';
const sessionValue = (key: string) => { try { return sessionStorage.getItem(key); } catch { return null; } };

const act = (command: Command) => controller.command(command);

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => { if (dialog.open) dialog.close(); }; }, []);
  return <dialog ref={ref} className="game-modal" aria-label={title} onClose={onClose}>
    <header><h2>{title}</h2><button onClick={() => ref.current?.close()} aria-label={t('modal.close', { title })}>×</button></header>{children}
  </dialog>;
}

export function App() {
  const view = useGame(), game = view.game;
  const { locale, t, money, duration, airportName, modelName, ui, text } = useI18n();
  const [playing, setPlaying] = useState(() => sessionValue(PLAYING_KEY) === 'true');
  const [screen, setScreen] = useState<Screen>(() => sessionValue(SCREEN_KEY) === 'airport' ? 'airport' : 'map'), [planeId, setPlaneId] = useState('AC0001');
  const [mapMode, setMapMode] = useState<MapMode>('browse');
  const [destination, setDestination] = useState('PEK'), [aboard, setAboard] = useState(false);
  const [orderViewKey, setOrderViewKey] = useState(0);
  const [modal, setModal] = useState<ModalName | null>(null);
  const [fleetTab, setFleetTab] = useState<FleetTab>('planes');
  const [browsedAirport, setBrowsedAirport] = useState<string | null>(null);
  const [detailAirport, setDetailAirport] = useState('PEK');
  const [detailBack, setDetailBack] = useState<'directory' | 'map' | 'close'>('directory');
  const mapReturn = useRef<{ planeId: string; browsedAirport: string | null; aboard: boolean } | null>(null);
  const routeUnlockResume = useRef<(() => void) | null>(null);
  const context = game ? airportScene(game, planeId, browsedAirport) : null;
  const plane = context?.plane, current = context?.airportId ?? 'PEK';
  const to = game?.airports.some(a => a.id === destination && a.id !== current)
    ? destination : game?.airports.find(a => a.id !== current)?.id ?? 'PVG';
  const isDispatch = screen === 'map' && mapMode === 'dispatch';
  const isBrowseMap = screen === 'map' && mapMode === 'browse';

  useEffect(() => {
    if (!view.notice) return;
    const timer = setTimeout(() => useGame.setState({ notice: null }), 4000);
    return () => clearTimeout(timer);
  }, [view.notice]);

  useEffect(() => {
    if (!playing) return;
    try { sessionStorage.setItem(PLAYING_KEY, 'true'); sessionStorage.setItem(SCREEN_KEY, screen); } catch { /* Session-only convenience; gameplay does not depend on it. */ }
  }, [playing, screen]);

  function openFleet(tab: FleetTab = 'planes') { setFleetTab(tab); setModal('fleet'); }
  function selectPlane(id: string) { setPlaneId(id); setBrowsedAirport(null); setScreen('airport'); setAboard(false); setModal(null); }
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
    setBrowsedAirport(id); setScreen('airport'); setAboard(false); setModal(null);
  }
  function showMap(target?: string, mode: MapMode = 'dispatch') {
    // Use an actual aircraft, never treat an empty airport as its departure point.
    if (!context) return;
    if (screen !== 'map') mapReturn.current = { planeId, browsedAirport, aboard };
    const selected = plane ?? context.selected;
    setMapMode(mode); setPlaneId(selected.id);
    setDestination(mode === 'browse' ? current : target ?? selected.flight?.to ?? (!plane && context.pinned ? context.pinned : to));
    setBrowsedAirport(null); setScreen('map'); setModal(null);
  }
  function returnFromMap() {
    const previous = mapReturn.current;
    mapReturn.current = null; routeUnlockResume.current = null;
    if (previous) {
      setPlaneId(previous.planeId); setBrowsedAirport(previous.browsedAirport); setAboard(previous.aboard);
    }
    setScreen('airport'); setModal(null);
  }
  function enterGame() {
    if (!game || view.recovery) return;
    const selected = context?.selected ?? game.fleet[0];
    if (selected) {
      setPlaneId(selected.id);
      setDestination(selected.flight?.to ?? selected.airportId);
    }
    setBrowsedAirport(null); setMapMode('browse'); setScreen('map'); setPlaying(true);
  }

  const total = game && plane ? loadSummary(game, plane.id) : { passengers: 0, cargo: 0 };
  const model = plane ? aircraftSpecs(plane) : null;
  const status = game && plane ? flightStatus(game, plane) : null;
  const flight = plane?.flight;
  const cooling = plane && game && plane.readyAt > game.simTime;
  const departureReason = !plane ? t('airport.noPlane') : view.busy ? t('airport.saving') : flight ? t('airport.flying')
    : plane.energy.serviceUntil !== null ? t('airport.servicing') : cooling ? t('airport.turnaround') : '';
  const city = (id: string) => airportName(id, airport(id).city);
  const modalTitles: Record<ModalName, string> = {
    career:t('modal.career'), shop:t('modal.shop'), fleet:t('modal.fleet'), tasks:t('modal.tasks'), settings:t('common.settings'),
    help:t('modal.help'), airports:t('modal.airports'), 'airport-detail':t('modal.airportDetails')
  };

  if (!playing) return <>
    <StartScreen ready={Boolean(game) && !view.booting} recovery={view.recovery} error={view.error} onEnter={enterGame} onSettings={() => setModal('settings')}/>
    {modal === 'settings' && <Settings onClose={() => setModal(null)}/>}
    {view.blocked && <div className="blocking-screen" role="alert"><h2>{t('status.blocked')}</h2><p>{t('status.blockedText')}</p><button className="primary" onClick={() => location.reload()}>{t('status.reload')}</button></div>}
    <div className="rotate-screen"><Icon name="rotate"/><h2>{t('rotate.title')}</h2><p>{t('rotate.subtitle')}</p></div>
  </>;

  return <>
    <div className={`aviation-game ${isDispatch ? 'dispatch-focused' : ''} ${isBrowseMap ? 'map-browse' : ''} ${screen === 'airport' && game?.tutorial === 'active' && plane && !modal ? 'training-active' : ''}`}>
      <header className="game-hud" hidden={screen === 'map'}>
        <div className="game-brand"><span className="pilot-badge"><Icon name="pilot"/></span><div><h1>{t('app.name')}</h1><small>{t('hud.company', { level: game ? careerLevel(game) : 1 })}</small></div></div>
        <div className="resource"><Icon name="coin"/><span><small>{t('hud.credits')}</small><strong data-testid="credits">{money(game?.credits ?? 0)}</strong></span></div>
        <button className="resource fleet-status-button" aria-label={t('hud.fleetOpen')} disabled={!game} onClick={() => openFleet('flights')}><Icon name="fleet"/><span><small>{t('hud.fleet')}</small><strong data-testid="fleet-count">{t('common.aircraftCount', { count: game?.fleet.length ?? 0 })}</strong></span></button>
        <div className="resource" data-testid="tickets-resource"><Icon name="trophy"/><span><small>{t('hud.tickets')}</small><strong data-testid="tickets-count">{t('common.ticketCount', { count: game?.career.tickets ?? 0 })}</strong><span className="sr-only" data-testid="flights-count">{t('common.flightCount', { count: game?.stats.flights ?? 0 })}</span></span></div>
        <button aria-label={t('hud.help')} onClick={() => setModal('help')}><Icon name="help"/></button>
        <button aria-label={t('hud.save')} onClick={() => setModal('settings')}><Icon name="save"/><span>{view.busy ? t('common.saving') : view.error ? t('common.attention') : t('common.saved')}</span></button>
      </header>

      {screen === 'airport' && game && plane && game.tutorial === 'active' && !modal && <Tutorial game={game} plane={plane} screen={screen} destination={to} busy={view.busy} onLocate={target => {
        if (target === 'tasks') setModal('tasks'); else if (target === 'map') showMap(); else { setScreen('airport'); setAboard(false); }
      }}/>}

      {!game ? <main className="startup"><h2>{view.booting ? t('start.loading') : t('startup.missing')}</h2><p>{view.error}</p><button onClick={() => setModal('settings')}>{t('startup.recover')}</button></main> : <main className="game-workspace">
        {screen === 'map' ? <Network key={`${plane?.id}-${mapMode}`} mode={mapMode} onInspect={(id, afterUnlock) => inspectAirport(id, afterUnlock, 'map')} game={game} plane={plane} destination={destination} setDestination={setDestination} onReturn={returnFromMap} onSettings={() => setModal('settings')} onDepart={() => { mapReturn.current = null; setScreen('airport'); setAboard(true); }} busy={view.busy}/> : <>
          <div className="airport-titlebar">
            <button className="airport-info-trigger" aria-label={t('airport.currentDetails')} onClick={() => inspectAirport(current, undefined, 'close')} title={t('airport.detailsHint')}>{t('airport.details')}</button>
            <div className="gate-sign"><b>{flight ? t('airport.flight') : '01'}</b><div><strong>{flight ? t('flight.route', { from:city(flight.from), to:city(flight.to) }) : t('airport.name', { city:city(current) })}</strong><small>{current} · {t('common.level', { value:game.airports.find(item => item.id === current)?.level ?? 0 })}</small></div></div>
            <div className="plane-status"><strong>{plane ? `${modelName(plane.modelId, model!.name)} · ${plane.id}` : t('airport.browseEmpty')}</strong><span>{!plane ? t('airport.browseOnly') : status && status.remaining !== null ? `${ui(status.label)} · ${ui('{time} 后{event}',{time:duration(status.remaining),event:ui(status.nextEvent)})}` : t('airport.parked')}</span></div>
            <div className="capacity"><span data-testid="passenger-capacity">{t('airport.passengers', { used:total.passengers, capacity:model?.seats ?? 0 })}</span><span>{t('airport.cargo', { used:total.cargo, capacity:model?.cargo ?? 0 })}</span>{plane && <span className="plane-energy" data-testid="plane-energy">{t('airport.energy', { value:energyText(plane.energy.availableSeconds) })}</span>}</div>
            {plane && plane.itinerary.length > 0 && <button className="plan-cancel" disabled={view.busy} onClick={() => ignore(act({ type:'cancel-plan', planeId:plane.id }))}>{t('airport.cancelPlan')}</button>}
            {plane?.autoRouteId && <button disabled={view.busy} onClick={() => ignore(act({ type:'stop', planeId:plane.id }))}>{t('airport.stopAuto')}</button>}
          </div>
          <div className="scene-wrap">
            {context?.pinned && <button className="return-selected-plane" onClick={() => selectPlane(context.selected.id)}>{t('airport.backPlane', { id:context.selected.id })}</button>}
            {plane && plane.itinerary.length > 0 && <div className="itinerary-banner" data-testid="active-plan">{t('airport.onward', { route:plane.itinerary.map(city).join(' → ') })}</div>}
            <AviationScene game={game} plane={plane} onCabin={() => flight ? openFleet('flights') : showOrders(true)}/><AirportSceneTools game={game} plane={plane} onTasks={() => setModal('tasks')}/>
            <button className="switch-plane previous" aria-label={t('airport.previousPlane')} disabled={!context || context.choices.length < 2} onClick={() => cycle(-1)}>◀</button><button className="switch-plane next" aria-label={t('airport.nextPlane')} disabled={!context || context.choices.length < 2} onClick={() => cycle(1)}>▶</button>
            {flight && <div className="air-progress"><span>{city(flight.from)}</span><progress aria-label={t('flight.progress', { from:city(flight.from), to:city(flight.to) })} max={1} value={Math.max(0, (game.simTime - flight.departAt) / (flight.arriveAt - flight.departAt))}/><span>{city(flight.to)}</span></div>}
            {status?.flight && <div className="scene-flight-summary"><FlightMoney flight={status.flight}/></div>}
          </div>
          {!flight && <OrderBoard game={game} plane={plane} airportId={current} aboard={Boolean(plane) && aboard} viewKey={orderViewKey} busy={view.busy}/>}
        </>}
      </main>}

      {!isDispatch && game && <nav className="game-dock" aria-label={t('nav.main')}>
        <button className={isBrowseMap ? 'active' : ''} onClick={() => showMap(undefined, 'browse')}><Icon name="map"/><span>{t('nav.map')}</span></button>
        <button className={screen === 'airport' ? 'active' : ''} onClick={() => screen === 'map' ? returnFromMap() : showOrders(false)}><Icon name="airport"/><span>{t('nav.airport')}</span></button>
        <button onClick={() => setModal('airports')}><Icon name="directory"/><span>{t('nav.directory')}</span></button>
        <button onClick={() => openFleet()}><Icon name="plane"/><span>{t('nav.fleet')}</span></button>
        <button onClick={() => setModal('shop')}><Icon name="shop"/><span>{t('nav.shop')}</span></button>
        <button type="button" aria-haspopup="dialog" onClick={() => setModal('career')}><Icon name="trophy"/><span>{t('nav.career')}</span></button>
        {screen === 'airport' && <button className="gold-button depart-button" aria-label={t('nav.dispatch')} aria-describedby="airport-departure-reason" title={departureReason || t('airport.routeHint')} disabled={!plane || view.busy || Boolean(flight) || Boolean(cooling) || plane?.energy.serviceUntil !== null} onClick={() => showMap()}><Icon name="plane"/><span>{t('nav.dispatch')}</span><small id="airport-departure-reason" className="airport-departure-reason">{departureReason}</small></button>}
      </nav>}
    </div>

    {modal === 'settings' && <Settings onClose={() => setModal(null)}/>}
    {game && modal && modal !== 'settings' && <Modal key={modal} title={modalTitles[modal]} onClose={closeModal}>
      {modal === 'career' ? <CareerHub game={game} busy={view.busy} selected={plane?.id ?? context?.selected.id} airportId={current} onPlane={id => { selectPlane(id); setModal(null); }} onAirport={id => { visitAirport(id); setModal(null); }}/>
        : modal === 'airports' ? <AirportDirectory game={game} onInspect={id => inspectAirport(id, undefined, 'directory')}/>
        : modal === 'airport-detail' ? <AirportDetails game={game} id={detailAirport} busy={view.busy} backLabel={detailBack === 'directory' ? (locale === 'zh-CN' ? '返回机场目录' : 'Back to Directory') : detailBack === 'map' ? (mapMode === 'browse' ? (locale === 'zh-CN' ? '返回地图' : 'Back to Map') : (locale === 'zh-CN' ? '返回制定路线' : 'Back to Route Plan')) : (locale === 'zh-CN' ? '返回机场装载' : 'Back to Airport')} onBack={() => { routeUnlockResume.current = null; if (detailBack === 'directory') setModal('airports'); else setModal(null); }} onUnlocked={() => { const resume = routeUnlockResume.current; routeUnlockResume.current = null; if (resume) { setModal(null); resume(); } }} onVisit={visitAirport} onPlane={selectPlane} onRoute={id => showMap(id)}/>
        : modal === 'shop' ? <Shop game={game} busy={view.busy} selected={current}/>
        : modal === 'tasks' ? <TaskCenter game={game} plane={plane ?? context?.selected} busy={view.busy} onNext={step => { if (step === 'map') showMap(); else if (step === 'flight') openFleet('flights'); else { if (context) selectPlane((plane ?? context.selected).id); showOrders(false); } }}/>
        : modal === 'fleet' ? <FleetManagement game={game} busy={view.busy} selectedPlaneId={plane?.id ?? context?.selected.id} initialTab={fleetTab} onSelect={selectPlane}/>
        : <HelpContent busy={view.busy} onStart={() => { ignore(act({ type:'tutorial', action:'start' }).then(() => { setModal(null); setBrowsedAirport(null); setScreen('airport'); })); }}/>}
    </Modal>}
    {view.notice && !modal && !isDispatch && <div className="toast" role="status"><Icon name="check"/><span>{text(view.notice)}</span><button aria-label={t('common.closeNotice')} onClick={() => useGame.setState({ notice:null })}>×</button></div>}
    {view.error && game && !modal && !view.blocked && <div className="error-toast" role="alert"><span>{text(view.error)}</span>{isDispatch && <button onClick={() => setModal('settings')}>{t('map.settings')}</button>}<button onClick={() => useGame.setState({ error:null })}>{t('common.close')}</button></div>}
    {view.report && !modal && !isDispatch && <div className="return-report" role="status"><h3>{view.report.clockBack ? t('status.clockBack') : t('status.offlineReport')}</h3><p>{t('status.offlineSummary', { elapsed:duration(view.report.elapsed), flights:view.report.flights, profit:money(view.report.profit) })}</p>{view.report.capped && <p>{t('status.offlineCap')}</p>}<button className="primary" onClick={() => useGame.setState({ report:null })}>{t('status.continue')}</button></div>}
    {view.updateAvailable && !modal && !isDispatch && <button className="update-notice" onClick={() => setModal('settings')}>{t('status.update')}</button>}
    {view.blocked && <div className="blocking-screen" role="alert"><h2>{t('status.blocked')}</h2><p>{t('status.blockedText')}</p><button className="primary" onClick={() => location.reload()}>{t('status.reload')}</button></div>}
    <div className="rotate-screen"><Icon name="rotate"/><h2>{t('rotate.title')}</h2><p>{t('rotate.subtitle')}</p></div>
  </>;
}

function HelpContent({ busy, onStart }: { busy: boolean; onStart: () => void }) {
  const { locale } = useI18n();
  if (locale === 'en-US') return <div className="help-content"><button className="start-guide-help" disabled={busy} onClick={onStart}>Start Guided Tutorial</button><h3>Load, plan, fly, and grow your airline network.</h3><p>1. Select real passengers or cargo at the airport. Capacity and restrictions are always checked by the simulation.</p><p>Use Map to browse cities and unlock airports. Use Plan Route from the airport to build an ordered route and review time, cost, revenue, and energy.</p><p>Orders pay only when they reach their final destination. Transfer orders stay aboard or at an airport until another aircraft carries them onward.</p><p>Tasks are available from the airport scene. Flights, upgrades, energy service, staffing, aircraft, and company facilities are available from their corresponding navigation entries.</p><small>Aircraft and economic values are game configurations. The world map is not navigation or administrative-boundary data.</small></div>;
  return <div className="help-content"><button className="start-guide-help" disabled={busy} onClick={onStart}>开始分步引导</button><h3>装载、规划、起飞，经营你的航空网络。</h3><p>① 点击下方旅客或货物装机；点击目的地站牌可装载同站客货，只取当前机场的真实订单，容量不足时跳过整单。</p><p>「地图」用于查看全球城市和解锁机场；「制定路线」用于按顺序选择城市并核对用时、成本、收益和能量。</p><p>到达最终目的地才交付并付款；其他订单留在机上。周转结束后可卸至机场，再让另一架飞机装载中转。</p><p>任务与奖励从机场场景左上角进入；航班、改装与补能在「机队管理」中查看，经营与设施从底部「经营中心」进入。</p><small>机型和经营参数均为游戏化配置；世界地图不是导航或行政边界资料。</small></div>;
}
