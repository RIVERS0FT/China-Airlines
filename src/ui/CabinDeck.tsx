import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { GameState, Plane } from '../core/game.js';
import { OrderCard } from './OrderBoard.js';
import { orderPresentation } from './order-presentation.js';
import { cabinPage, type CabinDeckData } from './cabin-layout.js';
import { controller } from '../runtime.js';
import { ignore } from './Panels.js';
import { useI18n } from '../i18n/I18n.js';
import { cabinAnchors, cabinPlacement, type CabinArtLayout } from './cabin-art-layout.js';
import { artAsset } from './art-assets.js';
import { CabinFloor } from './CabinFloor.js';
import { aircraftSpecs } from '../core/catalog.js';

export function CabinDeck({ deck, art, game, plane, busy, focusKey }: {
  deck: CabinDeckData; art: CabinArtLayout; game: GameState; plane: Plane; busy: boolean; focusKey: number;
}) {
  const { ui } = useI18n();
  const strip = useRef<HTMLDivElement>(null);
  const previousOrders = useRef(new Set(deck.orders.map(order => order.id)));
  const [pageIndex, setPage] = useState(0), [size, setSize] = useState({ width: 288, height: 180 });
  const logicalWidth = size.width;
  const anchors = cabinAnchors(deck.kind, logicalWidth, art.maxAnchors), pageSize = anchors.length;
  const page = cabinPage(deck, pageIndex, pageSize);
  const spec = aircraftSpecs(plane), mixed = spec.seats > 0 && spec.cargo > 0;
  const room = art.interior;
  const wallY = room.y + (mixed && deck.kind === 'cargo' ? room.height * .64 : 15);
  const wallHeight = room.height * (mixed ? .24 : .48);
  useEffect(() => {
    const element = strip.current!;
    const resize = () => setSize({ width: element.clientWidth, height: element.clientHeight });
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
  return <section className={`cabin-deck cabin-${deck.kind}${size.height < 90 ? ' cabin-compact' : ''}`} aria-label={ui(deck.kind === 'passengers' ? '客舱' : '货舱')} data-testid={`cabin-${deck.kind}`}>
    <div className="cabin-room-wall" aria-hidden="true"><svg className="cabin-wall-plane" viewBox={`${room.x + 70} ${wallY} ${room.width - 140} ${wallHeight}`} preserveAspectRatio="none"><image href={artAsset(art.hull)} width={art.canvas.width} height={art.canvas.height}/></svg></div>
    <div className="cabin-room-floor" aria-hidden="true"><CabinFloor kind={deck.kind} width={size.width + 16} height={size.height * .45}/></div>
    <header><strong>{ui(deck.kind === 'passengers' ? '客舱' : '货舱')} <span>{deck.used}/{deck.capacity}</span></strong>
      <nav aria-label={ui(deck.kind === 'passengers' ? '客舱翻页' : '货舱翻页')}>
        <button aria-label={ui('上一页{section}', { section: ui(deck.kind === 'passengers' ? '客舱' : '货舱') })} disabled={page.page === 0} onClick={() => setPage(page.page - 1)}>‹</button>
        <span aria-live="polite">{page.page + 1}/{page.pages}</span>
        <button aria-label={ui('下一页{section}', { section: ui(deck.kind === 'passengers' ? '客舱' : '货舱') })} disabled={page.page + 1 === page.pages} onClick={() => setPage(page.page + 1)}>›</button>
      </nav>
    </header>
    <div ref={strip} className="cabin-places" role="group" tabIndex={0} onKeyDown={keys} aria-label={ui(deck.kind === 'passengers' ? '机内乘客' : '机内货物')}>
      {page.items.map(({ slot, order }, index) => {
        const anchor = anchors[index]!;
        const place = cabinPlacement(anchor, size.width, size.height, order);
        return <div className="cabin-anchor" key={order?.id ?? `empty-${slot}`} data-anchor-id={anchor.id} data-slot={slot}
          data-floor-y={place.ground}
          data-seat-cushion-y={place.seatCushion ?? undefined} data-passenger-hip-y={place.occupantHip ?? undefined}
          data-seat-cushion-x={place.seatCushionX ?? undefined} data-passenger-hip-x={place.occupantHipX ?? undefined}
          data-passenger-foot-y={deck.kind === 'passengers' ? place.occupantFoot : undefined}
          data-pallet-top-y={place.palletTop ?? undefined} data-cargo-base-y={deck.kind === 'cargo' ? place.occupantFoot : undefined}
          style={{ left: `${(anchor.x - anchor.width / 2) * 100}%`, width: `${anchor.width * 100}%`, bottom: 0, zIndex: anchor.z,
            '--occupant-width': `${place.occupantWidth}px`, '--occupant-height': `${place.occupantHeight}px`, '--occupant-top': `${size.height - place.occupantBottom - place.occupantHeight}px`,
            '--occupant-offset': `${place.occupantOffsetX}px`,
            '--furniture-width': `${place.furnitureWidth}px`, '--furniture-height': `${place.furnitureHeight}px`, '--floor-bottom': `${place.furnitureBottom}px`,
            '--furniture-offset': `${place.furnitureOffsetX}px`, '--label-top': `${place.labelTop}px`,
          } as CSSProperties}>
          <img className={`cabin-place-art ${deck.kind === 'passengers' ? 'cabin-seat-rear' : 'cabin-pallet'}`}
            src={artAsset(deck.kind === 'passengers' ? 'cabin-seat-v3.png' : 'cabin-pallet-v3.png')} alt="" aria-hidden="true" draggable={false}/>
          {order
            ? <OrderCard cabin order={order} state={orderPresentation(game, plane, order, busy)} onClick={() => { strip.current?.focus(); ignore(controller.command({ type: 'unload', planeId: plane.id, orderId: order.id })); }}/>
            : <div className={`cabin-empty ${deck.kind}`} data-testid="cabin-empty-place" aria-label={ui(deck.kind === 'passengers' ? '空座位' : '空货位')}>
              <span>{ui(deck.kind === 'passengers' ? '空座位' : '空货位')}</span>
            </div>}
        </div>;
      })}
    </div>
  </section>;
}
