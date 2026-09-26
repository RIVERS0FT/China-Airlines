import { manifest, type GameState, type Plane } from './game.js';
export type GuideScreen = 'airport' | 'map' | 'tasks' | 'fleet' | 'shop' | 'airports';
export interface GuideStep { id: string; number: number; title: string; text: string; target: string; screen: GuideScreen }
export const GUIDE_STEPS = 8;
/** Progress follows committed state. Pending purchase selection is presentation only. */
export function guideStep(game: GameState, plane: Plane | undefined, screen: string, _to: string, purchaseOpen = false): GuideStep {
  if (game.claimedTasks.includes('first-flight')) return { id: 'done', number: 8, title: '首航培训完成', text: '你已完成机场购买、飞机选配和首条航线。接下来可以积累利润，逐步扩大航网。', target: '.game-dock', screen: 'airport' };
  if (game.stats.flights > 0) return { id: 'reward', number: 7, title: '领取首航奖励', text: '首航已抵达。打开任务中心，领取「第一道航迹」奖励；同一奖励只能领取一次。', target: '[data-task-id="first-flight"] button:not(:disabled), [data-guide="tasks"]', screen: 'tasks' };
  if (game.fleet.some(p => p.flight)) return { id: 'flight', number: 6, title: '观察航班到达', text: '航班正在飞行。抵达最终目的地后才会结算运费；可以离开页面，刷新也不会重复结算。', target: '.scene-wrap', screen: 'airport' };
  if (game.airports.length < 2) return { id: 'unlock', number: 1, title: '购买第一座目的地机场', text: '北京是公司基地。先花费 4,000 金币购买上海机场，建立第一条可运营的连接。', target: '[data-guide="unlock-airport"], [data-airport-id="PVG"], [data-guide="locked-airports"]:not([aria-pressed="true"]), [data-guide="airports"]:not([aria-current="page"])', screen: 'airports' };
  if (!game.fleet.length && !purchaseOpen) return { id: 'buy', number: 2, title: '选购 1 格飞机', text: '前往飞机商店，选择 2,300 金币的钻石 DA40。点击购买后先选配容量，确认前不会扣款。', target: '[data-guide="buy-first-plane"], [data-guide="shop"]', screen: 'shop' };
  if (purchaseOpen) return { id: 'configure', number: 3, title: '免费配置首架飞机', text: 'DA40 总容量为 1 格。将客位设为 1、货位设为 0，或选择 1 格货位；确认选配并购买，只扣机价。', target: '.purchase-controls, .purchase-actions', screen: 'shop' };
  const selected = plane ?? game.fleet[0];
  if (selected && selected.allocation.passengers + selected.allocation.cargo === 0) return { id: 'configure', number: 3, title: '配置飞机容量', text: '这架飞机尚未分配容量。前往机队管理，分配至少一个客位或货位，再进行装载。', target: '.cabin-allocation, [data-guide="fleet"]', screen: 'fleet' };
  if (selected && !manifest(game, selected.id).length) return { id: 'load', number: 4, title: '装载首航订单', text: '前往机场装载，点击一份前往上海的旅客或货物。订单必须符合刚才配置的容量；已装载订单再次点击可卸下。', target: '[data-testid="waiting-order"]:not(:disabled), [data-guide="airport"]', screen: 'airport' };
  if (screen !== 'map' && screen !== 'dispatch') return { id: 'map', number: 5, title: '制定首航路线', text: '点击「制定航线」，选择已购买的上海机场，核对费用并确认起飞。', target: '.depart-button', screen: 'map' };
  return { id: 'dispatch', number: 5, title: '选择上海并确认起飞', text: '在地图上点选上海，再点击「检票起飞」。起飞只扣成本，运费在抵达后结算。', target: '[data-testid="dispatch"]:not(:disabled), .map-fallback button, [data-testid="map-canvas"], dialog[open] .dispatch-city-field', screen: 'map' };
}
