import { guideStep } from '../core/onboarding.js';
import type { Plane } from '../core/game.js';
import { TASKS } from '../core/catalog.js';
import { taskProgress, type GameState } from '../core/game.js';
import { Icon } from './Panels.js';

/** Existing task/aircraft actions only. The scene never creates rewards or traffic. */
export function AirportSceneTools({ game, plane, hasPlane, onTasks, onFleet, onFlights }: {
  game: GameState; plane?: Plane; hasPlane: boolean;
  onTasks: () => void; onFleet: () => void; onFlights: () => void;
}) {
  const task = TASKS.find(t => !game.claimedTasks.includes(t.id));
  const nextStep = task?.id === 'first-flight' && plane ? guideStep(game, plane, 'airport', '') : null;
  const progress = task ? Math.min(task.target, taskProgress(game, task.id)) : 0;
  return <div className="airport-scene-tools">
    {game.tutorial !== 'active' && <button className="airport-mission" aria-label="查看当前运营任务" onClick={onTasks}>
      <Icon name="task"/><span><strong>{nextStep?.title ?? task?.title ?? '运营任务已全部完成'}</strong>
        <small>{nextStep ? `首航任务 · ${nextStep.number}/6 · 点击查看` : task ? `${task.description} · ${progress}/${task.target}${progress === task.target ? ' · 可领取奖励' : ''}` : '查看任务与运营日志'}</small>
      </span><b aria-hidden="true">›</b>
    </button>}
    <div className="airport-shortcuts" role="group" aria-label="机场快捷操作">
      <button aria-label="查看航班运行" onClick={onFlights}><Icon name="plane"/><span>航班</span></button>
      <button aria-label="飞机改装与补能" disabled={!hasPlane} onClick={onFleet}><Icon name="maintenance"/><span>改装</span></button>
      <button aria-label="查看运营奖励" onClick={onTasks}><Icon name="trophy"/><span>奖励</span></button>
    </div>
  </div>;
}
