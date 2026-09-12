import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Text } from 'pixi.js';
import { AIRPORTS, aircraftSpecs, airport } from '../core/catalog.js';
import type { GameState, Plane } from '../core/game.js';
import { arcPoints, fromVector, frontPolygon, frontSegment, globeCamera, greatCircle, projectGeo, rangePoints, screenPoint, toVector, viewVector, wrapLongitude, type GlobeCamera, type Vec3 } from './globe-geometry.js';
import { LAND_VERTICES, LAND_FACES } from './world-land.js';
import { previewDescription, type RoutePreview } from './route-preview.js';
import './globe.css';
import { passengerDestinationCounts, passengerDestinationKey } from './passenger-destinations.js';
interface Props { game: GameState; plane?: Plane; selected: string; onSelect: (id: string) => void; preview?: RoutePreview | null; showOthers: boolean; onToggleOthers: () => void }
const geography = new Map(AIRPORTS.map(a => [a.id, toVector(a)]));
const land = LAND_VERTICES.map(([lon, lat]) => toVector({ lon, lat }));
const arcCache = new Map<string, Vec3[]>();
function routeArc(from: string, to: string) {
  const key = `${from}-${to}`;
  let points = arcCache.get(key);
  if (!points) { points = arcPoints(airport(from), airport(to)); arcCache.set(key, points); }
  return points;
}
function aircraftPoint(p: Plane, time: number): Vec3 {
  const f = p.flight;
  return f ? greatCircle(geography.get(f.from)!, geography.get(f.to)!, (time - f.departAt) / (f.arriveAt - f.departAt)) : geography.get(p.airportId)!;
}
function path(graphics: Graphics, points: Vec3[], camera: GlobeCamera, color: number, width: number, alpha = 1, dashed = false) {
  for (let i = 1; i < points.length; i++) {
    if (dashed && i % 4 > 1) continue;
    const segment = frontSegment(viewVector(points[i - 1]!, camera), viewVector(points[i]!, camera));
    if (!segment) continue;
    const a = screenPoint(segment[0], camera), b = screenPoint(segment[1], camera);
    graphics.moveTo(a.x, a.y).lineTo(b.x, b.y);
  }
  graphics.stroke({ color, width, alpha });
}
export function MapView(props: Props) {
  const host = useRef<HTMLDivElement>(null), latest = useRef(props);
  const controls = useRef<{ zoom: (factor: number) => void } | null>(null);
  const [status, setStatus] = useState('loading');
  latest.current = props;
  useEffect(() => {
    const element = host.current!, app = new Application();
    let cancelled = false, initialized = false, dispose = () => {};
    void (async () => {
      try {
        await app.init({ backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio || 1, 2), autoDensity: true, preference: ['webgl'] });
        initialized = true;
        if (cancelled) { app.destroy(true, { children: true }); return; }
        const canvas = app.canvas as HTMLCanvasElement;
        canvas.setAttribute('role', 'img'); canvas.tabIndex = 0; element.appendChild(canvas);
        const ocean = new Graphics(), terrain = new Graphics(), grid = new Graphics(), lines = new Graphics(), range = new Graphics(), draft = new Graphics(), nodes = new Container(), aircraft = new Container();
        app.stage.addChild(ocean, terrain, grid, lines, range, draft, nodes, aircraft);
        app.stage.eventMode = 'none';
        const marks = new Map(AIRPORTS.map(a => {
          const group = new Container(), ring = new Graphics();
          const label = new Text({ text: a.city, style: { fontFamily: 'system-ui, sans-serif', fontSize: 15, fontWeight: '700', fill: 0xfff9de, stroke: { color: 0x133b4b, width: 3 } } });
          const detail = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontSize: 11, fill: 0xd0e6df, stroke: { color: 0x133b4b, width: 2 } } });
          const passengerBadge = new Graphics(), passengerText = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontSize: 11, fontWeight: '800', fill: 0x3f3300 } });
          passengerBadge.visible = passengerText.visible = false;
          group.addChild(ring, label, detail, passengerBadge, passengerText); nodes.addChild(group);
          return [a.id, { group, ring, label, detail, passengerBadge, passengerText }] as const;
        }));
        const planes = new Map<string, Graphics>();
        const initial = latest.current.plane;
        let camera = globeCamera(element.clientWidth, element.clientHeight, initial ? fromVector(aircraftPoint(initial, latest.current.game.simTime)) : airport(latest.current.selected));
        let dirty = true, lastGame: GameState | null = null, focused = latest.current.selected, lastPreview = '', lastOthers = true, snapshotAt = performance.now();
        const publishCamera = () => { element.dataset.camera = JSON.stringify(camera); dirty = true; };
        const zoom = (factor: number) => { camera.scale = Math.max(1, Math.min(6, camera.scale * factor)); publishCamera(); };
        const focusCurrent = () => {
          const p = latest.current.plane;
          if (!p) return;
          const point = fromVector(aircraftPoint(p, latest.current.game.simTime));
          camera.lat = point.lat; camera.lon = point.lon; publishCamera();
        };
        controls.current = { zoom };
        const observer = new ResizeObserver(() => {
          const w = element.clientWidth, h = element.clientHeight;
          if (w < 1 || h < 1) return;
          app.renderer.resize(w, h); camera = globeCamera(w, h, camera, camera.scale); publishCamera();
        });
        observer.observe(element);
        const pointers = new Map<number, { x: number; y: number }>();
        let dragged = false, multi = false, start = { x: 0, y: 0 }, last = start;
        const local = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
        const down = (e: PointerEvent) => {
          if (e.button !== 0) return;
          const p = local(e); pointers.set(e.pointerId, p); canvas.setPointerCapture(e.pointerId); canvas.focus({ preventScroll: true });
          if (pointers.size === 1) { start = last = p; dragged = multi = false; } else { multi = dragged = true; }
        };
        const move = (e: PointerEvent) => {
          if (!pointers.has(e.pointerId)) return;
          const p = local(e), before = [...pointers.values()]; pointers.set(e.pointerId, p);
          if (pointers.size === 2) {
            const after = [...pointers.values()], a = before[0]!, b = before[1]!, c = after[0]!, d = after[1]!;
            const previous = Math.hypot(a.x - b.x, a.y - b.y);
            if (previous > 5) zoom(Math.hypot(c.x - d.x, c.y - d.y) / previous);
            return;
          }
          if (Math.hypot(p.x - start.x, p.y - start.y) > 5) dragged = true;
          if (dragged && !multi) {
            const speed = 70 / (camera.radius * camera.scale);
            camera.lon = wrapLongitude(camera.lon - (p.x - last.x) * speed);
            camera.lat = Math.max(-90, Math.min(90, camera.lat + (p.y - last.y) * speed)); publishCamera();
          }
          last = p;
        };
        const up = (e: PointerEvent) => {
          if (!pointers.has(e.pointerId)) return;
          const p = local(e);
          if (!dragged && !multi && e.type === 'pointerup') {
            let hit: string | undefined, nearest = 22;
            for (const a of AIRPORTS) {
              const v = projectGeo(a, camera), distance = Math.hypot(p.x - v.x, p.y - v.y);
              if (v.visible && distance < nearest) { nearest = distance; hit = a.id; }
            }
            const current = latest.current.plane && planes.get(latest.current.plane.id);
            if (current?.visible && Math.hypot(p.x - current.x, p.y - current.y) < Math.min(16, nearest)) focusCurrent();
            else if (hit) latest.current.onSelect(hit);
          }
          pointers.delete(e.pointerId);
          if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
          if (pointers.size === 1) last = [...pointers.values()][0]!;
        };
        const wheel = (e: WheelEvent) => { e.preventDefault(); zoom(Math.exp(-e.deltaY * .001)); };
        const keydown = (e: KeyboardEvent) => {
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          if (e.key === 'Home') { e.preventDefault(); focusCurrent(); }
          else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            e.preventDefault(); camera.lon = wrapLongitude(camera.lon + (e.key === 'ArrowRight' ? 10 : e.key === 'ArrowLeft' ? -10 : 0));
            camera.lat = Math.max(-90, Math.min(90, camera.lat + (e.key === 'ArrowUp' ? 10 : e.key === 'ArrowDown' ? -10 : 0))); publishCamera();
          } else if (['+', '=', '-'].includes(e.key)) { e.preventDefault(); zoom(e.key === '-' ? .8 : 1.25); }
        };
        canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
        canvas.addEventListener('wheel', wheel, { passive: false }); canvas.addEventListener('keydown', keydown);
        function drawGlobe() {
          const { cx, cy } = camera, r = camera.radius * camera.scale;
          ocean.clear().circle(cx, cy, r + 10).fill({ color: 0x4eabc4, alpha: .08 }).circle(cx, cy, r + 4).fill({ color: 0x6fcad5, alpha: .15 });
          for (let i = 24; i >= 1; i--) {
            const t = 1 - i / 24, color = (Math.round(16 + t * 8) << 16) | (Math.round(63 + t * 43) << 8) | Math.round(86 + t * 39);
            ocean.circle(cx, cy, r * i / 24).fill(color);
          }
          terrain.clear();
          const projected = land.map(p => viewVector(p, camera));
          for (const face of LAND_FACES) {
            const vertices = face.map(i => projected[i]!);
            const clipped = frontPolygon(vertices);
            if (clipped.length < 3) continue;
            const brightness = Math.max(0, Math.min(1, vertices.reduce((n, v) => n + v.z * .75 - v.x * .2 + v.y * .2, 0) / 3));
            const color = (Math.round(70 + brightness * 67) << 16) | (Math.round(114 + brightness * 52) << 8) | Math.round(100 + brightness * 27);
            terrain.poly(clipped.flatMap(v => { const p = screenPoint(v, camera); return [p.x, p.y]; })).fill(color);
          }
          grid.clear();
          for (let lat = -60; lat <= 60; lat += 30) path(grid, Array.from({ length: 181 }, (_, i) => toVector({ lat, lon: i * 2 - 180 })), camera, 0xa4d8d8, 1, .13);
          for (let lon = -180; lon < 180; lon += 30) path(grid, Array.from({ length: 91 }, (_, i) => toVector({ lat: i * 2 - 90, lon })), camera, 0xa4d8d8, 1, .13);
          grid.circle(cx, cy, r).stroke({ color: 0x81c8d7, width: 1.5, alpha: .65 });
        }
        function drawNetwork() {
          const { game, selected, preview, plane } = latest.current;
          const owned = new Map(game.airports.map(a => [a.id, a.level]));
          lines.clear(); for (const route of game.routes) path(lines, routeArc(route.from, route.to), camera, 0xc2e2dd, 1.5, .28);
          range.clear(); const origin = preview?.legs.at(-1)?.to ?? plane?.airportId;
          if (plane && !plane.flight && origin) path(range, rangePoints(airport(origin), aircraftSpecs(plane).range), camera, 0xfae5a0, 1.5, .8, true);
          element.dataset.rangePlane = plane?.id ?? ''; element.dataset.rangeOrigin = origin ?? '';
          draft.clear();
          for (const leg of preview?.legs ?? []) {
            const color = leg.error ? 0xff8678 : 0xffdf64, points = routeArc(leg.from, leg.to);
            path(draft, points, camera, 0x133b4b, 7, .65, Boolean(leg.error)); path(draft, points, camera, color, 3, 1, Boolean(leg.error));
            const middle = Math.floor(points.length / 2), a = screenPoint(viewVector(points[middle]!, camera), camera), b = screenPoint(viewVector(points[middle + 1]!, camera), camera);
            if (a.visible && b.visible) { const angle = Math.atan2(b.y - a.y, b.x - a.x), c = Math.cos(angle), s = Math.sin(angle);
              draft.poly([a.x + c * 8, a.y + s * 8, a.x - c * 5 - s * 5, a.y - s * 5 + c * 5, a.x - c * 5 + s * 5, a.y - s * 5 - c * 5]).fill(color);
            }
          }
          if (plane?.flight) path(draft, routeArc(plane.flight.from, plane.flight.to), camera, 0xffdf64, 2.5, .85);
          const visits = new Map(preview?.visits.map(v => [v.airportId, v.numbers.join('/')]) ?? []);
          const passengers = passengerDestinationCounts(game, plane?.id);
          element.dataset.passengerDestinations = passengerDestinationKey(passengers);
          const priority = (id: string) => id === selected ? 0 : visits.has(id) ? 1 : passengers.has(id) ? 2 : id === plane?.airportId ? 3 : owned.has(id) ? 4 : 5;
          const occupied: { x: number; y: number; w: number; h: number }[] = [];
          const visible: string[] = [];
          for (const a of [...AIRPORTS].sort((a, b) => priority(a.id) - priority(b.id))) {
            const m = marks.get(a.id)!, p = projectGeo(a, camera), open = owned.has(a.id), active = selected === a.id;
            m.group.visible = p.visible && p.x > -12 && p.x < app.screen.width + 12 && p.y > -12 && p.y < app.screen.height + 12;
            if (!m.group.visible) continue;
            visible.push(a.id); m.group.position.set(p.x, p.y);
            m.ring.clear();
            if (active) m.ring.circle(0, 0, 12).stroke({ color: 0xffdf64, width: 2 });
            m.ring.circle(0, 0, open ? 5 : 3.5).fill(open ? 0xffefbb : 0xb1cbc9).stroke({ color: 0x153e51, width: 1.5 });
            m.label.text = `${visits.has(a.id) ? visits.get(a.id) + ' · ' : ''}${a.city}`;
            m.detail.text = open ? `${owned.get(a.id)}级` : '未解锁';
            const passengerCount = passengers.get(a.id) ?? 0;
            m.passengerText.text = `乘客 ${passengerCount}`;
            m.passengerBadge.clear();
            const w = Math.max(m.label.width, m.detail.width, passengerCount ? m.passengerText.width + 10 : 0) + 8, h = passengerCount ? 57 : 35;
            let placed = false;
            for (const [dx, dy] of [[12, -20], [-w - 10, -20], [-w / 2, -h - 9], [-w / 2, 12]]) {
              const box = { x: p.x + dx!, y: p.y + dy!, w, h };
              if (box.x < 5 || box.x + w > app.screen.width - 5 || box.y < 5 || box.y + h > app.screen.height - (app.screen.height < 600 ? 83 : 115)) continue;
              if (occupied.some(b => box.x < b.x + b.w + 4 && box.x + w + 4 > b.x && box.y < b.y + b.h + 3 && box.y + h + 3 > b.y)) continue;
              m.label.position.set(dx!, dy!); m.detail.position.set(dx!, dy! + 20);
              if (passengerCount) {
                m.passengerBadge.roundRect(dx!, dy! + 36, m.passengerText.width + 10, 18, 4).fill(0xffe565).stroke({ color: 0x765618, width: 1 });
                m.passengerText.position.set(dx! + 5, dy! + 37);
              }
              occupied.push(box); placed = true; break;
            }
            m.label.visible = m.detail.visible = placed;
            m.passengerBadge.visible = m.passengerText.visible = placed && passengerCount > 0;
          }
          element.dataset.visibleAirports = visible.join(',');
          element.dataset.previewPath = (preview?.legs ?? []).map(l => l.to).join(',');
          canvas.setAttribute('aria-label', `球形机场航线示意图，当前选择${airport(selected).city}。拖动旋转，双指缩放；方向键旋转，Home定位飞机。`);
        }
        app.ticker.maxFPS = 30;
        app.ticker.add(() => {
          const { game, selected, preview, showOthers } = latest.current;
          const previewKey = JSON.stringify(preview ?? null), gameChanged = lastGame !== game;
          if (focused !== selected) { focused = selected; const a = airport(selected); camera.lat = a.lat; camera.lon = a.lon; publishCamera(); }
          if (gameChanged) { lastGame = game; snapshotAt = performance.now(); }
          if (dirty) drawGlobe();
          if (dirty || gameChanged || previewKey !== lastPreview || lastOthers !== showOthers) drawNetwork();
          dirty = false; lastPreview = previewKey; lastOthers = showOthers;
          const visualTime = game.simTime + Math.min(1, Math.max(0, (performance.now() - snapshotAt) / 1000));
          for (const p of game.fleet) {
            let g = planes.get(p.id);
            if (!g) { g = new Graphics().poly([12, 0, -8, -6, -4, 0, -8, 6]).fill(0xfff2c1).stroke({ color: 0x153e51, width: 1.5 }); aircraft.addChild(g); planes.set(p.id, g); }
            const v = screenPoint(viewVector(aircraftPoint(p, visualTime), camera), camera);
            g.visible = v.visible && (p.id === latest.current.plane?.id || (showOthers && Boolean(p.flight)));
            g.position.set(v.x, v.y - (p.flight ? 0 : 23));
            if (p.flight) { const next = screenPoint(viewVector(aircraftPoint(p, visualTime + .5), camera), camera); g.rotation = Math.atan2(next.y - v.y, next.x - v.x); }
            else g.rotation = -Math.PI / 2;
          }
          for (const [id, g] of planes) if (!game.fleet.some(p => p.id === id)) { g.destroy(); planes.delete(id); }
          element.dataset.visiblePlanes = [...planes].filter(([, g]) => g.visible).map(([id]) => id).join(',');
        });
        publishCamera();
        dispose = () => {
          controls.current = null; observer.disconnect(); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
          canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('keydown', keydown);
        };
        setStatus('ready');
      } catch { if (!cancelled) setStatus('fallback'); }
    })();
    return () => { cancelled = true; dispose(); if (initialized && !app.stage.destroyed) app.destroy(true, { children: true }); };
  }, []);
  return <section className="map-area globe-area" aria-label="航线地图" aria-describedby="route-preview-description">
    <div className="map-canvas" ref={host} data-testid="map-canvas" data-projection="orthographic" data-renderer={status}/>
    <p id="route-preview-description" className="sr-only" data-testid="route-preview" data-legs={props.preview?.legs.length ?? 0}>{previewDescription(props.preview)}</p>
    {status === 'fallback' && <div className="map-fallback" role="status">地图不可用，请点击顶部「目的地」搜索全球机场并选择城市。</div>}
    <div className="globe-hint" aria-hidden="true"><strong>全球航网</strong><span>拖动旋转 · 双指缩放</span></div>
    <button className="map-plane-toggle" aria-label={props.showOthers ? '隐藏其他飞机' : '显示其他飞机'} aria-pressed={!props.showOthers} onClick={props.onToggleOthers}><span>{props.showOthers ? '隐藏' : '显示'}</span><strong>其他飞机</strong></button>
    <div className="map-controls"><button className="map-zoom-in" aria-label="放大地图" disabled={status !== 'ready'} onClick={() => controls.current?.zoom(1.25)}><span aria-hidden="true">＋</span></button><button className="map-zoom-out" aria-label="缩小地图" disabled={status !== 'ready'} onClick={() => controls.current?.zoom(.8)}><span aria-hidden="true">−</span></button></div>
    <small className="map-disclaimer">游戏示意图 · 非导航地图</small>
  </section>;
}
