import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { GameState, Plane } from '../core/game.js';
import { useI18n } from '../i18n/I18n.js';
import { cabinLayout } from './cabin-layout.js';
import { cabinArtLayout, fitAircraft } from './cabin-art-layout.js';
import { artAsset } from './art-assets.js';
import { CabinDeck } from './CabinDeck.js';
import './aircraft-cabin.css';
import './cabin-allocation.css';

/** One canvas, one measured scale, one mounted set of real orders. */
export function AircraftCabin({ game, plane, busy, focusKey, visible, onToggle }: { game: GameState; plane: Plane; busy: boolean; focusKey: number; visible: boolean; onToggle: () => void }) {
  const { ui } = useI18n();
  const frame = useRef<HTMLDivElement>(null), interior = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const decks = cabinLayout(game, plane), art = cabinArtLayout(plane), fit = fitAircraft(size.width, size.height, art.canvas);
  const debug = import.meta.env.DEV && new URLSearchParams(location.search).has('cabinAnchors');
  useLayoutEffect(() => {
    const element = frame.current!;
    const measure = () => setSize(old => old.width === element.clientWidth && old.height === element.clientHeight ? old : { width: element.clientWidth, height: element.clientHeight });
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (focusKey > 0 && visible) interior.current?.querySelector<HTMLElement>('.cabin-places')?.focus({ preventScroll: true });
  }, [focusKey, visible]);
  const rect = art.interior;
  const allocated = decks.reduce((sum, deck) => sum + deck.capacity, 0);
  const floor = (decks.length ? Math.max(...decks.map(deck => art.decks[deck.kind]!.floorY)) : rect.y + rect.height * .88) - rect.y;
  return <div ref={frame} className="airplane-display cabin-aircraft" data-testid="plane-art" data-cabin-plane-id={plane.id} data-model-id={art.modelId} data-exterior={!visible || undefined}
    data-cabin-family={art.family} data-facing={art.direction} data-anchor-debug={debug || undefined}>
    <div className="aircraft-canvas" data-testid="aircraft-canvas" data-art-scale={fit.scale} style={{ width: art.canvas.width, height: art.canvas.height,
      left: fit.left, top: fit.top, visibility: fit.scale ? 'visible' : 'hidden', transform: `scale(${fit.scale})`, '--cabin-ui-unit': `${1 / (fit.scale || 1)}px` } as CSSProperties}>
      <img className="aircraft-exterior-art" data-testid="aircraft-view" src={artAsset(art.exterior)} alt="" aria-hidden="true" draggable={false}/>
      <div ref={interior} inert={!visible} aria-hidden={!visible || undefined} className="cabin-overlay cabin-interior"
        style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, '--cabin-capacity': art.capacity } as CSSProperties}
        data-testid="aircraft-cabin" data-capacity={art.capacity} data-allocated={allocated}>
        <div className="cabin-shell" data-testid="procedural-cabin-shell" aria-hidden="true">
          <div className="cabin-shell-windows">{Array.from({ length: art.capacity }, (_, index) => <span key={index}/>)}</div>
          <div className="cabin-shell-floor" style={{ top: floor }}/>
        </div>
        {decks.length === 2 && <div className="cabin-partition" aria-hidden="true" style={{ left: art.decks.cargo!.x - rect.x, height: floor - 10 }}/>}
        {allocated > 0 && allocated < art.capacity && <div className="cabin-unallocated-space" aria-hidden="true" style={{ left: `${allocated / art.capacity * 100}%`, width: `${(art.capacity - allocated) / art.capacity * 100}%`, height: floor - 10 }}/>}
        {decks.length ? decks.map((deck, index) => <CabinDeck key={`${plane.id}-${deck.kind}`} deck={deck} art={art} game={game} plane={plane} busy={busy} footerIndex={index} footerCount={decks.length}/>) : <p className="cabin-unallocated">尚未配置客货舱位，请前往机队管理改装。</p>}
      </div>
    </div>
    <button className="cabin-toggle" aria-pressed={visible} onClick={onToggle}>{ui(visible ? '隐藏机舱' : '显示机舱')}</button>
  </div>;
}
