import { expect, it } from 'vitest';
import { simulateBalance } from '../../scripts/balance-sim.js';

it('replays actual one-hour supply and whole orders deterministically with an exact single-currency ledger', () => {
  const run = simulateBalance('balanced', 1);
  expect(simulateBalance('balanced', 1)).toEqual(run);
  const result = run.results[0] as { moneyConserved: boolean; ticketsField: boolean; paidFlightRewards: number; actualLoadFactor: number; transportRevenue: number; businessEarned: number };
  expect(result.moneyConserved).toBe(true); expect(result.ticketsField).toBe(false);
  expect(result.paidFlightRewards).toBe(0);
  expect(result.actualLoadFactor).toBeGreaterThan(0); expect(result.actualLoadFactor).toBeLessThanOrEqual(1);
  expect(result.transportRevenue).toBeGreaterThan(0); expect(result.businessEarned).toBeGreaterThan(0);
});
