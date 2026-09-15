import 'fake-indexeddb/auto';
import { afterEach, expect, it } from 'vitest';
import { GameCore, type GameState } from '../src/core/game.js';
import { SaveConflictError, SaveRepository } from '../src/persistence/saves.js';
import retired from './fixtures/v5-unit-flying.json';
const databases:SaveRepository[]=[];
function database(){const db=new SaveRepository(`test-${crypto.randomUUID()}`);databases.push(db);return db;}
afterEach(async()=>{for(const db of databases)await db.delete();databases.length=0;});
it('starts without silently inventing an existing save',async()=>{expect(await database().load()).toEqual({state:null,revision:0,recovered:false,hasData:false});});
it('atomically rotates the previous valid save into backup',async()=>{const db=database(),core=new GameCore(1000),first=core.snapshot();let rev=await db.save(first,0);core.execute({type:'buy',modelId:'swift-m',airportId:'PEK'},1000);rev=await db.save(core.snapshot(),rev);expect((await db.load()).state!.fleet).toHaveLength(2);expect((await db.backup()).fleet).toHaveLength(1);expect(rev).toBe(2);});
it('rejects a bad import without overwriting main or backup',async()=>{const db=database(),core=new GameCore(1000),rev=await db.save(core.snapshot(),0);const before=await db.saves.toArray();await expect(db.save({...core.snapshot(),credits:-1},rev)).rejects.toThrow();expect(await db.saves.toArray()).toEqual(before);});
it('rejects retired imports without changing either save slot or revision',async()=>{
  const db=database(),core=new GameCore(1000);let rev=await db.save(core.snapshot(),0);
  core.execute({type:'buy',modelId:'swift-p',airportId:'PEK'},1000);rev=await db.save(core.snapshot(),rev);
  const before=await db.saves.toArray();
  for(const value of [retired,{...core.snapshot(),fleet:[{...core.snapshot().fleet[0]!,modelId:'lark'}]}]){
    await expect(db.save(value as unknown as GameState,rev)).rejects.toThrow('不再支持');
    expect(await db.saves.toArray()).toEqual(before);
  }
});
it('recovers only a current backup and leaves unsupported disk records intact when no valid backup exists',async()=>{
  const db=database(),state=new GameCore(1000).snapshot();await db.save(state,0);await db.save(state,1);
  await db.saves.update('main',{state:retired as unknown as GameState});
  expect(await db.load()).toMatchObject({state,recovered:true,hasData:true,revision:2});
  await db.saves.update('backup',{state:retired as unknown as GameState});const before=await db.saves.toArray();
  expect(await db.load()).toEqual({state:null,recovered:false,hasData:true,revision:2});
  expect(await db.saves.toArray()).toEqual(before);
});
it('recovers a corrupt main save without replacing the healthy backup',async()=>{const db=database(),core=new GameCore(1000);const rev=await db.save(core.snapshot(),0);await db.save(core.snapshot(),rev);await db.saves.update('main',{state:{version:99} as unknown as GameState});const loaded=await db.load();expect(loaded.recovered).toBe(true);expect(loaded.state).not.toBeNull();await db.save(loaded.state!,loaded.revision);expect((await db.backup()).credits).toBe(18000);});
it('reports unrecoverable records instead of resetting them',async()=>{const db=database();await db.saves.put({slot:'main',revision:1,savedAt:1,state:{version:99} as unknown as GameState});const loaded=await db.load();expect(loaded.hasData).toBe(true);expect(loaded.state).toBeNull();expect(await db.saves.count()).toBe(1);});
it('rejects stale writers from another tab',async()=>{const db=database(),s=new GameCore(1000).snapshot();await db.save(s,0);await expect(db.save(s,0)).rejects.toBeInstanceOf(SaveConflictError);expect((await db.load()).revision).toBe(1);});
it('allows only one writer to initialize an empty database',async()=>{const db=database(),s=new GameCore(1000).snapshot();const results=await Promise.allSettled([db.save(s,0),db.save(s,0)]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((await db.load()).revision).toBe(1);});
