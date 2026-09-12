import { describe, expect, it } from 'vitest';
import { AIRPORTS, distance, routeId } from '../src/core/catalog.js';
import { GameCore, OFFLINE_LIMIT, parseSave, quote, TURNAROUND, validateSave, type GameState } from '../src/core/game.js';
const NOW=1_800_000_000_000;
function flying(auto=false){const core=new GameCore(NOW);core.execute({type:'load-destination',planeId:'AC0001',to:'PVG'},NOW);core.execute({type:'dispatch',planeId:'AC0001',to:'PVG',auto},NOW);return core;}
describe('catalog and fresh game',()=>{
  it('has fifty airports and a playable first route',()=>{const s=new GameCore(NOW).snapshot();expect(AIRPORTS).toHaveLength(50);expect(s.airports).toHaveLength(2);expect(s.fleet).toHaveLength(1);expect(s.credits).toBe(180000);expect(distance('PEK','PVG')).toBeLessThan(1600);expect(quote(s,s.fleet[0]!,'PVG').revenue).toBe(0);});
  it('uses geographic distance rather than display coordinates',()=>{expect(distance('PEK','PEK')).toBe(0);expect(distance('PEK','PVG')).toBe(distance('PVG','PEK'));expect(routeId('PEK','PVG')).toBe(routeId('PVG','PEK'));});
  it('does not leak mutable state through snapshots',()=>{const core=new GameCore(NOW),s=core.snapshot();s.credits=1;s.fleet[0]!.airportId='URC';expect(core.snapshot().credits).toBe(180000);expect(core.snapshot().fleet[0]!.airportId).toBe('PEK');});
});
describe('commands and economics',()=>{
  it('unlocks and upgrades airports and purchases a delivered aircraft',()=>{const core=new GameCore(NOW);core.execute({type:'unlock',airportId:'WUH'},NOW);core.execute({type:'buy',modelId:'lark',airportId:'WUH'},NOW);expect(core.snapshot().fleet[1]!.airportId).toBe('WUH');expect(core.snapshot().credits).toBe(63000);core.execute({type:'upgrade',airportId:'PEK'},NOW);expect(core.snapshot().airports[0]!.level).toBe(2);});
  it('keeps the legacy route command free and idempotent while rejecting invalid endpoints',()=>{const core=new GameCore(NOW);expect(()=>core.execute({type:'unlock',airportId:'PEK'},NOW)).toThrow();expect(()=>core.execute({type:'route',from:'PEK',to:'PEK'},NOW)).toThrow();const credits=core.snapshot().credits;core.execute({type:'route',from:'PEK',to:'PVG'},NOW);expect(core.snapshot().routes).toHaveLength(1);core.execute({type:'route',from:'PVG',to:'PEK'},NOW);expect(core.snapshot().routes).toHaveLength(1);expect(core.snapshot().credits).toBe(credits);});
  it('rejects unaffordable purchase without subtracting funds',()=>{const core=new GameCore(NOW);expect(()=>core.execute({type:'buy',modelId:'horizon',airportId:'PEK'},NOW)).toThrow();expect(core.snapshot().credits).toBe(180000);});
  it('allows direct travel between unlocked airports and rejects locked destinations',()=>{const core=new GameCore(NOW);core.execute({type:'dispatch',planeId:'AC0001',to:'PVG',auto:false},NOW);expect(core.snapshot().fleet[0]!.flight?.to).toBe('PVG');expect(core.snapshot().routes.map(r=>r.id)).toContain('PEK-PVG');const other=new GameCore(NOW);expect(()=>other.execute({type:'dispatch',planeId:'AC0001',to:'URC',auto:false},NOW)).toThrow(/解锁/);expect(()=>other.execute({type:'route',from:'PEK',to:'URC'},NOW)).toThrow(/解锁/);});
  it('enforces model range',()=>{const core=new GameCore(NOW);core.execute({type:'unlock',airportId:'URC'},NOW);expect(()=>core.execute({type:'dispatch',planeId:'AC0001',to:'URC',auto:false},NOW)).toThrow(/航程/);});
  it('prevents dispatching the same aircraft twice',()=>{const core=flying(),before=core.snapshot();expect(()=>core.execute({type:'dispatch',planeId:'AC0001',to:'PVG',auto:false},NOW)).toThrow(/飞行/);expect(core.snapshot()).toEqual(before);});
  it('pays only operating costs at departure and revenue only at arrival',()=>{const core=flying(),s=core.snapshot(),f=s.fleet[0]!.flight!;expect(s.credits).toBe(180000-f.cost);core.tick(NOW+(f.arriveAt-.1)*1000);expect(core.snapshot().stats.flights).toBe(0);core.tick(NOW+f.arriveAt*1000);expect(core.snapshot().credits).toBe(s.credits+f.revenue);expect(core.snapshot().stats.flights).toBe(1);expect(core.snapshot().fleet[0]!.airportId).toBe('PVG');});
  it('respects turnaround before another manual departure',()=>{const core=flying(),f=core.snapshot().fleet[0]!.flight!;core.tick(NOW+f.arriveAt*1000);expect(()=>core.execute({type:'dispatch',planeId:'AC0001',to:'PEK',auto:false},NOW+f.arriveAt*1000)).toThrow(/周转/);core.execute({type:'dispatch',planeId:'AC0001',to:'PEK',auto:false},NOW+(f.arriveAt+TURNAROUND)*1000);expect(core.snapshot().fleet[0]!.flight!.to).toBe('PEK');});
  it('does not award unfinished tasks or allow repeat rewards',()=>{const core=flying(),f=core.snapshot().fleet[0]!.flight!;expect(()=>core.execute({type:'claim',taskId:'first-flight'},NOW)).toThrow(/尚未/);const at=NOW+f.arriveAt*1000;core.tick(at);const before=core.snapshot().credits;core.execute({type:'claim',taskId:'first-flight'},at);expect(core.snapshot().credits).toBe(before+30000);expect(()=>core.execute({type:'claim',taskId:'first-flight'},at)).toThrow(/已经/);});
});
describe('event simulation and offline settlement',()=>{
  it('settles an arrival exactly once across reloads',()=>{const core=flying(),f=core.snapshot().fleet[0]!.flight!;const at=NOW+(f.arriveAt+1)*1000;core.tick(at);const s=core.snapshot();const restored=new GameCore(at,s);restored.tick(at);restored.tick(at+1000);expect(restored.snapshot().stats.flights).toBe(1);expect(restored.snapshot().credits).toBe(s.credits);});
  it('automatically returns after turnaround',()=>{const core=flying(true),f=core.snapshot().fleet[0]!.flight!;core.tick(NOW+(f.arriveAt+TURNAROUND)*1000);expect(core.snapshot().stats.flights).toBe(1);expect(core.snapshot().fleet[0]!.flight!.from).toBe('PVG');expect(core.snapshot().fleet[0]!.flight!.to).toBe('PEK');});
  it('produces identical results for incremental and event-based advancement',()=>{const a=flying(true),b=flying(true);for(let second=1;second<=1800;second++)a.tick(NOW+second*1000);b.tick(NOW+1800*1000);expect(a.snapshot()).toEqual(b.snapshot());});
  it('caps offline time and consumes excess wall time permanently',()=>{const core=flying(true),report=core.tick(NOW+24*3600*1000),s=core.snapshot();expect(report.capped).toBe(true);expect(s.simTime).toBe(OFFLINE_LIMIT);expect(s.stats.flights).toBeGreaterThan(100);expect(core.tick(NOW+24*3600*1000).flights).toBe(0);expect(core.snapshot().credits).toBe(s.credits);});
  it('reanchors a backward clock without income or a frozen future clock',()=>{const core=flying();expect(core.tick(NOW-50000).clockBack).toBe(true);expect(core.snapshot().simTime).toBe(0);core.tick(NOW-49000);expect(core.snapshot().simTime).toBe(1);expect(core.snapshot().stats.flights).toBe(0);});
  it('stops auto dispatch when no operating funds remain',()=>{const base=new GameCore(NOW);base.execute({type:'route',from:'PEK',to:'PVG'},NOW);const s=base.snapshot();s.credits=0;s.fleet[0]!.autoRouteId='PEK-PVG';const core=new GameCore(NOW,s);core.tick(NOW+1000);expect(core.snapshot().fleet[0]!.autoRouteId).toBeNull();expect(core.snapshot().credits).toBe(0);});
  it('stopping auto does not cancel an in-flight delivery',()=>{const core=flying(true),f=core.snapshot().fleet[0]!.flight!;core.execute({type:'stop',planeId:'AC0001'},NOW);core.tick(NOW+(f.arriveAt+100)*1000);expect(core.snapshot().stats.flights).toBe(1);expect(core.snapshot().fleet[0]!.flight).toBeNull();});
  it('keeps the event log bounded during long simulations',()=>{const core=flying(true);core.tick(NOW+OFFLINE_LIMIT*1000);expect(core.snapshot().log).toHaveLength(60);expect(()=>validateSave(core.snapshot())).not.toThrow();});
});
describe('strict save validation',()=>{
  it('round-trips a valid flying save',()=>{const s=flying(true).snapshot();expect(parseSave(JSON.stringify(s))).toEqual(s);});
  it('rejects malformed JSON and oversized saves',()=>{expect(()=>parseSave('{oops')).toThrow(/JSON/);expect(()=>parseSave(' '.repeat(1_000_001))).toThrow(/过大/);});
  it('rejects future versions explicitly',()=>{expect(()=>validateSave({...new GameCore(NOW).snapshot(),version:99})).toThrow(/版本/);});
  const mutations:[string,(s:GameState)=>void][]=[
    ['negative funds',s=>{s.credits=-1;}],['NaN',s=>{s.credits=NaN;}],['Infinity',s=>{s.simTime=Infinity;}],
    ['duplicate planes',s=>{s.fleet.push(structuredClone(s.fleet[0]!));}],['unknown airport',s=>{s.fleet[0]!.airportId='BAD';}],
    ['bad level',s=>{s.airports[0]!.level=4;}],['reused id',s=>{s.nextId=1;}],['negative time',s=>{s.simTime=-1;}],
    ['too many seats',s=>{s.fleet[0]!.flight!.passengers=999;}],['forged revenue',s=>{s.fleet[0]!.flight!.revenue=999999;}],
    ['missing route',s=>{s.routes=[];}],['already arrived',s=>{s.simTime=s.fleet[0]!.flight!.arriveAt;}],
    ['wrong flight duration',s=>{s.fleet[0]!.flight!.arriveAt+=1;}],['unknown task',s=>{s.claimedTasks=['unknown'];}],
    ['unearned task',s=>{s.claimedTasks=['ten-flights'];}],['extra key',s=>{(s as unknown as Record<string,unknown>).unexpected=true;}]
  ];
  it.each(mutations)('rejects %s',(_name,change)=>{const s=flying().snapshot();change(s);expect(()=>validateSave(s)).toThrow();});
  it('imports at the current wall clock without file-based offline income',()=>{const s=flying(true).snapshot(),core=GameCore.imported(s,NOW+24*3600*1000);expect(core.tick(NOW+24*3600*1000).elapsed).toBe(0);expect(core.snapshot().stats.flights).toBe(0);});
});
