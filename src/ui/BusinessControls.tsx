import { useState } from 'react';
import type { Command, GameState } from '../core/game.js';
import type { Employee } from '../core/organization.js';
import { airport } from '../core/catalog.js';
import { BUSINESS_CATALOG, BUSINESS_KINDS, MAX_BUSINESS_LEVEL, businessOpeningReason, businessTeamQuote, businessTrainingQuote, employeeTeam, type BusinessKind } from '../core/company-business.js';
import { useI18n } from '../i18n/I18n.js';
import { EmployeePortrait } from './EmployeePortrait.js';
import './company-business.css';

export const businessRate = (value: number) => (value / 1000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 });
export function BusinessOpening({ game, busy, send, close }: { game: GameState; busy: boolean; send: (c: Command) => void; close: () => void }) {
  const { locale, airportName, text } = useI18n(), en = locale === 'en-US';
  const say = (zh: string, english: string) => en ? english : zh;
  const [airportId, setAirportId] = useState(game.airports[0]!.id);
  return <div className="org-panel business-opening" aria-label={say('扩张公司业务', 'Expand company business')}>
    <header><h3>{say('开设城市业务团队', 'Open a city business team')}</h3><button type="button" onClick={close}>{say('返回组织树', 'Back to organization')}</button></header>
    <p>{say('业务工资和管理成本从业务收入中扣除，仅前台经营时间结算；不重复结算航班客货。', 'Wages and operating costs are deducted from business revenue during foreground play only. Flight orders are never paid twice.')}</p>
    <label>{say('分公司城市', 'Branch city')}<select value={airportId} onChange={e => setAirportId(e.target.value)}>{game.airports.map(a => <option key={a.id} value={a.id}>{airportName(a.id, airport(a.id).city)} · {say('机场', 'Airport')} {a.level}</option>)}</select></label>
    <div className="business-options">{BUSINESS_KINDS.map((kind: BusinessKind) => {
      const spec = BUSINESS_CATALOG[kind], reason = businessOpeningReason(game, airportId, kind);
      const net = Math.floor(spec.gross * 1.02) - spec.wage - spec.overhead;
      return <article key={kind} data-business-kind={kind}>
        <h4>{en ? spec.en : spec.zh}</h4><p>{say('含1名主管、1名员工及2个员工岗位', 'Includes a leader, one worker and two worker slots')}</p>
        <strong>{say('基础净收入', 'Base net income')} +{businessRate(net)} {say('金币/秒', 'coins/s')}</strong>
        <small>{say('总经理直属加成另计；升级机场可开放更高等级业务。', 'A reporting chief can add a bonus. Upgrade airports to unlock higher-tier businesses.')}</small>
        <button type="button" disabled={busy || Boolean(reason)} onClick={() => send({ type: 'open-business-team', airportId, kind })}>{say(`支付 ${spec.opening} 开设${spec.zh}`, `Open ${spec.en} for ${spec.opening}`)}</button>
        {reason && <small className="org-warning">{text(reason)}</small>}
      </article>;
    })}</div>
  </div>;
}
export function BusinessEmployeeDetail({ game, employee, busy, send }: { game: GameState; employee: Employee; busy: boolean; send: (c: Command) => void }) {
  const { locale, airportName, text } = useI18n(), en = locale === 'en-US';
  const say = (zh: string, english: string) => en ? english : zh;
  const team = employeeTeam(game, employee);
  if (!team) return null;
  const spec = BUSINESS_CATALOG[team.kind], quote = businessTeamQuote(game, team), training = businessTrainingQuote(game, employee);
  const airportLevel = game.airports.find(a => a.id === team.airportId)!.level;
  const full = quote.workers.length >= quote.capacity, expansionBlocked = team.level >= Math.min(MAX_BUSINESS_LEVEL, airportLevel + 2);
  const payback = (cost: number, gain: number) => gain > 0 ? Math.ceil(cost * 1000 / gain / 60) : null;
  return <div className="business-detail" data-testid="business-employee-detail">
    <div className="org-detail-heading"><EmployeePortrait id={employee.id}/><div><h3>{employee.name}</h3><strong>{employee.role === 'manager' ? say('业务主管', 'Business leader') : say('业务专员', 'Business worker')}</strong><small>{airportName(team.airportId, airport(team.airportId).city)} · {en ? spec.en : spec.zh}</small></div></div>
    <dl className="business-metrics"><div><dt>{say('团队净收入', 'Team net')}</dt><dd data-testid="business-team-net">+{businessRate(quote.net)} {say('金币/秒', 'coins/s')}</dd></div><div><dt>{say('营业收入', 'Revenue')}</dt><dd>{businessRate(quote.gross)}/s</dd></div><div><dt>{say('工资与运营成本', 'Wages and costs')}</dt><dd>{businessRate(quote.costs)}/s</dd></div><div><dt>{say('员工岗位', 'Worker slots')}</dt><dd>{quote.workers.length}/{quote.capacity}</dd></div></dl>
    <p>{say('不消耗点券，不需要续约。总经理的预付合同不在这里重复扣费。', 'No tickets or renewals. The chief’s prepaid contract is not charged again here.')}</p>
    <section><h4>{say('扩充团队', 'Grow this team')}</h4>
      <button type="button" disabled={busy || full || game.credits < quote.hiringCost} onClick={() => send({ type: 'hire-business-worker', teamId: team.id })}>{say(`招募业务员工 · ${quote.hiringCost}金币`, `Hire worker · ${quote.hiringCost} coins`)}</button>
      <small>{say(`净收入增加 ${businessRate(quote.hiringGain)}/秒，预计 ${payback(quote.hiringCost, quote.hiringGain)} 分钟回本`, `Net +${businessRate(quote.hiringGain)}/s; estimated payback ${payback(quote.hiringCost, quote.hiringGain)} min`)}</small>
      {!full && game.credits < quote.hiringCost && <small className="org-warning">{say('金币不足', 'Insufficient coins')}</small>}
      {full && <small className="org-warning">{say('岗位已满，请先扩建', 'No free slots; expand first')}</small>}
      <button type="button" disabled={busy || expansionBlocked || game.credits < quote.expansionCost} onClick={() => send({ type: 'expand-business-team', teamId: team.id })}>{say(`扩建增加2个岗位 · ${quote.expansionCost}金币`, `Expand by two slots · ${quote.expansionCost} coins`)}</button>
      {!expansionBlocked && game.credits < quote.expansionCost && <small className="org-warning">{say('金币不足', 'Insufficient coins')}</small>}
      {expansionBlocked && <small>{say('请先升级机场，或团队已达到扩建上限', 'Upgrade the airport, or this team has reached its expansion limit')}</small>}
    </section>
    <section><h4>{say('提高产出', 'Improve output')}</h4>
      <button type="button" disabled={busy || training.maximum || game.credits < training.cost} onClick={() => send({ type: 'train-business-employee', employeeId: employee.id })}>{say(`培养至${training.next}级 · ${training.cost}金币`, `Train to level ${training.next} · ${training.cost} coins`)}</button>
      <small>{say('团队净收入增加', 'Team net increase')} {businessRate(training.gain)}/s</small>
      {!training.maximum && game.credits < training.cost && <small className="org-warning">{say('金币不足', 'Insufficient coins')}</small>}
      {training.maximum && <small>{say('已达到潜力上限', 'Potential limit reached')}</small>}
    </section>
    <details><summary>{say('个人履历', 'Personal history')}</summary>{employee.history.map((h, i) => <p key={i}>{text(h.text)}</p>)}</details>
  </div>;
}
