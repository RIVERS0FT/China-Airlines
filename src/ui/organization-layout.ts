import type { GameState } from '../core/game.js';
import { DEPARTMENTS, directReports, staffIn, type Department, type Employee } from '../core/organization.js';
export const ORG_NODE_WIDTH = 144, ORG_NODE_HEIGHT = 76;
export interface OrganizationNode { employee: Employee; x: number; y: number }
/** Department headings group people visually; only persisted managerId creates a managerial link. */
export function organizationLayout(s: GameState, collapsed: Record<Department, boolean>) {
  const nodes: OrganizationNode[] = [], edges: { path: string; direct: boolean }[] = [];
  const labels: { x: number; y: number; text: string }[] = [];
  const vacant: { department: Department; x: number; y: number }[] = [];
  const pending = s.career.employees.filter(e => e.role === 'specialist' && e.managerId === null && !e.planeId && !e.airportId);
  let bottom = 260;
  for (const [i, department] of (['flight','ground'] as const).entries()) {
    const center = 180 + i * 340, x = center - ORG_NODE_WIDTH / 2;
    const manager = staffIn(s, department, 'manager')[0];
    labels.push({ x: center, y: 119, text: DEPARTMENTS[department] });
    edges.push({ path: `M350 88 V100 H${center} V142`, direct: false });
    if (manager) nodes.push({ employee: manager, x, y: 142 });
    else vacant.push({ department, x, y: 142 });
    let y = 250;
    if (!collapsed[department]) {
      if (manager) for (const e of directReports(s, manager.id)) {
        nodes.push({ employee: e, x: x + 26, y });
        edges.push({ path: `M${center} 218 V232 H${x + 10} V${y + 38} H${x + 26}`, direct: false });
        y += 92;
      }
      const direct = staffIn(s, department).filter(e => e.managerId === null && (e.planeId || e.airportId));
      if (direct.length) {
        labels.push({ x: center, y: y + 6, text: '玩家直管 · 无需经理' });
        y += 22;
        for (const e of direct) {
          nodes.push({ employee: e, x: x + 26, y });
          edges.push({ path: `M350 88 V96 H${x - 24} V${y + 38} H${x + 26}`, direct: true });
          y += 92;
        }
      }
      if (!manager && !direct.length) labels.push({ x: center, y: 258, text: '可由玩家直接管理' });
    } else labels.push({ x: center, y: 250, text: `已折叠 ${staffIn(s, department).length} 名员工` });
    bottom = Math.max(bottom, y + 24);
  }
  return { nodes, edges, labels, vacant, pending, width: 700, height: bottom };
}
