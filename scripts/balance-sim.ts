import { AIRPORTS, MODELS, aircraftSpecs, airport, distance, hangarPrice, model } from '../src/core/catalog.js';
import { GameCore, fits, manifest, quote, validateSave, waiting, type Command } from '../src/core/game.js';
import { careerLevel } from '../src/core/career.js';
import { businessIncomeQuote, businessOpeningReason, businessTeamQuote } from '../src/core/company-business.js';
import { aircraftProjectQuote } from '../src/core/investment.js';
import { taskItems } from '../src/ui/task-presentation.js';
import { resaleValue } from '../src/core/management.js';
import { STARTING_CREDITS } from '../src/core/balance-policy.js';

export type BalanceStrategy = 'conservative' | 'balanced' | 'efficient' | 'transport' | 'company' | 'idle' | 'small-aircraft' | 'large-aircraft' | 'retrofit';
const NOW = Date.parse('2026-09-30T00:00:00Z');
const MILESTONES = [3600, 10800, 28800, 72000];

/** Developer-only deterministic replay. All money/orders/assets use real core commands. */
export function simulateBalance(strategy: BalanceStrategy, hours = 20) {
  const core = new GameCore(NOW);
  let capitalSpent = 0, taskRewards = 0, paidFlightRewards = 0;
  let firstFlight: number | null = null, secondAircraft: number | null = null, firstTeam: number | null = null;
  let waitingPoolSamples = 0, compatible = 0, inRange = 0, carried = 0, departedCapacity = 0, attemptedCapacity = 0;
  const delays = new Map<string, number>(), fractions = new Map<string, number>();
  const samples: { at: number; income: number; business: number }[] = [];
  const results: object[] = [];
  const step = strategy === 'conservative' ? 60 : strategy === 'efficient' ? 15 : 30;
  const utilization = strategy === 'conservative' ? .6 : strategy === 'efficient' ? 1 : .8;
  const send = (action: Command) => {
    const before = core.snapshot(); core.execute(action, before.lastWallTime);
    const after = core.snapshot(), delta = after.credits - before.credits;
    if (action.type === 'claim' || action.type === 'career-claim') taskRewards += delta;
    else if (action.type !== 'dispatch') capitalSpent -= delta;
  };
  send({ type: 'found-company', company: { name: `测算-${strategy}`, logo: { kind: 'preset', id: 'wing' } } });
  send({ type: 'tutorial', action: 'skip' }); send({ type: 'unlock', airportId: 'PVG' });
  send({ type: 'buy', modelId: 'diamond-da40', airportId: 'PEK', passengers: 1, cargo: 0 });
  // Two minutes of real setup, with no operational progress before takeoff.
  core.tick(NOW + 120000); send({ type: 'load-destination', planeId: 'AC0001', to: 'PVG' });
  send({ type: 'dispatch', planeId: 'AC0001', to: 'PVG', auto: false });
  carried++; departedCapacity++;

  function invest() {
    let s = core.snapshot();
    const reserve = Math.max(500, s.fleet.reduce((sum, p) => sum + (p.flight?.cost ?? 100), 0) * 2);
    const spendable = () => core.snapshot().credits - reserve;
    const companyFirst = strategy === 'company' || strategy === 'idle';
    const businessTarget = strategy === 'transport' || strategy === 'small-aircraft' ? 0 : companyFirst ? s.airports.length : Math.min(16, 1 + Math.floor(s.simTime / 5400));
    const openTeam = () => {
      for (const a of core.snapshot().airports) {
        const current = core.snapshot();
        if (current.business.teams.length >= businessTarget) break;
        if (!businessOpeningReason(current, a.id, 'ticketing') && spendable() >= 1200) send({ type: 'open-business-team', airportId: a.id, kind: 'ticketing' });
      }
      for (const team of core.snapshot().business.teams) {
        const q = businessTeamQuote(core.snapshot(), team);
        if (q.workers.length < q.capacity && spendable() >= q.hiringCost) send({ type: 'hire-business-worker', teamId: team.id });
      }
    };
    if (companyFirst) openTeam();
    if (strategy === 'idle') return;
    s = core.snapshot();
    const fleetTarget = Math.min(16, (companyFirst ? 1 : 2) + Math.floor(s.simTime / (companyFirst ? 10800 : 3600)));
    if (s.fleet.length < fleetTarget) {
      const candidates = MODELS.filter(m => careerLevel(s) >= m.rank && (strategy !== 'small-aircraft' || m.capacity <= 2));
      candidates.sort((a, b) => b.capacity - a.capacity);
      for (const m of candidates) {
        const project = aircraftProjectQuote(s, m.id, 'PEK', 'PVG');
        if (!project.compatibleAirports || spendable() < project.total) continue;
        if (s.fleet.length >= s.hangarSlots && s.hangarSlots < 16 && spendable() >= hangarPrice(s.hangarSlots)) send({ type: 'expand-hangar' });
        const passengers = strategy === 'company' ? Math.ceil(m.capacity / 2) : Math.ceil(m.capacity * 2 / 3);
        send({ type: 'buy', modelId: m.id, airportId: s.fleet.length % 2 ? 'PVG' : 'PEK', passengers, cargo: m.capacity - passengers });
        break;
      }
    }
    // Compare upgrading scarce slots with keeping the small starter fleet.
    if (strategy === 'large-aircraft') {
      s = core.snapshot();
      const large = [...MODELS].reverse().find(m => careerLevel(s) >= m.rank && aircraftProjectQuote(s, m.id, 'PEK', 'PVG').total <= spendable());
      const smallest = [...s.fleet].sort((a, b) => model(a.modelId).capacity - model(b.modelId).capacity).find(p => !p.flight && p.readyAt <= s.simTime && !manifest(s, p.id).length);
      if (large && smallest && s.fleet.length > 1 && large.capacity > model(smallest.modelId).capacity) {
        const before = core.snapshot().credits; send({ type: 'sell-plane', planeId: smallest.id });
        if (core.snapshot().credits - before !== resaleValue(smallest)) throw new Error('Resale mismatch');
      }
    }
    s = core.snapshot();
    const airportTarget = Math.min(20, 2 + Math.floor(s.simTime / (companyFirst ? 3600 : 5400)));
    if (s.airports.length < airportTarget) {
      const next = AIRPORTS.filter(a => !s.airports.some(o => o.id === a.id)).sort((a, b) => a.price - b.price || a.id.localeCompare(b.id))[0];
      if (next && spendable() >= next.price) send({ type: 'unlock', airportId: next.id });
    }
    if (!companyFirst) openTeam();
    if (strategy === 'retrofit') {
      for (const p of core.snapshot().fleet) {
        if (!p.flight && p.readyAt <= core.snapshot().simTime && !manifest(core.snapshot(), p.id).length && p.upgrades.engine === 0 && spendable() > model(p.modelId).price * .025 + 500) send({ type: 'retrofit', planeId: p.id, upgrade: 'engine' });
      }
    }
  }
  for (let seconds = 120 + step; seconds <= hours * 3600; seconds += step) {
    const before = core.snapshot(); core.tick(NOW + seconds * 1000); let s = core.snapshot();
    paidFlightRewards += s.credits - before.credits - (s.stats.revenue - before.stats.revenue) - (s.business.earned - before.business.earned);
    if (s.stats.flights && firstFlight === null) firstFlight = s.simTime;
    for (const task of taskItems(s).filter(t => t.state === 'claimable')) send(task.command);
    if (s.stats.flights && (strategy !== 'idle' || !s.business.teams.length)) invest();
    s = core.snapshot();
    if (s.fleet.length >= 2 && secondAircraft === null) secondAircraft = s.simTime;
    if (s.business.teams.length && firstTeam === null) firstTeam = s.simTime;
    if (strategy !== 'idle' || !s.stats.flights) {
      for (const initial of s.fleet) {
        const state = core.snapshot(), p = state.fleet.find(p => p.id === initial.id);
        if (!p || p.flight || p.energy.serviceUntil !== null || p.readyAt > state.simTime) { if (p?.flight) delays.set(p.id, p.flight.arriveAt + step); continue; }
        if (state.simTime < (delays.get(p.id) ?? 0)) continue;
        const specs = aircraftSpecs(p);
        const raw = specs.capacity * utilization + (fractions.get(p.id) ?? 0), limit = Math.floor(raw);
        fractions.set(p.id, raw - limit); attemptedCapacity += specs.capacity;
        waitingPoolSamples += waiting(state, p.airportId).length;
        compatible += waiting(state, p.airportId).filter(o => fits(state, p, o)).length;
        const destinations = state.airports.filter(a => a.id !== p.airportId && airport(a.id).stars >= specs.level && distance(p.airportId, a.id) <= specs.range);
        inRange += waiting(state, p.airportId).filter(o => fits(state, p, o) && destinations.some(a => a.id === o.to)).length;
        if (!limit) { delays.set(p.id, state.simTime + step); continue; }
        const options = destinations.map(a => {
          const orders = waiting(state, p.airportId).filter(o => o.to === a.id && fits(state, p, o));
          const selected: typeof orders = []; let passengers = 0, cargo = 0;
          for (const o of orders) {
            if (selected.length >= limit) break;
            if (o.kind === 'passengers' ? passengers < specs.seats : cargo < specs.cargo) { selected.push(o); if (o.kind === 'passengers') passengers++; else cargo++; }
          }
          const preview = structuredClone(state);
          for (const o of selected) preview.orders.find(item => item.id === o.id)!.location = p.id;
          const q = quote(preview, p, a.id);
          return { to: a.id, orders: selected, ...q };
        }).filter(q => q.orders.length && q.profit >= 0).sort((a, b) => b.profit / b.duration - a.profit / a.duration || a.to.localeCompare(b.to));
        const option = options[0];
        if (!option) { delays.set(p.id, state.simTime + step); continue; }
        if (p.energy.availableSeconds < Math.max(1, Math.floor(option.duration / 60)) * 60) { send({ type: 'service-energy', planeId: p.id }); continue; }
        if (state.credits < option.cost) continue;
        for (const o of option.orders) send({ type: 'load', planeId: p.id, orderId: o.id });
        send({ type: 'dispatch', planeId: p.id, to: option.to, auto: false });
        carried += option.orders.length; departedCapacity += specs.capacity;
      }
    }
    s = core.snapshot();
    const income = s.stats.revenue - s.stats.costs + paidFlightRewards + s.business.earned;
    samples.push({ at: s.simTime, income, business: s.business.earned });
    while (samples.length > 1 && samples[1]!.at <= s.simTime - 300) samples.shift();
    if (MILESTONES.includes(seconds) || seconds === hours * 3600) {
      validateSave(s);
      const first = samples[0]!, netPerMinute = (income - first.income) * 60 / Math.max(1, s.simTime - first.at);
      const businessPerMinute = businessIncomeQuote(s).net * 60 / 1000;
      const nextCost = MODELS.find(m => m.price > s.credits && careerLevel(s) >= m.rank)?.price ?? null;
      results.push({ hours: seconds / 3600, cash: s.credits, fleet: s.fleet.map(p => p.modelId), airports: s.airports.length, teams: s.business.teams.length,
        ticketsField: Object.hasOwn(s.career, 'tickets'), flights: s.stats.flights, transportRevenue: s.stats.revenue, operatingCosts: s.stats.costs,
        paidFlightRewards, businessEarned: s.business.earned, taskRewards, capitalSpent, netPerMinute, businessPerMinute,
        businessShare: netPerMinute > 0 ? businessPerMinute / netPerMinute : null,
        nextAircraftWaitingMinutes: nextCost && netPerMinute > 0 ? Math.max(0, nextCost + 500 - s.credits) / netPerMinute : null,
        rewardShare: income + taskRewards > 0 ? (paidFlightRewards + taskRewards) / (income + taskRewards) : null,
        moneyConserved: s.credits === STARTING_CREDITS + income + taskRewards - capitalSpent,
        actualLoadFactor: carried / departedCapacity, demandObservations: { waitingPoolSamples, compatible, inRange }, businessRemainder: s.business.remainder });
    }
  }
  return { strategy, assumptions: { hours, stepSeconds: step, targetLoad: utilization, wholeOrdersOnly: true, realSupply: true, importedFunding: false, auxiliaryTradeAndProduction: 'Not exercised by these strategies' },
    milestones: { firstFlightMinutes: firstFlight && firstFlight / 60, secondAircraftMinutes: secondAircraft && secondAircraft / 60, firstTeamMinutes: firstTeam && firstTeam / 60 }, results, attemptedCapacity };
}
