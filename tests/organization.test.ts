import { describe, expect, it } from 'vitest';
import { GameCore, validateSave, parseSave, energyCapacity, type Command, type GameState } from '../src/core/game.js';
import { GameCore as V7Core } from '../src/core/v7/game.js';
import { directReports, effectiveManager, employmentPrice, groundServiceQuote, managerCapacity, trainingQuote, type Department, type EmployeeRole } from '../src/core/organization.js';
import { organizationLayout, ORG_NODE_HEIGHT, ORG_NODE_WIDTH } from '../src/ui/organization-layout.js';
const NOW = Date.parse('2026-09-14T02:00:00Z');
function rich() { const s = new GameCore(NOW).snapshot(); s.credits = 1000000; s.career.tickets = 10000; return new GameCore(NOW, s); }
function cmd(c: GameCore, command: Command) { c.execute(command, c.snapshot().lastWallTime); expect(validateSave(c.snapshot())).toEqual(c.snapshot()); }
function recruit(c: GameCore, department: Department = 'flight', role: EmployeeRole = 'specialist') { cmd(c, { type: 'recruit-employee', department, role }); return c.snapshot().career.employees.at(-1)!; }
function rejects(c: GameCore, command: Command, message?: RegExp) { const before = c.snapshot(); expect(() => c.execute(command, before.lastWallTime)).toThrow(message); expect(c.snapshot()).toEqual(before); }
function tick(c: GameCore, seconds: number) { c.tick(c.snapshot().lastWallTime + seconds * 1000); expect(validateSave(c.snapshot())).toEqual(c.snapshot()); }
function servicing() {
  const c = rich(), e = recruit(c, 'ground'); cmd(c, { type: 'assign-ground', employeeId: e.id, airportId: 'PEK' });
  const s = c.snapshot(); s.fleet[0]!.energy.availableSeconds -= 600; return new GameCore(NOW, s);
}
describe('frozen v7 migration and unified employee identity', () => {
  it('preserves every historical contract, skill, asset and locked flight without new charges', () => {
    const old = new V7Core(NOW);
    old.execute({ type: 'recruit-pilot' }, NOW); old.execute({ type: 'assign-pilot', pilotId: 1, planeId: 'AC0001' }, NOW);
    old.execute({ type: 'train-pilot', pilotId: 1 }, NOW); old.execute({ type: 'start-duty', planeId: 'AC0001', to: 'PVG' }, NOW);
    const saved = old.snapshot(), s = parseSave(JSON.stringify(saved));
    expect(s.version).toBe(8); expect(s.credits).toBe(saved.credits); expect(s.fleet).toEqual(saved.fleet); expect(s.orders).toEqual(saved.orders);
    const { pilots, ...oldCareer } = saved.career, { employees, ...newCareer } = s.career;
    expect(newCareer).toEqual(oldCareer); expect(employees).toHaveLength(pilots.length);
    expect(employees[0]).toMatchObject(pilots[0]!); expect(employees[0]!.potential).toBe(10); expect(employees[0]!.joinedAt).toBeNull();
    expect(validateSave(s)).toEqual(s); expect(new GameCore(NOW, s).snapshot()).toEqual(s);
    const live = new GameCore(NOW, s); tick(live, s.fleet[0]!.flight!.arriveAt); const arrived = live.snapshot();
    expect(arrived.stats.flights).toBe(1); expect(arrived.career.employees[0]!.flights).toBe(1);
    live.tick(live.snapshot().lastWallTime); expect(live.snapshot()).toEqual(arrived);
  });
  it('validates v7 strictly before migration and rejects added fields and over-level skills', () => {
    const c = new V7Core(NOW); c.execute({ type: 'recruit-pilot' }, NOW);
    const s = c.snapshot(); s.career.pilots[0]!.skill = 11; expect(() => validateSave(s)).toThrow();
    const bad = c.snapshot() as unknown as { career: Record<string, unknown> }; bad.career.employees = []; expect(() => validateSave(bad)).toThrow();
    const live = rich().snapshot(); (live.career as unknown as Record<string, unknown>).pilots = []; expect(() => validateSave(live)).toThrow();
  });
  it('keeps old maximum-level training and expired wages intact', () => {
    const c = new V7Core(NOW); c.execute({ type: 'recruit-pilot' }, NOW); const s = c.snapshot();
    s.career.pilots[0]!.skill = 10; s.career.pilots[0]!.paidUntil = 0;
    const live = new GameCore(NOW, s); expect(live.snapshot().career.employees[0]!.skill).toBe(10);
    expect(live.snapshot().career.employees[0]!.paidUntil).toBe(0); rejects(live, { type: 'train-pilot', pilotId: 1 }, /上限/);
  });
  it('uses bounded, seeded profiles without rerolling on refresh', () => {
    const c = rich(), e = recruit(c); expect(e.potential).toBeGreaterThanOrEqual(6); expect(e.potential).toBeLessThanOrEqual(10);
    expect(recruit(new GameCore(NOW, c.snapshot()))).toEqual(recruit(c));
  });
  it('keeps eight flight, four ground and one manager per department as separate limits', () => {
    const c = rich(); for (let i = 0; i < 8; i++) recruit(c); for (let i = 0; i < 4; i++) recruit(c, 'ground');
    recruit(c, 'flight', 'manager'); recruit(c, 'ground', 'manager'); expect(c.snapshot().career.employees).toHaveLength(14);
    for (const department of ['flight', 'ground'] as const) for (const role of ['specialist', 'manager'] as const) rejects(c, { type: 'recruit-employee', department, role }, /岗位已满/);
  });
});
describe('assignments, careers and reporting', () => {
  it('moves a pilot between planes atomically and never duplicates staffing', () => {
    const c = rich(), a = recruit(c), b = recruit(c); cmd(c, { type: 'buy', modelId: 'swift-p', airportId: 'PEK' });
    const second = c.snapshot().fleet[1]!.id; cmd(c, { type: 'assign-pilot', pilotId: a.id, planeId: 'AC0001' }); cmd(c, { type: 'assign-pilot', pilotId: b.id, planeId: second });
    rejects(c, { type: 'assign-pilot', pilotId: a.id, planeId: second }, /已有飞行员/);
    cmd(c, { type: 'assign-pilot', pilotId: b.id, planeId: null }); cmd(c, { type: 'assign-pilot', pilotId: a.id, planeId: second });
    expect(c.snapshot().fleet[0]!.dispatcher).toBe(false); expect(c.snapshot().fleet[1]!.dispatcher).toBe(true);
  });
  it('requires same-department managers and disallows self or manager-to-manager reporting', () => {
    const c = rich(), p = recruit(c), f = recruit(c, 'flight', 'manager'), g = recruit(c, 'ground', 'manager');
    rejects(c, { type: 'report-to', employeeId: p.id, managerId: p.id }); rejects(c, { type: 'report-to', employeeId: p.id, managerId: g.id });
    rejects(c, { type: 'report-to', employeeId: f.id, managerId: g.id }); rejects(c, { type: 'report-to', employeeId: p.id, managerId: 999 });
    cmd(c, { type: 'report-to', employeeId: p.id, managerId: f.id }); expect(c.snapshot().career.employees[0]!.managerId).toBe(f.id);
  });
  it('promotes a qualified pilot, retains contract and identity, and releases the plane', () => {
    const c = rich(), p = recruit(c); cmd(c, { type: 'assign-pilot', pilotId: p.id, planeId: 'AC0001' });
    rejects(c, { type: 'employee-role', employeeId: p.id, role: 'manager' }, /晋升需要/);
    for (const training of ['skill','skill','management'] as const) cmd(c, { type: 'train-employee', employeeId: p.id, training });
    const before = c.snapshot(); cmd(c, { type: 'employee-role', employeeId: p.id, role: 'manager' });
    const after = c.snapshot(); expect(after.career.employees[0]!).toMatchObject({ id: p.id, name: p.name, paidUntil: p.paidUntil, planeId: null, role: 'manager', skill: 2 });
    expect(after.fleet[0]!.dispatcher).toBe(false); expect(after.credits).toBe(before.credits); expect(after.career.tickets).toBe(before.career.tickets);
  });
  it('cannot reassign or promote an operating pilot and preserves locked flight', () => {
    const c = rich(), p = recruit(c); for (const training of ['skill','skill','management'] as const) cmd(c, { type: 'train-employee', employeeId: p.id, training });
    cmd(c, { type: 'assign-pilot', pilotId: p.id, planeId: 'AC0001' }); cmd(c, { type: 'start-duty', planeId: 'AC0001', to: 'PVG' });
    rejects(c, { type: 'employee-role', employeeId: p.id, role: 'manager' }, /停止运营/); rejects(c, { type: 'assign-pilot', pilotId: p.id, planeId: null });
    const flight = c.snapshot().fleet[0]!.flight; recruit(c, 'ground'); expect(c.snapshot().fleet[0]!.flight).toEqual(flight);
  });
  it('demotion returns reports to the player and does not revoke earned crew tasks', () => {
    const c = rich(), m = recruit(c, 'flight', 'manager'), p = recruit(c); cmd(c, { type: 'report-to', employeeId: p.id, managerId: m.id });
    cmd(c, { type: 'career-claim', id: 'crew-1' });
    cmd(c, { type: 'employee-role', employeeId: m.id, role: 'specialist' }); expect(c.snapshot().career.employees[1]!.managerId).toBeNull();
    expect(c.snapshot().career.claimed).toContain('crew-1');
    expect(c.snapshot().career.employees[0]!.paidUntil).toBe(m.paidUntil);
  });
  it('does not permit demotion into a full specialist department', () => {
    const c = rich(), m = recruit(c, 'flight', 'manager'); for (let i=0;i<8;i++) recruit(c);
    rejects(c, { type: 'employee-role', employeeId: m.id, role: 'specialist' }, /岗位已满/);
  });
  it('records paid deliveries once, but empty flights do not farm employee achievements', () => {
    const c = rich(), p = recruit(c); cmd(c, { type: 'assign-pilot', pilotId: p.id, planeId: 'AC0001' });
    cmd(c, { type: 'dispatch', planeId: 'AC0001', to: 'PVG', auto: false }); tick(c, c.snapshot().fleet[0]!.flight!.arriveAt + 8);
    expect(c.snapshot().career.employees[0]!.flights).toBe(0);
    cmd(c, { type: 'load-destination', planeId: 'AC0001', to: 'PEK' }); cmd(c, { type: 'dispatch', planeId: 'AC0001', to: 'PEK', auto: false });
    tick(c, c.snapshot().fleet[0]!.flight!.arriveAt - c.snapshot().simTime); expect(c.snapshot().career.employees[0]!.flights).toBe(1);
    const after = c.snapshot(); tick(c, 0); expect(c.snapshot()).toEqual(after);
  });
});
describe('bounded management and contracts', () => {
  it('covers reports by stable id, does not stack layers, and falls back when expired', () => {
    const c = rich(), m = recruit(c, 'flight', 'manager'); const people = Array.from({length:5}, () => recruit(c));
    for (const p of people) cmd(c, { type: 'report-to', employeeId: p.id, managerId: m.id });
    const s = c.snapshot(), capacity = managerCapacity(m), first = s.career.employees[1]!, last = s.career.employees.at(-1)!;
    expect(directReports(s, m.id)).toHaveLength(5); expect(effectiveManager(s, first)?.id).toBe(m.id); expect(effectiveManager(s, last)).toBeUndefined();
    expect(capacity).toBeLessThan(5); expect(trainingQuote(s, first, 'skill').gold).toBeLessThan(400); expect(trainingQuote(s, last, 'skill').gold).toBe(400);
    expect(trainingQuote(s, first, 'management').discount).toBe(0); s.career.employees[0]!.paidUntil = 0;
    expect(trainingQuote(s, first, 'skill').gold).toBe(400); expect(validateSave(s)).toEqual(s);
  });
  it('uses the exact visible training quote and rolls back failed payment', () => {
    const c = rich(), p = recruit(c), m = recruit(c, 'flight', 'manager'); cmd(c, { type: 'report-to', employeeId: p.id, managerId: m.id });
    const s = c.snapshot(), cost = trainingQuote(s, s.career.employees[0]!, 'skill'); cmd(c, { type: 'train-employee', employeeId: p.id, training: 'skill' });
    expect(c.snapshot().credits).toBe(s.credits-cost.gold); expect(c.snapshot().career.tickets).toBe(s.career.tickets-cost.tickets);
    const poor = c.snapshot(); poor.credits = 0; rejects(new GameCore(NOW, poor), { type: 'train-employee', employeeId: p.id, training: 'skill' }, /金币不足/);
  });
  it('honors potential and bounded history without resetting wages or skills', () => {
    const c = rich(), p = recruit(c); for(let i=0;i<p.potential;i++) cmd(c,{type:'train-employee',employeeId:p.id,training:'skill'});
    rejects(c,{type:'train-employee',employeeId:p.id,training:'skill'},/上限/);
    for(let i=0;i<25;i++) cmd(c,{type:'renew-employee',employeeId:p.id}); expect(c.snapshot().career.employees[0]!.history).toHaveLength(20);
  });
  it('uses prepaid wages, stops only new bonuses at expiry and incurs no automatic debt', () => {
    const c = rich(), p = recruit(c, 'ground'); const s = c.snapshot(); s.career.employees[0]!.paidUntil = 1;
    const run = new GameCore(NOW,s); tick(run,2); expect(run.snapshot().credits).toBe(s.credits);
    cmd(run,{type:'renew-employee',employeeId:p.id}); expect(run.snapshot().career.employees[0]!.paidUntil).toBe(2+7*86400);
    expect(run.snapshot().credits).toBe(s.credits-employmentPrice(p).gold);
  });
});
describe('ground staffing and immutable service deadlines', () => {
  it('binds ground staff to one real airport and guards closure and incompatible roles', () => {
    const c = rich(), a = recruit(c,'ground'), b = recruit(c,'ground'), p = recruit(c);
    cmd(c,{type:'assign-ground',employeeId:a.id,airportId:'PEK'});
    rejects(c,{type:'assign-ground',employeeId:b.id,airportId:'PEK'},/已有地勤/); rejects(c,{type:'assign-ground',employeeId:b.id,airportId:'XXX'});
    rejects(c,{type:'assign-ground',employeeId:p.id,airportId:'PVG'}); rejects(c,{type:'assign-pilot',pilotId:a.id,planeId:'AC0001'});
    cmd(c,{type:'unlock',airportId:'CAN'}); cmd(c,{type:'assign-ground',employeeId:b.id,airportId:'CAN'});
    rejects(c,{type:'close-airport',airportId:'CAN'},/地勤/); cmd(c,{type:'assign-ground',employeeId:b.id,airportId:null}); cmd(c,{type:'close-airport',airportId:'CAN'});
  });
  it('improves only the staffed airport and caps the service improvement at 30 percent', () => {
    const c = servicing(); const s = c.snapshot(); expect(groundServiceQuote(s,'PEK').seconds).toBeLessThan(120); expect(groundServiceQuote(s,'PVG').seconds).toBe(120);
    const m = recruit(c,'ground','manager'); cmd(c,{type:'report-to',employeeId:1,managerId:m.id}); const max = c.snapshot();
    max.career.employees[0]!.skill = 10; max.career.employees[0]!.potential = 10; max.career.employees[0]!.trait = 'efficient';
    max.career.employees[1]!.management = 10; max.career.employees[1]!.potential = 10;
    expect(validateSave(max)).toEqual(max); expect(groundServiceQuote(max,'PEK').seconds).toBe(84);
    max.career.employees[0]!.paidUntil = 0; expect(groundServiceQuote(max,'PEK').seconds).toBe(120);
  });
  it('locks the service deadline despite training, movement, expiry and reload', () => {
    const c = servicing(); const s = c.snapshot(); s.career.employees[0]!.paidUntil=5; const run = new GameCore(NOW,s);
    const expected = groundServiceQuote(s,'PEK').seconds; cmd(run,{type:'service-energy',planeId:'AC0001'});
    cmd(run,{type:'train-employee',employeeId:1,training:'skill'}); cmd(run,{type:'assign-ground',employeeId:1,airportId:'PVG'});
    const deadline=run.snapshot().fleet[0]!.energy.serviceUntil; expect(deadline).toBe(expected); tick(run,6);
    const reload = new GameCore(run.snapshot().lastWallTime,run.snapshot()); expect(reload.snapshot().fleet[0]!.energy.serviceUntil).toBe(deadline);
    tick(reload,expected-6); const full=reload.snapshot(); expect(full.fleet[0]!.energy.availableSeconds).toBe(energyCapacity(full.fleet[0]!));
    expect(full.fleet[0]!.energy.serviceUntil).toBeNull(); const credits=full.credits; tick(reload,0); expect(reload.snapshot().credits).toBe(credits);
  });
  it('preserves a service already started in v7 when adding ground staff after migration', () => {
    const old=new V7Core(NOW),s=old.snapshot();s.fleet[0]!.energy.availableSeconds-=60;const legacy=new V7Core(NOW,NOW && s);
    legacy.execute({type:'service-energy',planeId:'AC0001'},NOW); const c=new GameCore(NOW,legacy.snapshot()); const e=recruit(c,'ground');
    cmd(c,{type:'assign-ground',employeeId:e.id,airportId:'PEK'}); expect(c.snapshot().fleet[0]!.energy.serviceUntil).toBe(120);
  });
  it('never grants energy on cancellation or from a read-only quote', () => {
    const c=servicing(),before=c.snapshot(); groundServiceQuote(before,'PEK');expect(c.snapshot()).toEqual(before);
    cmd(c,{type:'service-energy',planeId:'AC0001'});cmd(c,{type:'cancel-energy-service',planeId:'AC0001'});
    expect(c.snapshot().fleet[0]!.energy.availableSeconds).toBe(before.fleet[0]!.energy.availableSeconds);
  });
});
describe('strict organization saves and read-only tree layout', () => {
  const mutations: [string,(s:GameState)=>void][] = [
    ['cycle',s=>{s.career.employees[0]!.managerId=1;}],['missing manager',s=>{s.career.employees[0]!.managerId=999;}],
    ['non-manager',s=>{s.career.employees[0]!.managerId=2;}],['unknown airport',s=>{s.career.employees[1]!.airportId='XXX';}],
    ['wrong asset type',s=>{s.career.employees[0]!.airportId='PEK';}],['duplicate id',s=>{s.career.employees[1]!.id=1;}],
    ['unknown extra field',s=>{Object.assign(s.career.employees[0]!,{bonus:999});}],['invalid potential',s=>{s.career.employees[0]!.potential=Infinity;}],
    ['skill over potential',s=>{s.career.employees[0]!.skill=11;}],['negative contract',s=>{s.career.employees[0]!.paidUntil=-1;}],
    ['future history',s=>{s.career.employees[0]!.history[0]!.at=100;}],['future entry',s=>{s.career.employees[0]!.joinedAt=100;}],
    ['fake personal flights',s=>{s.career.employees[0]!.flights=100;}],['empty history',s=>{s.career.employees[0]!.history=[];}],
  ];
  it.each(mutations)('rejects %s without altering the input',(_name,mutate)=>{
    const c=rich();recruit(c);recruit(c,'ground');const s=c.snapshot();mutate(s);const before=structuredClone(s);expect(()=>validateSave(s)).toThrow();expect(s).toEqual(before);
  });
  it('separates pending people from real reporting links and keeps all layout computation read-only',()=>{
    const c=rich(),pending=recruit(c),assigned=recruit(c),m=recruit(c,'flight','manager');
    cmd(c,{type:'assign-pilot',pilotId:assigned.id,planeId:'AC0001'});cmd(c,{type:'report-to',employeeId:assigned.id,managerId:m.id});
    const s=c.snapshot(),before=structuredClone(s),layout=organizationLayout(s,{flight:false,ground:false});
    expect(layout.pending.map(e=>e.id)).toEqual([pending.id]);expect(layout.nodes.map(n=>n.employee.id).sort()).toEqual([assigned.id,m.id].sort());
    for(const n of layout.nodes){expect(n.x).toBeGreaterThanOrEqual(0);expect(n.x+ORG_NODE_WIDTH).toBeLessThanOrEqual(layout.width);expect(n.y+ORG_NODE_HEIGHT).toBeLessThanOrEqual(layout.height);}
    for(let i=0;i<layout.nodes.length;i++)for(let j=i+1;j<layout.nodes.length;j++){const a=layout.nodes[i]!,b=layout.nodes[j]!;expect(Math.abs(a.x-b.x)>=ORG_NODE_WIDTH||Math.abs(a.y-b.y)>=ORG_NODE_HEIGHT).toBe(true);}
    expect(organizationLayout(s,{flight:true,ground:false}).nodes.map(n=>n.employee.id)).not.toContain(assigned.id); expect(s).toEqual(before);
  });
});
