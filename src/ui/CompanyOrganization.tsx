import { useEffect, useRef, useState } from 'react';
import type { GameState, Command } from '../core/game.js';
import { airport, aircraftSpecs } from '../core/catalog.js';
import {
  DEPARTMENTS, TRAITS, EMPLOYEE_LIMIT, activePilots, staff, manager, assignedStaff,
  roleName, managementCapacity, recruitCost, renewalCost, trainingCost,
  employeeStatus, employeeLock, appointmentReason, groundServiceSeconds,
  type Employee, type Department,
} from '../core/organization.js';
import { controller } from '../runtime.js';
import { ignore, money } from './Panels.js';
import { useGameViewport } from './GameViewport.js';
import { artAsset } from './art-assets.js';
import './organization.css';

export function CompanyOrganization({ game, busy, onPlane, onAirport }: {
  game: GameState; busy: boolean; onPlane: (id: string) => void; onAirport: (id: string) => void;
}) {
  const all = game.career.employees;
  const [selected, select] = useState<number | null>(all[0]?.id ?? null);
  const previousCount = useRef(all.length);
  useEffect(() => {
    if (all.length > previousCount.current) select(all.at(-1)!.id);
    previousCount.current = all.length;
  }, [all]);
  const [zoom, setZoom] = useState(100);
  const [collapsed, setCollapsed] = useState({ flight: false, ground: false });
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x:number; y:number; left:number; top:number } | null>(null);
  const { scale } = useGameViewport();
  const e = all.find(e => e.id === selected);
  const send = (command: Command) => ignore(controller.command(command));
  const payroll = all.reduce((n, e) => { const cost = renewalCost(e); return { gold:n.gold+cost.gold, tickets:n.tickets+cost.tickets }; }, {gold:0,tickets:0});
  const canAfford = (cost: {gold:number;tickets:number}) => game.credits >= cost.gold && game.career.tickets >= cost.tickets;
  function employeeNode(person: Employee) {
    const status = employeeStatus(game, person);
    return <button type="button" className="org-person" key={person.id} data-employee-id={person.id}
      data-status={status} aria-label={`${person.name} · ${roleName(person)}`} aria-pressed={selected === person.id}
      onClick={() => select(person.id)}>
      <span className={`org-avatar ${person.department}`} aria-hidden="true">{person.department === 'flight'
        ? <img src={artAsset('pilot-avatar-v1.png')} alt=""/> : person.name.slice(0, 1)}</span>
      <span className="org-person-copy"><strong>{person.name}<small>{roleName(person)}</small></strong>
        <span>{person.planeId ?? (person.airportId ? airport(person.airportId).city : person.role === 'manager' ? `管理容量 ${managementCapacity(person)}` : '尚未绑定资产')}</span>
        <em>{status === '待续约' ? '!' : status === '待分配' ? '○' : '●'} {status}</em>
      </span>
    </button>;
  }
  function appoint(person: Employee) {
    const previous = manager(game, person.department);
    if (!window.confirm(`任命${person.name}为${DEPARTMENTS[person.department]}经理，支付1,000金币＋2点券。${previous ? `${previous.name}将转为待分配人员。` : '部门基础操作仍由玩家控制。'}已开始的航班和补能不变。`)) return;
    send({type:'org-appoint',employeeId:person.id});
  }
  return <section className="company-organization" aria-label="公司组织架构">
    <div className="org-heading"><div><h3>公司组织</h3><p>从第一位员工，到共同经营的航空团队</p></div>
      <div className="org-total"><strong>{all.length} 名员工</strong><span>待续约 {all.filter(e => e.paidUntil <= game.simTime).length} 名</span></div></div>
    <div className="org-toolbar">
      <div className="org-recruit">{(Object.keys(DEPARTMENTS) as Department[]).map(d => {
        const cost = recruitCost(d);
        return <button key={d} disabled={busy || staff(game,d).length >= EMPLOYEE_LIMIT || !canAfford(cost)}
          onClick={() => send({type:'org-recruit',department:d})}>
          {d === 'flight' ? '招募飞行员' : '招募地勤'}<small>{money(cost.gold)}＋{cost.tickets}券 · 含7日工资</small>
        </button>;
      })}</div>
      <div className="org-zoom" aria-label="组织图缩放">
        <button aria-label="缩小组织图" disabled={zoom <= 70} onClick={() => setZoom(z => z - 10)}>−</button>
        <output aria-label="组织图缩放比例">{zoom}%</output>
        <button aria-label="放大组织图" disabled={zoom >= 140} onClick={() => setZoom(z => z + 10)}>＋</button>
        <button onClick={() => { setZoom(100); viewport.current?.scrollTo({left:0,top:0}); }}>复位</button>
      </div>
    </div>
    <div className="org-layout">
      <div className="org-map-column">
        <div className="org-viewport" ref={viewport} role="region" aria-label="可拖动的员工组织树" tabIndex={0}
          onPointerDown={event => {
            if (event.button !== 0 || (event.target as Element).closest('button')) return;
            drag.current={x:event.clientX,y:event.clientY,left:event.currentTarget.scrollLeft,top:event.currentTarget.scrollTop};
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => { if (!drag.current) return; event.currentTarget.scrollLeft=drag.current.left-(event.clientX-drag.current.x)/scale; event.currentTarget.scrollTop=drag.current.top-(event.clientY-drag.current.y)/scale; }}
          onPointerUp={event => { drag.current=null; if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId); }}
          onPointerCancel={() => { drag.current=null; }} onLostPointerCapture={() => { drag.current=null; }}>
          <div className="org-stage" style={{zoom:zoom/100}}>
            <div className="org-founder"><span aria-hidden="true">航</span><div><strong>创始人 / 总经理</strong><small>玩家 · 中华航空</small></div></div>
            <div className="org-branches">
              {(Object.keys(DEPARTMENTS) as Department[]).map(d => {
                const m=manager(game,d), members=assignedStaff(game,d);
                return <section className={`org-branch ${d}`} key={d} aria-label={`${DEPARTMENTS[d]}组织`}>
                  <header><strong>{DEPARTMENTS[d]}</strong><button aria-label={`${collapsed[d] ? '展开' : '折叠'}${DEPARTMENTS[d]}`} aria-expanded={!collapsed[d]}
                    onClick={() => setCollapsed(c => ({...c,[d]:!c[d]}))}>{collapsed[d] ? '＋' : '−'}</button></header>
                  {m ? employeeNode(m) : <button className="org-vacancy" aria-label={`任命${DEPARTMENTS[d]}经理`}
                    onClick={() => select(staff(game,d).find(p => !appointmentReason(game,p))?.id ?? staff(game,d)[0]?.id ?? null)}>
                    <strong>经理待任命</strong><small>玩家兼管 · 基础运营不受限</small></button>}
                  <p className="org-capacity">已分配 {members.length} 人{m ? ` / 管理容量 ${managementCapacity(m)}` : ' · 可直接安排员工'}
                    {m && members.length > managementCapacity(m) && <small>超编：新增管理效果按比例折算</small>}</p>
                  {!collapsed[d] && <div className="org-workers">{members.length ? members.map(employeeNode)
                    : <p className="org-empty">暂无已分配员工<br/>招聘后在详情中安排飞机或机场</p>}</div>}
                </section>;
              })}
            </div>
            <section className="org-reserve" aria-label="待分配人员"><h4>待分配人员 <span>{all.filter(e => e.role==='staff'&&!e.planeId&&!e.airportId).length}</span></h4>
              <div>{all.filter(e => e.role==='staff'&&!e.planeId&&!e.airportId).map(employeeNode)}</div>
              {!all.some(e=>e.role==='staff'&&!e.planeId&&!e.airportId)&&<p className="org-empty">新入职与卸任人员将在这里等待安排</p>}
            </section>
          </div>
        </div>
        <p className="org-map-note">拖动空白处平移 · 点击员工查看详情 · 飞机与机场是工作分配，不是下属员工</p>
        <small className="org-payroll">全员续约7日合计：{money(payroll.gold)}金币＋{payroll.tickets}券。预付合同，不自动扣薪、不形成离线债务。</small>
      </div>
      <aside className="org-inspector" aria-label="员工详情">
        {e ? <>
          <header><span>{DEPARTMENTS[e.department]} / {roleName(e)}</span><h3>{e.name}</h3><p data-testid="employee-contract">{e.paidUntil > game.simTime ? `合同剩余 ${Math.ceil((e.paidUntil-game.simTime)/86400)} 个营业日` : '合同到期 · 请续约恢复后续效果'}</p></header>
          <dl className="org-abilities"><div><dt>专业能力</dt><dd>{e.skill}<small> / {e.potential}</small></dd></div><div><dt>管理能力</dt><dd>{e.management}<small> / {e.potential}</small></dd></div><div><dt>成长潜力</dt><dd>{e.potential}</dd></div><div><dt>职业特长</dt><dd className="org-trait">{TRAITS[e.trait]}</dd></div></dl>
          <small className="org-trait-note">{e.trait==='steady'?'管理培训金币费用九折。':e.trait==='efficient'?'驻站补能额外提速2%。':'任经理后提高所属部门的管理效果。'}</small>
          <p className="org-effect">{e.role==='manager' ? `${managementCapacity(e)}人管理容量；${e.department==='flight' ? '提高新起飞有偿运输的公司经验，最多20%' : '改善新开始的驻站补能效率'}。`
            : e.department==='flight' ? `专业能力提供 ${e.skill*3}% 运输经验；分配飞机后可在机队管理启动自动值勤。`
            : e.airportId ? `${airport(e.airportId).city}新补能服务：${groundServiceSeconds(game,e.airportId)}秒。已开始的服务不变。` : '分配机场后缩短新补能服务；没有地勤仍可按原规则补能。'}</p>
          {e.role === 'staff' && <label className="org-assignment">工作岗位<select aria-label={`${e.name}岗位`} value={e.planeId ?? e.airportId ?? ''}
            disabled={busy || Boolean(employeeLock(game,e))} onChange={event => send({type:'org-assign',employeeId:e.id,assetId:event.target.value||null})}>
            <option value="">待分配</option>{e.department==='flight' ? game.fleet.map(p=><option key={p.id} value={p.id}
              disabled={activePilots(game).some(other=>other.id!==e.id&&other.planeId===p.id)}>{p.id} · {aircraftSpecs(p).name}</option>)
              : game.airports.map(a=><option key={a.id} value={a.id} disabled={staff(game,'ground').some(other=>other.id!==e.id&&other.airportId===a.id)}>{airport(a.id).city}</option>)}
          </select>{employeeLock(game,e)&&<small>{employeeLock(game,e)}</small>}</label>}
          {(e.planeId||e.airportId)&&<button className="org-jump" onClick={()=>e.planeId?onPlane(e.planeId):onAirport(e.airportId!)}>{e.planeId?'查看负责飞机':'前往负责机场'} →</button>}
          <div className="org-actions">
            <button disabled={busy || !canAfford(renewalCost(e))} onClick={()=>send({type:'org-renew',employeeId:e.id})}>续付7日 · {renewalCost(e).gold}金币＋{renewalCost(e).tickets}券</button>
            {(['skill','management'] as const).map(ability=>{const cost=trainingCost(e,ability);return <button key={ability}
              disabled={busy||e[ability]>=e.potential||!canAfford(cost)} onClick={()=>send({type:'org-train',employeeId:e.id,ability})}>
              {ability==='skill'?'专业训练':'管理培训'} · {e[ability]>=e.potential?'已达潜力上限':`${cost.gold}金币＋${cost.tickets}券`}</button>;})}
            {e.role==='manager'?<button disabled={busy||staff(game,e.department).length>=EMPLOYEE_LIMIT} onClick={()=>{if(window.confirm('卸任后由玩家兼管部门，已开始的任务不变。'))send({type:'org-demote',employeeId:e.id});}}>卸任经理</button>
              : <button className="org-promote" disabled={busy||Boolean(appointmentReason(game,e))||!canAfford({gold:1000,tickets:2})} onClick={()=>appoint(e)}>任命为{DEPARTMENTS[e.department]}经理</button>}
            {e.role==='staff'&&<small>{appointmentReason(game,e)||'任命费用：1,000金币＋2券；不自动接管航班。'}</small>}
          </div>
          <details className="org-history" open><summary>员工履历</summary><p>{e.joinedAt===null?'旧版员工 · 入职时间未记录':`模拟历时 ${Math.floor(e.joinedAt/60)} 分时入职`}</p>
            <p>参与有偿航班 {e.flights} 班 · 交付 {e.deliveries} 单位<br/><small>业绩从组织系统启用后累计；同一航班可记录飞行员与负责人。</small></p>
            <ol>{[...e.history].reverse().map((item,index)=><li key={`${item.at}-${index}`}><time>模拟 {Math.floor(item.at/60)} 分</time>{item.text}</li>)}</ol>
          </details>
        </>:<div className="org-inspector-empty"><strong>选择一位员工</strong><p>先招募飞行员或地勤，点击头像查看能力、分配岗位与培养。</p><p>没有经理也能正常运输；公司2级后可任命专业能力达到2级的员工。</p></div>}
      </aside>
    </div>
  </section>;
}
