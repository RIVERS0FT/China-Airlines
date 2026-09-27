import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18n.js';
import { useGameViewport } from './GameViewport.js';
import { fitOrganization, zoomOrganization, ORG_CAMERA_PADDING, ORG_CAMERA_TOOLBAR, ORG_MAX_ZOOM,
  type OrganizationCamera, type OrganizationPoint, type OrganizationSize } from './organization-camera.js';

type Contact = OrganizationPoint & { startX: number; startY: number };
function gesture(contacts: Map<number, Contact>) {
  const [first, second] = [...contacts.values()];
  if (!first) return null;
  return second ? { x:(first.x+second.x)/2, y:(first.y+second.y)/2, distance:Math.hypot(first.x-second.x,first.y-second.y) }
    : { x:first.x, y:first.y, distance:0 };
}

export function OrganizationTree({ width, height, layoutKey, children }: OrganizationSize & { layoutKey: string; children: ReactNode }) {
  const { locale } = useI18n(), { scale } = useGameViewport(), en = locale === 'en-US';
  const viewport = useRef<HTMLDivElement>(null);
  const [size,setSize] = useState<OrganizationSize>({width:0,height:0});
  const [camera,setCamera] = useState<OrganizationCamera>({x:0,y:0,zoom:1});
  const current = useRef(camera), contacts = useRef(new Map<number,Contact>()), dragged = useRef(false);
  const fit = fitOrganization({width,height},size), minZoom = Math.min(.25,fit.zoom);
  const live = useRef({scale,minZoom,size}); live.current = {scale,minZoom,size};
  function update(next: OrganizationCamera) { current.current=next;setCamera(next); }
  function focusAll() { update(fit); }
  function point(clientX:number,clientY:number) {
    const element=viewport.current!, rect=element.getBoundingClientRect();
    return {x:(clientX-rect.left)/live.current.scale-element.clientLeft,y:(clientY-rect.top)/live.current.scale-element.clientTop};
  }
  function zoom(factor:number,anchor={x:size.width/2,y:(size.height-ORG_CAMERA_TOOLBAR)/2}) {
    update(zoomOrganization(current.current,factor,anchor,live.current.minZoom));
  }
  useLayoutEffect(()=>{
    const element=viewport.current!;
    const measure=()=>setSize(old=>old.width===element.clientWidth&&old.height===element.clientHeight?old:{width:element.clientWidth,height:element.clientHeight});
    const observer=new ResizeObserver(measure);observer.observe(element);measure();
    return ()=>observer.disconnect();
  },[]);
  useLayoutEffect(()=>{
    if(size.width>0&&size.height>0) update(fitOrganization({width,height},size));
    contacts.current.clear();
  },[width,height,layoutKey,size]);
  useEffect(()=>{
    const element=viewport.current!;
    const wheel=(event:WheelEvent)=>{
      if((event.target as Element).closest('.org-camera-controls'))return;
      event.preventDefault();
      const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?live.current.size.height:1);
      zoom(Math.exp(-Math.max(-300,Math.min(300,delta))*.002),point(event.clientX,event.clientY));
    };
    element.addEventListener('wheel',wheel,{passive:false});
    return ()=>element.removeEventListener('wheel',wheel);
  },[]);
  function pointerDown(event:PointerEvent<HTMLDivElement>) {
    if(!contacts.current.size)dragged.current=false;
    if(event.button!==0||(event.target as Element).closest('.org-camera-controls'))return;
    const p=point(event.clientX,event.clientY);
    contacts.current.set(event.pointerId,{...p,startX:p.x,startY:p.y});
    if(contacts.current.size>1)dragged.current=true;
    if(!(event.target as Element).closest('button')){
      event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);
    }
  }
  function pointerMove(event:PointerEvent<HTMLDivElement>) {
    const contact=contacts.current.get(event.pointerId);if(!contact)return;
    const before=gesture(contacts.current)!, p=point(event.clientX,event.clientY);
    contacts.current.set(event.pointerId,{...contact,...p});
    if(!dragged.current&&Math.hypot(p.x-contact.startX,p.y-contact.startY)<4)return;
    dragged.current=true;event.currentTarget.setPointerCapture(event.pointerId);
    const after=gesture(contacts.current)!;
    const next=before.distance>0&&after.distance>0?zoomOrganization(current.current,after.distance/before.distance,before,live.current.minZoom):current.current;
    update({...next,x:next.x+after.x-before.x,y:next.y+after.y-before.y});
  }
  function pointerEnd(event:PointerEvent<HTMLDivElement>) {
    contacts.current.delete(event.pointerId);
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return <div ref={viewport} className="org-tree-viewport" role="region" aria-label={en?'Company Organization Tree':'公司组织架构树'} tabIndex={0}
    data-camera={JSON.stringify(camera)} data-camera-ready={size.width>0&&size.height>0}
    onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}
    onLostPointerCapture={event=>{if(event.target===event.currentTarget)pointerEnd(event);}}
    onClickCapture={event=>{if(dragged.current&&event.detail>0){event.preventDefault();event.stopPropagation();}}}
    onFocusCapture={event=>{
      if(!(event.target instanceof HTMLElement)||!event.target.matches(':is(.org-person,.org-vacancy):focus-visible'))return;
      const node=event.target.getBoundingClientRect(), frame=event.currentTarget.getBoundingClientRect(), margin=ORG_CAMERA_PADDING*scale;
      const right=frame.right-margin, bottom=frame.bottom-(ORG_CAMERA_PADDING+ORG_CAMERA_TOOLBAR)*scale;
      const dx=node.left<frame.left+margin?frame.left+margin-node.left:node.right>right?right-node.right:0;
      const dy=node.top<frame.top+margin?frame.top+margin-node.top:node.bottom>bottom?bottom-node.bottom:0;
      if(dx||dy)update({...current.current,x:current.current.x+dx/scale,y:current.current.y+dy/scale});
    }}
    onKeyDown={event=>{
      if(event.target!==event.currentTarget)return;
      const steps:Record<string,[number,number]>={ArrowDown:[0,-60],ArrowUp:[0,60],ArrowLeft:[60,0],ArrowRight:[-60,0]};
      const step=steps[event.key];
      if(step){event.preventDefault();update({...current.current,x:current.current.x+step[0],y:current.current.y+step[1]});}
      else if(['+','=','-','_'].includes(event.key)){event.preventDefault();zoom(event.key==='-'||event.key==='_'?1/1.25:1.25);}
      else if(event.key==='Home'){event.preventDefault();focusAll();}
    }}>
    <div className="org-canvas" style={{width,height,transform:`translate(${camera.x}px,${camera.y}px) scale(${camera.zoom})`,visibility:size.width?'visible':'hidden'}}>{children}</div>
    <div className="org-camera-controls" role="group" aria-label={en?'Organization tree view':'组织树视图'}>
      <button type="button" aria-label={en?'Zoom out organization tree':'缩小组织树'} disabled={camera.zoom<=minZoom+.00001} onClick={()=>zoom(1/1.25)}>−</button>
      <output aria-label={en?'Organization tree zoom':'组织树缩放比例'}>{Math.round(camera.zoom*100)}%</output>
      <button type="button" aria-label={en?'Zoom in organization tree':'放大组织树'} disabled={camera.zoom>=ORG_MAX_ZOOM-.00001} onClick={()=>zoom(1.25)}>＋</button>
      <button type="button" onClick={focusAll}>{en?'Fit all':'聚焦全部'}</button>
    </div>
  </div>;
}
