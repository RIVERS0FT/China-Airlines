import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { airport } from '../core/catalog.js';
import { manifest, waiting, type Order, type GameState, type Plane } from '../core/game.js';
import { controller } from '../runtime.js';
import { FlightMoney } from './FlightBoard.js';
import { currentFlight } from './flight-status.js';
import { loadingLock, orderBlockReason } from './order-presentation.js';
import { money, duration, ignore } from './Panels.js';

/** Original single-passenger and single-cargo art; fresh demand is never grouped. */
function PassengerArt({ order }: { order: Order }) {
  const variant = Number(order.id.slice(2)) % 3;
  return <svg viewBox="0 0 100 62" aria-hidden="true" className="job-art">
    <ellipse cx="50" cy="57" rx="25" ry="4" fill="#536869" opacity=".16"/>
    {order.kind === 'cargo' ? <g stroke="#775c3e" strokeWidth="2">
      <path d="M22 48h55l4-18h8M27 50l-3 6m47-6 3 6" fill="none"/>
      <rect x="34" y="20" width="34" height="28" rx="2" fill="#dca25d"/>
      <path d="M51 20v28M34 31h34" stroke="#f2dba5"/>
      <circle cx="34" cy="54" r="4" fill="#466477"/><circle cx="67" cy="54" r="4" fill="#466477"/>
    </g> : <g stroke="#43596c" strokeWidth="1.8" transform="translate(50,3)">
      <path d="m-5 34-3 19m11-19 3 19" strokeWidth="4"/>
      <path d="M-10 19H9l5 19h-29Z" fill={['#dfaa59','#5ca8a5','#cf8070'][variant]}/>
      <circle cy="11" r="9" fill="#f2cca6"/>
      <path d="M-9 10q-3-15 11-11 9 1 7 13L4 5-6 11Z" fill="#625247"/>
      <rect x="15" y="37" width="13" height="16" rx="2" fill="#7691a4"/><path d="M18 36v-6h7v6" fill="none"/>
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
    <span className="job-quantity">{order.amount === 1 ? (order.kind === 'cargo' ? '1 吨货物' : '1 位旅客') : `${order.kind === 'cargo' ? '历史货单' : '历史旅客组'} × ${order.amount}${order.kind === 'cargo' ? '吨' : '人'}`}</span>
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
  const lock = loadingLock(game, plane), flight = plane ? currentFlight(game, plane) : null;
  return <section className="order-board apron-queue" aria-label="客货装载区">
    <div className="order-toolbar">
      <div className="order-tabs" role="group" aria-label="装载区域">
        {!flight && <button className={!aboard ? 'active' : ''} aria-pressed={!aboard} onClick={() => setAboard(false)}>候机大厅 <b>{waiting(game, airportId).length}</b></button>}
        <button className={aboard ? 'active' : ''} aria-pressed={aboard} onClick={() => setAboard(true)}>机上客货 <b data-testid="onboard-count">{plane ? manifest(game, plane.id).length : 0}</b></button>
      </div>
      <select aria-label="客货分类" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">全部客货</option><option value="passengers">只看旅客</option><option value="cargo">只看货物</option></select>
      {!flight && <span className="demand-clock">{duration(game.nextDemandAt - game.simTime)} 后补充客源</span>}
      {flight ? <FlightMoney flight={flight}/> : <div className="quick-load"><select value={destination} aria-label="装载目的地" onChange={e => setDestination(e.target.value)}>{game.airports.filter(a => a.id !== airportId).map(a => <option key={a.id} value={a.id}>{airport(a.id).city}</option>)}</select><button disabled={busy || Boolean(lock)} title={lock || '按队列装载同一目的地且容量允许的订单'} onClick={() => plane && ignore(controller.command({ type: 'load-destination', planeId: plane.id, to: destination }))}>同目的地装载</button></div>}
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
