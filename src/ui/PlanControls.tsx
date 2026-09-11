import { airport } from '../core/catalog.js';
import { MAX_PLAN_LEGS, manifest, planQuote, type GameState, type Plane } from '../core/game.js';
import { controller } from '../runtime.js';
import { duration, money, ignore } from './Panels.js';
import './plan-details.css';

/** City clicks build a local ordered draft. Only confirmation changes simulation state. */
export function PlanControls({ game, plane, stops, setStops, auto, busy, onDepart }: {
  game: GameState; plane: Plane; stops: string[]; setStops: (v: string[]) => void;
  auto: boolean; busy: boolean; onDepart: () => void;
}) {
  let preview: ReturnType<typeof planQuote> | null = null, error = '';
  try {
    if (stops.length) preview = planQuote(game, plane, stops);
  } catch (e) {
    error = e instanceof Error ? e.message : '路线无效';
  }
  const locked = busy || Boolean(plane.flight || plane.autoRouteId || plane.itinerary.length) || plane.readyAt > game.simTime;
  const jobs = manifest(game, plane.id);
  const autoInvalid = auto && (stops.length !== 1 || !plane.dispatcher || jobs.length === 0 || jobs.some(o => o.to !== stops[0]));
  async function launch() {
    if (!preview || !stops.length || autoInvalid) return;
    if (!jobs.length && !window.confirm('当前路线为空机调机，所有航段仍需支付运营成本。确定起飞？')) return;
    if (preview.undelivered && !window.confirm(`路线结束后仍有 ${preview.undelivered} 单未到最终目的地，将继续留在机上。确定执行？`)) return;
    try {
      if (auto && stops.length === 1) await controller.command({ type: 'dispatch', planeId: plane.id, to: stops[0]!, auto: true });
      else await controller.command({ type: 'dispatch-plan', planeId: plane.id, stops });
      onDepart();
    } catch { /* Controller renders errors. */ }
  }
  return <section className="plan-editor" aria-label="运输路线">
    <div className="plan-stop-row">
      <b>{airport(plane.airportId).city}</b>
      {stops.map((id, i) => <span className="plan-stop" key={`${id}-${i}`}>→ {i + 1}. {airport(id).city}</span>)}
      {!stops.length && <span className="plan-hint">依次点击地图城市，点击顺序就是飞行顺序</span>}
      <div className="plan-edit-actions">
        <button disabled={locked || !stops.length} onClick={() => setStops(stops.slice(0, -1))}>撤销末站</button>
        <button disabled={locked || !stops.length} onClick={() => setStops([])}>清空路线</button>
      </div>
    </div>
    {preview && <details className="plan-breakdown">
      <summary>逐段费用与交付</summary>
      <div className="plan-table-scroll" tabIndex={0} role="region" aria-label="航段费用明细">
        <table>
          <caption>城市解锁后即可通行；路线预览不扣费，运营成本在各段起飞时扣除。</caption>
          <thead><tr><th scope="col">航段</th><th scope="col">飞行时间</th><th scope="col">运营成本</th><th scope="col">本段交付</th></tr></thead>
          <tbody>{preview.legs.map((leg, i) => <tr key={i} data-testid="plan-leg">
            <th scope="row">{i + 1}. {airport(leg.from).city} → {airport(leg.to).city}</th>
            <td>{duration(leg.duration)}</td><td>{money(leg.cost)}</td><td>{money(leg.revenue)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>}
    <div className="plan-summary">
      <span data-testid="plan-summary">{preview ? `${stops.length} 段 · ${duration(preview.duration)} · 成本 ${money(preview.cost)} · 交付 ${money(preview.revenue)} · 运输净收益 ${money(preview.profit)}` : error || `最多 ${MAX_PLAN_LEGS} 个航段；每站周转 8 秒，途中不自动装入新订单。`}</span>
      <button className="gold-button" data-testid="dispatch" disabled={locked || !preview || autoInvalid || game.credits < (preview?.legs[0]?.cost ?? 0)} onClick={() => ignore(launch())}>{auto ? '启动自动往返' : '确认起飞'}</button>
    </div>
    {preview && <small className="plan-footnote">无需单独开通航线；逐段扣费，不预扣全部成本；资金不足则停在当前机场。{preview.undelivered > 0 ? `路线后还有 ${preview.undelivered} 单留在机上。` : '本路线覆盖全部已装订单的目的地。'}{autoInvalid ? ' 自动往返只支持单一目的地、已配调度员且机上订单全部直达。' : ''}</small>}
  </section>;
}
