import { describe, expect, it } from 'vitest';
import { GameCore, quote, validateSave, type Command, type GameState } from '../helpers/configured-game.js';
import { CONTRACT_SECONDS, MAX_EMPLOYEES, directReports, effectiveManager, employmentPrice, groundServiceQuote, roleName, trainingQuote, type Department, type EmployeeRole } from '../../src/core/organization.js';
import { organizationLayout, ORG_NODE_WIDTH } from '../../src/ui/organization-layout.js';

const NOW = Date.parse('2026-09-14T02:00:00Z');
function rich() { const state = new GameCore(NOW).snapshot(); state.credits = 1000000; return new GameCore(NOW, state); }
function execute(core: GameCore, command: Command) { core.execute(command, core.snapshot().lastWallTime); expect(validateSave(core.snapshot())).toEqual(core.snapshot()); }
function hire(core: GameCore, department: Department = 'company', role: EmployeeRole = 'manager') { execute(core, { type: 'recruit-employee', department, role }); return core.snapshot().career.employees.at(-1)!; }
function reject(core: GameCore, command: Command) { const before = core.snapshot(); expect(() => core.execute(command, before.lastWallTime)).toThrow(); expect(core.snapshot()).toEqual(before); }

describe('recruitable general manager', () => {
  it('fills exactly one prepaid NPC position without changing assets or operational state', () => {
    const core = rich(), before = core.snapshot(), manager = hire(core), after = core.snapshot();
    expect(manager).toMatchObject({ department: 'company', role: 'manager', managerId: null, planeId: null, airportId: null, skill: 2, management: 1, paidUntil: CONTRACT_SECONDS });
    expect(manager.name).not.toBe(''); expect(roleName(manager)).toBe('总经理');
    expect(employmentPrice(manager, true)).toEqual({ gold: 2800 });
    expect(after.credits).toBe(before.credits - 2800);
    expect(after.fleet).toEqual(before.fleet); expect(after.airports).toEqual(before.airports); expect(after.orders).toEqual(before.orders);
    reject(core, { type: 'recruit-employee', department: 'company', role: 'manager' });
    reject(core, { type: 'recruit-employee', department: 'company', role: 'specialist' });
  });

  it('keeps the existing department limits and adds one fifteenth position', () => {
    const core = rich();
    while(core.snapshot().fleet.length<8){if(core.snapshot().fleet.length>=core.snapshot().hangarSlots)execute(core,{type:'expand-hangar'});execute(core,{type:'buy',modelId:'diamond-da40',airportId:'PEK',passengers:1,cargo:0});}
    for(const airportId of ['CAN','WUH'])execute(core,{type:'unlock',airportId});
    for (let i = 0; i < 8; i++) hire(core, 'flight', 'specialist');
    for (let i = 0; i < 4; i++) hire(core, 'ground', 'specialist');
    hire(core, 'flight'); hire(core, 'ground'); hire(core);
    expect(MAX_EMPLOYEES).toBe(36); expect(core.snapshot().career.employees).toHaveLength(15);
    for (const [department, role] of [['company', 'manager'], ['flight', 'manager'], ['ground', 'manager'], ['flight', 'specialist'], ['ground', 'specialist']] as const)
      reject(core, { type: 'recruit-employee', department, role });
  });

  it('rejects unaffordable recruitment atomically including RNG and reporting changes', () => {
    const core = rich(); hire(core, 'flight'); const state = core.snapshot();
    for (const credits of [0, 2799]) {
      const insufficient = structuredClone(state);
      insufficient.credits = credits;
      reject(new GameCore(NOW, insufficient), { type: 'recruit-employee', department: 'company', role: 'manager' });
    }
  });

  it('supports ordinary training and contract renewal with exact charges and reload recovery', () => {
    const core = rich(), manager = hire(core), before = core.snapshot();
    expect(trainingQuote(before, manager, 'skill')).toMatchObject({ gold: 1500, discount: 0 });
    expect(trainingQuote(before, manager, 'management')).toMatchObject({ gold: 800, discount: 0 });
    execute(core, { type: 'train-employee', employeeId: manager.id, training: 'skill' });
    execute(core, { type: 'train-employee', employeeId: manager.id, training: 'management' });
    execute(core, { type: 'renew-employee', employeeId: manager.id });
    const after = core.snapshot();
    expect(after.credits).toBe(before.credits - 1500 - 800 - 1000);
    expect(after.career.employees[0]).toMatchObject({ id: manager.id, name: manager.name, skill: 3, management: 2, paidUntil: 2 * CONTRACT_SECONDS });
    expect(new GameCore(NOW, JSON.parse(JSON.stringify(after))).snapshot()).toEqual(after);
    const expired = structuredClone(after); expired.career.employees[0]!.paidUntil = 1;
    const run = new GameCore(NOW, expired); run.tick(NOW + 2000); const expiredBalance = run.snapshot().credits;
    execute(run, { type: 'renew-employee', employeeId: manager.id });
    expect(run.snapshot().career.employees[0]!.paidUntil).toBe(2 + CONTRACT_SECONDS); expect(run.snapshot().credits).toBe(expiredBalance - 1000);
  });
});

describe('company and department reporting', () => {
  it('attaches existing and later department managers while specialists retain their real managers', () => {
    const core = rich(), flight = hire(core, 'flight'), pilot = hire(core, 'flight', 'specialist');
    execute(core, { type: 'report-to', employeeId: pilot.id, managerId: flight.id });
    const general = hire(core), ground = hire(core, 'ground'), state = core.snapshot();
    expect(directReports(state, general.id).map(e => e.id)).toEqual([flight.id, ground.id]);
    expect(state.career.employees.find(e => e.id === pilot.id)!.managerId).toBe(flight.id);
    execute(core, { type: 'report-to', employeeId: flight.id, managerId: null });
    expect(directReports(core.snapshot(), general.id).map(e => e.id)).toEqual([ground.id]);
    execute(core, { type: 'report-to', employeeId: flight.id, managerId: general.id });
    reject(core, { type: 'report-to', employeeId: pilot.id, managerId: general.id });
    reject(core, { type: 'report-to', employeeId: flight.id, managerId: ground.id });
    reject(core, { type: 'report-to', employeeId: flight.id, managerId: flight.id });
    reject(core, { type: 'report-to', employeeId: general.id, managerId: flight.id });
    reject(core, { type: 'report-to', employeeId: general.id, managerId: null });
    reject(core, { type: 'employee-role', employeeId: general.id, role: 'specialist' });
    reject(core, { type: 'assign-pilot', pilotId: general.id, planeId: 'AC0001' });
    reject(core, { type: 'assign-ground', employeeId: general.id, airportId: 'PEK' });
  });

  it('attaches internally promoted managers and clears company reporting on their demotion', () => {
    const core = rich(), general = hire(core), pilot = hire(core, 'flight', 'specialist');
    for (const training of ['skill', 'skill', 'management'] as const) execute(core, { type: 'train-employee', employeeId: pilot.id, training });
    execute(core, { type: 'assign-pilot', pilotId: pilot.id, planeId: 'AC0001' });
    execute(core, { type: 'employee-role', employeeId: pilot.id, role: 'manager' });
    expect(core.snapshot().career.employees.find(e => e.id === pilot.id)).toMatchObject({ role: 'manager', managerId: general.id, planeId: null });
    expect(core.snapshot().fleet[0]!.dispatcher).toBe(false);
    execute(core, { type: 'employee-role', employeeId: pilot.id, role: 'specialist' });
    expect(core.snapshot().career.employees.find(e => e.id === pilot.id)).toMatchObject({ role: 'specialist', managerId: null });
    expect(directReports(core.snapshot(), general.id)).toEqual([]);
  });

  it('does not add cross-department mentoring, ground service or flight bonuses', () => {
    const core = rich(), manager = hire(core, 'ground'), ground = hire(core, 'ground', 'specialist');
    execute(core, { type: 'assign-ground', employeeId: ground.id, airportId: 'PEK' });
    execute(core, { type: 'report-to', employeeId: ground.id, managerId: manager.id });
    const before = core.snapshot(), service = groundServiceQuote(before, 'PEK'), flight = quote(before, before.fleet[0]!, 'PVG');
    hire(core); const after = core.snapshot(), currentManager = after.career.employees.find(e => e.id === manager.id)!;
    expect(effectiveManager(after, currentManager)).toBeUndefined();
    expect(trainingQuote(after, currentManager, 'skill')).toEqual(trainingQuote(before, manager, 'skill'));
    expect(trainingQuote(after, after.career.employees.find(e => e.id === ground.id)!, 'skill')).toEqual(trainingQuote(before, before.career.employees.find(e => e.id === ground.id)!, 'skill'));
    expect(groundServiceQuote(after, 'PEK')).toEqual(service); expect(quote(after, after.fleet[0]!, 'PVG')).toEqual(flight);
    execute(core, { type: 'train-employee', employeeId: manager.id, training: 'skill' });
    expect(core.snapshot().talent.mentoring).toEqual([]);
  });
});

describe('strict company-manager saves and read-only layout', () => {
  const invalid: [string, (state: GameState) => void][] = [
    ['company specialist', state => { state.career.employees[0]!.role = 'specialist'; }],
    ['duplicate general manager', state => { state.career.employees[1]!.department = 'company'; state.career.employees[1]!.managerId = null; }],
    ['general manager upper link', state => { state.career.employees[0]!.managerId = 2; }],
    ['specialist directly below general manager', state => { state.career.employees[2]!.managerId = 1; }],
    ['department manager self link', state => { state.career.employees[1]!.managerId = 2; }],
    ['general manager airport assignment', state => { state.career.employees[0]!.airportId = 'PEK'; }],
    ['general manager aircraft assignment', state => { state.career.employees[0]!.planeId = 'AC0001'; }],
    ['general manager invented flights', state => { state.career.employees[0]!.flights = 1; }],
    ['general manager invented deliveries', state => { state.career.employees[0]!.deliveries = 1; }],
  ];
  it.each(invalid)('rejects %s without repairing or overwriting input', (_name, mutate) => {
    const core = rich(); hire(core); hire(core, 'flight'); hire(core, 'flight', 'specialist');
    const state = core.snapshot(); mutate(state); const before = structuredClone(state);
    expect(() => validateSave(state)).toThrow(); expect(state).toEqual(before);
  });

  it('replaces the vacant root with one real employee and draws only actual reporting links', () => {
    const core = rich(), empty = organizationLayout(core.snapshot());
    expect(empty.vacant.filter(slot => slot.department === 'company')).toHaveLength(1);
    const flight = hire(core, 'flight'), general = hire(core), state = core.snapshot(), before = structuredClone(state), layout = organizationLayout(state);
    const root = layout.nodes.find(node => node.employee.id === general.id)!;
    expect(root.employee).toEqual(general); expect(root.x + ORG_NODE_WIDTH / 2).toBe(layout.width / 2);
    expect(layout.vacant.some(slot => slot.department === 'company')).toBe(false);
    expect(layout.nodes.filter(node => node.employee.id === general.id)).toHaveLength(1);
    expect(layout.edges).toHaveLength(1); expect(layout.edges[0]!.direct).toBe(false); expect(state).toEqual(before);
    execute(core, { type: 'report-to', employeeId: flight.id, managerId: null });
    expect(organizationLayout(core.snapshot()).edges).toHaveLength(0);
  });
});
