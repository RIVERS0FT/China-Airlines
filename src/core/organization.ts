import type { GameState, Plane } from './game.js';
import { bill, careerLevel, guard, parked } from './career.js';
import { airport } from './catalog.js';
import { ENERGY_SERVICE_SECONDS } from './energy.js';

export const DEPARTMENTS = { flight: '飞行部', ground: '地勤部' } as const;
export type Department = keyof typeof DEPARTMENTS;
export const TRAITS = { mentor: '善于带教', efficient: '高效作业', steady: '稳健成长' } as const;
export type Trait = keyof typeof TRAITS;
export const EMPLOYEE_LIMIT = 8;
export const CONTRACT_SECONDS = 7 * 86400;
export const HISTORY_LIMIT = 20;
export interface Employee {
  id: number; name: string; department: Department; role: 'staff' | 'manager';
  planeId: string | null; airportId: string | null; paidUntil: number;
  skill: number; management: number; potential: number; trait: Trait;
  joinedAt: number | null; flights: number; deliveries: number;
  history: { at: number; text: string }[];
}
/** Snapshot only the NEW management effect. Existing fares and pilot skill rights stay unchanged. */
export interface FlightStaffing {
  pilotId: number | null; managerId: number | null;
  management: number; mentor: boolean; workload: number;
}
export type OrganizationCommand =
  | { type: 'org-recruit'; department: Department }
  | { type: 'org-assign'; employeeId: number; assetId: string | null }
  | { type: 'org-train'; employeeId: number; ability: 'skill' | 'management' }
  | { type: 'org-renew' | 'org-appoint' | 'org-demote'; employeeId: number };

export const activePilots = (s: GameState) => s.career.employees.filter(e => e.department === 'flight' && e.role === 'staff');
export const staff = (s: GameState, d: Department) => s.career.employees.filter(e => e.department === d && e.role === 'staff');
export const manager = (s: GameState, d: Department) => s.career.employees.find(e => e.department === d && e.role === 'manager');
export const roleName = (e: Employee) => e.role === 'manager' ? `${DEPARTMENTS[e.department]}经理` : e.department === 'flight' ? '飞行员' : '地勤专员';
export const managementCapacity = (e: Employee) => 2 + e.management;
export const assignedStaff = (s: GameState, d: Department) => staff(s, d).filter(e => e.planeId !== null || e.airportId !== null);
export const recruitCost = (d: Department) => d === 'flight' ? { gold: 1800, tickets: 3 } : { gold: 1200, tickets: 2 };
export const renewalCost = (e: Employee) => e.department === 'flight' ? { gold: 600, tickets: 2 } : { gold: 400, tickets: 1 };
export const trainingCost = (e: Employee, ability: 'skill' | 'management') => ({
  gold: Math.ceil((ability === 'management' ? 500 : e.department === 'flight' ? 400 : 300) * (e[ability] + 1) * (ability === 'management' && e.trait === 'steady' ? 0.9 : 1)),
  tickets: ability === 'skill' && e.department === 'flight' ? 3 : 2,
});
export function remember(s: GameState, e: Employee, text: string) {
  e.history.push({ at: s.simTime, text });
  if (e.history.length > HISTORY_LIMIT) e.history.splice(0, e.history.length - HISTORY_LIMIT);
}
export function legacyEmployee(p: { id:number; name:string; planeId:string|null; paidUntil:number; skill:number }, at: number): Employee {
  return { ...p, department: 'flight', role: 'staff', airportId: null,
    management: 1, potential: 10, trait: 'steady', joinedAt: null,
    flights: 0, deliveries: 0, history: [{ at, text: '旧版人员转入组织档案，技能与合同完整保留' }] };
}
export function employeeLock(s: GameState, e: Employee): string {
  if (!e.planeId) return '';
  const p = s.fleet.find(p => p.id === e.planeId);
  return p && (p.flight || p.autoRouteId || p.itinerary.length || p.energy.serviceUntil !== null || p.readyAt > s.simTime)
    ? '请先停止运营并等待地面周转' : '';
}
export function appointmentReason(s: GameState, e: Employee): string {
  return e.role === 'manager' ? '已担任部门经理' : careerLevel(s) < 2 ? '公司2级开放经理任命' :
    e.skill < 2 ? '专业能力达到2级后可任命' : e.management < 1 ? '管理能力不足' :
    e.paidUntil <= s.simTime ? '请先续付合同' : e.planeId || e.airportId ? '请先解除执行岗位分配' : '';
}
function paidManager(s: GameState, d: Department) {
  const m = manager(s, d);
  return m && m.paidUntil > s.simTime ? m : undefined;
}
export function flightStaffing(s: GameState, p: Plane): FlightStaffing {
  const pilot = activePilots(s).find(e => e.planeId === p.id);
  const m = pilot && pilot.paidUntil > s.simTime ? paidManager(s, 'flight') : undefined;
  return { pilotId: pilot?.id ?? null, managerId: m?.id ?? null,
    management: m?.management ?? 0, mentor: m?.trait === 'mentor',
    workload: m ? assignedStaff(s, 'flight').length : 0 };
}
export function managementBonusBps(f: FlightStaffing | null | undefined): number {
  if (!f?.managerId) return 0;
  return Math.floor(Math.min(2000, f.management * 200 + (f.mentor ? 200 : 0)) * Math.min(1, (2 + f.management) / Math.max(1, f.workload)));
}
/** The returned duration is locked into serviceUntil when service starts. */
export function groundServiceSeconds(s: GameState, airportId: string): number {
  const e = staff(s, 'ground').find(e => e.airportId === airportId && e.paidUntil > s.simTime);
  if (!e) return ENERGY_SERVICE_SECONDS;
  const m = paidManager(s, 'ground');
  const coverage = m ? Math.min(1, managementCapacity(m) / Math.max(1, assignedStaff(s, 'ground').length)) : 0;
  const bps = Math.min(3000, e.skill * 200 + (e.trait === 'efficient' ? 200 : 0) + Math.floor(((m?.management ?? 0) * 100 + (m?.trait === 'mentor' ? 100 : 0)) * coverage));
  return Math.ceil(ENERGY_SERVICE_SECONDS * (10000 - bps) / 10000);
}
export function employeeStatus(s: GameState, e: Employee): string {
  if (e.paidUntil <= s.simTime) return '待续约';
  if (e.role === 'manager') return '管理中';
  if (e.planeId) return s.fleet.find(p => p.id === e.planeId)?.flight ? '飞行中' : '已分配';
  return e.airportId ? '驻站服务' : '待分配';
}
export function recordFlightWork(s: GameState, p: Plane, count: number, f: FlightStaffing | null | undefined) {
  if (!count) return;
  s.career.xp += Math.floor((20 + count * 5) * managementBonusBps(f) / 10000);
  const ids = new Set([f?.pilotId ?? activePilots(s).find(e => e.planeId === p.id)?.id, f?.managerId]);
  for (const id of ids) {
    const e = s.career.employees.find(e => e.id === id);
    if (e) { e.flights++; e.deliveries += count; }
  }
}
export function organizationExecute(s: GameState, command: OrganizationCommand): string {
  if (command.type === 'org-recruit') {
    guard(typeof command.department === 'string' && Object.hasOwn(DEPARTMENTS, command.department), '未知部门');
    guard(staff(s, command.department).length < EMPLOYEE_LIMIT, '人员岗位已满');
    const cost = recruitCost(command.department); bill(s, cost.gold, cost.tickets);
    const c = s.career, id = c.nextId++;
    c.seed = (Math.imul(c.seed, 1664525) + 1013904223) >>> 0;
    const seed = c.seed;
    const names = command.department === 'flight' ? ['林航','苏晴','陈翼','许岚','周远','陆星','唐云','沈宁'] : ['顾宁','叶舟','温岚','江禾','程远','夏青','许川','苏原'];
    const used = new Set(c.employees.map(e => e.name));
    const name = names.find(n => !used.has(n)) ?? `${names[(id - 1) % names.length]}${id.toString(36)}`;
    const e: Employee = { id, name, department: command.department, role: 'staff', planeId: null, airportId: null,
      paidUntil: s.simTime + CONTRACT_SECONDS, skill: command.department === 'flight' ? 0 : 1,
      management: 1 + seed % 3, potential: 8 + Math.floor(seed / 3) % 3,
      trait: command.department === 'flight' ? (seed % 2 ? 'mentor' : 'steady') : (['mentor','efficient','steady'] as const)[Math.floor(seed / 9) % 3]!, joinedAt: s.simTime,
      flights: 0, deliveries: 0, history: [] };
    remember(s, e, '入职，已含7个营业日工资'); c.employees.push(e);
    return `${roleName(e)}已入职，已含7天工资`;
  }
  const e = s.career.employees.find(e => e.id === command.employeeId);
  guard(e, '未找到人员');
  switch (command.type) {
    case 'org-assign': {
      guard(e.role === 'staff', '经理不能兼任执行岗位');
      guard(command.assetId === null || (typeof command.assetId === 'string' && command.assetId.length > 0), '无效岗位');
      guard(!employeeLock(s, e), employeeLock(s, e));
      if (e.department === 'flight') {
        if (command.assetId) {
          const next = parked(s, command.assetId);
          guard(!activePilots(s).some(other => other.id !== e.id && other.planeId === next.id), '飞机已有飞行员');
          next.dispatcher = true;
        }
        if (e.planeId && e.planeId !== command.assetId) parked(s, e.planeId).dispatcher = false;
        e.planeId = command.assetId;
      } else {
        if (command.assetId !== null) {
          guard(s.airports.some(a => a.id === command.assetId), '机场未开放');
          guard(!staff(s, 'ground').some(other => other.id !== e.id && other.airportId === command.assetId), '机场已有地勤专员');
        }
        e.airportId = command.assetId;
      }
      remember(s, e, command.assetId ? `岗位分配：${e.department === 'flight' ? command.assetId : airport(command.assetId).city}` : '解除岗位分配，转为待岗');
      return command.assetId ? `${roleName(e)}已上岗` : `${roleName(e)}已下岗`;
    }
    case 'org-renew': {
      const cost = renewalCost(e); bill(s, cost.gold, cost.tickets);
      e.paidUntil = Math.max(s.simTime, e.paidUntil) + CONTRACT_SECONDS;
      remember(s, e, '续付7个营业日工资'); return '已续付7天工资';
    }
    case 'org-train': {
      guard(command.ability === 'skill' || command.ability === 'management', '未知培养能力');
      guard(e[command.ability] < e.potential, '已达到成长潜力上限');
      const cost = trainingCost(e, command.ability); bill(s, cost.gold, cost.tickets); e[command.ability]++;
      remember(s, e, `${command.ability === 'skill' ? '专业' : '管理'}能力提升至${e[command.ability]}级`);
      return command.ability === 'skill' && e.department === 'flight' ? '调度技能提升，运输可获得额外公司经验' : '员工培养完成';
    }
    case 'org-appoint': {
      const reason = appointmentReason(s, e); guard(!reason, reason);
      bill(s, 1000, 2);
      const previous = manager(s, e.department);
      if (previous) { previous.role = 'staff'; remember(s, previous, '卸任经理，返回待分配人员'); }
      e.role = 'manager'; remember(s, e, `任命为${roleName(e)}`);
      return `${e.name}已任命为${roleName(e)}${previous ? `，${previous.name}转为待岗` : ''}`;
    }
    case 'org-demote': {
      guard(e.role === 'manager', '该员工不是经理');
      guard(staff(s, e.department).length < EMPLOYEE_LIMIT, '执行人员已满，请用另一员工接任以交换岗位');
      e.role = 'staff'; remember(s, e, '卸任经理，返回待分配人员'); return '已卸任经理，部门由玩家兼管';
    }
    default: throw new Error('未知组织命令');
  }
}
