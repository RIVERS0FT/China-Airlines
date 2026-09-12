import { useState } from 'react';
import { AIRPORTS, airport } from '../core/catalog.js';
import { MAX_PLAN_LEGS, type GameState, type Plane } from '../core/game.js';
import { MapView } from './MapView.js';
import { PlanControls } from './PlanControls.js';
import { DispatchDialog } from './DispatchDialog.js';
import { dispatchPresentation } from './dispatch-presentation.js';
import { routePreview } from './route-preview.js';
import { money, duration } from './Panels.js';

let tipSeen = false;
export function Network({ game, plane, destination, setDestination, onReturn, onDepart, onInspect, busy }: {
  game: GameState; plane?: Plane; destination: string; setDestination: (id: string) => void;
  onReturn: () => void; onDepart: () => void; onInspect: (id: string, afterUnlock?: () => void) => void; busy: boolean;
}) {
  const [stops, setStops] = useState<string[]>([]), [auto, setAuto] = useState(false);
  const [citiesOpen, setCitiesOpen] = useState(false), [showOthers, setShowOthers] = useState(true);
  const [tip, setTip] = useState(!tipSeen);
  const view = dispatchPresentation(game, plane, stops, auto, busy), { active, summary } = view;
  const inFlight = Boolean(active), from = plane?.airportId ?? 'PEK';
  const preview = plane && !inFlight ? routePreview(game, plane, stops) : null;
  function dismissTip() { tipSeen = true; setTip(false); }
  function appendUnlockedStop(id: string) {
    if (!plane || inFlight || id === (stops.at(-1) ?? plane.airportId) || stops.length >= MAX_PLAN_LEGS) return;
    setStops(previous => {
      if (id === (previous.at(-1) ?? plane.airportId) || previous.length >= MAX_PLAN_LEGS) return previous;
      return [...previous, id];
    });
    // Appending a second destination invalidates automatic round trips.
    if (stops.length >= 1) setAuto(false);
  }
  function chooseAirport(id: string) {
    if (busy) return;
    dismissTip(); setCitiesOpen(false); setDestination(id);
    if (!plane || inFlight) return;
    if (!game.airports.some(item => item.id === id)) { onInspect(id, () => appendUnlockedStop(id)); return; }
    appendUnlockedStop(id);
  }
  function inspectSelected() {
    setCitiesOpen(false); dismissTip();
    onInspect(destination, !inFlight && !game.airports.some(item => item.id === destination) ? () => appendUnlockedStop(destination) : undefined);
  }
  const destinationText = active ? airport(active.to).city : stops.length ? airport(stops.at(-1)!).city : '—';
  const timeText = active ? duration(active.remaining) : summary ? duration(summary.duration) : '—';
  return <section className="network-view route-dispatch-view" aria-label={inFlight ? '航班地图' : '起飞规划'}>
    <div className="dispatch-readout" data-testid="network-summary">
      <button className="dispatch-stat dispatch-destination" aria-label="选择目的城市" aria-haspopup="dialog" onClick={() => { dismissTip(); setCitiesOpen(true); }}>
        <span>目的地</span><strong data-testid="network-destination">{destinationText}<i aria-hidden="true">▾</i></strong>
      </button>
      <div className="dispatch-stat dispatch-time"><span>{active ? '剩余时间' : '预计时间'}</span><strong data-testid="network-time">{timeText}</strong></div>
      <div className="dispatch-stat dispatch-profit"><span>净利润</span><strong data-testid="network-profit">{summary ? money(summary.profit) : stops.length ? '—' : money(0)}</strong></div>
      <div className="dispatch-stat dispatch-cost"><span>成本</span><strong data-testid="network-cost">{summary ? money(summary.cost) : stops.length ? '—' : money(0)}</strong></div>
    </div>
    <div className="network-map">
      <MapView game={game} plane={plane} selected={destination} onSelect={chooseAirport} preview={preview} showOthers={showOthers} onToggleOthers={() => { dismissTip(); setShowOthers(value => !value); }}/>
      {tip && !active && <div className="dispatch-tip" role="status"><span>点地图选路线；点顶部目的地可用列表选择。</span><button aria-label="关闭选路提示" onClick={dismissTip}>×</button></div>}
      <PlanControls game={game} plane={plane} stops={stops} setStops={value => { dismissTip(); setStops(value); if (value.length !== 1) setAuto(false); }} auto={auto} setAuto={setAuto} busy={busy} onDepart={onDepart} onCancel={onReturn} onDetails={dismissTip}/>
    </div>
    {citiesOpen && <DispatchDialog title="选择城市" onClose={() => setCitiesOpen(false)}>
      <p>{active ? '只浏览城市，不修改当前航班。' : `从${airport(from).city}出发，按选择顺序添加，最多${MAX_PLAN_LEGS}段。`}</p>
      <label className="dispatch-city-field">{active ? '浏览城市' : '添加目的城市'}<select autoFocus aria-label="选择机场" disabled={busy} value="" onChange={e => chooseAirport(e.target.value)}>
        <option value="" disabled>请选择城市</option>{AIRPORTS.map(item => <option value={item.id} key={item.id}>{item.city} · {item.id}{game.airports.some(x => x.id === item.id) ? '' : ' · 未解锁'}</option>)}
      </select></label>
      <button className="dispatch-inspect" disabled={busy} aria-label={`查看${airport(destination).city}机场详情`} onClick={inspectSelected}>查看{airport(destination).city}机场详情</button>
      <p className="dispatch-dialog-note">未解锁城市按需打开机场详情。取消解锁不追加航段；关闭窗口保留地图视角。</p>
    </DispatchDialog>}
  </section>;
}
