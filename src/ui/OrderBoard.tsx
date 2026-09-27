import { service, MATERIALS } from '../core/career-catalog.js';
import { memo, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { airport } from '../core/catalog.js';
import { waiting, type Order, type GameState, type Plane } from '../core/game.js';
import { orderArtFile } from './cabin-layout.js';
import { passengerFrame } from './passenger-art.js';
import { cargoAppearance } from './cargo-art.js';
import { controller } from '../runtime.js';
import { loadingContext, orderPresentation, presentOrder } from './order-presentation.js';
import { groupWaitingOrders, sameOrderBoardData, type OrderBoardData } from './order-board-data.js';
import { money, ignore } from './Panels.js';
import { artAsset } from './art-assets.js';
import { useI18n } from '../i18n/I18n.js';

/** One decorative sprite per real order. Appearance never implies different fares or cargo rules. */
function OrderArt({ order, cabin }: { order: Order; cabin: boolean }) {
  const clipId = useId();
  const source = artAsset(orderArtFile(order));
  const pose = cabin ? 'seated' : 'standing', passenger = order.kind === 'passengers' ? passengerFrame(order.id, pose) : null;
  const cargo = order.kind === 'cargo' ? cargoAppearance(order) : null, frame = passenger ?? cargo!;
  return <svg className="job-art" viewBox={frame.viewBox} preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false"
    data-passenger-variant={passenger?.variant} data-pose={passenger ? pose : undefined} data-cargo-type={cargo?.key}>
    <defs><clipPath id={clipId}><rect x={frame.x} y={frame.y} width={frame.width} height={frame.height}/></clipPath></defs>
    <image href={source} width="1774" height="887" clipPath={`url(#${clipId})`}/>
  </svg>;
}
export function OrderCard({ order, state, onClick, cabin = false }: {
  order: Order; state: ReturnType<typeof orderPresentation>; onClick: () => void; cabin?: boolean;
}) {
  const { ui, airportName } = useI18n();
  const type = order.kind === 'cargo' ? cargoAppearance(order).name : service(order.service)?.name;
  return <button className={`${cabin ? 'cabin-order' : 'job-card'} order-${order.kind} order-${state.state} ${state.aboard ? 'aboard' : ''} ${order.amount > 1 ? 'bulk-quantity' : ''}`} disabled={state.disabled} onClick={onClick}
    data-testid={state.aboard ? 'loaded-order' : 'waiting-order'} data-order-id={order.id} data-load-state={state.state}
    aria-label={`${ui(state.aboard ? '卸下' : '装载')} ${order.id} ${ui('前往{city}',{city:airportName(order.to,airport(order.to).city)})} ${ui('{count}{unit}',{count:order.amount,unit:ui(order.kind === 'cargo' ? '吨货物' : '位旅客')})}${type ? `, ${ui(type)}` : ''}${state.reason ? `, ${ui(state.reason)}` : ''}${state.transfer ? `, ${ui('中转客货')}` : ''}`}
    aria-describedby={`${cabin ? `destination-${order.id} ` : ''}price-${order.id}`} title={[type ? ui(type) : '', ui(cabin ? state.action : '装机'), state.transfer ? ui('中转客货保留至交付') : ''].filter(Boolean).join(' · ')}>
    <span className="job-figure"><OrderArt order={order} cabin={cabin}/>
      {state.transfer && <span className="job-transfer-tag">{ui('中转')}</span>}
      {order.amount > 1 && <span className="job-quantity">{ui('{count}{unit}',{count:order.amount,unit:ui(order.kind === 'cargo' ? '吨' : '人')})}</span>}
    </span>
    <span className="job-info">
      {cabin && <span id={`destination-${order.id}`} className="cabin-destination">{airportName(order.to, airport(order.to).city)}</span>}
      {!cabin && order.kind === 'cargo' && !order.product && <span className="cargo-name">{ui(type!)}</span>}
      <strong id={`price-${order.id}`} className="job-price">{!cabin && order.product ? ui(MATERIALS[order.product]) : money(order.reward)}</strong>
    </span>
  </button>;
}
export function OrderBoard({ game, plane, airportId, aboard, busy, viewKey = 0 }: {
  game: GameState; plane?: Plane; airportId: string; aboard: boolean;
  busy: boolean; viewKey?: number;
}) {
  return <OrderBoardView orders={waiting(game, airportId)} loading={loadingContext(game, plane)} airportId={airportId} busy={busy} aboard={aboard} viewKey={viewKey}/>;
}

const OrderBoardView = memo(function OrderBoardView({ orders, loading, airportId, busy, aboard, viewKey }: OrderBoardData & { aboard: boolean; viewKey: number }) {
  const strip = useRef<HTMLDivElement>(null);
  const previousView = useRef({ airportId, viewKey });
  const anchor = useRef<{ id: string; left: number }[]>([]);
  const gesture = useRef<{ x: number; y: number; scale: number; scroll: number; moved: boolean; active: boolean } | null>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const { ui, airportName, locale } = useI18n();
  const groups = groupWaitingOrders(orders);
  function rememberAnchor() {
    const el = strip.current;
    if (!el || el.scrollLeft <= 2) { anchor.current = []; return; }
    const bounds = el.getBoundingClientRect(), scale = bounds.width / el.offsetWidth;
    anchor.current = [...el.querySelectorAll<HTMLElement>('[data-order-id]')].flatMap(card => {
      const box = card.getBoundingClientRect();
      return box.right > bounds.left && box.left < bounds.right ? [{ id: card.dataset.orderId!, left: (box.left - bounds.left) / scale }] : [];
    });
  }
  function measure() {
    const el = strip.current;
    if (el) {
      const start = el.scrollLeft <= 2, end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
      setEdges(old => old.start === start && old.end === end ? old : { start, end });
    }
  }
  useEffect(() => {
    const el = strip.current!;
    const observer = new ResizeObserver(() => { measure(); rememberAnchor(); });
    observer.observe(el); measure();
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = strip.current!;
    if (previousView.current.airportId !== airportId || (!aboard && previousView.current.viewKey !== viewKey)) {
      el.scrollLeft = 0;
    } else {
      const survivor = anchor.current.find(item => el.querySelector(`[data-order-id="${item.id}"]`));
      if (survivor) {
        const bounds = el.getBoundingClientRect(), scale = bounds.width / el.offsetWidth;
        const card = el.querySelector(`[data-order-id="${survivor.id}"]`)!;
        el.scrollLeft += (card.getBoundingClientRect().left - bounds.left) / scale - survivor.left;
      }
    }
    previousView.current = { airportId, viewKey };
    measure();
    rememberAnchor();
  }, [orders, airportId, aboard, viewKey, locale]);
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
  const { lock, planeId } = loading;
  return <section className="order-board apron-queue" aria-label={ui('客货装载区')} style={{ backgroundImage: `url("${artAsset('apron-platform-v1.jpg')}")` }}>
    <div className="order-window">
      <button className="queue-arrow" aria-label={ui('上一组客货')} disabled={edges.start} onClick={() => scroll(-1)}>‹</button>
      <div ref={strip} className="order-strip" tabIndex={0} role="region" aria-label={ui('客货列表')} onScroll={() => {
        const drag = gesture.current;
        if (drag?.active && Math.abs((strip.current?.scrollLeft ?? 0) - drag.scroll) > 6) drag.moved = true;
        measure();
        rememberAnchor();
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
        {groups.map(([to, orders]) => {
          const cards = orders.map(order => ({ order, state: presentOrder(loading, order, busy) }));
          const canLoad = cards.some(({ state }) => !state.disabled);
          return <div className="destination-group" role="group" aria-label={ui('前往{city}的客货',{city:airportName(to,airport(to).city)})} key={to}>
            <button className="destination-station" aria-label={ui('同目的地装载：{city}',{city:airportName(to,airport(to).city)})} disabled={!canLoad} title={ui(lock || (canLoad ? '装机此站牌下容量允许的待运客货' : '此目的地暂无可装载客货'))} onClick={() => planeId && ignore(controller.command({ type: 'load-destination', planeId, to }))}>{airportName(to,airport(to).city)}</button>
            <div className="destination-orders">{cards.map(({ order, state }) => <OrderCard key={order.id} order={order} state={state} onClick={() => planeId && ignore(controller.command({ type: 'load', planeId, orderId: order.id }))}/>)}</div>
          </div>;
        })}
        {!orders.length && <div className="empty-orders">{ui('暂无客货，等待下次客源补充。')}</div>}
      </div>
      <button className="queue-arrow" aria-label={ui('下一组客货')} disabled={edges.end} onClick={() => scroll(1)}>›</button>
    </div>
  </section>;
}, (a, b) => a.aboard === b.aboard && a.viewKey === b.viewKey && sameOrderBoardData(a, b));
