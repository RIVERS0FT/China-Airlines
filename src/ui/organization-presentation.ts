import type { Employee } from '../core/organization.js';

/** Keep legacy names byte-for-byte in saves while giving blank labels an identifiable UI fallback. */
export function employeeDisplayName(employee: Pick<Employee, 'id' | 'name'>): string {
  return employee.name.trim() ? employee.name : `员工 #${employee.id}`;
}
