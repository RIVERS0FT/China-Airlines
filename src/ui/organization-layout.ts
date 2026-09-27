import type { GameState } from '../core/game.js';
import { DEPARTMENTS, directReports, generalManager, staffIn, type Department, type Employee } from '../core/organization.js';
export const ORG_NODE_WIDTH = 122, ORG_NODE_HEIGHT = 124;
export interface OrganizationNode { employee: Employee; x: number; y: number }
/** Siblings share a rank. Department headings and vacant jobs never become fictitious managers. */
export function organizationLayout(s: GameState) {
  const departments = ['flight','ground'] as const;
  const width = departments.length * 456 + 32, executive = { x: (width - ORG_NODE_WIDTH) / 2, y: 8 };
  const nodes: OrganizationNode[] = [], edges: { path: string; direct: boolean }[] = [];
  const labels: { x: number; y: number; text: string }[] = [];
  const vacant: { department: Department; x: number; y: number }[] = [];
  const chief = generalManager(s);
  if (chief) nodes.push({ employee: chief, ...executive });
  else vacant.push({ department: 'company', ...executive });
  let bottom = 360;
  for (const [i, department] of departments.entries()) {
    const left = 32 + i * 456, center = left + 204, manager = staffIn(s, department, 'manager')[0];
    labels.push({ x: center, y: 149, text: DEPARTMENTS[department] });
    if (manager) {
      nodes.push({ employee: manager, x: center - ORG_NODE_WIDTH/2, y: 164 });
      if (chief && manager.managerId === chief.id) edges.push({ path: `M${width/2} 132 V140 H${center} V164`, direct: false });
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
            : `M${center} 150 H${lane-8} V${y-16} H${x+61} V${y}`, direct: !managed });
        }
        y+=152;
      }
    }
    if (manager) row(directReports(s,manager.id),true);
    const direct = staffIn(s,department).filter(e => e.managerId === null);
    if (direct.length) { labels.push({ x:center,y:y-22,text:'玩家直管 · 无需经理' }); row(direct,false); }
    bottom = Math.max(bottom,y+24);
  }
  return { nodes, edges, labels, vacant, width, height:bottom };
}
