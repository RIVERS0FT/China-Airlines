import { GameCore as LiveCore, type GameState } from '../src/core/game.js';
import { GameCore as FrozenCore } from '../src/core/save-v6.js';
/** Explicit old-aircraft fixture: exercises the live core's grandfathered energy contract. */
export class HistoricalSession extends LiveCore { constructor(now:number,saved?:unknown){super(now,saved??new FrozenCore(now).snapshot());} }
export function historicalFields(s:GameState){const {career:_career,talent:_talent,...old}=s;return {...old,version:6,fleet:s.fleet.map(({tuning:_t,...p})=>p),orders:s.orders.map(({service:_s,product:_p,...o})=>o)};}
