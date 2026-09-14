import { autoAllowed } from '../core/career.js';
import { useState } from 'react';
import { airport } from '../core/catalog.js';
import { manifest, flightEnergy, type GameState, type Plane } from '../core/game.js';
import { controller } from '../runtime.js';
import { dispatchPresentation } from './dispatch-presentation.js';
import { DispatchDialog } from './DispatchDialog.js';
import { energyText } from './EnergyService.js';
import { Icon, duration, money, ignore } from './Panels.js';
import { useI18n } from '../i18n/I18n.js';

/** Only the explicit launch sends a command. Details and editing are UI state. */
export function PlanControls({ game, plane, stops, setStops, auto, setAuto, busy, onDepart, onCancel, onDetails }: {
  game: GameState; plane?: Plane; stops: string[]; setStops: (v: string[]) => void;
  auto: boolean; setAuto: (value: boolean) => void; busy: boolean;
  onDepart: () => void; onCancel: () => void; onDetails: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { ui, text, airportName } = useI18n();
  const city = (id: string) => airportName(id,airport(id).city);
  const view = dispatchPresentation(game, plane, stops, auto, busy);
  const { active, draft, summary, reason, requiredEnergy, warning } = view;
  const jobs = plane ? manifest(game, plane.id) : [];
  async function launch() {
    if (!view.canLaunch || !plane || !draft) return;
    if (!jobs.length && !window.confirm(ui('这是空机{multi}调机路线，仍需支付运营成本。确定执行？',{multi:stops.length>1?(ui('多段')):''}))) return;
    if (draft.undelivered && !window.confirm(ui('路线结束后仍有 {count} 单未到最终目的地，将继续留在机上。确定执行？',{count:draft.undelivered}))) return;
    try {
      if (stops.length === 1) await controller.command({ type: 'dispatch', planeId: plane.id, to: stops[0]!, auto });
      else await controller.command({ type: 'dispatch-plan', planeId: plane.id, stops });
      onDepart();
    } catch { /* The controller retains and displays the actual command error. */ }
  }
  const routeTitle = active ? `${city(active.from)} → ${city(active.to)} · ${active.id}` :
    plane ? [plane.airportId, ...stops].map(city).join(' → ') : ui('尚未选择飞机');
  const alert = !active && (stops.length || view.lockedReason) ? reason || warning : '';
  return <>
    <nav className="dispatch-route-buttons" aria-label={ui('路线编辑')}>
      {!active && <>
        <button className="route-console-button" aria-label={ui('路线后退')} disabled={busy || !stops.length} onClick={() => setStops(stops.slice(0, -1))}><span>{ui('路线')}</span><strong>{ui('后退')}</strong></button>
        <button className="route-console-button" aria-label={ui('路线撤销')} disabled={busy || !stops.length} onClick={() => setStops([])}><span>{ui('路线')}</span><strong>{ui('撤销')}</strong></button>
      </>}
      <button className="route-console-button route-cancel-button" aria-label={ui(active?'返回航班':'取消起飞')} disabled={busy} onClick={onCancel}><span>{ui(active?'返回':'取消')}</span><strong>{ui(active?'航班':'起飞')}</strong></button>
      <button className="route-console-button" aria-label={ui('查看路线')} aria-haspopup="dialog" onClick={() => { onDetails(); setDetailsOpen(true); }}><span>{ui('查看')}</span><strong>{ui('路线')}</strong></button>
    </nav>
    {!active && <div className="dispatch-launch-area">
      {auto && <span className="dispatch-auto-badge" data-testid="auto-route-badge">{ui('自动往返')}</span>}
      <span id="dispatch-reason" className={alert ? 'dispatch-warning' : 'sr-only'} role="status">{text(alert || (!view.canLaunch ? reason : ''))}</span>
      <button className="route-dispatch-button" data-testid="dispatch" aria-label={ui('检票起飞')} aria-describedby="dispatch-reason" disabled={!view.canLaunch} onClick={() => ignore(launch())}><Icon name="plane"/><strong>{ui('检票起飞')}</strong></button>
    </div>}
    {detailsOpen && <DispatchDialog title={ui('路线详情')} onClose={() => setDetailsOpen(false)}>
      <h3 className="dispatch-route-title">{routeTitle}</h3>
      <p data-testid="plan-summary">{active ? ui('当前航班已锁定，浏览不会修改目的地或账目。') : draft ? ui('{count} 段 · {time} · 成本 {cost} · 交付 {revenue} · 运输净收益 {profit}',{count:stops.length,time:duration(draft.duration),cost:money(draft.cost),revenue:money(draft.revenue),profit:money(draft.profit)}) : text(view.error) || ui('尚未选择路线，请在地图上依次点击城市。')}</p>
      <div className="dispatch-detail-facts">
        <span>{ui('交付收入')} <b data-testid="network-revenue">{summary ? money(summary.revenue) : '—'}</b></span>
        <span>{ui('机上客货')} <b>{jobs.length} {ui('单')}</b></span>
        {plane && <span data-testid="network-energy">{ui('可用能量 {value} 点',{value:energyText(plane.energy.availableSeconds)})}{active ? ` · ${ui(plane.energy.reservedSeconds?'已预留本段':'旧航班免扣')}` : draft && stops.length === 1 ? ` · ${ui('本段需 {value} 点',{value:energyText(flightEnergy(plane,draft.legs[0]!.duration))})}` : ''}</span>}
      </div>
      {!active && plane && <label className="dispatch-auto-choice"><input type="checkbox" checked={auto} disabled={busy || !autoAllowed(game,plane) || stops.length !== 1} onChange={e => setAuto(e.target.checked)}/>{ui('自动往返')}<span>{ui(!autoAllowed(game,plane)?'需分配飞行员并续付工资':stops.length!==1?'仅单一目的城市可用':'需全部已装客货直达')}</span></label>}
      {draft && plane && <p data-testid="plan-energy">{ui('全程需 {required} 点／可用 {available} 点（不含周转）。',{required:energyText(requiredEnergy),available:energyText(plane.energy.availableSeconds)})}{text(reason || warning) || ui('逐段预留能量，不预扣全程。')}</p>}
      {summary && <div className="dispatch-table-scroll" tabIndex={0} role="region" aria-label={ui('逐段费用与交付')}>
        <table><caption>{ui('逐段费用与交付')}</caption><thead><tr><th scope="col">{ui('航段')}</th><th scope="col">{ui('飞行时间')}</th><th scope="col">{ui('运营成本')}</th><th scope="col">{ui('本段交付')}</th></tr></thead>
          <tbody>{(active ? [active] : draft?.legs ?? []).map((leg, i) => <tr key={i} data-testid="plan-leg"><th scope="row">{i + 1}. {city(leg.from)} → {city(leg.to)}</th><td>{duration(leg.duration)}</td><td>{money(leg.cost)}</td><td>{money(leg.revenue)}</td></tr>)}</tbody>
        </table>
      </div>}
      {active && plane && plane.itinerary.length > 0 && <p>{ui('后续：{route}',{route:plane.itinerary.map(city).join(' → ')})}</p>}
      <p className="dispatch-dialog-note">{ui(active?'已付成本不重复扣除；到达交付只包含本段最终目的地订单。':'预计时间含途中周转。城市解锁后无需建设费；只在订单最终目的地交付。后续资金或能量不足，停在实际机场并保留客货。')} {draft && ui('路线结束后未交付 {count} 单。',{count:draft.undelivered})}</p>
      {alert && <p className="dispatch-detail-error">{text(alert)}</p>}
    </DispatchDialog>}
  </>;
}
