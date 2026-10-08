/** Headquarters posts share the employee roster and prepaid contract rules. */
export const SUPPORT_DEPARTMENTS = ['publicity', 'operations', 'engineering', 'cabin', 'cargo', 'hr', 'finance'] as const;
export type SupportDepartment = typeof SUPPORT_DEPARTMENTS[number];
export const OPERATING_DEPARTMENTS = ['flight', 'ground', ...SUPPORT_DEPARTMENTS] as const;
export const DEPARTMENT_CATALOG = {
  flight: { zh: '飞行部', en: 'Flight', specialist: '飞行员', specialistEn: 'Pilot' },
  ground: { zh: '地勤部', en: 'Ground', specialist: '地勤专员', specialistEn: 'Ground Specialist' },
  publicity: { zh: '宣传部', en: 'Publicity', specialist: '宣传专员', specialistEn: 'Publicity Specialist', cap: 30, effect: '机场推广费用', effectEn: 'Airport promotion cost' },
  operations: { zh: '运行控制部', en: 'Operations Control', specialist: '签派专员', specialistEn: 'Operations Dispatcher', cap: 25, effect: '地面周转时间', effectEn: 'Turnaround time' },
  engineering: { zh: '机务工程部', en: 'Engineering', specialist: '机务工程师', specialistEn: 'Maintenance Engineer', cap: 20, effect: '飞机改装费用', effectEn: 'Aircraft upgrade cost' },
  cabin: { zh: '客舱服务部', en: 'Cabin Services', specialist: '客舱乘务员', specialistEn: 'Cabin Crew', cap: 15, effect: '客运收入', effectEn: 'Passenger revenue' },
  cargo: { zh: '货运部', en: 'Cargo', specialist: '货运专员', specialistEn: 'Cargo Specialist', cap: 15, effect: '货运收入', effectEn: 'Cargo revenue' },
  hr: { zh: '人力资源部', en: 'Human Resources', specialist: '人事专员', specialistEn: 'HR Specialist', cap: 20, effect: '员工培训费用', effectEn: 'Employee training cost' },
  finance: { zh: '财务部', en: 'Finance', specialist: '财务专员', specialistEn: 'Finance Specialist', cap: 20, effect: '业务开设与扩建费用', effectEn: 'Business opening and expansion cost' },
} as const;
export const isSupportDepartment = (value: unknown): value is SupportDepartment =>
  SUPPORT_DEPARTMENTS.some(department => department === value);
