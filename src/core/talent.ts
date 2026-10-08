import type { Command, GameState } from './game.js';
import { EMPLOYEE_POSITIONS, MAX_EMPLOYEES, effectiveManager, organizationExecute, staffIn, type Department, type Employee, type EmployeeRole } from './organization.js';
import { careerLevel } from './career.js';

export interface Candidate {
  id: number; name: string; department: Department; role: EmployeeRole;
  potential: number; trait: Employee['trait'];
}
export type MilestoneKind = 'first-hire' | 'internal-manager' | 'two-departments' | 'first-mentoring' | 'paid-flight';
export interface Milestone { kind: MilestoneKind; at: number; employeeId: number; mentorId: number | null }
export interface Mentoring { employeeId: number; mentorId: number; at: number; level: number }
export interface TalentState {
  seed: number; nextId: number; startedAt: number; batchLevel: number; candidates: Candidate[];
  mentoring: Mentoring[]; milestones: Milestone[]; deferred: { key: string; signature: string }[];
}
export type TalentCommand = { type: 'hire-candidate'; candidateId: number }
  | { type: 'defer-company-affair'; key: string; signature: string };
export interface CompanyAffair {
  key: string; signature: string; kind: 'promotion' | 'training' | 'ground'; employeeId: number | null; airportId: string | null;
}
export const INITIAL_CANDIDATES = 3, MAX_CANDIDATES = 12;
export const talentBatchSize = (level: number) => Math.min(MAX_CANDIDATES, INITIAL_CANDIDATES + level - 1);
export const TALENT_REFRESH_INTERVAL = 5 * 60;
export const MILESTONE_KINDS: MilestoneKind[] = ['first-hire','internal-manager','two-departments','first-mentoring','paid-flight'];
const MAX_ID = 1e12;
function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function nextCandidate(t: TalentState): Candidate {
  check(t.nextId < MAX_ID, '候选人编号已达上限');
  t.seed = (Math.imul(t.seed, 1664525) + 1013904223) >>> 0;
  const { department, role } = EMPLOYEE_POSITIONS[t.seed % EMPLOYEE_POSITIONS.length]!;
  t.seed = (Math.imul(t.seed, 1664525) + 1013904223) >>> 0;
  const id = t.nextId++;
  const names = department === 'company' ? ['沈远','程宁','顾承']
    : department === 'flight' ? ['林航','许岚','周远','苏晴','陈翼','陆星','唐云','沈宁'] : ['顾川','叶宁','孟青','乔安'];
  return { id, name: names[(t.seed >>> 16) % names.length]!, department, role,
    potential: 6 + t.seed % 5, trait: (t.seed >>> 8) % 2 ? 'mentor' : 'efficient' };
}
/** A separate deterministic stream keeps recruitment and logistics randomness independent. */
export function createTalent(seed: number, at: number, level = 1): TalentState {
  const t: TalentState = { seed: (seed ^ 0x41c6ce57) >>> 0, nextId: 1, startedAt: at, batchLevel: level, candidates: [], mentoring: [], milestones: [], deferred: [] };
  for (let i = 0; i < talentBatchSize(level); i++) t.candidates.push(nextCandidate(t));
  return t;
}
/** The market follows operating time, so reloads and wall-clock changes cannot reroll a batch. */
export function nextTalentRefreshAt(s: Pick<GameState, 'simTime'>): number {
  return (Math.floor(s.simTime / TALENT_REFRESH_INTERVAL) + 1) * TALENT_REFRESH_INTERVAL;
}
/** Called at an exact clock event, using the company level reached at that instant. */
export function refreshTalent(s: GameState): void {
  const level = careerLevel(s), count = talentBatchSize(level);
  // Exhausted identities cannot partially replace a batch or stop the simulation clock.
  if (s.talent.nextId > MAX_ID - count) return;
  const candidates: Candidate[] = [];
  for (let i = 0; i < count; i++) candidates.push(nextCandidate(s.talent));
  s.talent.candidates = candidates;
  s.talent.batchLevel = level;
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
  const hasBothDepartments = (state: GameState) => ['flight', 'ground'].every(department => state.career.employees.some(e => e.department === department));
  if (hasBothDepartments(s) && !hasBothDepartments(before)) {
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
    // Recruitment validation, price, limits, identity allocation and contract remain authoritative.
    organizationExecute(s, { type: 'recruit-employee', department: candidate.department, role: candidate.role });
    const employee = s.career.employees.at(-1)!;
    const duplicate = s.career.employees.some(e => e.id !== employee.id && e.name === candidate.name);
    employee.name = duplicate ? `${candidate.name}${employee.id.toString(36)}` : candidate.name;
    employee.potential = candidate.potential; employee.trait = candidate.trait;
    s.talent.candidates = s.talent.candidates.filter(c => c.id !== candidate.id);
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
  fields(t, ['seed','nextId','startedAt','batchLevel','candidates','mentoring','milestones','deferred']);
  num(t.batchLevel,1,careerLevel(s));
  const count = talentBatchSize(t.batchLevel);
  num(t.seed,0,0xffffffff); num(t.nextId,count + 1,MAX_ID); num(t.startedAt,0,s.simTime,false);
  if (!Array.isArray(t.candidates) || t.candidates.length > count || !Array.isArray(t.mentoring) || t.mentoring.length > MAX_EMPLOYEES * 10 ||
    !Array.isArray(t.milestones) || t.milestones.length > MILESTONE_KINDS.length || !Array.isArray(t.deferred) || t.deferred.length > 100) fail();
  const candidateIds = new Set<number>();
  for (const c of t.candidates) {
    fields(c,['id','name','department','role','potential','trait']); num(c.id,t.nextId-count,t.nextId-1); num(c.potential,6,10);
    if (candidateIds.has(c.id) || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 12 ||
      !EMPLOYEE_POSITIONS.some(p => p.department === c.department && p.role === c.role) || !['mentor','efficient'].includes(c.trait)) fail();
    candidateIds.add(c.id);
  }
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
