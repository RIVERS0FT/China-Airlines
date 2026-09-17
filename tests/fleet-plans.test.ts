import { upgradeLimit } from '../src/core/career-catalog.js';
import { describe, it, expect } from 'vitest';
import { GameCore, validateSave, manifest, planQuote, quote, type GameState } from '../src/core/game.js';
import { ALL_MODELS, MODELS, aircraftSpecs, hangarPrice, retrofitPrice } from '../src/core/catalog.js';
const NOW = 1800000000000;
const ID = 'AC0001';
function rich() { const s = new GameCore(NOW).snapshot(); s.credits = 10000000; s.career.tickets=1000000; s.career.xp=20000; return new GameCore(NOW, s); }
function prepared() {
  const c = rich();
  c.execute({ type: 'unlock', airportId: 'WUH' }, NOW);
  c.execute({ type: 'load-destination', planeId: ID, to: 'PVG' }, NOW);
  return c;
}
function mutated(fn: (s: GameState) => void) { const s = prepared().snapshot(); fn(s); return () => validateSave(s); }
describe('aircraft specialisation and workshop', () => {
  it('gives every purchasable and non-sale aircraft a real-world prototype', () => {
    expect(new Set(MODELS.map(m => m.id)).size).toBe(13);
    expect(ALL_MODELS).toHaveLength(14);
    expect(new Set(ALL_MODELS.map(m => m.id)).size).toBe(ALL_MODELS.length);
    expect(MODELS.filter(m => m.kind === 'passengers')).toHaveLength(5);
    for (const kind of ['mixed', 'cargo'] as const) expect(MODELS.filter(m => m.kind === kind)).toHaveLength(4);
    for (const model of ALL_MODELS) {
      expect(model.reference.prototype.length).toBeGreaterThan(3);
      expect(model.reference.capacity).toMatch(/座/);
    }
  });
  it('buys, saves and restores the one-passenger DA40 without permitting capacity expansion', () => {
    const c = rich(); c.execute({ type: 'buy', modelId: 'diamond-da40', airportId: 'PEK' }, NOW);
    const p = c.snapshot().fleet[1]!;
    expect(aircraftSpecs(p)).toMatchObject({ name: '钻石 DA40', seats: 1, cargo: 0, range: 1730, speed: 285 });
    expect(upgradeLimit(p, 'capacity')).toBe(0);
    const restored = new GameCore(NOW, validateSave(c.snapshot())).snapshot();
    expect(restored.fleet[1]).toEqual(p);
  });
  for (const m of MODELS) it(`${m.id} has valid, independently upgradeable capacity`, () => {
    const c = rich();
    for (let i = 1; i < m.level; i++) c.execute({ type: 'upgrade', airportId: 'PEK' }, NOW);
    c.execute({ type: 'buy', modelId: m.id, airportId: 'PEK' }, NOW);
    const p = c.snapshot().fleet[1]!;
    if (m.id === 'diamond-da40') expect(() => c.execute({ type: 'retrofit', planeId: p.id, upgrade: 'capacity' }, NOW)).toThrow(/最高/);
    else c.execute({ type: 'retrofit', planeId: p.id, upgrade: 'capacity' }, NOW);
    const upgraded = c.snapshot().fleet[1]!, spec = aircraftSpecs(upgraded);
    expect(spec.seats).toBe(m.seats ? m.seats * (m.id === 'diamond-da40' ? 1 : 2) : 0);
    expect(spec.cargo).toBe(m.cargo ? m.cargo * (m.id === 'diamond-da40' ? 1 : 2) : 0);
    const incompatible = c.snapshot().orders.find(o => o.location === 'PEK' && o.kind === (m.kind === 'cargo' ? 'passengers' : 'cargo'))!;
    if (m.kind !== 'mixed') expect(() => c.execute({ type: 'load', planeId: p.id, orderId: incompatible.id }, NOW)).toThrow(/容量/);
    expect(validateSave(c.snapshot())).toEqual(c.snapshot());
  });
  it('expands paid hangar capacity atomically and enforces the limit', () => {
    const c = rich(); for (let i = 0; i < 3; i++) c.execute({type:'buy',modelId:'swift-m',airportId:'PEK'},NOW);
    const before=c.snapshot(); expect(()=>c.execute({type:'buy',modelId:'swift-m',airportId:'PEK'},NOW)).toThrow(/机位/);
    expect(c.snapshot()).toEqual(before);c.execute({type:'expand-hangar'},NOW);
    expect(c.snapshot().hangarSlots).toBe(6);expect(c.snapshot().credits).toBe(before.credits-hangarPrice(4));
    c.execute({type:'buy',modelId:'swift-f',airportId:'PEK'},NOW);expect(c.snapshot().fleet).toHaveLength(5);
  });
  it('stops expanding at sixteen slots without taking more funds',()=>{
    const c=rich();for(let i=0;i<6;i++)c.execute({type:'expand-hangar'},NOW);
    const before=c.snapshot();expect(()=>c.execute({type:'expand-hangar'},NOW)).toThrow(/最高/);expect(c.snapshot()).toEqual(before);
  });
  it('changes real time, cost and range, not just card labels',()=>{
    const c=prepared(), before=c.snapshot(), first=quote(before,before.fleet[0]!,'PVG');
    for(const upgrade of ['engine','range','efficiency'] as const)c.execute({type:'retrofit',planeId:ID,upgrade},NOW);
    c.execute({type:'retrofit',planeId:ID,upgrade:'efficiency'},NOW);const s=c.snapshot(),next=quote(s,s.fleet[0]!,'PVG');expect(next.duration).toBeLessThan(first.duration);expect(next.cost).toBeLessThan(first.cost);
    expect(aircraftSpecs(s.fleet[0]!).range).toBe(2100);
    c.execute({type:'dispatch',planeId:ID,to:'PVG',auto:false},NOW);expect(validateSave(c.snapshot())).toEqual(c.snapshot());
  });
  it('charges the quoted upgrade amount and caps capacity at nine and attributes at ninety-nine',()=>{
    const c=rich();for(const upgrade of ['capacity','engine','range','efficiency'] as const){
      for(let i=0;i<upgradeLimit(c.snapshot().fleet[0]!,upgrade);i++){const before=c.snapshot();c.execute({type:'retrofit',planeId:ID,upgrade},NOW);expect(c.snapshot().credits).toBe(before.credits-retrofitPrice(before.fleet[0]!,upgrade));}
      const before=c.snapshot();expect(()=>c.execute({type:'retrofit',planeId:ID,upgrade},NOW)).toThrow(/最高/);expect(c.snapshot()).toEqual(before);
    }
  });
  it('rejects unaffordable or invalid workshop commands',()=>{
    const s=rich().snapshot();s.credits=0;const c=new GameCore(NOW,s);
    expect(()=>c.execute({type:'retrofit',planeId:ID,upgrade:'engine'},NOW)).toThrow(/金币|资金/);
    expect(()=>c.execute({type:'retrofit',planeId:ID,upgrade:'invalid'} as never,NOW)).toThrow(/未知/);
    expect(()=>c.execute({type:'expand-hangar'},NOW)).toThrow(/金币|资金/);expect(c.snapshot()).toEqual(s);
  });
});
describe('finite multi-stop plans',()=>{
  it('does not count repeated destination visits as new revenue',()=>{
    const c=prepared(),s=c.snapshot(),q=planQuote(s,s.fleet[0]!,['WUH','PVG','PEK','PVG']);
    expect(q.legs[0]!.revenue).toBe(0);expect(q.legs[1]!.revenue).toBeGreaterThan(0);expect(q.legs[3]!.revenue).toBe(0);
    expect(q.revenue).toBe(quote(s,s.fleet[0]!,'PVG').revenue);
    expect(q.openingCost).toBe(0);expect(q.legs.every(leg=>leg.openingCost===0)).toBe(true);
  });
  it('executes layovers and final delivery exactly once without new boarding',()=>{
    const c=prepared(),s=c.snapshot(),expected=planQuote(s,s.fleet[0]!,['WUH','PVG','PEK']);
    c.execute({type:'dispatch-plan',planeId:ID,stops:['WUH','PVG','PEK']},NOW);
    c.tick(NOW+(expected.legs[0]!.duration+1)*1000);expect(c.snapshot().stats.revenue).toBe(0);expect(manifest(c.snapshot(),ID).length).toBeGreaterThan(0);
    c.tick(NOW+expected.duration*1000);const final=c.snapshot();expect(final.stats.flights).toBe(3);
    expect(final.stats.revenue).toBe(expected.revenue);expect(final.stats.costs).toBe(expected.cost);expect(final.fleet[0]!.airportId).toBe('PEK');expect(manifest(final,ID)).toHaveLength(0);
    c.tick(NOW+expected.duration*1000);expect(c.snapshot()).toEqual(final);expect(validateSave(final)).toEqual(final);
  });
  it('cancel leaves the current flight and its earnings intact',()=>{
    const c=prepared();c.execute({type:'dispatch-plan',planeId:ID,stops:['PVG','WUH']},NOW);const f=c.snapshot().fleet[0]!.flight!;
    c.execute({type:'cancel-plan',planeId:ID},NOW);expect(c.snapshot().fleet[0]!.flight).toEqual(f);
    c.tick(NOW+400000);expect(c.snapshot().fleet[0]!.airportId).toBe('PVG');expect(c.snapshot().stats.flights).toBe(1);expect(c.snapshot().stats.revenue).toBe(f.revenue);
  });
  it('cancel during turnaround prevents the next departure',()=>{
    const c=prepared();c.execute({type:'dispatch-plan',planeId:ID,stops:['WUH','PVG']},NOW);const at=c.snapshot().fleet[0]!.flight!.arriveAt;
    c.execute({type:'cancel-plan',planeId:ID},NOW+at*1000);c.tick(NOW+400000);expect(c.snapshot().stats.flights).toBe(1);expect(c.snapshot().fleet[0]!.airportId).toBe('WUH');
  });
  it('stops safely on insufficient onward funds and retains all cargo',()=>{
    const setup=prepared().snapshot();setup.credits=quote(setup,setup.fleet[0]!,'WUH').cost;
    const c=new GameCore(NOW,setup);c.execute({type:'dispatch-plan',planeId:ID,stops:['WUH','PVG']},NOW);c.tick(NOW+400000);
    const s=c.snapshot();expect(s.credits).toBe(0);expect(s.fleet[0]!.airportId).toBe('WUH');expect(s.fleet[0]!.itinerary).toHaveLength(0);expect(manifest(s,ID)).toEqual(manifest(setup,ID));expect(s.log.some(l=>l.text.includes('计划停止'))).toBe(true);
  });
  it('validates the complete path before charging or taking off',()=>{
    const c=prepared(),before=c.snapshot();for(const stops of [[],['PEK'],['WUH','WUH'],['WUH','URC'],Array.from({length:13},(_,i)=>i%2?'PVG':'WUH')]){
      expect(()=>c.execute({type:'dispatch-plan',planeId:ID,stops},NOW)).toThrow();expect(c.snapshot()).toEqual(before);
    }
  });
  it('does not require prebuilt route records for later plan legs',()=>{
    const c=prepared();expect(c.snapshot().routes).toHaveLength(0);c.execute({type:'dispatch-plan',planeId:ID,stops:['WUH','PVG']},NOW);
    expect(c.snapshot().fleet[0]!.flight?.to).toBe('WUH');expect(c.snapshot().routes.map(r=>r.id)).toContain('PEK-WUH');
    c.tick(NOW+400000);expect(c.snapshot().routes.map(r=>r.id)).toEqual(expect.arrayContaining(['PEK-WUH','PVG-WUH']));
  });
  it('keeps the compatibility plan-route command free and non-required',()=>{
    const c=rich(),s=c.snapshot(),q=planQuote(s,s.fleet[0]!,['PVG','PEK','PVG']);
    expect(q.openingCost).toBe(0);c.execute({type:'open-plan-routes',planeId:ID,stops:['PVG','PEK','PVG']},NOW);
    expect(c.snapshot().routes).toHaveLength(0);expect(c.snapshot().credits).toBe(s.credits);
    const before=c.snapshot();expect(()=>c.execute({type:'open-plan-routes',planeId:ID,stops:['WUH']},NOW)).toThrow();expect(c.snapshot()).toEqual(before);
  });
  it('locks manual loading, retrofit and alternate dispatch during a queued plan',()=>{
    const c=prepared();c.execute({type:'dispatch-plan',planeId:ID,stops:['WUH','PVG']},NOW);
    expect(()=>c.execute({type:'retrofit',planeId:ID,upgrade:'engine'},NOW)).toThrow(/飞行/);
    const at=c.snapshot().fleet[0]!.flight!.arriveAt;c.tick(NOW+at*1000);
    expect(()=>c.execute({type:'dispatch',planeId:ID,to:'PEK',auto:false},NOW+at*1000)).toThrow(/取消/);
  });
  it('restores a mid-plan save without losing queued destinations',()=>{
    const c=prepared();c.execute({type:'dispatch-plan',planeId:ID,stops:['WUH','PVG','PEK']},NOW);c.tick(NOW+10000);
    const loaded=new GameCore(NOW+10000,validateSave(c.snapshot()));c.tick(NOW+500000);loaded.tick(NOW+500000);expect(loaded.snapshot()).toEqual(c.snapshot());
  });
  it('produces the same results with stepwise and single offline advances',()=>{
    const c=prepared();c.execute({type:'dispatch-plan',planeId:ID,stops:['WUH','PVG','PEK','PVG','PEK']},NOW);
    const step=new GameCore(NOW,c.snapshot());for(let i=1;i<=480;i++)step.tick(NOW+i*60000);c.tick(NOW+8*3600000);expect(step.snapshot()).toEqual(c.snapshot());
  });
});
describe('current save validation',()=>{
  for(const [name,fn] of Object.entries({
    'missing upgrades':(s:GameState)=>{delete (s.fleet[0] as Partial<GameState['fleet'][0]>).upgrades;},
    'extra upgrade':(s:GameState)=>{Object.assign(s.fleet[0]!.upgrades,{cheat:1});},
    'fractional level':(s:GameState)=>{s.fleet[0]!.upgrades.engine=.5;},
    'too many levels':(s:GameState)=>{s.fleet[0]!.upgrades.range=100;},
    'odd hangar':(s:GameState)=>{s.hangarSlots=5;},
    'unknown model':(s:GameState)=>{s.fleet[0]!.modelId='unknown';},
    'unknown plan airport':(s:GameState)=>{s.fleet[0]!.itinerary=['ZZZ'];},
    'oversized plan':(s:GameState)=>{s.fleet[0]!.itinerary=Array(6).fill('PVG');},
    'repeated adjacent airport':(s:GameState)=>{s.fleet[0]!.itinerary=['WUH','WUH'];},
    'invalid capacity':(s:GameState)=>{s.fleet[0]!.modelId='lark-f';},
    'invalid order number':(s:GameState)=>{s.orders[0]!.amount=NaN;},
  })) it(`rejects ${name}`,()=>expect(mutated(fn)).toThrow());
  it('accepts contracted queued plan legs without historical route records',()=>{const s=prepared().snapshot();s.fleet[0]!.itinerary=['WUH','PVG'];s.fleet[0]!.planContract={origin:'PEK',stops:['WUH','PVG'],index:0};s.routes=[];expect(validateSave(s)).toEqual(s);});
  it('rejects tampered upgraded flight duration and locked costs',()=>{
    const c=prepared();c.execute({type:'retrofit',planeId:ID,upgrade:'engine'},NOW);c.execute({type:'dispatch-plan',planeId:ID,stops:['WUH','PVG']},NOW);
    for(const field of ['arriveAt','cost','revenue'] as const){const s=c.snapshot();s.fleet[0]!.flight![field]++;expect(()=>validateSave(s)).toThrow();}
  });
  it('rejects mutually active auto return and itinerary',()=>{
    const c=prepared();c.execute({type:'hire-dispatcher',planeId:ID},NOW);c.execute({type:'dispatch',planeId:ID,to:'PVG',auto:true},NOW);const s=c.snapshot();s.fleet[0]!.itinerary=['WUH'];expect(()=>validateSave(s)).toThrow();
  });
});
