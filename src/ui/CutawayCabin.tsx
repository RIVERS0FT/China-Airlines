import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GameState, Plane } from '../core/game.js';
import { useI18n } from '../i18n/I18n.js';
import { cabinLayout } from './cabin-layout.js';
import { cabinArtLayout } from './cabin-art-layout.js';
import { aircraftRectStyle, fitAircraftArt } from './aircraft-projection.js';
import { artAsset } from './art-assets.js';
import { CabinDeck } from './CabinDeck.js';
import './cutaway-cabin.css';

/** The painted cutaway is the only room; its interactive contents stay mounted. */
export function CutawayCabin({ game, plane, busy, focusKey, onInspect }: { game: GameState; plane: Plane; busy: boolean; focusKey: number; onInspect: () => void }) {
  const { ui } = useI18n();
  const frame = useRef<HTMLDivElement>(null), interior = useRef<HTMLDivElement>(null);
  const [exterior, setExterior] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const decks = cabinLayout(game, plane), art = cabinArtLayout(plane);
  const debug = import.meta.env.DEV && new URLSearchParams(location.search).has('cabinAnchors');
  const projection = fitAircraftArt(size, art.canvas, art.nearBounds);
  useLayoutEffect(() => {
    const element = frame.current!;
    // client dimensions are logical CSS pixels, unlike screen-scaled DOM bounds.
    const resize = () => {
      const width = element.clientWidth, height = element.clientHeight;
      setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element); resize();
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (focusKey > 0) setExterior(false); }, [focusKey]);
  useEffect(() => {
    if (focusKey > 0 && !exterior) interior.current?.querySelector<HTMLElement>('.cabin-places')?.focus({ preventScroll: true });
  }, [focusKey, exterior]);
  return <div ref={frame} className="airplane-display cabin-aircraft" data-testid="plane-art" data-cabin-plane-id={plane.id} data-model-id={art.modelId} data-exterior={exterior || undefined}
    data-cabin-family={art.family} data-facing={art.direction} data-anchor-debug={debug || undefined}>
    <div className="aircraft-art-canvas" data-testid="aircraft-art-canvas" data-art-scale={projection.scale}
      style={{ left: projection.x, top: projection.y, width: projection.width, height: projection.height }}>
      <img className="cutaway-airframe" src={artAsset(art.hull)} alt="" aria-hidden="true" draggable={false}/>
      <div ref={interior} inert={exterior} aria-hidden={exterior || undefined} className={`cabin-overlay cabin-interior ${decks.length === 1 ? 'single-deck' : 'stacked-decks'}`} style={aircraftRectStyle(art.interior, art.canvas)} data-testid="aircraft-cabin">
        {decks.map(deck => <CabinDeck key={`${plane.id}-${deck.kind}`} deck={deck} art={art} game={game} plane={plane} busy={busy} focusKey={focusKey}/>)}
      </div>
      <img className="aircraft-near-layer" data-testid="aircraft-near-layer" src={artAsset(art.near)} alt="" aria-hidden="true" draggable={false}
        style={{ ...aircraftRectStyle(art.nearBounds, art.canvas), visibility: exterior ? 'visible' : 'hidden' }}/>
    </div>
    <button className="cabin-inspect" aria-label={ui('查看机上客货')} onClick={onInspect}>{ui('机舱剖视')}</button>
    <button className="cabin-toggle" aria-pressed={exterior} onClick={() => setExterior(value => !value)}>{ui(exterior ? '查看机舱' : '查看外观')}</button>
  </div>;
}
