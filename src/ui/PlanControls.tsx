import { useState } from 'react';
import { airport } from '../core/catalog.js';
import { manifest, type GameState, type Plane } from '../core/game.js';
import { controller } from '../runtime.js';
import { dispatchPresentation } from './dispatch-presentation.js';
import { DispatchDialog } from './DispatchDialog.js';
import { energyText } from './EnergyService.js';
import { Icon, duration, money, ignore } from './Panels.js';

/** Only the explicit launch sends a command. Details and editing are UI state. */
export function PlanControls({ game, plane, stops, setStops, auto, setAuto, busy, onDepart, onCancel, onDetails }: {
  game: GameState; plane?: Plane; stops: string[]; setStops: (v: string[]) => void;
  auto: boolean; setAuto: (value: boolean) => void; busy: boolean;
  onDepart: () => void; onCancel: () => void; onDetails: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const view = dispatchPresentation(game, plane, stops, auto, busy);
  const { active, draft, summary, reason, requiredEnergy, warning } = view;
  const jobs = plane ? manifest(game, plane.id) : [];
  async function launch() {
    if (!view.canLaunch || !plane || !draft) return;
    if (!jobs.length && !window.confirm(`这是空机${stops.length > 1 ? '多段' : ''}调机路线，仍需支付运营成本。确定执行？`)) return;
    if (draft.undelivered && !window.confirm(`路线结束后仍有 ${draft.undelivered} 单未到最终目的地，将继续留在机上。确定执行？`)) return;
    try {
      if (stops.length === 1) await controller.command({ type: 'dispatch', planeId: plane.id, to: stops[0]!, auto });
      else await controller.command({ type: 'dispatch-plan', planeId: plane.id, stops });
      onDepart();
    } catch { /* The controller retains and displays the actual command error. */ }
  }
  const routeTitle = active ? `${airport(active.from).city} → ${airport(active.to).city} · ${active.id}` :
    plane ? [plane.airportId, ...stops].map(id => airport(id).city).join(' → ') : '尚未选择飞机';
  const alert = !active && (stops.length || view.lockedReason) ? reason || warning : '';
  return <>
    <nav className="dispatch-route-buttons" aria-label="路线编辑">
      {!active && <>
        <button className="route-console-button" aria-label="路线后退" disabled={busy || !stops.length} onClick={() => setStops(stops.slice(0, -1))}><span>路线</span><strong>后退</strong></button>
        <button className="route-console-button" aria-label="路线撤销" disabled={busy || !stops.length} onClick={() => setStops([])}><span>路线</span><strong>撤销</strong></button>
      </>}
      <button className="route-console-button route-cancel-button" aria-label={active ? '返回航班' : '取消起飞'} disabled={busy} onClick={onCancel}><span>{active ? '返回' : '取消'}</span><strong>{active ? '航班' : '起飞'}</strong></button>
      <button className="route-console-button" aria-label="查看路线" aria-haspopup="dialog" onClick={() => { onDetails(); setDetailsOpen(true); }}><span>查看</span><strong>路线</strong></button>
    </nav>
    {!active && <div className="dispatch-launch-area">
      {auto && <span className="dispatch-auto-badge" data-testid="auto-route-badge">自动往返</span>}
      <span id="dispatch-reason" className={alert ? 'dispatch-warning' : 'sr-only'} role="status">{alert || (!view.canLaunch ? reason : '')}</span>
      <button className="route-dispatch-button" data-testid="dispatch" aria-label="检票起飞" aria-describedby="dispatch-reason" disabled={!view.canLaunch} onClick={() => ignore(launch())}><Icon name="plane"/><strong>检票起飞</strong></button>
    </div>}
    {detailsOpen && <DispatchDialog title="路线详情" onClose={() => setDetailsOpen(false)}>
      <h3 className="dispatch-route-title">{routeTitle}</h3>
      <p data-testid="plan-summary">{active ? '当前航班已锁定，浏览不会修改目的地或账目。' : draft ? `${stops.length} 段 · ${duration(draft.duration)} · 成本 ${money(draft.cost)} · 交付 ${money(draft.revenue)} · 运输净收益 ${money(draft.profit)}` : view.error || '尚未选择路线，请在地图上依次点击城市。'}</p>
      <div className="dispatch-detail-facts">
        <span>交付收入 <b data-testid="network-revenue">{summary ? money(summary.revenue) : '—'}</b></span>
        <span>机上客货 <b>{jobs.length} 单</b></span>
        {plane && <span data-testid="network-energy">可用能量 {energyText(plane.energy.availableSeconds)} 点{active ? plane.energy.reservedSeconds ? ' · 当前航段已预留' : ' · 旧航班免扣' : draft && stops.length === 1 ? ` · 本段需 ${energyText(draft.legs[0]!.duration)} 点` : ''}</span>}
      </div>
      {!active && plane && <label className="dispatch-auto-choice"><input type="checkbox" checked={auto} disabled={busy || !plane.dispatcher || stops.length !== 1} onChange={e => setAuto(e.target.checked)}/>自动往返<span>{!plane.dispatcher ? '需在机库雇用调度员' : stops.length !== 1 ? '仅单一目的城市可用' : '需全部已装客货直达'}</span></label>}
      {draft && plane && <p data-testid="plan-energy">全程需 {energyText(requiredEnergy)} 点／可用 {energyText(plane.energy.availableSeconds)} 点（不含周转）。{reason || warning || '逐段预留能量，不预扣全程。'}</p>}
      {summary && <div className="dispatch-table-scroll" tabIndex={0} role="region" aria-label="航段费用明细">
        <table><caption>逐段费用与交付</caption><thead><tr><th scope="col">航段</th><th scope="col">飞行时间</th><th scope="col">运营成本</th><th scope="col">本段交付</th></tr></thead>
          <tbody>{(active ? [active] : draft?.legs ?? []).map((leg, i) => <tr key={i} data-testid="plan-leg"><th scope="row">{i + 1}. {airport(leg.from).city} → {airport(leg.to).city}</th><td>{duration(leg.duration)}</td><td>{money(leg.cost)}</td><td>{money(leg.revenue)}</td></tr>)}</tbody>
        </table>
      </div>}
      {active && plane && plane.itinerary.length > 0 && <p>后续：{plane.itinerary.map(id => airport(id).city).join(' → ')}</p>}
      <p className="dispatch-dialog-note">{active ? '已付成本不重复扣除；到达交付只包含本段最终目的地订单。' : '预计时间含途中周转。城市解锁后无需建设费；只在订单最终目的地交付。后续资金或能量不足，停在实际机场并保留客货。'}{draft && ` 路线结束后未交付 ${draft.undelivered} 单。`}</p>
      {alert && <p className="dispatch-detail-error">{alert}</p>}
    </DispatchDialog>}
  </>;
}
