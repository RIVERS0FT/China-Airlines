import { TASKS } from '../core/catalog.js';
import { CAREER_TASKS } from '../core/career-catalog.js';
import { taskValue } from '../core/career.js';
import { taskProgress, type Command, type GameState } from '../core/game.js';

export type TaskState = 'claimable' | 'active' | 'claimed';
export interface TaskItem {
  key: string; id: string; title: string; category: string; description: string;
  progress: number; target: number; gold: number; tickets: number; extra: string;
  state: TaskState; reason: string; command: Command;
}
const metricLabels: Record<string, string> = {
  deliveries: '交付客货', airports: '最高开放机场数', flights: '完成航班', crew: '在册飞行员',
  assemblies: '组装飞机', production: '完成生产', museum: '收藏机型', trades: '完成贸易',
};

/** Read-only eligibility. Every claim is still revalidated and persisted by core. */
export function taskItems(game: GameState): TaskItem[] {
  const c = game.career;
  const items: TaskItem[] = [];
  function add(item: Omit<TaskItem, 'state'>, claimed: boolean) {
    items.push({ ...item, state: claimed ? 'claimed' : item.progress >= item.target && !item.reason ? 'claimable' : 'active' });
  }
  for (const t of TASKS) add({ key: `operations:${t.id}`, id: t.id, title: t.title, category: '运营任务',
    description: t.description, progress: taskProgress(game, t.id), target: t.target,
    gold: t.reward, tickets: 0, extra: '', reason: '', command: { type: 'claim', taskId: t.id },
  }, game.claimedTasks.includes(t.id));
  for (const t of CAREER_TASKS) add({ key: `career:${t.id}`, id: t.id, title: t.title, category: '成长任务',
    description: metricLabels[t.metric] ?? t.metric, progress: taskValue(game, t.metric), target: t.target,
    gold: t.gold, tickets: t.tickets, extra: '', reason: '', command: { type: 'career-claim', id: t.id },
  }, c.claimed.includes(t.id));
  const days = [...new Set([c.day, ...c.claimed.filter(id => /^daily-\d+$/.test(id)).map(id => Number(id.slice(6))).filter(day => day < c.day)])].sort((a, b) => b - a);
  for (const day of days) {
    const daily = `daily-${day}`, claimed = c.claimed.includes(daily);
    add({ key: daily, id: daily, title: `每日运输 · 第${day + 1}天`, category: '每日任务', description: `营业第 ${day + 1} 天 · 交付8份客货`,
      progress: day === c.day ? c.dailyDeliveries : 8, target: 8, gold: 1000, tickets: 8, extra: '', reason: '',
      command: { type: 'career-claim', id: daily },
    }, claimed);
  }
  // Match the core's seventh-gift key; do not invent catch-up claims for expired days.
  const today = Math.min(6, c.day);
  for (let day = 0; day <= today; day++) {
    const id = `checkin-${day}`, claimed = c.claimed.includes(id);
    if (day !== today && !claimed) continue;
    add({ key: id, id, title: `七日启航礼 · 第${day + 1}天`, category: '启航奖励',
      description: '每份奖励仅可领取一次，往日未领取份额不补发。', progress: 1, target: 1,
      gold: 0, tickets: 5 + day * 2, extra: '1张机型图纸', reason: '', command: { type: 'career-claim', id },
    }, claimed);
  }
  for (let tier = 1; tier <= 6; tier++) {
    const id = `boss-${tier}`;
    add({ key: id, id, title: `第${tier}区运输挑战`, category: '区域挑战', description: '累计运输收入达到目标，并领取上一区奖励',
      progress: game.stats.revenue, target: tier * tier * 5000, gold: tier * 1500, tickets: tier * 10,
      extra: '1件动力组件', reason: tier > 1 && !c.claimed.includes(`boss-${tier - 1}`) ? '请先领取上一区奖励' : '',
      command: { type: 'career-claim', id },
    }, c.claimed.includes(id));
  }
  return items;
}
export function taskOverview(game: GameState) {
  const items = taskItems(game), count = items.filter(t => t.state === 'claimable').length;
  return { count, task: items.find(t => t.state === 'claimable') ?? items.find(t => t.state === 'active') };
}
