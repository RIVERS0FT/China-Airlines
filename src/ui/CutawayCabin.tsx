import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { GameState, Plane } from '../core/game.js';
import { useI18n } from '../i18n/I18n.js';
import { cabinLayout } from './cabin-layout.js';
import { cabinArtLayout } from './cabin-art-layout.js';
import { artAsset } from './art-assets.js';
import { CabinDeck } from './CabinDeck.js';
import './cutaway-cabin.css';

/** All layers use final left-facing art coordinates; operating state stays read-only. */
export function CutawayCabin({ game, plane, busy, focusKey, onInspect }: { game: GameState; plane: Plane; busy: boolean; focusKey: number; onInspect: () => void }) {
  const { ui } = useI18n();
  const interior = useRef<HTMLDivElement>(null);
  const [exterior, setExterior] = useState(false);
  const decks = cabinLayout(game, plane), art = cabinArtLayout(plane);
  const debug = import.meta.env.DEV && new URLSearchParams(location.search).has('cabinAnchors');
  const rect = art.interior, canvas = art.canvas;
  const style = { left: `${rect.x / canvas.width * 100}%`, top: `${rect.y / canvas.height * 100}%`,
    width: `${rect.width / canvas.width * 100}%`, height: `${rect.height / canvas.height * 100}%`,
  } as CSSProperties;
  useEffect(() => {
    if (focusKey > 0) {
      setExterior(false);
    }
  }, [focusKey]);
  useEffect(() => {
    if (focusKey > 0 && !exterior) interior.current?.querySelector<HTMLElement>('.cabin-places')?.focus({ preventScroll: true });
  }, [focusKey, exterior]);
  return <div className="airplane-display cabin-aircraft" data-testid="plane-art" data-cabin-plane-id={plane.id} data-model-id={art.modelId} data-exterior={exterior || undefined}
    data-cabin-family={art.family} data-facing={art.direction} data-anchor-debug={debug || undefined}>
    <img className="cutaway-airframe" src={artAsset(art.hull)} alt="" aria-hidden="true" draggable={false}/>
    <button className="cabin-inspect" aria-label={ui('查看机上客货')} onClick={onInspect}>{ui('机舱剖视')}</button>
    <button className="cabin-toggle" aria-pressed={exterior} onClick={() => setExterior(value => !value)}>{ui(exterior ? '查看机舱' : '查看外观')}</button>
    <div ref={interior} inert={exterior} aria-hidden={exterior || undefined} className={`cabin-overlay cabin-interior ${decks.length === 1 ? 'single-deck' : 'stacked-decks'}`} style={style} data-testid="aircraft-cabin">
      {decks.map(deck => <CabinDeck key={`${plane.id}-${deck.kind}`} deck={deck} art={art} game={game} plane={plane} busy={busy} focusKey={focusKey}/>)}
      <div className="cabin-front-rim" aria-hidden="true"/>
    </div>
    <img className="aircraft-near-layer" data-testid="aircraft-near-layer" src={artAsset(art.near)} alt="" aria-hidden="true" draggable={false}
      style={{ left: `${art.nearBounds.x / canvas.width * 100}%`, top: `${art.nearBounds.y / canvas.height * 100}%`,
        width: `${art.nearBounds.width / canvas.width * 100}%`, height: `${art.nearBounds.height / canvas.height * 100}%`, visibility: exterior ? 'visible' : 'hidden' }}/>
  </div>;
}
