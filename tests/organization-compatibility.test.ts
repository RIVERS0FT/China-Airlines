import { expect, it } from 'vitest';
import { GameCore, validateSave } from '../src/core/game.js';
import { validateSave as validateV7 } from '../src/core/save-v7.js';
import old from './fixtures/v7-pilot-flying.json';
const NOW = Date.parse('2026-09-14T02:00:00Z');

it('preserves every legacy-valid pilot name without tightening frozen name rules', () => {
  const oldName = structuredClone(old);
  oldName.career.pilots[0]!.name = ' ';
  expect(validateV7(oldName).career.pilots[0]!.name).toBe(' ');
  expect(validateSave(oldName).career.employees[0]!.name).toBe(' ');
  const core = new GameCore(NOW);
  core.execute({ type: 'recruit-pilot' }, NOW);
  const invalid = core.snapshot();
  invalid.career.employees[0]!.name = ' ';
  expect(() => validateSave(invalid)).toThrow();
});

it('rejects a manager bonus when the pilot contract was already expired at departure', () => {
  const state = new GameCore(NOW).snapshot();
  state.credits = 100000;
  state.career.tickets = 1000;
  state.career.xp = 300;
  const core = new GameCore(NOW, state);
  core.execute({ type: 'recruit-pilot' }, NOW);
  core.execute({ type: 'train-pilot', pilotId: 1 }, NOW);
  core.execute({ type: 'train-pilot', pilotId: 1 }, NOW);
  core.execute({ type: 'org-appoint', employeeId: 1 }, NOW);
  core.execute({ type: 'recruit-pilot' }, NOW);
  core.execute({ type: 'assign-pilot', pilotId: 2, planeId: 'AC0001' }, NOW);
  core.execute({ type: 'load-destination', planeId: 'AC0001', to: 'PVG' }, NOW);
  core.execute({ type: 'dispatch', planeId: 'AC0001', to: 'PVG', auto: false }, NOW);
  const invalid = core.snapshot();
  invalid.career.employees[1]!.paidUntil = invalid.fleet[0]!.flight!.departAt;
  expect(() => validateSave(invalid)).toThrow();
});
