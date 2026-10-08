import 'fake-indexeddb/auto';
import { afterEach, expect, it } from 'vitest';
import { GameCore } from '../../src/core/game.js';
import { SaveRepository } from '../../src/persistence/saves.js';
import { offerCandidates } from '../helpers/talent-market.js';

const db=new SaveRepository(`talent-${crypto.randomUUID()}`),NOW=1000;
afterEach(async()=>{await db.delete();});

it('preserves empty and expanded batches and rejects corrupt batch imports without overwriting either slot',async()=>{
  const initial=new GameCore(NOW).snapshot();
  offerCandidates(initial,[['publicity','specialist'],['operations','specialist'],['engineering','specialist']]);
  initial.career.xp=150;
  const core=new GameCore(NOW,initial);let revision=await db.save(initial,0);
  for(const candidate of initial.talent.candidates)core.execute({type:'hire-candidate',candidateId:candidate.id},NOW);
  const empty=core.snapshot();expect(empty.talent.candidates).toEqual([]);revision=await db.save(empty,revision);
  expect(await db.backup()).toEqual(initial);
  const resumed=GameCore.imported((await db.load()).state!,NOW+86400000);
  expect(resumed.snapshot().talent).toEqual(empty.talent);
  resumed.tick(NOW+86400000+300000);const expanded=resumed.snapshot();
  expect(expanded.talent.candidates).toHaveLength(4);expect(expanded.talent.batchLevel).toBe(2);
  revision=await db.save(expanded,revision);expect((await db.load()).state).toEqual(expanded);expect(await db.backup()).toEqual(empty);
  const records=await db.saves.toArray();
  const missing=structuredClone(expanded);delete (missing.talent as Partial<typeof missing.talent>).batchLevel;
  const excess=structuredClone(expanded);excess.talent.candidates.push({...excess.talent.candidates[0]!,id:excess.talent.nextId});
  const stale=structuredClone(expanded);stale.talent.candidates[0]!.id=initial.talent.candidates[0]!.id;
  const future=structuredClone(expanded);future.talent.batchLevel=3;
  for(const corrupt of [missing,excess,stale,future]){
    await expect(db.save(corrupt,revision)).rejects.toThrow('存档人才培养数据无效');
    expect(await db.saves.toArray()).toEqual(records);
  }
});
