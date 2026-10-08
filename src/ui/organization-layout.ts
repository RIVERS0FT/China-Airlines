import type { GameState } from '../core/game.js';
import { airport } from '../core/catalog.js';
import { BUSINESS_CATALOG, businessWorkers } from '../core/company-business.js';
import { DEPARTMENTS, directReports, generalManager, staffIn, type Department, type Employee } from '../core/organization.js';
import { OPERATING_DEPARTMENTS } from '../core/departments.js';
export const ORG_NODE_WIDTH = 122, ORG_NODE_HEIGHT = 124;
export interface OrganizationNode { employee: Employee; x: number; y: number }
/** Current reporting links only. Business groups retain insertion order as they grow. */
export function organizationLayout(s: GameState, collapsed: ReadonlySet<number> = new Set(), departments: readonly Department[] = OPERATING_DEPARTMENTS, showBusiness = true) {
  const teams = showBusiness ? s.business.teams : [];
  const width = Math.max(1, departments.length + teams.length) * 456 + 32;
  const executive = { x: (width - ORG_NODE_WIDTH) / 2, y: 8 };
  const nodes: OrganizationNode[] = [], edges: { path: string; direct: boolean }[] = [];
  const labels: { x: number; y: number; text: string; airportId?: string; businessName?: string }[] = [];
  const vacant: { department: Department; x: number; y: number }[] = [];
  const businessGroups: { teamId: number; managerId: number; x: number; y: number; collapsed: boolean }[] = [];
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
          const x = center - (siblings.length*144-22)/2 + j*144, lane = left-12;
          nodes.push({ employee:e, x, y });
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
  for (const [i, team] of teams.entries()) {
    const left = 32 + (i + departments.length) * 456, center = left + 204, manager = s.career.employees.find(e => e.id === team.managerId)!;
    labels.push({ x: center, y: 149, text: `${airport(team.airportId).city} · ${BUSINESS_CATALOG[team.kind].zh}`, airportId: team.airportId, businessName: BUSINESS_CATALOG[team.kind].en });
    nodes.push({ employee: manager, x: center - ORG_NODE_WIDTH/2, y: 164 });
    if (chief && manager.managerId === chief.id) edges.push({ path: `M${width/2} 132 V140 H${center} V164`, direct: false });
    businessGroups.push({ teamId: team.id, managerId: manager.id, x: center - 86, y: 292, collapsed: collapsed.has(team.id) });
    let y = 338;
    if (!collapsed.has(team.id)) {
      const workers = businessWorkers(s, team);
      for (let offset = 0; offset < workers.length; offset += 3) {
        const siblings = workers.slice(offset, offset + 3);
        for (const [j, employee] of siblings.entries()) {
          // Fixed columns avoid moving existing people when a sibling is recruited.
          const x = left + j * 144;
          nodes.push({ employee, x, y });
          edges.push({ path: `M${center} 288 V324 H${left-12} V${y-10} H${x+61} V${y}`, direct: false });
        }
        y += 152;
      }
    }
    bottom = Math.max(bottom, y + 24);
  }
  return { nodes, edges, labels, vacant, businessGroups, width, height:bottom };
}
