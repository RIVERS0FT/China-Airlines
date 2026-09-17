import { describe, expect, it } from 'vitest';
import { ALL_MODELS, MODELS, aircraftSpecs, model } from '../src/core/catalog.js';
import { GameCore, loadSummary, validateSave } from '../src/core/game.js';
const NOW = 1_800_000_000_000;

describe('current aircraft registry and save boundary', () => {
  it('keeps thirteen purchasable models and a three-seat two-cargo starter', () => {
    const c=new GameCore(NOW);c.execute({type:'load-destination',planeId:'AC0001',to:'PVG'},NOW);
    const s=c.snapshot(),p=s.fleet[0]!;
    expect(ALL_MODELS).toHaveLength(14);expect(MODELS).toHaveLength(13);
    expect(p.modelId).toBe('starter-swift');expect(aircraftSpecs(p)).toMatchObject({seats:3,cargo:2});
    expect(loadSummary(s,p.id)).toEqual({passengers:3,cargo:2});expect(validateSave(s)).toEqual(s);
    const fresh=new GameCore(NOW).snapshot();expect(fresh.log[0]!.amount).toBe(fresh.credits);
  });
  it.each(['lark','lark-f','starter-lark','swift','crane','falcon','condor'])('rejects unknown model %s in all holdings', id => {
    expect(()=>model(id)).toThrow('未知机型');
    const current=new GameCore(NOW).snapshot();
    for(const location of ['fleet','stored','museum'] as const){
      const s=structuredClone(current);
      if(location==='fleet')s.fleet[0]!.modelId=id;
      else if(location==='museum')s.career.museum.push(id);
      else s.career.stored.push({...structuredClone(s.fleet[0]!),modelId:id});
      const before=structuredClone(s);
      expect(()=>validateSave(s)).toThrow();expect(s).toEqual(before);
    }
    expect(validateSave(current)).toEqual(current);
  });
});
