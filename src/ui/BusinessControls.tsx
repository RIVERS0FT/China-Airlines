import { useState } from 'react';
import type { Command, GameState } from '../core/game.js';
import type { Employee } from '../core/organization.js';
import { airport } from '../core/catalog.js';
import { BUSINESS_CATALOG, BUSINESS_KINDS, MAX_BUSINESS_LEVEL, businessOpeningReason, businessOpeningQuote, businessTeamQuote, businessTrainingQuote, employeeTeam, type BusinessKind } from '../core/company-business.js';
import { useI18n } from '../i18n/I18n.js';
import { EmployeePortrait } from './EmployeePortrait.js';
import './company-business.css';

export const businessRate = (value: number) => (value / 1000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 });
export function BusinessOpening({ game, busy, send, close }: { game: GameState; busy: boolean; send: (c: Command) => void; close: () => void }) {
  const { locale, airportName, text, t } = useI18n(), en = locale === 'en-US';
  const say = (zh: string, english: string) => en ? english : zh;
  const [airportId, setAirportId] = useState(game.airports[0]!.id);
  return <div className="org-panel business-opening" aria-label={say('扩张公司业务', 'Expand company business')}>
    <header><h3>{say('开设城市业务团队', 'Open a city business team')}</h3><button type="button" onClick={close}>{say('返回组织树', 'Back to organization')}</button></header>
    <label>{say('分公司城市', 'Branch city')}<select value={airportId} onChange={e => setAirportId(e.target.value)}>{game.airports.map(a => <option key={a.id} value={a.id}>{airportName(a.id, airport(a.id).city)} · {t('airport.facilityLevel',{level:a.level})}</option>)}</select></label>
    <div className="business-options">{BUSINESS_KINDS.map((kind: BusinessKind) => {
      const spec = BUSINESS_CATALOG[kind], reason = businessOpeningReason(game, airportId, kind);
      const quote = businessOpeningQuote(game, kind);
      return <article key={kind} data-business-kind={kind}>
        <h4>{en ? spec.en : spec.zh}</h4><p>{say('含1名主管、1名员工及2个员工岗位', 'Includes a leader, one worker and two worker slots')}</p>
        <strong>{say('预计净收入', 'Estimated net income')} +{businessRate(quote.net)} {say('金币/秒', 'coins/s')}</strong>
        <small>{say(`按当前费率，单人团队约 ${Math.ceil(quote.payback ?? 0)} 分钟回本；招满2人总投入 ${quote.staffedCost} 金币，净收入 ${businessRate(quote.staffedNet)}/秒。`, `At current rates: single-worker payback about ${Math.ceil(quote.payback ?? 0)} min. Staffing both slots costs ${quote.staffedCost} coins in total; net ${businessRate(quote.staffedNet)}/s.`)}</small>
        <button type="button" disabled={busy || Boolean(reason)} onClick={() => send({ type: 'open-business-team', airportId, kind })}>{say(`支付 ${quote.cost} 开设${spec.zh}`, `Open ${spec.en} for ${quote.cost}`)}</button>
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
  const payback = (value: number | null) => value === null ? say('无新增收益', 'No income increase') : say(`约 ${Math.ceil(value)} 分钟回本`, `About ${Math.ceil(value)} min payback`);
  return <div className="business-detail" data-testid="business-employee-detail">
    <div className="org-detail-heading"><EmployeePortrait id={employee.id}/><div><h3>{employee.name}</h3><strong>{employee.role === 'manager' ? say('业务主管', 'Business leader') : say('业务专员', 'Business worker')}</strong><small>{airportName(team.airportId, airport(team.airportId).city)} · {en ? spec.en : spec.zh}</small></div></div>
    <dl className="business-metrics"><div><dt>{say('团队净收入', 'Team net')}</dt><dd data-testid="business-team-net">+{businessRate(quote.net)} {say('金币/秒', 'coins/s')}</dd></div><div><dt>{say('营业收入', 'Revenue')}</dt><dd>{businessRate(quote.gross)}/s</dd></div><div><dt>{say('工资与运营成本', 'Wages and costs')}</dt><dd>{businessRate(quote.costs)}/s</dd></div><div><dt>{say('员工岗位', 'Worker slots')}</dt><dd>{quote.workers.length}/{quote.capacity}</dd></div></dl>
    <section><h4>{say('扩充团队', 'Grow this team')}</h4>
      <button type="button" disabled={busy || full || game.credits < quote.hiringCost} onClick={() => send({ type: 'hire-business-worker', teamId: team.id })}>{say(`招募业务员工 · ${quote.hiringCost}金币`, `Hire worker · ${quote.hiringCost} coins`)}</button>
      <small>{say(`净收入增加 ${businessRate(quote.hiringGain)}/秒`, `Net +${businessRate(quote.hiringGain)}/s`)} · {payback(quote.hiringPayback)}</small>
      {!full && game.credits < quote.hiringCost && <small className="org-warning">{say('金币不足', 'Insufficient coins')}</small>}
      {full && <small className="org-warning">{say('岗位已满，请先扩建', 'No free slots; expand first')}</small>}
      <button type="button" disabled={busy || expansionBlocked || game.credits < quote.expansionCost} onClick={() => send({ type: 'expand-business-team', teamId: team.id })}>{say(`扩建增加2个岗位 · ${quote.expansionCost}金币`, `Expand by two slots · ${quote.expansionCost} coins`)}</button>
      <small>{say('扩建只增加空位；按当前费率，扩建并招聘2人的总投入', 'Expansion creates empty slots. At current rates, expansion plus two hires costs')} {quote.expansionStaffedCost} {say('金币', 'coins')} · +{businessRate(quote.expansionGain)}/s · {payback(quote.expansionPayback)}</small>
      {!expansionBlocked && game.credits < quote.expansionCost && <small className="org-warning">{say('金币不足', 'Insufficient coins')}</small>}
      {expansionBlocked && <small>{say('请先升级运营设施，或团队已达到扩建上限', 'Upgrade operating facilities, or this team has reached its expansion limit')}</small>}
    </section>
    <section><h4>{say('提高产出', 'Improve output')}</h4>
      <button type="button" disabled={busy || training.maximum || training.gain <= 0 || game.credits < training.cost} onClick={() => send({ type: 'train-business-employee', employeeId: employee.id })}>{say(`培养至${training.next}级 · ${training.cost}金币`, `Train to level ${training.next} · ${training.cost} coins`)}</button>
      <small>{say('团队净收入增加', 'Team net increase')} {businessRate(training.gain)}/s · {payback(training.payback)}</small>
      {!training.maximum && game.credits < training.cost && <small className="org-warning">{say('金币不足', 'Insufficient coins')}</small>}
      {training.maximum && <small>{say('已达到潜力上限', 'Potential limit reached')}</small>}
    </section>
    <details><summary>{say('个人履历', 'Personal history')}</summary>{employee.history.map((h, i) => <p key={i}>{text(h.text)}</p>)}</details>
  </div>;
}
