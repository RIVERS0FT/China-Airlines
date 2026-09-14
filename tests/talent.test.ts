import { describe, expect, it } from 'vitest';
import { GameCore, validateSave, type Command } from '../src/core/game.js';
import { GameCore as V8Core, validateSave as validateV8 } from '../src/core/v8/game.js';
import { companyAffairs, createTalent } from '../src/core/talent.js';
import { organizationLayout } from '../src/ui/organization-layout.js';
const NOW = Date.parse('2026-09-14T02:00:00Z');
function rich() { const s=new GameCore(NOW).snapshot();s.credits=10000000;s.career.tickets=100000;return new GameCore(NOW,s); }
function act(c:GameCore,command:Command) { c.execute(command,c.snapshot().lastWallTime);expect(validateSave(c.snapshot())).toEqual(c.snapshot()); }
function hire(c:GameCore,group='flight-specialist') { const candidate=c.snapshot().talent.candidates.find(p=>`${p.department}-${p.role}`===group)!;act(c,{type:'hire-candidate',candidateId:candidate.id});return c.snapshot().career.employees.at(-1)!; }
function reject(c:GameCore,command:Command) { const s=c.snapshot();expect(()=>c.execute(command,s.lastWallTime)).toThrow();expect(c.snapshot()).toEqual(s); }
function mentored() {const c=rich(),p=hire(c),m=hire(c,'flight-manager');act(c,{type:'report-to',employeeId:p.id,managerId:m.id});return {c,p,m};}
describe('persistent candidate recruitment',()=>{
  it('creates three candidates for each existing job and never rerolls on read or reload',()=>{
    const c=rich(),s=c.snapshot();expect(s.talent.candidates).toHaveLength(12);
    expect(createTalent(s.career.seed,0)).toEqual(s.talent);
    expect(new GameCore(NOW,s).snapshot()).toEqual(s);expect(validateSave(s)).toEqual(s);
    for(const group of ['flight-specialist','ground-specialist','flight-manager','ground-manager'])expect(s.talent.candidates.filter(p=>`${p.department}-${p.role}`===group)).toHaveLength(3);
    companyAffairs(s);organizationLayout(s,{flight:false,ground:false});expect(s).toEqual(c.snapshot());
  });
  it('hires the chosen identity/profile for the existing price, replacing only that candidate',()=>{
    const c=rich(),s=c.snapshot(),candidate=s.talent.candidates[2]!;act(c,{type:'hire-candidate',candidateId:candidate.id});
    const after=c.snapshot(),employee=after.career.employees[0]!;
    expect(employee).toMatchObject({name:candidate.name,potential:candidate.potential,trait:candidate.trait,paidUntil:604800,skill:0,management:0});
    expect(after.credits).toBe(s.credits-1800);expect(after.career.tickets).toBe(s.career.tickets-3);
    expect(after.talent.candidates.filter(p=>p.id<13)).toEqual(s.talent.candidates.filter(p=>p.id!==candidate.id));
    expect(after.talent.milestones).toEqual([{kind:'first-hire',at:0,employeeId:employee.id,mentorId:null}]);
    reject(c,{type:'hire-candidate',candidateId:candidate.id});
  });
  it('rejects poverty, stale identifiers, full jobs and exhausted IDs without RNG, money or identity changes',()=>{
    const c=rich(),s=c.snapshot();s.credits=0;const poor=new GameCore(NOW,s);reject(poor,{type:'hire-candidate',candidateId:1});
    reject(c,{type:'hire-candidate',candidateId:999});for(let i=0;i<8;i++)hire(c);
    reject(c,{type:'hire-candidate',candidateId:c.snapshot().talent.candidates.find(p=>p.department==='flight'&&p.role==='specialist')!.id});
    const exhausted=rich().snapshot();exhausted.talent.nextId=1e12;reject(new GameCore(NOW,exhausted),{type:'hire-candidate',candidateId:1});
  });
});
describe('mentoring, advice and retained milestones',()=>{
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
  it('supports valid legacy fractional contract timestamps and offers ground advice only with an idle specialist',()=>{
    const {c,p,m}=mentored(),s=c.snapshot();s.career.employees.find(e=>e.id===p.id)!.paidUntil=1e-7;s.career.employees.find(e=>e.id===m.id)!.paidUntil=1e-7;
    const fractional=new GameCore(NOW,s),a=companyAffairs(s)[0]!;act(fractional,{type:'defer-company-affair',key:a.key,signature:a.signature});
    const g=hire(c,'ground-specialist');expect(companyAffairs(c.snapshot()).filter(a=>a.kind==='ground')).toHaveLength(2);
    act(c,{type:'assign-ground',employeeId:g.id,airportId:'PEK'});expect(companyAffairs(c.snapshot()).filter(a=>a.kind==='ground')).toEqual([]);
    expect(c.snapshot().talent.milestones.filter(m=>m.kind==='two-departments')).toHaveLength(1);
  });
  it('keeps paid milestones tied to real arrivals with equivalent incremental/offline settlement',()=>{
    const c=rich(),p=hire(c);act(c,{type:'assign-pilot',pilotId:p.id,planeId:'AC0001'});act(c,{type:'load-destination',planeId:'AC0001',to:'PVG'});
    act(c,{type:'dispatch',planeId:'AC0001',to:'PVG',auto:false});const start=c.snapshot(),at=start.fleet[0]!.flight!.arriveAt;
    const online=new GameCore(NOW,start),offline=new GameCore(NOW,start);
    online.tick(NOW+(at-1)*1000);expect(online.snapshot().talent.milestones.some(m=>m.kind==='paid-flight')).toBe(false);
    online.tick(NOW+at*1000);online.tick(NOW+(at+20)*1000);offline.tick(NOW+(at+20)*1000);
    expect(online.snapshot()).toEqual(offline.snapshot());expect(validateSave(offline.snapshot())).toEqual(offline.snapshot());
    expect(online.snapshot().talent.milestones.find(m=>m.kind==='paid-flight')!.at).toBe(at);
    const once=online.snapshot();online.tick(once.lastWallTime);expect(online.snapshot()).toEqual(once);
    const empty=rich(),ep=hire(empty);act(empty,{type:'assign-pilot',pilotId:ep.id,planeId:'AC0001'});act(empty,{type:'dispatch',planeId:'AC0001',to:'PVG',auto:false});
    empty.tick(NOW+empty.snapshot().fleet[0]!.flight!.arriveAt*1000);expect(empty.snapshot().talent.milestones.some(m=>m.kind==='paid-flight')).toBe(false);
  });
});
describe('v8 freeze and strict v9 persistence',()=>{
  it('migrates locked flights and services without fabricating personnel history or changing old data',()=>{
    const old=new V8Core(NOW);old.execute({type:'recruit-pilot'},NOW);old.execute({type:'assign-pilot',pilotId:1,planeId:'AC0001'},NOW);old.execute({type:'start-duty',planeId:'AC0001',to:'PVG'},NOW);
    const before=old.snapshot(),after=validateSave(before),{talent,version,...unchanged}=after;
    expect(version).toBe(9);const {version:oldVersion,...oldFields}=before;expect(oldVersion).toBe(8);expect(unchanged).toEqual(oldFields);
    expect(talent.milestones).toEqual([]);expect(talent.mentoring).toEqual([]);
    const service=new V8Core(NOW),s=service.snapshot();s.fleet[0]!.energy.availableSeconds-=600;const servicing=new V8Core(NOW,s);servicing.execute({type:'service-energy',planeId:'AC0001'},NOW);
    expect(validateSave(servicing.snapshot()).fleet).toEqual(servicing.snapshot().fleet);
    expect(()=>validateV8({...before,talent})).toThrow();expect(()=>validateSave({...before,talent})).toThrow();
  });
  it('rejects unknown fields, duplicate candidates, forged references, future events and missing talent data',()=>{
    const {c,p}=mentored();act(c,{type:'train-employee',employeeId:p.id,training:'skill'});
    const invalid=[
      (s:ReturnType<GameCore['snapshot']>)=>{delete (s as Partial<typeof s>).talent;},
      (s:ReturnType<GameCore['snapshot']>)=>{s.talent.candidates[0]!.id=s.talent.candidates[1]!.id;},
      (s:ReturnType<GameCore['snapshot']>)=>{s.talent.candidates[0]!.potential=11;},
      (s:ReturnType<GameCore['snapshot']>)=>{s.talent.mentoring[0]!.mentorId=999;},
      (s:ReturnType<GameCore['snapshot']>)=>{s.talent.mentoring[0]!.at=1;},
      (s:ReturnType<GameCore['snapshot']>)=>{s.talent.milestones.push(s.talent.milestones[0]!);},
      (s:ReturnType<GameCore['snapshot']>)=>{s.talent.deferred=[{key:'ground:ZZZ',signature:'1:604800'}];},
      (s:ReturnType<GameCore['snapshot']>)=>{Object.assign(s.talent,{unknown:1});},
    ];for(const mutate of invalid){const s=c.snapshot();mutate(s);expect(()=>validateSave(s)).toThrow();}
  });
});
