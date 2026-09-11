import { describe, it, expect } from 'vitest';
import { GameCore, validateSave, manifest, taskProgress, type GameState } from '../src/core/game.js';
import { DISPATCHER_PRICE, resaleValue } from '../src/core/management.js';
import { guideStep } from '../src/core/onboarding.js';
import v3 from './fixtures/v3-dispatching.json';
const NOW=1800000000000, ID='AC0001';
function rich(){const s=new GameCore(NOW).snapshot();s.credits=10000000;return new GameCore(NOW,s);}
function purchase(c=rich()){c.execute({type:'buy',modelId:'lark-f',airportId:'PEK'},NOW);return c;}
function unchanged(c:GameCore,action:()=>void){const before=c.snapshot();expect(action).toThrow();expect(c.snapshot()).toEqual(before);}

describe('dispatcher contracts and real supply',()=>{
  it('staffs the starter but not new purchases',()=>{const c=purchase();expect(c.snapshot().fleet.map(p=>p.dispatcher)).toEqual([true,false]);});
  it('charges a one-time hiring fee, persists, and rejects duplicate hires',()=>{
    const c=purchase(),before=c.snapshot().credits;c.execute({type:'hire-dispatcher',planeId:'AC0002'},NOW);
    expect(c.snapshot().credits).toBe(before-DISPATCHER_PRICE);expect(validateSave(c.snapshot())).toEqual(c.snapshot());unchanged(c,()=>c.execute({type:'hire-dispatcher',planeId:'AC0002'},NOW));
  });
  it('rejects hiring without funds',()=>{const s=purchase().snapshot();s.credits=DISPATCHER_PRICE-1;const c=new GameCore(NOW,s);unchanged(c,()=>c.execute({type:'hire-dispatcher',planeId:'AC0002'},NOW));});
  it('allows unstaffed manual flight but refuses auto and in-flight hiring',()=>{
    const c=purchase();c.execute({type:'load-destination',planeId:'AC0002',to:'PVG'},NOW);
    unchanged(c,()=>c.execute({type:'dispatch',planeId:'AC0002',to:'PVG',auto:true},NOW));c.execute({type:'dispatch',planeId:'AC0002',to:'PVG',auto:false},NOW);
    expect(c.snapshot().fleet[1]!.flight).not.toBeNull();unchanged(c,()=>c.execute({type:'hire-dispatcher',planeId:'AC0002'},NOW));
  });
  it('does not require a purchased route but still requires a dispatcher before duty',()=>{const c=purchase();expect(c.snapshot().routes).toHaveLength(0);c.execute({type:'start-duty',planeId:ID,to:'PVG'},NOW);expect(c.snapshot().fleet[0]!.flight?.to).toBe('PVG');expect(c.snapshot().routes.map(r=>r.id)).toContain('PEK-PVG');unchanged(c,()=>c.execute({type:'start-duty',planeId:'AC0002',to:'PVG'},NOW));});
  it('uses existing jobs only and pays nothing on departure',()=>{
    const c=rich();const before=c.snapshot();c.execute({type:'start-duty',planeId:ID,to:'PVG'},NOW);const s=c.snapshot();
    expect(s.orders.map(o=>o.id)).toEqual(before.orders.map(o=>o.id));expect(manifest(s,ID).length).toBeGreaterThan(0);expect(s.stats.revenue).toBe(0);expect(s.fleet[0]!.flight?.revenue).toBeGreaterThan(0);
  });
  it('empty duty waits without charging until the next supply event',()=>{
    const c=rich();const s=c.snapshot();s.orders=[];const a=new GameCore(NOW,s);a.execute({type:'start-duty',planeId:ID,to:'PVG'},NOW);a.tick(NOW+60000);
    expect(a.snapshot().credits).toBe(s.credits);expect(a.snapshot().stats.flights).toBe(0);expect(a.snapshot().orders).toEqual([]);expect(a.snapshot().routes.map(r=>r.id)).toContain('PEK-PVG');expect(validateSave(a.snapshot())).toEqual(a.snapshot());
    a.tick(NOW+120000);expect(a.snapshot().fleet[0]!.flight).not.toBeNull();
  });
  it('stops future auto flights without cancelling a locked flight',()=>{
    const c=rich();c.execute({type:'start-duty',planeId:ID,to:'PVG'},NOW);const flight=c.snapshot().fleet[0]!.flight;
    unchanged(c,()=>c.execute({type:'dismiss-dispatcher',planeId:ID},NOW));c.execute({type:'stop',planeId:ID},NOW);expect(c.snapshot().fleet[0]!.flight).toEqual(flight);
    unchanged(c,()=>c.execute({type:'dismiss-dispatcher',planeId:ID},NOW));
  });
  it('dismisses without refund or order changes; rehire pays again',()=>{
    const c=rich(),s=c.snapshot();c.execute({type:'dismiss-dispatcher',planeId:ID},NOW);expect(c.snapshot().credits).toBe(s.credits);expect(c.snapshot().orders).toEqual(s.orders);
    unchanged(c,()=>c.execute({type:'dismiss-dispatcher',planeId:ID},NOW));c.execute({type:'hire-dispatcher',planeId:ID},NOW);expect(c.snapshot().credits).toBe(s.credits-DISPATCHER_PRICE);
  });
  it('rejects non-direct jobs atomically',()=>{
    const c=rich();c.execute({type:'unlock',airportId:'WUH'},NOW);c.execute({type:'load-destination',planeId:ID,to:'PVG'},NOW);
    unchanged(c,()=>c.execute({type:'start-duty',planeId:ID,to:'WUH'},NOW));
  });
  it('does not partially load when first departure cannot be paid',()=>{const c=rich();const s=c.snapshot();s.credits=0;const a=new GameCore(NOW,s);unchanged(a,()=>a.execute({type:'start-duty',planeId:ID,to:'PVG'},NOW));});
  it('has identical event outcomes across different tick sizes',()=>{
    const a=rich();a.execute({type:'start-duty',planeId:ID,to:'PVG'},NOW);const b=new GameCore(NOW,a.snapshot());a.tick(NOW+600000);
    for(let n=1;n<=60;n++)b.tick(NOW+n*10000);expect(a.snapshot()).toEqual(b.snapshot());expect(validateSave(a.snapshot())).toEqual(a.snapshot());
  });
});
describe('safe resale and lifetime fleet milestones',()=>{
  it('recovers hull and actual upgrade investment without transport income',()=>{
    const c=purchase();c.execute({type:'retrofit',planeId:'AC0002',upgrade:'engine'},NOW);const s=c.snapshot(),value=resaleValue(s.fleet[1]!);expect(value).toBe(41340);
    c.execute({type:'sell-plane',planeId:'AC0002'},NOW);expect(c.snapshot().credits).toBe(s.credits+value);expect(c.snapshot().stats).toEqual(s.stats);expect(c.snapshot().hangarSlots).toBe(s.hangarSlots);expect(c.snapshot().orders).toEqual(s.orders);
  });
  it('rejects the last plane and repeated sale',()=>{
    const c=rich();unchanged(c,()=>c.execute({type:'sell-plane',planeId:ID},NOW));c.execute({type:'buy',modelId:'lark',airportId:'PEK'},NOW);c.execute({type:'sell-plane',planeId:ID},NOW);
    unchanged(c,()=>c.execute({type:'sell-plane',planeId:ID},NOW));expect(validateSave(c.snapshot())).toEqual(c.snapshot());
  });
  it('never deletes loaded jobs on sale',()=>{
    const c=purchase();c.execute({type:'load-destination',planeId:'AC0002',to:'PVG'},NOW);unchanged(c,()=>c.execute({type:'sell-plane',planeId:'AC0002'},NOW));
    for(const o of manifest(c.snapshot(),'AC0002'))c.execute({type:'unload',planeId:'AC0002',orderId:o.id},NOW);const jobs=c.snapshot().orders;c.execute({type:'sell-plane',planeId:'AC0002'},NOW);expect(c.snapshot().orders).toEqual(jobs);
  });
  it('rejects flight and turnaround, then permits an empty ready aircraft',()=>{
    const c=purchase();c.execute({type:'dispatch',planeId:'AC0002',to:'PVG',auto:false},NOW);unchanged(c,()=>c.execute({type:'sell-plane',planeId:'AC0002'},NOW));
    const at=c.snapshot().fleet[1]!.flight!.arriveAt;c.tick(NOW+at*1000);unchanged(c,()=>c.execute({type:'sell-plane',planeId:'AC0002'},NOW+at*1000));
    c.execute({type:'sell-plane',planeId:'AC0002'},NOW+(at+8)*1000);expect(c.snapshot().fleet).toHaveLength(1);
  });
  it('rejects an empty automatic plane waiting for supply',()=>{
    const c=purchase();const s=c.snapshot();s.orders=[];const a=new GameCore(NOW,s);a.execute({type:'start-duty',planeId:ID,to:'PVG'},NOW);unchanged(a,()=>a.execute({type:'sell-plane',planeId:ID},NOW));
  });
  for(const claimFirst of [true,false])it(`keeps achieved fleet milestones after resale, claim before=${claimFirst}`,()=>{
    const c=purchase();c.execute({type:'buy',modelId:'lark',airportId:'PEK'},NOW);if(claimFirst)c.execute({type:'claim',taskId:'three-planes'},NOW);
    c.execute({type:'sell-plane',planeId:'AC0002'},NOW);expect(taskProgress(c.snapshot(),'three-planes')).toBe(3);const r=new GameCore(NOW,c.snapshot());
    if(!claimFirst)r.execute({type:'claim',taskId:'three-planes'},NOW);expect(validateSave(r.snapshot())).toEqual(r.snapshot());unchanged(r,()=>r.execute({type:'claim',taskId:'three-planes'},NOW));
  });
  it('never reuses plane ids or changes other crew contracts',()=>{
    const c=purchase();c.execute({type:'sell-plane',planeId:ID},NOW);c.execute({type:'buy',modelId:'lark',airportId:'PEK'},NOW);expect(c.snapshot().fleet.map(p=>p.id)).toEqual(['AC0002','AC0003']);expect(c.snapshot().fleet.map(p=>p.dispatcher)).toEqual([false,false]);
  });
  it('frees a full hangar without losing permanent capacity',()=>{
    const c=purchase();for(let i=0;i<2;i++)c.execute({type:'buy',modelId:'lark',airportId:'PEK'},NOW);c.execute({type:'sell-plane',planeId:'AC0002'},NOW);c.execute({type:'buy',modelId:'lark',airportId:'PEK'},NOW);expect(c.snapshot().fleet.length).toBe(4);expect(c.snapshot().fleetPeak).toBe(4);
  });
});
describe('migration and strict invariants',()=>{
  it('preserves all v3 identities, clocks, locked flights and auto privileges',()=>{
    const s=new GameCore(NOW,v3).snapshot();expect(s.version).toBe(4);expect(s.tutorial).toBe('skipped');expect(s.fleetPeak).toBe(v3.fleet.length);
    expect(s.fleet.map(({dispatcher:_d,...p})=>p)).toEqual(v3.fleet);expect(s.orders).toEqual(v3.orders);expect(s.credits).toBe(v3.credits);expect(s.lastWallTime).toBe(v3.lastWallTime);expect(s.fleet.every(p=>p.dispatcher)).toBe(true);expect(validateSave(s)).toEqual(s);
  });
  it('imports without old wall-clock income and resumes only once',()=>{
    const c=GameCore.imported(v3,NOW+1e9);expect(c.snapshot().stats).toEqual(v3.stats);expect(c.snapshot().lastWallTime).toBe(NOW+1e9);
    c.tick(NOW+1e9+200000);const s=c.snapshot(),again=new GameCore(s.lastWallTime,s);again.tick(s.lastWallTime);expect(again.snapshot()).toEqual(s);
  });
  const mutations:[string,(s:GameState)=>void][]=[
    ['dispatcher string',s=>{(s.fleet[0] as unknown as {dispatcher:unknown}).dispatcher='yes';}],
    ['low peak',s=>{s.fleetPeak=0;}],['excess peak',s=>{s.fleetPeak=17;}],
    ['unearned completion',s=>{s.tutorial='completed';}],['unknown tutorial',s=>{(s as unknown as {tutorial:unknown}).tutorial='surprise';}],
    ['unearned fleet task',s=>{s.claimedTasks=['three-planes'];}],
    ['unstaffed auto',s=>{s.routes=[{id:'PEK-PVG',from:'PEK',to:'PVG'}];s.fleet[0]!.autoRouteId='PEK-PVG';s.fleet[0]!.dispatcher=false;}],
    ['orphan job',s=>{s.orders[0]!.location='AC9999';s.orders[0]!.expiresAt=null;}]
  ];
  for(const [name,fn] of mutations)it(`rejects ${name}`,()=>{const s=new GameCore(NOW).snapshot();fn(s);expect(()=>validateSave(s)).toThrow();});
});
describe('non-destructive onboarding',()=>{
  it('starts and skips without changing cash, jobs or stats',()=>{
    const c=new GameCore(NOW),s=c.snapshot();expect(s.tutorial).toBe('available');c.execute({type:'tutorial',action:'start'},NOW);expect(c.snapshot().tutorial).toBe('active');
    c.execute({type:'tutorial',action:'skip'},NOW);expect(c.snapshot().credits).toBe(s.credits);expect(c.snapshot().orders).toEqual(s.orders);expect(c.snapshot().stats).toEqual(s.stats);expect(new GameCore(NOW,c.snapshot()).snapshot().tutorial).toBe('skipped');
  });
  it('requires real first-flight reward and derives steps from actual state',()=>{
    const c=new GameCore(NOW);unchanged(c,()=>c.execute({type:'tutorial',action:'finish'},NOW));c.execute({type:'tutorial',action:'start'},NOW);
    const step=()=>guideStep(c.snapshot(),c.snapshot().fleet[0]!,'airport','PVG');expect(step().id).toBe('load');c.execute({type:'load-destination',planeId:ID,to:'PVG'},NOW);expect(step().id).toBe('map');
    c.execute({type:'dispatch',planeId:ID,to:'PVG',auto:false},NOW);expect(step().id).toBe('flight');c.tick(NOW+200000);expect(step().id).toBe('reward');c.execute({type:'claim',taskId:'first-flight'},NOW+200000);expect(step().id).toBe('done');
    const cash=c.snapshot().credits;c.execute({type:'tutorial',action:'finish'},NOW+200000);expect(c.snapshot().credits).toBe(cash);expect(validateSave(c.snapshot())).toEqual(c.snapshot());
  });
  it('rejects unknown tutorial operations',()=>{const c=new GameCore(NOW);unchanged(c,()=>c.execute({type:'tutorial',action:'invalid'} as never,NOW));});
});
