import { guideStep } from '../core/onboarding.js';
import type { GameState, Plane } from '../core/game.js';
import { Icon } from './Panels.js';
import { taskOverview } from './task-presentation.js';
import { useI18n } from '../i18n/I18n.js';

/** One persistent task entrance. Reward eligibility is a read-only projection. */
export function AirportSceneTools({ game, plane, onTasks }: {
  game: GameState; plane?: Plane; onTasks: () => void;
}) {
  const { count, task } = taskOverview(game);
  const { ui } = useI18n();
  const next = task?.id === 'first-flight' && plane ? guideStep(game, plane, 'airport', '') : null;
  return <div className="airport-scene-tools">
    <button className={`airport-mission ${count ? 'has-rewards' : ''}`} aria-label={ui('任务中心')} aria-describedby="airport-task-summary" data-guide="tasks" onClick={onTasks}>
      <Icon name="task"/><span><strong>{ui('任务')} <span className="mission-status">{count ? `${ui('可领取')} ${count}` : task ? ui('进行中') : ui('已完成')}</span></strong>
        <small id="airport-task-summary">{task ? `${ui(next?.title ?? task.title)} · ${Math.min(task.target, task.progress)} / ${task.target}` : ui('查看已完成任务与运营日志')}</small>
      </span><b aria-hidden="true">›</b>
    </button>
  </div>;
}
