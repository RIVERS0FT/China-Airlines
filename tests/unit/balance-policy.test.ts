import { describe, expect, it } from 'vitest';
import { AIRPORTS, distance } from '../../src/core/catalog.js';
import { GameCore, MAX_ORDERS, MAX_WAITING, manifest, parseSave, validateSave, waiting } from '../../src/core/game.js';
import { allocateDemand, demandCapacity, demandDestinations } from '../../src/core/demand.js';
import { BASE_DEMAND_DIRECTIONS } from '../../src/core/demand-directions.js';
import { BUSINESS_KINDS, businessIncomeQuote, businessOpeningQuote, businessTeamQuote, businessTrainingQuote } from '../../src/core/company-business.js';
import { aircraftProjectQuote } from '../../src/core/investment.js';
import { employmentPrice } from '../../src/core/organization.js';
import { CAREER_TASKS, TASKS } from '../../src/core/career-catalog.js';

const NOW = 1_800_000_000_000;
function funded() {
  const c = new GameCore(NOW); c.execute({ type: 'buy', modelId: 'diamond-da40', airportId: 'PEK', passengers: 1, cargo: 0 }, NOW);
  const state = c.snapshot(); state.credits = 1e7; state.stats.revenue = 326; state.stats.flights = 1;
  return new GameCore(NOW, state);
}
const send = (c: GameCore, value: Parameters<GameCore['execute']>[0]) => c.execute(value, c.snapshot().lastWallTime);

describe('single-coin balance and capital quotes', () => {
  it('converts the initial points and every staff quote without retaining a second wallet', () => {
    const state = new GameCore(NOW).snapshot();
    expect(state.credits).toBe(8400); expect(state.career).not.toHaveProperty('tickets');
    expect(employmentPrice({ department: 'flight', role: 'specialist' }, true)).toEqual({ gold: 2100 });
    expect(employmentPrice({ department: 'ground', role: 'specialist' }, true)).toEqual({ gold: 1400 });
    expect(employmentPrice({ department: 'company', role: 'manager' }, true)).toEqual({ gold: 2800 });
    expect(employmentPrice({ department: 'company', role: 'manager' })).toEqual({ gold: 1000 });
    expect(() => validateSave({ ...state, career: { ...state.career, tickets: 1 } })).toThrow();
    for (const version of [16, 17]) expect(() => validateSave({ ...state, version })).toThrow(/版本/);
  });
  it('rejects empty-flight milestones atomically and totals both reward entrances once', () => {
    const state = funded().snapshot(); state.stats.revenue = 0; state.stats.flights = 10;
    const c = new GameCore(NOW, state);
    for (const action of [{ type: 'claim', taskId: 'first-flight' }, { type: 'claim', taskId: 'ten-flights' }, { type: 'career-claim', id: 'flights-10' }] as const) {
      const before = c.snapshot(); expect(() => send(c, action)).toThrow(/业绩/); expect(c.snapshot()).toEqual(before);
    }
    expect(TASKS.find(t => t.id === 'ten-flights')!.reward + CAREER_TASKS.find(t => t.id === 'flights-10')!.gold).toBe(2800);
    expect(TASKS.find(t => t.id === 'three-airports')!.reward + CAREER_TASKS.find(t => t.id === 'network-3')!.gold).toBe(1800);
    const eligible = c.snapshot(); eligible.stats.revenue = 3000;
    const paid = new GameCore(NOW, eligible), before = paid.snapshot().credits;
    send(paid, { type: 'claim', taskId: 'ten-flights' }); send(paid, { type: 'career-claim', id: 'flights-10' });
    expect(paid.snapshot().credits - before).toBe(2800);
    expect(() => send(paid, { type: 'career-claim', id: 'flights-10' })).toThrow();
    expect(validateSave(paid.snapshot())).toEqual(paid.snapshot());
  });
  it('prices airport unlocks and reports fixed star compatibility without facility upgrade costs', () => {
    const state = new GameCore(NOW).snapshot(); state.airports.push({ id: 'PVG', level: 1 }); const before = structuredClone(state);
    expect(aircraftProjectQuote(state, 'albatross-p', 'PEK', 'PVG')).toMatchObject({ total:80000, upgrades:0, compatibleAirports:true });
    expect(aircraftProjectQuote(state, 'aurora-p', 'PEK', 'PVG').total).toBe(180000);
    expect(aircraftProjectQuote(state, 'aurora-p', 'PEK', 'LHR').total).toBe(325000);
    expect(aircraftProjectQuote(state, 'aurora-p', 'PEK', 'WUH').compatibleAirports).toBe(false);
    expect(state).toEqual(before);
  });
  it.each(BUSINESS_KINDS)('charges the actual %s rates and independent exponential training prices', kind => {
    const c = funded(); send(c, { type: 'upgrade', airportId: 'PEK' }); send(c, { type: 'upgrade', airportId: 'PEK' });
    const before = c.snapshot(), opening = businessOpeningQuote(before, kind);
    send(c, { type: 'open-business-team', airportId: 'PEK', kind });
    const state = c.snapshot(), team = state.business.teams[0]!, quote = businessTeamQuote(state, team);
    const expectations = { ticketing: [1200, 124, 288, 200, 250], services: [4000, 312, 744, 550, 700], forwarding: [12000, 916, 2132, 1500, 1900] }[kind]!;
    expect(before.credits - state.credits).toBe(expectations[0]); expect(quote.net).toBe(expectations[1]); expect(opening.net).toBe(quote.net);
    const manager = state.career.employees.find(e => e.id === team.managerId)!;
    const worker = quote.workers[0]!;
    expect(businessTrainingQuote(state, worker).cost).toBe(expectations[3]); expect(businessTrainingQuote(state, manager).cost).toBe(expectations[4]);
    send(c, { type: 'hire-business-worker', teamId: team.id });
    expect(businessIncomeQuote(c.snapshot()).net).toBe(expectations[2]);
    expect(businessTrainingQuote(c.snapshot(), manager).cost).toBe(expectations[4]);
    send(c, { type: 'train-business-employee', employeeId: worker.id });
    const next = businessTrainingQuote(c.snapshot(), c.snapshot().career.employees.find(e => e.id === worker.id)!);
    expect(next.cost).toBe(Math.ceil(expectations[3]! * 1.45 / 10) * 10);
    expect(c.snapshot().business.earned).toBe(0);
  });
  it('quotes expansion with both tiered hires and no income from empty slots', () => {
    const c = funded(); send(c, { type: 'open-business-team', airportId: 'PEK', kind: 'ticketing' });
    const team = c.snapshot().business.teams[0]!; send(c, { type: 'hire-business-worker', teamId: team.id });
    const quote = businessTeamQuote(c.snapshot(), team);
    expect(quote).toMatchObject({ expansionStaffedCost: 4300, expansionGain: 328, net: 288 });
    expect(quote.expansionPayback).toBeCloseTo(218.496, 2);
    const credits = c.snapshot().credits; send(c, { type: 'expand-business-team', teamId: team.id });
    expect(businessIncomeQuote(c.snapshot()).net).toBe(288);
    send(c, { type: 'hire-business-worker', teamId: team.id }); send(c, { type: 'hire-business-worker', teamId: team.id });
    expect(credits - c.snapshot().credits).toBe(4300); expect(businessIncomeQuote(c.snapshot()).net).toBe(616);
  });
});

describe('real bounded demand distribution', () => {
  it('has three valid static directions for every supported city and stable nearest fallback', () => {
    for (const city of AIRPORTS) {
      const directions = BASE_DEMAND_DIRECTIONS[city.id]!;
      expect(new Set(directions).size).toBe(3); expect(directions).not.toContain(city.id);
      expect(directions.every(id => AIRPORTS.some(a => a.id === id))).toBe(true);
      const open = AIRPORTS.filter(a => a.id !== city.id && !directions.includes(a.id)).map(a => a.id);
      const fallback = [...open].sort((a, b) => distance(city.id, a) - distance(city.id, b) || a.localeCompare(b)).slice(0, 3).sort();
      expect(demandDestinations(city.id, open.reverse()).filter(d => d.primary).map(d => d.id)).toEqual(fallback);
    }
  });
  it('allocates 70/30 with exact counts and stable remainder ties regardless of list order', () => {
    const directions = [{ id: 'A', primary: true }, { id: 'B', primary: true }, { id: 'C', primary: true }, { id: 'D', primary: false }, { id: 'E', primary: false }];
    expect(allocateDemand(30, directions)).toEqual([{ id: 'A', count: 7 }, { id: 'B', count: 7 }, { id: 'C', count: 7 }, { id: 'D', count: 5 }, { id: 'E', count: 4 }]);
    for (let count = 0; count <= 54; count++) {
      const result = allocateDemand(count, directions); expect(result.reduce((n, d) => n + d.count, 0)).toBe(count);
      expect(allocateDemand(count, [...directions].reverse())).toEqual(result);
    }
    expect(allocateDemand(2, [{ id: 'B', primary: false }, { id: 'A', primary: false }])).toEqual([{ id: 'A', count: 1 }, { id: 'B', count: 1 }]);
  });
  it.each([1, 2, 3])('generates the Lv.%i real pool, preserves accepted jobs and supports promotion', level => {
    const c = funded(); send(c, { type: 'unlock', airportId: 'PVG' });
    for (let i = 1; i < level; i++) send(c, { type: 'upgrade', airportId: 'PEK' });
    send(c, { type: 'refresh-demand', airportId: 'PEK' });
    const initial = waiting(c.snapshot(), 'PEK'); expect(initial).toHaveLength(demandCapacity('PEK',level));
    expect(initial.filter(o => o.kind === 'passengers')).toHaveLength(demandCapacity('PEK',level) * 2 / 3);
    send(c, { type: 'buy', modelId: 'diamond-da40', airportId: 'PEK', passengers: 1, cargo: 0 });
    send(c, { type: 'load-destination', planeId: 'AC0001', to: 'PVG' }); const loaded = manifest(c.snapshot(), 'AC0001');
    send(c, { type: 'refresh-demand', airportId: 'PEK' }); expect(manifest(c.snapshot(), 'AC0001')).toEqual(loaded);
    send(c, { type: 'promote-airport', airportId: 'PEK' }); c.tick(c.snapshot().lastWallTime + 120000);
    expect(waiting(c.snapshot(), 'PEK')).toHaveLength(demandCapacity('PEK',level, true)); expect(parseSave(JSON.stringify(c.snapshot()))).toEqual(c.snapshot());
  });
  it('round trips every promoted airport at the expanded limit and rejects overfull queues', () => {
    const state = funded().snapshot(); state.airports = AIRPORTS.map(a => ({ id: a.id, level: 3 })); state.career.airportPeak = AIRPORTS.length;
    state.career.promotions = Object.fromEntries(AIRPORTS.map(a => [a.id, 3600]));
    const c = new GameCore(NOW, state); c.tick(NOW + 120000);
    expect(c.snapshot().orders).toHaveLength(AIRPORTS.reduce((n,a)=>n+demandCapacity(a.id,3,true),0)); expect(c.snapshot().orders.length).toBeLessThan(MAX_ORDERS);
    const before = c.snapshot(); expect(parseSave(JSON.stringify(before))).toEqual(before);
    const bad = structuredClone(before), first = waiting(bad, 'PEK')[0]!;
    while(waiting(bad,'PEK').length<=MAX_WAITING) bad.orders.push({ ...first, id: `JB${bad.nextOrderId++}` }); expect(() => validateSave(bad)).toThrow();
    const replay = new GameCore(NOW, state); for (let t = 1; t <= 120; t++) replay.tick(NOW + t * 1000);
    expect(replay.snapshot()).toEqual(before);
  });
});
