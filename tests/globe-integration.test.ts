import { describe, expect, it } from 'vitest';
import { ALL_MODELS, MODELS, aircraftSpecs, model } from '../src/core/catalog.js';
import { GameCore, loadSummary, validateSave, parseSave } from '../src/core/game.js';
import { GameCore as V7Core } from '../src/core/v7/game.js';
import { GameCore as V8Core } from '../src/core/v8/game.js';
import aggregated from './fixtures/v5-flying.json';
import unitFlying from './fixtures/v5-unit-flying.json';
import unitServicing from './fixtures/v5-unit-servicing.json';
const NOW = 1_800_000_000_000;

describe('current aircraft registry and save boundary', () => {
  it('keeps twelve purchasable models and a three-seat two-cargo starter', () => {
    const c=new GameCore(NOW);c.execute({type:'load-destination',planeId:'AC0001',to:'PVG'},NOW);
    const s=c.snapshot(),p=s.fleet[0]!;
    expect(ALL_MODELS).toHaveLength(13);expect(MODELS).toHaveLength(12);
    expect(p.modelId).toBe('starter-swift');expect(aircraftSpecs(p)).toMatchObject({seats:3,cargo:2});
    expect(loadSummary(s,p.id)).toEqual({passengers:3,cargo:2});expect(validateSave(s)).toEqual(s);
    const fresh=new GameCore(NOW).snapshot();expect(fresh.log[0]!.amount).toBe(fresh.credits);
  });
  it.each(['lark','lark-f','starter-lark','swift','crane','falcon','condor'])('rejects retired or unknown model %s in all holdings', id => {
    expect(()=>model(id)).toThrow('未知机型');
    const current=new GameCore(NOW).snapshot();
    for(const location of ['fleet','stored','museum'] as const){
      const s=structuredClone(current);
      if(location==='fleet')s.fleet[0]!.modelId=id;
      else if(location==='museum')s.career.museum.push(id);
      else s.career.stored.push({...structuredClone(s.fleet[0]!),modelId:id});
      const before=structuredClone(s);
      expect(()=>validateSave(s)).toThrow('不再支持');expect(s).toEqual(before);
    }
    expect(validateSave(current)).toEqual(current);
  });
  it.each([aggregated,unitFlying,unitServicing])('refuses retired v5 variants without migrating them', s=>{
    const before=structuredClone(s);expect(()=>GameCore.imported(s,NOW)).toThrow('不再支持');
    expect(()=>parseSave(JSON.stringify(s))).toThrow('不再支持');expect(s).toEqual(before);
  });
  it.each([V7Core,V8Core])('retains strict migration for current aircraft in organization-era saves', Core=>{
    const c=new Core(NOW);c.execute({type:'load-destination',planeId:'AC0001',to:'PVG'},NOW);
    c.execute({type:'dispatch',planeId:'AC0001',to:'PVG',auto:false},NOW);
    const old=c.snapshot(),before=structuredClone(old),s=validateSave(old);
    expect(s.version).toBe(9);expect(s.fleet).toEqual(old.fleet);expect(s.orders).toEqual(old.orders);
    expect(s.credits).toBe(old.credits);expect(old).toEqual(before);
    const imported=GameCore.imported(s,NOW),f=s.fleet[0]!.flight!,arrival=NOW+(f.arriveAt-s.simTime)*1000;
    imported.tick(arrival);expect(imported.snapshot().credits).toBe(s.credits+f.revenue);
    expect(imported.tick(arrival).revenue).toBe(0);expect(validateSave(imported.snapshot())).toEqual(imported.snapshot());
    const bad=structuredClone(old);bad.fleet[0]!.energy.reservedSeconds++;
    expect(()=>validateSave(bad)).toThrow();
  });
});
