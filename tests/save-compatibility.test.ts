import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { GameCore, parseSave, SAVE_VERSION, validateSave } from '../src/core/game.js';
const NOW = 1_800_000_000_000;
const RETIRED_VERSIONS = [1, 2, 3, 4, 5, 6];

describe('retired save boundary', () => {
  it.each(RETIRED_VERSIONS)('rejects v%s at the version gate, without needing historical payloads', version => {
    const value = { version }, before = structuredClone(value);
    expect(() => validateSave(value)).toThrow('不再支持');
    expect(() => parseSave(JSON.stringify(value))).toThrow('不再支持');
    expect(value).toEqual(before);
  });
  it.each(RETIRED_VERSIONS)('cannot launder current fields through a retired v%s header', version => {
    const value = { ...new GameCore(NOW).snapshot(), version }, before = structuredClone(value);
    expect(() => validateSave(value)).toThrow('不再支持');
    expect(value).toEqual(before);
  });
  it.each(['fleet', 'stored', 'museum'] as const)('rejects retired models in %s without changing the input', location => {
    const value = new GameCore(NOW).snapshot();
    if (location === 'fleet') value.fleet[0]!.modelId = 'lark';
    else if (location === 'stored') value.career.stored.push({ ...value.fleet[0]!, modelId: 'lark' });
    else value.career.museum.push('lark');
    const before = structuredClone(value);
    expect(() => validateSave(value)).toThrow('不再支持');
    expect(value).toEqual(before);
  });
  it('keeps the current schema and round-trip behavior unchanged', () => {
    const value = new GameCore(NOW).snapshot();
    expect(value.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(9);
    expect(parseSave(JSON.stringify(value))).toEqual(value);
  });
  it('does not reintroduce retired fixture payloads', () => {
    const directory = new URL('./fixtures/', import.meta.url);
    const files = existsSync(directory) ? readdirSync(directory) : [];
    expect(files.filter(file => /^v[1-6]-.*\.json$/.test(file))).toEqual([]);
  });
});
