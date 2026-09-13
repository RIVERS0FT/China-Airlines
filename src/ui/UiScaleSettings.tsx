import { DEFAULT_UI_SCALE, UI_SCALE_MIN, UI_SCALE_MAX, UI_SCALE_STEP, useUiPreferences } from './ui-preferences.js';
import './ui-scale.css';

export function UiScaleSettings() {
  const { uiScale, persisted, setUiScale } = useUiPreferences();
  const percent = Math.round(uiScale * 100);
  return <section className="ui-scale-setting" aria-labelledby="ui-scale-title">
    <div className="ui-scale-heading"><label id="ui-scale-title" htmlFor="ui-scale">UI 缩放比例</label>
      <output htmlFor="ui-scale" data-testid="ui-scale-value">{percent}%</output></div>
    <div className="ui-scale-controls">
      <button type="button" aria-label="缩小界面" disabled={uiScale <= UI_SCALE_MIN} onClick={() => setUiScale(uiScale - UI_SCALE_STEP)}>−</button>
      <input id="ui-scale" type="range" min={UI_SCALE_MIN * 100} max={UI_SCALE_MAX * 100} step={UI_SCALE_STEP * 100}
        value={percent} aria-valuetext={`${percent}%`} aria-describedby="ui-scale-description"
        onChange={event => setUiScale(Number(event.currentTarget.value) / 100)}/>
      <button type="button" aria-label="放大界面" disabled={uiScale >= UI_SCALE_MAX} onClick={() => setUiScale(uiScale + UI_SCALE_STEP)}>＋</button>
      <button type="button" onClick={() => setUiScale(DEFAULT_UI_SCALE)}>恢复默认缩放</button>
    </div>
    <p id="ui-scale-description">75%–150%，默认100%。同屏幕比例和缩放值使用一致布局；只调整显示，不改变经营进度或地图缩放级别。</p>
    {!persisted && <p role="status">浏览器未允许保存设置，当前缩放仅本次打开有效。</p>}
  </section>;
}
