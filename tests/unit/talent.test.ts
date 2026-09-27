import { describe, expect, it } from 'vitest';
import { GameCore, OFFLINE_LIMIT, validateSave, type Command } from '../helpers/configured-game.js';
import { advanceTalent, CANDIDATE_COUNT, companyAffairs, createTalent, nextTalentRefreshAt, TALENT_REFRESH_INTERVAL } from '../../src/core/talent.js';
import { organizationLayout } from '../../src/ui/organization-layout.js';
const NOW = Date.parse('2026-09-14T02:00:00Z');
function rich() { const s=new GameCore(NOW).snapshot();s.credits=10000000;s.career.tickets=100000;return new GameCore(NOW,s); }
function act(c:GameCore,command:Command) { c.execute(command,c.snapshot().lastWallTime);expect(validateSave(c.snapshot())).toEqual(c.snapshot()); }
function hire(c:GameCore,group='flight-specialist') { const candidate=c.snapshot().talent.candidates.find(p=>`${p.department}-${p.role}`===group)!;act(c,{type:'hire-candidate',candidateId:candidate.id});return c.snapshot().career.employees.at(-1)!; }
function reject(c:GameCore,command:Command) { const s=c.snapshot();expect(()=>c.execute(command,s.lastWallTime)).toThrow();expect(c.snapshot()).toEqual(s); }
function mentored() {const c=rich(),p=hire(c),m=hire(c,'flight-manager');act(c,{type:'report-to',employeeId:p.id,managerId:m.id});return {c,p,m};}
describe('persistent candidate recruitment',()=>{
  it('creates three candidates for each existing job and never rerolls on read or reload',()=>{
    const c=rich(),s=c.snapshot();expect(s.talent.candidates).toHaveLength(15);
    expect(createTalent(s.career.seed,0)).toEqual(s.talent);
    expect(new GameCore(NOW,s).snapshot()).toEqual(s);expect(validateSave(s)).toEqual(s);
    for(const group of ['flight-specialist','ground-specialist','flight-manager','ground-manager','company-manager'])expect(s.talent.candidates.filter(p=>`${p.department}-${p.role}`===group)).toHaveLength(3);
    companyAffairs(s);organizationLayout(s);expect(s).toEqual(c.snapshot());
  });
  it('hires the chosen identity/profile for the existing price, replacing only that candidate',()=>{
    const c=rich(),s=c.snapshot(),candidate=s.talent.candidates[2]!;act(c,{type:'hire-candidate',candidateId:candidate.id});
    const after=c.snapshot(),employee=after.career.employees[0]!;
    expect(employee).toMatchObject({name:candidate.name,potential:candidate.potential,trait:candidate.trait,paidUntil:604800,skill:0,management:0});
    expect(after.credits).toBe(s.credits-1800);expect(after.career.tickets).toBe(s.career.tickets-3);
    expect(after.talent.candidates.filter(p=>p.id<s.talent.nextId)).toEqual(s.talent.candidates.filter(p=>p.id!==candidate.id));
    expect(after.talent.milestones).toEqual([{kind:'first-hire',at:0,employeeId:employee.id,mentorId:null}]);
    reject(c,{type:'hire-candidate',candidateId:candidate.id});
  });
  it('hires a chosen general manager once and preserves all other candidates',()=>{
    const c=rich();hire(c,'flight-manager');const before=c.snapshot(),candidate=before.talent.candidates.filter(p=>p.department==='company')[1]!;
    act(c,{type:'hire-candidate',candidateId:candidate.id});const after=c.snapshot(),general=after.career.employees.at(-1)!;
    expect(general).toMatchObject({name:candidate.name,department:'company',role:'manager',potential:candidate.potential,trait:candidate.trait,skill:2,management:1,paidUntil:604800});
    expect(after.credits).toBe(before.credits-2400);expect(after.career.tickets).toBe(before.career.tickets-4);
    expect(after.career.employees[0]!.managerId).toBe(general.id);
    expect(after.talent.candidates.filter(p=>p.id<before.talent.nextId)).toEqual(before.talent.candidates.filter(p=>p.id!==candidate.id));
    expect(after.talent.candidates.filter(p=>p.department==='company')).toHaveLength(3);
    expect(new GameCore(NOW,after).snapshot()).toEqual(after);
    reject(c,{type:'hire-candidate',candidateId:candidate.id});
    reject(c,{type:'hire-candidate',candidateId:after.talent.candidates.find(p=>p.department==='company')!.id});
  });
  it('rejects poverty, stale identifiers, full jobs and exhausted IDs without RNG, money or identity changes',()=>{
    const c=rich(),s=c.snapshot();s.credits=0;const poor=new GameCore(NOW,s);reject(poor,{type:'hire-candidate',candidateId:1});
    reject(c,{type:'hire-candidate',candidateId:999});
    while(c.snapshot().fleet.length<8){if(c.snapshot().fleet.length>=c.snapshot().hangarSlots)act(c,{type:'expand-hangar'});act(c,{type:'buy',modelId:'diamond-da40',airportId:'PEK',passengers:1,cargo:0});}
    for(let i=0;i<8;i++)hire(c);
    reject(c,{type:'hire-candidate',candidateId:c.snapshot().talent.candidates.find(p=>p.department==='flight'&&p.role==='specialist')!.id});
    const exhausted=rich().snapshot();exhausted.talent.nextId=1e12;reject(new GameCore(NOW,exhausted),{type:'hire-candidate',candidateId:1});
  });
});
describe('scheduled talent market',()=>{
  it('replaces all five job groups at the half-hour boundary, with a new countdown',()=>{
    const c=rich(),before=c.snapshot();
    expect(TALENT_REFRESH_INTERVAL).toBe(1800);expect(nextTalentRefreshAt(before)).toBe(1800);
    c.tick(NOW+1799999);expect(c.snapshot().talent).toEqual(before.talent);
    expect(nextTalentRefreshAt(c.snapshot())-c.snapshot().simTime).toBeCloseTo(.001,8);
    c.tick(NOW+1800000);const after=c.snapshot();
    expect(after.talent.nextId).toBe(before.talent.nextId+CANDIDATE_COUNT);
    expect(after.talent.seed).not.toBe(before.talent.seed);
    expect(after.talent.candidates.map(candidate=>candidate.id)).toEqual(Array.from({length:15},(_,i)=>before.talent.nextId+i));
    for(const group of ['flight-specialist','ground-specialist','flight-manager','ground-manager','company-manager'])
      expect(after.talent.candidates.filter(p=>`${p.department}-${p.role}`===group)).toHaveLength(3);
    expect(nextTalentRefreshAt(after)).toBe(3600);expect(validateSave(after)).toEqual(after);
  });
  it('preserves employees, mentoring, milestones, deferrals and all nonmarket state',()=>{
    const {c,p}=mentored();act(c,{type:'train-employee',employeeId:p.id,training:'skill'});
    const advice=companyAffairs(c.snapshot())[0]!;act(c,{type:'defer-company-affair',key:advice.key,signature:advice.signature});
    const before=c.snapshot(),after=structuredClone(before);advanceTalent(after,0,1800);
    expect({...after,talent:before.talent}).toEqual(before);
    expect({...after.talent,candidates:before.talent.candidates,seed:before.talent.seed,nextId:before.talent.nextId}).toEqual(before.talent);
    c.tick(NOW+1800000);expect(c.snapshot().career.employees).toEqual(before.career.employees);
    expect(c.snapshot().credits).toBe(before.credits);expect(c.snapshot().career.tickets).toBe(before.career.tickets);
  });
  it('produces the same complete state for one offline advance and sixteen half-hour steps',()=>{
    const c=rich(),p=hire(c);act(c,{type:'assign-pilot',pilotId:p.id,planeId:'AC0001'});
    act(c,{type:'load-destination',planeId:'AC0001',to:'PVG'});act(c,{type:'dispatch',planeId:'AC0001',to:'PVG',auto:false});
    const start=c.snapshot(),online=new GameCore(NOW,start),offline=new GameCore(NOW,start);
    for(let elapsed=TALENT_REFRESH_INTERVAL;elapsed<=OFFLINE_LIMIT;elapsed+=TALENT_REFRESH_INTERVAL)online.tick(NOW+elapsed*1000);
    offline.tick(NOW+OFFLINE_LIMIT*1000);
    expect(offline.snapshot()).toEqual(online.snapshot());expect(validateSave(offline.snapshot())).toEqual(offline.snapshot());
    expect(offline.snapshot().talent.nextId).toBe(start.talent.nextId+16*CANDIDATE_COUNT);
  });
  it('caps refreshes with the existing eight-hour offline limit',()=>{
    const c=rich(),before=c.snapshot(),report=c.tick(NOW+24*3600000),after=c.snapshot();
    expect(report.capped).toBe(true);expect(after.simTime).toBe(OFFLINE_LIMIT);
    expect(after.talent.nextId).toBe(before.talent.nextId+16*CANDIDATE_COUNT);
    expect(nextTalentRefreshAt(after)).toBe(OFFLINE_LIMIT+TALENT_REFRESH_INTERVAL);
  });
  it('does not refresh again on repeated ticks, reload, import, or a backward wall clock',()=>{
    const c=rich();c.tick(NOW+1800000);const refreshed=c.snapshot();
    c.tick(refreshed.lastWallTime);expect(c.snapshot()).toEqual(refreshed);
    const reload=new GameCore(refreshed.lastWallTime,refreshed);reload.tick(refreshed.lastWallTime);expect(reload.snapshot()).toEqual(refreshed);
    const imported=GameCore.imported(refreshed,NOW+86400000);imported.tick(NOW+86400000);expect(imported.snapshot().talent).toEqual(refreshed.talent);
    expect(c.tick(NOW+1700000).clockBack).toBe(true);expect(c.snapshot().simTime).toBe(refreshed.simTime);
    expect(c.snapshot().talent).toEqual(refreshed.talent);
  });
  it('refreshes before a same-time hire and rejects the expired candidate without purchase effects',()=>{
    const c=rich(),before=c.snapshot(),expected=new GameCore(NOW,before);expected.tick(NOW+1800000);
    expect(()=>c.execute({type:'hire-candidate',candidateId:before.talent.candidates[0]!.id},NOW+1800000)).toThrow('候选人已入职或不在名单中');
    expect(c.snapshot()).toEqual(expected.snapshot());
    const fresh=c.snapshot(),candidate=fresh.talent.candidates[0]!;act(c,{type:'hire-candidate',candidateId:candidate.id});
    expect(c.snapshot().talent.nextId).toBe(fresh.talent.nextId+1);
    expect(c.snapshot().talent.candidates.filter(p=>p.id<fresh.talent.nextId)).toEqual(fresh.talent.candidates.filter(p=>p.id!==candidate.id));
  });
  it('retains a complete batch when too few candidate identities remain and still advances time',()=>{
    for(const nextId of [1e12-CANDIDATE_COUNT+1,1e12]){
      const s=rich().snapshot();s.talent.nextId=nextId;const c=new GameCore(NOW,s);
      c.tick(NOW+3600000);expect(c.snapshot().simTime).toBe(3600);expect(c.snapshot().talent).toEqual(s.talent);
      expect(validateSave(c.snapshot())).toEqual(c.snapshot());
    }
    const s=rich().snapshot();s.talent.nextId=1e12-CANDIDATE_COUNT;const c=new GameCore(NOW,s);
    c.tick(NOW+1800000);expect(c.snapshot().talent.nextId).toBe(1e12);expect(validateSave(c.snapshot())).toEqual(c.snapshot());
    const last=c.snapshot().talent;c.tick(NOW+3600000);expect(c.snapshot().talent).toEqual(last);
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
describe('strict current persistence',()=>{
  it('rejects unknown fields, duplicate candidates, forged references, future events and missing talent data',()=>{
    const {c,p}=mentored();act(c,{type:'train-employee',employeeId:p.id,training:'skill'});
    const invalid=[
      (s:ReturnType<GameCore['snapshot']>)=>{delete (s as Partial<typeof s>).talent;},
      (s:ReturnType<GameCore['snapshot']>)=>{s.talent.candidates[0]!.id=s.talent.candidates[1]!.id;},
      (s:ReturnType<GameCore['snapshot']>)=>{s.talent.candidates[0]!.potential=11;},
      (s:ReturnType<GameCore['snapshot']>)=>{s.talent.candidates.find(p=>p.department==='company')!.role='specialist';},
      (s:ReturnType<GameCore['snapshot']>)=>{s.talent.candidates=s.talent.candidates.filter(p=>p.department!=='company');},
      (s:ReturnType<GameCore['snapshot']>)=>{s.talent.mentoring[0]!.mentorId=999;},
      (s:ReturnType<GameCore['snapshot']>)=>{s.talent.mentoring[0]!.at=1;},
      (s:ReturnType<GameCore['snapshot']>)=>{s.talent.milestones.push(s.talent.milestones[0]!);},
      (s:ReturnType<GameCore['snapshot']>)=>{s.talent.deferred=[{key:'ground:ZZZ',signature:'1:604800'}];},
      (s:ReturnType<GameCore['snapshot']>)=>{Object.assign(s.talent,{unknown:1});},
    ];for(const mutate of invalid){const s=c.snapshot();mutate(s);expect(()=>validateSave(s)).toThrow();}
  });
});
