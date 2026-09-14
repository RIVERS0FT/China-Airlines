import { CompanyAffairs } from './CompanyAffairs.js';
import { companyAffairs } from '../core/talent.js';
import { useRef, useState } from 'react';
import { guideStep } from '../core/onboarding.js';
import type { GameState, Plane } from '../core/game.js';
import { controller, useGame } from '../runtime.js';
import { Icon, ignore, money } from './Panels.js';
import { taskItems, type TaskState } from './task-presentation.js';
import { useI18n } from '../i18n/I18n.js';

const labels: Record<TaskState, string> = { claimable: '可领取', active: '进行中', claimed: '已领取' };
export function TaskCenter({ game, plane, busy, onNext, onEmployee }: {
  game: GameState; plane?: Plane; busy: boolean; onNext: (step: string) => void; onEmployee?: (id: number, training: boolean) => void;
}) {
  const items = taskItems(game), view = useGame();
  const { ui, text, locale } = useI18n();
  const [filter, setFilter] = useState<TaskState>(() => items.some(t => t.state === 'claimable') ? 'claimable' : 'active');
  const tabs = useRef<HTMLDivElement>(null);
  const next = plane ? guideStep(game, plane, 'airport', '') : null;
  const shown = items.filter(t => t.state === filter);
  return <section className="task-center content-page">
    <div className="task-center-summary"><strong>{ui('任务与奖励')}</strong><span>{ui('运营资金 {credits} · 点券 {tickets}',{credits:money(game.credits),tickets:game.career.tickets})}</span></div>
    <div className="task-center-tabs" role="tablist" aria-label={ui('任务状态')} ref={tabs} onKeyDown={event => {
      const keys = Object.keys(labels) as TaskState[], index = keys.indexOf(filter);
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : event.key === 'ArrowRight' ? (index + 1) % keys.length : event.key === 'ArrowLeft' ? (index + keys.length - 1) % keys.length : -1;
      if (nextIndex < 0) return;
      event.preventDefault(); setFilter(keys[nextIndex]!); tabs.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
    }}>
      {(Object.keys(labels) as TaskState[]).map(key => <button type="button" key={key} role="tab" id={`tasks-tab-${key}`} aria-controls="tasks-panel" aria-selected={filter === key} tabIndex={filter === key ? 0 : -1} onClick={() => setFilter(key)}>{ui(labels[key])} <b>{items.filter(t => t.state === key).length}</b></button>)}
    </div>
    <div className="task-center-feedback" aria-live="polite" aria-atomic="true">
      {view.error ? <p role="alert">{text(view.error)}</p> : view.notice ? <p role="status">{text(view.notice)}</p> : <p>{ui('奖励在此领取；航班运输收入仍在到达时自动结算。')}</p>}
    </div>
    <div id="tasks-panel" role="tabpanel" aria-labelledby={`tasks-tab-${filter}`} className="task-list">
      {shown.map(t => <article className={`task-card task-${t.state}`} key={t.key} data-task-id={t.id}>
        <div className="task-icon"><Icon name="task"/></div>
        <div className="task-body"><small>{ui(t.category)}</small><h3 id={`task-name-${t.id}`}>{ui(t.title)}</h3><p>{ui(t.description)}</p>
          {t.id === 'first-flight' && t.state !== 'claimed' && next && <div className="task-next-step" data-testid="first-flight-task"><strong>{next.number}/6 · {ui(next.title)}</strong><p>{ui(next.text.replace('客货卡片', '旅客或货物'))}</p>{t.state === 'active' && <button disabled={busy} onClick={() => onNext(next.id)}>{ui(next.id === 'map' ? '规划首航' : next.id === 'flight' ? '查看首航航班' : '前往装载')}</button>}</div>}
          <progress max={t.target} value={Math.min(t.target, t.progress)} aria-label={ui(t.title)}/><small>{Math.min(t.target, t.progress)} / {t.target}{t.state === 'active' && t.reason ? ` · ${ui(t.reason)}` : ''}</small>
        </div>
        <div className="task-reward"><strong>{[t.gold ? `+ ${money(t.gold)}` : '', t.tickets ? ui('{count} 点券',{count:t.tickets}) : '', ui(t.extra)].filter(Boolean).join(' · ')}</strong>
          <button disabled={busy || t.state !== 'claimable'} aria-describedby={`task-name-${t.id}`} onClick={() => ignore(controller.command(t.command).then(() => { tabs.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus({ preventScroll: true }); }))}>{ui(t.state === 'claimable' ? '领取奖励' : labels[t.state])}</button>
        </div>
      </article>)}
      {!shown.length && <p className="task-center-empty">{ui(filter === 'claimable' ? '暂无可领取奖励。完成任务后可在这里领取。' : filter === 'active' ? '当前任务已完成，可查看已领取记录。' : '尚无已领取的奖励记录。')}</p>}
    </div>
    {onEmployee && <details className="task-company-affairs"><summary>{locale === 'en-US' ? 'Company Affairs' : '公司事务'} · {companyAffairs(game).length}</summary><CompanyAffairs game={game} busy={busy} onEmployee={onEmployee}/></details>}
    <details className="task-center-log"><summary>{ui('运营日志 · 最近60条')}</summary><div className="ledger">{game.log.map((entry, i) => <div className="ledger-entry" key={`${entry.at}-${i}`}><span>{text(entry.text)}</span>{entry.amount !== 0 && <strong>{entry.amount > 0 ? '+' : '−'}{money(Math.abs(entry.amount))}</strong>}</div>)}</div></details>
  </section>;
}
