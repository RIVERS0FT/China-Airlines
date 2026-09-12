import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Text } from 'pixi.js';
import { AIRPORTS, aircraftSpecs, airport } from '../core/catalog.js';
import type { GameState, Plane } from '../core/game.js';
import { mapLayout, MIN_MAP_SCALE } from './map-camera.js';
import './map-readability.css';
import { passengerDestinationCounts, passengerDestinationKey } from './passenger-destinations.js';
import { previewDescription, type RoutePreview } from './route-preview.js';
interface Props { game: GameState; plane?: Plane; selected: string; onSelect: (id: string) => void; preview?: RoutePreview | null; showOthers: boolean; onToggleOthers: () => void }
function curve(from: string, to: string, t: number) {
  const a = airport(from), b = airport(to), cx = (a.x + b.x) / 2, cy = Math.min(a.y, b.y) - Math.min(100, Math.abs(b.x - a.x) * 0.2 + 35);
  return { x: (1-t)**2*a.x + 2*(1-t)*t*cx + t*t*b.x, y: (1-t)**2*a.y + 2*(1-t)*t*cy + t*t*b.y,
    angle: Math.atan2(2*(1-t)*(cy-a.y)+2*t*(b.y-cy), 2*(1-t)*(cx-a.x)+2*t*(b.x-cx)), cx, cy };
}
function drawDecorativeTerrain(terrain: Graphics) {
  terrain.rect(0, 0, 960, 630).fill(0x79bc57);
  terrain.rect(0, 0, 960, 630).fill({ color: 0xb5dc62, alpha: .18 });
  terrain.poly([820,0,960,0,960,630,745,630,770,575,795,535,808,480,796,432,818,380,807,330,829,275,816,220,838,165,826,110]).fill(0x45b6df);
  terrain.poly([834,0,960,0,960,630,760,630,783,573,806,530,821,479,812,430,833,378,823,329,844,274,831,220,851,165,841,110]).fill({ color: 0x7bd8ed, alpha: .35 });
  terrain.moveTo(0,250).quadraticCurveTo(140,205,250,260).quadraticCurveTo(355,320,470,285).quadraticCurveTo(590,245,720,330).quadraticCurveTo(790,375,830,430).stroke({ color: 0x3b6f86, width: 25, alpha: .65 });
  terrain.moveTo(0,250).quadraticCurveTo(140,205,250,260).quadraticCurveTo(355,320,470,285).quadraticCurveTo(590,245,720,330).quadraticCurveTo(790,375,830,430).stroke({ color: 0x35b8d4, width: 17, alpha: .96 });
  terrain.moveTo(50,545).quadraticCurveTo(210,470,360,505).quadraticCurveTo(515,540,655,470).quadraticCurveTo(745,425,820,420).stroke({ color: 0xe6e5b6, width: 10, alpha: .75 });
  terrain.moveTo(50,545).quadraticCurveTo(210,470,360,505).quadraticCurveTo(515,540,655,470).quadraticCurveTo(745,425,820,420).stroke({ color: 0x9f9d76, width: 2, alpha: .45 });
  const mountains = [[185,410],[235,445],[295,405],[430,165],[475,190],[525,465],[575,440],[620,455],[705,250],[735,235]];
  for (const [x,y] of mountains) {
    terrain.poly([x!-24,y!+25,x!,y!-27,x!+24,y!+25]).fill(0x557a3e).stroke({ color: 0x436934, width: 2, alpha: .8 });
    terrain.poly([x!-3,y!-20,x!,y!-27,x!+8,y!-10,x!+2,y!-13]).fill({ color: 0xf0efd0, alpha: .88 });
    terrain.poly([x!-15,y!+18,x!,y!-12,x!+17,y!+18]).fill({ color: 0x6e934a, alpha: .7 });
  }
  const trees = [[105,150],[150,170],[205,135],[320,155],[365,180],[410,330],[455,350],[540,120],[575,145],[610,190],[650,390],[690,410],[725,455],[260,535],[310,520],[380,555],[500,540],[555,555]];
  for (const [x,y] of trees) {
    terrain.circle(x!-7,y!,8).fill({ color: 0x39783f, alpha: .72 });
    terrain.circle(x!+5,y!-2,9).fill({ color: 0x4a9349, alpha: .78 });
    terrain.rect(x!-2,y!+5,4,9).fill({ color: 0x6f613f, alpha: .65 });
  }
  for (let x = 45; x <= 760; x += 85) terrain.circle(x,85 + (x % 170) * .25,32).fill({ color: 0xe2d96c, alpha: .08 });
}
function drawDashedCircle(graphics: Graphics, cx: number, cy: number, radius: number) {
  graphics.circle(cx, cy, radius).fill({ color: 0xfff6ac, alpha: .035 });
  for (let i = 0; i < 64; i += 2) {
    const a = i / 64 * Math.PI * 2, b = (i + 1) / 64 * Math.PI * 2;
    graphics.moveTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius).lineTo(cx + Math.cos(b) * radius, cy + Math.sin(b) * radius).stroke({ color: 0xfffbea, width: 2.2, alpha: .82 });
  }
}
export function MapView(props: Props) {
  const host = useRef<HTMLDivElement>(null), latest = useRef(props), controls = useRef<{zoom: (factor: number) => void; reset: () => void} | null>(null);
  const [status, setStatus] = useState('loading'), [compact, setCompact] = useState(false);
  latest.current = props;
  useEffect(() => {
    const element = host.current!; const app = new Application();
    let cancelled = false, initialized = false, dispose = () => {};
    void (async () => {
      try {
        await app.init({ backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio || 1, 2), autoDensity: true, preference: ['webgl'] });
        initialized = true;
        if (cancelled) { app.destroy(true, { children: true }); return; }
        const canvas = app.canvas as HTMLCanvasElement;
        canvas.setAttribute('aria-label', '机场航线示意图，可拖动、缩放或点击机场');
        canvas.setAttribute('role', 'img'); canvas.tabIndex = 0; element.appendChild(canvas);
        const world = new Container(), terrain = new Graphics(), lines = new Graphics(), rangeRing = new Graphics(), nodes = new Container(), aircraft = new Container();
        app.stage.addChild(world); const draft = new Graphics(), draftLabels = new Container();
        draft.eventMode = draftLabels.eventMode = rangeRing.eventMode = 'none';
        world.addChild(terrain, lines, rangeRing, draft, nodes, draftLabels, aircraft);
        drawDecorativeTerrain(terrain);
        const marks = new Map<string, { ring: Graphics; label: Text; code: Text; value: Text; passengerBadge: Graphics; passengerText: Text }>();
        for (const a of AIRPORTS) {
          const group = new Container(); group.position.set(a.x,a.y);
          const ring = new Graphics(), label = new Text({text:a.city,style:{fontFamily:'system-ui, sans-serif',fontSize:18,fontWeight:'700',fill:0x203a32}});
          const code = new Text({text:a.id,style:{fontFamily:'monospace',fontSize:11,fontWeight:'700',letterSpacing:1,fill:0x365b53}});
          const value = new Text({text:'',style:{fontFamily:'system-ui, sans-serif',fontSize:11,fontWeight:'700',fill:0x203a32}});
          const passengerBadge = new Graphics(), passengerText = new Text({text:'',style:{fontFamily:'system-ui, sans-serif',fontSize:10,fontWeight:'800',fill:0x3f3300}});
          passengerBadge.visible = false; passengerText.visible = false;
          label.position.set(15,-23); code.position.set(16,-2); value.position.set(16,13); passengerText.position.set(21,32);
          group.addChild(ring,label,code,value,passengerBadge,passengerText); nodes.addChild(group); marks.set(a.id,{ring,label,code,value,passengerBadge,passengerText});
        }
        let fitScale = 1, zoom = 1, regional = false, focusedSelection = '', selectionKey = '', passengerKey = '', rangeKey = '', lastGame: GameState | null = null, snapshotAt = performance.now();
        const planes = new Map<string, Graphics>();
        let previewKey = '';
        const drawPreview = () => {
          const preview = latest.current.preview, key = JSON.stringify(preview ?? null);
          if (key === previewKey) return;
          previewKey = key; draft.clear();
          for (const child of draftLabels.removeChildren()) child.destroy();
          for (const leg of preview?.legs ?? []) {
            const a = airport(leg.from), b = airport(leg.to), c = curve(leg.from, leg.to, .5);
            const color = leg.error ? 0xd23d31 : 0xffed24;
            if (leg.error) {
              for (let i = 0; i < 32; i += 2) {
                const u = curve(leg.from, leg.to, i / 32), v = curve(leg.from, leg.to, (i + 1) / 32);
                draft.moveTo(u.x,u.y).lineTo(v.x,v.y).stroke({color,width:5});
              }
            } else {
              draft.moveTo(a.x,a.y).quadraticCurveTo(c.cx,c.cy,b.x,b.y).stroke({color:0x435528,width:9,alpha:.45});
              draft.moveTo(a.x,a.y).quadraticCurveTo(c.cx,c.cy,b.x,b.y).stroke({color,width:5});
            }
            const v = curve(leg.from,leg.to,.38 + (leg.number % 3) * .11), arrow = new Graphics();
            arrow.poly([11,0,-7,-7,-7,7]).fill(color).stroke({color:0x3d4f29,width:2});
            arrow.position.set(v.x,v.y); arrow.rotation = v.angle; draftLabels.addChild(arrow);
          }
          for (const visit of preview?.visits ?? []) {
            const a = airport(visit.airportId), label = new Text({text:visit.numbers.join('/'),style:{fontFamily:'system-ui, sans-serif',fontSize:16,fontWeight:'800',fill:0x0f3c4b}});
            label.anchor.set(.5); label.position.set(a.x-25,a.y-24);
            const badge = new Graphics().roundRect(a.x-25-Math.max(13,label.width/2+5),a.y-38,Math.max(26,label.width+10),28,5).fill(0x55d6ec).stroke({color:0x1b5c72,width:2});
            draftLabels.addChild(badge,label);
          }
          element.setAttribute('data-preview-path', (preview?.legs ?? []).map(l => l.to).join(','));
        };
        const clamp = () => {
          const w=app.screen.width, h=app.screen.height, margin=Math.min(60, h / 3), scale=world.scale.x;
          world.x=Math.max(margin-960*scale,Math.min(w-margin,world.x)); world.y=Math.max(margin-630*scale,Math.min(h-margin,world.y));
          element.dataset.camera = JSON.stringify({x:world.x,y:world.y,scale:world.scale.x});
        };
        const focusSelection = () => {
          const a = airport(latest.current.selected);
          world.position.set(app.screen.width / 2 - a.x * world.scale.x, app.screen.height / 2 - a.y * world.scale.y);
          clamp();
        };
        const reset = () => {
          const layout = mapLayout(app.screen.width, app.screen.height, airport(latest.current.selected));
          zoom = 1; fitScale = layout.scale; regional = layout.regional;
          world.scale.set(fitScale); world.position.set(layout.x, layout.y); clamp();
        };
        const zoomAt = (factor:number,x:number,y:number) => {
          const old=world.scale.x, next=Math.max(MIN_MAP_SCALE / fitScale,Math.min(3,zoom*factor)); zoom=next;
          const scale=fitScale*next; world.position.set(x-(x-world.x)/old*scale,y-(y-world.y)/old*scale); world.scale.set(scale); clamp();
        };
        const focusCurrent = () => {
          const p = latest.current.plane, sprite = p && planes.get(p.id);
          if (!sprite) return;
          world.position.set(app.screen.width/2-sprite.x*world.scale.x,app.screen.height/2-sprite.y*world.scale.y); clamp();
        };
        const keydown = (event: KeyboardEvent) => { if (event.key === 'Home') { event.preventDefault(); focusCurrent(); } };
        canvas.addEventListener('keydown',keydown);
        controls.current={zoom:(factor)=>zoomAt(factor,app.screen.width/2,app.screen.height/2),reset};
        const observer = new ResizeObserver(() => {
          const width=element.clientWidth,height=element.clientHeight;
          if(width<1||height<1)return; app.renderer.resize(width,height); setCompact(height < 220); reset();
        }); observer.observe(element);
        const pointers = new Map<number,{x:number;y:number}>();
        let drag=false, multi=false, start={x:0,y:0}, last={x:0,y:0};
        const local=(e:PointerEvent|WheelEvent)=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
        const down=(e:PointerEvent)=>{const p=local(e);pointers.set(e.pointerId,p);canvas.setPointerCapture(e.pointerId);if(pointers.size===1){start=p;last=p;drag=false;multi=false;}else{multi=true;drag=true;}};
        const move=(e:PointerEvent)=>{
          if(!pointers.has(e.pointerId))return;
          const p=local(e), before=[...pointers.values()]; pointers.set(e.pointerId,p);
          if(pointers.size===2){const after=[...pointers.values()];const b0=before[0]!,b1=before[1]!,a0=after[0]!,a1=after[1]!;
            const previous=Math.hypot(b0.x-b1.x,b0.y-b1.y), current=Math.hypot(a0.x-a1.x,a0.y-a1.y);
            if(previous>5)zoomAt(current/previous,(a0.x+a1.x)/2,(a0.y+a1.y)/2);return;}
          if(Math.hypot(p.x-start.x,p.y-start.y)>4)drag=true;
          if(drag&&!multi){world.x+=p.x-last.x;world.y+=p.y-last.y;clamp();} last=p;
        };
        const up=(e:PointerEvent)=>{
          if(!pointers.has(e.pointerId))return;
          const p=local(e);
          if(!drag&&!multi&&e.type!=='pointercancel'){
            const x=(p.x-world.x)/world.scale.x,y=(p.y-world.y)/world.scale.y;
            const current = latest.current.plane && planes.get(latest.current.plane.id);
            if (current && Math.hypot(current.x-x,current.y-y) < 18/world.scale.x) { focusCurrent(); }
            else {
            const hit=AIRPORTS.find(a=>Math.hypot(a.x-x,a.y-y)<Math.max(22,18/world.scale.x));
            if(hit)latest.current.onSelect(hit.id);
            }
          }
          pointers.delete(e.pointerId);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
          if(pointers.size===1)last=[...pointers.values()][0]!;
        };
        const wheel=(e:WheelEvent)=>{e.preventDefault();const p=local(e);zoomAt(Math.exp(-e.deltaY*0.001),p.x,p.y);};
        canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('wheel',wheel,{passive:false});
        app.ticker.maxFPS=45;
        app.ticker.add(()=>{
          const {game,selected,plane}=latest.current;
          drawPreview();
          if (focusedSelection !== selected) {
            focusedSelection = selected;
            if (regional) focusSelection();
            canvas.setAttribute('aria-label', `机场航线示意图，当前选择${airport(selected).city}，可拖动、缩放或点击机场`);
          }
          if(lastGame!==game){lastGame=game;snapshotAt=performance.now();lines.clear();
            for(const r of game.routes){const a=airport(r.from),b=airport(r.to),c=curve(r.from,r.to,.5);
              lines.moveTo(a.x,a.y).quadraticCurveTo(c.cx,c.cy,b.x,b.y).stroke({color:0xf7f4dc,width:4,alpha:.20});
              lines.moveTo(a.x,a.y).quadraticCurveTo(c.cx,c.cy,b.x,b.y).stroke({color:0x276f75,width:2,alpha:.28});}
            for(const p of game.fleet){if(!planes.has(p.id)){const g=new Graphics();g.poly([14,0,-10,-8,-5,0,-10,8]).fill(0xfbf8db).stroke({color:0x143b50,width:2});aircraft.addChild(g);planes.set(p.id,g);}}
            for(const [id,g] of planes){if(!game.fleet.some(p=>p.id===id)){g.destroy();planes.delete(id);}}
          }
          const selectedPlane = plane ? game.fleet.find(item => item.id === plane.id) : undefined;
          const passengerCounts = passengerDestinationCounts(game, selectedPlane?.id), nextPassengerKey = passengerDestinationKey(passengerCounts);
          if(passengerKey!==nextPassengerKey){passengerKey=nextPassengerKey;
            for(const a of AIRPORTS){const m=marks.get(a.id)!,amount=passengerCounts.get(a.id)??0;
              m.passengerBadge.clear();m.passengerBadge.visible=amount>0;m.passengerText.visible=amount>0;
              if(amount>0){m.passengerText.text=`乘客 ${amount}`;const width=Math.max(52,m.passengerText.width+12);
                m.passengerBadge.roundRect(15,29,width,20,5).fill({color:0xffe363,alpha:.96}).stroke({color:0x8b6b00,width:1.5});}
            }
            element.setAttribute('data-passenger-destinations',nextPassengerKey);
          }
          const key=selected+game.airports.map(a=>`${a.id}:${a.level}`).join(',');
          if(selectionKey!==key){selectionKey=key;for(const a of AIRPORTS){const m=marks.get(a.id)!,state=game.airports.find(x=>x.id===a.id),open=Boolean(state),active=selected===a.id;
            m.ring.clear();if(active)m.ring.circle(0,0,25).fill({color:0xfff27a,alpha:.18}).circle(0,0,23).stroke({color:0xffec3a,width:3});
            m.ring.roundRect(-7,-13,14,16,3).fill(open?0xd8f4ef:0xd8ddd3).stroke({color:open?0x1f7784:0x65736e,width:2});
            m.ring.poly([-11,3,0,-5,11,3,11,9,-11,9]).fill(open?0x4ac3d7:0xaab7ae).stroke({color:open?0x1b6576:0x65736e,width:2});
            m.code.visible=false; m.value.position.set(16,0);
            m.value.text=open?`${state!.level}级`:'未解锁';
            m.label.alpha=open?1:.68;m.code.alpha=open?.95:.62;m.value.alpha=open?.95:.66;
          }}
          const rangeOrigin = latest.current.preview?.legs.at(-1)?.to ?? selectedPlane?.airportId;
          const nextRangeKey = selectedPlane ? `${selectedPlane.id}:${rangeOrigin}:${aircraftSpecs(selectedPlane).range}:${selectedPlane.flight ? 'flight' : 'ground'}` : '';
          if(rangeKey!==nextRangeKey){rangeKey=nextRangeKey;rangeRing.clear();
            if(selectedPlane && !selectedPlane.flight){const a=airport(rangeOrigin!), radius=Math.min(300,145+aircraftSpecs(selectedPlane).range/35);drawDashedCircle(rangeRing,a.x,a.y,radius);rangeRing.circle(a.x,a.y,36).stroke({color:0xfffbd0,width:3,alpha:.88});}
            element.setAttribute('data-range-plane', selectedPlane?.id ?? '');
            element.setAttribute('data-range-origin', rangeOrigin ?? '');
          }
          const visualTime=game.simTime+Math.min(1,(performance.now()-snapshotAt)/1000);
          for(const p of game.fleet){const g=planes.get(p.id)!;
            if(p.flight){g.visible=latest.current.showOthers || selectedPlane?.id===p.id;const f=p.flight,t=Math.max(0,Math.min(1,(visualTime-f.departAt)/(f.arriveAt-f.departAt))),v=curve(f.from,f.to,t);g.position.set(v.x,v.y);g.rotation=v.angle;}
            else if(selectedPlane?.id===p.id){const a=airport(p.airportId);g.visible=true;g.position.set(a.x,a.y-28);g.rotation=-Math.PI/2;}
            else g.visible=false;
          }
          element.dataset.visiblePlanes = [...planes].filter(([,g]) => g.visible).map(([id]) => id).join(',');
        });
        dispose=()=>{controls.current=null;observer.disconnect();canvas.removeEventListener('keydown',keydown);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('wheel',wheel);};
        setStatus('ready');
      } catch { if(!cancelled)setStatus('fallback'); }
    })();
    return()=>{cancelled=true;dispose();if(initialized&&!app.stage.destroyed)app.destroy(true,{children:true});};
  },[]);
  return <section className={`map-area${compact ? ' is-compact' : ''}`} aria-label="航线地图" aria-describedby="route-preview-description">
    <div className="map-canvas" ref={host} data-testid="map-canvas" data-renderer={status}/>
    <p id="route-preview-description" className="sr-only" data-testid="route-preview" data-legs={props.preview?.legs.length ?? 0}>{previewDescription(props.preview)}</p>
    {status==='fallback' && <div className="map-fallback" role="status">地图不可用，请点击顶部「目的地」选择城市。</div>}
    <button className="map-plane-toggle" aria-label={props.showOthers ? '隐藏其他飞机' : '显示其他飞机'} aria-pressed={!props.showOthers} onClick={props.onToggleOthers}><span>{props.showOthers ? '隐藏' : '显示'}</span><strong>其他飞机</strong></button>
    <div className="map-controls"><button className="map-zoom-in" aria-label="放大地图" disabled={status !== 'ready'} onClick={()=>controls.current?.zoom(1.25)}><span aria-hidden="true">＋</span></button><button className="map-zoom-out" aria-label="缩小地图" disabled={status !== 'ready'} onClick={()=>controls.current?.zoom(.8)}><span aria-hidden="true">−</span></button></div>
    <small className="map-disclaimer">游戏示意图 · 非导航地图</small>
  </section>;
}
