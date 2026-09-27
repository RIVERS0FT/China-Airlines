import { clientToLogical } from './viewport.js';
import { canPlaceMapLabel, clientBoxToMap, type MapBox } from './map-label-layout.js';
import { retargetMapLabel, sampleMapLabel, type MapLabelMotion } from './map-label-motion.js';
import { useEffect, useRef, useState } from 'react';
import { Application, Assets, Container, Graphics, Matrix, Sprite, Text, Texture, Ticker } from 'pixi.js';
import { AIRPORTS, aircraftSpecs, airport } from '../core/catalog.js';
import type { GameState, Plane } from '../core/game.js';
import { arcPoints, fromVector, frontPolygon, frontSegment, globeCamera, projectGeo, rangePoints, screenPoint, toVector, viewVector, wrapLongitude, type GlobeCamera, type Vec3 } from './globe-geometry.js';
import { LAND_VERTICES, LAND_FACES } from './world-land.js';
import { boundaryEdges, oceanTone, terrainTone } from './globe-art.js';
import { drawGlobeAtmosphere } from './globe-atmosphere.js';
import { previewDescription, type RoutePreview } from './route-preview.js';
import './globe.css';
import { passengerDestinationCounts, passengerDestinationKey } from './passenger-destinations.js';
import { useI18n } from '../i18n/I18n.js';
import { artAsset } from './art-assets.js';
import { MAP_AIRCRAFT_ART, aircraftSurfacePoint, mapAircraftSize, projectMapAircraft, shouldShowMapAircraft } from './map-aircraft.js';
interface Props { planning: boolean; game: GameState; plane?: Plane; selected: string; onSelect: (id: string) => void; onOpenCities: () => void; preview?: RoutePreview | null; showOthers: boolean; onToggleOthers: () => void }
const land = LAND_VERTICES.map(([lon, lat]) => toVector({ lon, lat }));
const landCoastEdges = boundaryEdges(LAND_FACES);
const arcCache = new Map<string, Vec3[]>();
function routeArc(from: string, to: string) {
  const key = `${from}-${to}`;
  let points = arcCache.get(key);
  if (!points) { points = arcPoints(airport(from), airport(to)); arcCache.set(key, points); }
  return points;
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
  const i18n = useI18n();
  const host = useRef<HTMLDivElement>(null), latest = useRef(props);
  const latestI18n = useRef(i18n);
  const [status, setStatus] = useState('loading');
  latest.current = props;
  latestI18n.current = i18n;
  useEffect(() => {
    const element = host.current!, app = new Application();
    let cancelled = false, initialized = false, dispose = () => {};
    void (async () => {
      try {
        await app.init({ autoStart: false, sharedTicker: false, backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio || 1, 2), autoDensity: true, preference: ['webgl'] });
        initialized = true;
        if (cancelled) { app.destroy(true, { children: true }); return; }
        const canvas = app.canvas as HTMLCanvasElement;
        canvas.setAttribute('role', 'img'); canvas.tabIndex = 0; element.appendChild(canvas);
        const ocean = new Graphics(), terrain = new Graphics(), coastShadow = new Graphics(), coast = new Graphics(), grid = new Graphics(), atmosphere = new Graphics();
        const lines = new Graphics(), range = new Graphics(), draft = new Graphics(), nodes = new Container(), aircraft = new Container();
        app.stage.addChild(ocean, terrain, coastShadow, coast, grid, atmosphere, lines, range, draft, nodes, aircraft);
        app.stage.eventMode = 'none';
        const marks = new Map(AIRPORTS.map(a => {
          const group = new Container(), labelGroup = new Container(), ring = new Graphics();
          const label = new Text({ text: latestI18n.current.airportName(a.id, a.city), style: { fontFamily: 'system-ui, sans-serif', fontSize: 15, fontWeight: '700', fill: 0xfff9de, stroke: { color: 0x133b4b, width: 3 } } });
          const detail = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontSize: 11, fill: 0xd0e6df, stroke: { color: 0x133b4b, width: 2 } } });
          const passengerBadge = new Graphics(), passengerText = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontSize: 11, fontWeight: '800', fill: 0x3f3300 } });
          passengerBadge.visible = passengerText.visible = false;
          labelGroup.addChild(label, detail, passengerBadge, passengerText); group.addChild(ring, labelGroup); nodes.addChild(group);
          return [a.id, { group, labelGroup, ring, label, detail, passengerBadge, passengerText }] as const;
        }));
        const labelMotions = new Map<string, MapLabelMotion>();
        let labelsAnimating = false;
        const planes = new Map<string, Sprite>();
        let planeTexture: Texture | undefined;
        try {
          // The large source is displayed as a small, rotated icon: filter across mip levels, not just adjacent texels.
          planeTexture = await Assets.load<Texture>({
            src: artAsset(MAP_AIRCRAFT_ART), data: { autoGenerateMipmaps: true, scaleMode: 'linear' },
          });
        }
        catch { /* Aircraft artwork failure must leave the globe and route controls usable. */ }
        const planeMatrix = new Matrix();
        const planeScale = planeTexture ? mapAircraftSize(planeTexture.width, planeTexture.height).height / planeTexture.height : 1;
        if (cancelled) { app.destroy(true, { children: true }); return; }
        const initial = latest.current.plane;
        const firstRoute = latest.current.planning && latest.current.game.tutorial === 'active' && latest.current.game.stats.flights === 0 && !initial?.flight;
        let camera = globeCamera(element.clientWidth, element.clientHeight, firstRoute ? airport('PVG') : initial ? fromVector(aircraftSurfacePoint(initial, latest.current.game.simTime)) : airport(latest.current.selected), firstRoute ? 3 : 1);
        let dirty = true, lastGame: GameState | null = null, focused = latest.current.selected, lastPreview = '', lastOthers = true, lastPlaneId = latest.current.plane?.id, snapshotAt = performance.now();
        const publishCamera = () => { element.dataset.camera = JSON.stringify(camera); dirty = true; };
        const locateGuideAirport = () => {
          if (!latest.current.planning || latest.current.game.tutorial !== 'active') return;
          const city = airport('PVG');
          camera.lat = city.lat; camera.lon = city.lon; camera.scale = Math.max(3, camera.scale); publishCamera();
        };
        element.addEventListener('guide-locate-airport', locateGuideAirport);
        const zoom = (factor: number) => { camera.scale = Math.max(1, Math.min(6, camera.scale * factor)); publishCamera(); };
        const focusCurrent = () => {
          const p = latest.current.plane;
          if (!p) return;
          const point = fromVector(aircraftSurfacePoint(p, latest.current.game.simTime));
          camera.lat = point.lat; camera.lon = point.lon; publishCamera();
        };
        // Only painted overlays exclude labels. Empty dock space is still map.
        const overlayElements = latest.current.planning ? [] : [...(element.closest('.aviation-game')?.querySelectorAll<HTMLElement>(
          '.game-dock > button'
        ) ?? [])];
        let labelExclusions: MapBox[] = [];
        const resize = () => {
          const w = element.clientWidth, h = element.clientHeight;
          if (w < 1 || h < 1) return;
          const bounds = element.getBoundingClientRect();
          labelExclusions = overlayElements.filter(node => node.isConnected && node.getClientRects().length > 0)
            .map(node => clientBoxToMap(node.getBoundingClientRect(), bounds, w, h));
          const screenScale = bounds.width / w;
          const resolution = Math.max(.5, Math.min((window.devicePixelRatio || 1) * screenScale, 3));
          app.renderer.resize(w, h, resolution); camera = globeCamera(w, h, camera, camera.scale); publishCamera();
        };
        const observer = new ResizeObserver(resize);
        window.addEventListener('gameviewportchange', resize);
        window.addEventListener('resize', resize);
        observer.observe(element);
        overlayElements.forEach(node => observer.observe(node));
        const dock = element.closest('.aviation-game')?.querySelector('.game-dock');
        if (dock && !latest.current.planning) observer.observe(dock);
        const pointers = new Map<number, { x: number; y: number }>();
        let dragged = false, multi = false, start = { x: 0, y: 0 }, last = start;
        const local = (e: PointerEvent) => clientToLogical(e.clientX, e.clientY, canvas.getBoundingClientRect(), element.clientWidth, element.clientHeight);
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
            const visibleIds = element.dataset.visiblePlanes?.split(',') ?? [];
            if (current && visibleIds.includes(latest.current.plane!.id) && Math.hypot(p.x - current.x, p.y - current.y) < Math.min(16, nearest)) focusCurrent();
            else if (hit) latest.current.onSelect(hit);
          }
          pointers.delete(e.pointerId);
          if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
          if (pointers.size === 1) last = [...pointers.values()][0]!;
        };
        // Pointer events already handle taps and drags. Suppress a second synthesized
        // mouse click, which can be adjusted onto a nearby floating navigation button.
        const suppressTouchMouse = (event: TouchEvent) => { if (event.cancelable) event.preventDefault(); };
        const wheel = (e: WheelEvent) => { e.preventDefault(); zoom(Math.exp(-e.deltaY * .001)); };
        const keydown = (e: KeyboardEvent) => {
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          if (e.key === 'Home') { e.preventDefault(); focusCurrent(); }
          else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            e.preventDefault(); camera.lon = wrapLongitude(camera.lon + (e.key === 'ArrowRight' ? 10 : e.key === 'ArrowLeft' ? -10 : 0));
            camera.lat = Math.max(-90, Math.min(90, camera.lat + (e.key === 'ArrowUp' ? 10 : e.key === 'ArrowDown' ? -10 : 0))); publishCamera();
          } else if (['+', '=', '-'].includes(e.key)) { e.preventDefault(); zoom(e.key === '-' ? .8 : 1.25); }
          else if (e.key === 'Enter') { e.preventDefault(); latest.current.onOpenCities(); }
        };
        canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
        canvas.addEventListener('touchstart', suppressTouchMouse, { passive: false });
        canvas.addEventListener('wheel', wheel, { passive: false }); canvas.addEventListener('keydown', keydown);
        function drawGlobe() {
          const { cx, cy } = camera, r = camera.radius * camera.scale;
          ocean.clear().circle(cx, cy, r + 13).fill({ color: 0x59d4df, alpha: .055 }).circle(cx, cy, r + 7).fill({ color: 0x68d4de, alpha: .12 });
          for (let i = 36; i >= 1; i--) {
            const t = 1 - i / 36;
            ocean.circle(cx, cy, r * i / 36).fill(oceanTone(.12 + t * .78));
          }
          terrain.clear();
          const projected = land.map(p => viewVector(p, camera));
          for (const face of LAND_FACES) {
            const vertices = face.map(i => projected[i]!);
            const clipped = frontPolygon(vertices);
            if (clipped.length < 3) continue;
            const brightness = Math.max(0, Math.min(1, vertices.reduce((n, v) => n + .2 + v.z * .62 - v.x * .24 + v.y * .12, 0) / 3));
            terrain.poly(clipped.flatMap(v => { const p = screenPoint(v, camera); return [p.x, p.y]; })).fill(terrainTone(brightness));
          }
          coastShadow.clear(); coast.clear();
          let visibleCoastEdges = 0;
          for (const [from, to] of landCoastEdges) {
            const segment = frontSegment(projected[from]!, projected[to]!);
            if (!segment) continue;
            const a = screenPoint(segment[0], camera), b = screenPoint(segment[1], camera);
            coastShadow.moveTo(a.x, a.y).lineTo(b.x, b.y);
            coast.moveTo(a.x, a.y).lineTo(b.x, b.y);
            visibleCoastEdges += 1;
          }
          coastShadow.stroke({ color: 0x123b42, width: 3, alpha: .58 });
          coast.stroke({ color: 0xc7d994, width: 1, alpha: .68 });
          grid.clear();
          for (let lat = -60; lat <= 60; lat += 30) path(grid, Array.from({ length: 181 }, (_, i) => toVector({ lat, lon: i * 2 - 180 })), camera, lat === 0 ? 0xb8e1dc : 0x9acbcc, lat === 0 ? 1.25 : .8, lat === 0 ? .23 : .12);
          for (let lon = -180; lon < 180; lon += 30) path(grid, Array.from({ length: 91 }, (_, i) => toVector({ lat: i * 2 - 90, lon })), camera, 0x9acbcc, .8, .12);
          drawGlobeAtmosphere(atmosphere.context, cx, cy, r);
          element.dataset.coastlineSegments = String(visibleCoastEdges);
        }
        const labelHeight = () => latest.current.planning ? app.screen.height - (app.screen.height < 600 ? 78 : 110) : app.screen.height;
        function drawNetwork(nowMs: number) {
          const { game, selected, preview, plane, planning } = latest.current;
          const owned = new Map(game.airports.map(a => [a.id, a.level]));
          lines.clear(); for (const route of game.routes) path(lines, routeArc(route.from, route.to), camera, 0xc2e2dd, 1.5, .28);
          range.clear(); const origin = planning ? preview?.legs.at(-1)?.to ?? plane?.airportId : undefined;
          if (plane && !plane.flight && origin) path(range, rangePoints(airport(origin), aircraftSpecs(plane).range), camera, 0xfae5a0, 1.5, .8, true);
          element.dataset.rangePlane = planning ? plane?.id ?? '' : ''; element.dataset.rangeOrigin = origin ?? '';
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
          const passengers = passengerDestinationCounts(game, planning ? plane?.id : undefined);
          element.dataset.passengerDestinations = passengerDestinationKey(passengers);
          const priority = (id: string) => id === selected ? 0 : visits.has(id) ? 1 : passengers.has(id) ? 2 : id === plane?.airportId ? 3 : owned.has(id) ? 4 : 5;
          const occupied: MapBox[] = [];
          const labels: (MapBox & { id: string })[] = [];
          // Dispatch retains space for its route console; browsing has no bottom strip.
          const visible: string[] = [];
          for (const a of [...AIRPORTS].sort((a, b) => priority(a.id) - priority(b.id))) {
            const m = marks.get(a.id)!, p = projectGeo(a, camera), open = owned.has(a.id), active = selected === a.id;
            m.group.visible = p.visible && p.x > -12 && p.x < app.screen.width + 12 && p.y > -12 && p.y < app.screen.height + 12;
            if (!m.group.visible) { m.labelGroup.visible = false; labelMotions.delete(a.id); continue; }
            visible.push(a.id); m.group.position.set(p.x, p.y);
            m.ring.clear();
            if (active) m.ring.circle(0, 0, 12).stroke({ color: 0xffdf64, width: 2 });
            m.ring.circle(0, 0, open ? 5 : 3.5).fill(open ? 0xffefbb : 0xb1cbc9).stroke({ color: 0x153e51, width: 1.5 });
            m.label.text = `${visits.has(a.id) ? visits.get(a.id) + ' · ' : ''}${latestI18n.current.airportName(a.id, a.city)}`;
            m.detail.text = open ? latestI18n.current.t('common.level', { value:owned.get(a.id)! }) : latestI18n.current.t('map.locked');
            const passengerCount = passengers.get(a.id) ?? 0;
            m.passengerText.text = latestI18n.current.t('map.passengerBadge', { count:passengerCount });
            m.passengerBadge.clear();
            const w = Math.max(m.label.width, m.detail.width, passengerCount ? m.passengerText.width + 10 : 0) + 8, h = passengerCount ? 57 : 35;
            let placed = false;
            for (const [dx, dy] of [[12, -20], [-w - 10, -20], [-w / 2, -h - 9], [-w / 2, 12]]) {
              const box = { x: p.x + dx!, y: p.y + dy!, w, h };
              if (!canPlaceMapLabel(box, app.screen.width, labelHeight(), labelExclusions, occupied)) continue;
              // Follow the airport immediately; only a change of label placement needs easing.
              const offset = { x: dx!, y: dy!, w, h };
              labelMotions.set(a.id, retargetMapLabel(labelMotions.get(a.id), offset, nowMs, reducedMotion.matches));
              m.label.position.set(0, 0); m.detail.position.set(0, 20);
              if (passengerCount) {
                m.passengerBadge.roundRect(0, 36, m.passengerText.width + 10, 18, 4).fill(0xffe565).stroke({ color: 0x765618, width: 1 });
                m.passengerText.position.set(5, 37);
              }
              occupied.push(box); labels.push({ id: a.id, ...box }); placed = true; break;
            }
            m.labelGroup.visible = placed;
            if (!placed) labelMotions.delete(a.id);
            m.passengerBadge.visible = m.passengerText.visible = placed && passengerCount > 0;
          }
          element.dataset.visibleAirports = visible.join(',');
          element.dataset.labelTargets = JSON.stringify(labels);
          element.dataset.labelExclusions = JSON.stringify(labelExclusions);
          element.dataset.previewPath = (preview?.legs ?? []).map(l => l.to).join(',');
          canvas.setAttribute('aria-label', latestI18n.current.t('map.globeA11y', { city:latestI18n.current.airportName(selected, airport(selected).city) }));
        }
        function paintLabels(nowMs: number): boolean {
          const painted: (MapBox & { id: string })[] = [];
          let moving = false;
          for (const [id, motion] of labelMotions) {
            const mark = marks.get(id)!;
            let sample = sampleMapLabel(motion, nowMs, reducedMotion.matches);
            let box = { ...sample.box, x: mark.group.x + sample.box.x, y: mark.group.y + sample.box.y };
            // Never sweep a moving label over navigation or outside the viewport.
            if (!canPlaceMapLabel(box, app.screen.width, labelHeight(), labelExclusions, [])) {
              const safe = retargetMapLabel(undefined, motion.target, nowMs);
              labelMotions.set(id, safe); sample = sampleMapLabel(safe, nowMs);
              box = { ...sample.box, x: mark.group.x + sample.box.x, y: mark.group.y + sample.box.y };
            }
            mark.labelGroup.position.set(sample.box.x, sample.box.y);
            painted.push({ id, ...box }); moving ||= sample.active;
          }
          element.dataset.labelBoxes = JSON.stringify(painted);
          element.dataset.labelsAnimating = String(moving);
          element.dataset.labelTime = String(nowMs);
          return moving;
        }
        // The application renderer is demand-driven. A quiet airport must not
        // repaint a full sphere 30 times a second while the user reads a dialog.
        // Keep a lightweight private ticker for coalescing touch and snapshot updates.
        const renderLoop = new Ticker();
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const motionChanged = () => { dirty = true; };
        reducedMotion.addEventListener('change', motionChanged);
        let networkKey = '', lastLocale = latestI18n.current.locale, frames = 0, lastVisualTime = -1;
        renderLoop.maxFPS = 30;
        renderLoop.add(() => {
          const nowMs = performance.now();
          const { game, selected, preview, showOthers } = latest.current;
          const previewKey = JSON.stringify(preview ?? null), gameChanged = lastGame !== game;
          if (focused !== selected) { focused = selected; const a = airport(selected); camera.lat = a.lat; camera.lon = a.lon; publishCamera(); }
          const nextNetworkKey = gameChanged ? JSON.stringify([game.airports, game.routes, game.fleet,
            passengerDestinationKey(passengerDestinationCounts(game, latest.current.plane?.id))]) : networkKey;
          const localeChanged = lastLocale !== latestI18n.current.locale;
          const repaint = dirty || localeChanged || nextNetworkKey !== networkKey || previewKey !== lastPreview || lastOthers !== showOthers || lastPlaneId !== latest.current.plane?.id;
          if (gameChanged) { lastGame = game; snapshotAt = performance.now(); }
          if (dirty) drawGlobe();
          if (repaint) drawNetwork(nowMs);
          const labelFrame = repaint || labelsAnimating;
          if (labelFrame) labelsAnimating = paintLabels(nowMs);
          dirty = false; lastPreview = previewKey; lastOthers = showOthers; lastPlaneId = latest.current.plane?.id; lastLocale = latestI18n.current.locale; networkKey = nextNetworkKey;
          const animating = !reducedMotion.matches && game.fleet.some(p => shouldShowMapAircraft(p, latest.current.plane?.id, showOthers)
            && screenPoint(viewVector(aircraftSurfacePoint(p, game.simTime), camera), camera).visible);
          const snapshotStep = reducedMotion.matches && game.simTime !== lastVisualTime
            && game.fleet.some(p => shouldShowMapAircraft(p, latest.current.plane?.id, showOthers));
          if (!repaint && !animating && !snapshotStep && !labelFrame) return;
          const visualTime = game.simTime + (reducedMotion.matches ? 0 : Math.min(1, Math.max(0, (performance.now() - snapshotAt) / 1000)));
          lastVisualTime = game.simTime;
          for (const p of game.fleet) {
            let g = planes.get(p.id);
            if (!g && planeTexture) {
              g = new Sprite({ texture: planeTexture, anchor: .5, label: MAP_AIRCRAFT_ART });
              aircraft.addChild(g); planes.set(p.id, g);
            }
            if (!g) continue;
            const projected = projectMapAircraft(p, visualTime, camera);
            g.visible = projected.visible && shouldShowMapAircraft(p, latest.current.plane?.id, showOthers);
            const { a, b, c, d } = projected.transform;
            g.setFromMatrix(planeMatrix.set(a * planeScale, b * planeScale, c * planeScale, d * planeScale, projected.x, projected.y));
            g.updateLocalTransform();
            g.tint = p.id === latest.current.plane?.id ? 0xfff2d5 : 0xffffff;
          }
          for (const [id, g] of planes) if (!game.fleet.some(p => p.id === id)) { g.destroy(); planes.delete(id); }
          element.dataset.visiblePlanes = [...planes].filter(([, g]) => g.visible).map(([id]) => id).join(',');
          element.dataset.visiblePlaneModels = [...planes].filter(([, g]) => g.visible).map(([id, g]) => `${id}:${g.label}`).join(',');
          element.dataset.planeMarkers = JSON.stringify([...planes].filter(([, g]) => g.visible).map(([id, g]) => {
            const m = g.localTransform;
            const transform = { a: m.a / planeScale, b: m.b / planeScale, c: m.c / planeScale, d: m.d / planeScale };
            return { id, x: g.x, y: g.y, transform,
              rotation: Math.hypot(transform.c, transform.d) < 1e-8 ? 0 : Math.atan2(-transform.c, transform.d),
              flipX: false, width: g.width, height: g.height };
          }));
          app.render();
          element.dataset.renderCount = String(++frames);
          element.dataset.aircraftTime = String(visualTime);
        });
        renderLoop.start();
        publishCamera();
        dispose = () => {
          reducedMotion.removeEventListener('change', motionChanged);
          window.removeEventListener('gameviewportchange', resize); window.removeEventListener('resize', resize);
          element.removeEventListener('guide-locate-airport', locateGuideAirport);
          renderLoop.destroy(); observer.disconnect(); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
          canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('touchstart', suppressTouchMouse); canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('keydown', keydown);
        };
        setStatus('ready');
        element.dataset.aircraftStatus = planeTexture ? 'ready' : 'partial';
      } catch { if (!cancelled) setStatus('fallback'); }
    })();
    return () => { cancelled = true; dispose(); if (initialized && !app.stage.destroyed) app.destroy(true, { children: true }); };
  }, []);
  return <section className="map-area globe-area" aria-label={props.planning ? i18n.t('map.routeMap') : i18n.t('map.map')} aria-describedby={props.planning ? "route-preview-description" : undefined}>
    <div className="map-canvas" ref={host} data-testid="map-canvas" data-projection="orthographic" data-art-version="2" data-route-visual="great-circle" data-aircraft-visual="sprite" data-renderer={status}/>
    {props.planning && <p id="route-preview-description" className="sr-only" data-testid="route-preview" data-legs={props.preview?.legs.length ?? 0}>{previewDescription(props.preview)}</p>}
    {status === 'fallback' && <div className="map-fallback" role="status"><p>{i18n.t(props.planning ? 'map.fallbackPlan' : 'map.fallbackBrowse')}</p><button type="button" aria-haspopup="dialog" onClick={props.onOpenCities}>{i18n.t('map.selectCity')}</button></div>}
    {props.planning && <button className="map-plane-toggle" aria-label={props.showOthers ? i18n.t('map.hideOthers') : i18n.t('map.showOthers')} aria-pressed={!props.showOthers} onClick={props.onToggleOthers}><span>{props.showOthers ? i18n.t('map.hide') : i18n.t('map.show')}</span><strong>{i18n.t('map.otherAircraft')}</strong></button>}
  </section>;
}
