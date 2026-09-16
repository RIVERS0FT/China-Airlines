import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { GameState, Plane } from '../core/game.js';
import { OrderCard } from './OrderBoard.js';
import { orderPresentation } from './order-presentation.js';
import { cabinPage, type CabinDeckData } from './cabin-layout.js';
import { controller } from '../runtime.js';
import { ignore } from './Panels.js';
import { useI18n } from '../i18n/I18n.js';
import { paintedAnchors, paintedDeck, cabinPlacement, type CabinArtLayout } from './cabin-art-layout.js';
import { artAsset } from './art-assets.js';

export function CabinDeck({ deck, art, game, plane, busy, focusKey, footerIndex, footerCount }: {
  deck: CabinDeckData; art: CabinArtLayout; game: GameState; plane: Plane; busy: boolean; focusKey: number; footerIndex: number; footerCount: number;
}) {
  const { ui } = useI18n();
  const strip = useRef<HTMLDivElement>(null), previousOrders = useRef(new Set(deck.orders.map(order => order.id)));
  const [pageIndex, setPage] = useState(0);
  const room = paintedDeck(art, deck.kind), anchors = paintedAnchors(art, deck.kind), pageSize = anchors.length;
  const page = cabinPage(deck, pageIndex, pageSize);
  useLayoutEffect(() => {
    const added = deck.orders.reduce((last, order, i) => previousOrders.current.has(order.id) ? last : i, -1);
    previousOrders.current = new Set(deck.orders.map(order => order.id));
    setPage(added >= 0 ? Math.floor(added / pageSize) : page.page);
  }, [deck.orders, pageSize, page.page]);
  useLayoutEffect(() => { if (focusKey > 0) setPage(0); }, [focusKey]);
  function keys(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    setPage(event.key === 'Home' ? 0 : event.key === 'End' ? page.pages - 1 : Math.max(0, Math.min(page.pages - 1, page.page + (event.key === 'ArrowLeft' ? -1 : 1))));
    strip.current?.focus();
  }
  return <section className={`cabin-deck cabin-${deck.kind}`} aria-label={ui(deck.kind === 'passengers' ? '客舱' : '货舱')} data-testid={`cabin-${deck.kind}`}
    data-painted-floor={room.floorY} style={{ left: room.x - art.interior.x, top: room.y - art.interior.y, width: room.width, height: room.height }}>
    <header style={{ left: art.canvas.width / footerCount * footerIndex - room.x, top: art.canvas.height - room.y, width: art.canvas.width / footerCount }}>
      <strong>{ui(deck.kind === 'passengers' ? '客舱' : '货舱')} <span>{deck.used}/{deck.capacity}</span></strong>
      <nav aria-label={ui(deck.kind === 'passengers' ? '客舱翻页' : '货舱翻页')}>
        <button aria-label={ui('上一页{section}', { section: ui(deck.kind === 'passengers' ? '客舱' : '货舱') })} disabled={page.page === 0} onClick={() => setPage(page.page - 1)}>‹</button>
        <span aria-live="polite">{page.page + 1}/{page.pages}</span>
        <button aria-label={ui('下一页{section}', { section: ui(deck.kind === 'passengers' ? '客舱' : '货舱') })} disabled={page.page + 1 === page.pages} onClick={() => setPage(page.page + 1)}>›</button>
      </nav>
    </header>
    <div ref={strip} className="cabin-places" role="group" tabIndex={0} onKeyDown={keys} aria-label={ui(deck.kind === 'passengers' ? '机内乘客' : '机内货物')}>
      {anchors.map((anchor, index) => {
        // Keep the same furniture nodes on partial last pages, without inventing capacity.
        const item = page.items[index], order = item?.order ?? null;
        const place = cabinPlacement(anchor, room.width, room.height, order);
        return <div className="cabin-anchor" key={index} data-anchor-id={anchor.id} data-slot={item?.slot} data-slot-active={Boolean(item)} inert={!item} aria-hidden={!item || undefined} data-floor-y={place.ground}
          data-seat-cushion-y={place.seatCushion ?? undefined} data-passenger-hip-y={place.occupantHip ?? undefined}
          data-seat-cushion-x={place.seatCushionX ?? undefined} data-passenger-hip-x={place.occupantHipX ?? undefined}
          data-passenger-foot-y={deck.kind === 'passengers' ? place.occupantFoot : undefined}
          data-pallet-top-y={place.palletTop ?? undefined} data-cargo-base-y={deck.kind === 'cargo' ? place.occupantFoot : undefined}
          style={{ left: `${(anchor.x - anchor.width / 2) * 100}%`, width: `${anchor.width * 100}%`, zIndex: anchor.z,
            '--occupant-width': `${place.occupantWidth}px`, '--occupant-height': `${place.occupantHeight}px`, '--occupant-top': `${room.height - place.occupantBottom - place.occupantHeight}px`,
            '--occupant-offset': `${place.occupantOffsetX}px`, '--furniture-width': `${place.furnitureWidth}px`, '--furniture-height': `${place.furnitureHeight}px`,
            '--floor-bottom': `${place.furnitureBottom}px`, '--furniture-offset': `${place.furnitureOffsetX}px`, '--painted-ground': `${place.ground}px`, '--deck-height': `${room.height}px`,
          } as CSSProperties}>
          <div className="cabin-furniture-clip"><img className={`cabin-place-art ${deck.kind === 'passengers' ? 'cabin-seat-rear' : 'cabin-pallet'}`}
            src={artAsset(deck.kind === 'passengers' ? 'cabin-seat-v3.png' : 'cabin-pallet-v3.png')} alt="" aria-hidden="true" draggable={false}/></div>
          {order
            ? <OrderCard cabin order={order} state={orderPresentation(game, plane, order, busy)} onClick={() => { strip.current?.focus(); ignore(controller.command({ type: 'unload', planeId: plane.id, orderId: order.id })); }}/>
            : item ? <div className={`cabin-empty ${deck.kind}`} data-testid="cabin-empty-place" aria-label={ui(deck.kind === 'passengers' ? '空座位' : '空货位')}><span>{ui(deck.kind === 'passengers' ? '空座位' : '空货位')}</span></div> : null}
        </div>;
      })}
    </div>
  </section>;
}
