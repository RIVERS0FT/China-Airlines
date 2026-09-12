import { describe, it, expect } from 'vitest';
import { AIRPORTS, CONTINENTS, distance, routeId } from '../src/core/catalog.js';
import { AIRPORTS as legacyAirports } from '../src/core/catalog-v4.js';
import { GameCore, manifest, quote, validateSave } from '../src/core/game.js';
import { validateV5 } from '../src/core/save-v5.js';
import { searchAirports } from '../src/ui/airport-search.js';
import flyingV5 from './fixtures/v5-flying.json';
import serviceV5 from './fixtures/v5-servicing.json';
const NOW = 1_800_000_000_000;
function funded() { const s = new GameCore(NOW).snapshot(); s.credits = 100_000_000; return new GameCore(NOW, s); }
describe('global airport registry', () => {
  it('adds 38 airports, covers six continents and preserves every domestic economic value', () => {
    expect(AIRPORTS).toHaveLength(50); expect(new Set(AIRPORTS.map(a => a.id)).size).toBe(50);
    expect(new Set(AIRPORTS.map(a => a.continent)).size).toBe(CONTINENTS.length);
    for (const a of AIRPORTS) {
      expect(a.id).toMatch(/^[A-Z]{3}$/); expect(Math.abs(a.lat)).toBeLessThanOrEqual(90); expect(Math.abs(a.lon)).toBeLessThanOrEqual(180);
      expect(Number.isSafeInteger(a.price)).toBe(true); expect(a.price).toBeGreaterThanOrEqual(0);
    }
    for (const a of legacyAirports) expect(AIRPORTS.find(b => b.id === a.id)).toMatchObject(a);
  });
  it('every airport can be reached by a chain of existing 8000 km aircraft legs', () => {
    const visited = new Set(['PEK']);
    for (let pass = 0; pass < AIRPORTS.length; pass++) for (const a of AIRPORTS) {
      if ([...visited].some(id => distance(id, a.id) <= 8000)) visited.add(a.id);
    }
    expect(visited.size).toBe(AIRPORTS.length);
    expect(distance('NRT', 'ANC')).toBeLessThan(8000); expect(distance('NRT', 'ANC')).toBeGreaterThan(5000);
  });
  it('supports combined continent, country/region, city and code searches', () => {
    expect(searchAirports(' lAx ')[0]!.id).toBe('LAX'); expect(searchAirports('巴西')[0]!.id).toBe('GRU');
    expect(searchAirports('南美洲 巴西')[0]!.id).toBe('GRU'); expect(searchAirports('LAX', '欧洲')).toHaveLength(0);
    expect(searchAirports('', '大洋洲').map(a => a.id)).toEqual(['SYD', 'PER', 'AKL', 'NAN']);
  });
  it('keeps initial unlocks and never grants foreign airports or remote cargo on browsing', () => {
    const c = new GameCore(NOW), before = c.snapshot(); searchAirports('东京');
    expect(c.snapshot()).toEqual(before); expect(before.airports.map(a => a.id)).toEqual(['PEK', 'PVG']);
    expect(before.orders.some(o => o.from === 'NRT' || o.to === 'NRT')).toBe(false);
  });
});
describe('world operations and persistence', () => {
  it('operates a real foreign flight, restores it and settles the locked reward once', () => {
    const c = new GameCore(NOW); c.execute({ type: 'unlock', airportId: 'ICN' }, NOW);
    const now = NOW + 360000; c.tick(now); c.execute({ type: 'load-destination', planeId: 'AC0001', to: 'ICN' }, now);
    const q = quote(c.snapshot(), c.snapshot().fleet[0]!, 'ICN'); expect(q.revenue).toBeGreaterThan(0);
    c.execute({ type: 'dispatch', planeId: 'AC0001', to: 'ICN', auto: false }, now);
    const saved = c.snapshot(), restored = new GameCore(now, validateSave(saved)), arrival = NOW + saved.fleet[0]!.flight!.arriveAt * 1000;
    expect(restored.snapshot()).toEqual(saved); restored.tick(arrival);
    expect(restored.snapshot().fleet[0]!.airportId).toBe('ICN'); expect(restored.snapshot().credits).toBe(saved.credits + q.revenue);
    expect(manifest(restored.snapshot(), 'AC0001')).toHaveLength(0); expect(restored.tick(arrival).revenue).toBe(0);
  });
  it('does not bypass aircraft range when the entire world becomes selectable', () => {
    const c = funded(); c.execute({ type: 'unlock', airportId: 'JFK' }, NOW); const before = c.snapshot();
    expect(() => c.execute({ type: 'dispatch', planeId: 'AC0001', to: 'JFK', auto: false }, NOW)).toThrow('航程');
    expect(c.snapshot()).toEqual(before);
  });
  it('persists a two-leg trans-Pacific plan without paying at the intermediate airport', () => {
    const c = funded();
    for (const id of ['NRT', 'ANC', 'YVR']) {
      c.execute({ type: 'unlock', airportId: id }, NOW);
      c.execute({ type: 'upgrade', airportId: id }, NOW); c.execute({ type: 'upgrade', airportId: id }, NOW);
    }
    c.execute({ type: 'buy', modelId: 'horizon', airportId: 'NRT' }, NOW);
    const id = c.snapshot().fleet.at(-1)!.id, now = NOW + 360000;
    c.tick(now); c.execute({ type: 'load-destination', planeId: id, to: 'YVR' }, now);
    c.execute({ type: 'dispatch-plan', planeId: id, stops: ['ANC', 'YVR'] }, now);
    const saved = c.snapshot(), first = saved.fleet.find(p => p.id === id)!.flight!, restored = new GameCore(now, saved);
    expect(first.revenue).toBe(0); restored.tick(NOW + (first.arriveAt + 8) * 1000);
    const second = restored.snapshot().fleet.find(p => p.id === id)!.flight!; expect(second.to).toBe('YVR'); expect(second.revenue).toBeGreaterThan(0);
    expect(() => validateSave(restored.snapshot())).not.toThrow();
    restored.tick(NOW + second.arriveAt * 1000); expect(restored.snapshot().stats.revenue).toBe(second.revenue);
    expect(restored.tick(NOW + second.arriveAt * 1000).revenue).toBe(0);
  });
  it('accepts valid global records beyond the old 66-route cap and rejects bad references', () => {
    const c = funded(); for (const a of AIRPORTS) if (!c.snapshot().airports.some(b => b.id === a.id)) c.execute({ type: 'unlock', airportId: a.id }, NOW);
    const s = c.snapshot();
    s.routes = AIRPORTS.flatMap((a, i) => AIRPORTS.slice(i + 1).map(b => ({ id: routeId(a.id, b.id), from: a.id, to: b.id })));
    expect(s.routes).toHaveLength(1225); expect(validateSave(s)).toEqual(s);
    s.routes[0]!.to = 'ZZZ'; expect(() => validateSave(s)).toThrow();
  });
  it.each([flyingV5, serviceV5])('migrates frozen v5 data with only the version changed', old => {
    expect(validateV5(old)).toEqual(old); const migrated = validateSave(old);
    expect(migrated).toEqual({ ...old, version: 6 }); expect(validateSave(migrated)).toEqual(migrated);
  });
  it('rejects forged global v5 data and corrupt energy instead of laundering them into v6', () => {
    const old = structuredClone(flyingV5); old.airports.push({ id: 'NRT', level: 1 });
    expect(() => validateSave(old)).toThrow();
    const bad = structuredClone(serviceV5); bad.fleet[0]!.energy.availableSeconds = -1;
    expect(() => validateSave(bad)).toThrow();
  });
  it('rejects invalid infrastructure atomically with expanded bounds', () => {
    const original = new GameCore(NOW).snapshot();
    for (const mutate of [(s: typeof original) => { s.airports.push({ id: 'ZZZ', level: 1 }); }, (s: typeof original) => { s.airports.push(s.airports[0]!); }, (s: typeof original) => { s.stats.costs = NaN; }, (s: typeof original) => { s.fleet[0]!.id = 'AC0000'; }, (s: typeof original) => { s.credits = -1; }]) {
      const s = structuredClone(original); mutate(s); expect(() => validateSave(s)).toThrow();
    }
    expect(validateSave(original)).toEqual(original);
  });
});
