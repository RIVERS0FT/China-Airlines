import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Text } from 'pixi.js';
import { AIRPORTS, airport } from '../core/catalog.js';
import type { GameState } from '../core/game.js';
import { mapLayout, MIN_MAP_SCALE } from './map-camera.js';
import './map-readability.css';
interface Props { game: GameState; selected: string; onSelect: (id: string) => void }
function curve(from: string, to: string, t: number) {
  const a = airport(from), b = airport(to), cx = (a.x + b.x) / 2, cy = Math.min(a.y, b.y) - Math.min(100, Math.abs(b.x - a.x) * 0.2 + 35);
  return { x: (1-t)**2*a.x + 2*(1-t)*t*cx + t*t*b.x, y: (1-t)**2*a.y + 2*(1-t)*t*cy + t*t*b.y,
    angle: Math.atan2(2*(1-t)*(cy-a.y)+2*t*(b.y-cy), 2*(1-t)*(cx-a.x)+2*t*(b.x-cx)), cx, cy };
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
        await app.init({ backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio || 1, 2), autoDensity: true, preference: 'webgl' });
        initialized = true;
        if (cancelled) { app.destroy(true, { children: true }); return; }
        const canvas = app.canvas as HTMLCanvasElement;
        canvas.setAttribute('aria-label', '机场航线示意图，可拖动、缩放或点击机场');
        canvas.setAttribute('role', 'img'); element.appendChild(canvas);
        const world = new Container(), terrain = new Graphics(), lines = new Graphics(), nodes = new Container(), aircraft = new Container();
        app.stage.addChild(world); world.addChild(terrain, lines, nodes, aircraft);
        for (let x = 0; x <= 960; x += 60) terrain.moveTo(x,0).lineTo(x,630).stroke({ color: 0x92a89c, alpha: 0.10, width: 1 });
        for (let y = 0; y <= 630; y += 60) terrain.moveTo(0,y).lineTo(960,y).stroke({ color: 0x92a89c, alpha: 0.10, width: 1 });
        // Original abstract terrain contours; deliberately not an administrative map.
        for (const [cx,cy,rx,ry] of [[320,260,250,180],[570,380,270,170],[750,285,140,190]]) {
          for (let n = 0; n < 4; n++) terrain.ellipse(cx!,cy!,rx!-n*22,ry!-n*17).stroke({color:0x99af9b,alpha:0.11,width:1.5});
        }
        const marks = new Map<string, { ring: Graphics; label: Text; code: Text }>();
        for (const a of AIRPORTS) {
          const group = new Container(); group.position.set(a.x,a.y);
          const ring = new Graphics(), label = new Text({text:a.city,style:{fontFamily:'system-ui, sans-serif',fontSize:18,fontWeight:'600',fill:0x365854}});
          const code = new Text({text:a.id,style:{fontFamily:'monospace',fontSize:12,letterSpacing:2,fill:0x738a7d}});
          label.position.set(16,-18); code.position.set(17,7); group.addChild(ring,label,code); nodes.addChild(group); marks.set(a.id,{ring,label,code});
        }
        let fitScale = 1, zoom = 1, regional = false, focusedSelection = '', selectionKey = '', lastGame: GameState | null = null, snapshotAt = performance.now();
        const planes = new Map<string, Graphics>();
        const clamp = () => {
          const w=app.screen.width, h=app.screen.height, margin=Math.min(60, h / 3), scale=world.scale.x;
          world.x=Math.max(margin-960*scale,Math.min(w-margin,world.x)); world.y=Math.max(margin-630*scale,Math.min(h-margin,world.y));
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
            const hit=AIRPORTS.find(a=>Math.hypot(a.x-x,a.y-y)<Math.max(22,18/world.scale.x));
            if(hit)latest.current.onSelect(hit.id);
          }
          pointers.delete(e.pointerId);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
          if(pointers.size===1)last=[...pointers.values()][0]!;
        };
        const wheel=(e:WheelEvent)=>{e.preventDefault();const p=local(e);zoomAt(Math.exp(-e.deltaY*0.001),p.x,p.y);};
        canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('wheel',wheel,{passive:false});
        app.ticker.maxFPS=45;
        app.ticker.add(()=>{
          const {game,selected}=latest.current;
          if (focusedSelection !== selected) {
            focusedSelection = selected;
            if (regional) focusSelection();
            canvas.setAttribute('aria-label', `机场航线示意图，当前选择${airport(selected).city}，可拖动、缩放或点击机场`);
          }
          if(lastGame!==game){lastGame=game;snapshotAt=performance.now();lines.clear();
            for(const r of game.routes){const a=airport(r.from),b=airport(r.to),c=curve(r.from,r.to,.5);
              lines.moveTo(a.x,a.y).quadraticCurveTo(c.cx,c.cy,b.x,b.y).stroke({color:0x418e7d,width:2.5,alpha:.60});}
            for(const p of game.fleet){if(!planes.has(p.id)){const g=new Graphics();g.poly([13,0,-9,-8,-5,0,-9,8]).fill(0xf8fbef).stroke({color:0x236b60,width:2});aircraft.addChild(g);planes.set(p.id,g);}}
            for(const [id,g] of planes){if(!game.fleet.some(p=>p.id===id)){g.destroy();planes.delete(id);}}
          }
          const key=selected+game.airports.map(a=>`${a.id}:${a.level}`).join(',');
          if(selectionKey!==key){selectionKey=key;for(const a of AIRPORTS){const m=marks.get(a.id)!,open=game.airports.some(x=>x.id===a.id),active=selected===a.id;
            m.ring.clear();if(active)m.ring.circle(0,0,20).fill({color:0xd8ad65,alpha:.16}).circle(0,0,18).stroke({color:0xb58c4b,width:1.5});
            m.ring.circle(0,0,open?8:6).fill(open?0x347c6d:0xc2cfc2).stroke({color:open?0xf5f5ea:0x8fa294,width:2});
            m.label.alpha=open?1:.65;m.code.alpha=open?.9:.6;
          }}
          const visualTime=game.simTime+Math.min(1,(performance.now()-snapshotAt)/1000);
          for(const p of game.fleet){const g=planes.get(p.id)!;g.visible=Boolean(p.flight);if(p.flight){const f=p.flight,t=Math.max(0,Math.min(1,(visualTime-f.departAt)/(f.arriveAt-f.departAt))),v=curve(f.from,f.to,t);g.position.set(v.x,v.y);g.rotation=v.angle;}}
        });
        dispose=()=>{controls.current=null;observer.disconnect();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('wheel',wheel);};
        setStatus('ready');
      } catch { if(!cancelled)setStatus('fallback'); }
    })();
    return()=>{cancelled=true;dispose();if(initialized&&!app.stage.destroyed)app.destroy(true,{children:true});};
  },[]);
  return <section className={`map-area${compact ? ' is-compact' : ''}`} aria-label="航线地图">
    <div className="map-canvas" ref={host} data-testid="map-canvas" data-renderer={status}/>
    <div className="map-caption">{compact ? <span className="map-hint">航线地图 · 拖拽查看城市</span> : <><span className="eyebrow">ROUTE NETWORK / 航线网络</span><h2>让每座城市，彼此更近。</h2><p>选择机场，规划下一段旅程。</p></>}</div>
    {status==='fallback'&&<div className="map-fallback" role="status">地图渲染不可用。仍可通过下方机场列表进行全部经营操作。</div>}
    <div className="map-legend"><span><i className="dot"/>已解锁 {props.game.airports.length}</span><span><i className="dot muted"/>待拓展 {AIRPORTS.length-props.game.airports.length}</span></div>
    <div className="map-controls"><button aria-label="放大地图" onClick={()=>controls.current?.zoom(1.25)}>＋</button><button aria-label="缩小地图" onClick={()=>controls.current?.zoom(.8)}>−</button><button aria-label="重置地图视角" onClick={()=>controls.current?.reset()}>⌖</button></div>
    <small className="map-disclaimer">原创示意航网 · 非导航地图</small>
  </section>;
}
