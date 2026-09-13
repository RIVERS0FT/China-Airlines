import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { viewportLayout } from './game-viewport.js';
import { useUiPreferences } from './ui-preferences.js';

/** Screen normalization and user zoom are separate: zoom cannot trigger legacy
 * phone breakpoints that would make a larger UI setting shrink its controls. */
export function GameViewport({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const uiScale = useUiPreferences(state => state.uiScale);
  useLayoutEffect(() => {
    const stage = ref.current!, host = stage.parentElement!;
    const measure = () => {
      const width = host.clientWidth, height = host.clientHeight;
      // A hidden browser/PWA can briefly have a zero-sized viewport.
      if (width <= 0 || height <= 0) return;
      const base = viewportLayout(width, height);
      const layout = viewportLayout(width, height, uiScale);
      for (const [name, value] of Object.entries({
        'layout-width': base.width, 'layout-height': base.height,
        width: layout.width, height: layout.height,
        vw: layout.width / 100, vh: layout.height / 100,
        vmin: Math.min(layout.width, layout.height) / 100,
        vmax: Math.max(layout.width, layout.height) / 100,
      })) stage.style.setProperty(`--game-${name}`, `${value}px`);
      stage.style.setProperty('--viewport-scale', String(base.scale));
      stage.style.setProperty('--ui-scale', String(uiScale));
      stage.style.setProperty('--game-scale', String(layout.scale));
      stage.dataset.scale = String(layout.scale);
      stage.dataset.uiScale = String(uiScale);
      stage.dataset.layoutWidth = String(layout.width);
      stage.dataset.layoutHeight = String(layout.height);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [uiScale]);
  return <div ref={ref} className="game-viewport" data-testid="game-viewport"><div className="game-ui">{children}</div></div>;
}
