import { POINT_GOLD } from './balance-policy.js';
import type { GameState } from './game.js';
import { bill, guard, isParked, parked } from './career.js';
import { ENERGY_SERVICE_SECONDS } from './energy.js';
import { DEPARTMENT_CATALOG, OPERATING_DEPARTMENTS, SUPPORT_DEPARTMENTS, isSupportDepartment, type SupportDepartment } from './departments.js';

export type Department = typeof OPERATING_DEPARTMENTS[number] | 'company' | 'business';
export type EmployeeRole = 'specialist' | 'manager';
export type Training = 'skill' | 'management';
export type HistoryKind = 'joined' | 'assigned' | 'reporting' | 'promoted' | 'demoted' | 'trained' | 'renewed' | 'flight';
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
export const DEPARTMENTS = { ...Object.fromEntries(OPERATING_DEPARTMENTS.map(d => [d, DEPARTMENT_CATALOG[d].zh])), company: '公司', business: '公司业务' } as Record<Department, string>;
export const EMPLOYEE_POSITIONS = [
  { department: 'flight', role: 'specialist' }, { department: 'ground', role: 'specialist' },
  { department: 'flight', role: 'manager' }, { department: 'ground', role: 'manager' },
  { department: 'company', role: 'manager' },
  ...SUPPORT_DEPARTMENTS.flatMap(department => [{ department, role: 'specialist' as const }, { department, role: 'manager' as const }]),
] as const satisfies readonly Pick<Employee, 'department' | 'role'>[];
export const isEmployeePosition = (department: unknown, role: unknown) =>
  (department === 'business' && (role === 'manager' || role === 'specialist')) ||
  EMPLOYEE_POSITIONS.some(position => position.department === department && position.role === role);
export const CONTRACT_SECONDS = 7 * 86400;
export const MAX_EMPLOYEES = 15 + SUPPORT_DEPARTMENTS.length * 3;
export const HISTORY_LIMIT = 20;
export const roleName = (e: Pick<Employee, 'department' | 'role'>) =>
  e.department === 'business' ? (e.role === 'manager' ? '业务主管' : '业务专员') : e.department === 'company' ? '总经理' : e.role === 'manager' ? `${DEPARTMENTS[e.department]}经理` : DEPARTMENT_CATALOG[e.department].specialist;
export const staffIn = (s: GameState, department: Department, role: EmployeeRole = 'specialist') =>
  s.career.employees.filter(e => e.department === department && e.role === role);
export const staffLimit = (department: Department, role: EmployeeRole) =>
  !isEmployeePosition(department, role) ? 0 : role === 'manager' ? 1 : department === 'flight' ? 8 : isSupportDepartment(department) ? 2 : 4;
/** A read-only preview shared by recruitment commands and candidate cards. */
export function recruitmentAssignment(s: GameState, position: Pick<Employee, 'department' | 'role'>, targetPlaneId?: string) {
  const assignment: { planeId: string | null; airportId: string | null; reason: string } = { planeId: null, airportId: null, reason: '' };
  if (staffIn(s, position.department, position.role).length >= staffLimit(position.department, position.role)) {
    assignment.reason = `${roleName(position)}岗位已满`;
  } else if (position.role === 'specialist' && position.department === 'flight') {
    assignment.planeId = s.fleet.find(p => (targetPlaneId === undefined || p.id === targetPlaneId) && isParked(s, p) &&
      !p.dispatcher && !s.career.employees.some(e => e.planeId === p.id))?.id ?? null;
    if (!assignment.planeId) assignment.reason = '没有可分配的空闲飞机';
  } else if (position.role === 'specialist' && position.department === 'ground') {
    assignment.airportId = s.airports.find(a => !s.career.employees.some(e => e.airportId === a.id))?.id ?? null;
    if (!assignment.airportId) assignment.reason = '没有空缺地勤岗位的机场';
  }
  return assignment;
}
export const generalManager = (s: GameState) => staffIn(s, 'company', 'manager')[0];
/** Only department managers report across departments, and only to the general manager. */
export const canReportTo = (employee: Pick<Employee, 'id' | 'department' | 'role'>, manager: Pick<Employee, 'id' | 'department' | 'role'>) =>
  employee.id !== manager.id && employee.department !== 'company' && manager.role === 'manager' &&
  (employee.role === 'manager' ? manager.department === 'company' : manager.department === employee.department);
export const managerCapacity = (e: Employee) => 2 + Math.floor(e.management / 2) + (e.trait === 'efficient' ? 1 : 0);
export const directReports = (s: GameState, id: number) => s.career.employees.filter(e => e.managerId === id).sort((a, b) => a.id - b.id);
export function effectiveManager(s: GameState, e: Employee) {
  if (e.role !== 'specialist') return undefined;
  const manager = s.career.employees.find(m => m.id === e.managerId);
  return manager && manager.role === 'manager' && manager.department === e.department && manager.paidUntil > s.simTime &&
    directReports(s, manager.id).slice(0, managerCapacity(manager)).some(member => member.id === e.id) ? manager : undefined;
}
/** Contract and reporting coverage are evaluated at the time of a new quote. */
export function departmentEffect(s: GameState, department: SupportDepartment) {
  const people = staffIn(s, department).filter(e => e.paidUntil > s.simTime);
  const points = people.reduce((sum, e) => sum + 2 + e.skill * 2 + (e.trait === 'efficient' ? 2 : 0) + (effectiveManager(s, e)?.management ?? 0), 0);
  return Math.min(DEPARTMENT_CATALOG[department].cap, points);
}
export const departmentPrice = (s: GameState, department: SupportDepartment, base: number) =>
  Math.ceil(base * (100 - departmentEffect(s, department)) / 100);
export const promotionPrice = (s: GameState) => departmentPrice(s, 'publicity', 500);
export const turnaroundSeconds = (s: GameState) => Math.round(8 * (100 - departmentEffect(s, 'operations'))) / 100;
export const employmentPrice = (e: Pick<Employee, 'department' | 'role'>, recruit = false) => {
  const gold = e.role === 'manager' ? 800 : e.department === 'flight' ? 600 : 400;
  const surcharge = (e.role === 'manager' ? 2 : e.department === 'flight' ? 2 : 1) * POINT_GOLD;
  return { gold: gold * (recruit ? 3 : 1) + surcharge + (recruit ? (e.role === 'manager' ? 2 : 1) * POINT_GOLD : 0) };
};
export function trainingQuote(s: GameState, e: Employee, training: Training) {
  const m = training === 'skill' ? effectiveManager(s, e) : undefined;
  const mentoring = m ? Math.min(20, m.management * 2 + (m.trait === 'mentor' ? 5 : 0)) : 0;
  const discount = Math.min(35, mentoring + departmentEffect(s, 'hr'));
  const base = (training === 'skill' ? 400 : 300) * (e[training] + 1);
  return { gold: Math.ceil(base * (100 - discount) / 100) + (training === 'skill' ? 3 : 2) * POINT_GOLD, discount, maximum: e[training] >= e.potential };
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
const employeeById = (s: GameState, id: number) => {
  const e = s.career.employees.find(e => e.id === id); guard(e, '未找到员工'); return e;
};
function room(s: GameState, department: Department, role: EmployeeRole) {
  guard(staffIn(s, department, role).length < staffLimit(department, role), `${roleName({ department, role })}岗位已满`);
}
function appointToGeneralManager(s: GameState, employee: Employee) {
  const manager = generalManager(s);
  if (!manager || employee.department === 'company' || employee.role !== 'manager' || employee.managerId === manager.id) return;
  employee.managerId = manager.id;
  employeeHistory(s, employee, 'reporting', '任命为总经理直属部门经理');
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
export function organizationExecute(s: GameState, command: OrganizationCommand, targetPlaneId?: string): string {
  if (command.type === 'recruit-employee') guard(command.department !== 'business', '请从业务团队招募员工');
  else guard(s.career.employees.find(e => e.id === command.employeeId)?.department !== 'business', '请使用业务团队的培养与管理操作');
  switch (command.type) {
    case 'recruit-employee': {
      guard(isEmployeePosition(command.department, command.role), '未知员工岗位');
      const assignment = recruitmentAssignment(s, command, targetPlaneId);
      guard(!assignment.reason, assignment.reason);
      guard(s.career.nextId < 1e12 && s.simTime + CONTRACT_SECONDS <= 1e12, '人员编号或合同期限超过存档范围');
      const cost = employmentPrice(command, true); bill(s, cost.gold);
      const id = s.career.nextId++;
      s.career.seed = (Math.imul(s.career.seed, 1664525) + 1013904223) >>> 0;
      const names = command.department === 'company' ? ['沈远', '程宁', '顾承']
        : command.department === 'flight' ? ['林航', '苏晴', '陈翼', '许岚', '周远', '陆星', '唐云', '沈宁'] : ['顾川', '叶宁', '孟青', '乔安'];
      const used = s.career.employees.filter(e => e.department === command.department).length;
      const baseName = names[used % names.length]!;
      const name = s.career.employees.some(e => e.name === baseName) ? `${baseName}${id.toString(36)}` : baseName;
      const e: Employee = { id, name, planeId: null, paidUntil: s.simTime + CONTRACT_SECONDS,
        skill: command.role === 'manager' ? 2 : command.department === 'flight' ? 0 : 1,
        department: command.department, role: command.role, managerId: null, airportId: null,
        management: command.role === 'manager' ? 1 : 0, potential: 6 + s.career.seed % 5,
        trait: (s.career.seed >>> 8) % 2 ? 'mentor' : 'efficient', joinedAt: s.simTime, flights: 0, deliveries: 0, history: [] };
      employeeHistory(s, e, 'joined', `以${roleName(e)}身份入职，包含7天合同`);
      s.career.employees.push(e);
      if (assignment.planeId) assignPilot(s, e.id, assignment.planeId);
      if (assignment.airportId) organizationExecute(s, { type: 'assign-ground', employeeId: e.id, airportId: assignment.airportId });
      if (e.role === 'specialist') {
        const manager = staffIn(s, e.department, 'manager')[0];
        if (manager) organizationExecute(s, { type: 'report-to', employeeId: e.id, managerId: manager.id });
      }
      if (e.department === 'company') {
        for (const member of s.career.employees) appointToGeneralManager(s, member);
      } else appointToGeneralManager(s, e);
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
      guard(e.department !== 'company', '总经理直接向玩家汇报');
      if (command.managerId !== null) {
        const manager = employeeById(s, command.managerId);
        guard(canReportTo(e, manager), e.role === 'manager' ? '部门经理只能向总经理或玩家汇报' : '请选择本部门经理，不能循环汇报');
      }
      if (e.managerId === command.managerId) return '汇报关系未改变';
      e.managerId = command.managerId;
      employeeHistory(s, e, 'reporting', command.managerId === null ? '改为直接向玩家汇报' : `向${employeeById(s, command.managerId).name}汇报`);
      return '汇报关系已更新；超出管理容量的员工保留基础运营';
    }
    case 'employee-role': {
      const e = employeeById(s, command.employeeId);
      guard(e.department !== 'company', '总经理不支持内部转任');
      guard(isEmployeePosition(e.department, command.role), '未知员工岗位');
      guard(command.role !== e.role, '员工已在此岗位'); room(s, e.department, command.role);
      if (command.role === 'manager') {
        guard(e.skill >= 2 && e.management >= 1, '晋升需要专业2级、管理1级');
        if (e.planeId) assignPilot(s, e.id, null);
        e.airportId = null; e.managerId = null;
      } else {
        e.managerId = null;
        for (const member of directReports(s, e.id)) {
          member.managerId = null; employeeHistory(s, member, 'reporting', '原经理转任，改为向玩家汇报');
        }
      }
      e.role = command.role;
      employeeHistory(s, e, command.role === 'manager' ? 'promoted' : 'demoted', `转任${roleName(e)}，原合同期限保留`);
      if (e.role === 'manager') appointToGeneralManager(s, e);
      return '员工岗位已调整，现有合同不补扣费用';
    }
    case 'train-employee': {
      const e = employeeById(s, command.employeeId);
      guard(['skill', 'management'].includes(command.training), '未知培训类型');
      const cost = trainingQuote(s, e, command.training);
      guard(!cost.maximum, '已达到成长潜力上限'); bill(s, cost.gold);
      e[command.training]++;
      employeeHistory(s, e, 'trained', `${command.training === 'skill' ? '专业' : '管理'}能力升至${e[command.training]}级${cost.discount ? `，培训节省${cost.discount}%金币` : ''}`);
      return '培训完成；已开始的补能不受影响';
    }
    case 'renew-employee': {
      const e = employeeById(s, command.employeeId), cost = employmentPrice(e);
      const until = Math.max(s.simTime, e.paidUntil) + CONTRACT_SECONDS;
      guard(until <= 1e12, '合同期限超过存档范围'); bill(s, cost.gold);
      e.paidUntil = until; employeeHistory(s, e, 'renewed', '续付7天工资');
      return '已续付7天工资';
    }
  }
}
