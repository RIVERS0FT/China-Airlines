import { describe, expect, it } from 'vitest';
import { GameCore, parseSave, validateSave } from '../../src/core/game.js';
import { COMPANY_LOGOS, validateCompanyIdentity, type CompanyIdentity } from '../../src/core/company-identity.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNQKJjwHwAD9AIgQWVrPwAAAABJRU5ErkJggg==';
const identity: CompanyIdentity = { name: '云海航空 Cloud Air', logo: { kind: 'preset', id: 'wing' } };

describe('company identity', () => {
  it('creates an identity once without changing the starting economy', () => {
    const core = new GameCore(1000), before = core.snapshot();
    expect(before.company).toBeNull();
    core.execute({ type: 'found-company', company: identity }, 1000);
    expect(core.snapshot()).toEqual({ ...before, company: identity });
    expect(() => core.execute({ type: 'found-company', company: { ...identity, name: 'Another' } }, 1000)).toThrow('已经创建');
    expect(core.snapshot().company).toEqual(identity);
  });
  it('round trips every original preset and a bounded PNG without retaining mutable input', () => {
    for (const logo of [...COMPANY_LOGOS.map(id => ({ kind: 'preset' as const, id })), { kind: 'custom' as const, data: png }]) {
      const core = new GameCore(1000), company = { name: identity.name, logo };
      core.execute({ type: 'found-company', company }, 1000);
      expect(parseSave(JSON.stringify(core.snapshot())).company).toEqual(company);
      company.name = 'mutated';
      expect(core.snapshot().company?.name).toBe(identity.name);
    }
  });
  it.each(['', '   ', ' padded ', 'A'.repeat(25), 'A\nB', 'A\u202eB', '\ud800'])('rejects invalid name %j atomically', name => {
    const core = new GameCore(1000), before = core.snapshot();
    expect(() => core.execute({ type: 'found-company', company: { ...identity, name } }, 1000)).toThrow();
    expect(core.snapshot()).toEqual(before);
  });
  it('counts Unicode code points instead of UTF-16 units', () => {
    expect(validateCompanyIdentity({ ...identity, name: '航'.repeat(24) }).name).toHaveLength(24);
    expect(validateCompanyIdentity({ ...identity, name: '✈'.repeat(24) })).toBeTruthy();
  });
  it.each([
    { kind: 'preset', id: 'unknown' }, { kind: 'preset', id: 'wing', data: png },
    { kind: 'custom', data: 'https://example.com/logo.png' },
    { kind: 'custom', data: 'data:image/svg+xml,<svg onload="alert(1)"/>' },
    { kind: 'custom', data: 'data:image/png;base64,AAAA' },
    { kind: 'custom', data: png.replace('KJjw', 'AAAA') },
    { kind: 'custom', data: png + 'A'.repeat(100_000) },
  ])('rejects unknown, oversized or malformed logos', logo => {
    expect(() => validateCompanyIdentity({ name: identity.name, logo })).toThrow();
  });
  it('requires the new field and version, never guessing an old identity', () => {
    const state = new GameCore(1000).snapshot();
    const { company: _company, ...missing } = state;
    expect(() => validateSave(missing)).toThrow();
    expect(() => validateSave({ ...state, version: 15 })).toThrow('版本');
    expect(() => validateSave({ ...state, company: { ...identity, extra: true } })).toThrow();
  });
});
