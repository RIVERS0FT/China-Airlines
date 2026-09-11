import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AIRPORTS, airport, aircraftSpecs, routeId, routePrice, upgradePrice } from '../core/catalog.js';
import { manifest, waiting, loadSummary, quote, type Order, type GameState, type Plane, type Command } from '../core/game.js';
import { controller, useGame } from '../runtime.js';
import { MapView } from './MapView.js';
import { Hangar } from './Hangar.js';
import { PlanControls } from './PlanControls.js';
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
function PassengerArt({ cargo = false }: { cargo?: boolean }) {
  return <svg viewBox="0 0 90 60" aria-hidden="true" className="job-art">{cargo ? <g stroke="#785b3e" strokeWidth="2"><path d="m17 23 25-9 30 9v29H17Z" fill="#dba760"/><path d="M17 23h55M42 14v38"/><path d="M35 23h13v15H35Z" fill="#f8dea3"/></g> : <g stroke="#465e74" strokeWidth="1.6">
    {[22, 47, 70].map((x, i) => <g key={x} transform={`translate(${x},${i === 1 ? 0 : 5})`}><path d="m-7 36-2 17m15-17 2 17" strokeWidth="5"/><path d="M-10 19h20l3 20h-26Z" fill={['#e6a754','#49a6b4','#df7d6d'][i]}/><circle cy="12" r="9" fill="#f6cfac"/><path d="M-9 11q-3-17 13-12 8 2 5 13l-5-8-11 7Z" fill="#6e594c"/></g>)}</g>}</svg>;
}
function OrderCard({ order, aboard, disabled, reason, onClick }: { order: Order; aboard: boolean; disabled: boolean; reason?: string; onClick: () => void }) {
  return <button className={`job-card ${aboard ? 'aboard' : ''}`} disabled={disabled} onClick={onClick}
    data-testid={aboard ? 'loaded-order' : 'waiting-order'} aria-label={`${aboard ? '卸下' : '装载'} ${order.id} 前往${airport(order.to).city} ${order.amount}${order.kind === 'cargo' ? '吨货物' : '位旅客'}`}>
    <span className="job-destination">{airport(order.to).city}<small>{order.to}</small></span><PassengerArt cargo={order.kind === 'cargo'}/>
    <span className="job-quantity">{order.kind === 'cargo' ? '货物' : '旅客'} × {order.amount}{order.kind === 'cargo' ? '吨' : '人'}</span>
    <strong>{money(order.reward)}</strong><small className="job-state">{reason ? reason : aboard ? '已装载 · 点击卸下' : order.expiresAt === null ? '中转保留 · 点击装载' : '点击装载'}</small>
  </button>;
}
function OrderBoard({ game, plane, airportId, aboard, setAboard, destination, setDestination, busy }: {
  game: GameState; plane?: Plane; airportId: string; aboard: boolean; setAboard: (b: boolean) => void;
  destination: string; setDestination: (s: string) => void; busy: boolean;
}) {
  const [filter, setFilter] = useState('all');
  const list = aboard ? plane ? manifest(game, plane.id) : [] : waiting(game, airportId);
  const capacity = plane ? aircraftSpecs(plane) : null, total = plane ? loadSummary(game, plane.id) : {passengers:0,cargo:0};
  function reason(o: Order) {
    if (aboard || !capacity) return undefined;
    if (o.kind === 'passengers' && capacity.seats === 0) return '纯货机不载客';
    if (o.kind === 'cargo' && capacity.cargo === 0) return '纯客机不载货';
    if (o.kind === 'passengers' ? total.passengers + o.amount > capacity.seats : total.cargo + o.amount > capacity.cargo) return '剩余容量不足';
    return undefined;
  }
  const shown = list.filter(o => filter === 'all' || o.kind === filter);
  const locked = busy || !plane || Boolean(plane.flight) || Boolean(plane.autoRouteId) || Boolean(plane.itinerary.length) || plane.readyAt > game.simTime;
  return <section className="order-board" aria-label="客货装载区">
    <div className="order-toolbar"><div className="order-tabs"><button className={!aboard ? 'active' : ''} onClick={() => setAboard(false)}>候机大厅 <b>{waiting(game, airportId).length}</b></button><button className={aboard ? 'active' : ''} onClick={() => setAboard(true)}>机上客货 <b data-testid="onboard-count">{plane ? manifest(game, plane.id).length : 0}</b></button></div>
      <select aria-label="客货分类" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">全部客货</option><option value="passengers">只看旅客</option><option value="cargo">只看货物</option></select>
      <span className="demand-clock">{duration(game.nextDemandAt - game.simTime)} 后补充客源</span>
      <div className="quick-load"><select value={destination} aria-label="装载目的地" onChange={e => setDestination(e.target.value)}>{game.airports.filter(a => a.id !== airportId).map(a => <option key={a.id} value={a.id}>{airport(a.id).city}</option>)}</select><button disabled={locked} onClick={() => plane && ignore(act({ type: 'load-destination', planeId: plane.id, to: destination }))}>同目的地装载</button></div>
    </div>
    <div className="order-strip">{shown.map(o => <OrderCard key={o.id} order={o} aboard={aboard} reason={reason(o)} disabled={locked || Boolean(reason(o))} onClick={() => plane && ignore(act({ type: aboard ? 'unload' : 'load', planeId: plane.id, orderId: o.id }))}/>)}
      {!shown.length && <div className="empty-orders">{aboard ? '机舱还空着，去候机大厅选择旅客或货物。' : '暂时没有此类订单，已接受的中转订单不会过期。'}</div>}
    </div>
  </section>;
}
function Network({ game, plane, destination, setDestination, onReturn, onDepart, busy }: {
  game: GameState; plane?: Plane; destination: string; setDestination: (id: string) => void;
  onReturn: () => void; onDepart: () => void; busy: boolean;
}) {
  const [planMode, setPlanMode] = useState(false), [stops, setStops] = useState<string[]>([]);
  const [auto, setAuto] = useState(false); const a = airport(destination), own = game.airports.find(x => x.id === destination);
  const from = plane?.airportId ?? 'PEK';
  const opened = game.routes.some(r => r.id === routeId(from, destination));
  let q: ReturnType<typeof quote> | null = null, error = '';
  if (plane && own && from !== destination) { try { q = quote(game, plane, destination); } catch (e) { error = e instanceof Error ? e.message : '无法飞行'; } }
  const inFlight = Boolean(plane?.flight), cooling = plane && (game.simTime < plane.readyAt || plane.itinerary.length > 0);
  const incompatible = Boolean(auto && plane && (manifest(game, plane.id).length === 0 || manifest(game, plane.id).some(o => o.to !== destination)));
  async function dispatch() {
    if (!plane) return;
    if (q && q.passengers === 0 && q.cargo === 0 && !window.confirm('当前为空机调机，只有成本、没有运输收入。确定起飞？')) return;
    try { await act({ type: 'dispatch', planeId: plane.id, to: destination, auto }); onDepart(); } catch { /* Controller exposes error. */ }
  }
  return <section className="network-view"><div className="network-summary"><button onClick={onReturn}>← 返回机场装载</button><strong>{airport(from).city} → {a.city}</strong><span>用时 <b>{q ? duration(q.duration) : '—'}</b></span><span>成本 <b>{q ? money(q.cost) : '—'}</b></span><span>本段交付 <b>{q ? money(q.revenue) : '—'}</b></span><span>净收益 <b>{q ? money(q.profit) : '—'}</b></span></div>
    <div className="network-mode"><button aria-pressed={!planMode} onClick={() => setPlanMode(false)}>单段派航</button><button aria-pressed={planMode} onClick={() => { setPlanMode(true); setAuto(false); }}>多段计划</button></div>
    <div className="network-map"><MapView game={game} selected={destination} onSelect={setDestination}/></div>
    <div className="network-controls"><label>目的地<select aria-label="选择机场" value={destination} onChange={e => setDestination(e.target.value)}>{AIRPORTS.map(a => <option value={a.id} key={a.id}>{a.city} · {a.id}{game.airports.some(x => x.id === a.id) ? '' : ' · 未解锁'}</option>)}</select></label>
      <div className="destination-detail"><strong>{a.city}机场 · {own ? `${own.level} 级` : '未解锁'}</strong><small>{error || (inFlight ? '当前飞机正在飞行，可选其他飞机继续规划' : cooling ? '地面周转中' : from === destination ? '请选择其他机场' : incompatible ? '自动往返需装载且全部订单直达' : q?.revenue === 0 ? '本段无交付收入；未到最终目的地的订单留在机上' : '只在订单最终目的地付款，中转不重复结算')}</small></div>
      {!own ? <button className="gold-button" disabled={busy || game.credits < a.price} onClick={() => ignore(act({ type: 'unlock', airportId: destination }))}>解锁机场 {money(a.price)}</button> : <>
        {own.level < 3 && <button disabled={busy || game.credits < upgradePrice(own.level)} onClick={() => ignore(act({ type: 'upgrade', airportId: destination }))}>升级机场 {money(upgradePrice(own.level))}</button>}
        {!planMode && (from !== destination && !opened ? <button className="gold-button" disabled={busy || game.credits < routePrice(from, destination)} onClick={() => ignore(act({ type: 'route', from, to: destination }))}>开通航线 {money(routePrice(from, destination))}</button> : <><label className="auto-choice"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)}/>自动往返</label><button className="gold-button launch" data-testid="dispatch" disabled={busy || !q || !plane || inFlight || cooling || incompatible || game.credits < (q?.cost ?? 0)} onClick={() => ignore(dispatch())}>确认起飞</button></>)}
      </>}
    </div>
    {planMode && plane && <PlanControls game={game} plane={plane} stops={stops} setStops={setStops} candidate={destination} busy={busy} onDepart={onDepart}/>}
  </section>;
}
export function App() {
  const view = useGame(), game = view.game;
  const [screen, setScreen] = useState<'airport' | 'map'>('airport'), [planeId, setPlaneId] = useState('AC0001');
  const [destination, setDestination] = useState('PVG'), [aboard, setAboard] = useState(false);
  const [modal, setModal] = useState<'shop' | 'fleet' | 'tasks' | 'settings' | 'help' | null>(null);
  const plane = game?.fleet.find(p => p.id === planeId) ?? game?.fleet[0], current = plane?.airportId ?? 'PEK';
  const to = game?.airports.some(a => a.id === destination && a.id !== current) ? destination : game?.airports.find(a => a.id !== current)?.id ?? 'PVG';
  useEffect(() => { if (!view.notice) return; const timer = setTimeout(() => useGame.setState({ notice: null }), 4000); return () => clearTimeout(timer); }, [view.notice]);
  function selectPlane(id: string) { setPlaneId(id); setScreen('airport'); setAboard(false); setModal(null); }
  function cycle(dir: number) { if (!game || !plane) return; const i = game.fleet.findIndex(p => p.id === plane.id); selectPlane(game.fleet[(i + dir + game.fleet.length) % game.fleet.length]!.id); }
  const total = game && plane ? loadSummary(game, plane.id) : { passengers: 0, cargo: 0 }, m = plane ? aircraftSpecs(plane) : null;
  const f = plane?.flight, cooling = plane && game && plane.readyAt > game.simTime;
  return <>
    <div className="aviation-game"><header className="game-hud"><div className="game-brand"><span className="pilot-badge"><Icon name="plane"/></span><div><h1>中华航空</h1><small>航空运输经营 · v0.3</small></div></div><div className="resource"><i>币</i><span><small>运营资金</small><strong data-testid="credits">{money(game?.credits ?? 0)}</strong></span></div><div className="resource"><Icon name="fleet"/><span><small>我的机队</small><strong data-testid="fleet-count">{game?.fleet.length ?? 0} 架</strong></span></div><div className="resource"><Icon name="check"/><span><small>完成航班</small><strong data-testid="flights-count">{game?.stats.flights ?? 0} 班</strong></span></div><button aria-label="操作帮助" onClick={() => setModal('help')}>?</button><button aria-label="存档设置" onClick={() => setModal('settings')}><Icon name="save"/><span>{view.busy ? '保存中' : view.error ? '需注意' : '已存档'}</span></button></header>
      {!game ? <main className="startup"><h2>{view.booting ? '正在准备机场…' : '进度尚未载入'}</h2><p>{view.error}</p><button onClick={() => setModal('settings')}>导入或恢复存档</button></main> : <main className="game-workspace">
        {screen === 'map' ? <Network game={game} plane={plane} destination={destination} setDestination={setDestination} onReturn={() => setScreen('airport')} onDepart={() => { setScreen('airport'); setAboard(true); }} busy={view.busy}/> : <>
          <div className="airport-titlebar"><div className="gate-sign"><b>{f ? '飞行' : '01'}</b><div><strong>{f ? `${airport(f.from).city} → ${airport(f.to).city}` : `${airport(current).city}航空港`}</strong><small>{current} · {game.airports.find(a => a.id === current)?.level} 级机场</small></div></div><div className="plane-status"><strong>{m?.name} · {plane?.id}</strong><span>{f ? `预计 ${duration(f.arriveAt - game.simTime)} 后抵达` : cooling ? `${duration(plane!.readyAt - game.simTime)} 后可操作` : '停靠中 · 等待装载'}</span></div><div className="capacity"><span data-testid="passenger-capacity">旅客 {total.passengers} / {m?.seats ?? 0} 人</span><span>货物 {total.cargo} / {m?.cargo ?? 0} 吨</span></div>
            {plane && plane.itinerary.length > 0 && <button className="plan-cancel" disabled={view.busy} onClick={() => ignore(act({ type: 'cancel-plan', planeId: plane.id }))}>取消剩余计划</button>}
            {plane?.autoRouteId && <button disabled={view.busy} onClick={() => ignore(act({ type: 'stop', planeId: plane.id }))}>停止自动往返</button>}
          </div>
          <div className="scene-wrap">{plane && plane.itinerary.length > 0 && <div className="itinerary-banner" data-testid="active-plan">后续航段：{plane.itinerary.map(id => airport(id).city).join(" → ")}</div>}<AviationScene game={game} plane={plane} airportId={current} onCabin={() => setAboard(true)}/><button className="switch-plane previous" aria-label="上一架飞机" disabled={game.fleet.length < 2} onClick={() => cycle(-1)}>◀</button><button className="switch-plane next" aria-label="下一架飞机" disabled={game.fleet.length < 2} onClick={() => cycle(1)}>▶</button>
            {f && <div className="air-progress"><span>{airport(f.from).city}</span><progress max={1} value={Math.max(0, (game.simTime - f.departAt) / (f.arriveAt - f.departAt))}/><span>{airport(f.to).city}</span></div>}
          </div>
          <OrderBoard game={game} plane={plane} airportId={current} aboard={aboard || Boolean(f)} setAboard={setAboard} destination={to} setDestination={setDestination} busy={view.busy}/>
        </>}
      </main>}
      <nav className="game-dock" aria-label="主导航"><button className={screen === 'airport' ? 'active' : ''} onClick={() => setScreen('airport')}><Icon name="fleet"/><span>机场装载</span></button><button className={screen === 'map' ? 'active' : ''} onClick={() => { setDestination(to); setScreen('map'); }}><Icon name="map"/><span>航线地图</span></button><button onClick={() => setModal('fleet')}><Icon name="plane"/><span>机队管理</span></button><button onClick={() => setModal('shop')}><Icon name="shop"/><span>飞机商店</span></button><button onClick={() => setModal('tasks')}><Icon name="task"/><span>运营任务</span></button>
        <div className="dock-status"><strong>已解锁 {game?.airports.length ?? 0} 座机场</strong><small>{view.offlineReady ? '离线资源已就绪' : '正在准备离线资源'} · {view.online ? '本地单机' : '离线运行'}</small></div><button className="gold-button depart-button" disabled={!game || view.busy || Boolean(f) || Boolean(cooling)} onClick={() => { setDestination(to); setScreen('map'); }}><Icon name="plane"/><span>选择航线起飞</span></button></nav>
    </div>
    {modal === 'settings' && <Settings onClose={() => setModal(null)}/>}
    {game && modal && modal !== 'settings' && <Modal title={{ shop: '飞机商店', fleet: '我的机库', tasks: '运营任务', help: '起航指南' }[modal]} onClose={() => setModal(null)}>
      {modal === 'shop' ? <Shop game={game} busy={view.busy} selected={current}/> : modal === 'tasks' ? <Tasks game={game} busy={view.busy}/> : modal === 'fleet' ? <Hangar game={game} busy={view.busy} onSelect={selectPlane}/> : <div className="help-content"><h3>装载、规划、起飞，经营你的航空网络。</h3><p>① 点击下方旅客或货物卡片装载；同目的地装载只取当前机场的真实订单，容量不足时跳过整单。</p><p>② 点击「选择航线起飞」，在地图选择目的地，开通航线后确认起飞。空机调机仍需支付成本。</p><p>③ 到达最终目的地才交付并付款；其他订单留在机上。周转结束后可卸至机场，再让另一架飞机装载中转。</p><p>④ 自动往返仅运送直达订单；客源不足时等待补充，不会凭空产生旅客。已接受的订单不会过期。</p><p>使用左右箭头或机库切换飞机。每10秒和关键操作后保存；旧版存档自动迁移，仍建议定期导出。</p><small>机库支持扩建与四类改装；商店分纯客、纯货和客货机。多段计划最多5段，逐站交付，不在途中自动接新订单。完整原版数值与美术仍需对照。</small></div>}
    </Modal>}
    {view.notice && !modal && <div className="toast" role="status"><Icon name="check"/><span>{view.notice}</span><button aria-label="关闭提示" onClick={() => useGame.setState({ notice: null })}>×</button></div>}
    {view.error && game && !modal && !view.blocked && <div className="error-toast" role="alert"><span>{view.error}</span><button onClick={() => useGame.setState({ error: null })}>关闭</button></div>}
    {view.report && !modal && <div className="return-report" role="status"><h3>{view.report.clockBack ? '设备时间回拨' : '离线运输报告'}</h3><p>推进 {duration(view.report.elapsed)} · 完成 {view.report.flights} 班 · 净收入 {money(view.report.profit)}</p>{view.report.capped && <p>最多补算8小时，超出部分已丢弃。</p>}<button className="primary" onClick={() => useGame.setState({ report: null })}>继续经营</button></div>}
    {view.updateAvailable && !modal && <button className="update-notice" onClick={() => setModal('settings')}>新版本就绪 · 保存后更新</button>}
    {view.blocked && <div className="blocking-screen" role="alert"><h2>此存档正在另一个窗口中使用</h2><p>此窗口已停止写入，以免覆盖更新的进度。</p><button className="primary" onClick={() => location.reload()}>重新载入最新进度</button></div>}
    <div className="rotate-screen"><Icon name="rotate"/><h2>请旋转设备，横屏起航。</h2><p>中华航空 · 机场装载与航空运输</p></div>
  </>;
}
