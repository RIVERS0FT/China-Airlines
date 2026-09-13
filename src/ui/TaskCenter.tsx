import { useRef, useState } from 'react';
import { guideStep } from '../core/onboarding.js';
import type { GameState, Plane } from '../core/game.js';
import { controller, useGame } from '../runtime.js';
import { Icon, ignore, money } from './Panels.js';
import { taskItems, type TaskState } from './task-presentation.js';

const labels: Record<TaskState, string> = { claimable: '可领取', active: '进行中', claimed: '已领取' };
export function TaskCenter({ game, plane, busy, onNext }: {
  game: GameState; plane?: Plane; busy: boolean; onNext: (step: string) => void;
}) {
  const items = taskItems(game), view = useGame();
  const [filter, setFilter] = useState<TaskState>(() => items.some(t => t.state === 'claimable') ? 'claimable' : 'active');
  const tabs = useRef<HTMLDivElement>(null);
  const next = plane ? guideStep(game, plane, 'airport', '') : null;
  const shown = items.filter(t => t.state === filter);
  return <section className="task-center content-page">
    <div className="task-center-summary"><strong>任务与奖励</strong><span>运营资金 {money(game.credits)} · 点券 {game.career.tickets}</span></div>
    <div className="task-center-tabs" role="tablist" aria-label="任务状态" ref={tabs} onKeyDown={event => {
      const keys = Object.keys(labels) as TaskState[], index = keys.indexOf(filter);
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : event.key === 'ArrowRight' ? (index + 1) % keys.length : event.key === 'ArrowLeft' ? (index + keys.length - 1) % keys.length : -1;
      if (nextIndex < 0) return;
      event.preventDefault(); setFilter(keys[nextIndex]!); tabs.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
    }}>
      {(Object.keys(labels) as TaskState[]).map(key => <button type="button" key={key} role="tab" id={`tasks-tab-${key}`} aria-controls="tasks-panel" aria-selected={filter === key} tabIndex={filter === key ? 0 : -1} onClick={() => setFilter(key)}>{labels[key]} <b>{items.filter(t => t.state === key).length}</b></button>)}
    </div>
    <div className="task-center-feedback" aria-live="polite" aria-atomic="true">
      {view.error ? <p role="alert">{view.error}</p> : view.notice ? <p role="status">{view.notice}</p> : <p>奖励在此领取；航班运输收入仍在到达时自动结算。</p>}
    </div>
    <div id="tasks-panel" role="tabpanel" aria-labelledby={`tasks-tab-${filter}`} className="task-list">
      {shown.map(t => <article className={`task-card task-${t.state}`} key={t.key} data-task-id={t.id}>
        <div className="task-icon"><Icon name="task"/></div>
        <div className="task-body"><small>{t.category}</small><h3 id={`task-name-${t.id}`}>{t.title}</h3><p>{t.description}</p>
          {t.id === 'first-flight' && t.state !== 'claimed' && next && <div className="task-next-step" data-testid="first-flight-task"><strong>{next.number}/6 · {next.title}</strong><p>{next.text.replace('客货卡片', '旅客或货物')}</p>{t.state === 'active' && <button disabled={busy} onClick={() => onNext(next.id)}>{next.id === 'map' ? '规划首航' : next.id === 'flight' ? '查看首航航班' : '前往装载'}</button>}</div>}
          <progress max={t.target} value={Math.min(t.target, t.progress)} aria-label={`${t.title}进度`}/><small>{Math.min(t.target, t.progress)} / {t.target}{t.state === 'active' && t.reason ? ` · ${t.reason}` : ''}</small>
        </div>
        <div className="task-reward"><strong>{[t.gold ? `+ ${money(t.gold)}` : '', t.tickets ? `${t.tickets} 点券` : '', t.extra].filter(Boolean).join(' · ')}</strong>
          <button disabled={busy || t.state !== 'claimable'} aria-describedby={`task-name-${t.id}`} onClick={() => ignore(controller.command(t.command).then(() => { tabs.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus({ preventScroll: true }); }))}>{t.state === 'claimable' ? '领取奖励' : labels[t.state]}</button>
        </div>
      </article>)}
      {!shown.length && <p className="task-center-empty">{filter === 'claimable' ? '暂无可领取奖励。完成任务后可在这里领取。' : filter === 'active' ? '当前任务已完成，可查看已领取记录。' : '尚无已领取的奖励记录。'}</p>}
    </div>
    <details className="task-center-log"><summary>运营日志 · 最近60条</summary><div className="ledger">{game.log.map((entry, i) => <div className="ledger-entry" key={`${entry.at}-${i}`}><span>{entry.text}</span>{entry.amount !== 0 && <strong>{entry.amount > 0 ? '+' : '−'}{money(Math.abs(entry.amount))}</strong>}</div>)}</div></details>
  </section>;
}
