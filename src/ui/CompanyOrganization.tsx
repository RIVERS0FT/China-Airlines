import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Command, GameState } from '../core/game.js';
import { aircraftSpecs, airport } from '../core/catalog.js';
import {
  DEPARTMENTS, directReports, effectiveManager, employmentPrice, groundServiceQuote, managerCapacity,
  roleName, staffIn, staffLimit, trainingQuote, type Department, type Employee, type EmployeeRole, type Training,
} from '../core/organization.js';
import { controller } from '../runtime.js';
import { artAsset } from './art-assets.js';
import { ignore, duration } from './Panels.js';
import { useGameViewport } from './GameViewport.js';
import { organizationLayout, ORG_NODE_HEIGHT, ORG_NODE_WIDTH } from './organization-layout.js';
import './organization.css';

function status(s: GameState, e: Employee) {
  if (e.paidUntil <= s.simTime) return '待续约';
  if (e.role === 'manager') return `管理 ${directReports(s, e.id).length}/${managerCapacity(e)}`;
  if (e.planeId) return `${e.planeId} · ${s.fleet.find(p => p.id === e.planeId)?.flight ? '执勤中' : '已上岗'}`;
  if (e.airportId) return `${airport(e.airportId).city} · 已上岗`;
  return '待分配';
}
function assignmentReason(s: GameState, e: Employee) {
  const p = s.fleet.find(p => p.id === e.planeId);
  return p && (p.flight || p.autoRouteId || p.itinerary.length || p.energy.serviceUntil !== null || p.readyAt > s.simTime)
    ? '请先停止运营并等待地面周转，再调岗或晋升' : '';
}
export function CompanyOrganization({ game, busy, onPlane, onAirport }: {
  game: GameState; busy: boolean; onPlane?: (id: string) => void; onAirport?: (id: string) => void;
}) {
  const people = game.career.employees;
  const [selectedId, setSelectedId] = useState<number | null>(people[0]?.id ?? null);
  const [job, setJob] = useState('flight-specialist');
  const [collapsed, setCollapsed] = useState<Record<Department, boolean>>({ flight: false, ground: false });
  const [zoom, setZoom] = useState(1);
  const viewport = useRef<HTMLDivElement>(null), previousCount = useRef(people.length);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  const { scale } = useGameViewport();
  const selected = people.find(e => e.id === selectedId) ?? people.at(-1);
  const layout = organizationLayout(game, collapsed);
  const [department, role] = job.split('-') as [Department, EmployeeRole];
  const price = employmentPrice({ department, role }, true);
  const vacancies = staffIn(game, department, role).length < staffLimit(department, role);
  const send = (command: Command) => ignore(controller.command(command));
  const afford = (cost: { gold: number; tickets: number }) => game.credits >= cost.gold && game.career.tickets >= cost.tickets;
  useEffect(() => {
    if (people.length > previousCount.current) setSelectedId(people.at(-1)!.id);
    previousCount.current = people.length;
  }, [people]);
  function moveZoom(next: number) {
    const clamped = Math.max(0.5, Math.min(1.5, Math.round(next * 10) / 10));
    setZoom(clamped);
  }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest('button')) return;
    const el = event.currentTarget;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop };
    el.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current; if (!d || d.id !== event.pointerId) return;
    event.currentTarget.scrollLeft = d.left - (event.clientX - d.x) / scale;
    event.currentTarget.scrollTop = d.top - (event.clientY - d.y) / scale;
  }
  function pointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  const node = (e: Employee, positioned = false) => <button type="button" key={e.id}
    className={`org-person${positioned ? ' org-positioned' : ''}`} data-employee-id={e.id}
    data-state={e.paidUntil <= game.simTime ? 'expired' : e.role === 'specialist' && !e.planeId && !e.airportId ? 'waiting' : 'active'}
    aria-label={`查看${e.name} · ${roleName(e)}`} aria-pressed={selected?.id === e.id} onClick={() => setSelectedId(e.id)}>
    <img src={artAsset('pilot-avatar-v1.png')} alt=""/><span><strong>{e.name}</strong><small>{roleName(e)}</small></span>
    <em>{status(game, e)}</em>
  </button>;
  return <section className="company-organization" aria-label="公司组织管理">
    <div className="org-toolbar">
      <div><h3>公司组织</h3><small>{people.length} 名员工 · 飞行与地勤 · 玩家可直接管理</small></div>
      <div className="org-recruit">
        <label><span className="org-sr-only">招募岗位</span><select aria-label="招募岗位" value={job} disabled={busy} onChange={e => setJob(e.target.value)}>
          <option value="flight-specialist">飞行员 · {staffIn(game, 'flight').length}/8</option>
          <option value="ground-specialist">地勤专员 · {staffIn(game, 'ground').length}/4</option>
          <option value="flight-manager">飞行部经理 · {staffIn(game, 'flight', 'manager').length}/1</option>
          <option value="ground-manager">地勤部经理 · {staffIn(game, 'ground', 'manager').length}/1</option>
        </select></label>
        <button disabled={busy || !vacancies || !afford(price)} onClick={() => send({ type: 'recruit-employee', department, role })}>招募{roleName({department, role})}</button>
        <small>{price.gold.toLocaleString('zh-CN')}金币＋{price.tickets}券 · 含7天工资{!vacancies ? ' · 岗位已满' : !afford(price) ? ' · 资金不足' : ''}</small>
      </div>
    </div>
    <div className="org-workspace">
      <div className="org-tree-area">
        <div className="org-view-tools" aria-label="组织树显示控制">
          {(['flight','ground'] as const).map(d => <button key={d} aria-expanded={!collapsed[d]} onClick={() => setCollapsed(old => ({ ...old, [d]: !old[d] }))}>{collapsed[d] ? '展开' : '折叠'}{DEPARTMENTS[d]}</button>)}
          <span className="org-zoom"><button aria-label="缩小组织树" disabled={zoom <= 0.5} onClick={() => moveZoom(zoom - 0.1)}>−</button><output aria-label="组织树缩放">{Math.round(zoom * 100)}%</output><button aria-label="放大组织树" disabled={zoom >= 1.5} onClick={() => moveZoom(zoom + 0.1)}>＋</button></span>
          <button onClick={() => { setZoom(1); if (viewport.current) { viewport.current.scrollTop = 0; viewport.current.scrollLeft = 0; } }}>复位</button>
        </div>
        <div ref={viewport} className="org-scroll" role="region" aria-label="公司组织架构树" tabIndex={0}
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={() => { drag.current = null; }}
          onKeyDown={e => {
            if (e.target !== e.currentTarget) return;
            const steps: Record<string, [number, number]> = { ArrowDown: [0, 60], ArrowUp: [0, -60], ArrowLeft: [-60, 0], ArrowRight: [60, 0] };
            if (steps[e.key]) { e.preventDefault(); const [x, y] = steps[e.key]!; e.currentTarget.scrollLeft += x; e.currentTarget.scrollTop += y; }
            if (e.key === 'Home') { e.preventDefault(); e.currentTarget.scrollTop = 0; e.currentTarget.scrollLeft = 0; }
          }}>
          <div style={{ width: layout.width * zoom, height: layout.height * zoom }} className="org-scaled-extent">
            <div className="org-canvas" style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})` }}>
              <svg width={layout.width} height={layout.height} aria-hidden="true" className="org-connections">
                {layout.edges.map((edge, i) => <path key={i} d={edge.path} className={edge.direct ? 'org-direct-link' : ''}/>)}
                {layout.labels.map((label, i) => <text key={i} x={label.x} y={label.y} textAnchor="middle">{label.text}</text>)}
              </svg>
              <div className="org-founder" style={{ left: 278, top: 12 }}><span>总</span><div><strong>创始人 / 总经理</strong><small>玩家 · 公司负责人</small></div></div>
              {layout.nodes.map(n => <div key={n.employee.id} className="org-node-position" style={{ left: n.x, top: n.y, width: ORG_NODE_WIDTH, height: ORG_NODE_HEIGHT }}>{node(n.employee, true)}</div>)}
              {layout.vacant.map(v => <button key={v.department} className="org-vacancy" style={{ left: v.x, top: v.y, width: ORG_NODE_WIDTH, height: ORG_NODE_HEIGHT }} onClick={() => setJob(`${v.department}-manager`)}><strong>＋ 待任命</strong><small>{DEPARTMENTS[v.department]}经理</small><small>非必需岗位</small></button>)}
            </div>
          </div>
        </div>
        <p className="org-legend">实线：经理汇报关系；虚线：玩家直管。拖动空白处或用方向键浏览，人物节点可直接选择。</p>
        <section className="org-pending" aria-label="待分配人员"><header><strong>待分配人员</strong><small>玩家直管 · 尚未绑定飞机或机场</small></header>
          <div>{layout.pending.length ? layout.pending.map(e => node(e)) : <small>暂无待分配人员</small>}</div>
        </section>
      </div>
      <aside className="org-detail" aria-label="员工详情" aria-live="polite">
        {selected ? <EmployeeDetail game={game} employee={selected} busy={busy} send={send} afford={afford} onPlane={onPlane} onAirport={onAirport}/> : <div className="org-empty-detail"><h3>组建第一支团队</h3><p>先招募飞行员并分配飞机，或招募地勤专员负责机场。经理并非运营前提。</p><p>员工的专业与管理能力可以分别培养，符合条件后可晋升部门经理。</p></div>}
      </aside>
    </div>
  </section>;
}
function EmployeeDetail({ game, employee: e, busy, send, afford, onPlane, onAirport }: {
  game: GameState; employee: Employee; busy: boolean; send: (cmd: Command) => void;
  afford: (cost: { gold: number; tickets: number }) => boolean; onPlane?: (id: string) => void; onAirport?: (id: string) => void;
}) {
  const contract = employmentPrice(e), reason = assignmentReason(game, e), manager = effectiveManager(game, e);
  const role = e.role === 'manager' ? 'specialist' : 'manager';
  const promotionReason = reason || (staffIn(game, e.department, role).length >= staffLimit(e.department, role) ? '目标岗位已满' :
    role === 'manager' && (e.skill < 2 || e.management < 1) ? '晋升需要专业2级、管理1级' : '');
  return <>
    <div className="org-detail-heading"><img src={artAsset('pilot-avatar-v1.png')} alt=""/><div><h3>{e.name}</h3><strong>{roleName(e)}</strong><small>{status(game, e)}</small></div></div>
    <dl className="org-attributes"><div><dt>专业</dt><dd>{e.skill}</dd></div><div><dt>管理</dt><dd>{e.management}</dd></div><div><dt>潜力上限</dt><dd>{e.potential}</dd></div></dl>
    {e.department === 'flight' && e.role === 'specialist' && <small>每级专业能力增加3%运输公司经验。个人业绩只记录有偿运输。</small>}
    {e.department === 'ground' && e.role === 'specialist' && <small>每级专业能力提升2%补能效率，仅作用于负责机场的后续服务。</small>}
    <p className="org-trait">{e.trait === 'mentor' ? '特长：善于带教（任经理后培训折扣额外5%，总折扣上限20%）' : '特长：高效执行（任经理时管理容量＋1；任地勤时补能效率额外5%，总提升上限30%）'}</p>
    {e.role === 'manager' ? <p>直属 {directReports(game, e.id).length} 人，有效管理容量 {managerCapacity(e)} 人。按员工编号覆盖前 {managerCapacity(e)} 人；超编不影响基础运营。</p> : <>
      <label>直属上级<select aria-label={`${e.name}直属上级`} value={e.managerId ?? ''} disabled={busy} onChange={event => send({ type: 'report-to', employeeId: e.id, managerId: event.target.value ? Number(event.target.value) : null })}>
        <option value="">玩家直管</option>{staffIn(game, e.department, 'manager').map(m => <option key={m.id} value={m.id}>{m.name} · {roleName(m)}</option>)}
      </select></label>
      <small>{manager ? `${manager.name}的管理效果生效` : e.managerId !== null ? '经理合同到期或超出管理容量，基础运营不受影响' : '直接向玩家汇报，不要求聘请经理'}</small>
      <label>工作岗位<select aria-label={`${e.name}岗位`} disabled={busy || Boolean(reason)} value={(e.department === 'flight' ? e.planeId : e.airportId) ?? ''} onChange={event => send(e.department === 'flight' ? { type: 'assign-pilot', pilotId: e.id, planeId: event.target.value || null } : { type: 'assign-ground', employeeId: e.id, airportId: event.target.value || null })}>
        <option value="">待分配</option>{e.department === 'flight' ? game.fleet.map(p => <option key={p.id} value={p.id} disabled={game.career.employees.some(other => other.id !== e.id && other.planeId === p.id) || Boolean(p.flight || p.autoRouteId || p.itinerary.length || p.energy.serviceUntil !== null || p.readyAt > game.simTime)}>{p.id} · {aircraftSpecs(p).name}</option>) : game.airports.map(a => <option key={a.id} value={a.id} disabled={game.career.employees.some(other => other.id !== e.id && other.airportId === a.id)}>{airport(a.id).city}</option>)}
      </select></label>
      {e.airportId && <small>该机场下次补能 {groundServiceQuote(game, e.airportId).seconds} 秒；已开始的服务不变。</small>}
      {e.planeId && onPlane && <button onClick={() => onPlane(e.planeId!)}>查看负责飞机</button>}
      {e.airportId && onAirport && <button onClick={() => onAirport(e.airportId!)}>前往负责机场</button>}
    </>}
    {reason && <p className="org-warning">{reason}</p>}
    <div className="org-contract"><strong>{e.paidUntil > game.simTime ? `合同剩余 ${duration(e.paidUntil - game.simTime)}` : '合同已到期 · 等待续约'}</strong><small>到期不产生债务；在途航班与已开始补能照常完成。</small>
      <button disabled={busy || !afford(contract)} onClick={() => send({ type: 'renew-employee', employeeId: e.id })}>续付7天 · {contract.gold}金币＋{contract.tickets}券</button>
    </div>
    <div className="org-training">{(['skill','management'] as Training[]).map(training => {
      const cost = trainingQuote(game, e, training), label = training === 'skill' ? '专业' : '管理';
      return <div key={training}><button disabled={busy || cost.maximum || !afford(cost)} onClick={() => send({ type: 'train-employee', employeeId: e.id, training })}>{label}培训 · {cost.maximum ? '已达潜力上限' : `${cost.gold}金币＋${cost.tickets}券`}</button>{cost.discount > 0 && <small>经理培养节省 {cost.discount}% 金币</small>}</div>;
    })}</div>
    <button className="org-role-action" disabled={busy || Boolean(promotionReason)} onClick={() => {
      const text = role === 'manager' ? '晋升后解除飞机或机场岗位，原合同期限保留。确定晋升？' : '转任后所有直属员工改为玩家直管，原合同期限保留。确定转任？';
      if (window.confirm(text)) send({ type: 'employee-role', employeeId: e.id, role });
    }}>{role === 'manager' ? '晋升部门经理' : '转任专业岗位'}</button><small>{promotionReason || '转任不补扣费用，下次续约使用新岗位价格'}</small>
    <details className="org-history"><summary>员工履历 · {e.flights} 班 / {e.deliveries} 份客货</summary><p>{e.joinedAt === null ? '历史入职时间未知；业绩从本次升级后开始记录。' : `入职于经营时刻 ${Math.floor(e.joinedAt)} 秒。`}</p><ol>{e.history.map((item, i) => <li key={`${item.at}-${i}`}><small>经营时刻 {Math.floor(item.at)} 秒</small>{item.text}</li>)}</ol><small>仅保留最近20条经历；累计业绩持续保存。</small></details>
  </>;
}
