import { describe, expect, it } from 'vitest';
import { GameCore, validateSave, type Command, type GameState } from '../helpers/configured-game.js';
import { GameCore as NewCompany } from '../../src/core/game.js';
import { effectiveManager, employmentPrice, recruitmentAssignment } from '../../src/core/organization.js';

const NOW = Date.parse('2026-09-27T02:00:00Z');
function rich(planes = 1) {
  const state = (planes ? new GameCore(NOW) : new NewCompany(NOW)).snapshot(); state.credits = 1000000; state.career.tickets = 10000;
  const core = new GameCore(NOW, state);
  while (core.snapshot().fleet.length < planes) execute(core, { type: 'buy', modelId: 'diamond-da40', airportId: 'PEK', passengers: 1, cargo: 0 });
  return core;
}
function execute(core: GameCore, command: Command) {
  core.execute(command, core.snapshot().lastWallTime); expect(validateSave(core.snapshot())).toEqual(core.snapshot());
}
function candidateCommand(state: GameState, department: 'flight' | 'ground' = 'flight'): Command {
  return { type: 'hire-candidate', candidateId: state.talent.candidates.find(c => c.department === department && c.role === 'specialist')!.id };
}
function reject(core: GameCore, command: Command, message?: RegExp) {
  const before = core.snapshot(); expect(() => core.execute(command, before.lastWallTime)).toThrow(message);
  expect(core.snapshot()).toEqual(before);
}

describe('recruitment immediately fills a real position', () => {
  it.each(['candidate', 'recruit-pilot', 'recruit-employee'] as const)('%s puts a pilot on the first free aircraft and preserves the quoted price', entry => {
    const core = rich(2), before = core.snapshot();
    const command: Command = entry === 'candidate' ? candidateCommand(before) : entry === 'recruit-pilot'
      ? { type: 'recruit-pilot' } : { type: 'recruit-employee', department: 'flight', role: 'specialist' };
    const preview = recruitmentAssignment(before, { department: 'flight', role: 'specialist' });
    expect(before).toEqual(core.snapshot()); expect(preview).toEqual({ planeId: 'AC0001', airportId: null, reason: '' });
    execute(core, command); const after = core.snapshot(), employee = after.career.employees[0]!;
    expect(employee).toMatchObject({ planeId: 'AC0001', airportId: null, managerId: null });
    expect(employee.history.map(event => event.kind)).toEqual(['assigned', 'joined']);
    expect(after.fleet.map(plane => plane.dispatcher)).toEqual([true, false]);
    const price = employmentPrice(employee, true);
    expect(after.credits).toBe(before.credits - price.gold); expect(after.career.tickets).toBe(before.career.tickets - price.tickets);
    if (entry === 'candidate') {
      const profile = before.talent.candidates.find(c => c.department === 'flight' && c.role === 'specialist')!;
      expect(employee).toMatchObject({ name: profile.name, potential: profile.potential, trait: profile.trait });
      expect(after.talent.nextId).toBe(before.talent.nextId + 1);
    }
    expect(new GameCore(NOW, after).snapshot()).toEqual(after);
  });
  it('honors the aircraft-specific shortcut without leaving the first aircraft staffed', () => {
    const core = rich(2), before = core.snapshot(), target = before.fleet[1]!.id;
    execute(core, { type: 'hire-dispatcher', planeId: target }); const after = core.snapshot();
    expect(after.career.employees).toHaveLength(1); expect(after.career.employees[0]!.planeId).toBe(target);
    const assignments = after.career.employees[0]!.history.filter(event => event.kind === 'assigned');
    expect(assignments).toHaveLength(1); expect(assignments[0]!.text).toContain(target); expect(assignments[0]!.text).not.toContain('AC0001');
    expect(after.fleet.map(plane => plane.dispatcher)).toEqual([false, true]);
    expect(after.credits).toBe(before.credits - 1800); expect(after.career.tickets).toBe(before.career.tickets - 3);
    reject(core, { type: 'hire-dispatcher', planeId: target });
  });
  it('assigns ground candidates in airport order and only permits one employee per airport', () => {
    const core = rich(), before = core.snapshot();
    execute(core, candidateCommand(before, 'ground'));
    execute(core, { type: 'recruit-employee', department: 'ground', role: 'specialist' });
    expect(core.snapshot().career.employees.map(employee => employee.airportId)).toEqual(['PEK', 'PVG']);
    reject(core, candidateCommand(core.snapshot(), 'ground'), /没有空缺地勤岗位/);
    reject(core, { type: 'recruit-employee', department: 'ground', role: 'specialist' }, /没有空缺地勤岗位/);
  });
  it('makes specialists report to their own existing manager, while managers occupy their unique slots', () => {
    const core = rich();
    for (const department of ['company', 'flight', 'ground'] as const) execute(core, { type: 'recruit-employee', department, role: 'manager' });
    const managers = core.snapshot().career.employees;
    execute(core, candidateCommand(core.snapshot())); execute(core, candidateCommand(core.snapshot(), 'ground'));
    const after = core.snapshot(), pilot = after.career.employees[3]!, ground = after.career.employees[4]!;
    expect(pilot).toMatchObject({ managerId: managers[1]!.id, planeId: 'AC0001' });
    expect(ground).toMatchObject({ managerId: managers[2]!.id, airportId: 'PEK' });
    expect(pilot.history[0]!.kind).toBe('reporting'); expect(ground.history[0]!.kind).toBe('reporting');
    expect(after.career.employees.slice(1, 3).map(manager => manager.managerId)).toEqual([managers[0]!.id, managers[0]!.id]);
    for (const department of ['company', 'flight', 'ground'] as const) reject(core, { type: 'recruit-employee', department, role: 'manager' }, /岗位已满/);
  });
  it('does not silently migrate existing unassigned employees during loading or new recruitment', () => {
    const core = rich(); execute(core, candidateCommand(core.snapshot())); execute(core, candidateCommand(core.snapshot(), 'ground'));
    const [pilot, ground] = core.snapshot().career.employees;
    execute(core, { type: 'assign-pilot', pilotId: pilot!.id, planeId: null });
    execute(core, { type: 'assign-ground', employeeId: ground!.id, airportId: null });
    const before = core.snapshot(), reload = new GameCore(NOW, before); reload.tick(NOW); expect(reload.snapshot()).toEqual(before);
    execute(reload, candidateCommand(reload.snapshot())); execute(reload, candidateCommand(reload.snapshot(), 'ground'));
    const after = reload.snapshot(); expect(after.career.employees.slice(0, 2)).toEqual(before.career.employees);
    expect(after.career.employees[2]!.planeId).toBe('AC0001'); expect(after.career.employees[3]!.airportId).toBe('PEK');
  });
});

describe('unavailable recruitment is atomic', () => {
  it('rejects all pilot entry points without an aircraft but permits an empty manager slot', () => {
    const core = rich(0);
    for (const command of [candidateCommand(core.snapshot()), { type: 'recruit-pilot' }, { type: 'recruit-employee', department: 'flight', role: 'specialist' }] as Command[])
      reject(core, command, /没有可分配的空闲飞机/);
    reject(core, { type: 'hire-dispatcher', planeId: 'AC0001' });
    execute(core, { type: 'recruit-employee', department: 'flight', role: 'manager' });
    expect(core.snapshot().career.employees[0]).toMatchObject({ role: 'manager', planeId: null });
  });
  it.each(['flight', 'service', 'turnaround', 'plan'] as const)('rejects an unavailable %s aircraft, then skips it when another slot exists', mode => {
    let core = rich();
    if (mode === 'flight') execute(core, { type: 'dispatch', planeId: 'AC0001', to: 'PVG', auto: false });
    else if (mode === 'service') {
      const state = core.snapshot(); state.fleet[0]!.energy.availableSeconds -= 600; core = new GameCore(NOW, state);
      execute(core, { type: 'service-energy', planeId: 'AC0001' });
    } else {
      if (mode === 'plan') execute(core, { type: 'route', from: 'PEK', to: 'PVG' });
      const state = core.snapshot(); state.fleet[0]!.readyAt = 8;
      if (mode === 'plan') { state.fleet[0]!.itinerary = ['PVG']; state.fleet[0]!.planContract = { origin: 'PEK', stops: ['PVG'], index: 0 }; }
      core = new GameCore(NOW, state);
    }
    reject(core, candidateCommand(core.snapshot()), /没有可分配的空闲飞机/);
    reject(core, { type: 'recruit-pilot' }, /没有可分配的空闲飞机/);
    reject(core, { type: 'hire-dispatcher', planeId: 'AC0001' });
    execute(core, { type: 'buy', modelId: 'diamond-da40', airportId: 'PEK', passengers: 1, cargo: 0 });
    const before = core.snapshot(), available = before.fleet[1]!.id;
    execute(core, candidateCommand(before));
    expect(core.snapshot().career.employees[0]!.planeId).toBe(available);
    expect(core.snapshot().fleet[0]).toEqual(before.fleet[0]);
  });
  it('keeps expired employees in their positions and never replaces them as vacancies', () => {
    const core = rich(); execute(core, candidateCommand(core.snapshot()));
    for (let i = 0; i < 2; i++) execute(core, candidateCommand(core.snapshot(), 'ground'));
    const state = core.snapshot(); for (const employee of state.career.employees) employee.paidUntil = 0;
    const expired = new GameCore(NOW, state);
    reject(expired, candidateCommand(state), /没有可分配的空闲飞机/);
    reject(expired, candidateCommand(state, 'ground'), /没有空缺地勤岗位/);
    reject(expired, { type: 'hire-dispatcher', planeId: 'AC0001' });
  });
  it('leaves a waiting automatic route intact when recruiting for the next aircraft', () => {
    const core = rich(2); execute(core, { type: 'recruit-pilot' });
    const state = core.snapshot(); state.orders = state.orders.filter(order => order.location !== 'PEK');
    const waiting = new GameCore(NOW, state); execute(waiting, { type: 'start-duty', planeId: 'AC0001', to: 'PVG' });
    const before = waiting.snapshot(); expect(before.fleet[0]).toMatchObject({ flight: null, autoRouteId: 'PEK-PVG' });
    execute(waiting, candidateCommand(before)); const after = waiting.snapshot();
    expect(after.career.employees[1]!.planeId).toBe(before.fleet[1]!.id); expect(after.fleet[0]).toEqual(before.fleet[0]);
    expect(after.career.employees[0]).toEqual(before.career.employees[0]);
  });
  it('retains an expired department manager as the superior without granting active benefits', () => {
    const core = rich(); execute(core, { type: 'recruit-employee', department: 'flight', role: 'manager' });
    const state = core.snapshot(); state.career.employees[0]!.paidUntil = 0; const expired = new GameCore(NOW, state);
    execute(expired, candidateCommand(state)); const after = expired.snapshot(), pilot = after.career.employees[1]!;
    expect(pilot.managerId).toBe(state.career.employees[0]!.id); expect(effectiveManager(after, pilot)).toBeUndefined();
  });
  it('does not reserve an aircraft or advance employee and candidate randomness on failed payment', () => {
    for (const resource of ['credits', 'tickets'] as const) {
      const state = rich().snapshot(); if (resource === 'credits') state.credits = 1799; else state.career.tickets = 2;
      const core = new GameCore(NOW, state); reject(core, candidateCommand(state));
      reject(core, { type: 'recruit-pilot' }); reject(core, { type: 'hire-dispatcher', planeId: 'AC0001' });
    }
  });
});
