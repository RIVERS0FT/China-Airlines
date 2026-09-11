import { manifest, type GameState, type Plane } from './game.js';
export interface GuideStep { id: string; number: number; title: string; text: string; target: string; screen: 'airport' | 'map' | 'tasks' }
/** Derive progress from actual actions. Never simulate clicks or award money. */
export function guideStep(game: GameState, plane: Plane, screen: 'airport' | 'map', to: string): GuideStep {
  if (game.claimedTasks.includes('first-flight')) return { id: 'done', number: 6, title: '首航培训完成', text: '继续解锁城市、收集飞机与安排中转。引导不会额外发钱或重置进度。', target: '.game-dock', screen: 'airport' };
  if (game.stats.flights > 0) return { id: 'reward', number: 6, title: '领取首航奖励', text: '打开运营任务，领取「第一道航迹」奖励。每项奖励只能领取一次。', target: '[data-guide="tasks"]', screen: 'tasks' };
  if (game.fleet.some(p => p.flight)) return { id: 'flight', number: 5, title: '观察航班到达', text: '飞机按时间抵达，最终目的地订单才结算。可以切换其他飞机，不必一直盯着动画。', target: '.scene-wrap', screen: 'airport' };
  if (!manifest(game, plane.id).length) return { id: 'load', number: 1, title: '选择旅客与货物', text: '点击候机大厅的客货卡片，或使用「同目的地装载」。首航可装载前往上海的订单。', target: '[data-testid="waiting-order"]:not(:disabled)', screen: 'airport' };
  if (screen !== 'map') return { id: 'map', number: 2, title: '进入航线地图', text: '点击右下角「选择航线起飞」，为已装载客货安排首航。', target: '.depart-button', screen: 'map' };
  if (to === plane.airportId) return { id: 'route', number: 3, title: '点击城市加入路线', text: '直接点击地图上的已解锁城市。点击顺序就是飞行顺序，不需要再开通或建设航线。', target: '[data-testid="map-canvas"]', screen: 'map' };
  return { id: 'dispatch', number: 4, title: '核对后确认起飞', text: '检查路线、用时、运营成本和交付收入，点击「确认起飞」。只在订单最终目的地付款。', target: '[data-testid="dispatch"]', screen: 'map' };
}
