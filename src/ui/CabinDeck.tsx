import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { GameState, Plane } from '../core/game.js';
import { OrderCard } from './OrderBoard.js';
import { orderPresentation } from './order-presentation.js';
import { cabinPage, type CabinDeckData } from './cabin-layout.js';
import { controller } from '../runtime.js';
import { ignore } from './Panels.js';
import { useI18n } from '../i18n/I18n.js';

export function CabinDeck({ deck, game, plane, busy, focusKey }: {
  deck: CabinDeckData; game: GameState; plane: Plane; busy: boolean; focusKey: number;
}) {
  const { ui } = useI18n();
  const strip = useRef<HTMLDivElement>(null);
  const previousOrders = useRef(new Set(deck.orders.map(order => order.id)));
  const [pageIndex, setPage] = useState(0), [pageSize, setPageSize] = useState(3);
  const page = cabinPage(deck, pageIndex, pageSize);
  useEffect(() => {
    const element = strip.current!;
    const resize = () => setPageSize(Math.max(1, Math.min(12, Math.floor(element.clientWidth / 96))));
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    // Reveal accepted orders, including bulk loads onto later pages. Only UI
    // state changes here; order identity and capacity remain core-owned.
    const added = deck.orders.reduce((last, order, i) => previousOrders.current.has(order.id) ? last : i, -1);
    previousOrders.current = new Set(deck.orders.map(order => order.id));
    if (added >= 0) setPage(Math.floor(added / pageSize));
    else setPage(page.page);
  }, [deck.orders, pageSize, page.page]);
  useLayoutEffect(() => { if (focusKey > 0) setPage(0); }, [focusKey]);
  function keys(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    setPage(event.key === 'Home' ? 0 : event.key === 'End' ? page.pages - 1 : Math.max(0, Math.min(page.pages - 1, page.page + (event.key === 'ArrowLeft' ? -1 : 1))));
    strip.current?.focus();
  }
  return <section className={`cabin-deck cabin-${deck.kind}`} aria-label={ui(deck.kind === 'passengers' ? '客舱' : '货舱')} data-testid={`cabin-${deck.kind}`}>
    <header><strong>{ui(deck.kind === 'passengers' ? '客舱' : '货舱')} <span>{deck.used}/{deck.capacity}</span></strong>
      <nav aria-label={ui(deck.kind === 'passengers' ? '客舱翻页' : '货舱翻页')}>
        <button aria-label={ui('上一页{section}', { section: ui(deck.kind === 'passengers' ? '客舱' : '货舱') })} disabled={page.page === 0} onClick={() => setPage(page.page - 1)}>‹</button>
        <span aria-live="polite">{page.page + 1}/{page.pages}</span>
        <button aria-label={ui('下一页{section}', { section: ui(deck.kind === 'passengers' ? '客舱' : '货舱') })} disabled={page.page + 1 === page.pages} onClick={() => setPage(page.page + 1)}>›</button>
      </nav>
    </header>
    <div ref={strip} className="cabin-places" role="group" tabIndex={0} onKeyDown={keys} aria-label={ui(deck.kind === 'passengers' ? '机内乘客' : '机内货物')}>
      {page.items.map(({ slot, order }) => order
        ? <OrderCard key={order.id} cabin order={order} state={orderPresentation(game, plane, order, busy)} onClick={() => { strip.current?.focus(); ignore(controller.command({ type: 'unload', planeId: plane.id, orderId: order.id })); }}/>
        : <div key={`empty-${slot}`} className={`cabin-empty ${deck.kind}`} data-testid="cabin-empty-place" aria-label={ui(deck.kind === 'passengers' ? '空座位' : '空货位')}>
          <div className="empty-place-art" aria-hidden="true">{deck.kind === 'passengers' ? <svg viewBox="0 0 64 70"><path d="M14 11q0-6 7-6h15q6 0 6 6v32h10v13H17q-4 0-4-5Z" fill="#68918f" stroke="#406c73" strokeWidth="3"/><path d="M20 16h16M21 56v9m24-9v9" stroke="#365362" strokeWidth="4"/><path d="M8 40h18" stroke="#dec59b" strokeWidth="5"/></svg> : <svg viewBox="0 0 64 70"><path d="m7 48 26-9 24 9-25 11Z" fill="#d8cbb0" stroke="#a3997f" strokeWidth="2"/><path d="M8 55h49M11 61h44" stroke="#9a8666" strokeWidth="4"/></svg>}</div>
          <span>{ui(deck.kind === 'passengers' ? '空座位' : '空货位')}</span>
        </div>)}
    </div>
  </section>;
}
