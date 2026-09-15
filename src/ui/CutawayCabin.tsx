import { useEffect, useId, useRef } from 'react';
import type { GameState, Plane } from '../core/game.js';
import { useI18n } from '../i18n/I18n.js';
import { cabinLayout } from './cabin-layout.js';
import { CabinDeck } from './CabinDeck.js';
import './cutaway-cabin.css';

/** Original side cutaway; real order buttons sit inside the airframe, not on the apron. */
export function CutawayCabin({ game, plane, busy, focusKey, onInspect }: { game: GameState; plane: Plane; busy: boolean; focusKey: number; onInspect: () => void }) {
  const { ui } = useI18n(), id = useId().replace(/:/g, '');
  const interior = useRef<HTMLDivElement>(null);
  const decks = cabinLayout(game, plane);
  useEffect(() => {
    if (focusKey > 0) interior.current?.querySelector<HTMLElement>('.cabin-places')?.focus({ preventScroll: true });
  }, [focusKey]);
  return <div className="airplane-display cabin-aircraft" data-testid="plane-art" data-cabin-plane-id={plane.id}>
    <svg className="cutaway-airframe" viewBox="0 0 1200 340" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id={`${id}-skin`} x2="0" y2="1"><stop stopColor="#fffef3"/><stop offset=".6" stopColor="#e8eff0"/><stop offset="1" stopColor="#b5cbcf"/></linearGradient><linearGradient id={`${id}-fin`} x2="1" y2="1"><stop stopColor="#64b8b0"/><stop offset="1" stopColor="#216c7b"/></linearGradient></defs>
      <ellipse cx="605" cy="319" rx="507" ry="13" fill="#264d5e" opacity=".2"/>
      <path d="M145 128 90 21q-3-9 9-9h49l120 131Z" fill={`url(#${id}-fin)`} stroke="#315e6c" strokeWidth="3"/>
      <path d="m95 235-66-24 112-6 83 25Z" fill="#b9cfd0" stroke="#658990" strokeWidth="3"/>
      <path d="M180 70h804q75 0 115 83l64 55q27 22-2 39-45 32-155 32H194q-57 0-102-47l-48-53h102Z" fill={`url(#${id}-skin)`} stroke="#476e77" strokeWidth="3"/>
      <path d="M170 114h827" stroke="#e7bb5b" strokeWidth="7"/>
      <path d="m1030 121 42 21 23 26-65-11Z" fill="#254f61" stroke="#d0eef2" strokeWidth="3"/>
      <path d="M1006 115v136M186 124v133" stroke="#90acb3" strokeWidth="2"/>
      <rect x="193" y="140" width="32" height="98" rx="12" fill="#d3e2e4" stroke="#819fa7" strokeWidth="2"/><rect x="201" y="154" width="17" height="28" rx="5" fill="#5390a1"/>
      <path d="m648 270-94 49h133l147-50" fill="#c4d8da" stroke="#658891" strokeWidth="3"/>
      <path d="M755 285h95q20 0 20 16t-20 16h-91Z" fill="#e1ece8" stroke="#66868c" strokeWidth="3"/><ellipse cx="756" cy="301" rx="12" ry="17" fill="#315465"/><ellipse cx="756" cy="301" rx="6" ry="11" fill="#162e3a"/>
      <g fill="#29414c" stroke="#aec1c2" strokeWidth="5"><path d="M299 275v28m644-28v28"/><circle cx="290" cy="307" r="10"/><circle cx="309" cy="307" r="10"/><circle cx="943" cy="307" r="10"/></g>
    </svg>
    <button className="cabin-inspect" aria-label={ui('查看机上客货')} onClick={onInspect}>{ui('机舱剖视')}</button>
    <div ref={interior} className={`cabin-overlay cabin-interior ${decks.length === 1 ? 'single-deck' : ''}`} data-testid="aircraft-cabin">
      {decks.map(deck => <CabinDeck key={`${plane.id}-${deck.kind}`} deck={deck} game={game} plane={plane} busy={busy} focusKey={focusKey}/>)}
    </div>
  </div>;
}
