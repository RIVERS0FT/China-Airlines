import { describe, expect, it } from 'vitest';
import { GameCore, parseSave, validateSave, type GameState } from '../src/core/game.js';
import { GameCore as V7Core, validateSave as validateV7 } from '../src/core/v7/game.js';
import { employeeDisplayName } from '../src/ui/organization-presentation.js';

const NOW = Date.parse('2026-09-14T02:00:00Z');
const historicalNames = [' ', '\t', '\n\t ', '\u3000', ' '.repeat(12), '  林航  ', '飞'.repeat(12)];
function legacyPilot(name: string, flying = false) {
  const old = new V7Core(NOW);
  old.execute({ type: 'recruit-pilot' }, NOW);
  old.execute({ type: 'assign-pilot', pilotId: 1, planeId: 'AC0001' }, NOW);
  if (flying) old.execute({ type: 'start-duty', planeId: 'AC0001', to: 'PVG' }, NOW);
  const saved = old.snapshot();
  saved.career.pilots[0]!.name = name;
  return saved;
}

describe('historical employee names', () => {
  it.each(historicalNames)('preserves the v7-accepted name %j without changing locked business data', name => {
    const old = legacyPilot(name, true), before = structuredClone(old);
    expect(validateV7(old)).toEqual(old);
    const current = parseSave(JSON.stringify(old));
    expect(old).toEqual(before);
    expect(current.career.employees[0]).toMatchObject(old.career.pilots[0]!);
    const { version: oldVersion, career: oldCareer, ...oldBusiness } = old;
    const { version: currentVersion, career: currentCareer, ...currentBusiness } = current;
    expect(oldVersion).toBe(7); expect(currentVersion).toBe(8);
    expect(currentBusiness).toEqual(oldBusiness);
    const { pilots, ...oldCareerFields } = oldCareer;
    const { employees, ...currentCareerFields } = currentCareer;
    expect(employees).toHaveLength(pilots.length);
    expect(currentCareerFields).toEqual(oldCareerFields);
    expect(validateSave(current)).toEqual(current);
    expect(parseSave(JSON.stringify(current))).toEqual(current);
    expect(new GameCore(NOW, current).snapshot()).toEqual(current);
  });

  it('retains blank identity through training, promotion, reporting, renewal and reload', () => {
    const original = '\u3000\t', c = new GameCore(NOW, legacyPilot(original));
    const execute = (command: Parameters<GameCore['execute']>[0]) => {
      c.execute(command, NOW);
      expect(validateSave(c.snapshot())).toEqual(c.snapshot());
      expect(c.snapshot().career.employees[0]!.name).toBe(original);
    };
    for (const training of ['skill', 'skill', 'management'] as const)
      execute({ type: 'train-employee', employeeId: 1, training });
    execute({ type: 'employee-role', employeeId: 1, role: 'manager' });
    execute({ type: 'recruit-pilot' });
    execute({ type: 'report-to', employeeId: 2, managerId: 1 });
    execute({ type: 'renew-employee', employeeId: 1 });
    const saved = c.snapshot();
    expect(saved.career.employees[0]!.role).toBe('manager');
    expect(saved.career.employees[1]!.managerId).toBe(1);
    expect(new GameCore(NOW, JSON.parse(JSON.stringify(saved))).snapshot()).toEqual(saved);
  });

  it.each(['', '飞'.repeat(13), 7, null, {}, []])('continues rejecting malformed names %j', name => {
    const old = legacyPilot('林航'), current = validateSave(old);
    Object.assign(old.career.pilots[0]!, { name });
    Object.assign(current.career.employees[0]!, { name });
    for (const input of [old, current]) {
      const before = structuredClone(input);
      expect(() => validateSave(input)).toThrow();
      expect(input).toEqual(before);
    }
    expect(() => validateV7(old)).toThrow();
  });

  it('does not relax the nonblank history requirement', () => {
    const saved: GameState = validateSave(legacyPilot(' '));
    saved.career.employees[0]!.history[0]!.text = ' \t ';
    expect(() => validateSave(saved)).toThrow();
  });
});

describe('read-only employee display names', () => {
  it.each(historicalNames)('renders a useful label for %j without modifying identity', name => {
    const employee = { id: 17, name }, before = { ...employee };
    expect(employeeDisplayName(employee)).toBe(name.trim() ? name : '员工 #17');
    expect(employee).toEqual(before);
  });
  it('distinguishes two blank-name employees by stable id', () => {
    expect(employeeDisplayName({ id: 1, name: ' ' })).toBe('员工 #1');
    expect(employeeDisplayName({ id: 2, name: '\u3000' })).toBe('员工 #2');
  });
});
