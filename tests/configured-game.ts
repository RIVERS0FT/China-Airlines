/** Existing flight scenarios use the old starter loadout. Keep that explicit
 * while the production new game delivers an empty airframe. */
export * from '../src/core/game.js';
import { GameCore as BaseGameCore } from '../src/core/game.js';

export class GameCore extends BaseGameCore {
  constructor(now: number, saved?: unknown) {
    if (saved === undefined) {
      const state = new BaseGameCore(now).snapshot();
      state.fleet[0]!.allocation = { passengers: 3, cargo: 2 };
      super(now, state);
    } else super(now, saved);
  }
}
