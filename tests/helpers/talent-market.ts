import type { GameState } from '../../src/core/game.js';
import { careerLevel } from '../../src/core/career.js';
import { talentBatchSize } from '../../src/core/talent.js';
import type { Department, EmployeeRole } from '../../src/core/organization.js';

type Position = readonly [Department, EmployeeRole];
/** Explicit imported offers for staffing UI tests; production refresh is tested separately. */
export function offerCandidates(state: GameState, positions: readonly Position[]) {
  if (positions.length > 12) throw new Error('Fixture exceeds the market limit');
  state.career.xp = Math.max(state.career.xp, 150 * Math.max(0, positions.length - 3) ** 2);
  const level = careerLevel(state), count = talentBatchSize(level), start = state.talent.nextId;
  const used = new Map<string, number>();
  state.talent.batchLevel = level; state.talent.nextId = start + count;
  state.talent.candidates = positions.map(([department, role], index) => {
    const key = `${department}-${role}`, number = used.get(key) ?? 0; used.set(key, number + 1);
    const names = department === 'company' ? ['沈远','程宁','顾承'] : department === 'flight'
      ? role === 'manager' ? ['苏晴','陈翼','陆星'] : ['林航','许岚','周远']
      : role === 'manager' ? ['乔安','柳泉','孟青'] : ['顾川','叶宁','孟青','乔安'];
    return { id:start+index, name:names[number%names.length]!, department, role, potential:8, trait:index%2?'mentor':'efficient' };
  });
  return state;
}
export const STAFFING_OFFERS = [
  ['flight','specialist'],['flight','specialist'],['flight','specialist'],
  ['ground','specialist'],['ground','specialist'],['ground','specialist'],
  ['flight','manager'],['flight','manager'],['ground','manager'],['ground','manager'],['company','manager'],['company','manager'],
] as const satisfies readonly Position[];
