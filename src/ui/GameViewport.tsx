import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { DEFAULT_UI_SCALE, UI_SCALE_KEY, normalizeUiScale, parseUiScale, viewportLayout } from './viewport.js';

interface ViewportValue {
  width: number; height: number; scale: number; uiScale: number;
  setUiScale: (value: number) => void; storageWarning: string;
}
const ViewportContext = createContext<ViewportValue | null>(null);
export function useGameViewport() {
  const value = useContext(ViewportContext);
  if (!value) throw new Error('GameViewport provider is required');
  return value;
}
function savedScale() {
  try { return parseUiScale(localStorage.getItem(UI_SCALE_KEY)); } catch { return DEFAULT_UI_SCALE; }
}
export function GameViewport({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const [uiScale, setScale] = useState(savedScale);
  const [storageWarning, setStorageWarning] = useState('');
  const [bounds, setBounds] = useState({ width: window.innerWidth, height: window.innerHeight, left: 0, top: 0 });
  const layout = viewportLayout(bounds.width, bounds.height, uiScale);
  useLayoutEffect(() => {
    const element = frame.current!;
    const measure = () => {
      const r = element.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      setBounds(old => old.width === r.width && old.height === r.height && old.left === r.left && old.top === r.top
        ? old : { width: r.width, height: r.height, left: r.left, top: r.top });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element); window.addEventListener('resize', measure); measure();
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  // Changing only the physical viewport need not resize the logical map element.
  useLayoutEffect(() => { window.dispatchEvent(new Event('gameviewportchange')); }, [bounds, uiScale]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === UI_SCALE_KEY || event.key === null) {
        setScale(savedScale()); setStorageWarning('');
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const setUiScale = (value: number) => {
    const next = normalizeUiScale(value); setScale(next);
    try { localStorage.setItem(UI_SCALE_KEY, String(next)); setStorageWarning(''); }
    catch { setStorageWarning('浏览器无法保存显示偏好；本次缩放仍然生效。'); }
  };
  const style = {
    width: `${layout.width}px`, height: `${layout.height}px`, transform: `scale(${layout.scale})`,
    '--game-width': `${layout.width}px`, '--game-height': `${layout.height}px`,
    '--game-vw': `${layout.width / 100}px`, '--game-vh': `${layout.height / 100}px`,
    '--game-vmin': `${Math.min(layout.width, layout.height) / 100}px`, '--game-vmax': `${Math.max(layout.width, layout.height) / 100}px`,
    '--game-scale': layout.scale,
    '--game-center-x': `${bounds.left + bounds.width / 2}px`, '--game-center-y': `${bounds.top + bounds.height / 2}px`,
  } as CSSProperties;
  return <ViewportContext.Provider value={{ ...layout, uiScale, setUiScale, storageWarning }}>
    <div ref={frame} className="game-screen"><div className="game-layout" data-testid="game-layout" data-ui-scale={uiScale} data-screen-scale={layout.scale} style={style}>{children}</div></div>
  </ViewportContext.Provider>;
}
