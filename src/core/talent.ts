import type { Command, GameState } from './game.js';
import { effectiveManager, organizationExecute, staffIn, type Department, type Employee, type EmployeeRole } from './organization.js';

export interface Candidate {
  id: number; name: string; department: Department; role: EmployeeRole;
  potential: number; trait: Employee['trait'];
}
export type MilestoneKind = 'first-hire' | 'internal-manager' | 'two-departments' | 'first-mentoring' | 'paid-flight';
export interface Milestone { kind: MilestoneKind; at: number; employeeId: number; mentorId: number | null }
export interface Mentoring { employeeId: number; mentorId: number; at: number; level: number }
export interface TalentState {
  seed: number; nextId: number; startedAt: number; candidates: Candidate[];
  mentoring: Mentoring[]; milestones: Milestone[]; deferred: { key: string; signature: string }[];
}
export type TalentCommand = { type: 'hire-candidate'; candidateId: number }
  | { type: 'defer-company-affair'; key: string; signature: string };
export interface CompanyAffair {
  key: string; signature: string; kind: 'promotion' | 'training' | 'ground'; employeeId: number | null; airportId: string | null;
}
const groups = ['flight-specialist', 'ground-specialist', 'flight-manager', 'ground-manager'] as const;
export const MILESTONE_KINDS: MilestoneKind[] = ['first-hire','internal-manager','two-departments','first-mentoring','paid-flight'];
const MAX_ID = 1e12;
function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function nextCandidate(t: TalentState, department: Department, role: EmployeeRole): Candidate {
  check(t.nextId < MAX_ID, '候选人编号已达上限');
  t.seed = (Math.imul(t.seed, 1664525) + 1013904223) >>> 0;
  const id = t.nextId++;
  const names = department === 'flight' ? ['林航','许岚','周远','苏晴','陈翼','陆星','唐云','沈宁'] : ['顾川','叶宁','孟青','乔安'];
  const offset = department === 'flight' && role === 'manager' ? 3 : role === 'manager' ? 1 : 0;
  return { id, name: names[(Math.floor((id - 1) / 12) * 3 + (id - 1) % 3 + offset) % names.length]!, department, role,
    potential: 6 + t.seed % 5, trait: (t.seed >>> 8) % 2 ? 'mentor' : 'efficient' };
}
/** A separate deterministic stream does not change legacy recruitment or logistics randomness. */
export function createTalent(seed: number, at: number): TalentState {
  const t: TalentState = { seed: (seed ^ 0x41c6ce57) >>> 0, nextId: 1, startedAt: at, candidates: [], mentoring: [], milestones: [], deferred: [] };
  for (const group of groups) {
    const [department, role] = group.split('-') as [Department, EmployeeRole];
    for (let i = 0; i < 3; i++) t.candidates.push(nextCandidate(t, department, role));
  }
  return t;
}
export function recordMilestone(s: GameState, kind: MilestoneKind, employeeId: number, mentorId: number | null = null) {
  if (!s.talent.milestones.some(m => m.kind === kind)) s.talent.milestones.push({ kind, at: s.simTime, employeeId, mentorId });
}
/** Only called after the real arrival event; it never pays money or changes an employee's skills. */
export function recordTalentArrival(s: GameState, planeId: string, paid: boolean) {
  const employee = s.career.employees.find(e => e.planeId === planeId);
  if (paid && employee && employee.flights > 0) recordMilestone(s, 'paid-flight', employee.id);
}
/** Observe a successful atomic command, not UI selection, refresh or an offline summary. */
export function recordTalentCommand(s: GameState, before: GameState, command: Command) {
  for (const employee of s.career.employees) {
    const old = before.career.employees.find(e => e.id === employee.id);
    if (!old) recordMilestone(s, 'first-hire', employee.id);
    if (old?.role === 'specialist' && employee.role === 'manager') recordMilestone(s, 'internal-manager', employee.id);
  }
  const departments = new Set(s.career.employees.map(e => e.department));
  if (departments.size === 2 && new Set(before.career.employees.map(e => e.department)).size < 2) {
    recordMilestone(s, 'two-departments', s.career.employees.at(-1)!.id);
  }
  const id = command.type === 'train-employee' && command.training === 'skill' ? command.employeeId
    : command.type === 'train-pilot' ? command.pilotId : null;
  const old = before.career.employees.find(e => e.id === id), employee = s.career.employees.find(e => e.id === id);
  const mentor = old ? effectiveManager(before, old) : undefined;
  if (old && employee && mentor && employee.skill === old.skill + 1) {
    s.talent.mentoring.push({ employeeId: employee.id, mentorId: mentor.id, at: s.simTime, level: employee.skill });
    recordMilestone(s, 'first-mentoring', employee.id, mentor.id);
  }
  // Closed airports cannot leave stale, unbounded references in deferred advice.
  s.talent.deferred = s.talent.deferred.filter(item => !item.key.startsWith('ground:') || s.airports.some(a => `ground:${a.id}` === item.key));
}
export function companyAffairs(s: GameState, includeDeferred = false): CompanyAffair[] {
  const result: CompanyAffair[] = [];
  for (const e of s.career.employees) {
    if (e.role !== 'specialist' || e.paidUntil <= s.simTime) continue;
    const signature = `${e.skill}:${e.management}:${e.managerId ?? 0}:${e.paidUntil}`;
    if (e.skill >= 2 && e.management >= 1 && !staffIn(s,e.department,'manager').length)
      result.push({ key: `promotion:${e.id}`, signature, kind: 'promotion', employeeId: e.id, airportId: null });
    const manager = effectiveManager(s,e);
    if (manager && e.skill < e.potential)
      result.push({ key: `training:${e.id}`, signature: `${signature}:${manager.management}:${manager.paidUntil}`, kind: 'training', employeeId: e.id, airportId: null });
  }
  const free = s.career.employees.find(e => e.department === 'ground' && e.role === 'specialist' && !e.airportId && e.paidUntil > s.simTime);
  // Advice is optional: show coverage opportunities only when an unassigned specialist exists.
  if (free) for (const a of s.airports) if (!s.career.employees.some(e => e.airportId === a.id))
    result.push({ key: `ground:${a.id}`, signature: `${free.id}:${free.paidUntil}`, kind: 'ground', employeeId: free.id, airportId: a.id });
  return includeDeferred ? result : result.filter(a => !s.talent.deferred.some(d => d.key === a.key && d.signature === a.signature));
}
export function talentExecute(s: GameState, command: TalentCommand) {
  if (command.type === 'hire-candidate') {
    const candidate = s.talent.candidates.find(c => c.id === command.candidateId);
    check(candidate, '候选人已入职或不在名单中');
    check(s.talent.nextId < MAX_ID, '候选人编号已达上限');
    // Recruitment validation, price, limits, identity allocation and contract remain authoritative.
    organizationExecute(s, { type: 'recruit-employee', department: candidate.department, role: candidate.role });
    const employee = s.career.employees.at(-1)!;
    const duplicate = s.career.employees.some(e => e.id !== employee.id && e.name === candidate.name);
    employee.name = duplicate ? `${candidate.name}${employee.id.toString(36)}` : candidate.name;
    employee.potential = candidate.potential; employee.trait = candidate.trait;
    s.talent.candidates = s.talent.candidates.filter(c => c.id !== candidate.id);
    s.talent.candidates.push(nextCandidate(s.talent, candidate.department, candidate.role));
    return '候选人已入职，包含7天合同';
  }
  const affair = companyAffairs(s, true).find(a => a.key === command.key && a.signature === command.signature);
  check(affair, '事务条件已改变，请重新查看公司事务');
  check(!s.talent.deferred.some(d => d.key === affair.key && d.signature === affair.signature), '这项事务已暂缓');
  s.talent.deferred = s.talent.deferred.filter(d => d.key !== affair.key);
  s.talent.deferred.push({ key: affair.key, signature: affair.signature });
  return '事务已暂缓，经营照常进行';
}

/** Exact fields, bounded collections, identity references and timestamps are all validated. */
export function validateTalent(s: GameState) {
  const fail = () => { throw new Error('存档人才培养数据无效，原进度未被覆盖'); };
  function fields(value: unknown, keys: string[]) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) fail();
  }
  function num(value: unknown, min: number, max: number, integer = true) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) fail();
  }
  const t = s.talent;
  fields(t, ['seed','nextId','startedAt','candidates','mentoring','milestones','deferred']);
  num(t.seed,0,0xffffffff); num(t.nextId,13,MAX_ID); num(t.startedAt,0,s.simTime,false);
  if (!Array.isArray(t.candidates) || t.candidates.length !== 12 || !Array.isArray(t.mentoring) || t.mentoring.length > 140 ||
    !Array.isArray(t.milestones) || t.milestones.length > MILESTONE_KINDS.length || !Array.isArray(t.deferred) || t.deferred.length > 100) fail();
  const candidateIds = new Set<number>();
  for (const c of t.candidates) {
    fields(c,['id','name','department','role','potential','trait']); num(c.id,1,t.nextId-1); num(c.potential,6,10);
    if (candidateIds.has(c.id) || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 12 ||
      !groups.includes(`${c.department}-${c.role}` as typeof groups[number]) || !['mentor','efficient'].includes(c.trait)) fail();
    candidateIds.add(c.id);
  }
  for (const group of groups) if (t.candidates.filter(c => `${c.department}-${c.role}` === group).length !== 3) fail();
  const people = new Map(s.career.employees.map(e => [e.id,e]));
  const keys = new Set<string>(); let previousAt = t.startedAt;
  for (const m of t.mentoring) {
    fields(m,['employeeId','mentorId','at','level']); num(m.at,previousAt,s.simTime,false); num(m.level,1,10);
    const employee = people.get(m.employeeId), mentor = people.get(m.mentorId), key = `${m.employeeId}:${m.level}`;
    if (!employee || !mentor || employee.id === mentor.id || employee.department !== mentor.department || m.level > employee.skill ||
      (employee.joinedAt !== null && m.at < employee.joinedAt) || (mentor.joinedAt !== null && m.at < mentor.joinedAt) || keys.has(key)) fail();
    keys.add(key); previousAt = m.at;
  }
  keys.clear(); previousAt = t.startedAt;
  for (const m of t.milestones) {
    fields(m,['kind','at','employeeId','mentorId']); num(m.at,previousAt,s.simTime,false);
    const e = people.get(m.employeeId);
    if (!MILESTONE_KINDS.includes(m.kind) || keys.has(m.kind) || !e || (e.joinedAt !== null && m.at < e.joinedAt) ||
      (m.kind === 'paid-flight' && !e.flights) ||
      (m.kind === 'first-mentoring' ? !t.mentoring.some(r => r.employeeId === m.employeeId && r.mentorId === m.mentorId && r.at === m.at) : m.mentorId !== null)) fail();
    keys.add(m.kind); previousAt = m.at;
  }
  keys.clear();
  for (const d of t.deferred) {
    fields(d,['key','signature']);
    if (typeof d.key !== 'string' || typeof d.signature !== 'string' || !/^\d+(?:\.\d+)?(?:e[+-]?\d+)?(?::\d+(?:\.\d+)?(?:e[+-]?\d+)?){1,5}$/i.test(d.signature) || d.signature.length > 150 || keys.has(d.key)) fail();
    for (const part of d.signature.split(':')) num(Number(part),0,MAX_ID,false);
    const match = /^(promotion|training):([1-9]\d*)$/.exec(d.key);
    if (match ? !people.has(Number(match[2])) : !s.airports.some(a => d.key === `ground:${a.id}`)) fail();
    keys.add(d.key);
  }
}
