import { searchAirports, type ContinentFilter } from './airport-search.js';
import { useState } from 'react';
import { AIRPORTS, CONTINENTS, airport } from '../core/catalog.js';
import { MAX_PLAN_LEGS, type GameState, type Plane } from '../core/game.js';
import { MapView } from './MapView.js';
import { PlanControls } from './PlanControls.js';
import { DispatchDialog } from './DispatchDialog.js';
import { dispatchPresentation } from './dispatch-presentation.js';
import { routePreview } from './route-preview.js';
import { money, duration } from './Panels.js';

let tipSeen = false;
export function Network({ game, plane, destination, setDestination, onReturn, onDepart, onInspect, busy, mode }: {
  game: GameState; plane?: Plane; destination: string; setDestination: (id: string) => void;
  mode: 'browse' | 'dispatch';
  onReturn: () => void; onDepart: () => void; onInspect: (id: string, afterUnlock?: () => void) => void; busy: boolean;
}) {
  const [stops, setStops] = useState<string[]>([]), [auto, setAuto] = useState(false);
  const [citiesOpen, setCitiesOpen] = useState(false), [showOthers, setShowOthers] = useState(true);
  const [tip, setTip] = useState(!tipSeen);
  const [citySearch, setCitySearch] = useState(''), [continent, setContinent] = useState<ContinentFilter>('all');
  const cities = searchAirports(citySearch, continent);
  const browsing = mode === 'browse';
  const view = dispatchPresentation(game, plane, stops, auto, busy), { active, summary } = view;
  const inFlight = Boolean(active), from = plane?.airportId ?? 'PEK';
  const preview = !browsing && plane && !inFlight ? routePreview(game, plane, stops) : null;
  function dismissTip() { if (!browsing) { tipSeen = true; setTip(false); } }
  function appendUnlockedStop(id: string) {
    if (browsing || !plane || inFlight || id === (stops.at(-1) ?? plane.airportId) || stops.length >= MAX_PLAN_LEGS) return;
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
    if (browsing) { onInspect(id); return; }
    if (!plane || inFlight) return;
    if (!game.airports.some(item => item.id === id)) { onInspect(id, () => appendUnlockedStop(id)); return; }
    appendUnlockedStop(id);
  }
  function inspectSelected() {
    setCitiesOpen(false); dismissTip();
    onInspect(destination, !browsing && !inFlight && !game.airports.some(item => item.id === destination) ? () => appendUnlockedStop(destination) : undefined);
  }
  const destinationText = active ? airport(active.to).city : stops.length ? airport(stops.at(-1)!).city : '—';
  const timeText = active ? duration(active.remaining) : summary ? duration(summary.duration) : '—';
  return <section className={`network-view route-dispatch-view ${browsing ? 'world-map-view' : ''}`} aria-label={browsing ? '地图浏览' : inFlight ? '航班地图' : '起飞规划'}>
    {browsing ? <header className="world-map-toolbar">
      <button onClick={onReturn}>{inFlight ? '返回航班' : '返回机场'}</button>
      <h2>地图 <small>已解锁 {game.airports.length} / {AIRPORTS.length} 城市</small></h2>
      <strong className="world-map-funds">{money(game.credits)}</strong>
      <button className="primary" aria-haspopup="dialog" onClick={() => { setCitySearch(''); setContinent('all'); setCitiesOpen(true); }}>查找城市</button>
    </header> : <div className="dispatch-readout" data-testid="network-summary">
      <button className="dispatch-stat dispatch-destination" aria-label="选择目的城市" aria-haspopup="dialog" onClick={() => { dismissTip(); setCitySearch(''); setContinent('all'); setCitiesOpen(true); }}>
        <span>目的地</span><strong data-testid="network-destination">{destinationText}<i aria-hidden="true">▾</i></strong>
      </button>
      <div className="dispatch-stat dispatch-time"><span>{active ? '剩余时间' : '预计时间'}</span><strong data-testid="network-time">{timeText}</strong></div>
      <div className="dispatch-stat dispatch-profit"><span>净利润</span><strong data-testid="network-profit">{summary ? money(summary.profit) : stops.length ? '—' : money(0)}</strong></div>
      <div className="dispatch-stat dispatch-cost"><span>成本</span><strong data-testid="network-cost">{summary ? money(summary.cost) : stops.length ? '—' : money(0)}</strong></div>
    </div>}
    <div className="network-map">
      <MapView game={game} plane={plane} selected={destination} onSelect={chooseAirport} preview={preview} planning={!browsing} showOthers={showOthers} onToggleOthers={() => { dismissTip(); setShowOthers(value => !value); }}/>
      {browsing && <p className="world-map-guide">点城市查看详情与解锁</p>}
      {!browsing && tip && !active && <div className="dispatch-tip" role="status"><span>拖动地球旋转；点机场选路，顶部目的地可搜索全球。</span><button aria-label="关闭选路提示" onClick={dismissTip}>×</button></div>}
      {!browsing && <PlanControls game={game} plane={plane} stops={stops} setStops={value => { dismissTip(); setStops(value); if (value.length !== 1) setAuto(false); }} auto={auto} setAuto={setAuto} busy={busy} onDepart={onDepart} onCancel={onReturn} onDetails={dismissTip}/>}
    </div>
    {citiesOpen && <DispatchDialog title="选择城市" onClose={() => setCitiesOpen(false)}>
      <p>{browsing ? '选择城市查看机场、客货与解锁条件。' : active ? '只浏览城市，不修改当前航班。' : `从${airport(from).city}出发，按选择顺序添加，最多${MAX_PLAN_LEGS}段。`}</p>
      <div className="dispatch-world-search">
        <label>搜索全球机场<input type="search" aria-label="搜索全球机场" value={citySearch} placeholder="城市、机场代码或区域" autoComplete="off" onChange={e => setCitySearch(e.target.value)}/></label>
        <label>世界区域<select aria-label="城市世界区域" value={continent} onChange={e => setContinent(e.target.value as ContinentFilter)}><option value="all">全球全部区域</option>{CONTINENTS.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
      </div>
      {!cities.length && <p role="status">没有符合条件的机场。<button onClick={() => { setCitySearch(''); setContinent('all'); }}>清除城市筛选</button></p>}
      <label className="dispatch-city-field">{browsing || active ? '浏览城市' : '添加目的城市'}<select autoFocus aria-label="选择机场" disabled={busy} value="" onChange={e => chooseAirport(e.target.value)}>
        <option value="" disabled>请选择城市</option>{cities.map(item => <option value={item.id} key={item.id}>{item.city} · {item.id} · {item.continent}{game.airports.some(x => x.id === item.id) ? '' : ' · 未解锁'}</option>)}
      </select></label>
      {!browsing && <><button className="dispatch-inspect" disabled={busy} aria-label={`查看${airport(destination).city}机场详情`} onClick={inspectSelected}>查看{airport(destination).city}机场详情</button>
      <p className="dispatch-dialog-note">首批50座全球机场。未解锁城市打开详情；取消解锁不追加航段。远程需升级机型或安排中转，关闭窗口保留球面视角。</p></>}
    </DispatchDialog>}
  </section>;
}
