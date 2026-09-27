import { describe, expect, it } from 'vitest';
import { fitOrganization, zoomOrganization, ORG_CAMERA_PADDING, ORG_CAMERA_TOOLBAR, ORG_MAX_ZOOM } from '../../src/ui/organization-camera.js';

describe('organization camera',()=>{
  it.each([{width:1100,height:600},{width:550,height:240},{width:350,height:160}])('fits a full tree above the controls in $width × $height',viewport=>{
    const content={width:944,height:1114}, camera=fitOrganization(content,viewport);
    expect(camera.zoom).toBeGreaterThan(0);
    expect(camera.x).toBeGreaterThanOrEqual(ORG_CAMERA_PADDING-1e-8);
    expect(camera.y).toBeGreaterThanOrEqual(ORG_CAMERA_PADDING-1e-8);
    expect(camera.x+content.width*camera.zoom).toBeLessThanOrEqual(viewport.width-ORG_CAMERA_PADDING+1e-8);
    expect(camera.y+content.height*camera.zoom).toBeLessThanOrEqual(viewport.height-ORG_CAMERA_PADDING-ORG_CAMERA_TOOLBAR+1e-8);
    expect(camera.x+content.width*camera.zoom/2).toBeCloseTo(viewport.width/2);
  });
  it('limits initial enlargement for a sparse tree and handles a not-yet-measured viewport',()=>{
    expect(fitOrganization({width:944,height:360},{width:3000,height:2000}).zoom).toBe(1.25);
    expect(Object.values(fitOrganization({width:0,height:0},{width:0,height:0})).every(Number.isFinite)).toBe(true);
  });
  it.each([.001,.8,1.25,1000])('preserves the point under the cursor while zooming by %s, including both limits',factor=>{
    const camera={x:-140,y:62,zoom:.8},anchor={x:242,y:150},before={...camera};
    const next=zoomOrganization(camera,factor,anchor,.2);
    expect(next.zoom).toBeGreaterThanOrEqual(.2);expect(next.zoom).toBeLessThanOrEqual(ORG_MAX_ZOOM);
    expect((anchor.x-next.x)/next.zoom).toBeCloseTo((anchor.x-camera.x)/camera.zoom);
    expect((anchor.y-next.y)/next.zoom).toBeCloseTo((anchor.y-camera.y)/camera.zoom);
    expect(camera).toEqual(before);
  });
});
