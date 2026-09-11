import { energyDepartureReason } from '../core/energy.js';
import { energyText } from './EnergyService.js';
import { airport } from '../core/catalog.js';
import { MAX_PLAN_LEGS, manifest, planQuote, type GameState, type Plane } from '../core/game.js';
import { controller } from '../runtime.js';
import { duration, money, ignore } from './Panels.js';
import './plan-details.css';

/** Planning edits are a local draft. Only the confirmed command changes simulation state. */
export function PlanControls({ game, plane, stops, setStops, candidate, busy, onDepart }: {
  game: GameState; plane: Plane; stops: string[]; setStops: (v: string[]) => void;
  candidate: string; busy: boolean; onDepart: () => void;
}) {
  let preview: ReturnType<typeof planQuote> | null = null, error = '';
  try {
    if (stops.length) preview = planQuote(game, plane, stops);
  } catch (e) {
    error = e instanceof Error ? e.message : '计划无效';
  }
  const locked = busy || Boolean(plane.flight || plane.autoRouteId || plane.itinerary.length || plane.energy.serviceUntil !== null) || plane.readyAt > game.simTime;
  const energyReason = preview ? energyDepartureReason(plane.energy, preview.legs[0]!.duration) : '';
  const requiredEnergy = preview?.legs.reduce((sum, leg) => sum + leg.duration, 0) ?? 0;
  const last = stops.at(-1) ?? plane.airportId;
  async function launch() {
    if (!preview) return;
    if (!manifest(game, plane.id).length && !window.confirm('这是空机多段调机计划，所有航段仍需支付成本。确定执行？')) return;
    if (preview.undelivered && !window.confirm(`计划结束后仍有 ${preview.undelivered} 单未到最终目的地，将继续留在机上。确定执行？`)) return;
    try {
      await controller.command({ type: 'dispatch-plan', planeId: plane.id, stops });
      onDepart();
    } catch { /* Controller renders errors. */ }
  }
  return <section className="plan-editor" aria-label="多段运输计划">
    <div className="plan-stop-row">
      <b>{airport(plane.airportId).city}</b>
      {stops.map((id, i) => <span className="plan-stop" key={`${id}-${i}`}>→ {i + 1}. {airport(id).city}</span>)}
      {!stops.length && <span className="plan-hint">在地图选择机场，再添加航段</span>}
      <div className="plan-edit-actions">
        <button disabled={locked || candidate === last || stops.length >= MAX_PLAN_LEGS || !game.airports.some(a => a.id === candidate)} onClick={() => setStops([...stops, candidate])}>添加{airport(candidate).city}航段</button>
        <button disabled={locked || !stops.length} onClick={() => setStops(stops.slice(0, -1))}>撤销末段</button>
        <button disabled={locked || !stops.length} onClick={() => setStops([])}>清空计划</button>
      </div>
    </div>
    {preview && <details className="plan-breakdown">
      <summary>逐段费用与交付</summary>
      <div className="plan-table-scroll" tabIndex={0} role="region" aria-label="航段费用明细">
        <table>
          <caption>建设费用单独计入，运输净收益不含建设费用；同一航线只收一次建设费。逐段扣运营费，不预扣全程；资金或能量不足则停在实际机场并保留客货。{preview.undelivered > 0 ? `计划后还有 ${preview.undelivered} 单留在机上。` : '本计划覆盖全部已装订单的目的地。'}</caption>
          <thead><tr><th scope="col">航段</th><th scope="col">飞行时间</th><th scope="col">运营成本</th><th scope="col">本段交付</th><th scope="col">航线建设</th></tr></thead>
          <tbody>{preview.legs.map((leg, i) => <tr key={i} data-testid="plan-leg">
            <th scope="row">{i + 1}. {airport(leg.from).city} → {airport(leg.to).city}</th>
            <td>{duration(leg.duration)}</td><td>{money(leg.cost)}</td><td>{money(leg.revenue)}</td>
            <td>{leg.opened ? '已开通' : leg.openingCost > 0 ? money(leg.openingCost) : '复用前段航线 · 不重复收费'}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>}
    <div className="plan-summary">
      <span data-testid="plan-summary">{preview ? `${stops.length} 段 · ${duration(preview.duration)} · 成本 ${money(preview.cost)} · 交付 ${money(preview.revenue)} · 运输净收益 ${money(preview.profit)}` : error || '最多 5 个航段；每站周转 8 秒，途中不自动装入新订单。'}</span>
      {preview && preview.openingCost > 0
        ? <button disabled={locked || game.credits < preview.openingCost} onClick={() => ignore(controller.command({ type: 'open-plan-routes', planeId: plane.id, stops }))}>开通计划航线 {money(preview.openingCost)}</button>
        : <button className="gold-button" disabled={locked || !preview || Boolean(energyReason) || game.credits < (preview?.legs[0]?.cost ?? 0)} onClick={() => ignore(launch())}>执行运输计划</button>}
    </div>
    {preview && <small className="energy-plan-note" data-testid="plan-energy">能量：全程需 {energyText(requiredEnergy)} 点／可用 {energyText(plane.energy.availableSeconds)} 点（不含周转）。{energyReason || (requiredEnergy > plane.energy.availableSeconds ? "只能覆盖部分航段，不足停航保留客货。" : "逐段扣费、预留能量，不足停航保留客货。")}</small>}
  </section>;
}
