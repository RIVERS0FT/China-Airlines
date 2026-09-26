import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { guideStep, GUIDE_STEPS, type GuideScreen } from '../core/onboarding.js';
import type { GameState, Plane } from '../core/game.js';
import { controller } from '../runtime.js';
import { ignore } from './Panels.js';
import './tutorial-layout.css';
import { useI18n } from '../i18n/I18n.js';
import { artAsset } from './art-assets.js';
import { airport } from '../core/catalog.js';
import { projectGeo, type GlobeCamera } from './globe-geometry.js';
type Box = { x: number; y: number; width: number; height: number };
export function Tutorial({ game, plane, screen, destination, busy, onLocate }: {
  game: GameState; plane?: Plane; screen: string; destination: string; busy: boolean;
  onLocate: (screen: GuideScreen) => void;
}) {
  const [host, setHost] = useState<HTMLElement>(document.body);
  const [box, setBox] = useState<Box | null>(null);
  const [topInset, setTopInset] = useState(0);
  const [locating, setLocating] = useState(false);
  const [viewport, setViewport] = useState({ width: innerWidth, height: innerHeight });
  const popover = useRef<HTMLDivElement>(null), target = useRef<HTMLElement | null>(null);
  const purchaseOpen = host.matches('dialog.aircraft-purchase[open]');
  const step = guideStep(game, plane, screen, destination, purchaseOpen);
  const { ui, locale } = useI18n();
  useLayoutEffect(() => {
    if (!locating) return;
    const timer = setTimeout(() => setLocating(false), 600);
    return () => clearTimeout(timer);
  }, [locating]);
  useLayoutEffect(() => {
    const sync = () => {
      const dialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')];
      setHost(dialogs.at(-1) ?? document.body);
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
    sync();
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const element = popover.current!;
    if (!element.matches(':popover-open')) element.showPopover();
    if (host instanceof HTMLDialogElement) host.classList.add('guided-dialog');
    return () => { if (element.matches(':popover-open')) element.hidePopover(); host.classList.remove('guided-dialog'); };
  }, [host]);
  useLayoutEffect(() => {
    function measure() {
        const scope = host instanceof HTMLDialogElement ? host : document;
        const selectors = step.target.split(',');
        const candidates = selectors.flatMap(selector => [...scope.querySelectorAll<HTMLElement>(selector.trim())]);
        const nextTarget = candidates.find(item => item.getClientRects().length > 0 && !item.closest('[inert]')) ?? null;
        if (target.current !== nextTarget && !(host instanceof HTMLDialogElement) && nextTarget?.closest('.ui-scroll-region')) nextTarget.scrollIntoView({ block: 'center', behavior: 'instant' });
        target.current = nextTarget;
        const highlighted = host instanceof HTMLDialogElement
          ? host.querySelector('.airport-details') ? target.current : host
          : step.id === 'done' ? null : target.current;
        let rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'> | undefined = highlighted?.getBoundingClientRect();
        // A canvas airport has no DOM button: project its real camera position,
        // leaving the pointer hole on the same pixels as MapView's hit testing.
        if (step.id === 'dispatch' && highlighted?.matches('[data-testid="map-canvas"]')) {
          const raw = highlighted.dataset.camera;
          rect = undefined;
          if (raw && highlighted.dataset.renderer === 'ready') {
            const camera = JSON.parse(raw) as GlobeCamera, point = projectGeo(airport('PVG'), camera);
            const bounds = highlighted.getBoundingClientRect(), scale = bounds.width / highlighted.clientWidth;
            const x = bounds.left + point.x * scale, y = bounds.top + point.y * scale, radius = Math.max(22, 22 * scale);
            if (point.visible && x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom)
              rect = { left: x - radius, right: x + radius, top: y - radius, bottom: y + radius };
          }
        }
        const next = rect && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth ? { x: Math.max(0, rect.left - 5), y: Math.max(0, rect.top - 5), width: Math.min(innerWidth, rect.right + 5) - Math.max(0, rect.left - 5), height: Math.min(innerHeight, rect.bottom + 5) - Math.max(0, rect.top - 5) } : null;
        setBox(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
        // Keep the existing HUD available, including save/help, without adding
        // duplicate controls to the conversation. Native modals retain their trap.
        const hud = host instanceof HTMLDialogElement ? null : document.querySelector<HTMLElement>('.game-hud:not([hidden])');
        setTopInset(hud ? Math.max(0, Math.min(innerHeight, hud.getBoundingClientRect().bottom)) : 0);
        setViewport(previous => previous.width === innerWidth && previous.height === innerHeight ? previous : { width: innerWidth, height: innerHeight });
    }
    const observer = new MutationObserver(records => { if (records.some(record => !(record.target instanceof Element && record.target.closest('.tutorial-coach')))) measure(); });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'disabled', 'open', 'data-camera', 'data-renderer'] });
    const resize = new ResizeObserver(measure);
    for (const element of document.querySelectorAll('.ui-scroll-region, .shop-grid, dialog[open], .game-workspace')) resize.observe(element);
    addEventListener('resize', measure); document.addEventListener('scroll', measure, true); document.addEventListener('load', measure, true); measure();
    return () => { observer.disconnect(); resize.disconnect(); removeEventListener('resize', measure); document.removeEventListener('scroll', measure, true); document.removeEventListener('load', measure, true); };
  }, [step.target, screen, host, game.fleet.length, game.airports.length]);
  function locate() {
    if (busy) return;
    if (step.id === 'done') { ignore(controller.command({ type: 'tutorial', action: 'finish' })); return; }
    setLocating(true);
    const current = target.current;
    if (step.id === 'dispatch' && current?.matches('[data-testid="map-canvas"]')) {
      current.dispatchEvent(new Event('guide-locate-airport'));
      current.querySelector('canvas')?.focus({ preventScroll: true });
    } else if (step.id === 'dispatch' && current?.matches('[data-testid="dispatch"]')) {
      current.focus({ preventScroll: true });
    } else if (host instanceof HTMLDialogElement && current) {
      const control = current.matches('button, input, select') ? current : current.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled), select:not(:disabled)');
      control?.focus({ preventScroll: true });
    } else {
      onLocate(step.screen);
      current?.focus({ preventScroll: true });
    }
  }
  const { width: w, height: h } = viewport;
  const hole = box ?? { x: 0, y: 0, width: 0, height: 0 };
  const cutTop = Math.max(topInset, hole.y), cutBottom = Math.max(cutTop, hole.y + hole.height);
  const masks = [
    { left: 0, top: topInset, width: w, height: cutTop - topInset },
    { left: 0, top: cutBottom, width: w, height: Math.max(0, h - cutBottom) },
    { left: 0, top: cutTop, width: hole.x, height: cutBottom - cutTop },
    { left: hole.x + hole.width, top: cutTop, width: Math.max(0, w - hole.x - hole.width), height: cutBottom - cutTop },
  ].filter(mask => mask.width > 0 && mask.height > 0);
  const top = !(host instanceof HTMLDialogElement) && hole.y > h * .5;
  const maskLabel = step.id === 'done' ? ui('完成引导') : ui('定位当前操作');
  return createPortal(<div ref={popover} popover="manual" className="tutorial-coach" data-testid="tutorial" data-step={step.id} style={{ width: w, height: h }}>
    {masks.map((style, index) => <button key={index} type="button" tabIndex={index === 0 ? 0 : -1} className="tutorial-mask" data-testid="tutorial-mask" aria-label={maskLabel} style={style} onClick={locate}/>)}
    {box && <div className={`tutorial-spotlight${locating ? ' is-locating' : ''}`} data-testid="tutorial-spotlight" style={{ left: hole.x, top: hole.y, width: hole.width, height: hole.height }}/>}
    <section className={`tutorial-conversation ${top ? 'is-top' : ''}`} role="region" aria-label={ui('起航引导')}>
      <div className="tutorial-dialogue"><img className="tutorial-portrait" src={artAsset('tutorial-guide-v1.png')} alt={locale === 'zh-CN' ? '运营教练林岚' : 'Operations coach Lin Lan'}/><div className="tutorial-speaker"><span>{locale === 'zh-CN' ? '运营教练 · 林岚' : 'Operations coach · Lin Lan'}</span><span>{step.number} / {GUIDE_STEPS}</span></div>
        <button type="button" className="guide-skip" disabled={busy} onClick={() => ignore(controller.command({ type: 'tutorial', action: 'skip' }))}>{ui('跳过引导')}</button>
        <h2 aria-live="polite">{ui(step.title)}</h2><p>{ui(step.text)}</p>
      </div>
    </section>
  </div>, host);
}
