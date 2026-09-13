import { guideStep } from '../core/onboarding.js';
import type { GameState, Plane } from '../core/game.js';
import { Icon } from './Panels.js';
import { taskOverview } from './task-presentation.js';

/** One persistent task entrance. Reward eligibility is a read-only projection. */
export function AirportSceneTools({ game, plane, onTasks }: {
  game: GameState; plane?: Plane; onTasks: () => void;
}) {
  const { count, task } = taskOverview(game);
  const next = task?.id === 'first-flight' && plane ? guideStep(game, plane, 'airport', '') : null;
  return <div className="airport-scene-tools">
    <button className={`airport-mission ${count ? 'has-rewards' : ''}`} aria-label="任务中心" aria-describedby="airport-task-summary" data-guide="tasks" onClick={onTasks}>
      <Icon name="task"/><span><strong>任务 <span className="mission-status">{count ? `可领取 ${count}` : task ? '进行中' : '已完成'}</span></strong>
        <small id="airport-task-summary">{task ? `${next?.title ?? task.title} · ${Math.min(task.target, task.progress)} / ${task.target}` : '查看已完成任务与运营日志'}</small>
      </span><b aria-hidden="true">›</b>
    </button>
  </div>;
}
