import type { GameState } from '../core/game.js';
import { companyAffairs, type Milestone } from '../core/talent.js';
import { airport } from '../core/catalog.js';
import { controller } from '../runtime.js';
import { useI18n } from '../i18n/I18n.js';
import { employeeDisplayName } from './organization-presentation.js';
import { ignore } from './Panels.js';

export function CompanyAffairs({ game, busy, onEmployee }: { game: GameState; busy: boolean; onEmployee: (id: number, training: boolean) => void }) {
  const { locale, airportName } = useI18n(), en = locale === 'en-US';
  const affairs = companyAffairs(game);
  return <section className="company-affairs" aria-label={en?'Company Affairs':'公司事务'}>
    <p>{en?'Optional advice based on current operations. Flights continue; nothing spends money automatically.':'根据实际经营状态提供建议；不打断航班，不自动花钱，暂缓不受惩罚。'}</p>
    {affairs.length ? affairs.map(a => {
      const employee=game.career.employees.find(e=>e.id===a.employeeId)!;
      const name=employeeDisplayName(employee), city=a.airportId?airportName(a.airportId,airport(a.airportId).city):'';
      return <article className="company-affair" key={a.key} data-affair={a.key}>
        <div><strong>{a.kind==='promotion'?(en?`${name}: ready for a management role`:`${name}已满足晋升条件`):a.kind==='training'?(en?`${name}: guided training available`:`${name}可接受经理带教`):(en?`${city}: ground coverage opportunity`:`${city}可安排地勤保障`)}</strong>
          <small>{a.kind==='promotion'?(en?'Keep an experienced specialist or prepare a manager. Promotion releases the current assignment.':'保留一线骨干，或培养部门经理；晋升将解除当前资产岗位。'):a.kind==='training'?(en?'Compare professional and management training; the current quote is shown before purchase.':'比较专业与管理两条培养路线；购买前显示当前报价。'):(en?`${name} is currently unassigned. Existing service deadlines remain unchanged.`:`${name}目前待分配；调动不影响已开始的补能。`)}</small></div>
        <button type="button" onClick={()=>onEmployee(employee.id,a.kind!=='ground')}>{en?'Review arrangement':'查看安排'}</button>
        <button type="button" disabled={busy} onClick={()=>ignore(controller.command({type:'defer-company-affair',key:a.key,signature:a.signature}))}>{en?'Defer':'暂缓'}</button>
      </article>;
    }):<p className="org-empty">{en?'No company affairs need attention. Training and staffing remain available at any time.':'暂无待处理公司事务；仍可随时主动培养或安排员工。'}</p>}
  </section>;
}
export function CompanyChronicle({ game }: { game: GameState }) {
  const { locale } = useI18n(), en=locale==='en-US';
  const name=(id:number)=>employeeDisplayName(game.career.employees.find(e=>e.id===id)!);
  const description=(m:Milestone)=>({
    'first-hire':en?`${name(m.employeeId)} joined the company.`:`${name(m.employeeId)}加入公司，团队开始成长。`,
    'internal-manager':en?`${name(m.employeeId)} was promoted from a specialist to a manager.`:`${name(m.employeeId)}从一线岗位晋升为部门经理。`,
    'two-departments':en?'Flight and ground teams are now both represented.':'飞行与地勤两支团队正式成形。',
    'first-mentoring':en?`${m.mentorId?name(m.mentorId):''} guided ${name(m.employeeId)} through professional training.`:`${m.mentorId?name(m.mentorId):''}指导${name(m.employeeId)}完成专业培养。`,
    'paid-flight':en?`${name(m.employeeId)} completed the first recorded paid transport flight.`:`${name(m.employeeId)}完成本阶段首次记录的有偿运输。`,
  })[m.kind];
  return <section className="company-chronicle" aria-label={en?'Company Chronicle':'公司纪事'}>
    <p>{en?'Key milestones are retained separately from the recent activity log. Unrecorded history is never invented.':'关键经历独立保留，不被日常续约记录覆盖；旧版本未记录的经历不补编。'}</p>
    {game.talent.milestones.length?<ol>{[...game.talent.milestones].reverse().map(m=><li key={m.kind}><small>{en?'Operating day':'经营第'} {Math.floor(m.at/86400)+1} {en?'':'天'} · {Math.floor(m.at%86400/3600)}:{String(Math.floor(m.at%3600/60)).padStart(2,'0')}</small><strong>{description(m)}</strong></li>)}</ol>:<p>{en?'New milestones will be recorded from this version onward.':'新版本起发生的关键经历将在这里保留。'}</p>}
  </section>;
}
