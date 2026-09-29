/** Prepared two-airport, 3-passenger/2-cargo Heron fixture for isolated tests.
 * Company lifecycle acceptance imports production GameCore directly. */
export * from '../../src/core/game.js';
import { GameCore as BaseGameCore } from '../../src/core/game.js';

export class GameCore extends BaseGameCore {
  constructor(now: number, saved?: unknown) {
    if (saved === undefined) {
      const funding = new BaseGameCore(now).snapshot();
      funding.credits = 100000; funding.career.xp = 600;
      const prepared = new BaseGameCore(now, funding);
      prepared.execute({ type: 'found-company', company: { name: '中华航空', logo: { kind: 'preset', id: 'wing' } } }, now);
      prepared.execute({ type: 'unlock', airportId: 'PVG' }, now);
      prepared.execute({ type: 'buy', modelId: 'heron-p', airportId: 'PEK', passengers: 3, cargo: 2 }, now);
      const state = prepared.snapshot();
      state.credits = 18000; state.career.xp = 0; state.tutorial = 'available';
      super(now, state);
    } else super(now, saved);
  }
}
