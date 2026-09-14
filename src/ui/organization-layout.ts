import type { GameState } from '../core/game.js';
import { DEPARTMENTS, directReports, staffIn, type Department, type Employee } from '../core/organization.js';
export const ORG_NODE_WIDTH = 122, ORG_NODE_HEIGHT = 124;
export interface OrganizationNode { employee: Employee; x: number; y: number }
/** Siblings share a rank. Department headings and vacant jobs never become fictitious managers. */
export function organizationLayout(s: GameState, collapsed: Record<Department, boolean>, filter: Department | 'all' = 'all') {
  const departments = (['flight','ground'] as const).filter(d => filter === 'all' || d === filter);
  const width = departments.length * 456 + 32, founder = { x: (width - ORG_NODE_WIDTH) / 2, y: 8 };
  const nodes: OrganizationNode[] = [], edges: { path: string; direct: boolean }[] = [];
  const labels: { x: number; y: number; text: string }[] = [];
  const vacant: { department: Department; x: number; y: number }[] = [];
  const pending = s.career.employees.filter(e => e.role === 'specialist' && e.managerId === null && !e.planeId && !e.airportId && (filter === 'all' || e.department === filter));
  let bottom = 360;
  for (const [i, department] of departments.entries()) {
    const left = 32 + i * 456, center = left + 204, manager = staffIn(s, department, 'manager')[0];
    labels.push({ x: center, y: 149, text: DEPARTMENTS[department] });
    if (manager) {
      nodes.push({ employee: manager, x: center - ORG_NODE_WIDTH/2, y: 164 });
      edges.push({ path: `M${width/2} 132 V140 H${center} V164`, direct: false });
    } else vacant.push({ department, x: center - ORG_NODE_WIDTH/2, y: 164 });
    let y = 330;
    function row(people: Employee[], managed: boolean) {
      for (let offset=0; offset<people.length; offset+=3) {
        const siblings = people.slice(offset,offset+3);
        for (const [j,e] of siblings.entries()) {
          const x = center - (siblings.length*144-22)/2 + j*144;
          nodes.push({ employee:e, x, y });
          const lane = left-12;
          edges.push({ path: managed ? `M${center} 288 V304 H${lane} V${y-16} H${x+61} V${y}`
            : `M${width/2} 132 V140 H${lane-8} V${y-16} H${x+61} V${y}`, direct: !managed });
        }
        y+=152;
      }
    }
    if (!collapsed[department]) {
      if (manager) row(directReports(s,manager.id),true);
      const direct = staffIn(s,department).filter(e => e.managerId === null && (e.planeId || e.airportId));
      if (direct.length) { labels.push({ x:center,y:y-22,text:'玩家直管 · 无需经理' }); row(direct,false); }
      if (!manager && !direct.length) labels.push({ x:center,y:330,text:'可由玩家直接管理' });
    } else labels.push({ x:center,y:330,text:`已折叠 ${staffIn(s,department).length} 名员工` });
    bottom = Math.max(bottom,y+24);
  }
  return { nodes, edges, labels, vacant, pending, founder, width, height:bottom };
}
