import { describe, expect, it } from 'vitest';
import { GameCore, validateSave, manifest, waiting, quote, loadSummary, DEMAND_INTERVAL, TURNAROUND, type GameState } from '../src/core/game.js';
import { aircraftSpecs, STARTER_MODEL } from '../src/core/catalog.js';
import legacy from './fixtures/v1-flying.json';
const NOW = 1800000000000;
const send = (c: GameCore, to: string, planeId = 'AC0001') => {
  const now = c.snapshot().lastWallTime, from = c.snapshot().fleet.find(p => p.id === planeId)!.airportId;
  c.execute({ type: 'route', from, to }, now); c.execute({ type: 'dispatch', planeId, to, auto: false }, now);
  const f = c.snapshot().fleet.find(p => p.id === planeId)!.flight!;
  c.tick(now + (f.arriveAt - c.snapshot().simTime + TURNAROUND) * 1000);
};
describe('persistent passenger and cargo orders', () => {
  it('starts with visible supply but no invented onboard load or flight revenue', () => {
    const s = new GameCore(NOW).snapshot(); expect(waiting(s,'PEK')).toHaveLength(12); expect(manifest(s,'AC0001')).toHaveLength(0);
    expect(s.fleet[0]!.modelId).toBe(STARTER_MODEL.id);
    expect(aircraftSpecs(s.fleet[0]!)).toMatchObject({ seats: 6, cargo: 1 });
    expect(waiting(s,'PEK').every(o => o.amount === 1)).toBe(true);
    expect(quote(s,s.fleet[0]!,'PVG').revenue).toBe(0); expect(validateSave(s)).toEqual(s);
  });
  it('moves the same order between airport and plane and forbids double loading', () => {
    const c = new GameCore(NOW), o = waiting(c.snapshot(),'PEK')[0]!;
    c.execute({type:'load',planeId:'AC0001',orderId:o.id},NOW);
    expect(manifest(c.snapshot(),'AC0001')[0]).toMatchObject({id:o.id,expiresAt:null,reward:o.reward});
    const before = c.snapshot(); expect(()=>c.execute({type:'load',planeId:'AC0001',orderId:o.id},NOW)).toThrow(); expect(c.snapshot()).toEqual(before);
    c.execute({type:'unload',planeId:'AC0001',orderId:o.id},NOW); expect(waiting(c.snapshot(),'PEK').find(x=>x.id===o.id)?.expiresAt).toBeNull();
  });
  it('enforces separate small starter capacities with unit orders', () => {
    const c = new GameCore(NOW);c.execute({type:'load-destination',planeId:'AC0001',to:'PVG'},NOW);
    expect(loadSummary(c.snapshot(),'AC0001')).toEqual({passengers:6,cargo:1});
    for(const o of waiting(c.snapshot(),'PEK'))expect(()=>c.execute({type:'load',planeId:'AC0001',orderId:o.id},NOW)).toThrow(/容量/);
  });
  it('cannot steal an order at another airport', () => {
    const c=new GameCore(NOW),o=waiting(c.snapshot(),'PVG')[0]!;expect(()=>c.execute({type:'load',planeId:'AC0001',orderId:o.id},NOW)).toThrow();
  });
  it('cannot unload while flying',()=>{
    const c=new GameCore(NOW);c.execute({type:'load-destination',planeId:'AC0001',to:'PVG'},NOW);c.execute({type:'route',from:'PEK',to:'PVG'},NOW);c.execute({type:'dispatch',planeId:'AC0001',to:'PVG',auto:false},NOW);
    const o=manifest(c.snapshot(),'AC0001')[0]!;expect(()=>c.execute({type:'unload',planeId:'AC0001',orderId:o.id},NOW)).toThrow(/飞行/);
  });
  it('pays only at final destination and transfers the same order to another plane',()=>{
    const c=new GameCore(NOW),o=waiting(c.snapshot(),'PEK')[0]!;
    c.execute({type:'unlock',airportId:'WUH'},NOW);c.execute({type:'buy',modelId:'lark',airportId:'WUH'},NOW);
    const second=c.snapshot().fleet[1]!.id;c.execute({type:'load',planeId:'AC0001',orderId:o.id},NOW);
    send(c,'WUH');expect(c.snapshot().stats.revenue).toBe(0);expect(manifest(c.snapshot(),'AC0001')[0]!.id).toBe(o.id);
    const now=c.snapshot().lastWallTime;c.execute({type:'unload',planeId:'AC0001',orderId:o.id},now);
    c.execute({type:'load',planeId:second,orderId:o.id},now);expect(quote(c.snapshot(),c.snapshot().fleet[1]!,'PVG').revenue).toBe(o.reward);
    send(c,'PVG',second);expect(c.snapshot().stats.revenue).toBe(o.reward);expect(c.snapshot().stats.passengers).toBe(o.amount);expect(c.snapshot().orders.some(x=>x.id===o.id)).toBe(false);
    const saved=c.snapshot();c.tick(saved.lastWallTime);expect(c.snapshot()).toEqual(saved);expect(()=>validateSave(saved)).not.toThrow();
  });
  it('expires only unaccepted jobs, keeping accepted jobs through offline time',()=>{
    const c=new GameCore(NOW),o=waiting(c.snapshot(),'PEK')[0]!;c.execute({type:'load',planeId:'AC0001',orderId:o.id},NOW);
    c.tick(NOW+28800000);expect(manifest(c.snapshot(),'AC0001')[0]!.id).toBe(o.id);expect(waiting(c.snapshot(),'PEK').length).toBeLessThanOrEqual(24);expect(()=>validateSave(c.snapshot())).not.toThrow();
  });
  it('handles expiry not aligned with refresh and matches stepped simulation',()=>{
    const a=new GameCore(NOW);a.execute({type:'unlock',airportId:'WUH'},NOW+13000);const b=new GameCore(NOW+13000,a.snapshot());
    for(let i=14;i<=900;i++)a.tick(NOW+i*1000);b.tick(NOW+900000);expect(a.snapshot()).toEqual(b.snapshot());expect(()=>validateSave(a.snapshot())).not.toThrow();
  });
  it('automatic dispatch waits for real supply rather than generating free flights',()=>{
    const c=new GameCore(NOW);c.execute({type:'route',from:'PEK',to:'PVG'},NOW);const s=c.snapshot();s.orders=[];s.fleet[0]!.autoRouteId='PEK-PVG';const auto=new GameCore(NOW,s);
    auto.tick(NOW+60000);expect(auto.snapshot().stats.flights).toBe(0);expect(auto.snapshot().credits).toBe(s.credits);expect(()=>validateSave(auto.snapshot())).not.toThrow();
    auto.tick(NOW+DEMAND_INTERVAL*1000);expect(auto.snapshot().fleet[0]!.flight?.passengers).toBeGreaterThan(0);expect(waiting(auto.snapshot(),'PEK').length).toBeLessThan(12);
  });
  it('rejects a manifest that cannot be served by direct automatic return',()=>{
    const c=new GameCore(NOW),o=waiting(c.snapshot(),'PEK')[0]!;c.execute({type:'unlock',airportId:'WUH'},NOW);c.execute({type:'load',planeId:'AC0001',orderId:o.id},NOW);c.execute({type:'route',from:'PEK',to:'WUH'},NOW);
    expect(()=>c.execute({type:'dispatch',planeId:'AC0001',to:'WUH',auto:true},NOW)).toThrow(/中转/);
  });
});
describe('save v2 and legacy migration',()=>{
  it('migrates a fixed v1 flight fixture without changing money or locked revenue',()=>{
    const c=new GameCore(NOW,legacy),s=c.snapshot();expect(s.version).toBe(5);expect(s.credits).toBe(legacy.credits);expect(s.fleet.map(({upgrades: _u,itinerary: _i,dispatcher: _d,energy: _e,...p})=>p)).toEqual(legacy.fleet);
    expect(s.orders.filter(o=>o.location==='AC0001').reduce((n,o)=>n+o.reward,0)).toBe(legacy.fleet[0]!.flight!.revenue);
    c.tick(NOW+legacy.fleet[0]!.flight!.arriveAt*1000);expect(c.snapshot().stats.revenue).toBe(legacy.fleet[0]!.flight!.revenue);expect(()=>validateSave(c.snapshot())).not.toThrow();
  });
  it('does not refill or migrate an already converted v2 save',()=>{
    const s=validateSave(legacy);expect(validateSave(s)).toEqual(s);
  });
  it('rejects bad v1 before migration and does not advance an imported clock',()=>{
    expect(()=>validateSave({...legacy,credits:-1})).toThrow();const c=GameCore.imported(legacy,NOW+86400000);expect(c.tick(NOW+86400000).flights).toBe(0);
  });
  const mutations:[string,(s:GameState)=>void][]=[
    ['duplicated job',s=>s.orders.push(structuredClone(s.orders[0]!))],['bad location',s=>{s.orders[0]!.location='AC9999';}],
    ['forged payment',s=>{s.orders[0]!.reward+=999;}],['negative quantity',s=>{s.orders[0]!.amount=-1;}],
    ['expired job',s=>{s.orders[0]!.expiresAt=0;}],['invalid clock',s=>{s.nextDemandAt=s.simTime;}],
    ['reused sequence',s=>{s.nextOrderId=1;}],['locked destination',s=>{s.orders[0]!.to='URC';}],
    ['unknown field',s=>{Object.assign(s.orders[0]!,{surprise:1});}],['inconsistent manifest',s=>{s.fleet[0]!.flight!.passengers++;}]
  ];
  it.each(mutations)('rejects %s',(_name,mutate)=>{const s=validateSave(legacy);mutate(s);expect(()=>validateSave(s)).toThrow();});
});
