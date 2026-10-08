import { describe, expect, it } from 'vitest';
import { AIRPORTS, airport, MODELS, distance } from '../../src/core/catalog.js';
import { AIRPORT_TRAFFIC, airportStars, TRAFFIC_SOURCES } from '../../src/core/airport-traffic.js';
import { demandCapacity } from '../../src/core/demand.js';
import { GameCore, legQuote, planQuote, validateSave, waiting, MAX_WAITING } from '../../src/core/game.js';
const NOW=1_800_000_000_000;
function funded() { const s=new GameCore(NOW).snapshot(); s.credits=1e7;s.career.xp=20000;
  for(const key of Object.keys(s.career.inventory)) s.career.inventory[key as keyof typeof s.career.inventory]=100;
  return new GameCore(NOW,s); }
const send=(c:GameCore,action:Parameters<GameCore['execute']>[0])=>c.execute(action,NOW);
describe('airport throughput and independent stars',()=>{
  it('covers every airport with a dated source and uses explicit inclusive tier boundaries',()=>{
    expect(Object.keys(AIRPORT_TRAFFIC).sort()).toEqual(AIRPORTS.map(a=>a.id).sort());
    for(const a of AIRPORTS){expect(a.annualPassengers).toBeGreaterThan(0);expect(TRAFFIC_SOURCES[a.trafficSource]).toMatch(/^https:/);
      for(const level of [1,2,3]) expect(demandCapacity(a.id,level,true)).toBeLessThanOrEqual(MAX_WAITING);}
    expect([9_999_999,10_000_000,39_999_999,40_000_000].map(airportStars)).toEqual([1,2,2,3]);
    expect(airport('CTU')).toMatchObject({annualPassengers:33_518_945,stars:2});
    expect(airport('NAN')).toMatchObject({trafficPeriod:'2024',trafficApproximate:true,stars:1});
  });
  it('scales real supply while facility upgrades leave airport stars fixed',()=>{
    const c=funded();for(const id of ['PVG','WUH','NAN'])send(c,{type:'unlock',airportId:id});
    c.tick(NOW+120000);
    expect(waiting(c.snapshot(),'PVG')).toHaveLength(20);expect(waiting(c.snapshot(),'WUH')).toHaveLength(12);
    expect(waiting(c.snapshot(),'NAN')).toHaveLength(6);expect(c.snapshot().airports.every(a=>a.level===1)).toBe(true);
    c.execute({type:'upgrade',airportId:'NAN'},NOW+120000);c.execute({type:'upgrade',airportId:'NAN'},NOW+120000);
    expect(airport('NAN').stars).toBe(1);expect(demandCapacity('NAN',3)).toBe(16);
  });
  it('buys and assembles large aircraft at Lv.1 facilities in a three-star airport',()=>{
    const c=funded();send(c,{type:'unlock',airportId:'PVG'});
    send(c,{type:'buy',modelId:'aurora-p',airportId:'PEK',passengers:1,cargo:0});
    const p=c.snapshot().fleet[0]!;expect(()=>legQuote(c.snapshot(),p,'PEK','PVG')).not.toThrow();
    expect(()=>planQuote(c.snapshot(),p,['PVG','PEK'])).not.toThrow();
    send(c,{type:'assemble-plane',modelId:'albatross-p',airportId:'PVG'});
    expect(c.snapshot().airports.every(a=>a.level===1)).toBe(true);expect(validateSave(c.snapshot())).toEqual(c.snapshot());
    send(c,{type:'hire-dispatcher',planeId:p.id});send(c,{type:'load-destination',planeId:p.id,to:'PVG'});
    send(c,{type:'dispatch',planeId:p.id,to:'PVG',auto:true});expect(()=>validateSave(c.snapshot())).not.toThrow();
  });
  it('blocks purchases, assembly and every leg at insufficient fixed stars atomically',()=>{
    const c=funded();send(c,{type:'unlock',airportId:'WUH'});send(c,{type:'unlock',airportId:'KEF'});
    for(const id of ['WUH','KEF']){send(c,{type:'upgrade',airportId:id});send(c,{type:'upgrade',airportId:id});}
    for(const action of [{type:'buy',modelId:'aurora-p',airportId:'WUH',passengers:1,cargo:0},
      {type:'assemble-plane',modelId:'aurora-p',airportId:'WUH'},
      {type:'buy',modelId:'albatross-p',airportId:'KEF',passengers:1,cargo:0}] as const){
      const before=c.snapshot();expect(()=>send(c,action)).toThrow(/星/);expect(c.snapshot()).toEqual(before);}
    send(c,{type:'unlock',airportId:'PVG'});send(c,{type:'buy',modelId:'aurora-p',airportId:'PEK',passengers:1,cargo:0});
    const p=c.snapshot().fleet[0]!;
    expect(()=>planQuote(c.snapshot(),p,['PVG','WUH'])).toThrow(/星/);
    expect(()=>legQuote(c.snapshot(),p,'WUH','PEK')).toThrow(/星/);
    const forged=c.snapshot();forged.fleet[0]!.airportId='WUH';expect(()=>validateSave(forged)).toThrow();
  });
  it('keeps all airports reachable by aircraft that satisfy both stars and range',()=>{
    const visited=new Set(['PEK']);
    for(let i=0;i<AIRPORTS.length;i++)for(const a of AIRPORTS)
      if([...visited].some(id=>MODELS.some(m=>m.level<=Math.min(a.stars,airport(id).stars)&&distance(id,a.id)<=m.range)))visited.add(a.id);
    expect([...visited].sort()).toEqual(AIRPORTS.map(a=>a.id).sort());
  });
});
