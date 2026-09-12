import { energyDepartureReason } from '../core/energy.js';
import { energyText } from './EnergyService.js';
import { AIRPORTS, airport } from '../core/catalog.js';
import { MAX_PLAN_LEGS, manifest, planQuote, type GameState, type Plane } from '../core/game.js';
import { controller } from '../runtime.js';
import { duration, money, ignore } from './Panels.js';
import './plan-details.css';

/** Planning edits are a local draft. Only the confirmed command changes simulation state. */
export function PlanControls({ game, plane, stops, setStops, destination, onChoose, onInspect, auto, setAuto, busy, onDepart }: {
  game: GameState; plane: Plane; stops: string[]; setStops: (v: string[]) => void;
  destination: string; onChoose: (id: string) => void; onInspect: () => void;
  auto: boolean; setAuto: (value: boolean) => void; busy: boolean; onDepart: () => void;
}) {
  let preview: ReturnType<typeof planQuote> | null = null, error = '';
  try {
    if (stops.length) preview = planQuote(game, plane, stops);
  } catch (e) {
    error = e instanceof Error ? e.message : '路线不可用';
  }
  const locked = busy || Boolean(plane.flight || plane.autoRouteId || plane.itinerary.length || plane.energy.serviceUntil !== null) || plane.readyAt > game.simTime;
  const energyReason = preview ? energyDepartureReason(plane.energy, preview.legs[0]!.duration) : '';
  const requiredEnergy = preview?.legs.reduce((sum, leg) => sum + leg.duration, 0) ?? 0;
  const jobs = manifest(game, plane.id);
  const autoBlocked = Boolean(auto && stops.length === 1 && (!jobs.length || jobs.some(order => order.to !== stops[0])));
  async function launch() {
    if (!preview || !stops.length) return;
    if (!jobs.length && !window.confirm(`这是空机${stops.length > 1 ? '多段' : ''}调机路线，仍需支付运营成本。确定执行？`)) return;
    if (preview.undelivered && !window.confirm(`路线结束后仍有 ${preview.undelivered} 单未到最终目的地，将继续留在机上。确定执行？`)) return;
    try {
      if (stops.length === 1) await controller.command({ type: 'dispatch', planeId: plane.id, to: stops[0]!, auto });
      else await controller.command({ type: 'dispatch-plan', planeId: plane.id, stops });
      onDepart();
    } catch { /* Controller renders errors. */ }
  }
  return <section className="plan-editor" aria-label="路线规划">
    <div className="plan-route-tools">
      <label className="route-city-picker"><span>城市</span><select aria-label="选择机场" disabled={busy} value={destination} onChange={e => onChoose(e.target.value)}>{AIRPORTS.map(item => <option value={item.id} key={item.id}>{item.city} · {item.id}{game.airports.some(x => x.id === item.id) ? '' : ' · 未解锁'}</option>)}</select></label>
      <button className="route-city-detail" aria-label={`查看${airport(destination).city}机场详情`} onClick={onInspect}>城市详情</button>
      {stops.length === 1 && <label className="plan-auto-choice"><input type="checkbox" checked={auto} disabled={busy || !plane.dispatcher} onChange={e => setAuto(e.target.checked)}/>自动往返{!plane.dispatcher && <small>需调度员</small>}</label>}
    </div>
    <div className="plan-stop-row">
      <b>{airport(plane.airportId).city}</b>
      {stops.map((id, i) => <span className="plan-stop" key={`${id}-${i}`}>→ {i + 1}. {airport(id).city}</span>)}
      {!stops.length && <span className="plan-hint">点击地图中的已解锁城市，按点击顺序形成路线；未解锁城市会按需打开详情。</span>}
      <div className="plan-edit-actions">
        <button disabled={locked || !stops.length} onClick={() => setStops(stops.slice(0, -1))}>撤销末段</button>
        <button disabled={locked || !stops.length} onClick={() => setStops([])}>清空路线</button>
      </div>
    </div>
    {preview && <details className="plan-breakdown">
      <summary>逐段费用与交付</summary>
      <div className="plan-table-scroll" tabIndex={0} role="region" aria-label="航段费用明细">
        <table>
          <caption>城市解锁后即可直接通航；这里只计算各段运营成本与最终目的地交付。逐段扣费，不预扣全程；资金或能量不足停在实际机场，保留客货。{preview.undelivered > 0 ? `路线后还有 ${preview.undelivered} 单留在机上。` : '本路线覆盖全部已装订单的目的地。'}</caption>
          <thead><tr><th scope="col">航段</th><th scope="col">飞行时间</th><th scope="col">运营成本</th><th scope="col">本段交付</th></tr></thead>
          <tbody>{preview.legs.map((leg, i) => <tr key={i} data-testid="plan-leg">
            <th scope="row">{i + 1}. {airport(leg.from).city} → {airport(leg.to).city}</th>
            <td>{duration(leg.duration)}</td><td>{money(leg.cost)}</td><td>{money(leg.revenue)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>}
    <div className="plan-summary">
      <span data-testid="plan-summary">{preview ? `${stops.length} 段 · ${duration(preview.duration)} · 成本 ${money(preview.cost)} · 交付 ${money(preview.revenue)} · 运输净收益 ${money(preview.profit)}` : error || `依次点击城市规划路线；最多 ${MAX_PLAN_LEGS} 段，每站周转 8 秒。`}</span>
      <button className="gold-button" data-testid="dispatch" disabled={locked || !preview || autoBlocked || Boolean(energyReason) || game.credits < (preview?.legs[0]?.cost ?? 0)} onClick={() => ignore(launch())}>{stops.length > 1 ? '确认路线起飞' : '确认起飞'}</button>
    </div>
    {preview && <small className="energy-plan-note" data-testid="plan-energy">能量：全程需 {energyText(requiredEnergy)} 点／可用 {energyText(plane.energy.availableSeconds)} 点（不含周转）。{autoBlocked ? '自动往返需已装载且全部直达唯一目的城市。' : energyReason || (requiredEnergy > plane.energy.availableSeconds ? '只能覆盖部分航段，不足停航保留客货。' : auto ? '按该目的地自动往返，每段预留能量。' : '逐段扣费、预留能量，不足停航保留客货。')}</small>}
  </section>;
}
