import { airport as airportDefinition } from '../../core/catalog.js';
import { localeBundle, type Locale } from '../registry.js';

const EN_DIRECT: Readonly<Record<string, string>> = {
  '操作完成':'Operation complete',
  '操作失败，请保留导出的进度并重试':'Operation failed. Keep an exported save and try again.',
  '尚未载入游戏':'The game has not loaded yet.',
  '没有可导出的进度':'There is no progress to export.',
  '主存档与备份均无法读取。请导入有效存档，或确认重新开始。':'Neither the main save nor its backup could be read. Import a valid save or restart.',
  '主存档损坏，已从上一份有效备份恢复。':'The main save was damaged and has been recovered from the last valid backup.',
  '存档导入成功，旧进度已保留为备份。':'Save imported. The previous progress is preserved as a backup.',
  '已恢复上一份有效备份。':'The last valid backup has been restored.',
  '已重新开始。':'A new game has started.',
  '离线缓存未就绪；当前仍可在线游玩，请稍后重新打开。':'Offline cache is not ready. You can keep playing online and try again later.',
  '浏览器无法保存显示偏好；本次缩放仍然生效。':'The browser could not save the display preference; this scale still applies for the current session.',
  '运营资金不足':'Insufficient operating funds',
  '飞机正在飞行':'Aircraft is in flight',
  '飞机正在飞行，不能装卸':'Aircraft in flight; loading is unavailable',
  '飞机正在地面周转':'Aircraft is in ground turnaround',
  '请选择已解锁的其他机场':'Choose another unlocked airport',
  '请选择不同的目的地':'Choose a different destination',
  '航线超出这架飞机的航程':'This route exceeds the aircraft range',
  '未找到这架飞机':'Aircraft not found',
  '机库机位不足，请先扩建机库':'No hangar slots available; expand the hangar first',
  '任务尚未完成':'Task not complete',
  '奖励已经领取':'Reward already claimed',
};

function replaceAirportNames(value: string, locale: Locale) {
  let result = value;
  const airports = localeBundle(locale).entities?.airports ?? {};
  for (const [id, entry] of Object.entries(airports)) {
    result = result.replaceAll(airportDefinition(id).city, entry.name);
  }
  return result;
}

function translateEnglish(value: string) {
  if (EN_DIRECT[value]) return EN_DIRECT[value]!;
  return replaceAirportNames(value, 'en-US')
    .replace(/(AC\d+) ([^ ]+) → ([^ ]+) 起飞/, '$1 departed $2 → $3')
    .replace(/(AC\d+) 抵达([^·]+) · 交付 (\d+) 单/, '$1 arrived at $2 · $3 orders delivered')
    .replace(/解锁(.+)机场/, '$1 Airport unlocked')
    .replace(/(.+)机场升至 (\d+) 级/, '$1 Airport upgraded to Level $2')
    .replace(/完成任务：(.+)/, 'Task completed: $1');
}

export function translateCoreText(value: string | null | undefined, locale: Locale) {
  if (!value || locale === 'zh-CN') return value ?? '';
  if (locale === 'en-US') return translateEnglish(value);
  return value;
}
