import { useGameViewport } from './GameViewport.js';
import { DEFAULT_UI_SCALE, MIN_UI_SCALE, MAX_UI_SCALE, UI_SCALE_STEP } from './viewport.js';

export function DisplaySettings() {
  const { uiScale, setUiScale, storageWarning } = useGameViewport();
  return <section className="display-settings" aria-labelledby="display-settings-title">
    <div className="display-settings-heading"><h3 id="display-settings-title">界面显示</h3><output htmlFor="ui-scale" aria-live="polite">{uiScale}%</output></div>
    <p id="ui-scale-description">按可用屏幕比例适配。同一宽高比与缩放设置下，手机和电脑布局一致。仅调整界面大小，不改变地图缩放级别或游戏进度。</p>
    <div className="ui-scale-slider">
      <button aria-label="缩小界面" disabled={uiScale <= MIN_UI_SCALE} onClick={() => setUiScale(uiScale - UI_SCALE_STEP)}>−</button>
      <label className="sr-only" htmlFor="ui-scale">UI 缩放</label>
      <input id="ui-scale" type="range" min={MIN_UI_SCALE} max={MAX_UI_SCALE} step={UI_SCALE_STEP} value={uiScale} aria-valuetext={`${uiScale}%`} aria-describedby="ui-scale-description" onChange={event => setUiScale(Number(event.target.value))}/>
      <button aria-label="放大界面" disabled={uiScale >= MAX_UI_SCALE} onClick={() => setUiScale(uiScale + UI_SCALE_STEP)}>＋</button>
    </div>
    <div className="ui-scale-presets" role="group" aria-label="界面缩放预设">{[75, 100, 125, 150].map(value => <button key={value} aria-pressed={uiScale === value} onClick={() => setUiScale(value)}>{value}%</button>)}<button onClick={() => setUiScale(DEFAULT_UI_SCALE)}>恢复默认缩放</button></div>
    <small>实时生效，单独保存在此浏览器，不随导入或重新开始而重置。</small>
    {storageWarning && <p role="status">{storageWarning}</p>}
  </section>;
}
