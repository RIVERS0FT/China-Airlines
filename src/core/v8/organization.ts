import type { GameState } from './game.js';
import { bill, guard, parked } from './career.js';
import { ENERGY_SERVICE_SECONDS } from './energy.js';

export type Department = 'flight' | 'ground';
export type EmployeeRole = 'specialist' | 'manager';
export type Training = 'skill' | 'management';
export type HistoryKind = 'joined' | 'migrated' | 'assigned' | 'reporting' | 'promoted' | 'demoted' | 'trained' | 'renewed' | 'flight';
export interface Employee {
  id: number; name: string; planeId: string | null; paidUntil: number; skill: number;
  department: Department; role: EmployeeRole; managerId: number | null; airportId: string | null;
  management: number; potential: number; trait: 'mentor' | 'efficient'; joinedAt: number | null;
  flights: number; deliveries: number; history: { at: number; kind: HistoryKind; text: string }[];
}
export type OrganizationCommand =
  | { type: 'recruit-employee'; department: Department; role: EmployeeRole }
  | { type: 'assign-ground'; employeeId: number; airportId: string | null }
  | { type: 'report-to'; employeeId: number; managerId: number | null }
  | { type: 'employee-role'; employeeId: number; role: EmployeeRole }
  | { type: 'train-employee'; employeeId: number; training: Training }
  | { type: 'renew-employee'; employeeId: number };
export const DEPARTMENTS: Record<Department, string> = { flight: '飞行部', ground: '地勤部' };
export const CONTRACT_SECONDS = 7 * 86400;
export const MAX_EMPLOYEES = 14;
export const HISTORY_LIMIT = 20;
export const roleName = (e: Pick<Employee, 'department' | 'role'>) =>
  e.role === 'manager' ? `${DEPARTMENTS[e.department]}经理` : e.department === 'flight' ? '飞行员' : '地勤专员';
export const staffIn = (s: GameState, department: Department, role: EmployeeRole = 'specialist') =>
  s.career.employees.filter(e => e.department === department && e.role === role);
export const staffLimit = (department: Department, role: EmployeeRole) => role === 'manager' ? 1 : department === 'flight' ? 8 : 4;
export const managerCapacity = (e: Employee) => 2 + Math.floor(e.management / 2) + (e.trait === 'efficient' ? 1 : 0);
export const directReports = (s: GameState, id: number) => s.career.employees.filter(e => e.managerId === id).sort((a, b) => a.id - b.id);
export function effectiveManager(s: GameState, e: Employee) {
  const manager = s.career.employees.find(m => m.id === e.managerId);
  return manager && manager.role === 'manager' && manager.department === e.department && manager.paidUntil > s.simTime &&
    directReports(s, manager.id).slice(0, managerCapacity(manager)).some(member => member.id === e.id) ? manager : undefined;
}
export const employmentPrice = (e: Pick<Employee, 'department' | 'role'>, recruit = false) => {
  const gold = e.role === 'manager' ? 800 : e.department === 'flight' ? 600 : 400;
  const tickets = e.role === 'manager' ? 2 : e.department === 'flight' ? 2 : 1;
  return { gold: gold * (recruit ? 3 : 1), tickets: recruit ? tickets + (e.role === 'manager' ? 2 : 1) : tickets };
};
export function trainingQuote(s: GameState, e: Employee, training: Training) {
  const m = training === 'skill' ? effectiveManager(s, e) : undefined;
  const discount = m ? Math.min(20, m.management * 2 + (m.trait === 'mentor' ? 5 : 0)) : 0;
  const base = (training === 'skill' ? 400 : 300) * (e[training] + 1);
  return { gold: Math.ceil(base * (100 - discount) / 100), tickets: training === 'skill' ? 3 : 2, discount, maximum: e[training] >= e.potential };
}
/** A read-only quote. Only the command starting service persists the resulting deadline. */
export function groundServiceQuote(s: GameState, airportId: string) {
  const employee = s.career.employees.find(e => e.department === 'ground' && e.role === 'specialist' && e.airportId === airportId && e.paidUntil > s.simTime);
  const manager = employee ? effectiveManager(s, employee) : undefined;
  const reduction = employee ? Math.min(30, employee.skill * 2 + (employee.trait === 'efficient' ? 5 : 0) + (manager?.management ?? 0)) : 0;
  return { seconds: Math.ceil(ENERGY_SERVICE_SECONDS * (100 - reduction) / 100), reduction, employee };
}
export function employeeHistory(s: GameState, e: Employee, kind: HistoryKind, text: string) {
  e.history.unshift({ at: s.simTime, kind, text });
  e.history.length = Math.min(e.history.length, HISTORY_LIMIT);
}
/** Old records keep their identity and purchased skills; unavailable history stays explicitly unknown. */
export function migrateEmployee(p: Pick<Employee, 'id' | 'name' | 'planeId' | 'paidUntil' | 'skill'>, at: number): Employee {
  return { ...p, department: 'flight', role: 'specialist', managerId: null, airportId: null, management: 0,
    potential: 10, trait: p.id % 2 ? 'mentor' : 'efficient', joinedAt: null, flights: 0, deliveries: 0,
    history: [{ at, kind: 'migrated', text: '继承历史飞行员；此前入职时间与个人业绩未记录' }] };
}
const employeeById = (s: GameState, id: number) => {
  const e = s.career.employees.find(e => e.id === id); guard(e, '未找到员工'); return e;
};
function room(s: GameState, department: Department, role: EmployeeRole) {
  guard(staffIn(s, department, role).length < staffLimit(department, role), `${DEPARTMENTS[department]}${role === 'manager' ? '经理' : '人员'}岗位已满`);
}
export function assignPilot(s: GameState, id: number, planeId: string | null) {
  const e = employeeById(s, id);
  guard(e.department === 'flight' && e.role === 'specialist', '只有飞行员可以分配飞机');
  const previous = e.planeId ? parked(s, e.planeId) : null;
  const next = planeId !== null ? parked(s, planeId) : null;
  guard(!next || !s.career.employees.some(other => other.id !== id && other.planeId === next.id), '飞机已有飞行员');
  if (e.planeId === planeId) return '岗位未改变';
  if (previous) previous.dispatcher = false;
  if (next) next.dispatcher = true;
  e.planeId = planeId;
  employeeHistory(s, e, 'assigned', planeId ? `分配飞机 ${planeId}` : '解除飞机分配，转为待分配');
  return planeId ? '飞行员已上岗' : '飞行员已下岗';
}
export function organizationExecute(s: GameState, command: OrganizationCommand): string {
  switch (command.type) {
    case 'recruit-employee': {
      guard(['flight', 'ground'].includes(command.department) && ['specialist', 'manager'].includes(command.role), '未知员工岗位');
      room(s, command.department, command.role);
      guard(s.career.nextId < 1e12 && s.simTime + CONTRACT_SECONDS <= 1e12, '人员编号或合同期限超过存档范围');
      const cost = employmentPrice(command, true); bill(s, cost.gold, cost.tickets);
      const id = s.career.nextId++;
      s.career.seed = (Math.imul(s.career.seed, 1664525) + 1013904223) >>> 0;
      const names = command.department === 'flight' ? ['林航', '苏晴', '陈翼', '许岚', '周远', '陆星', '唐云', '沈宁'] : ['顾川', '叶宁', '孟青', '乔安'];
      const used = s.career.employees.filter(e => e.department === command.department).length;
      const baseName = names[used % names.length]!;
      const name = s.career.employees.some(e => e.name === baseName) ? `${baseName}${id.toString(36)}` : baseName;
      const e: Employee = { id, name, planeId: null, paidUntil: s.simTime + CONTRACT_SECONDS,
        skill: command.role === 'manager' ? 2 : command.department === 'ground' ? 1 : 0,
        department: command.department, role: command.role, managerId: null, airportId: null,
        management: command.role === 'manager' ? 1 : 0, potential: 6 + s.career.seed % 5,
        trait: (s.career.seed >>> 8) % 2 ? 'mentor' : 'efficient', joinedAt: s.simTime, flights: 0, deliveries: 0, history: [] };
      employeeHistory(s, e, 'joined', `以${roleName(e)}身份入职，包含7天合同`);
      s.career.employees.push(e);
      return `${roleName(e)}已入职，已含7天工资`;
    }
    case 'assign-ground': {
      const e = employeeById(s, command.employeeId);
      guard(e.department === 'ground' && e.role === 'specialist', '只有地勤专员可以分配机场');
      guard(command.airportId === null || s.airports.some(a => a.id === command.airportId), '机场尚未开放');
      guard(command.airportId === null || !s.career.employees.some(other => other.id !== e.id && other.airportId === command.airportId), '该机场已有地勤专员');
      if (e.airportId === command.airportId) return '岗位未改变';
      e.airportId = command.airportId;
      employeeHistory(s, e, 'assigned', e.airportId ? `负责机场 ${e.airportId}；仅影响后续补能` : '解除机场分配，转为待分配');
      return '地勤岗位已更新，已开始的补能不变';
    }
    case 'report-to': {
      const e = employeeById(s, command.employeeId);
      guard(e.role === 'specialist', '经理直接向玩家汇报');
      if (command.managerId !== null) {
        const manager = employeeById(s, command.managerId);
        guard(manager.id !== e.id && manager.role === 'manager' && manager.department === e.department, '请选择本部门经理，不能循环汇报');
      }
      if (e.managerId === command.managerId) return '汇报关系未改变';
      e.managerId = command.managerId;
      employeeHistory(s, e, 'reporting', command.managerId === null ? '改为直接向玩家汇报' : `向${employeeById(s, command.managerId).name}汇报`);
      return '汇报关系已更新；超出管理容量的员工保留基础运营';
    }
    case 'employee-role': {
      const e = employeeById(s, command.employeeId);
      guard(['specialist', 'manager'].includes(command.role), '未知员工岗位');
      guard(command.role !== e.role, '员工已在此岗位'); room(s, e.department, command.role);
      if (command.role === 'manager') {
        guard(e.skill >= 2 && e.management >= 1, '晋升需要专业2级、管理1级');
        if (e.planeId) assignPilot(s, e.id, null);
        e.airportId = null; e.managerId = null;
      } else {
        for (const member of directReports(s, e.id)) {
          member.managerId = null; employeeHistory(s, member, 'reporting', '原经理转任，改为向玩家汇报');
        }
      }
      e.role = command.role;
      employeeHistory(s, e, command.role === 'manager' ? 'promoted' : 'demoted', `转任${roleName(e)}，原合同期限保留`);
      return '员工岗位已调整，现有合同不补扣费用';
    }
    case 'train-employee': {
      const e = employeeById(s, command.employeeId);
      guard(['skill', 'management'].includes(command.training), '未知培训类型');
      const cost = trainingQuote(s, e, command.training);
      guard(!cost.maximum, '已达到成长潜力上限'); bill(s, cost.gold, cost.tickets);
      e[command.training]++;
      employeeHistory(s, e, 'trained', `${command.training === 'skill' ? '专业' : '管理'}能力升至${e[command.training]}级${cost.discount ? `，经理培养节省${cost.discount}%金币` : ''}`);
      return '培训完成；已开始的补能不受影响';
    }
    case 'renew-employee': {
      const e = employeeById(s, command.employeeId), cost = employmentPrice(e);
      const until = Math.max(s.simTime, e.paidUntil) + CONTRACT_SECONDS;
      guard(until <= 1e12, '合同期限超过存档范围'); bill(s, cost.gold, cost.tickets);
      e.paidUntil = until; employeeHistory(s, e, 'renewed', '续付7天工资');
      return '已续付7天工资';
    }
  }
}
