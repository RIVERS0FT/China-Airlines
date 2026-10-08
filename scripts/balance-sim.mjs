import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({ absWorkingDir: root, entryPoints: ['scripts/balance-sim.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { simulateBalance } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const available = ['conservative', 'balanced', 'efficient', 'transport', 'company', 'idle', 'small-aircraft', 'large-aircraft', 'retrofit'];
const strategies = process.argv.length > 2 ? [...new Set(process.argv.slice(2))] : available;
if (strategies.some(strategy => !available.includes(strategy))) throw new Error('Unknown balance strategy');
const report = { scope: 'Deterministic real GameCore replays; developer strategies, not measured player distributions.', arrivalBonus: 0, runs: [] };
for (const strategy of strategies) {
  const result = simulateBalance(strategy);
  if (result.results.some(row => !row.moneyConserved || row.ticketsField || row.paidFlightRewards !== 0)) throw new Error(`Invalid ledger: ${strategy}`);
  report.runs.push(result);
  const last = result.results.at(-1);
  console.log(`${strategy}: ${last.fleet.length} aircraft, ${last.airports} airports, ${last.teams} teams; ${last.cash} coins; ${last.netPerMinute.toFixed(1)} net/min`);
}
await mkdir(resolve(root, 'artifacts'), { recursive: true });
const name = process.argv.length > 2 ? `balance-gamecore-${strategies.join('-')}-20h.json` : 'balance-gamecore-20h.json';
await writeFile(resolve(root, 'artifacts', name), JSON.stringify(report, null, 2) + '\n');
