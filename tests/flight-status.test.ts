import { describe, expect, it } from 'vitest';
import { GameCore, manifest, planQuote, validateSave } from '../src/core/game.js';
import { currentFlight, flightStatus, fleetStatuses } from '../src/ui/flight-status.js';
const NOW = 1_800_000_000_000, ID = 'AC0001';
function prepared() {
  const c = new GameCore(NOW);
  c.execute({type:'unlock',airportId:'WUH'},NOW);
  c.execute({type:'buy',modelId:'swift-f',airportId:'PEK'},NOW);
  c.execute({type:'load-destination',planeId:ID,to:'PVG'},NOW);
  c.execute({type:'open-plan-routes',planeId:ID,stops:['WUH','PVG','PEK']},NOW);
  return c;
}
function flying() { const c = prepared(); c.execute({type:'dispatch-plan',planeId:ID,stops:['WUH','PVG','PEK']},NOW); return c; }
describe('locked flight presentation',()=>{
  it('shows no flight ledger for a parked aircraft',()=>{
    const s=prepared().snapshot();expect(currentFlight(s,s.fleet[0]!)).toBeNull();expect(flightStatus(s,s.fleet[0]!).phase).toBe('ready');
  });
  it('uses this leg revenue, not the value of all cargo on board',()=>{
    const s=flying().snapshot(),p=s.fleet[0]!,f=currentFlight(s,p)!;
    expect(manifest(s,p.id).reduce((n,o)=>n+o.reward,0)).toBeGreaterThan(0);
    expect(f.revenue).toBe(0);expect(f.cost).toBe(p.flight!.cost);expect(f.profit).toBe(-f.cost);
    expect(f.from).toBe('PEK');expect(f.to).toBe('WUH');expect(f.passengers).toBe(p.flight!.passengers);
  });
  it('does not recalculate a locked flight from later model parameters',()=>{
    const s=flying().snapshot(),p=s.fleet[0]!,before=currentFlight(s,p);
    // A deliberately inconsistent view fixture proves that no quote is called here.
    p.upgrades.engine=3;p.upgrades.efficiency=3;
    expect(currentFlight(s,p)).toEqual(before);
  });
  it('advances visual progress without altering the locked values',()=>{
    const c=flying(),before=c.snapshot(),p=before.fleet[0]!,f=p.flight!;
    c.tick(NOW+(f.arriveAt-f.departAt)*500);const s=c.snapshot(),view=currentFlight(s,s.fleet[0]!)!;
    expect(view.progress).toBeCloseTo(.5);expect(view.remaining).toBeCloseTo(view.duration/2);
    expect(view.cost).toBe(f.cost);expect(view.revenue).toBe(f.revenue);
  });
  it('bounds visual progress and remaining time defensively',()=>{
    const s=flying().snapshot(),p=s.fleet[0]!;
    s.simTime=p.flight!.departAt-1;expect(currentFlight(s,p)!.progress).toBe(0);
    s.simTime=p.flight!.arriveAt+1;expect(currentFlight(s,p)!.progress).toBe(1);expect(currentFlight(s,p)!.remaining).toBe(0);
    p.flight!.arriveAt=p.flight!.departAt;expect(Number.isFinite(currentFlight(s,p)!.progress)).toBe(true);
  });
  it('displays the next leg only when the core actually departs',()=>{
    const c=prepared(),initial=c.snapshot(),q=planQuote(initial,initial.fleet[0]!,['WUH','PVG','PEK']);
    c.execute({type:'dispatch-plan',planeId:ID,stops:['WUH','PVG','PEK']},NOW);
    c.tick(NOW+q.legs[0]!.duration*1000);let s=c.snapshot();
    expect(currentFlight(s,s.fleet[0]!)).toBeNull();expect(flightStatus(s,s.fleet[0]!).phase).toBe('planned');
    c.tick(NOW+(q.legs[0]!.duration+8)*1000);s=c.snapshot();
    expect(currentFlight(s,s.fleet[0]!)!.revenue).toBe(q.legs[1]!.revenue);
    expect(currentFlight(s,s.fleet[0]!)!.to).toBe('PVG');
  });
  it('stopping automation or cancelling a plan does not rewrite a flight ledger',()=>{
    const c=flying(),s=c.snapshot(),view=currentFlight(s,s.fleet[0]!);
    c.execute({type:'cancel-plan',planeId:ID},NOW);c.execute({type:'stop',planeId:ID},NOW);
    const after=c.snapshot();expect(currentFlight(after,after.fleet[0]!)).toEqual(view);
  });
  it('reload preserves the same locked costs and income',()=>{
    const s=flying().snapshot(),c=new GameCore(NOW,validateSave(s));c.tick(NOW);
    expect(currentFlight(c.snapshot(),c.snapshot().fleet[0]!)).toEqual(currentFlight(s,s.fleet[0]!));
    expect(c.snapshot().stats).toEqual(s.stats);
  });
});
describe('fleet state navigation',()=>{
  it('filters only truly ready planes, with stable original order',()=>{
    const s=flying().snapshot();expect(fleetStatuses(s,'all').map(v=>v.planeId)).toEqual(s.fleet.map(p=>p.id));
    expect(fleetStatuses(s,'ready').map(v=>v.planeId)).toEqual([s.fleet[1]!.id]);
    expect(fleetStatuses(s,'flying').map(v=>v.planeId)).toEqual([ID]);
  });
  it('does not call a turning aircraft ready until its deadline',()=>{
    const c=flying(),first=c.snapshot().fleet[0]!.flight!;c.execute({type:'cancel-plan',planeId:ID},NOW);
    c.tick(NOW+first.arriveAt*1000);let s=c.snapshot();expect(flightStatus(s,s.fleet[0]!).phase).toBe('turnaround');
    expect(fleetStatuses(s,'ready')).toHaveLength(1);c.tick(NOW+(first.arriveAt+8)*1000);s=c.snapshot();expect(fleetStatuses(s,'ready')).toHaveLength(2);
  });
  it('does not invent a new flight or income while an automatic route waits',()=>{
    let s=prepared().snapshot();s.orders=[];const c=new GameCore(NOW,s);
    c.execute({type:'hire-dispatcher',planeId:ID},NOW);c.execute({type:'start-duty',planeId:ID,to:'PVG'},NOW);s=c.snapshot();const row=flightStatus(s,s.fleet[0]!);
    expect(row.phase).toBe('automatic');expect(row.nextEvent).toBe('下次调度检查');expect(row.flight).toBeNull();
    expect(row.remaining).toBe(s.nextDemandAt-s.simTime);expect(row.to).toBe('PVG');expect(fleetStatuses(s,'ready')).toHaveLength(1);
  });
  it('keeps planned ground layovers out of the ready filter',()=>{
    const c=flying(),f=c.snapshot().fleet[0]!.flight!;c.tick(NOW+f.arriveAt*1000);
    const s=c.snapshot(),v=flightStatus(s,s.fleet[0]!);expect(v.phase).toBe('planned');expect(v.to).toBe('PVG');expect(v.onward).toEqual(['PVG','PEK']);
  });
  it('removes sold planes without losing references to surviving aircraft',()=>{
    const c=prepared(),second=c.snapshot().fleet[1]!.id;c.execute({type:'sell-plane',planeId:second},NOW);
    expect(fleetStatuses(c.snapshot()).map(v=>v.planeId)).toEqual([ID]);
  });
  it('viewing and filtering cannot mutate money, orders, itinerary or time',()=>{
    const c=flying(),s=c.snapshot(),before=structuredClone(s);
    for(const filter of ['all','ready','flying'] as const)fleetStatuses(s,filter);
    const row=flightStatus(s,s.fleet[0]!);row.onward.push('URC');
    expect(s).toEqual(before);expect(c.snapshot()).toEqual(before);
  });
});
