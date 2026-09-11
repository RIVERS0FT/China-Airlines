import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { airport } from '../core/catalog.js';
import { manifest, waiting, type Order, type GameState, type Plane } from '../core/game.js';
import { controller } from '../runtime.js';
import { loadingLock, orderBlockReason } from './order-presentation.js';
import { money, duration, ignore } from './Panels.js';

/** Original passenger groups and cargo carts, not assets taken from the reference game. */
function PassengerArt({ order }: { order: Order }) {
  const variant = Number(order.id.slice(2)) % 3;
  return <svg viewBox="0 0 100 62" aria-hidden="true" className="job-art">
    <ellipse cx="50" cy="57" rx="39" ry="4" fill="#536869" opacity=".16"/>
    {order.kind === 'cargo' ? <g stroke="#775c3e" strokeWidth="2">
      <path d="M13 47h70l5-21h7M18 49l-3 7m65-7 3 7" fill="none"/>
      <path d="M20 23h28v24H20zm30-8h27v32H50Z" fill="#dca25d"/>
      <path d="M30 23h8v24h-8zm29-8h8v32h-8Z" fill="#f2dba5"/>
      <circle cx="27" cy="54" r="4" fill="#466477"/><circle cx="73" cy="54" r="4" fill="#466477"/>
    </g> : <g stroke="#43596c" strokeWidth="1.5">
      {[23, 50, 75].map((x, i) => <g key={x} transform={`translate(${x},${i === 1 ? 1 : 5})`}>
        <path d="m-5 35-2 17m10-17 2 17" strokeWidth="4"/>
        <path d="M-8 20H8l4 18h-24Z" fill={['#dfaa59','#5ca8a5','#cf8070'][(i + variant) % 3]}/>
        <circle cy="12" r="8" fill="#f2cca6"/>
        <path d="M-8 11q-3-15 10-11 8 1 6 12l-5-7-10 6Z" fill="#625247"/>
      </g>)}
      <rect x="81" y="39" width="12" height="15" rx="2" fill="#7691a4"/><path d="M84 38v-6h6v6" fill="none"/>
    </g>}
  </svg>;
}
function OrderCard({ order, aboard, reason, busy, onClick }: {
  order: Order; aboard: boolean; reason: string; busy: boolean; onClick: () => void;
}) {
  return <button className={`job-card ${aboard ? 'aboard' : ''}`} disabled={busy || Boolean(reason)} onClick={onClick}
    data-testid={aboard ? 'loaded-order' : 'waiting-order'} data-order-id={order.id}
    aria-label={`${aboard ? '卸下' : '装载'} ${order.id} 前往${airport(order.to).city} ${order.amount}${order.kind === 'cargo' ? '吨货物' : '位旅客'}`}
    aria-describedby={`reason-${order.id}`}>
    <span className="job-destination">{airport(order.to).city}<small>{order.to}</small></span>
    <PassengerArt order={order}/>
    <span className="job-quantity">{order.kind === 'cargo' ? '货物' : '旅客'} × {order.amount}{order.kind === 'cargo' ? '吨' : '人'}</span>
    <strong>{money(order.reward)}</strong>
    <small id={`reason-${order.id}`} className="job-state">{reason || (aboard ? '已装载 · 点击卸下' : order.expiresAt === null ? '中转保留 · 点击装载' : '点击装载')}</small>
  </button>;
}
export function OrderBoard({ game, plane, airportId, aboard, setAboard, destination, setDestination, busy }: {
  game: GameState; plane?: Plane; airportId: string; aboard: boolean; setAboard: (b: boolean) => void;
  destination: string; setDestination: (s: string) => void; busy: boolean;
}) {
  const [filter, setFilter] = useState('all');
  const strip = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const list = aboard ? plane ? manifest(game, plane.id) : [] : waiting(game, airportId);
  const shown = list.filter(o => filter === 'all' || o.kind === filter);
  const ids = shown.map(o => o.id).join(',');
  function measure() {
    const el = strip.current;
    if (el) {
      const start = el.scrollLeft <= 2, end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
      setEdges(old => old.start === start && old.end === end ? old : { start, end });
    }
  }
  useEffect(() => {
    const el = strip.current!;
    const observer = new ResizeObserver(measure);
    observer.observe(el); measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => { strip.current?.scrollTo({ left: 0, behavior: 'instant' }); measure(); }, [plane?.id, airportId, aboard, filter]);
  useEffect(measure, [ids]);
  function scroll(direction: number) {
    const el = strip.current;
    if (el) el.scrollBy({ left: direction * Math.max(100, el.clientWidth - 140), behavior: 'instant' });
  }
  function keys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home' || event.key === 'End') strip.current?.scrollTo({ left: event.key === 'Home' ? 0 : strip.current.scrollWidth, behavior: 'instant' });
    else scroll(event.key === 'ArrowLeft' ? -1 : 1);
  }
  const lock = loadingLock(game, plane);
  return <section className="order-board apron-queue" aria-label="客货装载区">
    <div className="order-toolbar">
      <div className="order-tabs" role="group" aria-label="装载区域">
        <button className={!aboard ? 'active' : ''} aria-pressed={!aboard} onClick={() => setAboard(false)}>候机大厅 <b>{waiting(game, airportId).length}</b></button>
        <button className={aboard ? 'active' : ''} aria-pressed={aboard} onClick={() => setAboard(true)}>机上客货 <b data-testid="onboard-count">{plane ? manifest(game, plane.id).length : 0}</b></button>
      </div>
      <select aria-label="客货分类" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">全部客货</option><option value="passengers">只看旅客</option><option value="cargo">只看货物</option></select>
      <span className="demand-clock">{duration(game.nextDemandAt - game.simTime)} 后补充客源</span>
      <div className="quick-load"><select value={destination} aria-label="装载目的地" onChange={e => setDestination(e.target.value)}>{game.airports.filter(a => a.id !== airportId).map(a => <option key={a.id} value={a.id}>{airport(a.id).city}</option>)}</select><button disabled={busy || Boolean(lock)} title={lock || '按队列装载同一目的地且容量允许的订单'} onClick={() => plane && ignore(controller.command({ type: 'load-destination', planeId: plane.id, to: destination }))}>同目的地装载</button></div>
    </div>
    <div className="order-window">
      <button className="queue-arrow" aria-label="上一组客货" disabled={edges.start} onClick={() => scroll(-1)}>‹</button>
      <div ref={strip} className="order-strip" tabIndex={0} role="region" aria-label={aboard ? '机上客货列表' : '候运客货列表'} onScroll={measure} onKeyDown={keys}>
        {shown.map(o => <OrderCard key={o.id} order={o} aboard={aboard} reason={orderBlockReason(game, plane, o, aboard)} busy={busy} onClick={() => plane && ignore(controller.command({ type: aboard ? 'unload' : 'load', planeId: plane.id, orderId: o.id }))}/>)}
        {!shown.length && <div className="empty-orders">{aboard ? '机舱暂无此类客货，可到候机大厅装载。' : '暂时没有此类订单，等待下次客源补充。'}</div>}
      </div>
      <button className="queue-arrow" aria-label="下一组客货" disabled={edges.end} onClick={() => scroll(1)}>›</button>
    </div>
  </section>;
}
