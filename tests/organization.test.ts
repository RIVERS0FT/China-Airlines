import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { GameCore, validateSave, type GameState, type Command } from '../src/core/game.js';
import { SaveRepository } from '../src/persistence/saves.js';
import { activePilots, manager, groundServiceSeconds, flightStaffing, managementBonusBps, legacyEmployee, trainingCost } from '../src/core/organization.js';
import { validateSave as validateV7 } from '../src/core/save-v7.js';
import old from './fixtures/v7-pilot-flying.json';
const NOW = Date.parse('2026-09-14T02:00:00Z');
function rich() { const s=new GameCore(NOW).snapshot();s.credits=1e7;s.career.tickets=1e5;s.career.xp=1000;return new GameCore(NOW,s); }
function command(c:GameCore, cmd:Command) {c.execute(cmd,c.snapshot().lastWallTime);expect(validateSave(c.snapshot())).toEqual(c.snapshot());}
function reject(c:GameCore, cmd:Command) {const before=c.snapshot();expect(()=>c.execute(cmd,before.lastWallTime)).toThrow();expect(c.snapshot()).toEqual(before);}
function recruit(c:GameCore, department:'flight'|'ground'='flight') {command(c,{type:'org-recruit',department});return c.snapshot().career.employees.at(-1)!.id;}
function promote(c:GameCore, department:'flight'|'ground'='flight') {
  const id=recruit(c,department);while(c.snapshot().career.employees.find(e=>e.id===id)!.skill<2)command(c,{type:'org-train',employeeId:id,ability:'skill'});
  command(c,{type:'org-appoint',employeeId:id});return id;
}
function fly(c:GameCore) {command(c,{type:'load-destination',planeId:'AC0001',to:'PVG'});command(c,{type:'dispatch',planeId:'AC0001',to:'PVG',auto:false});}
function advance(c:GameCore, seconds:number) {c.tick(c.snapshot().lastWallTime+seconds*1000);expect(validateSave(c.snapshot())).toEqual(c.snapshot());}

describe('company organization: one canonical roster',()=>{
  it('starts empty in version8 without requiring a manager or changing flight quotes',()=>{
    const c=rich();expect(c.snapshot().version).toBe(8);expect(c.snapshot().career.employees).toEqual([]);expect(c.snapshot().career).not.toHaveProperty('pilots');fly(c);expect(c.snapshot().fleet[0]!.flight).not.toBeNull();
  });
  it('reuses recruitment and assignment aliases with the same IDs and contract cost',()=>{
    const c=rich(),before=c.snapshot();command(c,{type:'recruit-pilot'});const e=c.snapshot().career.employees[0]!;
    expect(e).toMatchObject({id:1,name:'林航',department:'flight',role:'staff',skill:0,paidUntil:604800});
    expect(c.snapshot().credits).toBe(before.credits-1800);expect(c.snapshot().career.tickets).toBe(before.career.tickets-3);
    command(c,{type:'assign-pilot',pilotId:e.id,planeId:'AC0001'});expect(activePilots(c.snapshot())[0]!.planeId).toBe('AC0001');
    command(c,{type:'dismiss-dispatcher',planeId:'AC0001'});expect(c.snapshot().career.employees[0]!.history.at(-1)!.text).toContain('解除');
  });
  it('keeps eight flight execution posts and eight ground posts separate',()=>{
    const c=rich();for(let i=0;i<8;i++)recruit(c);for(let i=0;i<8;i++)recruit(c,'ground');
    reject(c,{type:'org-recruit',department:'flight'});reject(c,{type:'org-recruit',department:'ground'});
    expect(c.snapshot().career.employees).toHaveLength(16);
  });
  it('rejects duplicate asset assignments, malformed targets and busy pilot transfers atomically',()=>{
    const c=rich(),a=recruit(c),b=recruit(c);command(c,{type:'org-assign',employeeId:a,assetId:'AC0001'});
    reject(c,{type:'org-assign',employeeId:b,assetId:'AC0001'});reject(c,{type:'org-assign',employeeId:b,assetId:''});
    reject(c,{type:'org-assign',employeeId:a,assetId:'PEK'});fly(c);
    reject(c,{type:'org-assign',employeeId:a,assetId:null});reject(c,{type:'org-appoint',employeeId:a});
  });
  it('creates only one manager per department and swaps a replacement without losing prepaid contracts',()=>{
    const c=rich(),a=promote(c),b=recruit(c);command(c,{type:'org-train',employeeId:b,ability:'skill'});command(c,{type:'org-train',employeeId:b,ability:'skill'});
    const before=c.snapshot().career.employees.find(e=>e.id===a)!;
    command(c,{type:'org-appoint',employeeId:b});expect(manager(c.snapshot(),'flight')!.id).toBe(b);
    expect(c.snapshot().career.employees.find(e=>e.id===a)).toMatchObject({role:'staff',paidUntil:before.paidUntil,skill:before.skill,planeId:null});
    reject(c,{type:'org-assign',employeeId:b,assetId:'AC0001'});command(c,{type:'org-demote',employeeId:b});expect(manager(c.snapshot(),'flight')).toBeUndefined();
  });
  it('enforces level, professional ability, prepaid contract and assignment gates in core',()=>{
    const low=new GameCore(NOW);const id=recruit(low);reject(low,{type:'org-appoint',employeeId:id});
    const c=rich(),n=recruit(c);reject(c,{type:'org-appoint',employeeId:n});command(c,{type:'org-train',employeeId:n,ability:'skill'});command(c,{type:'org-train',employeeId:n,ability:'skill'});
    command(c,{type:'org-assign',employeeId:n,assetId:'AC0001'});reject(c,{type:'org-appoint',employeeId:n});
    command(c,{type:'org-assign',employeeId:n,assetId:null});const s=c.snapshot();s.career.employees[0]!.paidUntil=0;reject(new GameCore(NOW,s),{type:'org-appoint',employeeId:n});
  });
  it('preserves seeded ability/traits across refresh and limits training and history',()=>{
    const c=rich(),id=recruit(c),snapshot=c.snapshot(),copy=new GameCore(NOW,snapshot);
    expect(copy.snapshot().career.employees).toEqual(snapshot.career.employees);
    const e=snapshot.career.employees[0]!;expect(trainingCost({...e,trait:'steady'},'management').gold).toBe((e.management+1)*450);
    for(let i=e.management;i<e.potential;i++)command(c,{type:'org-train',employeeId:id,ability:'management'});
    reject(c,{type:'org-train',employeeId:id,ability:'management'});
    for(let i=0;i<25;i++)command(c,{type:'org-renew',employeeId:id});expect(c.snapshot().career.employees[0]!.history).toHaveLength(20);
  });
  it('does not spend any resources on a failed recruitment',()=>{
    const s=new GameCore(NOW).snapshot();s.career.tickets=0;const c=new GameCore(NOW,s);reject(c,{type:'org-recruit',department:'ground'});
  });
});

describe('locked work effects and contract expiry',()=>{
  it('locks manager bonus at departure and retains it after expiry/reassignment',()=>{
    const c=rich(),m=promote(c),id=recruit(c);command(c,{type:'org-assign',employeeId:id,assetId:'AC0001'});
    let s=c.snapshot();s.career.employees.find(e=>e.id===m)!.paidUntil=1;const run=new GameCore(NOW,s);fly(run);
    s=run.snapshot();const f=s.fleet[0]!.flight!, lock=s.career.flightStaffing[f.id]!, beforeXp=s.career.xp;
    expect(managementBonusBps(lock)).toBeGreaterThan(0);command(run,{type:'org-demote',employeeId:m});
    expect(run.snapshot().career.flightStaffing[f.id]).toEqual(lock);expect(run.snapshot().fleet[0]!.flight).toEqual(f);
    advance(run,f.arriveAt);const count=f.passengers+f.cargo;
    expect(run.snapshot().career.xp-beforeXp).toBe(20+count*5+Math.floor((20+count*5)*managementBonusBps(lock)/10000));
    expect(run.snapshot().career.employees.find(e=>e.id===id)!.flights).toBe(1);expect(run.snapshot().career.employees.find(e=>e.id===m)!.flights).toBe(1);
    expect(run.snapshot().career.flightStaffing).toEqual({});const before=run.snapshot();advance(run,0);expect(run.snapshot()).toEqual(before);
  });
  it('does not add managerial experience for empty flights or absent pilots',()=>{
    const c=rich();promote(c);command(c,{type:'dispatch',planeId:'AC0001',to:'PVG',auto:false});const xp=c.snapshot().career.xp;
    advance(c,c.snapshot().fleet[0]!.flight!.arriveAt);expect(c.snapshot().career.xp).toBe(xp);
  });
  it('dilutes only the bonus when management capacity is exceeded',()=>{
    const c=rich(),m=promote(c),pilot=recruit(c);command(c,{type:'org-assign',employeeId:pilot,assetId:'AC0001'});
    const s=c.snapshot(),e=s.career.employees.find(e=>e.id===m)!;e.management=1;
    const lock=flightStaffing(s,s.fleet[0]!);expect(managementBonusBps({...lock,workload:8})).toBeLessThan(managementBonusBps({...lock,workload:1}));
    expect(managementBonusBps({...lock,management:10,mentor:true,workload:1})).toBe(2000);
  });
  it('starts shorter ground service but never recalculates an existing deadline',()=>{
    const c=rich(),id=recruit(c,'ground');command(c,{type:'org-assign',employeeId:id,assetId:'PEK'});
    const s=c.snapshot();s.fleet[0]!.energy.availableSeconds-=120;const run=new GameCore(NOW,s),duration=groundServiceSeconds(s,'PEK');
    expect(duration).toBeLessThan(120);command(run,{type:'service-energy',planeId:'AC0001'});
    const until=run.snapshot().fleet[0]!.energy.serviceUntil;command(run,{type:'org-assign',employeeId:id,assetId:'PVG'});
    command(run,{type:'org-train',employeeId:id,ability:'skill'});expect(run.snapshot().fleet[0]!.energy.serviceUntil).toBe(until);
    advance(run,duration-1);expect(run.snapshot().fleet[0]!.energy.availableSeconds).toBe(s.fleet[0]!.energy.availableSeconds);
    advance(run,1);expect(run.snapshot().fleet[0]!.energy.serviceUntil).toBeNull();expect(run.snapshot().fleet[0]!.energy.availableSeconds).toBe(12000);
  });
  it('supports cancellation, expired contracts and ground manager effects without debt',()=>{
    const c=rich(),id=recruit(c,'ground');command(c,{type:'org-assign',employeeId:id,assetId:'PEK'});const base=groundServiceSeconds(c.snapshot(),'PEK');promote(c,'ground');
    expect(groundServiceSeconds(c.snapshot(),'PEK')).toBeLessThan(base);const s=c.snapshot();s.fleet[0]!.energy.availableSeconds-=120;
    for(const e of s.career.employees)e.paidUntil=0;
    const run=new GameCore(NOW,s);expect(groundServiceSeconds(s,'PEK')).toBe(120);command(run,{type:'service-energy',planeId:'AC0001'});command(run,{type:'cancel-energy-service',planeId:'AC0001'});
    expect(run.snapshot().credits).toBe(s.credits);expect(run.snapshot().fleet[0]!.energy.availableSeconds).toBe(11880);
    command(run,{type:'org-renew',employeeId:id});expect(run.snapshot().career.employees.find(e=>e.id===id)!.paidUntil).toBe(604800);
  });
  it('keeps ground assignment unique and prevents closing its airport',()=>{
    const c=rich();command(c,{type:'unlock',airportId:'CAN'});const a=recruit(c,'ground'),b=recruit(c,'ground');command(c,{type:'org-assign',employeeId:a,assetId:'CAN'});
    reject(c,{type:'org-assign',employeeId:b,assetId:'CAN'});reject(c,{type:'close-airport',airportId:'CAN'});command(c,{type:'org-assign',employeeId:a,assetId:null});command(c,{type:'close-airport',airportId:'CAN'});
  });
});

describe('strict v7 migration and organization save validation',()=>{
  it('preserves old pilot identity, skills, contracts, in-flight costs/rewards and legacy energy',()=>{
    const s=validateSave(old);expect(s.version).toBe(8);expect(s.career.employees[0]).toMatchObject({...old.career.pilots[0],joinedAt:null,potential:10});
    expect(s.fleet).toEqual(old.fleet);expect(s.orders).toEqual(old.orders);expect(s.credits).toBe(old.credits);
    expect(s.career.flightStaffing[old.fleet[0]!.flight!.id]).toBeNull();expect(validateSave(s)).toEqual(s);
    const c=new GameCore(NOW,s);advance(c,old.fleet[0]!.flight!.arriveAt);expect(c.snapshot().credits).toBe(old.credits+old.fleet[0]!.flight!.revenue);
  });
  it('does not relax the frozen v7 field set or pilot limit',()=>{
    const s=structuredClone(old);(s.career as unknown as Record<string,unknown>).employees=[];expect(()=>validateV7(s)).toThrow();expect(()=>validateSave(s)).toThrow();
    const many=structuredClone(old) as unknown as import('../src/core/types-v7.js').GameState;many.career.nextId=100;many.career.pilots=Array.from({length:9},(_,i)=>({...old.career.pilots[0]!,id:i+1,planeId:null}));expect(()=>validateSave(many)).toThrow();
  });
  const invalid:[string,(s:GameState)=>void][]=[
    ['duplicate identity',s=>{s.career.employees.push(structuredClone(s.career.employees[0]!));}],
    ['unknown employee field / forged reporting cycle',s=>{Object.assign(s.career.employees[0]!,{managerId:s.career.employees[0]!.id});}],
    ['unknown department',s=>{s.career.employees[0]!.department='finance' as never;}],
    ['non-string department',s=>{s.career.employees[0]!.department=['flight'] as never;}],
    ['skill past potential',s=>{s.career.employees[0]!.skill=11;}],
    ['future history',s=>{s.career.employees[0]!.history[0]!.at=s.simTime+1;}],
    ['missing flight snapshot',s=>{s.career.flightStaffing={};}],
    ['foreign flight snapshot',s=>{s.career.flightStaffing['FL999']=null;}],
    ['manager on a plane',s=>{s.career.employees[0]!.role='manager';}],
    ['invented manager bonus',s=>{s.career.flightStaffing[s.fleet[0]!.flight!.id]={pilotId:1,managerId:999,management:10,mentor:true,workload:1};}],
  ];
  it.each(invalid)('rejects %s',(_,change)=>{const s=validateSave(old);change(s);expect(()=>validateSave(s)).toThrow();});
  it('rejects a second department manager and a duplicate ground post',()=>{
    const c=rich();promote(c);const e=legacyEmployee({id:90,name:'重复经理',planeId:null,paidUntil:600,skill:2},0);e.role='manager';const s=c.snapshot();s.career.nextId=91;s.career.employees.push(e);expect(()=>validateSave(s)).toThrow();
  });
  it('retains valid persisted state when an organization import fails',async()=>{
    const db=new SaveRepository(`organization-${Math.random()}`),good=validateSave(old);await db.save(good,0);
    const bad=structuredClone(good);bad.career.employees[0]!.planeId='MISSING';await expect(db.save(bad,1)).rejects.toThrow();expect((await db.load()).state).toEqual(good);await db.delete();
  });
});
