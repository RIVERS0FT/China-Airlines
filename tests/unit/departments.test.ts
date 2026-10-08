import { describe, expect, it } from 'vitest';
import { GameCore, validateSave, manifest, quote, planQuote, type Command, type GameState } from '../helpers/configured-game.js';
import { DEPARTMENT_CATALOG, SUPPORT_DEPARTMENTS } from '../../src/core/departments.js';
import { departmentEffect, departmentPrice, promotionPrice, trainingQuote, turnaroundSeconds, type Department } from '../../src/core/organization.js';
import { businessOpeningPrice, businessOpeningReason, businessTeamQuote, businessTrainingQuote } from '../../src/core/company-business.js';
import { retrofitPrice } from '../../src/core/catalog.js';
import { organizationLayout } from '../../src/ui/organization-layout.js';
const NOW = 1_800_000_000_000;
function rich() { const s = new GameCore(NOW).snapshot(); s.credits = 1e8; return new GameCore(NOW, s); }
function act(c: GameCore, command: Command) { c.execute(command, c.snapshot().lastWallTime); expect(validateSave(c.snapshot())).toEqual(c.snapshot()); }
function hire(c: GameCore, department: Department, role: 'specialist'|'manager' = 'specialist') {
  act(c, {type:'recruit-employee',department,role}); return c.snapshot().career.employees.at(-1)!;
}
function reject(c: GameCore, command: Command) { const before=c.snapshot(); expect(()=>c.execute(command,before.lastWallTime)).toThrow(); expect(c.snapshot()).toEqual(before); }
function loaded(c: GameCore) { act(c,{type:'load-destination',planeId:'AC0001',to:'PVG'}); }
function fly(c: GameCore) { act(c,{type:'dispatch',planeId:'AC0001',to:'PVG',auto:false}); }

describe('airline headquarters departments',()=>{
  it.each(SUPPORT_DEPARTMENTS)('%s hires two specialists and a manager, reports to the chief and persists',department=>{
    const c=rich(),chief=hire(c,'company','manager'),m=hire(c,department,'manager');
    expect(m.managerId).toBe(chief.id); expect(departmentEffect(c.snapshot(),department)).toBe(0);
    const worker=hire(c,department); hire(c,department);
    expect(worker).toMatchObject({department,managerId:m.id,planeId:null,airportId:null,skill:1});
    expect(departmentEffect(c.snapshot(),department)).toBeGreaterThan(0);
    reject(c,{type:'recruit-employee',department,role:'specialist'}); reject(c,{type:'recruit-employee',department,role:'manager'});
    reject(c,{type:'assign-ground',employeeId:worker.id,airportId:'PEK'}); reject(c,{type:'assign-pilot',pilotId:worker.id,planeId:'AC0001'});
    reject(c,{type:'report-to',employeeId:worker.id,managerId:chief.id});
    const before=c.snapshot(); expect(new GameCore(NOW,before).snapshot()).toEqual(before);
    const layout=organizationLayout(before,new Set(),[department],false);
    expect(layout.nodes.map(n=>n.employee.id)).toEqual(expect.arrayContaining(before.career.employees.map(e=>e.id)));
    expect(layout.width).toBe(488); expect(c.snapshot()).toEqual(before);
  });
  it.each(SUPPORT_DEPARTMENTS)('%s respects expiry, caps and renewal without changing staffing',department=>{
    const c=rich(),m=hire(c,department,'manager'),w=hire(c,department); hire(c,department);
    const state=c.snapshot(),points=departmentEffect(state,department);
    state.career.employees.find(e=>e.id===m.id)!.paidUntil=0;
    expect(departmentEffect(state,department)).toBe(points-2);
    for(const e of state.career.employees) {e.skill=e.potential;e.management=e.potential;e.paidUntil=1;}
    expect(departmentEffect(state,department)).toBe(DEPARTMENT_CATALOG[department].cap);
    const run=new GameCore(NOW,state); run.tick(NOW+1000);
    expect(departmentEffect(run.snapshot(),department)).toBe(0);
    act(run,{type:'renew-employee',employeeId:w.id}); expect(departmentEffect(run.snapshot(),department)).toBeGreaterThan(0);
    const paused=run.snapshot(); run.tick(NOW+86400_000,{active:false});
    expect(run.snapshot().simTime).toBe(paused.simTime); expect(run.snapshot().career.employees).toEqual(paused.career.employees);
  });
  it('allows internal promotion and rejects unknown departments and forged assets',()=>{
    const c=rich(),w=hire(c,'publicity');
    act(c,{type:'train-employee',employeeId:w.id,training:'skill'}); act(c,{type:'train-employee',employeeId:w.id,training:'management'});
    act(c,{type:'employee-role',employeeId:w.id,role:'manager'}); expect(departmentEffect(c.snapshot(),'publicity')).toBe(0);
    const invalids: ((s:GameState)=>void)[]=[s=>{s.career.employees[0]!.department='unknown' as Department;},s=>{s.career.employees[0]!.airportId='PEK';},s=>{s.talent.candidates[0]!.department='business';}];
    for(const mutate of invalids){const s=c.snapshot();mutate(s);expect(()=>validateSave(s)).toThrow();}
    expect(()=>validateSave({...c.snapshot(),version:16})).toThrow('版本');
  });
});

describe('department effects charge and settle through core commands',()=>{
  it('quotes and charges publicity, engineering and training discounts',()=>{
    const c=rich(); hire(c,'publicity');hire(c,'engineering');hire(c,'hr');const pilot=hire(c,'flight');
    let s=c.snapshot(),price=promotionPrice(s);expect(price).toBeLessThan(500);
    act(c,{type:'promote-airport',airportId:'PEK'});expect(c.snapshot().credits).toBe(s.credits-price);expect(c.snapshot().career.promotions.PEK).toBe(3600);
    s=c.snapshot();price=departmentPrice(s,'engineering',retrofitPrice(s.fleet[0]!,'engine'));
    act(c,{type:'retrofit',planeId:'AC0001',upgrade:'engine'});expect(c.snapshot().credits).toBe(s.credits-price);
    s=c.snapshot();const training=trainingQuote(s,pilot,'skill');expect(training.gold).toBeLessThan(700);
    act(c,{type:'train-employee',employeeId:pilot.id,training:'skill'});expect(c.snapshot().credits).toBe(s.credits-training.gold);

  });
  it('uses discounted affordability and actual finance/HR prices for city teams',()=>{
    const c=rich();hire(c,'finance');hire(c,'hr');loaded(c);fly(c);c.tick(NOW+c.snapshot().fleet[0]!.flight!.arriveAt*1000);
    const s=c.snapshot(),price=businessOpeningPrice(s,'ticketing');expect(price).toBeLessThan(1200);s.credits=price;
    expect(businessOpeningReason(s,'PEK','ticketing')).toBe('');const exact=new GameCore(s.lastWallTime,s);
    act(exact,{type:'open-business-team',airportId:'PEK',kind:'ticketing'});expect(exact.snapshot().credits).toBe(0);
    act(c,{type:'open-business-team',airportId:'PEK',kind:'ticketing'});const before=c.snapshot(),team=before.business.teams[0]!,q=businessTeamQuote(before,team);
    expect(q.expansionCost).toBeLessThan(1600);act(c,{type:'expand-business-team',teamId:team.id});expect(c.snapshot().credits).toBe(before.credits-q.expansionCost);
    const worker=c.snapshot().career.employees.find(e=>e.department==='business'&&e.role==='specialist')!,training=businessTrainingQuote(c.snapshot(),worker),coins=c.snapshot().credits;
    expect(training.cost).toBeLessThan(200);act(c,{type:'train-business-employee',employeeId:worker.id});expect(c.snapshot().credits).toBe(coins-training.cost);
  });
  it('locks passenger and cargo bonuses at departure, survives expiry/import and pays once',()=>{
    const c=rich(); hire(c,'cabin');hire(c,'cargo');loaded(c);
    const state=c.snapshot(); for(const e of state.career.employees)e.paidUntil=1;
    const run=new GameCore(NOW,state),orders=manifest(state,'AC0001');
    const plain=structuredClone(state);plain.career.employees.forEach(e=>e.paidUntil=0);
    const base=quote(plain,plain.fleet[0]!,'PVG').revenue;
    const extra=Math.floor(orders.reduce((sum,o)=>sum+o.reward*departmentEffect(state,o.kind==='cargo'?'cargo':'cabin'),0)/100);
    expect(extra).toBeGreaterThan(0);expect(quote(state,state.fleet[0]!,'PVG').revenue).toBe(base+extra);
    fly(run); const locked=run.snapshot().fleet[0]!.flight!;run.tick(NOW+1000);
    expect(validateSave(run.snapshot())).toEqual(run.snapshot());expect(run.snapshot().fleet[0]!.flight).toEqual(locked);
    const restored=GameCore.imported(run.snapshot(),NOW+86400_000),coins=restored.snapshot().credits;
    restored.tick(NOW+86400_000+(locked.arriveAt-1)*1000);
    expect(restored.snapshot().credits).toBe(coins+base+extra);expect(restored.snapshot().stats.revenue).toBe(base+extra);
    const settled=restored.snapshot();restored.tick(settled.lastWallTime);expect(restored.snapshot()).toEqual(settled);
    const bad=run.snapshot();bad.fleet[0]!.flight!.revenue++;expect(()=>validateSave(bad)).toThrow();
    for(const value of [-1,16,NaN,.5]) {const bad=run.snapshot();bad.fleet[0]!.flight!.cargoBonus=value;expect(()=>validateSave(bad)).toThrow();}
  });
  it('keeps in-flight revenue unchanged after training and gives no bonus to empty flights',()=>{
    const c=rich(),w=hire(c,'cabin');loaded(c);fly(c);const before=c.snapshot().fleet[0]!.flight!;
    act(c,{type:'train-employee',employeeId:w.id,training:'skill'});expect(c.snapshot().fleet[0]!.flight).toEqual(before);
    const empty=rich();hire(empty,'cabin');hire(empty,'cargo');fly(empty);expect(empty.snapshot().fleet[0]!.flight!.revenue).toBe(0);
  });
  it('shortens actual turnaround and forecasts plans without rewriting a started turnaround',()=>{
    const c=rich();hire(c,'operations');const s=c.snapshot(),seconds=turnaroundSeconds(s);expect(seconds).toBeLessThan(8);
    const plan=planQuote(s,s.fleet[0]!,['PVG','PEK']);expect(plan.duration).toBe(plan.legs.reduce((sum,l)=>sum+l.duration,0)+seconds);
    fly(c);const at=c.snapshot().fleet[0]!.flight!.arriveAt;c.tick(NOW+at*1000);
    expect(c.snapshot().fleet[0]!.readyAt).toBe(at+seconds);
    act(c,{type:'train-employee',employeeId:c.snapshot().career.employees[0]!.id,training:'skill'});expect(c.snapshot().fleet[0]!.readyAt).toBe(at+seconds);
  });
});
