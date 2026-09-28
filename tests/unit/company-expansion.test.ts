import { expect, it } from 'vitest';
import { GameCore, validateSave, type Command } from '../../src/core/game.js';
import { employeeCapacity } from '../../src/core/company-business.js';

it('expands beyond fifteen people through valid city teams, with unique staff and protected airports', () => {
  const now = Date.parse('2026-09-28T00:00:00Z'), first = new GameCore(now);
  const initial = (c: Command) => first.execute(c, first.snapshot().lastWallTime);
  initial({type:'tutorial',action:'skip'});
  initial({type:'unlock',airportId:'PVG'});
  initial({type:'buy',modelId:'diamond-da40',airportId:'PEK',passengers:1,cargo:0});
  const planeId = first.snapshot().fleet[0]!.id;
  initial({type:'load-destination',planeId,to:'PVG'});
  initial({type:'dispatch',planeId,to:'PVG',auto:false});
  first.tick(now + first.snapshot().fleet[0]!.flight!.arriveAt * 1000);
  const rich = first.snapshot(); rich.credits = 1000000;
  const core = new GameCore(rich.lastWallTime, rich);
  const send = (c: Command) => {
    core.execute(c, core.snapshot().lastWallTime);
    expect(validateSave(core.snapshot())).toEqual(core.snapshot());
  };
  send({type:'unlock',airportId:'CAN'});
  for (const airportId of ['PEK','PVG','CAN']) send({type:'open-business-team',airportId,kind:'ticketing'});
  for (const team of core.snapshot().business.teams) {
    send({type:'expand-business-team',teamId:team.id});
    send({type:'expand-business-team',teamId:team.id});
    for (let i=0;i<5;i++) send({type:'hire-business-worker',teamId:team.id});
  }
  const state = core.snapshot();
  expect(state.career.employees).toHaveLength(21);
  expect(new Set(state.career.employees.map(e=>e.id)).size).toBe(21);
  expect(employeeCapacity(state)).toBe(36);
  expect(() => core.execute({type:'close-airport',airportId:'CAN'},state.lastWallTime)).toThrow(/业务团队/);
  expect(core.snapshot()).toEqual(state);
});
