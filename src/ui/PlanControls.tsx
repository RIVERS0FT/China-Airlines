import { airport } from '../core/catalog.js';
import { MAX_PLAN_LEGS, manifest, planQuote, type GameState, type Plane } from '../core/game.js';
import { controller } from '../runtime.js';
import { duration, money, ignore } from './Panels.js';

/** Planning edits are a local draft. Only the confirmed command changes simulation state. */
export function PlanControls({ game, plane, stops, setStops, candidate, busy, onDepart }: {
  game: GameState; plane: Plane; stops: string[]; setStops: (v: string[]) => void;
  candidate: string; busy: boolean; onDepart: () => void;
}) {
  let preview: ReturnType<typeof planQuote> | null = null, error = '';
  try { if (stops.length) preview = planQuote(game, plane, stops); } catch (e) { error = e instanceof Error ? e.message : '计划无效'; }
  const locked = busy || Boolean(plane.flight || plane.autoRouteId || plane.itinerary.length) || plane.readyAt > game.simTime;
  const last = stops.at(-1) ?? plane.airportId;
  async function launch() {
    if (!preview) return;
    if (!manifest(game, plane.id).length && !window.confirm('这是空机多段调机计划，所有航段仍需支付成本。确定执行？')) return;
    if (preview.undelivered && !window.confirm(`计划结束后仍有 ${preview.undelivered} 单未到最终目的地，将继续留在机上。确定执行？`)) return;
    try { await controller.command({ type: 'dispatch-plan', planeId: plane.id, stops }); onDepart(); } catch { /* Controller renders errors. */ }
  }
  return <div className="plan-editor" aria-label="多段运输计划">
    <div className="plan-stop-row"><b>{airport(plane.airportId).city}</b>{stops.map((id, i) => <span className="plan-stop" key={`${id}-${i}`}>→ {i + 1}. {airport(id).city}</span>)}{!stops.length && <span className="plan-hint">在地图选择机场，再添加航段</span>}
      <div className="plan-edit-actions"><button disabled={locked || candidate === last || stops.length >= MAX_PLAN_LEGS || !game.airports.some(a => a.id === candidate)} onClick={() => setStops([...stops, candidate])}>添加{airport(candidate).city}航段</button><button disabled={locked || !stops.length} onClick={() => setStops(stops.slice(0, -1))}>撤销末段</button><button disabled={locked || !stops.length} onClick={() => setStops([])}>清空计划</button></div></div>
    <div className="plan-summary"><span data-testid="plan-summary">{preview ? `${stops.length} 段 · ${duration(preview.duration)} · 成本 ${money(preview.cost)} · 交付 ${money(preview.revenue)} · 净收益 ${money(preview.profit)}` : error || '最多 5 个航段；每站周转 8 秒，途中不自动装入新订单。'}</span>
      {preview && preview.openingCost > 0 ? <button disabled={locked || game.credits < preview.openingCost} onClick={() => ignore(controller.command({ type: 'open-plan-routes', planeId: plane.id, stops }))}>开通计划航线 {money(preview.openingCost)}</button> : <button className="gold-button" disabled={locked || !preview || game.credits < (preview?.legs[0]?.cost ?? 0)} onClick={() => ignore(launch())}>执行运输计划</button>}
    </div>
    {preview && <small className="plan-footnote">逐段扣费，不预扣全部成本；资金不足则停在当前机场。{preview.undelivered > 0 ? `计划后还有 ${preview.undelivered} 单留在机上。` : '本计划覆盖全部已装订单的目的地。'}</small>}
  </div>;
}
