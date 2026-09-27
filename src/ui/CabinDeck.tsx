import { useRef, type CSSProperties } from 'react';
import type { GameState, Plane } from '../core/game.js';
import { OrderCard } from './OrderBoard.js';
import { orderPresentation } from './order-presentation.js';
import { cabinPage, type CabinDeckData } from './cabin-layout.js';
import { controller } from '../runtime.js';
import { ignore } from './Panels.js';
import { useI18n } from '../i18n/I18n.js';
import { paintedAnchors, paintedDeck, cabinPlacement, type CabinArtLayout } from './cabin-art-layout.js';

export function CabinDeck({ deck, art, game, plane, busy, footerIndex, footerCount }: {
  deck: CabinDeckData; art: CabinArtLayout; game: GameState; plane: Plane; busy: boolean; footerIndex: number; footerCount: number;
}) {
  const { ui } = useI18n();
  const strip = useRef<HTMLDivElement>(null);
  const room = paintedDeck(art, deck.kind), anchors = paintedAnchors(art, deck.kind);
  const page = cabinPage(deck, 0, anchors.length);
  return <section className={`cabin-deck cabin-${deck.kind}`} aria-label={ui(deck.kind === 'passengers' ? '客舱' : '货舱')} data-testid={`cabin-${deck.kind}`}
    data-painted-floor={room.floorY} style={{ left: room.x - art.interior.x, top: room.y - art.interior.y, width: room.width, height: room.height }}>
    <header style={{ left: art.canvas.width / footerCount * footerIndex - room.x, top: art.canvas.height - room.y, width: art.canvas.width / footerCount }}>
      <strong>{ui(deck.kind === 'passengers' ? '客舱' : '货舱')} <span>{deck.used}/{deck.capacity}</span></strong>
    </header>
    <div ref={strip} className="cabin-places" role="group" tabIndex={0} aria-label={ui(deck.kind === 'passengers' ? '机内乘客' : '机内货物')}>
      {anchors.map((anchor, index) => {
        // An aggregate order remains one labeled group; its consumed units are never empty slots.
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
          <div className="cabin-furniture-clip"><div className={`cabin-place-art ${deck.kind === 'passengers' ? 'cabin-seat-rear' : 'cabin-pallet'}`} aria-hidden="true"/></div>
          {order
            ? <OrderCard cabin order={order} state={orderPresentation(game, plane, order, busy)} onClick={() => { strip.current?.focus(); ignore(controller.command({ type: 'unload', planeId: plane.id, orderId: order.id })); }}/>
            : item ? <div className={`cabin-empty ${deck.kind}`} data-testid="cabin-empty-place" aria-label={ui(deck.kind === 'passengers' ? '空座位' : '空货位')}><span>{ui(deck.kind === 'passengers' ? '空座位' : '空货位')}</span></div> : null}
        </div>;
      })}
    </div>
  </section>;
}
