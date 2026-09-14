import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Command, GameState } from '../core/game.js';
import { aircraftSpecs, airport } from '../core/catalog.js';
import { companyAffairs } from '../core/talent.js';
import {
  directReports, effectiveManager, employmentPrice, groundServiceQuote, managerCapacity,
  staffIn, staffLimit, trainingQuote, type Department, type Employee, type EmployeeRole,
} from '../core/organization.js';
import { controller, useGame } from '../runtime.js';
import { ignore } from './Panels.js';
import { useGameViewport } from './GameViewport.js';
import { organizationLayout, ORG_NODE_HEIGHT, ORG_NODE_WIDTH } from './organization-layout.js';
import { employeeDisplayName } from './organization-presentation.js';
import { useI18n } from '../i18n/I18n.js';
import { EmployeePortrait } from './EmployeePortrait.js';
import { CompanyAffairs, CompanyChronicle } from './CompanyAffairs.js';
import './organization.css';

type DetailTab = 'assignment' | 'training' | 'history';
function roleLabel(e: Pick<Employee,'department'|'role'>, en: boolean) {
  return e.role === 'manager' ? (e.department==='flight'?(en?'Flight Manager':'飞行部经理'):(en?'Ground Manager':'地勤部经理'))
    : e.department==='flight'?(en?'Pilot':'飞行员'):(en?'Ground Specialist':'地勤专员');
}
function assignmentReason(s: GameState, e: Employee) {
  const p=s.fleet.find(p=>p.id===e.planeId);
  return Boolean(p&&(p.flight||p.autoRouteId||p.itinerary.length||p.energy.serviceUntil!==null||p.readyAt>s.simTime));
}
export function CompanyOrganization({ game, busy, onPlane, onAirport, onClose, initialEmployeeId, initialTraining = false }: {
  game: GameState; busy: boolean; onPlane?: (id: string) => void; onAirport?: (id: string) => void; onClose?: () => void;
  initialEmployeeId?: number | null; initialTraining?: boolean;
}) {
  const { locale, airportName, text }=useI18n(), en=locale==='en-US', view=useGame();
  const say=(zh:string,english:string)=>en?english:zh;
  const people=game.career.employees, affairs=companyAffairs(game);
  const [selectedId,setSelectedId]=useState<number|null>(initialEmployeeId??null);
  const [tab,setTab]=useState<DetailTab>(initialTraining?'training':'assignment');
  const [panel,setPanel]=useState<'recruit'|'affairs'|'chronicle'|null>(null);
  const [job,setJob]=useState('flight-specialist'), [candidateId,setCandidateId]=useState<number|null>(null);
  const [filter,setFilter]=useState<Department|'all'>('all');
  const [collapsed,setCollapsed]=useState<Record<Department,boolean>>({flight:false,ground:false});
  const [pendingOpen,setPendingOpen]=useState(false), [zoom,setZoom]=useState(.8);
  const viewport=useRef<HTMLDivElement>(null), previousCount=useRef(people.length);
  const drag=useRef<{id:number;x:number;y:number;left:number;top:number}|null>(null);
  const {scale}=useGameViewport();
  const selected=people.find(e=>e.id===selectedId);
  const layout=organizationLayout(game,collapsed,filter);
  const [department,role]=job.split('-') as [Department,EmployeeRole];
  const price=employmentPrice({department,role},true), vacancies=staffIn(game,department,role).length<staffLimit(department,role);
  const candidates=game.talent.candidates.filter(c=>c.department===department&&c.role===role);
  const candidate=candidates.find(c=>c.id===candidateId)??candidates[0]!;
  const send=(command:Command)=>ignore(controller.command(command));
  const afford=(cost:{gold:number;tickets:number})=>game.credits>=cost.gold&&game.career.tickets>=cost.tickets;
  const name=(e:Employee)=>e.name.trim()?e.name:(en?`Employee #${e.id}`:employeeDisplayName(e));
  function select(id:number,training=false) { setSelectedId(id);setTab(training?'training':'assignment');setPanel(null); }
  useEffect(()=>{ if(initialEmployeeId!=null) {setSelectedId(initialEmployeeId);setTab(initialTraining?'training':'assignment');setPanel(null);} },[initialEmployeeId,initialTraining]);
  useEffect(()=>{
    if(people.length>previousCount.current) {setSelectedId(people.at(-1)!.id);setTab('assignment');setPanel(null);setPendingOpen(true);}
    previousCount.current=people.length;
  },[people]);
  function status(e:Employee) {
    if(e.paidUntil<=game.simTime)return say('待续约','Renewal due');
    if(e.role==='manager')return say(`管理 ${directReports(game,e.id).length}/${managerCapacity(e)}`,`Team ${directReports(game,e.id).length}/${managerCapacity(e)}`);
    if(e.planeId)return game.fleet.find(p=>p.id===e.planeId)?.flight?say('执勤中','On duty'):say('已上岗','Assigned');
    if(e.airportId)return `${airportName(e.airportId,airport(e.airportId).city)} · ${say('已上岗','Assigned')}`;
    return say('待分配','Unassigned');
  }
  function pointerDown(event:PointerEvent<HTMLDivElement>) {
    if(!event.isPrimary||event.button!==0||(event.target as Element).closest('button'))return;
    drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,left:event.currentTarget.scrollLeft,top:event.currentTarget.scrollTop};event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event:PointerEvent<HTMLDivElement>) {
    const d=drag.current;if(!d||d.id!==event.pointerId)return;
    event.currentTarget.scrollLeft=d.left-(event.clientX-d.x)/scale;event.currentTarget.scrollTop=d.top-(event.clientY-d.y)/scale;
  }
  function pointerEnd(event:PointerEvent<HTMLDivElement>) {
    drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  }
  const node=(e:Employee)=><button type="button" key={e.id} className="org-person" data-employee-id={e.id} data-department={e.department}
    data-state={e.paidUntil<=game.simTime?'expired':e.role==='specialist'&&!e.planeId&&!e.airportId?'waiting':'active'}
    aria-label={say(`查看${name(e)} · ${roleLabel(e,false)}`,`View ${name(e)} · ${roleLabel(e,true)}`)} aria-pressed={selectedId===e.id} onClick={()=>select(e.id)}>
    <span className="org-portrait-ring"><EmployeePortrait id={e.id} department={e.department}/>{affairs.some(a=>a.employeeId===e.id)&&<b className="org-affair-dot" aria-label={say('有公司事务','Company affair available')}>!</b>}</span>
    <strong>{name(e)}</strong><small>{roleLabel(e,en)}</small><em>{status(e)}</em>
  </button>;
  return <section className="company-organization" aria-label={say('公司组织管理','Company Organization Management')}>
    <header className="org-page-heading"><h2>{say('公司组织','Company Organization')}</h2>
      <span className="org-inline-summary">{say('员工','Staff')} <b>{people.length}/14</b> · {say('待续约','Renewals')} <b>{people.filter(e=>e.paidUntil<=game.simTime).length}</b></span>
      <div className="org-heading-actions">
        <button aria-expanded={panel==='affairs'} onClick={()=>setPanel(panel==='affairs'?null:'affairs')}>{say('公司事务','Affairs')} {affairs.length>0&&<b>{affairs.length}</b>}</button>
        <button aria-expanded={panel==='chronicle'} onClick={()=>setPanel(panel==='chronicle'?null:'chronicle')}>{say('公司纪事','Chronicle')}</button>
        <button className="org-primary" aria-expanded={panel==='recruit'} onClick={()=>setPanel(panel==='recruit'?null:'recruit')}>{say('招募','Recruit')}</button>
        {onClose&&<button onClick={onClose} aria-label={say('关闭公司组织','Close Company Organization')}>×</button>}
      </div>
    </header>
    {view.error&&<p className="org-warning" role="alert">{text(view.error)}</p>}
    {panel?<div className="org-panel"><header><h3>{panel==='recruit'?say('选择下一位伙伴','Choose your next colleague'):panel==='affairs'?say('公司事务','Company Affairs'):say('公司纪事','Company Chronicle')}</h3><button onClick={()=>setPanel(null)}>{say('返回组织树','Back to organization')}</button></header>
      {panel==='recruit'?<section className="org-recruit" aria-label={say('团队招募','Team Recruitment')}>
        <label>{say('招募岗位','Recruitment role')}<select aria-label={say('招募岗位','Recruitment role')} value={job} onChange={e=>{setJob(e.target.value);setCandidateId(null);}}>
          {(['flight-specialist','ground-specialist','flight-manager','ground-manager'] as const).map(key=>{const [d,r]=key.split('-') as [Department,EmployeeRole];return <option key={key} value={key}>{roleLabel({department:d,role:r},en)} · {staffIn(game,d,r).length}/{staffLimit(d,r)}</option>;})}
        </select></label>
        <p>{say('名单随存档保留，刷新不重抽；仅录用后补充对应空位。经理不是基础运营的前提。','Candidates persist across reloads. Only a hired candidate is replaced. Managers are optional for basic operations.')}</p>
        <div className="org-candidates" role="group" aria-label={say('候选名单','Candidate shortlist')}>{candidates.map(c=><button className="org-candidate" type="button" key={c.id} aria-pressed={candidate.id===c.id} data-candidate-id={c.id} onClick={()=>setCandidateId(c.id)}>
          <strong>{c.name}</strong><small>{roleLabel(c,en)}</small><span>{say('潜力','Potential')} <b>{c.potential}/10</b></span><span>{c.trait==='mentor'?say('善于带教','Mentor'):say('高效执行','Efficient')}</span>
          <small>{c.trait==='mentor'?say('适合未来带领和培养团队','Suited to developing a future team'):say('适合执行岗位与团队覆盖','Suited to execution and team coverage')}</small>
        </button>)}</div>
        <div className="org-recruit-footer"><strong>{candidate.name} · {price.gold} {say('金币','coins')} + {price.tickets} {say('券','tickets')}</strong><span>{say('包含7天预付合同，不自动续约。','Includes a prepaid seven-day contract. No automatic renewal.')}</span>
          <button className="org-primary" disabled={busy||!vacancies||!afford(price)} onClick={()=>send({type:'hire-candidate',candidateId:candidate.id})}>{say(`招募${roleLabel({department,role},false)}`,`Hire ${roleLabel({department,role},true)}`)}</button>
          {!vacancies&&<small>{say('岗位已满','Role limit reached')}</small>}{!afford(price)&&<small>{say('资金或点券不足','Insufficient coins or tickets')}</small>}
        </div>
      </section>:panel==='affairs'?<CompanyAffairs game={game} busy={busy} onEmployee={select}/>:<CompanyChronicle game={game}/>}
    </div>:<div className={`org-workspace${selected?' has-detail':''}`}>
      <div className="org-tree-area">
        <div className="org-tree-toolbar"><div className="org-filter" role="group" aria-label={say('部门筛选','Department filter')}>
          {(['all','flight','ground'] as const).map(d=><button key={d} aria-pressed={filter===d} onClick={()=>setFilter(d)}>{d==='all'?say('全部','All'):d==='flight'?say('飞行部','Flight'):say('地勤部','Ground')}</button>)}
        </div><details className="org-view-menu"><summary>{say('视图','View')}</summary><div className="org-view-tools" aria-label={say('组织树显示控制','Organization view controls')}>
          {(['flight','ground'] as const).map(d=><button key={d} aria-expanded={!collapsed[d]} onClick={()=>setCollapsed(old=>({...old,[d]:!old[d]}))}>{say(`${collapsed[d]?'展开':'折叠'}${d==='flight'?'飞行部':'地勤部'}`,`${collapsed[d]?'Expand':'Collapse'} ${d==='flight'?'Flight':'Ground'}`)}</button>)}
          <span className="org-zoom"><button aria-label={say('缩小组织树','Zoom out organization')} disabled={zoom<=.5} onClick={()=>setZoom(z=>Math.max(.5,Math.round((z-.1)*10)/10))}>−</button><output aria-label={say('组织树缩放','Organization zoom')}>{Math.round(zoom*100)}%</output><button aria-label={say('放大组织树','Zoom in organization')} disabled={zoom>=1.5} onClick={()=>setZoom(z=>Math.min(1.5,Math.round((z+.1)*10)/10))}>＋</button></span>
          <button onClick={()=>{setZoom(.8);if(viewport.current){viewport.current.scrollTop=0;viewport.current.scrollLeft=0;}}}>{say('复位','Reset')}</button>
        </div></details></div>
        <div ref={viewport} className="org-scroll" role="region" aria-label={say('公司组织架构树','Company Organization Tree')} tabIndex={0}
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={()=>{drag.current=null;}}
          onKeyDown={e=>{if(e.target!==e.currentTarget)return;const steps:Record<string,[number,number]>={ArrowDown:[0,60],ArrowUp:[0,-60],ArrowLeft:[-60,0],ArrowRight:[60,0]};const step=steps[e.key];if(step){e.preventDefault();e.currentTarget.scrollLeft+=step[0];e.currentTarget.scrollTop+=step[1];}if(e.key==='Home'){e.preventDefault();e.currentTarget.scrollTop=0;e.currentTarget.scrollLeft=0;}}}>
          <div className="org-scaled-extent" style={{width:layout.width*zoom,height:layout.height*zoom}}><div className="org-canvas" style={{width:layout.width,height:layout.height,left:'50%',transform:`scale(${zoom}) translateX(-50%)`}}>
            <svg className="org-connections" width={layout.width} height={layout.height} aria-hidden="true">{layout.edges.map((edge,i)=><path key={i} d={edge.path} className={edge.direct?'org-direct-link':''}/>)}{layout.labels.map((label,i)=><text key={i} x={label.x} y={label.y} textAnchor="middle">{!en?label.text:label.text==='飞行部'?'Flight':label.text==='地勤部'?'Ground':label.text.startsWith('已折叠')?'Team collapsed':'Player managed · manager optional'}</text>)}</svg>
            <div className="org-founder" style={{left:layout.founder.x,top:layout.founder.y}}><span className="org-founder-seal">{say('总','HQ')}</span><strong>{say('创始人 / 总经理','Founder / CEO')}</strong><small>{say('玩家 · 公司负责人','You · company lead')}</small></div>
            {layout.nodes.map(n=><div key={n.employee.id} className="org-node-position" style={{left:n.x,top:n.y,width:ORG_NODE_WIDTH,height:ORG_NODE_HEIGHT}}>{node(n.employee)}</div>)}
            {layout.vacant.map(v=><button className="org-vacancy" key={v.department} style={{left:v.x,top:v.y,width:ORG_NODE_WIDTH,height:ORG_NODE_HEIGHT}} onClick={()=>{setJob(`${v.department}-manager`);setPanel('recruit');}}><strong>＋</strong><span>{say('待任命','Vacant')}</span><small>{roleLabel({department:v.department,role:'manager'},en)}</small><small>{say('非必需岗位','Optional role')}</small></button>)}
          </div></div>
        </div>
        <p className="org-legend">{say('实线：经理直属；虚线：玩家直管。拖动空白或用方向键浏览。','Solid: manager reports. Dashed: player managed. Drag empty space or use arrow keys.')}</p>
        {layout.pending.length>0&&<details className="org-pending" open={pendingOpen} onToggle={e=>setPendingOpen(e.currentTarget.open)}><summary>{say('待分配人员','Unassigned staff')} · {layout.pending.length}</summary><div>{layout.pending.length?layout.pending.map(node):<small>{say('暂无待分配人员','No unassigned staff')}</small>}</div></details>}
        {!people.length&&<p className="org-empty-note"><strong>{say('组建第一支团队','Build your first team')}</strong> · {say('先招募并分配岗位，随后选择专业骨干或管理培养路线。','Recruit, assign a role, then develop a specialist or future manager.')}</p>}
      </div>
      {selected&&<aside className="org-detail" aria-label={say('员工详情','Employee Details')}>
        <header className="org-detail-title"><strong>{say('人员档案','Employee Profile')}</strong><button aria-label={say('收起人员档案','Collapse employee profile')} onClick={()=>setSelectedId(null)}>×</button></header>
        <EmployeeDetail game={game} employee={selected} busy={busy} send={send} afford={afford} onPlane={onPlane} onAirport={onAirport} tab={tab} setTab={setTab}/>
      </aside>}
    </div>}
  </section>;
}

function EmployeeDetail({game,employee:e,busy,send,afford,onPlane,onAirport,tab,setTab}:{
  game:GameState;employee:Employee;busy:boolean;send:(cmd:Command)=>void;afford:(cost:{gold:number;tickets:number})=>boolean;
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
      {tab==='assignment'?<>
        {e.role==='manager'?<p>{say(`直属 ${directReports(game,e.id).length} 人，有效管理容量 ${managerCapacity(e)} 人。按员工编号覆盖前 ${managerCapacity(e)} 人；超编不影响基础运营。`,`${directReports(game,e.id).length} reports; capacity ${managerCapacity(e)}. Coverage uses employee ID order. Other staff retain basic operations.`)}</p>:<>
          <label>{say('直属上级','Reports to')}<select aria-label={say(`${name(e)}直属上级`,`${name(e)} manager`)} value={e.managerId??''} disabled={busy} onChange={event=>send({type:'report-to',employeeId:e.id,managerId:event.target.value?Number(event.target.value):null})}>
            <option value="">{say('玩家直管','Player managed')}</option>{staffIn(game,e.department,'manager').map(m=><option key={m.id} value={m.id}>{name(m)} · {roleLabel(m,en)}</option>)}
          </select></label><small>{manager?say(`${name(manager)}的管理效果生效`,`${name(manager)} provides active management support`):e.managerId!==null?say('经理合同到期或超出管理容量，基础运营不受影响','Manager expired or capacity exceeded; basic operations continue'):say('直接向玩家汇报，不要求聘请经理','Reports directly to you; no manager required')}</small>
          <label>{say('工作岗位','Work assignment')}<select aria-label={say(`${name(e)}岗位`,`${name(e)} assignment`)} disabled={busy||blocked} value={(e.department==='flight'?e.planeId:e.airportId)??''} onChange={event=>send(e.department==='flight'?{type:'assign-pilot',pilotId:e.id,planeId:event.target.value||null}:{type:'assign-ground',employeeId:e.id,airportId:event.target.value||null})}>
            <option value="">{say('待分配','Unassigned')}</option>{e.department==='flight'?game.fleet.map(p=><option key={p.id} value={p.id} disabled={game.career.employees.some(other=>other.id!==e.id&&other.planeId===p.id)||Boolean(p.flight||p.autoRouteId||p.itinerary.length||p.energy.serviceUntil!==null||p.readyAt>game.simTime)}>{p.id} · {modelName(p.modelId,aircraftSpecs(p).name)}</option>):game.airports.map(a=><option key={a.id} value={a.id} disabled={game.career.employees.some(other=>other.id!==e.id&&other.airportId===a.id)}>{airportName(a.id,airport(a.id).city)}</option>)}
          </select></label>
          {e.airportId&&<small>{say(`该机场下次补能 ${groundServiceQuote(game,e.airportId).seconds} 秒；已开始的服务不变。`,`Next service: ${groundServiceQuote(game,e.airportId).seconds}s. Existing service deadlines are unchanged.`)}</small>}
          {e.planeId&&onPlane&&<button onClick={()=>onPlane(e.planeId!)}>{say('查看负责飞机','View assigned aircraft')}</button>}
          {e.airportId&&onAirport&&<button onClick={()=>onAirport(e.airportId!)}>{say('前往负责机场','Visit assigned airport')}</button>}
        </>}
        {blocked&&<p className="org-warning">{promotionReason}</p>}
        <div className="org-contract"><strong>{e.paidUntil>game.simTime?say(`合同剩余 ${duration(e.paidUntil-game.simTime)}`,`Contract remaining: ${duration(e.paidUntil-game.simTime)}`):say('合同已到期 · 等待续约','Contract expired · renewal due')}</strong>
          <small>{say('到期不产生债务；在途航班与已开始补能照常完成。','No debt on expiry. Flights and services already started still finish.')}</small>
          <button disabled={busy||!afford(contract)} onClick={()=>send({type:'renew-employee',employeeId:e.id})}>{say(`续付7天 · ${contract.gold}金币＋${contract.tickets}券`,`Renew 7 days · ${contract.gold} coins + ${contract.tickets} tickets`)}</button>
        </div>
      </>:tab==='training'?<>
        <div className="org-growth-path"><strong>{say('专业路线','Specialist path')}</strong><span>{say('入职 → 专业培养 → 业务骨干','Join → Professional training → Specialist')}</span><small>{e.department==='flight'?say('每级专业能力增加3%运输公司经验，不直接增加航班收入或速度。','Each professional level adds 3% transport company XP, not flight revenue or speed.'):say('每级专业能力提升2%补能效率，仅作用于负责机场的后续服务。','Each professional level improves future service efficiency at the assigned airport by 2%.')}</small></div>
        <div className="org-growth-path"><strong>{say('管理路线','Management path')}</strong><span>{say('专业基础 → 管理培养 → 晋升 → 带教','Professional basics → Management → Promotion → Mentoring')}</span><small>{say('经理提供有容量限制的培训支持；培养后代骨干，不设置退休或强制接班。','Managers support training within capacity limits. Develop successors without forced retirement.')}</small></div>
        <div className="org-training">{(['skill','management'] as const).map(training=>{const cost=trainingQuote(game,e,training),label=training==='skill'?say('专业','Professional'):say('管理','Management');return <div key={training}><button disabled={busy||cost.maximum||!afford(cost)} onClick={()=>send({type:'train-employee',employeeId:e.id,training})}>{say(`${label}培训`,`Train ${label}`)} · {cost.maximum?say('已达潜力上限','Potential reached'):say(`${cost.gold}金币＋${cost.tickets}券`,`${cost.gold} coins + ${cost.tickets} tickets`)}</button>{cost.discount>0&&<small>{say(`经理培养节省 ${cost.discount}% 金币`,`Manager mentoring saves ${cost.discount}% coins`)}</small>}</div>;})}</div>
        <p className="org-trait">{e.trait==='mentor'?say('善于带教：任经理后培训折扣额外5%，金币折扣合计不超过20%。','Mentor: 5% extra training discount as a manager; combined coin discount capped at 20%.'):say('高效执行：任经理时容量＋1；任地勤时补能效率额外5%，合计不超过30%。','Efficient: +1 manager capacity, or 5% extra ground service efficiency; total efficiency capped at 30%.')}</p>
        <p>{nextRole==='manager'?say('晋升后解除当前飞机或机场岗位；原合同期限保留，请提前安排接替人员。','Promotion releases the aircraft or airport assignment. Contract expiry is retained; prepare a replacement.'):say('转任后下属改为玩家直管，原合同期限保留。','Returning to a specialist role sends reports to the player and preserves contract expiry.')}</p>
        <button className="org-primary org-role-action" disabled={busy||Boolean(promotionReason)} onClick={()=>{if(window.confirm(nextRole==='manager'?say('晋升后解除飞机或机场岗位，原合同期限保留。确定晋升？','Promotion releases the aircraft or airport assignment and retains the contract. Proceed?'):say('转任后所有直属员工改为玩家直管，原合同期限保留。确定转任？','All reports will return to player management; contract retained. Proceed?')))send({type:'employee-role',employeeId:e.id,role:nextRole});}}>{nextRole==='manager'?say('晋升部门经理','Promote to manager'):say('转任专业岗位','Return to specialist')}</button>
        <small>{promotionReason||say('转任不补扣费用，下次续约使用新岗位价格','No adjustment charge. The next renewal uses the new role price.')}</small>
      </>:<>
        <h4>{say(`员工履历 · ${e.flights} 班 / ${e.deliveries} 份客货`,`Employee History · ${e.flights} flights / ${e.deliveries} deliveries`)}</h4>
        <p>{e.joinedAt===null?say('历史入职时间未知；业绩从升级后开始记录。','Historic join date is unknown; performance is recorded from the upgrade onward.'):say(`入职于经营第 ${Math.floor(e.joinedAt/86400)+1} 天。`,`Joined on operating day ${Math.floor(e.joinedAt/86400)+1}.`)}</p>
        <h4>{say('带教经历','Mentoring History')}</h4>
        {game.talent.mentoring.filter(m=>m.employeeId===e.id||m.mentorId===e.id).length?<ol className="org-mentoring">{game.talent.mentoring.filter(m=>m.employeeId===e.id||m.mentorId===e.id).map(m=>{const mentor=game.career.employees.find(p=>p.id===m.mentorId)!,trainee=game.career.employees.find(p=>p.id===m.employeeId)!;return <li key={`${m.employeeId}-${m.level}`}>{say(`${name(mentor)}指导${name(trainee)}达到专业${m.level}级`,`${name(mentor)} guided ${name(trainee)} to professional level ${m.level}`)}</li>;})}</ol>:<p>{say('暂无已记录的带教；旧经历不补编。','No recorded mentoring. Earlier history is not invented.')}</p>}
        <ol className="org-history">{e.history.map((item,i)=><li key={`${item.at}-${i}`}><small>{say('经营第','Operating day')} {Math.floor(item.at/86400)+1} {say('天','')}</small>{text(item.text)}</li>)}</ol><small>{say('日常履历保留最近20条；累计业绩与带教记录单独保留。','Recent activity is limited to 20 entries. Performance and mentoring are retained separately.')}</small>
      </>}
    </div>
  </>;
}
