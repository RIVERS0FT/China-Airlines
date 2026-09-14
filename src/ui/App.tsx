import { CareerHub } from './CareerHub.js';
import { CompanyOrganization } from './CompanyOrganization.js';
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

function Modal({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => { if (dialog.open) dialog.close(); }; }, []);
  return <dialog ref={ref} className={`game-modal ${className}`.trim()} aria-label={title} onClose={onClose}>
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
  const [organizationOpen, setOrganizationOpen] = useState(false);
  const [organizationTarget, setOrganizationTarget] = useState<{ id: number | null; training: boolean }>({ id: null, training: false });
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

  function openOrganization(id: number | null = null, training = false) { setOrganizationTarget({ id, training }); setOrganizationOpen(true); setModal(null); }
  function openFleet(tab: FleetTab = 'planes') { setFleetTab(tab); setModal('fleet'); }
  function selectPlane(id: string) { setOrganizationOpen(false); setPlaneId(id); setBrowsedAirport(null); setScreen('airport'); setAboard(false); setModal(null); }
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
    setOrganizationOpen(false);
    if (!game?.airports.some(item => item.id === id)) return;
    setBrowsedAirport(id); setScreen('airport'); setAboard(false); setModal(null);
  }
  function showMap(target?: string, mode: MapMode = 'dispatch') {
    setOrganizationOpen(false);
    // Use an actual aircraft, never treat an empty airport as its departure point.
    if (!context) return;
    if (screen !== 'map') mapReturn.current = { planeId, browsedAirport, aboard };
    const selected = plane ?? context.selected;
    setMapMode(mode); setPlaneId(selected.id);
    setDestination(mode === 'browse' ? current : target ?? selected.flight?.to ?? (!plane && context.pinned ? context.pinned : to));
    setBrowsedAirport(null); setScreen('map'); setModal(null);
  }
  function returnFromMap() {
    setOrganizationOpen(false);
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
    <div className={`aviation-game ${isDispatch ? 'dispatch-focused' : ''} ${isBrowseMap && !organizationOpen ? 'map-browse' : ''} ${screen === 'airport' && game?.tutorial === 'active' && plane && !modal && !organizationOpen ? 'training-active' : ''}`}>
      <header className="game-hud" hidden={isDispatch}>
        <div className="game-brand"><span className="pilot-badge"><Icon name="pilot"/></span><div><h1>{t('app.name')}</h1><small>{t('hud.company', { level: game ? careerLevel(game) : 1 })}</small></div></div>
        <div className="resource"><Icon name="coin"/><span><small>{t('hud.credits')}</small><strong data-testid="credits">{money(game?.credits ?? 0)}</strong></span></div>
        <button className="resource fleet-status-button" aria-label={t('hud.fleetOpen')} disabled={!game} onClick={() => openFleet('flights')}><Icon name="fleet"/><span><small>{t('hud.fleet')}</small><strong data-testid="fleet-count">{t('common.aircraftCount', { count: game?.fleet.length ?? 0 })}</strong></span></button>
        <div className="resource" data-testid="tickets-resource"><Icon name="ticket"/><span><small>{t('hud.tickets')}</small><strong data-testid="tickets-count">{t('common.ticketCount', { count: game?.career.tickets ?? 0 })}</strong><span className="sr-only" data-testid="flights-count">{t('common.flightCount', { count: game?.stats.flights ?? 0 })}</span></span></div>
        <button aria-label={t('hud.help')} onClick={() => setModal('help')}><Icon name="help"/></button>
        <button aria-label={t('hud.save')} onClick={() => setModal('settings')}><Icon name="save"/><span>{view.busy ? t('common.saving') : view.error ? t('common.attention') : t('common.saved')}</span></button>
      </header>

      {screen === 'airport' && game && plane && game.tutorial === 'active' && !modal && !organizationOpen && <Tutorial game={game} plane={plane} screen={screen} destination={to} busy={view.busy} onLocate={target => {
        if (target === 'tasks') setModal('tasks'); else if (target === 'map') showMap(); else { setScreen('airport'); setAboard(false); }
      }}/>}

      {!game ? <main className="startup"><h2>{view.booting ? t('start.loading') : t('startup.missing')}</h2><p>{view.error}</p><button onClick={() => setModal('settings')}>{t('startup.recover')}</button></main> : <main className="game-workspace" style={{ display: organizationOpen ? 'none' : undefined }}>
        {screen === 'map' ? <Network key={`${plane?.id}-${mapMode}`} mode={mapMode} onInspect={(id, afterUnlock) => inspectAirport(id, afterUnlock, 'map')} game={game} plane={plane} destination={destination} setDestination={setDestination} onReturn={returnFromMap} onDepart={() => { mapReturn.current = null; setScreen('airport'); setAboard(true); }} busy={view.busy}/> : <>
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
            <AviationScene game={game} plane={plane} onCabin={() => flight ? openFleet('flights') : showOrders(true)}/><AirportSceneTools game={game} plane={plane} onTasks={() => setModal('tasks')}/>
            <button className="switch-plane previous" aria-label={t('airport.previousPlane')} disabled={!context || context.choices.length < 2} onClick={() => cycle(-1)}>◀</button><button className="switch-plane next" aria-label={t('airport.nextPlane')} disabled={!context || context.choices.length < 2} onClick={() => cycle(1)}>▶</button>
            {flight && <div className="air-progress"><span>{city(flight.from)}</span><progress aria-label={t('flight.progress', { from:city(flight.from), to:city(flight.to) })} max={1} value={Math.max(0, (game.simTime - flight.departAt) / (flight.arriveAt - flight.departAt))}/><span>{city(flight.to)}</span></div>}
            {status?.flight && <div className="scene-flight-summary"><FlightMoney flight={status.flight}/></div>}
          </div>
          {!flight && <OrderBoard game={game} plane={plane} airportId={current} aboard={Boolean(plane) && aboard} viewKey={orderViewKey} busy={view.busy}/>}
        </>}
      </main>}

      {game && organizationOpen && <main className="organization-workspace"><CompanyOrganization game={game} busy={view.busy} initialEmployeeId={organizationTarget.id} initialTraining={organizationTarget.training} onClose={() => setOrganizationOpen(false)} onPlane={selectPlane} onAirport={visitAirport}/></main>}

      {!isDispatch && game && <nav className="game-dock" aria-label={t('nav.main')}>
        <button className={isBrowseMap && !organizationOpen ? 'active' : ''} onClick={() => showMap(undefined, 'browse')}><Icon name="map"/><span>{t('nav.map')}</span></button>
        <button className={screen === 'airport' && !organizationOpen ? 'active' : ''} onClick={() => { setOrganizationOpen(false); if (screen === 'map') returnFromMap(); else showOrders(false); }}><Icon name="airport"/><span>{t('nav.airport')}</span></button>
        <button onClick={() => setModal('airports')}><Icon name="directory"/><span>{t('nav.directory')}</span></button>
        <button onClick={() => openFleet()}><Icon name="plane"/><span>{t('nav.fleet')}</span></button>
        <button onClick={() => setModal('shop')}><Icon name="shop"/><span>{t('nav.shop')}</span></button>
        <button type="button" className={organizationOpen ? 'active' : ''} aria-current={organizationOpen ? 'page' : undefined} onClick={() => openOrganization()}><Icon name="pilot"/><span>{t('nav.organization')}</span></button>
        <button type="button" aria-haspopup="dialog" onClick={() => setModal('career')}><Icon name="trophy"/><span>{t('nav.career')}</span></button>
        {screen === 'airport' && !organizationOpen && <button className="gold-button depart-button" aria-label={t('nav.dispatch')} aria-describedby="airport-departure-reason" title={departureReason || t('airport.routeHint')} disabled={!plane || view.busy || Boolean(flight) || Boolean(cooling) || plane?.energy.serviceUntil !== null} onClick={() => showMap()}><Icon name="plane"/><span>{t('nav.dispatch')}</span><small id="airport-departure-reason" className="airport-departure-reason">{departureReason}</small></button>}
      </nav>}
    </div>

    {modal === 'settings' && <Settings onClose={() => setModal(null)}/>}
    {game && modal && modal !== 'settings' && <Modal key={modal} title={modalTitles[modal]} className={modal === 'help' ? 'help-modal' : ''} onClose={closeModal}>
      {modal === 'career' ? <CareerHub game={game} busy={view.busy} selected={plane?.id ?? context?.selected.id} airportId={current}/>
        : modal === 'airports' ? <AirportDirectory game={game} onInspect={id => inspectAirport(id, undefined, 'directory')}/>
        : modal === 'airport-detail' ? <AirportDetails game={game} id={detailAirport} busy={view.busy} backLabel={detailBack === 'directory' ? (locale === 'zh-CN' ? '返回机场目录' : 'Back to Directory') : detailBack === 'map' ? (mapMode === 'browse' ? (locale === 'zh-CN' ? '返回地图' : 'Back to Map') : (locale === 'zh-CN' ? '返回制定路线' : 'Back to Route Plan')) : (locale === 'zh-CN' ? '返回机场装载' : 'Back to Airport')} onBack={() => { routeUnlockResume.current = null; if (detailBack === 'directory') setModal('airports'); else setModal(null); }} onUnlocked={() => { const resume = routeUnlockResume.current; routeUnlockResume.current = null; if (resume) { setModal(null); resume(); } }} onVisit={visitAirport} onPlane={selectPlane} onRoute={id => showMap(id)}/>
        : modal === 'shop' ? <Shop game={game} busy={view.busy} selected={current}/>
        : modal === 'tasks' ? <TaskCenter onEmployee={(id, training) => openOrganization(id, training)} game={game} plane={plane ?? context?.selected} busy={view.busy} onNext={step => { if (step === 'map') showMap(); else if (step === 'flight') openFleet('flights'); else { if (context) selectPlane((plane ?? context.selected).id); showOrders(false); } }}/>
        : modal === 'fleet' ? <FleetManagement onEmployee={id => openOrganization(id)} game={game} busy={view.busy} selectedPlaneId={plane?.id ?? context?.selected.id} initialTab={fleetTab} onSelect={selectPlane}/>
        : <HelpContent busy={view.busy} onStart={() => { ignore(act({ type:'tutorial', action:'start' }).then(() => { setModal(null); setBrowsedAirport(null); setScreen('airport'); })); }}/>}
    </Modal>}
    {view.notice && !modal && !isDispatch && !organizationOpen && <div className="toast" role="status"><Icon name="check"/><span>{text(view.notice)}</span><button aria-label={t('common.closeNotice')} onClick={() => useGame.setState({ notice:null })}>×</button></div>}
    {view.error && game && !modal && !view.blocked && !organizationOpen && <div className="error-toast" role="alert"><span>{text(view.error)}</span>{isDispatch && <button onClick={() => setModal('settings')}>{t('map.settings')}</button>}<button onClick={() => useGame.setState({ error:null })}>{t('common.close')}</button></div>}
    {view.report && !modal && !isDispatch && !organizationOpen && <div className="return-report" role="status"><h3>{view.report.clockBack ? t('status.clockBack') : t('status.offlineReport')}</h3><p>{t('status.offlineSummary', { elapsed:duration(view.report.elapsed), flights:view.report.flights, profit:money(view.report.profit) })}</p>{view.report.capped && <p>{t('status.offlineCap')}</p>}<button className="primary" onClick={() => useGame.setState({ report:null })}>{t('status.continue')}</button></div>}
    {view.updateAvailable && !modal && !isDispatch && <button className="update-notice" onClick={() => setModal('settings')}>{t('status.update')}</button>}
    {view.blocked && <div className="blocking-screen" role="alert"><h2>{t('status.blocked')}</h2><p>{t('status.blockedText')}</p><button className="primary" onClick={() => location.reload()}>{t('status.reload')}</button></div>}
    <div className="rotate-screen"><Icon name="rotate"/><h2>{t('rotate.title')}</h2><p>{t('rotate.subtitle')}</p></div>
  </>;
}

function HelpContent({ busy, onStart }: { busy: boolean; onStart: () => void }) {
  const { locale } = useI18n();
  if (locale === 'en-US') return <div className="help-content">
    <section className="help-hero" aria-labelledby="help-intro-en"><div><h3 id="help-intro-en">Your first flight in three steps</h3><p>Load real orders, review a route, then dispatch. The simulation always checks capacity, range, funds, energy, and airport level.</p></div><button className="start-guide-help" disabled={busy} onClick={onStart}>Start Guided Tutorial</button></section>
    <div className="help-grid">
      <section className="help-card help-steps"><header><Icon name="airport"/><h3>Quick Start</h3></header><ol><li><b>1</b><span><strong>Load at the airport</strong><small>Select individual passengers or cargo. An order that does not fit is skipped as a whole.</small></span></li><li><b>2</b><span><strong>Plan in order</strong><small>Open Plan Route and review each leg’s time, cost, income, and energy before dispatch.</small></span></li><li><b>3</b><span><strong>Arrive and transfer</strong><small>Only final-destination orders pay. Other orders remain aboard or can be unloaded for a later connection.</small></span></li></ol></section>
      <section className="help-card"><header><Icon name="map"/><h3>Globe Map</h3></header><ul><li><strong>Map</strong><span>Browse cities, inspect airports, and unlock new stops without changing a route.</span></li><li><strong>Controls</strong><span>Drag to rotate; use the wheel or pinch to zoom. Arrow keys rotate, +/− zoom, and Home locates the current aircraft.</span></li><li><strong>Visibility</strong><span>Back-side airports are hidden on the globe; the city picker remains available for every airport.</span></li></ul></section>
      <section className="help-card"><header><Icon name="plane"/><h3>Operations</h3></header><ul><li><strong>Fleet Management</strong><span>View flights, switch aircraft, refit, recharge energy, and manage turnaround.</span></li><li><strong>Company Organization</strong><span>Recruit staff, assign posts and managers, train employees, and review records.</span></li><li><strong>Company Operations</strong><span>Claim goals and daily rewards, then manage logistics, services, facilities, research, trade, and the museum.</span></li></ul></section>
      <section className="help-card help-resources"><header><Icon name="ticket"/><h3>Resources & Settlement</h3></header><dl><div><dt>Operating funds</dt><dd>Earned from delivered orders and operations; spent on flights, aircraft, airports, and services.</dd></div><div><dt>Tickets</dt><dd>A scarce resource earned from paid flights, goals, daily progress, and museum donations; used by staffing and advanced operations.</dd></div><div><dt>Time</dt><dd>Arrivals settle as time events, never from animation callbacks. Offline progress is capped at 8 hours.</dd></div></dl></section>
    </div>
    <aside className="help-rule-strip"><strong>Remember:</strong><span>Route previews are read-only. Every order pays once at its final destination. Aircraft and economic values are game configurations; the globe is not navigation or administrative-boundary data.</span></aside>
  </div>;
  return <div className="help-content">
    <section className="help-hero" aria-labelledby="help-intro-zh"><div><h3 id="help-intro-zh">首航三步</h3><p>先装载真实订单，再核对路线，最后起飞。容量、航程、资金、能量和机场等级始终由经营核心校验。</p></div><button className="start-guide-help" disabled={busy} onClick={onStart}>开始分步引导</button></section>
    <div className="help-grid">
      <section className="help-card help-steps"><header><Icon name="airport"/><h3>快速开始</h3></header><ol><li><b>1</b><span><strong>在机场装载</strong><small>逐个选择旅客或货物；容量不足时跳过整单，不会拆分订单。</small></span></li><li><b>2</b><span><strong>按顺序规划</strong><small>进入「制定路线」，起飞前核对各航段用时、成本、收益与能量。</small></span></li><li><b>3</b><span><strong>抵达与中转</strong><small>到达最终目的地才结算；其他订单留在机上，也可卸下等待后续航班。</small></span></li></ol></section>
      <section className="help-card"><header><Icon name="map"/><h3>球面地图</h3></header><ul><li><strong>地图</strong><span>只用于浏览城市、查看机场和解锁航点，不会改动当前路线。</span></li><li><strong>操作</strong><span>拖动旋转，滚轮或双指缩放；方向键旋转，＋/－缩放，Home 定位当前飞机。</span></li><li><strong>可见范围</strong><span>球体背面的机场会隐藏；需要时仍可通过城市选择器访问全部机场。</span></li></ul></section>
      <section className="help-card"><header><Icon name="plane"/><h3>经营入口</h3></header><ul><li><strong>机队管理</strong><span>查看航班、切换飞机、改装、补充能量并管理周转。</span></li><li><strong>公司组织</strong><span>招聘员工、安排岗位与上级、培训并查看人员履历。</span></li><li><strong>公司经营中心</strong><span>领取目标与每日奖励，管理物流、服务、设施、研究、贸易和博物馆。</span></li></ul></section>
      <section className="help-card help-resources"><header><Icon name="ticket"/><h3>资源与结算</h3></header><dl><div><dt>运营资金</dt><dd>由订单交付和经营活动获得，用于航班、飞机、机场与服务。</dd></div><div><dt>点券</dt><dd>由有偿运输、目标、每日进度和博物馆捐赠等获得，用于人员与进阶经营。</dd></div><div><dt>时间</dt><dd>抵达按时间事件结算，不依赖动画回调；离线最多补算 8 小时。</dd></div></dl></section>
    </div>
    <aside className="help-rule-strip"><strong>请记住</strong><span>路线预览只读；每份订单只在最终目的地结算一次。机型和经营参数均为游戏化配置；球面地图不是导航或行政边界资料。</span></aside>
  </div>;
}
