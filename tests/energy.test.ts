import { GameCore, flightEnergy } from '../src/core/game.js';
import orderedV4 from './fixtures/v4-ordered-route.json' with { type: 'json' };
import { describe, expect, it } from 'vitest';
import { validateSave, quote, manifest, planQuote, type Command } from '../src/core/game.js';
import { ENERGY_SERVICE_SECONDS as SERVICE, energyRequired, energyDepartureReason } from '../src/core/energy.js';
import { flightStatus, fleetStatuses } from '../src/ui/flight-status.js';
import { loadingLock } from '../src/ui/order-presentation.js';
import oldSave from './fixtures/v4-energy-migration.json';
const CAP = 12000;
const fullEnergy = () => ({availableSeconds:CAP,reservedSeconds:0,serviceUntil:null});
const required = (seconds = amount()) => flightEnergy(prepared().snapshot().fleet[0]!, seconds);
const NOW = 1_800_000_000_000, ID = 'AC0001';
function prepared() {
  const c = new GameCore(NOW);
  c.execute({type:'hire-dispatcher',planeId:ID},NOW);
  c.execute({type:'load-destination',planeId:ID,to:'PVG'},NOW);
  return c;
}
function withEnergy(seconds: number) {
  const s = prepared().snapshot(); s.fleet[0]!.energy.availableSeconds = seconds;
  return new GameCore(NOW,s);
}
function amount() { const s = prepared().snapshot(); return quote(s,s.fleet[0]!,'PVG').duration; }
function dispatch(c: GameCore, auto = false) { c.execute({type:'dispatch',planeId:ID,to:'PVG',auto},NOW); }
function serviceCore() {
  const c = withEnergy(13); c.execute({type:'service-energy',planeId:ID},NOW); return c;
}
describe('reference rate and safe flight reservation', () => {
  it('uses a 200-point starter budget and whole-minute flight charge', () => {
    expect(energyRequired(60)).toBe(60); expect(CAP).toBe(12000); expect(required(119)).toBe(60); expect(required(120)).toBe(120);
    expect(energyRequired(30)+energyRequired(30)).toBe(energyRequired(60));
    expect(energyRequired(77)).toBe(77);
  });
  it.each([-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])('rejects invalid flight seconds %s', value => {
    expect(()=>energyRequired(value)).toThrow('无效');
  });
  it('creates independent full budgets for initial and purchased aircraft', () => {
    const c=prepared(); dispatch(c); c.execute({type:'buy',modelId:'swift-f',airportId:'PEK'},NOW);
    const s=c.snapshot(); expect(s.fleet[0]!.energy.availableSeconds).toBe(CAP-required());
    expect(s.fleet[1]!.energy).toEqual({...fullEnergy(),availableSeconds:12000});
  });
  it('reserves exact integer seconds once and does not spend them again on arrival or reload', () => {
    const c=prepared(),s0=c.snapshot(),q=quote(s0,s0.fleet[0]!,'PVG');dispatch(c);
    const s=c.snapshot();expect(s.fleet[0]!.energy).toEqual({availableSeconds:CAP-required(q.duration),reservedSeconds:required(q.duration),serviceUntil:null});
    const restored=new GameCore(NOW,s);restored.tick(NOW+q.duration*1000);
    expect(restored.snapshot().fleet[0]!.energy).toEqual({availableSeconds:CAP-required(q.duration),reservedSeconds:0,serviceUntil:null});
    const after=restored.snapshot();expect(restored.tick(NOW+q.duration*1000).revenue).toBe(0);expect(restored.snapshot()).toEqual(after);
  });
  it.each([51.003, 90.247, 1000.123])('preserves exact reservations at fractional simulation time %s', seconds => {
    const c=prepared();c.execute({type:'dispatch',planeId:ID,to:'PVG',auto:false},NOW+seconds*1000);
    const s=c.snapshot();expect(()=>validateSave(s)).not.toThrow();expect(s.fleet[0]!.energy.reservedSeconds).toBe(required());
  });
  it('allows exactly enough energy and delivers without cancelling in midair', () => {
    const c=withEnergy(required());dispatch(c);expect(c.snapshot().fleet[0]!.energy.availableSeconds).toBe(0);
    expect(()=>validateSave(c.snapshot())).not.toThrow();c.tick(NOW+amount()*1000);
    expect(c.snapshot().stats.flights).toBe(1);expect(c.snapshot().fleet[0]!.airportId).toBe('PVG');
  });
  it('rejects a one-second shortage without deducting money, moving cargo or changing orders', () => {
    const c=withEnergy(required()-1),s=c.snapshot();expect(()=>dispatch(c)).toThrow('能量不足');expect(c.snapshot()).toEqual(s);
  });
  it('cannot reserve energy when the same command fails for insufficient money', () => {
    const s=prepared().snapshot();s.credits=0;const c=new GameCore(NOW,s),before=c.snapshot();
    expect(()=>dispatch(c)).toThrow('运营资金不足');expect(c.snapshot()).toEqual(before);
  });
  it('charges empty positioning flights by duration too', () => {
    const c=new GameCore(NOW);c.execute({type:'route',from:'PEK',to:'PVG'},NOW);dispatch(c);
    expect(c.snapshot().fleet[0]!.energy.availableSeconds).toBe(CAP-required());expect(c.snapshot().fleet[0]!.flight!.revenue).toBe(0);
  });
  it('faster engines reduce flight duration and its energy requirement, not alter the rate', () => {
    const c=prepared(),before=amount();c.execute({type:'retrofit',planeId:ID,upgrade:'engine'},NOW);const s=c.snapshot(),q=quote(s,s.fleet[0]!,'PVG');
    expect(q.duration).toBeLessThan(before);dispatch(c);expect(c.snapshot().fleet[0]!.energy.availableSeconds).toBe(CAP-required(q.duration));
  });
  it('previewing routes cannot reserve any energy', () => {
    const c=prepared(),s=c.snapshot(),before=structuredClone(s);quote(s,s.fleet[0]!,'PVG');planQuote(s,s.fleet[0]!,['PVG','PEK']);
    expect(s).toEqual(before);expect(energyDepartureReason({...fullEnergy(),availableSeconds:1},amount())).toContain('能量不足');
  });
});
describe('automatic and multi-leg energy boundaries', () => {
  it('stops the following auto leg at the real airport and preserves its loaded jobs', () => {
    const c=withEnergy(required()*2-1);dispatch(c,true);const s0=c.snapshot(),first=s0.fleet[0]!.flight!;
    c.tick(NOW+(first.arriveAt+8)*1000);const s=c.snapshot(),p=s.fleet[0]!;
    expect(p.flight).toBeNull();expect(p.autoRouteId).toBeNull();expect(p.airportId).toBe('PVG');
    expect(p.energy.availableSeconds).toBe(required()-1);expect(s.stats.costs).toBe(first.cost);expect(s.stats.flights).toBe(1);
    expect(manifest(s,ID).length).toBeGreaterThan(0);expect(s.log[0]!.text).toContain('能量不足');expect(()=>validateSave(s)).not.toThrow();
  });
  it('starting duty with supply and low energy is wholly rejected, including its automatic load', () => {
    const s=withEnergy(0).snapshot();for(const o of s.orders)if(o.location===ID)o.location='PEK';
    const c=new GameCore(NOW,s),before=c.snapshot();expect(()=>c.execute({type:'start-duty',planeId:ID,to:'PVG'},NOW)).toThrow('能量不足');expect(c.snapshot()).toEqual(before);
  });
  it('empty auto waiting spends no energy and stops only when real supply makes a flight possible', () => {
    const s=withEnergy(0).snapshot();s.orders=[];const c=new GameCore(NOW,s);c.execute({type:'start-duty',planeId:ID,to:'PVG'},NOW);
    expect(c.snapshot().fleet[0]!.autoRouteId).not.toBeNull();c.tick(NOW+119000);expect(c.snapshot().stats.flights).toBe(0);
    c.tick(NOW+120000);expect(c.snapshot().fleet[0]!.autoRouteId).toBeNull();expect(c.snapshot().fleet[0]!.energy.availableSeconds).toBe(0);
  });
  it('a finite plan reserves only the departing leg and retains onward cargo when energy ends', () => {
    const c=prepared();c.execute({type:'unlock',airportId:'WUH'},NOW);c.execute({type:'open-plan-routes',planeId:ID,stops:['WUH','PVG']},NOW);
    const s=c.snapshot(),q=planQuote(s,s.fleet[0]!,['WUH','PVG']);s.fleet[0]!.energy.availableSeconds=required(q.legs[0]!.duration);
    const run=new GameCore(NOW,s);run.execute({type:'dispatch-plan',planeId:ID,stops:['WUH','PVG']},NOW);
    expect(run.snapshot().fleet[0]!.energy.availableSeconds).toBe(0);run.tick(NOW+(q.legs[0]!.duration+8)*1000);
    const after=run.snapshot();expect(after.fleet[0]!.airportId).toBe('WUH');expect(after.fleet[0]!.itinerary).toEqual([]);
    expect(after.stats.revenue).toBe(0);expect(manifest(after,ID)).toHaveLength(manifest(s,ID).length);expect(after.log[0]!.text).toContain('能量不足');
  });
  it('stopping in flight never refunds the energy reserved for that flight', () => {
    const c=prepared();dispatch(c,true);const e=c.snapshot().fleet[0]!.energy;c.execute({type:'stop',planeId:ID},NOW);
    expect(c.snapshot().fleet[0]!.energy).toEqual(e);expect(c.snapshot().fleet[0]!.flight).not.toBeNull();
  });
});
describe('explicit ground service and event recovery', () => {
  it('neither loading nor ground waiting consumes energy', () => {
    const c=prepared(),e=c.snapshot().fleet[0]!.energy;c.tick(NOW+3600000);expect(c.snapshot().fleet[0]!.energy).toEqual(e);
  });
  it('full batteries cannot queue free services', () => {
    const c=prepared();expect(()=>c.execute({type:'service-energy',planeId:ID},NOW)).toThrow('已满');
  });
  it('completes once at the exact deadline without touching money or orders', () => {
    const c=serviceCore(),before=c.snapshot();c.tick(NOW+(SERVICE-1)*1000);expect(c.snapshot().fleet[0]!.energy.availableSeconds).toBe(13);
    c.tick(NOW+SERVICE*1000);const s=c.snapshot();expect(s.fleet[0]!.energy).toEqual(fullEnergy());expect(s.credits).toBe(before.credits);
    expect(manifest(s,ID)).toEqual(manifest(before,ID));expect(s.stats).toEqual(before.stats);c.tick(NOW+SERVICE*1000);expect(c.snapshot()).toEqual(s);
  });
  it('cancelling midway retains exactly the old energy and removes the pending refill', () => {
    const c=serviceCore();c.execute({type:'cancel-energy-service',planeId:ID},NOW+60000);c.tick(NOW+SERVICE*1000);
    expect(c.snapshot().fleet[0]!.energy).toEqual({availableSeconds:13,reservedSeconds:0,serviceUntil:null});
    expect(()=>c.execute({type:'cancel-energy-service',planeId:ID},NOW+SERVICE*1000)).toThrow('没有进行补能');
  });
  it('reload resumes the same deadline, with no repeated refill or forced autodeparture', () => {
    const c=serviceCore(),s=c.snapshot(),loaded=new GameCore(NOW+60000,validateSave(s));loaded.tick(NOW+SERVICE*1000);
    expect(loaded.snapshot().fleet[0]!.energy).toEqual(fullEnergy());expect(loaded.snapshot().fleet[0]!.flight).toBeNull();expect(loaded.snapshot().stats.flights).toBe(0);
  });
  it('an explicit imported service uses its remaining simulation time rather than file wall age', () => {
    const c=serviceCore();c.tick(NOW+60000);const imported=GameCore.imported(c.snapshot(),NOW+999000);
    imported.tick(NOW+999000);expect(imported.snapshot().fleet[0]!.energy.availableSeconds).toBe(13);
    imported.tick(NOW+1059000);expect(imported.snapshot().fleet[0]!.energy).toEqual(fullEnergy());
  });
  it('batch and small-step clocks produce the identical service and supply results', () => {
    const a=serviceCore(),b=serviceCore();for(let t=1;t<=240;t++)a.tick(NOW+t*1000);b.tick(NOW+240000);expect(a.snapshot()).toEqual(b.snapshot());
  });
  it('cannot refill during a flight, turnaround, auto duty or an onward plan', () => {
    const c=prepared();dispatch(c,true);expect(()=>c.execute({type:'service-energy',planeId:ID},NOW)).toThrow('飞行');
    c.execute({type:'stop',planeId:ID},NOW);c.tick(NOW+amount()*1000);expect(()=>c.execute({type:'service-energy',planeId:ID},NOW+amount()*1000)).toThrow('周转');
    const s=prepared().snapshot();s.orders=[];s.fleet[0]!.energy.availableSeconds=13;const waiting=new GameCore(NOW,s);
    waiting.execute({type:'start-duty',planeId:ID,to:'PVG'},NOW);expect(()=>waiting.execute({type:'service-energy',planeId:ID},NOW)).toThrow();
  });
  it('service is not a ready aircraft and exposes a truthful loading lock', () => {
    const s=serviceCore().snapshot(),p=s.fleet[0]!;expect(flightStatus(s,p).phase).toBe('service');expect(fleetStatuses(s,'ready')).toEqual([]);
    expect(loadingLock(s,p)).toContain('补能');
  });
  it.each<Command>([
    {type:'dispatch',planeId:ID,to:'PVG',auto:false},{type:'load-destination',planeId:ID,to:'PVG'},
    {type:'retrofit',planeId:ID,upgrade:'engine'},{type:'dismiss-dispatcher',planeId:ID},{type:'sell-plane',planeId:ID},
    {type:'dispatch-plan',planeId:ID,stops:['PVG']},{type:'start-duty',planeId:ID,to:'PVG'}
  ])('blocks incompatible command $type while servicing',command=>{
    const c=serviceCore(),before=c.snapshot();expect(()=>c.execute(command,NOW)).toThrow('补能');expect(c.snapshot()).toEqual(before);
  });
});
describe('strict current saves and rejected retired flights', () => {
  it.each([oldSave, orderedV4])('rejects retired flights without modifying their input', old => {
    const before=structuredClone(old);expect(()=>validateSave(old)).toThrow('不再支持');expect(old).toEqual(before);
  });
  it('current save reload does not regrant energy or reset an unfinished service', () => {
    const s=serviceCore().snapshot();expect(validateSave(s)).toEqual(s);
  });
  it.each([-1,0.1,NaN,Infinity,CAP+1])('rejects corrupt balances %s instead of silently refilling',balance=>{
    const s=prepared().snapshot();s.fleet[0]!.energy.availableSeconds=balance;expect(()=>validateSave(s)).toThrow();
  });
  it.each([0,-1,SERVICE+1,Infinity,NaN])('rejects invalid service deadlines %s',time=>{
    const s=serviceCore().snapshot();s.fleet[0]!.energy.serviceUntil=time;expect(()=>validateSave(s)).toThrow();
  });
  it('requires exact energy fields and rejects a fake older schema with new fields still present', () => {
    const s=prepared().snapshot() as unknown as Record<string,unknown>,p=(s.fleet as Record<string,unknown>[])[0]!;
    delete p.energy;expect(()=>validateSave(s)).toThrow();
    const fake={...prepared().snapshot(),version:4};expect(()=>validateSave(fake)).toThrow();
  });
  it('rejects orphan reservations, overcapacity and service plus a live flight', () => {
    const s=prepared().snapshot();s.fleet[0]!.energy.reservedSeconds=1;expect(()=>validateSave(s)).toThrow();
    const c=prepared();dispatch(c);const flying=c.snapshot();flying.fleet[0]!.energy.availableSeconds=CAP;expect(()=>validateSave(flying)).toThrow();
    const another=c.snapshot();another.fleet[0]!.energy.serviceUntil=SERVICE;expect(()=>validateSave(another)).toThrow();
  });
});

// Fixture exported from the actual published v4 ordered-route core (abc4d17),
// not generated by the v5 migration being tested.
describe('energy with ordered-city routes', () => {
  it('creates only an operating record on a successful first flight, without a construction charge', () => {
    const c=prepared(),before=c.snapshot(),q=quote(before,before.fleet[0]!,'PVG');
    expect(before.routes).toEqual([]); dispatch(c);
    const after=c.snapshot();expect(after.credits).toBe(before.credits-q.cost);
    expect(after.routes).toEqual([{id:'PEK-PVG',from:'PEK',to:'PVG'}]);
    expect(after.fleet[0]!.energy.availableSeconds).toBe(CAP-required(q.duration));
  });
  it('reserves each current ordered-route leg independently', () => {
    const c=prepared();c.execute({type:'unlock',airportId:'WUH'},NOW);
    c.execute({type:'dispatch-plan',planeId:ID,stops:['WUH','PVG']},NOW);
    const first=c.snapshot().fleet[0]!.flight!, e=c.snapshot().fleet[0]!.energy.availableSeconds;
    c.tick(NOW+(first.arriveAt+8)*1000);const s=c.snapshot(),p=s.fleet[0]!;
    expect(p.flight!.to).toBe('PVG');
    const charge=required(Math.round(p.flight!.arriveAt-p.flight!.departAt));
    expect(p.energy.reservedSeconds).toBe(charge);expect(p.energy.availableSeconds).toBe(e-charge);
    expect(validateSave(s)).toEqual(s);
  });
});
