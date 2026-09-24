export * from '../src/core/game.js';
import { GameCore as BaseGameCore } from '../src/core/game.js';

/** Explicit loadout for pre-existing browser journeys. */
export class GameCore extends BaseGameCore {
  constructor(now: number, saved?: unknown) {
    if (saved === undefined) {
      const state = new BaseGameCore(now).snapshot();
      state.fleet[0]!.allocation = { passengers: 3, cargo: 2 };
      super(now, state);
    } else super(now, saved);
  }
}
