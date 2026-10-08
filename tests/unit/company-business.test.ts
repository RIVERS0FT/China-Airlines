import { describe, expect, it } from 'vitest';
import { GameCore, SAVE_VERSION, validateSave, type Command, type GameState } from '../../src/core/game.js';
import { accrueBusiness, businessCapacity, businessIncomeQuote, businessTeamQuote, businessWorkers, employeeCapacity } from '../../src/core/company-business.js';
import { organizationLayout } from '../../src/ui/organization-layout.js';

const NOW = Date.parse('2026-09-28T00:00:00Z');
const command = (c: GameCore, value: Command) => { c.execute(value, c.snapshot().lastWallTime); expect(validateSave(c.snapshot())).toEqual(c.snapshot()); };
function flown() {
  const c = new GameCore(NOW);
  command(c, { type: 'tutorial', action: 'skip' });
  command(c, { type: 'unlock', airportId: 'PVG' });
  command(c, { type: 'buy', modelId: 'diamond-da40', airportId: 'PEK', passengers: 1, cargo: 0 });
  const id = c.snapshot().fleet[0]!.id;
  command(c, { type: 'load-destination', planeId: id, to: 'PVG' });
  command(c, { type: 'dispatch', planeId: id, to: 'PVG', auto: false });
  c.tick(NOW + c.snapshot().fleet[0]!.flight!.arriveAt * 1000);
  return c;
}
function established() {
  const c = flown();
  command(c, { type: 'open-business-team', airportId: 'PEK', kind: 'ticketing' });
  return c;
}
function rejects(c: GameCore, value: Command) {
  const before = c.snapshot();
  expect(() => c.execute(value, before.lastWallTime)).toThrow();
  expect(c.snapshot()).toEqual(before);
}
describe('company incremental economy', () => {
  it('requires actual transport, then hires an atomic team into the shared roster', () => {
    rejects(new GameCore(NOW), { type: 'open-business-team', airportId: 'PEK', kind: 'ticketing' });
    const c = established(), s = c.snapshot();
    expect(s.business.teams).toHaveLength(1); expect(s.career.employees).toHaveLength(2);
    expect(s.business.teams[0]!.managerId).toBe(s.career.employees[0]!.id);
    expect(s.career.employees[1]!.managerId).toBe(s.career.employees[0]!.id);
    expect(employeeCapacity(s)).toBe(39);
    expect(businessIncomeQuote(s)).toEqual({ gross: 244, costs: 120, net: 124 });
    const originalStats = s.stats;
    c.tick(s.lastWallTime + 10000);
    expect(c.snapshot().credits).toBe(s.credits + 1);
    expect(c.snapshot().business.remainder).toBe(240000);
    expect(c.snapshot().stats).toEqual(originalStats);
  });
  it('keeps fractional income invariant across frame sizes, snapshots and reloads', () => {
    const s = established().snapshot(), once = new GameCore(s.lastWallTime, s);
    let pieces = new GameCore(s.lastWallTime, s);
    once.tick(s.lastWallTime + 60000);
    for (let i = 1; i <= 240; i++) {
      pieces.tick(s.lastWallTime + i * 250);
      if (i % 37 === 0) pieces = new GameCore(pieces.snapshot().lastWallTime, pieces.snapshot());
    }
    expect(pieces.snapshot()).toEqual(once.snapshot());
    const before = pieces.snapshot(); pieces.tick(before.lastWallTime); expect(pieces.snapshot()).toEqual(before);
  });
  it('does not create company earnings during explicit background advancement or import', () => {
    const s = established().snapshot(), c = new GameCore(s.lastWallTime, s);
    c.tick(s.lastWallTime + 3600000, { active: false });
    expect(c.snapshot().credits).toBe(s.credits);
    expect(c.snapshot().business).toEqual({ ...s.business, wallPeak: s.lastWallTime + 3600000 });
    const imported = GameCore.imported(c.snapshot(), s.lastWallTime + 7200000);
    expect(imported.snapshot().business).toEqual({ ...s.business, wallPeak: s.lastWallTime + 7200000 });
  });
  it('settles chief expiry at the exact boundary without double charging prepaid salary', () => {
    const baseline = established().snapshot(); baseline.credits = 10000; const c = new GameCore(baseline.lastWallTime, baseline); command(c, { type: 'recruit-employee', department: 'company', role: 'manager' });
    const s = c.snapshot(), chief = s.career.employees.find(e => e.department === 'company')!;
    chief.paidUntil = s.simTime + 2.5;
    const once = structuredClone(s), parts = structuredClone(s);
    accrueBusiness(once, s.simTime, s.simTime + 10);
    for (let i = 0; i < 40; i++) accrueBusiness(parts, s.simTime + i / 4, s.simTime + (i + 1) / 4);
    expect(parts.business).toEqual(once.business); expect(parts.credits).toBe(once.credits);
    expect(businessIncomeQuote(s, chief.paidUntil - .1).net).toBeGreaterThan(businessIncomeQuote(s, chief.paidUntil).net);
  });
  it('grows capacity instead of silently exceeding a team or duplicating cities', () => {
    const baseline = established().snapshot(); baseline.credits = 10000; const c = new GameCore(baseline.lastWallTime, baseline), team = c.snapshot().business.teams[0]!;
    command(c, { type: 'hire-business-worker', teamId: team.id });
    rejects(c, { type: 'hire-business-worker', teamId: team.id });
    command(c, { type: 'expand-business-team', teamId: team.id });
    command(c, { type: 'hire-business-worker', teamId: team.id });
    const s = c.snapshot(); expect(businessCapacity(s.business.teams[0]!)).toBe(4);
    expect(businessWorkers(s, team)).toHaveLength(3);
    rejects(c, { type: 'open-business-team', airportId: 'PEK', kind: 'ticketing' });
    rejects(c, { type: 'open-business-team', airportId: 'PEK', kind: 'forwarding' });
    rejects(c, { type: 'open-business-team', airportId: 'CAN', kind: 'ticketing' });
  });
  it('quotes only future gains and blocks bypasses of team staffing and recurring payroll', () => {
    const c = established(), s = c.snapshot(), e = s.career.employees[1]!;
    const before = businessTeamQuote(s, s.business.teams[0]!).net;
    command(c, { type: 'train-business-employee', employeeId: e.id });
    expect(businessIncomeQuote(c.snapshot()).net).toBeGreaterThan(before);
    expect(c.snapshot().business.earned).toBe(0);
    rejects(c, { type: 'renew-employee', employeeId: e.id });
    rejects(c, { type: 'employee-role', employeeId: e.id, role: 'manager' });
    rejects(c, { type: 'report-to', employeeId: e.id, managerId: null });
    rejects(c, { type: 'train-employee', employeeId: e.id, training: 'skill' });
    rejects(c, { type: 'recruit-employee', department: 'business', role: 'specialist' });
    const poor = c.snapshot(); poor.credits = 0;
    rejects(new GameCore(poor.lastWallTime, poor), { type: 'hire-business-worker', teamId: s.business.teams[0]!.id });
  });
  it('will not mint money by rewinding and replaying wall clock time', () => {
    const c = established(), s = c.snapshot(); c.tick(s.lastWallTime + 10000);
    const settled = c.snapshot(); c.tick(s.lastWallTime + 5000); c.tick(s.lastWallTime + 10000);
    expect(c.snapshot().credits).toBe(settled.credits); expect(c.snapshot().business).toEqual(settled.business);
  });
  it('uses the same read-only tree for new branches, and collapses workers without deleting them', () => {
    const s = established().snapshot(), before = structuredClone(s), team = s.business.teams[0]!;
    expect(organizationLayout(s).nodes.filter(n => n.employee.department === 'business')).toHaveLength(2);
    expect(organizationLayout(s, new Set([team.id])).nodes.filter(n => n.employee.department === 'business')).toHaveLength(1);
    expect(s).toEqual(before);
  });
});
describe('strict business saves', () => {
  it('requires v18 and rejects missing or forged business state without repairing it', () => {
    expect(SAVE_VERSION).toBe(18);
    const s = established().snapshot();
    const mutations: ((x: GameState) => void)[] = [
      x => { (x as unknown as {version:number}).version = 14; },
      x => { delete (x as Partial<GameState>).business; },
      x => { x.business.remainder = 1000000; },
      x => { x.business.remainder = NaN; },
      x => { x.business.wallPeak = -1; },
      x => { x.business.wallPeak = Infinity; },
      x => { x.business.wallPeak = x.lastWallTime - 1; },
      x => { x.business.teams.push({...x.business.teams[0]!}); },
      x => { x.business.teams[0]!.managerId = x.career.employees[1]!.id; },
      x => { x.career.employees[1]!.managerId = null; },
      x => { x.business.teams[0]!.airportId = 'CAN'; },
      x => { x.business.teams[0]!.level = 5; },
      x => { x.career.employees[1]!.paidUntil = 10; },
      x => { x.career.employees[1]!.airportId = 'PEK'; },
    ];
    for (const mutate of mutations) { const bad = structuredClone(s); mutate(bad); expect(() => validateSave(bad)).toThrow(); }
    expect(validateSave(s)).toEqual(s);
  });
});
