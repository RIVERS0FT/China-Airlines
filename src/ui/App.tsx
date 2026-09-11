import { useEffect, useRef, useState, type ReactNode } from 'react';
import { airport, aircraftSpecs } from '../core/catalog.js';
import { loadSummary, type Command } from '../core/game.js';
import { controller, useGame } from '../runtime.js';
import { Network } from './Network.js';
import { energyText } from './EnergyService.js';
import { FlightBoard } from './FlightBoard.js';
import { flightStatus } from './flight-status.js';
import { AirportDirectory } from './AirportDirectory.js';
import { AirportDetails } from './AirportDetails.js';
import { airportScene } from './airport-presentation.js';
import { OrderBoard } from './OrderBoard.js';
import { Tutorial } from './Tutorial.js';
import './management.css';
import { Hangar } from './Hangar.js';
import './workshop.css';
import { AviationScene } from './AviationScene.js';
import { Icon, Settings, Shop, Tasks, money, duration, ignore } from './Panels.js';

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
  const [destination, setDestination] = useState('PVG'), [aboard, setAboard] = useState(false);
  const [modal, setModal] = useState<'shop' | 'fleet' | 'tasks' | 'settings' | 'help' | 'airports' | 'airport-detail' | 'flights' | null>(null);
  const [browsedAirport, setBrowsedAirport] = useState<string | null>(null);
  const [detailAirport, setDetailAirport] = useState('PEK');
  const context = game ? airportScene(game, planeId, browsedAirport) : null;
  const plane = context?.plane, current = context?.airportId ?? 'PEK';
  const to = game?.airports.some(a => a.id === destination && a.id !== current) ? destination : game?.airports.find(a => a.id !== current)?.id ?? 'PVG';
  useEffect(() => { if (!view.notice) return; const timer = setTimeout(() => useGame.setState({ notice: null }), 4000); return () => clearTimeout(timer); }, [view.notice]);
  function selectPlane(id: string) { setPlaneId(id); setBrowsedAirport(null); setScreen('airport'); setAboard(false); setModal(null); }
  function cycle(dir: number) {
    if (!context || !plane || !context.choices.length) return;
    const i = context.choices.findIndex(p => p.id === plane.id);
    setPlaneId(context.choices[(i + dir + context.choices.length) % context.choices.length]!.id);
    setAboard(false);
  }
  function inspectAirport(id: string) { setDetailAirport(id); setModal('airport-detail'); }
  function visitAirport(id: string) {
    if (!game?.airports.some(a => a.id === id)) return;
    setBrowsedAirport(id); setScreen('airport'); setAboard(false); setModal(null);
  }
  function showMap(target?: string) {
    // Use an actual aircraft, never treat an empty airport as its departure point.
    if (!context) return;
    const selected = plane ?? context.selected;
    setPlaneId(selected.id);
    setDestination(target ?? selected.flight?.to ?? (!plane && context.pinned ? context.pinned : to));
    setBrowsedAirport(null); setScreen('map'); setModal(null);
  }
  const total = game && plane ? loadSummary(game, plane.id) : { passengers: 0, cargo: 0 }, m = plane ? aircraftSpecs(plane) : null;
  const status = game && plane ? flightStatus(game, plane) : null;
  const f = plane?.flight, cooling = plane && game && plane.readyAt > game.simTime;
  return <>
    <div className={`aviation-game ${game?.tutorial === 'active' && plane && !modal ? 'training-active' : ''}`}><header className="game-hud"><div className="game-brand"><span className="pilot-badge"><Icon name="plane"/></span><div><h1>中华航空</h1><small>航空运输经营 · v0.5</small></div></div><div className="resource"><i>币</i><span><small>运营资金</small><strong data-testid="credits">{money(game?.credits ?? 0)}</strong></span></div><button className="resource fleet-status-button" aria-label="航班运行表" disabled={!game} onClick={() => setModal('flights')}><Icon name="fleet"/><span><small>机队运行表</small><strong data-testid="fleet-count">{game?.fleet.length ?? 0} 架</strong></span></button><div className="resource"><Icon name="check"/><span><small>完成航班</small><strong data-testid="flights-count">{game?.stats.flights ?? 0} 班</strong></span></div><button aria-label="操作帮助" onClick={() => setModal('help')}>?</button><button aria-label="存档设置" onClick={() => setModal('settings')}><Icon name="save"/><span>{view.busy ? '保存中' : view.error ? '需注意' : '已存档'}</span></button></header>
      {game && plane && game.tutorial === 'active' && !modal && <Tutorial game={game} plane={plane} screen={screen} destination={to} busy={view.busy} onLocate={target => { if (target === 'tasks') setModal('tasks'); else { setScreen(target); if (target === 'airport') setAboard(false); } }}/>} 
      {!game ? <main className="startup"><h2>{view.booting ? '正在准备机场…' : '进度尚未载入'}</h2><p>{view.error}</p><button onClick={() => setModal('settings')}>导入或恢复存档</button></main> : <main className="game-workspace">
        {screen === 'map' ? <Network key={plane?.id} onInspect={inspectAirport} game={game} plane={plane} destination={destination} setDestination={setDestination} onReturn={() => setScreen('airport')} onDepart={() => { setScreen('airport'); setAboard(true); }} busy={view.busy}/> : <>
          <div className="airport-titlebar"><button className="airport-info-trigger" aria-label="当前机场详情" onClick={() => inspectAirport(current)} title="查看本机场客货、停靠和到离港航班">详情</button><div className="gate-sign"><b>{f ? '飞行' : '01'}</b><div><strong>{f ? `${airport(f.from).city} → ${airport(f.to).city}` : `${airport(current).city}航空港`}</strong><small>{current} · {game.airports.find(a => a.id === current)?.level} 级机场</small></div></div><div className="plane-status"><strong>{plane ? `${m?.name} · ${plane.id}` : '机场浏览 · 暂无停靠飞机'}</strong><span>{!plane ? '可查看客货，不可装载异地飞机' : status && status.remaining !== null ? `${status.label} · ${duration(status.remaining)} 后${status.nextEvent}` : '停靠中 · 等待装载'}</span></div><div className="capacity"><span data-testid="passenger-capacity">旅客 {total.passengers} / {m?.seats ?? 0} 人</span><span>货物 {total.cargo} / {m?.cargo ?? 0} 吨</span>{plane && <span className="plane-energy" data-testid="plane-energy">能量 {energyText(plane.energy.availableSeconds)} 点</span>}</div>
            {plane && plane.itinerary.length > 0 && <button className="plan-cancel" disabled={view.busy} onClick={() => ignore(act({ type: 'cancel-plan', planeId: plane.id }))}>取消剩余计划</button>}
            {plane?.autoRouteId && <button disabled={view.busy} onClick={() => ignore(act({ type: 'stop', planeId: plane.id }))}>停止自动往返</button>}
          </div>
          <div className="scene-wrap">{context?.pinned && <button className="return-selected-plane" onClick={() => selectPlane(context.selected.id)}>返回所选飞机 {context.selected.id}</button>}{plane && plane.itinerary.length > 0 && <div className="itinerary-banner" data-testid="active-plan">后续航段：{plane.itinerary.map(id => airport(id).city).join(" → ")}</div>}<AviationScene game={game} plane={plane} airportId={current} onCabin={() => setAboard(true)}/><button className="switch-plane previous" aria-label="上一架飞机" disabled={!context || context.choices.length < 2} onClick={() => cycle(-1)}>◀</button><button className="switch-plane next" aria-label="下一架飞机" disabled={!context || context.choices.length < 2} onClick={() => cycle(1)}>▶</button>
            {f && <div className="air-progress"><span>{airport(f.from).city}</span><progress max={1} value={Math.max(0, (game.simTime - f.departAt) / (f.arriveAt - f.departAt))}/><span>{airport(f.to).city}</span></div>}
          </div>
          <OrderBoard game={game} plane={plane} airportId={current} aboard={Boolean(plane) && (aboard || Boolean(f))} setAboard={setAboard} destination={to} setDestination={setDestination} busy={view.busy}/>
        </>}
      </main>}
      <nav className="game-dock" aria-label="主导航"><button className={screen === 'airport' ? 'active' : ''} onClick={() => setScreen('airport')}><Icon name="fleet"/><span>机场装载</span></button><button className={screen === 'map' ? 'active' : ''} onClick={() => showMap()}><Icon name="map"/><span>航线地图</span></button><button disabled={!game} onClick={() => setModal('airports')}><Icon name="map"/><span>机场目录</span></button><button onClick={() => setModal('fleet')}><Icon name="plane"/><span>机队管理</span></button><button onClick={() => setModal('shop')}><Icon name="shop"/><span>飞机商店</span></button><button data-guide="tasks" onClick={() => setModal('tasks')}><Icon name="task"/><span>运营任务</span></button>
        <div className="dock-status">{game?.tutorial === 'available' && <button className="start-guide" disabled={view.busy} onClick={() => { setBrowsedAirport(null); ignore(act({type:'tutorial',action:'start'})); }}>开始起航引导</button>}<strong>已解锁 {game?.airports.length ?? 0} 座机场</strong><small>{view.offlineReady ? '离线资源已就绪' : '正在准备离线资源'} · {view.online ? '本地单机' : '离线运行'}</small></div><button className="gold-button depart-button" disabled={!game || !plane || view.busy || Boolean(f) || Boolean(cooling) || plane?.energy.serviceUntil !== null} onClick={() => showMap()}><Icon name="plane"/><span>选择航线起飞</span></button></nav>
    </div>
    {modal === 'settings' && <Settings onClose={() => setModal(null)}/>}
    {game && modal && modal !== 'settings' && <Modal key={modal} title={{ shop: '飞机商店', fleet: '我的机库', tasks: '运营任务', help: '起航指南', airports: '机场目录', 'airport-detail': '机场详情', flights: '航班运行表' }[modal]} onClose={() => setModal(null)}>
      {modal === 'flights' ? <FlightBoard game={game} selectedId={plane?.id ?? context?.selected.id} onSelect={selectPlane}/> : modal === 'airports' ? <AirportDirectory game={game} onInspect={inspectAirport}/> : modal === 'airport-detail' ? <AirportDetails game={game} id={detailAirport} busy={view.busy} onBack={() => setModal('airports')} onVisit={visitAirport} onPlane={selectPlane} onRoute={id => showMap(id)}/> : modal === 'shop' ? <Shop game={game} busy={view.busy} selected={current}/> : modal === 'tasks' ? <Tasks game={game} busy={view.busy}/> : modal === 'fleet' ? <Hangar game={game} busy={view.busy} selectedPlaneId={plane?.id ?? context?.selected.id} onSelect={selectPlane}/> : <div className="help-content"><button className="start-guide-help" disabled={view.busy} onClick={() => { ignore(act({type:'tutorial',action:'start'}).then(() => { setModal(null); setBrowsedAirport(null); setScreen('airport'); })); }}>开始分步引导</button><h3>装载、规划、起飞，经营你的航空网络。</h3><p>① 点击下方旅客或货物卡片装载；同目的地装载只取当前机场的真实订单，容量不足时跳过整单。</p><p>② 点击「选择航线起飞」，在地图依次点击已解锁城市，点击顺序就是飞行路线；城市解锁后可直接前往，不需要另行开通航线。空机调机仍需支付运营成本。</p><p>③ 到达最终目的地才交付并付款；其他订单留在机上。周转结束后可卸至机场，再让另一架飞机装载中转。</p><p>④ 自动往返需随航调度员，仅支持一个目的城市并运送直达订单；客源不足时等待补充，不会凭空产生旅客。已接受的订单不会过期。</p><p>点击「机场目录」查看各地客货、停靠及飞来航班，再进入候机大厅；没有停靠飞机时只能浏览，可安排飞机飞来或到商店购机交付。</p><p>使用左右箭头或机库切换飞机。每10秒和关键操作后保存；旧版存档自动迁移，仍建议定期导出。</p><small>机库支持扩建与四类改装；商店分纯客、纯货和客货机。路线最多5段，逐站交付，不在途中自动接新订单；可撤销末段或清空后重选。机库可雇用调度员或出售卸空的飞机，至少保留一架。完整原版数值与美术仍需对照。</small></div>}
    </Modal>}
    {view.notice && !modal && <div className="toast" role="status"><Icon name="check"/><span>{view.notice}</span><button aria-label="关闭提示" onClick={() => useGame.setState({ notice: null })}>×</button></div>}
    {view.error && game && !modal && !view.blocked && <div className="error-toast" role="alert"><span>{view.error}</span><button onClick={() => useGame.setState({ error: null })}>关闭</button></div>}
    {view.report && !modal && <div className="return-report" role="status"><h3>{view.report.clockBack ? '设备时间回拨' : '离线运输报告'}</h3><p>推进 {duration(view.report.elapsed)} · 完成 {view.report.flights} 班 · 净收入 {money(view.report.profit)}</p>{view.report.capped && <p>最多补算8小时，超出部分已丢弃。</p>}<button className="primary" onClick={() => useGame.setState({ report: null })}>继续经营</button></div>}
    {view.updateAvailable && !modal && <button className="update-notice" onClick={() => setModal('settings')}>新版本就绪 · 保存后更新</button>}
    {view.blocked && <div className="blocking-screen" role="alert"><h2>此存档正在另一个窗口中使用</h2><p>此窗口已停止写入，以免覆盖更新的进度。</p><button className="primary" onClick={() => location.reload()}>重新载入最新进度</button></div>}
    <div className="rotate-screen"><Icon name="rotate"/><h2>请旋转设备，横屏起航。</h2><p>中华航空 · 机场装载与航空运输</p></div>
  </>;
}
