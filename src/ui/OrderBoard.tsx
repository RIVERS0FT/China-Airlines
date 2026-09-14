import { service, MATERIALS } from '../core/career-catalog.js';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { airport } from '../core/catalog.js';
import { manifest, waiting, type Order, type GameState, type Plane } from '../core/game.js';
import { controller } from '../runtime.js';
import { loadingLock, orderBlockReason, orderPresentation } from './order-presentation.js';
import { money, ignore } from './Panels.js';
import { artAsset } from './art-assets.js';
import { useI18n } from '../i18n/I18n.js';

/** One decorative sprite per real order. Appearance never implies different fares or cargo rules. */
function PassengerArt({ order }: { order: Order }) {
  const variant = Array.from(order.id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6 + 1;
  const file = order.kind === 'cargo' ? service(order.service)?.art ?? 'cargo-v1.png' : `passenger-${String(variant).padStart(2, '0')}-v1.png`;
  return <img src={artAsset(file)} alt="" aria-hidden="true" className="job-art" draggable={false}/>;
}
function OrderCard({ order, state, onClick }: {
  order: Order; state: ReturnType<typeof orderPresentation>; onClick: () => void;
}) {
  const { ui, airportName } = useI18n();
  const type = order.product ? MATERIALS[order.product] : service(order.service)?.name;
  return <button className={`job-card order-${state.state} ${state.aboard ? 'aboard' : ''} ${order.amount > 1 ? 'legacy-quantity' : ''}`} disabled={state.disabled} onClick={onClick}
    data-testid={state.aboard ? 'loaded-order' : 'waiting-order'} data-order-id={order.id} data-load-state={state.state}
    aria-label={`${ui(state.aboard ? '卸下' : '装载')} ${order.id} ${ui('前往{city}',{city:airportName(order.to,airport(order.to).city)})} ${ui('{count}{unit}',{count:order.amount,unit:ui(order.kind === 'cargo' ? '吨货物' : '位旅客')})}${type ? `, ${type}` : ''}${state.reason ? `, ${ui(state.reason)}` : ''}${state.transfer ? `, ${ui('中转客货')}` : ''}`}
    aria-describedby={`price-${order.id} state-${order.id}`} title={[type, ui(state.action), state.transfer ? ui('中转客货保留至交付') : ''].filter(Boolean).join(' · ')}>
    <span className="job-figure"><PassengerArt order={order}/>
      {state.transfer && <span className="job-transfer-tag">{ui('中转')}</span>}
      {order.amount > 1 && <span className="job-quantity">{ui('{count}{unit}',{count:order.amount,unit:ui(order.kind === 'cargo' ? '吨' : '人')})}</span>}
    </span>
    <span className="job-info"><strong id={`price-${order.id}`} className="job-price">{order.product ? MATERIALS[order.product] : money(order.reward)}</strong>
      <span id={`state-${order.id}`} className="job-state job-action">{ui(state.caption)}</span>
    </span>
  </button>;
}
export function OrderBoard({ game, plane, airportId, aboard, busy, viewKey = 0 }: {
  game: GameState; plane?: Plane; airportId: string; aboard: boolean;
  busy: boolean; viewKey?: number;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; scale: number; scroll: number; moved: boolean; active: boolean } | null>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const { ui, airportName } = useI18n();
  const onboard = plane ? manifest(game, plane.id) : [];
  const shown = [...waiting(game, airportId), ...onboard]
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const groups = new Map<string, Order[]>();
  for (const order of shown) {
    const group = groups.get(order.to);
    if (group) group.push(order); else groups.set(order.to, [order]);
  }
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
  useEffect(() => {
    const el = strip.current;
    const loaded = aboard ? el?.querySelector<HTMLElement>('[data-testid="loaded-order"]') : null;
    if (el && loaded) {
      const bounds = el.getBoundingClientRect();
      el.scrollLeft += (loaded.getBoundingClientRect().left - bounds.left) * el.offsetWidth / Math.max(1, bounds.width);
    }
    else el?.scrollTo({ left: 0, behavior: 'instant' });
    measure();
  }, [plane?.id, airportId, aboard, viewKey]);
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
  return <section className="order-board apron-queue" aria-label={ui('客货装载区')} style={{ backgroundImage: `url("${artAsset('apron-platform-v1.jpg')}")` }}>
    <div className="order-window">
      <button className="queue-arrow" aria-label={ui('上一组客货')} disabled={edges.start} onClick={() => scroll(-1)}>‹</button>
      <div ref={strip} className="order-strip" tabIndex={0} role="region" aria-label={ui('客货列表')} onScroll={() => {
        const drag = gesture.current;
        if (drag?.active && Math.abs((strip.current?.scrollLeft ?? 0) - drag.scroll) > 6) drag.moved = true;
        measure();
      }} onKeyDown={keys}
        onPointerDownCapture={event => {
          const el = event.currentTarget, bounds = el.getBoundingClientRect();
          gesture.current = { x: event.clientX, y: event.clientY, scale: el.offsetWidth / Math.max(1, bounds.width), scroll: el.scrollLeft, moved: false, active: true };
        }}
        onPointerMoveCapture={event => {
          const drag = gesture.current;
          if (drag?.active && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) * drag.scale > 10) drag.moved = true;
        }}
        onPointerUpCapture={() => { if (gesture.current) gesture.current.active = false; }}
        onPointerCancelCapture={() => { if (gesture.current) { gesture.current.moved = true; gesture.current.active = false; } }}
        onClickCapture={event => {
          // Keyboard clicks have detail=0 and must remain usable after a touch scroll.
          if (event.detail > 0 && gesture.current?.moved) { event.preventDefault(); event.stopPropagation(); }
        }}>
        {[...groups].map(([to, orders]) => <div className="destination-group" role="group" aria-label={ui('前往{city}的客货',{city:airportName(to,airport(to).city)})} key={to}>
          <button className="destination-station" aria-label={ui('同目的地装载：{city}',{city:airportName(to,airport(to).city)})} disabled={busy || Boolean(lock) || !orders.some(order => order.location !== plane?.id && !orderBlockReason(game, plane, order, false))} title={ui(lock || (orders.some(order => order.location !== plane?.id && !orderBlockReason(game, plane, order, false)) ? '装机此站牌下容量允许的待运客货' : '此目的地暂无可装载客货'))} onClick={() => plane && ignore(controller.command({ type: 'load-destination', planeId: plane.id, to }))}>{airportName(to,airport(to).city)}</button>
          <div className="destination-orders">{orders.map(o => <OrderCard key={o.id} order={o} state={orderPresentation(game, plane, o, busy)} onClick={() => plane && ignore(controller.command({ type: o.location === plane.id ? 'unload' : 'load', planeId: plane.id, orderId: o.id }))}/>)}</div>
        </div>)}
        {!shown.length && <div className="empty-orders">{ui('暂无客货，等待下次客源补充。')}</div>}
      </div>
      <button className="queue-arrow" aria-label={ui('下一组客货')} disabled={edges.end} onClick={() => scroll(1)}>›</button>
    </div>
  </section>;
}
