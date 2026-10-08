import { describe, expect, it } from 'vitest';
import { GameCore, validateSave, quote, type Command } from '../helpers/configured-game.js';
import { companyAffairs, createTalent, nextTalentRefreshAt, refreshTalent, talentBatchSize, TALENT_REFRESH_INTERVAL } from '../../src/core/talent.js';
import { careerLevel } from '../../src/core/career.js';
import { EMPLOYEE_POSITIONS, employmentPrice, type Department, type EmployeeRole } from '../../src/core/organization.js';
import { offerCandidates } from '../helpers/talent-market.js';
import { organizationLayout } from '../../src/ui/organization-layout.js';
const NOW = Date.parse('2026-09-14T02:00:00Z');
function rich() { const s=new GameCore(NOW).snapshot();s.credits=10000000;return new GameCore(NOW,s); }
function act(c:GameCore,command:Command) { c.execute(command,c.snapshot().lastWallTime);expect(validateSave(c.snapshot())).toEqual(c.snapshot()); }
function hire(c:GameCore,group='flight-specialist') { const [department,role]=group.split('-') as [Department,EmployeeRole];act(c,{type:'recruit-employee',department,role});return c.snapshot().career.employees.at(-1)!; }
function reject(c:GameCore,command:Command) { const s=c.snapshot();expect(()=>c.execute(command,s.lastWallTime)).toThrow();expect(c.snapshot()).toEqual(s); }
function mentored() {const c=rich(),p=hire(c),m=hire(c,'flight-manager');act(c,{type:'report-to',employeeId:p.id,managerId:m.id});return {c,p,m};}
function offered() { return new GameCore(NOW,offerCandidates(rich().snapshot(),[['flight','specialist'],['ground','specialist'],['company','manager']])); }
describe('finite level-based candidate batches',()=>{
  it('starts with three candidates total and never rerolls on read or reload',()=>{
    const c=rich(),s=c.snapshot();expect(s.talent.candidates).toHaveLength(3);expect(s.talent.batchLevel).toBe(1);
    expect(createTalent(s.career.seed,0)).toEqual(s.talent);
    expect(new GameCore(NOW,s).snapshot()).toEqual(s);expect(validateSave(s)).toEqual(s);
    companyAffairs(s);organizationLayout(s);expect(s).toEqual(c.snapshot());
  });
  it.each([[1,3],[2,4],[5,7],[9,11],[10,12],[30,12]])('level %i refreshes %i candidates', (level,count)=>{
    const s=rich().snapshot();s.career.xp=150*(level-1)**2;const c=new GameCore(NOW,s);
    expect(c.snapshot().talent.candidates).toHaveLength(3);
    c.tick(NOW+300000);expect(c.snapshot().talent.candidates).toHaveLength(count);expect(c.snapshot().talent.batchLevel).toBe(level);
    expect(validateSave(c.snapshot())).toEqual(c.snapshot());expect(talentBatchSize(level)).toBe(count);
  });
  it('hires the offered profile, spends the quoted price and leaves the batch empty after three hires',()=>{
    const c=offered(),initial=c.snapshot();
    for(const candidate of initial.talent.candidates){
      const before=c.snapshot(),price=employmentPrice(candidate,true);act(c,{type:'hire-candidate',candidateId:candidate.id});
      const after=c.snapshot();expect(after.career.employees.at(-1)).toMatchObject({name:candidate.name,potential:candidate.potential,trait:candidate.trait});
      expect(after.credits).toBe(before.credits-price.gold);
      expect(after.talent.candidates).toEqual(before.talent.candidates.filter(p=>p.id!==candidate.id));
      expect(after.talent.nextId).toBe(initial.talent.nextId);expect(after.talent.seed).toBe(initial.talent.seed);
      reject(c,{type:'hire-candidate',candidateId:candidate.id});
    }
    expect(c.snapshot().talent.candidates).toEqual([]);expect(new GameCore(NOW,c.snapshot()).snapshot()).toEqual(c.snapshot());
    c.tick(NOW+299999);expect(c.snapshot().talent.candidates).toEqual([]);
    c.tick(NOW+300000);expect(c.snapshot().talent.candidates).toHaveLength(3);
  });
  it('rejects stale candidates, poverty and full posts without consuming offers or randomness',()=>{
    const c=offered(),s=c.snapshot();s.credits=0;reject(new GameCore(NOW,s),{type:'hire-candidate',candidateId:s.talent.candidates[0]!.id});
    reject(c,{type:'hire-candidate',candidateId:999});hire(c,'company-manager');
    reject(c,{type:'hire-candidate',candidateId:c.snapshot().talent.candidates.find(p=>p.department==='company')!.id});
  });
  it('can draw every department and role, using an independent deterministic random stream',()=>{
    const c=rich(),seen=new Set<string>(),before=c.snapshot().career.seed;
    for(let i=1;i<=200;i++){for(const candidate of c.snapshot().talent.candidates)seen.add(`${candidate.department}-${candidate.role}`);c.tick(NOW+i*300000);}
    expect([...seen].sort()).toEqual(EMPLOYEE_POSITIONS.map(p=>`${p.department}-${p.role}`).sort());expect(c.snapshot().career.seed).toBe(before);
  });
});
describe('five-minute simulation events',()=>{
  it('refreshes at exactly five minutes and reports a persisted event',()=>{
    const c=rich(),before=c.snapshot();expect(TALENT_REFRESH_INTERVAL).toBe(300);expect(nextTalentRefreshAt(before)).toBe(300);
    c.tick(NOW+299999);expect(c.snapshot().talent).toEqual(before.talent);
    expect(nextTalentRefreshAt(c.snapshot())-c.snapshot().simTime).toBeCloseTo(.001,8);
    expect(c.tick(NOW+300000).events).toBe(1);const after=c.snapshot();
    expect(after.talent.candidates.map(p=>p.id)).toEqual([4,5,6]);expect(nextTalentRefreshAt(after)).toBe(600);
  });
  it('does not change employees, mentoring, milestones or deferrals when replacing offers',()=>{
    const {c,p}=mentored();act(c,{type:'train-employee',employeeId:p.id,training:'skill'});
    const advice=companyAffairs(c.snapshot())[0]!;act(c,{type:'defer-company-affair',key:advice.key,signature:advice.signature});
    const before=c.snapshot(),after=structuredClone(before);refreshTalent(after);
    expect({...after,talent:before.talent}).toEqual(before);
    expect({...after.talent,candidates:before.talent.candidates,seed:before.talent.seed,nextId:before.talent.nextId}).toEqual(before.talent);
  });
  it.each([299,300,301])('uses the level at each refresh when a paid flight arrives at %is',arrival=>{
    const state=rich().snapshot();state.career.xp=149;const c=new GameCore(NOW,state);
    const duration=quote(state,state.fleet[0]!,'PVG').duration;c.tick(NOW+(arrival-duration)*1000);
    act(c,{type:'load-destination',planeId:'AC0001',to:'PVG'});act(c,{type:'dispatch',planeId:'AC0001',to:'PVG',auto:false});
    const start=c.snapshot(),stepped=new GameCore(start.lastWallTime,start),batched=new GameCore(start.lastWallTime,start);
    stepped.tick(NOW+300000);expect(stepped.snapshot().talent.candidates).toHaveLength(arrival<300?4:3);
    stepped.tick(NOW+600000);batched.tick(NOW+600000);
    expect(careerLevel(batched.snapshot())).toBe(2);expect(batched.snapshot().talent.candidates).toHaveLength(4);
    expect(batched.snapshot()).toEqual(stepped.snapshot());expect(validateSave(batched.snapshot())).toEqual(batched.snapshot());
  });
  it('freezes countdown and candidates through background, import and clock rollback',()=>{
    const c=rich();c.tick(NOW+125000);const before=c.snapshot(),now=NOW+86400000;c.tick(now,{active:false});
    expect(c.snapshot().talent).toEqual(before.talent);expect(nextTalentRefreshAt(c.snapshot())-c.snapshot().simTime).toBe(175);
    const imported=GameCore.imported(c.snapshot(),now+86400000);expect(imported.tick(now+86400000).events).toBe(0);
    expect(imported.snapshot().talent).toEqual(before.talent);expect(c.tick(now-1000).clockBack).toBe(true);
    expect(c.snapshot().talent).toEqual(before.talent);c.tick(now-1000+175000);expect(c.snapshot().talent.candidates.map(p=>p.id)).toEqual([4,5,6]);
    const refreshed=c.snapshot();c.tick(refreshed.lastWallTime);expect(c.snapshot()).toEqual(refreshed);
  });
  it('rejects a hire submitted on the boundary after the old batch expires',()=>{
    const c=offered(),before=c.snapshot(),expected=new GameCore(NOW,before);expected.tick(NOW+300000);
    expect(()=>c.execute({type:'hire-candidate',candidateId:before.talent.candidates[0]!.id},NOW+300000)).toThrow('候选人已入职或不在名单中');
    expect(c.snapshot()).toEqual(expected.snapshot());
  });
  it('keeps the last batch at exhausted IDs and still allows hiring a remaining candidate',()=>{
    const s=offered().snapshot();s.talent.nextId=1e12;s.talent.candidates.forEach((p,i)=>p.id=1e12-3+i);const c=new GameCore(NOW,s);
    c.tick(NOW+600000);expect(c.snapshot().talent).toEqual(s.talent);expect(c.snapshot().simTime).toBe(600);
    act(c,{type:'hire-candidate',candidateId:s.talent.candidates[0]!.id});expect(c.snapshot().talent.candidates).toHaveLength(2);
  });
});
describe('mentoring, advice and retained milestones',()=>{

  it('counts operating departments independently of the company-manager position',()=>{
    const c=rich();hire(c,'company-manager');hire(c,'flight-manager');
    expect(c.snapshot().talent.milestones.some(m=>m.kind==='two-departments')).toBe(false);
    const ground=hire(c,'ground-specialist');
    expect(c.snapshot().talent.milestones.filter(m=>m.kind==='two-departments')).toEqual([{kind:'two-departments',at:0,employeeId:ground.id,mentorId:null}]);
  });
  it('retains the real mentor when reporting changes and recent activity rolls over',()=>{
    const {c,p,m}=mentored();act(c,{type:'train-employee',employeeId:p.id,training:'skill'});
    const record=c.snapshot().talent.mentoring[0];expect(record).toEqual({employeeId:p.id,mentorId:m.id,at:0,level:1});
    act(c,{type:'report-to',employeeId:p.id,managerId:null});
    for(let i=0;i<21;i++)act(c,{type:'renew-employee',employeeId:p.id});
    expect(c.snapshot().career.employees[0]!.history).toHaveLength(20);expect(c.snapshot().talent.mentoring).toEqual([record]);
    expect(c.snapshot().talent.milestones.filter(m=>m.kind==='first-mentoring')).toHaveLength(1);
    act(c,{type:'train-pilot',pilotId:p.id});expect(c.snapshot().talent.mentoring).toHaveLength(1);
  });
  it('records internal promotion but not an external manager as internal development',()=>{
    const c=rich(),p=hire(c);for(const training of ['skill','skill','management'] as const)act(c,{type:'train-employee',employeeId:p.id,training});
    act(c,{type:'assign-pilot',pilotId:p.id,planeId:'AC0001'});const contract=c.snapshot().career.employees[0]!.paidUntil;
    const advice=companyAffairs(c.snapshot()).find(a=>a.kind==='promotion')!;expect(advice.employeeId).toBe(p.id);
    act(c,{type:'employee-role',employeeId:p.id,role:'manager'});expect(c.snapshot().career.employees[0]).toMatchObject({role:'manager',planeId:null,paidUntil:contract});
    expect(c.snapshot().talent.milestones.filter(m=>m.kind==='internal-manager')).toHaveLength(1);
    const external=rich();hire(external,'flight-manager');expect(external.snapshot().talent.milestones.some(m=>m.kind==='internal-manager')).toBe(false);
  });
  it('defers advice persistently without spending and rejects stale decisions',()=>{
    const {c,p}=mentored(),s=c.snapshot(),a=companyAffairs(s)[0]!;act(c,{type:'defer-company-affair',key:a.key,signature:a.signature});
    expect(c.snapshot().credits).toBe(s.credits);expect(c.snapshot().career).toEqual(s.career);
    expect(companyAffairs(new GameCore(NOW,c.snapshot()).snapshot())).toEqual([]);reject(c,{type:'defer-company-affair',key:a.key,signature:a.signature});
    act(c,{type:'train-employee',employeeId:p.id,training:'skill'});expect(companyAffairs(c.snapshot())).toHaveLength(1);
    reject(c,{type:'defer-company-affair',key:a.key,signature:a.signature});
  });
  it('supports fractional contract timestamps and offers ground advice only with an idle specialist',()=>{
    const {c,p,m}=mentored(),s=c.snapshot();s.career.employees.find(e=>e.id===p.id)!.paidUntil=1e-7;s.career.employees.find(e=>e.id===m.id)!.paidUntil=1e-7;
    const fractional=new GameCore(NOW,s),a=companyAffairs(s)[0]!;act(fractional,{type:'defer-company-affair',key:a.key,signature:a.signature});
    const g=hire(c,'ground-specialist');act(c,{type:'assign-ground',employeeId:g.id,airportId:null});
    expect(companyAffairs(c.snapshot()).filter(a=>a.kind==='ground')).toHaveLength(2);
    act(c,{type:'assign-ground',employeeId:g.id,airportId:'PEK'});expect(companyAffairs(c.snapshot()).filter(a=>a.kind==='ground')).toEqual([]);
    expect(c.snapshot().talent.milestones.filter(m=>m.kind==='two-departments')).toHaveLength(1);
  });
  it('keeps paid milestones tied to real arrivals with equivalent incremental/batched settlement',()=>{
    const c=rich(),p=hire(c);act(c,{type:'assign-pilot',pilotId:p.id,planeId:'AC0001'});act(c,{type:'load-destination',planeId:'AC0001',to:'PVG'});
    act(c,{type:'dispatch',planeId:'AC0001',to:'PVG',auto:false});const start=c.snapshot(),at=start.fleet[0]!.flight!.arriveAt;
    const online=new GameCore(NOW,start),batched=new GameCore(NOW,start);
    online.tick(NOW+(at-1)*1000);expect(online.snapshot().talent.milestones.some(m=>m.kind==='paid-flight')).toBe(false);
    online.tick(NOW+at*1000);online.tick(NOW+(at+20)*1000);batched.tick(NOW+(at+20)*1000);
    expect(online.snapshot()).toEqual(batched.snapshot());expect(validateSave(batched.snapshot())).toEqual(batched.snapshot());
    expect(online.snapshot().talent.milestones.find(m=>m.kind==='paid-flight')!.at).toBe(at);
    const once=online.snapshot();online.tick(once.lastWallTime);expect(online.snapshot()).toEqual(once);
    const empty=rich(),ep=hire(empty);act(empty,{type:'assign-pilot',pilotId:ep.id,planeId:'AC0001'});act(empty,{type:'dispatch',planeId:'AC0001',to:'PVG',auto:false});
    empty.tick(NOW+empty.snapshot().fleet[0]!.flight!.arriveAt*1000);expect(empty.snapshot().talent.milestones.some(m=>m.kind==='paid-flight')).toBe(false);
  });
});
describe('strict current persistence',()=>{
  it('rejects unknown fields, duplicate candidates, forged references, future events and missing talent data',()=>{
    const {c,p}=mentored();act(c,{type:'train-employee',employeeId:p.id,training:'skill'});
    const invalid=[
      (s:ReturnType<GameCore['snapshot']>)=>{s.talent.batchLevel=31;},
      (s:ReturnType<GameCore['snapshot']>)=>{delete (s as Partial<typeof s>).talent;},
      (s:ReturnType<GameCore['snapshot']>)=>{s.talent.candidates[0]!.id=s.talent.candidates[1]!.id;},
      (s:ReturnType<GameCore['snapshot']>)=>{s.talent.candidates[0]!.potential=11;},
      (s:ReturnType<GameCore['snapshot']>)=>{s.talent.candidates[0]!.department='company';s.talent.candidates[0]!.role='specialist';},
      (s:ReturnType<GameCore['snapshot']>)=>{s.talent.candidates.push({...s.talent.candidates[0]!,id:0});},
      (s:ReturnType<GameCore['snapshot']>)=>{s.talent.mentoring[0]!.mentorId=999;},
      (s:ReturnType<GameCore['snapshot']>)=>{s.talent.mentoring[0]!.at=1;},
      (s:ReturnType<GameCore['snapshot']>)=>{s.talent.milestones.push(s.talent.milestones[0]!);},
      (s:ReturnType<GameCore['snapshot']>)=>{s.talent.deferred=[{key:'ground:ZZZ',signature:'1:604800'}];},
      (s:ReturnType<GameCore['snapshot']>)=>{Object.assign(s.talent,{unknown:1});},
    ];for(const mutate of invalid){const s=c.snapshot();mutate(s);expect(()=>validateSave(s)).toThrow();}
  });
});
