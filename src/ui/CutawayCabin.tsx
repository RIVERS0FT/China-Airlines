import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { GameState, Plane } from '../core/game.js';
import { useI18n } from '../i18n/I18n.js';
import { cabinLayout } from './cabin-layout.js';
import { cabinArtLayout, fitAircraft } from './cabin-art-layout.js';
import { artAsset } from './art-assets.js';
import { CabinDeck } from './CabinDeck.js';
import './cutaway-cabin.css';

/** One canvas, one measured scale, one mounted set of real orders. */
export function CutawayCabin({ game, plane, busy, focusKey, onInspect }: { game: GameState; plane: Plane; busy: boolean; focusKey: number; onInspect: () => void }) {
  const { ui } = useI18n();
  const frame = useRef<HTMLDivElement>(null), interior = useRef<HTMLDivElement>(null);
  const [exterior, setExterior] = useState(false), [size, setSize] = useState({ width: 0, height: 0 });
  const decks = cabinLayout(game, plane), art = cabinArtLayout(plane), fit = fitAircraft(size.width, size.height, art.canvas);
  const debug = import.meta.env.DEV && new URLSearchParams(location.search).has('cabinAnchors');
  useLayoutEffect(() => {
    const element = frame.current!;
    const measure = () => setSize(old => old.width === element.clientWidth && old.height === element.clientHeight ? old : { width: element.clientWidth, height: element.clientHeight });
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (focusKey > 0) setExterior(false); }, [focusKey]);
  useEffect(() => {
    if (focusKey > 0 && !exterior) interior.current?.querySelector<HTMLElement>('.cabin-places')?.focus({ preventScroll: true });
  }, [focusKey, exterior]);
  const rect = art.interior;
  return <div ref={frame} className="airplane-display cabin-aircraft" data-testid="plane-art" data-cabin-plane-id={plane.id} data-model-id={art.modelId} data-exterior={exterior || undefined}
    data-cabin-family={art.family} data-facing={art.direction} data-anchor-debug={debug || undefined}>
    <div className="aircraft-canvas" data-testid="aircraft-canvas" data-art-scale={fit.scale} style={{ width: art.canvas.width, height: art.canvas.height,
      left: fit.left, top: fit.top, visibility: fit.scale ? 'visible' : 'hidden', transform: `scale(${fit.scale})`, '--cabin-ui-unit': `${1 / (fit.scale || 1)}px` } as CSSProperties}>
      <img className="cutaway-airframe" data-testid="aircraft-view" src={artAsset(exterior ? art.exterior : art.hull)} alt="" aria-hidden="true" draggable={false}/>
      <div ref={interior} inert={exterior} aria-hidden={exterior || undefined} className={`cabin-overlay cabin-interior ${decks.length === 1 ? 'single-deck' : 'stacked-decks'}`}
        style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }} data-testid="aircraft-cabin">
        {decks.map((deck, index) => <CabinDeck key={`${plane.id}-${deck.kind}`} deck={deck} art={art} game={game} plane={plane} busy={busy} focusKey={focusKey} footerIndex={index} footerCount={decks.length}/>)}
      </div>
    </div>
    <button className="cabin-inspect" aria-label={ui('查看机上客货')} onClick={onInspect}>{ui('机舱剖视')}</button>
    <button className="cabin-toggle" aria-pressed={exterior} onClick={() => setExterior(value => !value)}>{ui(exterior ? '查看机舱' : '查看外观')}</button>
  </div>;
}
