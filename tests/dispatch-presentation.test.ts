import { describe, it, expect } from 'vitest';
import { GameCore, planQuote, validateSave } from '../src/core/game.js';
import { dispatchPresentation } from '../src/ui/dispatch-presentation.js';
const NOW=1_800_000_000_000,ID='AC0001';
function prepared() { const c=new GameCore(NOW); c.execute({type:'unlock',airportId:'WUH'},NOW); c.execute({type:'load-destination',planeId:ID,to:'PVG'},NOW); return c; }
describe('minimal dispatch projection retains core rules',()=>{
 it('matches all core quote values including intermediate turnaround',()=>{
  const s=prepared().snapshot(),stops=['WUH','PVG'];
  const q=planQuote(s,s.fleet[0]!,stops),v=dispatchPresentation(s,s.fleet[0],stops,false,false);
  expect(v.summary).toEqual(q);expect(v.canLaunch).toBe(true);
 });
 it('does not preview fake income when no city has been selected',()=>{
  const s=prepared().snapshot(),v=dispatchPresentation(s,s.fleet[0],[],false,false);
  expect(v.summary).toBeNull();expect(v.canLaunch).toBe(false);
 });
 it('blocks the first energy-short leg but only warns about total shortage',()=>{
  const s=prepared().snapshot(),p=s.fleet[0]!,q=planQuote(s,p,['WUH','PVG']);
  p.energy.availableSeconds=q.legs[0]!.duration;
  expect(dispatchPresentation(s,p,['WUH','PVG'],false,false)).toMatchObject({canLaunch:true,warning:expect.stringContaining('只能覆盖部分')});
  p.energy.availableSeconds--;
  expect(dispatchPresentation(s,p,['WUH','PVG'],false,false)).toMatchObject({canLaunch:false,reason:expect.stringContaining('能量不足')});
 });
 it('allows a negative-profit empty positioning flight when funds suffice',()=>{
  const s=new GameCore(NOW).snapshot(),v=dispatchPresentation(s,s.fleet[0],['PVG'],false,false);
  expect(v.draft!.profit).toBeLessThan(0);expect(v.canLaunch).toBe(true);
  s.credits=0;expect(dispatchPresentation(s,s.fleet[0],['PVG'],false,false).reason).toBe('运营资金不足');
 });
 it('requires a dispatcher and direct manifest for automatic flight',()=>{
  const s=prepared().snapshot(),p=s.fleet[0]!;
  expect(dispatchPresentation(s,p,['PVG'],true,false).canLaunch).toBe(true);
  p.dispatcher=false;expect(dispatchPresentation(s,p,['PVG'],true,false).canLaunch).toBe(false);
 });
 it('does not replace locked in-flight data by the browsed city',()=>{
  const c=prepared();c.execute({type:'dispatch-plan',planeId:ID,stops:['WUH','PVG']},NOW);
  const s=c.snapshot(),v=dispatchPresentation(s,s.fleet[0],['URC'],false,false);
  expect(v.active?.to).toBe('WUH');expect(v.active?.revenue).toBe(0);expect(v.canLaunch).toBe(false);expect(v.draft).toBeNull();
 });
 it('explains invalid airport range and keeps bad drafts read-only',()=>{
  const s=prepared().snapshot(),before=structuredClone(s);
  expect(dispatchPresentation(s,s.fleet[0],['URC'],false,false).canLaunch).toBe(false);
  expect(s).toEqual(before);expect(()=>validateSave(s)).not.toThrow();
 });
 it('reports maintenance, automatic work, onward plans and turnaround truthfully',()=>{
  const s=prepared().snapshot(),p=s.fleet[0]!;
  p.energy.serviceUntil=120;expect(dispatchPresentation(s,p,['PVG'],false,false).reason).toBe('地勤补能中');
  p.energy.serviceUntil=null;p.autoRouteId='PEK-PVG';expect(dispatchPresentation(s,p,['PVG'],false,false).reason).toContain('停止自动');
  p.autoRouteId=null;p.itinerary=['PVG'];expect(dispatchPresentation(s,p,['PVG'],false,false).reason).toContain('取消剩余');
  p.itinerary=[];p.readyAt=1;expect(dispatchPresentation(s,p,['PVG'],false,false).reason).toBe('地面周转中');
 });
 it('never changes money, orders, energy, route records or clock',()=>{
  const s=prepared().snapshot(),before=structuredClone(s);
  for(const stops of [[],['WUH'],['WUH','PVG'],['PEK']]) for(const busy of [true,false]) dispatchPresentation(s,s.fleet[0],stops,false,busy);
  expect(s).toEqual(before);
 });
});
