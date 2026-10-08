import { useEffect, useRef, useState } from 'react';
import { businessIncomeQuote, businessTeamQuote, BUSINESS_CATALOG, employeeCapacity, employeeTeam } from '../core/company-business.js';
import { BusinessOpening, BusinessEmployeeDetail, businessRate } from './BusinessControls.js';
import type { Command, GameState } from '../core/game.js';
import { aircraftSpecs, airport } from '../core/catalog.js';
import { nextTalentRefreshAt, talentBatchSize } from '../core/talent.js';
import { careerLevel } from '../core/career.js';
import {
  directReports, effectiveManager, employmentPrice, groundServiceQuote, managerCapacity, EMPLOYEE_POSITIONS,
  recruitmentAssignment, staffIn, staffLimit, trainingQuote, type Employee,
} from '../core/organization.js';
import { controller, useGame } from '../runtime.js';
import { ignore } from './Panels.js';
import { organizationLayout, ORG_NODE_HEIGHT, ORG_NODE_WIDTH } from './organization-layout.js';
import { OrganizationTree } from './OrganizationTree.js';
import { employeeDisplayName } from './organization-presentation.js';
import { useI18n } from '../i18n/I18n.js';
import { DEPARTMENT_CATALOG, OPERATING_DEPARTMENTS, isSupportDepartment } from '../core/departments.js';
import { departmentEffect, roleName, type Department } from '../core/organization.js';
import { EmployeePortrait } from './EmployeePortrait.js';
import './organization.css';

type DetailTab = 'assignment' | 'training' | 'history';
function roleLabel(e: Pick<Employee,'department'|'role'>, en: boolean) {
  if (!en) return roleName(e);
  if (e.department === 'business') return e.role === 'manager' ? 'Business Leader' : 'Business Worker';
  if (e.department === 'company') return 'General Manager';
  const spec = DEPARTMENT_CATALOG[e.department];
  return e.role === 'manager' ? `${spec.en} Manager` : spec.specialistEn;
}
function effectLabel(game: GameState, department: Department, en: boolean) {
  if (!isSupportDepartment(department)) return '';
  const spec = DEPARTMENT_CATALOG[department], sign = department === 'cabin' || department === 'cargo' ? '+' : '−';
  return `${en ? spec.effectEn : spec.effect} ${sign}${departmentEffect(game, department)}%`;
}
function assignmentReason(s: GameState, e: Employee) {
  const p=s.fleet.find(p=>p.id===e.planeId);
  return Boolean(p&&(p.flight||p.autoRouteId||p.itinerary.length||p.energy.serviceUntil!==null||p.readyAt>s.simTime));
}
export function CompanyOrganization({ game, busy, onPlane, onAirport, initialEmployeeId }: {
  game: GameState; busy: boolean; onPlane?: (id: string) => void; onAirport?: (id: string) => void;
  initialEmployeeId?: number | null;
}) {
  const { locale, airportName, text }=useI18n(), en=locale==='en-US', view=useGame();
  const say=(zh:string,english:string)=>en?english:zh;
  const people=game.career.employees;
  const [selectedId,setSelectedId]=useState<number|null>(initialEmployeeId??null);
  const [tab,setTab]=useState<DetailTab>('assignment');
  const [recruiting,setRecruiting]=useState(false);
  const [departmentView,setDepartmentView]=useState<Department|'transport'|'all'>('transport');
  const [marketDepartment,setMarketDepartment]=useState<Department|'all'>('all');
  const [opening,setOpening]=useState(false);
  const [collapsed,setCollapsed]=useState<Set<number>>(()=>new Set());
  const [marketPosition,setMarketPosition]=useState<string|null>(null);
  const market=useRef<HTMLDivElement>(null), previousCount=useRef(people.length);
  const selected=people.find(e=>e.id===selectedId);
  const visibleDepartments=departmentView==='all'?OPERATING_DEPARTMENTS:departmentView==='transport'?['flight','ground'] as const:[departmentView];
  const layout=organizationLayout(game,collapsed,visibleDepartments,departmentView==='all'||departmentView==='transport'), income=businessIncomeQuote(game);
  const refreshAt=nextTalentRefreshAt(game), refreshSeconds=Math.max(0,Math.ceil(refreshAt-game.simTime));
  const refreshCountdown=`${Math.floor(refreshSeconds/60).toString().padStart(2,'0')}:${(refreshSeconds%60).toString().padStart(2,'0')}`;
  const marketCandidates=game.talent.candidates.filter(c=>marketDepartment==='all'||c.department===marketDepartment);
  const marketPositions=EMPLOYEE_POSITIONS.filter(p=>marketCandidates.some(c=>c.department===p.department&&c.role===p.role));
  const send=(command:Command)=>ignore(controller.command(command));
  const afford=(cost:{gold:number})=>game.credits>=cost.gold;
  const name=(e:Employee)=>e.name.trim()?e.name:(en?`Employee #${e.id}`:employeeDisplayName(e));
  function select(id:number) { setSelectedId(id);setTab('assignment');setRecruiting(false);setOpening(false); }
  useEffect(()=>{
    const panel=market.current;
    if(!recruiting||!marketPosition||!panel)return;
    const card=panel.querySelector<HTMLElement>(`[data-talent-position="${marketPosition}"] [data-candidate-id]`);
    if(card){card.focus({preventScroll:true});card.scrollIntoView({block:'nearest'});}
  },[recruiting,marketPosition]);
  useEffect(()=>{ if(initialEmployeeId!=null) {setSelectedId(initialEmployeeId);setTab('assignment');setRecruiting(false);} },[initialEmployeeId]);
  useEffect(()=>{
    if(people.length>previousCount.current) {const department=people.at(-1)!.department;if(isSupportDepartment(department))setDepartmentView(department);setSelectedId(people.at(-1)!.id);setTab('assignment');setRecruiting(false);setOpening(false);}
    previousCount.current=people.length;
  },[people]);
  function status(e:Employee) {
    if(e.department==='business'){const team=employeeTeam(game,e)!;const q=businessTeamQuote(game,team),spec=BUSINESS_CATALOG[team.kind];const net=e.role==='manager'?q.net:Math.floor(spec.gross*(100+10*(e.skill-1)+q.bonus)/100)-spec.wage;return `+${businessRate(net)} ${say('金币/秒','coins/s')}`;}
    if(e.paidUntil<=game.simTime)return say('待续约','Renewal due');
    if(e.role==='manager')return say(`管理 ${directReports(game,e.id).length}/${e.department==='company'?OPERATING_DEPARTMENTS.length+game.business.teams.length:managerCapacity(e)}`,`Team ${directReports(game,e.id).length}/${e.department==='company'?OPERATING_DEPARTMENTS.length+game.business.teams.length:managerCapacity(e)}`);
    if(e.planeId)return game.fleet.find(p=>p.id===e.planeId)?.flight?say('执勤中','On duty'):say('已上岗','Assigned');
    if(e.airportId)return `${airportName(e.airportId,airport(e.airportId).city)} · ${say('已上岗','Assigned')}`;
    return isSupportDepartment(e.department)?say('在岗','On duty'):say('待分配','Unassigned');
  }
  const node=(e:Employee)=><button type="button" key={e.id} className="org-person" data-employee-id={e.id} data-department={e.department}
    data-state={e.department==='business'?'active':e.paidUntil<=game.simTime?'expired':e.role==='specialist'&&!isSupportDepartment(e.department)&&!e.planeId&&!e.airportId?'waiting':'active'}
    aria-label={say(`查看${name(e)} · ${roleLabel(e,false)}`,`View ${name(e)} · ${roleLabel(e,true)}`)} aria-pressed={selectedId===e.id} onClick={()=>select(e.id)}>
    <span className="org-portrait-ring"><EmployeePortrait id={e.id} department={e.department}/></span>
    <strong>{name(e)}</strong><small>{roleLabel(e,en)}</small><em>{status(e)}</em>
  </button>;
  return <section className="company-organization" aria-label={say('公司组织管理','Company Organization Management')}>
    <div className="org-toolbar">
      <span className="org-inline-summary">{say('员工','Staff')} <b>{people.length}/{employeeCapacity(game)}</b> · {say('待续约','Renewals')} <b>{people.filter(e=>e.department!=='business'&&e.paidUntil<=game.simTime).length}</b></span>
      <span className="org-income" data-testid="business-net-income" title={say(`累计业务净收入 ${game.business.earned}金币`,`Business net earned: ${game.business.earned} coins`)}>+{businessRate(income.net)} {say("金币/秒","coins/s")}</span>
      <div className="org-heading-actions">
        <button type="button" aria-expanded={opening} onClick={()=>{setOpening(!opening);setRecruiting(false);}}>{say("扩张业务","Expand Business")}</button>
        <button className="org-primary" aria-expanded={recruiting} onClick={()=>{setOpening(false);setMarketPosition(null);setMarketDepartment('all');setRecruiting(!recruiting);}}>{say('人才市场','Talent Market')}</button>
      </div>
    </div>
    {!recruiting&&!opening&&<div className="org-department-bar">
      <label>{say('部门视图','Department view')}<select aria-label={say('部门视图','Department view')} value={departmentView} onChange={event=>{setDepartmentView(event.target.value as typeof departmentView);setSelectedId(null);}}>
        <option value="transport">{say('飞行、地勤与城市业务','Flight, ground and city business')}</option>
        <option value="all">{say('全部9个部门','All 9 departments')}</option>
        {OPERATING_DEPARTMENTS.map(d=><option key={d} value={d}>{en?DEPARTMENT_CATALOG[d].en:DEPARTMENT_CATALOG[d].zh} · {staffIn(game,d).length+staffIn(game,d,'manager').length}/{staffLimit(d,'specialist')+1}</option>)}
      </select></label>
      {isSupportDepartment(departmentView)&&<strong data-testid="department-effect">{effectLabel(game,departmentView,en)}</strong>}
    </div>}
    {view.error&&<p className="org-warning" role="alert">{text(view.error)}</p>}
    {opening?<BusinessOpening game={game} busy={busy} send={send} close={()=>setOpening(false)}/>:recruiting?<div ref={market} className="org-panel"><header><h3>{say('人才市场','Talent Market')}</h3><button onClick={()=>setRecruiting(false)}>{say('返回组织树','Back to organization')}</button></header>
      <section className="org-recruit" aria-label={say('人才市场','Talent Market')}>
        <div className="talent-market-refresh"><span>{say('下次更新','Next refresh')}</span><strong data-testid="talent-refresh-countdown" data-next-refresh-at={refreshAt}>{refreshCountdown}</strong><small>{say('每5分钟更新一批候选人','New candidates every 5 minutes')}</small></div>
        <p data-testid="talent-batch-summary">{say(`公司 Lv.${careerLevel(game)} · 本批剩余 ${game.talent.candidates.length}/${talentBatchSize(game.talent.batchLevel)} 名 · 下批 ${talentBatchSize(careerLevel(game))} 名`,`Company Lv.${careerLevel(game)} · ${game.talent.candidates.length}/${talentBatchSize(game.talent.batchLevel)} candidates left · Next batch: ${talentBatchSize(careerLevel(game))}`)}</p>
        <p>{say('招募后自动上岗；没有可用岗位时无法招募。','New hires are assigned automatically. An available position is required.')}</p>
        <label>{say('招聘部门','Recruiting department')}<select aria-label={say('招聘部门','Recruiting department')} value={marketDepartment} onChange={event=>{setMarketPosition(null);setMarketDepartment(event.target.value as typeof marketDepartment);}}>
          <option value="all">{say('全部岗位','All positions')}</option><option value="company">{say('总经理','General Manager')}</option>
          {OPERATING_DEPARTMENTS.map(d=><option key={d} value={d}>{en?DEPARTMENT_CATALOG[d].en:DEPARTMENT_CATALOG[d].zh}</option>)}
        </select></label>
        {!marketCandidates.length&&<p className="talent-empty" role="status">{!game.talent.candidates.length?say('本批候选已全部录用，等待下一批人才。','All candidates have been hired. The next batch is on its way.'):say('本批暂无该部门候选人。','No candidates for this department in the current batch.')}</p>}
        <div className="org-market-candidates">{marketPositions.map(position=>{
          const {department,role}=position, key=`${department}-${role}`;
          const count=staffIn(game,department,role).length, limit=staffLimit(department,role);
          const price=employmentPrice(position,true), salary=employmentPrice(position);
          const assignment=recruitmentAssignment(game,position);
          const unavailable=count>=limit?say('岗位已满','Role limit reached'):assignment.reason?text(assignment.reason):!afford(price)?say('金币不足','Insufficient coins'):'';
          const assignmentTarget=assignment.planeId??(assignment.airportId?airportName(assignment.airportId,airport(assignment.airportId).city):roleLabel(position,en));
          return <section key={key} className="talent-position" data-talent-position={key} aria-labelledby={`talent-position-${key}`} tabIndex={-1}>
            <header><h4 id={`talent-position-${key}`}>{roleLabel(position,en)}</h4><span>{say('已聘','Hired')} {count}/{limit}</span></header>
            <div className="org-candidates">{marketCandidates.filter(c=>c.department===department&&c.role===role).map(c=><article className="org-candidate" key={c.id} data-candidate-id={c.id} aria-labelledby={`candidate-name-${c.id}`} tabIndex={-1}>
              <div className="org-candidate-heading"><EmployeePortrait id={c.id} department={c.department}/><h4 className="org-candidate-name" id={`candidate-name-${c.id}`}>{c.name}</h4></div>
              <small>{roleLabel(c,en)} · {say('已聘','Hired')} {count}/{limit}</small><span>{say('潜力','Potential')} <b>{c.potential}/10</b></span><span>{c.trait==='mentor'?say('善于带教','Mentor'):say('高效执行','Efficient')}</span>
              <div className="org-candidate-terms">
                {!assignment.reason&&<small className="org-candidate-assignment">{say(`自动分配：${assignmentTarget}`,`Auto-assign: ${assignmentTarget}`)}</small>}
                <dl className="org-candidate-price"><div><dt>{say('招募费用','Hiring cost')}</dt><dd>{price.gold} {say('金币','coins')}</dd></div><div><dt>{say('续约薪资 / 7天','Pay / 7 days')}</dt><dd>{salary.gold} {say('金币','coins')}</dd></div></dl>
                <small>{say('招募含7天合同，不自动续约','Includes 7 days; no automatic renewal')}</small>
                <button type="button" className="org-primary" aria-label={say(`招募${c.name} · ${roleLabel(c,false)}`,`Hire ${c.name} · ${roleLabel(c,true)}`)} aria-describedby={unavailable?`candidate-status-${c.id}`:undefined} disabled={busy||Boolean(unavailable)} onClick={()=>send({type:'hire-candidate',candidateId:c.id})}>{say('招募','Hire')}</button>
                {unavailable&&<small id={`candidate-status-${c.id}`} className="org-candidate-unavailable">{unavailable}</small>}
              </div>
            </article>)}</div>
          </section>;
        })}</div>
      </section>
    </div>:<div className={`org-workspace${selected?' has-detail':''}`}>
      <div className="org-tree-area">
        <OrganizationTree width={layout.width} height={layout.height} layoutKey={layout.nodes.map(n=>`${n.employee.id}:${n.x}:${n.y}`).join('|')}>
            <svg className="org-connections" width={layout.width} height={layout.height} aria-hidden="true">{layout.edges.map((edge,i)=><path key={i} d={edge.path} className={edge.direct?'org-direct-link':''}/>)}{layout.labels.map((label,i)=><text key={i} x={label.x} y={label.y} textAnchor="middle">{label.airportId?`${airportName(label.airportId,airport(label.airportId).city)} · ${en?label.businessName:label.text.split(' · ')[1]}`:!en?label.text:Object.values(DEPARTMENT_CATALOG).find(d=>d.zh===label.text)?.en??'Player managed'}</text>)}</svg>
            {layout.businessGroups.map(group=><button type="button" key={`collapse-${group.teamId}`} className="org-business-collapse" style={{left:group.x,top:group.y,width:172}} aria-expanded={!group.collapsed} aria-label={say(`切换业务团队${group.teamId}展开`,`Toggle business team ${group.teamId}`)} onClick={()=>setCollapsed(old=>{const next=new Set(old);if(next.has(group.teamId))next.delete(group.teamId);else next.add(group.teamId);return next;})}>{group.collapsed?say("展开团队","Expand team"):say("折叠团队","Collapse team")}</button>)}
            {layout.nodes.map(n=><div key={n.employee.id} className="org-node-position" style={{left:n.x,top:n.y,width:ORG_NODE_WIDTH,height:ORG_NODE_HEIGHT}}>{node(n.employee)}</div>)}
            {layout.vacant.map(v=><button className="org-vacancy" key={v.department} data-testid={v.department==='company'?'general-manager-slot':undefined} aria-label={say(`招募${roleLabel({department:v.department,role:'manager'},false)}`,`Recruit ${roleLabel({department:v.department,role:'manager'},true)}`)} style={{left:v.x,top:v.y,width:ORG_NODE_WIDTH,height:ORG_NODE_HEIGHT}} onClick={()=>{setMarketDepartment(v.department);setMarketPosition(`${v.department}-manager`);setRecruiting(true);}}><strong>＋</strong><span>{say('待任命','Vacant')}</span><small>{roleLabel({department:v.department,role:'manager'},en)}</small><small>{say('非必需岗位','Optional role')}</small></button>)}
        </OrganizationTree>
      </div>
      {selected&&<aside className="org-detail" aria-label={say('员工详情','Employee Details')}>
        <header className="org-detail-title"><strong>{say('人员档案','Employee Profile')}</strong><button aria-label={say('收起人员档案','Collapse employee profile')} onClick={()=>setSelectedId(null)}>×</button></header>
        {selected.department==="business"?<BusinessEmployeeDetail game={game} employee={selected} busy={busy} send={send}/>:<EmployeeDetail game={game} employee={selected} busy={busy} send={send} afford={afford} onPlane={onPlane} onAirport={onAirport} tab={tab} setTab={setTab}/>}
      </aside>}
    </div>}
  </section>;
}

function EmployeeDetail({game,employee:e,busy,send,afford,onPlane,onAirport,tab,setTab}:{
  game:GameState;employee:Employee;busy:boolean;send:(cmd:Command)=>void;afford:(cost:{gold:number})=>boolean;
  onPlane?:(id:string)=>void;onAirport?:(id:string)=>void;tab:DetailTab;setTab:(tab:DetailTab)=>void;
}) {
  const {locale,duration,airportName,modelName,text}=useI18n(),en=locale==='en-US';
  const say=(zh:string,english:string)=>en?english:zh;
  const name=(person:Employee)=>person.name.trim()?person.name:(en?`Employee #${person.id}`:employeeDisplayName(person));
  const contract=employmentPrice(e),blocked=assignmentReason(game,e),manager=effectiveManager(game,e),nextRole=e.role==='manager'?'specialist':'manager';
  const promotionReason=blocked?say('请先停止运营并等待地面周转，再调岗或晋升','Stop operations and wait for turnaround before reassignment or promotion'):
    staffIn(game,e.department,nextRole).length>=staffLimit(e.department,nextRole)?say('目标岗位已满','Target role is full'):
    nextRole==='manager'&&(e.skill<2||e.management<1)?say('晋升需要专业2级、管理1级','Promotion requires professional level 2 and management level 1'):'';
  const tabs=useRef<HTMLDivElement>(null);
  return <>
    <div className="org-detail-heading"><EmployeePortrait id={e.id} department={e.department}/><div><h3>{name(e)}</h3><strong>{roleLabel(e,en)}</strong><small>{e.trait==='mentor'?say('善于带教','Mentor'):say('高效执行','Efficient')}</small></div></div>
    <dl className="org-attributes"><div><dt>{say('专业','Professional')}</dt><dd>{e.skill}</dd></div><div><dt>{say('管理','Management')}</dt><dd>{e.management}</dd></div><div><dt>{say('潜力上限','Potential')}</dt><dd>{e.potential}</dd></div></dl>
    <div className="org-detail-tabs" role="tablist" aria-label={say('人员档案栏目','Employee profile sections')} ref={tabs} onKeyDown={event=>{
      const keys:DetailTab[]=['assignment','training','history'],i=keys.indexOf(tab),next=event.key==='Home'?0:event.key==='End'?2:event.key==='ArrowRight'?(i+1)%3:event.key==='ArrowLeft'?(i+2)%3:-1;
      if(next<0)return;event.preventDefault();setTab(keys[next]!);tabs.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
    }}>{(['assignment','training','history'] as const).map(key=><button key={key} id={`employee-tab-${key}`} role="tab" aria-controls="employee-panel" aria-selected={tab===key} tabIndex={tab===key?0:-1} onClick={()=>setTab(key)}>{key==='assignment'?say('任职','Assignment'):key==='training'?say('培养','Development'):say('履历','History')}</button>)}</div>
    <div className="org-detail-content" id="employee-panel" role="tabpanel" aria-labelledby={`employee-tab-${tab}`}>
      {isSupportDepartment(e.department)&&<strong className="org-department-effect">{effectLabel(game,e.department,en)}</strong>}
      {tab==='assignment'?<>
        {e.role==='manager'?<>
          <p>{e.department==='company'?say(`直属 ${directReports(game,e.id).length} 名经理。有效合同时，每级管理为直属业务团队增加1个百分点效率；不叠加航班收益、培训折扣或补能效果。`,`${directReports(game,e.id).length} managers report here. An active contract adds one percentage point of efficiency per management level to reporting business teams, not flight revenue, training discounts or service speed.`):say(`直属 ${directReports(game,e.id).length} 人，有效管理容量 ${managerCapacity(e)} 人。按员工编号覆盖前 ${managerCapacity(e)} 人；超编不影响基础运营。`,`${directReports(game,e.id).length} reports; capacity ${managerCapacity(e)}. Coverage uses employee ID order. Other staff retain basic operations.`)}</p>
          {e.department!=='company'&&<label>{say('直属上级','Reports to')}<select aria-label={say(`${name(e)}直属上级`,`${name(e)} manager`)} value={e.managerId??''} disabled={busy} onChange={event=>send({type:'report-to',employeeId:e.id,managerId:event.target.value?Number(event.target.value):null})}>
            <option value="">{say('玩家直管','Player managed')}</option>{staffIn(game,'company','manager').map(m=><option key={m.id} value={m.id}>{name(m)} · {roleLabel(m,en)}</option>)}
          </select></label>}
        </>:<>
          <label>{say('直属上级','Reports to')}<select aria-label={say(`${name(e)}直属上级`,`${name(e)} manager`)} value={e.managerId??''} disabled={busy} onChange={event=>send({type:'report-to',employeeId:e.id,managerId:event.target.value?Number(event.target.value):null})}>
            <option value="">{say('玩家直管','Player managed')}</option>{staffIn(game,e.department,'manager').map(m=><option key={m.id} value={m.id}>{name(m)} · {roleLabel(m,en)}</option>)}
          </select></label><small>{manager?say(`${name(manager)}的管理效果生效`,`${name(manager)} provides active management support`):e.managerId!==null?say('经理合同到期或超出管理容量，基础运营不受影响','Manager expired or capacity exceeded; basic operations continue'):say('直接向玩家汇报，不要求聘请经理','Reports directly to you; no manager required')}</small>
          {!isSupportDepartment(e.department)&&<label>{say('工作岗位','Work assignment')}<select aria-label={say(`${name(e)}岗位`,`${name(e)} assignment`)} disabled={busy||blocked} value={(e.department==='flight'?e.planeId:e.airportId)??''} onChange={event=>send(e.department==='flight'?{type:'assign-pilot',pilotId:e.id,planeId:event.target.value||null}:{type:'assign-ground',employeeId:e.id,airportId:event.target.value||null})}>
            <option value="">{say('待分配','Unassigned')}</option>{e.department==='flight'?game.fleet.map(p=><option key={p.id} value={p.id} disabled={game.career.employees.some(other=>other.id!==e.id&&other.planeId===p.id)||Boolean(p.flight||p.autoRouteId||p.itinerary.length||p.energy.serviceUntil!==null||p.readyAt>game.simTime)}>{p.id} · {modelName(p.modelId,aircraftSpecs(p).name)}</option>):game.airports.map(a=><option key={a.id} value={a.id} disabled={game.career.employees.some(other=>other.id!==e.id&&other.airportId===a.id)}>{airportName(a.id,airport(a.id).city)}</option>)}
          </select></label>}
          {e.airportId&&<small>{say(`该机场下次补能 ${groundServiceQuote(game,e.airportId).seconds} 秒；已开始的服务不变。`,`Next service: ${groundServiceQuote(game,e.airportId).seconds}s. Existing service deadlines are unchanged.`)}</small>}
          {e.planeId&&onPlane&&<button onClick={()=>onPlane(e.planeId!)}>{say('查看负责飞机','View assigned aircraft')}</button>}
          {e.airportId&&onAirport&&<button onClick={()=>onAirport(e.airportId!)}>{say('前往负责机场','Visit assigned airport')}</button>}
        </>}
        {blocked&&<p className="org-warning">{promotionReason}</p>}
        <div className="org-contract"><strong>{e.paidUntil>game.simTime?say(`合同剩余 ${duration(e.paidUntil-game.simTime)}`,`Contract remaining: ${duration(e.paidUntil-game.simTime)}`):say('合同已到期 · 等待续约','Contract expired · renewal due')}</strong>
          <small>{say('到期不产生债务；在途航班与已开始补能照常完成。','No debt on expiry. Flights and services already started still finish.')}</small>
          <button disabled={busy||!afford(contract)} onClick={()=>send({type:'renew-employee',employeeId:e.id})}>{say(`续付7天 · ${contract.gold}金币`,`Renew 7 days · ${contract.gold} coins`)}</button>
        </div>
      </>:tab==='training'?<>
        {e.department==='company'?<p>{say('有效总经理每级管理为直属业务团队增加1个百分点经营效率；专业和特长不叠加业务收入，不支持内部转任。','An active general manager adds one percentage point of efficiency per management level to reporting business teams. Professional skills and traits add no business multiplier; internal reassignment remains unavailable.')}</p>:<>
        <div className="org-growth-path"><strong>{isSupportDepartment(e.department)&&e.role==='manager'?say('管理效果','Management effect'):say('专业效果','Professional effect')}</strong><small>{isSupportDepartment(e.department)?e.role==='manager'?say('管理每级：直属专员效能＋1个百分点','Each management level: +1 effect point per managed specialist'):say('专业每级：部门效能＋2个百分点','Each skill level: +2 department effect points'):e.department==='flight'?say('每级专业能力增加3%运输公司经验。','Each professional level adds 3% transport company XP.'):say('每级专业能力提升2%补能效率。','Each professional level improves service efficiency by 2%.')}</small></div>
        </>}
        <div className="org-training">{(['skill','management'] as const).map(training=>{const cost=trainingQuote(game,e,training),label=training==='skill'?say('专业','Professional'):say('管理','Management');return <div key={training}><button disabled={busy||cost.maximum||!afford(cost)} onClick={()=>send({type:'train-employee',employeeId:e.id,training})}>{say(`${label}培训`,`Train ${label}`)} · {cost.maximum?say('已达潜力上限','Potential reached'):say(`${cost.gold}金币`,`${cost.gold} coins`)}</button>{cost.discount>0&&<small>{say(`培训节省 ${cost.discount}% 金币`,`Training discount: ${cost.discount}%`)}</small>}</div>;})}</div>
        {e.department!=='company'&&<>
        <p className="org-trait">{e.trait==='mentor'?say('善于带教：任经理后培训折扣额外5%，经理带教折扣最高20%。','Mentor: 5% extra training discount as a manager; manager mentoring discount capped at 20%.'):isSupportDepartment(e.department)?say('高效执行：专员效能＋2个百分点；经理管理容量＋1。','Efficient: +2 effect points as a specialist; +1 capacity as a manager.'):say('高效执行：任经理时容量＋1；任地勤时补能效率额外5%，合计不超过30%。','Efficient: +1 manager capacity, or 5% extra ground service efficiency; total efficiency capped at 30%.')}</p>
        <p>{nextRole==='manager'?say('晋升后解除当前飞机或机场岗位；原合同期限保留，请提前安排接替人员。','Promotion releases the aircraft or airport assignment. Contract expiry is retained; prepare a replacement.'):say('转任后下属改为玩家直管，原合同期限保留。','Returning to a specialist role sends reports to the player and preserves contract expiry.')}</p>
        <button className="org-primary org-role-action" disabled={busy||Boolean(promotionReason)} onClick={()=>{if(window.confirm(nextRole==='manager'?say('晋升后解除飞机或机场岗位，原合同期限保留。确定晋升？','Promotion releases the aircraft or airport assignment and retains the contract. Proceed?'):say('转任后所有直属员工改为玩家直管，原合同期限保留。确定转任？','All reports will return to player management; contract retained. Proceed?')))send({type:'employee-role',employeeId:e.id,role:nextRole});}}>{nextRole==='manager'?say('晋升部门经理','Promote to manager'):say('转任专业岗位','Return to specialist')}</button>
        <small>{promotionReason||say('转任不补扣费用，下次续约使用新岗位价格','No adjustment charge. The next renewal uses the new role price.')}</small>
        </>}
      </>:<>
        <h4>{say(`员工履历 · ${e.flights} 班 / ${e.deliveries} 份客货`,`Employee History · ${e.flights} flights / ${e.deliveries} deliveries`)}</h4>
        <p>{e.joinedAt===null?say('历史入职时间未知；业绩从升级后开始记录。','Historic join date is unknown; performance is recorded from the upgrade onward.'):say(`入职于经营第 ${Math.floor(e.joinedAt/86400)+1} 天。`,`Joined on operating day ${Math.floor(e.joinedAt/86400)+1}.`)}</p>
        <h4>{say('带教经历','Mentoring History')}</h4>
        {game.talent.mentoring.filter(m=>m.employeeId===e.id||m.mentorId===e.id).length?<ol className="org-mentoring">{game.talent.mentoring.filter(m=>m.employeeId===e.id||m.mentorId===e.id).map(m=>{const mentor=game.career.employees.find(p=>p.id===m.mentorId)!,trainee=game.career.employees.find(p=>p.id===m.employeeId)!;return <li key={`${m.employeeId}-${m.level}`}>{say(`${name(mentor)}指导${name(trainee)}达到专业${m.level}级`,`${name(mentor)} guided ${name(trainee)} to professional level ${m.level}`)}</li>;})}</ol>:<p>{say('暂无已记录的带教；旧经历不补编。','No recorded mentoring. Earlier history is not invented.')}</p>}
        <ol className="org-history">{e.history.map((item,i)=><li key={`${item.at}-${i}`}><small>{say('经营第','Operating day')} {Math.floor(item.at/86400)+1} {say('天','')}</small>{text(item.text)}</li>)}</ol>
      </>}
    </div>
  </>;
}
