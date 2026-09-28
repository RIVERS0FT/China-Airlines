import type { GameState } from './game.js';
import { bill, guard } from './career.js';
import { employeeHistory, generalManager, type Employee } from './organization.js';

export const BUSINESS_KINDS = ['ticketing', 'services', 'forwarding'] as const;
export type BusinessKind = typeof BUSINESS_KINDS[number];
export interface BusinessTeam { id: number; airportId: string; kind: BusinessKind; managerId: number; level: number }
export interface BusinessState { teams: BusinessTeam[]; nextId: number; remainder: number; earned: number; wallPeak: number }
export type BusinessCommand =
  | { type: 'open-business-team'; airportId: string; kind: BusinessKind }
  | { type: 'hire-business-worker' | 'expand-business-team'; teamId: number }
  | { type: 'train-business-employee'; employeeId: number };
export const BUSINESS_CATALOG: Record<BusinessKind, {
  zh: string; en: string; airportLevel: number; opening: number; hiring: number; expansion: number;
  gross: number; wage: number; overhead: number;
}> = {
  ticketing: { zh: '票务代理', en: 'Ticket agency', airportLevel: 1, opening: 900, hiring: 400, expansion: 800, gross: 900, wage: 300, overhead: 200 },
  services: { zh: '地面服务', en: 'Ground services', airportLevel: 2, opening: 2400, hiring: 1000, expansion: 1800, gross: 1800, wage: 500, overhead: 400 },
  forwarding: { zh: '货运代理', en: 'Freight agency', airportLevel: 3, opening: 6000, hiring: 2500, expansion: 4000, gross: 4200, wage: 1200, overhead: 1000 },
};
export const MAX_BUSINESS_TEAMS = 300, MAX_BUSINESS_LEVEL = 5;
// Rates are integer milli-coins/second; remainder is integer millionths of a coin.
const COIN = 1_000_000, MAX_MONEY = 1e12;
export const newBusiness = (now = 0): BusinessState => ({ teams: [], nextId: 1, remainder: 0, earned: 0, wallPeak: now });
export const businessCapacity = (team: BusinessTeam) => 2 * team.level;
export const businessWorkers = (s: GameState, team: BusinessTeam) =>
  s.career.employees.filter(e => e.department === 'business' && e.role === 'specialist' && e.managerId === team.managerId);
export const employeeCapacity = (s: GameState) => 15 + s.business.teams.reduce((n, t) => n + 1 + businessCapacity(t), 0);
export const employeeTeam = (s: GameState, e: Employee) => s.business.teams.find(t => t.managerId === (e.role === 'manager' ? e.id : e.managerId));
export function businessTeamQuote(s: GameState, team: BusinessTeam, at = s.simTime) {
  const spec = BUSINESS_CATALOG[team.kind], workers = businessWorkers(s, team);
  const manager = s.career.employees.find(e => e.id === team.managerId), chief = generalManager(s);
  // Only the real reporting chain carries the chief's bonus. Prepaid chief pay is not charged twice.
  const chiefBonus = chief && chief.paidUntil > at && manager?.managerId === chief.id ? chief.management : 0;
  const bonus = Math.min(40, 2 * (manager?.management ?? 0) + chiefBonus);
  const employeeGross = (e: Pick<Employee, 'skill'>) => Math.floor(spec.gross * (100 + 10 * (e.skill - 1) + bonus) / 100);
  const gross = workers.reduce((sum, e) => sum + employeeGross(e), 0);
  const costs = workers.length * spec.wage + spec.overhead;
  const net = Math.max(0, gross - costs);
  return { gross, costs, net, workers, bonus, workerGross: employeeGross({ skill: 1 }),
    hiringCost: spec.hiring * (1 + Math.floor(workers.length / 3)),
    hiringGain: employeeGross({ skill: 1 }) - spec.wage,
    expansionCost: spec.expansion * team.level * team.level,
    capacity: businessCapacity(team) };
}
export function businessIncomeQuote(s: GameState, at = s.simTime) {
  return s.business.teams.reduce((total, team) => {
    const q = businessTeamQuote(s, team, at);
    return { gross: total.gross + q.gross, costs: total.costs + q.costs, net: total.net + q.net };
  }, { gross: 0, costs: 0, net: 0 });
}
export function businessOpeningReason(s: GameState, airportId: string, kind: BusinessKind): string {
  if (!BUSINESS_KINDS.includes(kind)) return '未知业务类型';
  const owned = s.airports.find(a => a.id === airportId), spec = BUSINESS_CATALOG[kind];
  if (!owned) return '机场尚未开放';
  if (!s.stats.flights || !s.stats.revenue) return '完成首次有偿运输后开放公司业务';
  if (owned.level < spec.airportLevel) return `该业务需要${spec.airportLevel}级机场`;
  if (s.business.teams.some(t => t.airportId === airportId && t.kind === kind)) return '该城市已开设此业务';
  if (s.business.teams.length >= MAX_BUSINESS_TEAMS) return '业务团队已达上限';
  if (s.credits < spec.opening) return '运营资金不足';
  return '';
}
function createBusinessEmployee(s: GameState, role: Employee['role'], managerId: number | null): Employee {
  guard(s.career.nextId < 1e12, '人员编号已达上限');
  const id = s.career.nextId++, names = ['林新', '周宁', '陈星', '叶远', '许安', '沈悦'];
  const employee: Employee = { id, name: `${names[(id - 1) % names.length]}${id.toString(36)}`,
    department: 'business', role, managerId, planeId: null, airportId: null,
    paidUntil: 0, skill: role === 'manager' ? 2 : 1, management: role === 'manager' ? 1 : 0,
    potential: 10, trait: id % 2 ? 'efficient' : 'mentor', joinedAt: s.simTime,
    flights: 0, deliveries: 0, history: [] };
  employeeHistory(s, employee, 'joined', '加入业务团队，工资从业务收入中按秒扣除');
  s.career.employees.push(employee);
  return employee;
}
export function businessTrainingQuote(s: GameState, employee: Employee) {
  const team = employeeTeam(s, employee);
  guard(team && employee.department === 'business', '未找到业务员工');
  const field: 'management' | 'skill' = employee.role === 'manager' ? 'management' : 'skill';
  const next = employee[field] + 1, cost = BUSINESS_CATALOG[team.kind].hiring * next * next;
  const q = businessTeamQuote(s, team), spec = BUSINESS_CATALOG[team.kind];
  const bonus = field === 'management' ? Math.min(40, q.bonus + 2) : q.bonus;
  const projected = q.workers.reduce((sum, worker) => {
    const skill = field === 'skill' && worker.id === employee.id ? next : worker.skill;
    return sum + Math.floor(spec.gross * (100 + 10 * (skill - 1) + bonus) / 100);
  }, 0);
  return { field, next, cost, maximum: next > employee.potential,
    gain: Math.max(0, projected - q.costs) - q.net };
}
/** Called on an already time-advanced transaction copy; any failure discards all writes. */
export function businessExecute(s: GameState, command: BusinessCommand): string {
  if (command.type === 'open-business-team') {
    const reason = businessOpeningReason(s, command.airportId, command.kind);
    guard(!reason, reason);
    guard(s.business.nextId < 1e12 && s.career.nextId < 1e12 - 1, '业务或人员编号已达上限');
    bill(s, BUSINESS_CATALOG[command.kind].opening, 0);
    const manager = createBusinessEmployee(s, 'manager', generalManager(s)?.id ?? null);
    s.business.teams.push({ id: s.business.nextId++, airportId: command.airportId, kind: command.kind, managerId: manager.id, level: 1 });
    createBusinessEmployee(s, 'specialist', manager.id);
    return '业务团队已开设，包含主管与1名员工';
  }
  if (command.type === 'train-business-employee') {
    const employee = s.career.employees.find(e => e.id === command.employeeId);
    guard(employee?.department === 'business', '未找到业务员工');
    const q = businessTrainingQuote(s, employee);
    guard(!q.maximum, '员工已达到潜力上限');
    bill(s, q.cost, 0); employee[q.field] = q.next;
    employeeHistory(s, employee, 'trained', `业务${q.field === 'management' ? '管理' : '专业'}提升至${q.next}级`);
    return '业务员工培养完成，后续每秒收入已更新';
  }
  const team = s.business.teams.find(t => t.id === command.teamId);
  guard(team, '未找到业务团队');
  const q = businessTeamQuote(s, team);
  if (command.type === 'hire-business-worker') {
    guard(q.workers.length < q.capacity, '团队岗位已满，请先扩建');
    guard(s.career.nextId < 1e12, '人员编号已达上限');
    bill(s, q.hiringCost, 0); createBusinessEmployee(s, 'specialist', team.managerId);
    return '业务员工已上岗，每秒净收入增加';
  }
  guard(command.type === 'expand-business-team', '未知业务命令');
  const owned = s.airports.find(a => a.id === team.airportId);
  guard(team.level < MAX_BUSINESS_LEVEL && team.level < (owned?.level ?? 0) + 2, '请先升级机场，或团队已达到扩建上限');
  bill(s, q.expansionCost, 0); team.level++;
  return '业务团队已扩建，新增2个岗位';
}
/** Fixed-point, additive settlement. Splits at prepaid chief expiry, never at render frames. */
export function accrueBusiness(s: GameState, from: number, to: number): void {
  if (to <= from || !s.business.teams.length) return;
  const chief = generalManager(s), expiry = chief?.paidUntil ?? 0;
  const boundaries = expiry > from && expiry < to ? [from, expiry, to] : [from, to];
  for (let i = 1; i < boundaries.length; i++) {
    const start = boundaries[i - 1]!, end = boundaries[i]!;
    const millis = Math.floor(end * 1000 + 0.0001) - Math.floor(start * 1000 + 0.0001);
    const units = s.business.remainder + businessIncomeQuote(s, start).net * millis;
    guard(Number.isSafeInteger(units), '业务收入超出安全计算范围');
    const paid = Math.min(Math.floor(units / COIN), Math.max(0, MAX_MONEY - s.credits));
    s.credits += paid;
    s.business.earned = Math.min(MAX_MONEY, s.business.earned + paid);
    s.business.remainder = s.credits === MAX_MONEY ? 0 : units % COIN;
  }
}
