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
import { Icon, Settings, Shop, money, duration, ignore } from './Panels.js';

const act = (command: Command) => controller.command(command);
function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current!; d.showModal(); return () => { if (d.open) d.close(); }; }, []);
  return <dialog ref={ref} className="game-modal" aria-label={title} onClose={onClose}>
    <header><h2>{title}</h2><button onClick={() => ref.current?.close()} aria-label={`关闭${title}`}>×</button></header>{children}
  </dialog>;
}
export function App() {
  const view = useGame(), game = view.game;
  const [screen, setScreen] = useState<'airport' | 'map'>('airport'), [planeId, setPlaneId] = useState('AC0001');
  const [mapMode, setMapMode] = useState<'browse' | 'dispatch'>('browse');
  const [destination, setDestination] = useState('PVG'), [aboard, setAboard] = useState(false);
  const [orderViewKey, setOrderViewKey] = useState(0);
  const [modal, setModal] = useState<'career' | 'shop' | 'fleet' | 'tasks' | 'settings' | 'help' | 'airports' | 'airport-detail' | null>(null);
  const [fleetTab, setFleetTab] = useState<FleetTab>('planes');
  function openFleet(tab: FleetTab = 'planes') { setFleetTab(tab); setModal('fleet'); }
  const [browsedAirport, setBrowsedAirport] = useState<string | null>(null);
  const [detailAirport, setDetailAirport] = useState('PEK');
  const [detailBack, setDetailBack] = useState<'directory' | 'map' | 'close'>('directory');
  const mapReturn = useRef<{ planeId: string; browsedAirport: string | null; aboard: boolean } | null>(null);
  const routeUnlockResume = useRef<(() => void) | null>(null);
  const context = game ? airportScene(game, planeId, browsedAirport) : null;
  const plane = context?.plane, current = context?.airportId ?? 'PEK';
  const to = game?.airports.some(a => a.id === destination && a.id !== current) ? destination : game?.airports.find(a => a.id !== current)?.id ?? 'PVG';
  useEffect(() => { if (!view.notice) return; const timer = setTimeout(() => useGame.setState({ notice: null }), 4000); return () => clearTimeout(timer); }, [view.notice]);
  function selectPlane(id: string) { setPlaneId(id); setBrowsedAirport(null); setScreen('airport'); setAboard(false); setModal(null); }
  function showOrders(onboard: boolean) { setAboard(onboard); setOrderViewKey(key => key + 1); }
  function openAirportLoading() { setScreen('airport'); showOrders(false); }
  function cycle(dir: number) {
    if (!context || !plane || !context.choices.length) return;
    const i = context.choices.findIndex(p => p.id === plane.id);
    setPlaneId(context.choices[(i + dir + context.choices.length) % context.choices.length]!.id);
    setAboard(false);
  }
  function inspectAirport(id: string, afterUnlock?: () => void, back: 'directory' | 'map' | 'close' = 'close') {
    routeUnlockResume.current = afterUnlock ?? null; setDetailBack(back); setDetailAirport(id); setModal('airport-detail');
  }
  function closeModal() { routeUnlockResume.current = null; setModal(null); }
  function visitAirport(id: string) {
    if (!game?.airports.some(a => a.id === id)) return;
    setBrowsedAirport(id); setScreen('airport'); setAboard(false); setModal(null);
  }
  function showMap(target?: string, mode: 'browse' | 'dispatch' = 'dispatch') {
    // Use an actual aircraft, never treat an empty airport as its departure point.
    if (!context) return;
    if (screen !== 'map') mapReturn.current = { planeId, browsedAirport, aboard };
    const selected = plane ?? context.selected;
    setMapMode(mode);
    setPlaneId(selected.id);
    setDestination(mode === 'browse' ? current : target ?? selected.flight?.to ?? (!plane && context.pinned ? context.pinned : to));
    setBrowsedAirport(null); setScreen('map'); setModal(null);
  }
  function returnFromMap() {
    const previous = mapReturn.current; mapReturn.current = null; routeUnlockResume.current = null;
    if (previous) { setPlaneId(previous.planeId); setBrowsedAirport(previous.browsedAirport); setAboard(previous.aboard); }
    setScreen('airport'); setModal(null);
  }
  const total = game && plane ? loadSummary(game, plane.id) : { passengers: 0, cargo: 0 }, m = plane ? aircraftSpecs(plane) : null;
  const status = game && plane ? flightStatus(game, plane) : null;
  const f = plane?.flight, cooling = plane && game && plane.readyAt > game.simTime;
  const departureReason = !plane ? '本机场无停靠飞机' : view.busy ? '正在保存，请稍候' : f ? '飞行中 · 可查看航班' : plane.energy.serviceUntil !== null ? '地勤补能中' : cooling ? '周转完成后可起飞' : '';
  return <>
    <div className={`aviation-game ${screen === 'map' ? 'dispatch-focused' : ''} ${screen !== 'map' && game?.tutorial === 'active' && plane && !modal ? 'training-active' : ''}`}><header className="game-hud" hidden={screen === 'map'}><div className="game-brand"><span className="pilot-badge"><Icon name="pilot"/></span><div><h1>中华航空</h1><small>公司 Lv.{game ? careerLevel(game) : 1} · 单机经营</small></div></div><div className="resource"><Icon name="coin"/><span><small>运营资金</small><strong data-testid="credits">{money(game?.credits ?? 0)}</strong></span></div><button className="resource fleet-status-button" aria-label="机队管理概览" disabled={!game} onClick={() => openFleet('flights')}><Icon name="fleet"/><span><small>机队概况</small><strong data-testid="fleet-count">{game?.fleet.length ?? 0} 架</strong></span></button><div className="resource" data-testid="tickets-resource"><Icon name="trophy"/><span><small>点券</small><strong data-testid="tickets-count">{game?.career.tickets ?? 0} 券</strong><span className="sr-only" data-testid="flights-count">{game?.stats.flights ?? 0} 班</span></span></div><button aria-label="操作帮助" onClick={() => setModal('help')}><Icon name="help"/></button><button aria-label="存档设置" onClick={() => setModal('settings')}><Icon name="save"/><span>{view.busy ? '保存中' : view.error ? '需注意' : '已存档'}</span></button></header>
      {screen !== 'map' && game && plane && game.tutorial === 'active' && !modal && <Tutorial game={game} plane={plane} screen={screen} destination={to} busy={view.busy} onLocate={target => { if (target === 'tasks') setModal('tasks'); else if (target === 'map') showMap(); else { setScreen('airport'); setAboard(false); } }}/>} 
      {!game ? <main className="startup"><h2>{view.booting ? '正在准备机场…' : '进度尚未载入'}</h2><p>{view.error}</p><button onClick={() => setModal('settings')}>导入或恢复存档</button></main> : <main className="game-workspace">
        {screen === 'map' ? <Network key={`${plane?.id}-${mapMode}`} mode={mapMode} onInspect={(id, afterUnlock) => inspectAirport(id, afterUnlock, 'map')} game={game} plane={plane} destination={destination} setDestination={setDestination} onReturn={returnFromMap} onDepart={() => { mapReturn.current = null; setScreen('airport'); setAboard(true); }} busy={view.busy}/> : <>
          <div className="airport-titlebar"><button className="airport-info-trigger" aria-label="当前机场详情" onClick={() => inspectAirport(current, undefined, 'close')} title="查看本机场客货、停靠和到离港航班">详情</button><div className="gate-sign"><b>{f ? '飞行' : '01'}</b><div><strong>{f ? `${airport(f.from).city} → ${airport(f.to).city}` : `${airport(current).city}航空港`}</strong><small>{current} · {game.airports.find(a => a.id === current)?.level} 级机场</small></div></div><div className="plane-status"><strong>{plane ? `${m?.name} · ${plane.id}` : '机场浏览 · 暂无停靠飞机'}</strong><span>{!plane ? '可查看客货，不可装载异地飞机' : status && status.remaining !== null ? `${status.label} · ${duration(status.remaining)} 后${status.nextEvent}` : '停靠中 · 等待装载'}</span></div><div className="capacity"><span data-testid="passenger-capacity">旅客 {total.passengers} / {m?.seats ?? 0} 人</span><span>货物 {total.cargo} / {m?.cargo ?? 0} 吨</span>{plane && <span className="plane-energy" data-testid="plane-energy">能量 {energyText(plane.energy.availableSeconds)} 点</span>}</div>
            {plane && plane.itinerary.length > 0 && <button className="plan-cancel" disabled={view.busy} onClick={() => ignore(act({ type: 'cancel-plan', planeId: plane.id }))}>取消剩余计划</button>}
            {plane?.autoRouteId && <button disabled={view.busy} onClick={() => ignore(act({ type: 'stop', planeId: plane.id }))}>停止自动往返</button>}
          </div>
          <div className="scene-wrap">{context?.pinned && <button className="return-selected-plane" onClick={() => selectPlane(context.selected.id)}>返回所选飞机 {context.selected.id}</button>}{plane && plane.itinerary.length > 0 && <div className="itinerary-banner" data-testid="active-plan">后续航段：{plane.itinerary.map(id => airport(id).city).join(" → ")}</div>}<AviationScene game={game} plane={plane} onCabin={() => f ? openFleet('flights') : showOrders(true)}/><AirportSceneTools game={game} plane={plane} onTasks={() => setModal('tasks')}/><button className="switch-plane previous" aria-label="上一架飞机" disabled={!context || context.choices.length < 2} onClick={() => cycle(-1)}>◀</button><button className="switch-plane next" aria-label="下一架飞机" disabled={!context || context.choices.length < 2} onClick={() => cycle(1)}>▶</button>
            {f && <div className="air-progress"><span>{airport(f.from).city}</span><progress max={1} value={Math.max(0, (game.simTime - f.departAt) / (f.arriveAt - f.departAt))}/><span>{airport(f.to).city}</span></div>}
            {status?.flight && <div className="scene-flight-summary"><FlightMoney flight={status.flight}/></div>}
          </div>
          {!f && <OrderBoard game={game} plane={plane} airportId={current} aboard={Boolean(plane) && (aboard || Boolean(f))} viewKey={orderViewKey} busy={view.busy}/>}
        </>}
      </main>}
      <nav className="game-dock" hidden={screen === 'map'} aria-label="主导航"><button className={screen === 'airport' ? 'active' : ''} onClick={openAirportLoading}><Icon name="airport"/><span>机场装载</span></button><button className={screen === 'map' ? 'active' : ''} onClick={() => showMap(undefined, 'browse')}><Icon name="map"/><span>地图</span></button><button disabled={!game} onClick={() => setModal('airports')}><Icon name="directory"/><span>机场目录</span></button><button onClick={() => openFleet()}><Icon name="plane"/><span>机队管理</span></button><button onClick={() => setModal('shop')}><Icon name="shop"/><span>飞机商店</span></button><button type="button" disabled={!game} aria-haspopup="dialog" onClick={() => setModal('career')}><Icon name="trophy"/><span>经营中心</span></button>
        <button className="gold-button depart-button" aria-label="制定路线" aria-describedby="airport-departure-reason" title={departureReason || '选择目的地并预览航程'} disabled={!game || !plane || view.busy || Boolean(f) || Boolean(cooling) || plane?.energy.serviceUntil !== null} onClick={() => showMap()}><Icon name="plane"/><span>制定路线</span><small id="airport-departure-reason" className="airport-departure-reason">{departureReason}</small></button></nav>
    </div>
    {modal === 'settings' && <Settings onClose={() => setModal(null)}/>}
    {game && modal && modal !== 'settings' && <Modal key={modal} title={{ career: '公司经营中心', shop: '飞机商店', fleet: '机队管理', tasks: '任务中心', help: '起航指南', airports: '机场目录', 'airport-detail': '机场详情' }[modal]} onClose={closeModal}>
      {modal === 'career' ? <CareerHub game={game} busy={view.busy} selected={plane?.id ?? context?.selected.id} airportId={current} onPlane={selectPlane} onAirport={visitAirport}/> : modal === 'airports' ? <AirportDirectory game={game} onInspect={id => inspectAirport(id, undefined, 'directory')}/> : modal === 'airport-detail' ? <AirportDetails game={game} id={detailAirport} busy={view.busy} backLabel={detailBack === 'directory' ? '返回机场目录' : detailBack === 'map' ? mapMode === 'browse' ? '返回地图' : '返回制定路线' : '返回机场装载'} onBack={() => { routeUnlockResume.current = null; if (detailBack === 'directory') setModal('airports'); else setModal(null); }} onUnlocked={() => { const resume = routeUnlockResume.current; routeUnlockResume.current = null; if (resume) { setModal(null); resume(); } }} onVisit={visitAirport} onPlane={selectPlane} onRoute={id => showMap(id)}/> : modal === 'shop' ? <Shop game={game} busy={view.busy} selected={current}/> : modal === 'tasks' ? <TaskCenter game={game} plane={plane ?? context?.selected} busy={view.busy} onNext={step => { if (step === 'map') showMap(); else if (step === 'flight') openFleet('flights'); else { if (context) selectPlane((plane ?? context.selected).id); showOrders(false); } }}/> : modal === 'fleet' ? <FleetManagement game={game} busy={view.busy} selectedPlaneId={plane?.id ?? context?.selected.id} initialTab={fleetTab} onSelect={selectPlane}/> : <div className="help-content"><button className="start-guide-help" disabled={view.busy} onClick={() => { ignore(act({type:'tutorial',action:'start'}).then(() => { setModal(null); setBrowsedAirport(null); setScreen('airport'); })); }}>开始分步引导</button><h3>装载、规划、起飞，经营你的航空网络。</h3><p>① 点击下方旅客或货物装载；点击目的地站牌可装载同站客货，只取当前机场的真实订单，容量不足时跳过整单。</p><p>「地图」用于查看全球城市和解锁机场，点击城市打开详情；解锁后继续浏览地图。</p><p>② 点击「制定路线」，在地图依次点击已解锁城市，点击顺序就是飞行路线；点顶部目的地可打开城市列表，“查看路线”包含自动往返、收支与能量明细，“取消起飞”返回进入前场景；城市解锁后可直接前往，不需要另行开通航线；解锁和升级只在按需打开的机场详情里操作，不常驻地图。空机调机仍需支付运营成本。</p><p>③ 到达最终目的地才交付并付款；其他订单留在机上。周转结束后可卸至机场，再让另一架飞机装载中转。</p><p>④ 自动往返需随航调度员，仅支持一个目的城市并运送直达订单；客源不足时等待补充，不会凭空产生旅客。已接受的订单不会过期。</p><p>点击「机场目录」查看各地客货、停靠及飞来航班，再进入候机大厅；没有停靠飞机时只能浏览，可安排飞机飞来或到商店购机交付。</p><p>任务与奖励统一从左上角「任务」进入；航班、改装与补能在「机队管理」中查看。经营与设施从底部「经营中心」进入，顶部点券仅显示当前余额。使用左右箭头或机队管理切换飞机。每10秒和关键操作后保存；旧版存档自动迁移，仍建议定期导出。</p><small>机库支持扩建与四类改装；商店分纯客、纯货和客货机。路线最多12段，逐站交付，不在途中自动接新订单；可撤销末段或清空后重选。机库可雇用调度员或出售卸空的飞机，至少保留一架。完整原版数值与美术仍需对照。</small></div>}
    </Modal>}
    {view.notice && !modal && screen !== 'map' && <div className="toast" role="status"><Icon name="check"/><span>{view.notice}</span><button aria-label="关闭提示" onClick={() => useGame.setState({ notice: null })}>×</button></div>}
    {view.error && game && !modal && !view.blocked && <div className="error-toast" role="alert"><span>{view.error}</span>{screen === 'map' && <button onClick={() => setModal('settings')}>存档设置</button>}<button onClick={() => useGame.setState({ error: null })}>关闭</button></div>}
    {view.report && !modal && screen !== 'map' && <div className="return-report" role="status"><h3>{view.report.clockBack ? '设备时间回拨' : '离线运输报告'}</h3><p>推进 {duration(view.report.elapsed)} · 完成 {view.report.flights} 班 · 净收入 {money(view.report.profit)}</p>{view.report.capped && <p>最多补算8小时，超出部分已丢弃。</p>}<button className="primary" onClick={() => useGame.setState({ report: null })}>继续经营</button></div>}
    {view.updateAvailable && !modal && screen !== 'map' && <button className="update-notice" onClick={() => setModal('settings')}>新版本就绪 · 保存后更新</button>}
    {view.blocked && <div className="blocking-screen" role="alert"><h2>此存档正在另一个窗口中使用</h2><p>此窗口已停止写入，以免覆盖更新的进度。</p><button className="primary" onClick={() => location.reload()}>重新载入最新进度</button></div>}
    <div className="rotate-screen"><Icon name="rotate"/><h2>请旋转设备，横屏起航。</h2><p>中华航空 · 机场装载与航空运输</p></div>
  </>;
}