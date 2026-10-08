import { airport as airportDefinition } from '../../core/catalog.js';
import { localeBundle, type Locale } from '../registry.js';

const EN_DIRECT: Readonly<Record<string, string>> = {
  '交付机场星级不足': 'Delivery airport has insufficient stars',
  '操作完成':'Operation complete',
  '操作失败，请保留导出的进度并重试':'Operation failed. Keep an exported save and try again.',
  '尚未载入游戏':'The game has not loaded yet.',
  '没有可导出的进度':'There is no progress to export.',
  '主存档与备份均无法读取。请导入有效存档，或确认重新开始。':'Neither the main save nor its backup could be read. Import a valid save or restart.',
  '主存档损坏，已从上一份有效备份恢复。':'The main save was damaged and has been recovered from the last valid backup.',
  '存档导入成功，旧进度已保留为备份。':'Save imported. The previous progress is preserved as a backup.',
  '已恢复上一份有效备份。':'The last valid backup has been restored.',
  '已导入新的存档。':'A new save has been imported.',
  '请先创建航空公司':'Create an airline first.',
  '存档已满，请先在载入存档中删除不需要的存档。':'All save slots are full. Delete an unwanted save in Load Game first.',
  '暂无可载入的存档':'There are no saves to load.',
  '此存档版本不兼容':'This save version is incompatible.',
  '此存档无法读取':'This save could not be read.',
  '此存档与备份均无法读取。可载入其他存档或新建游戏。':'This save and its backup could not be read. Load another save or start a new game.',
  '检测到版本不兼容的存档。当前仅接受 v18；原数据未被覆盖。可载入其他存档或新建游戏。':'An incompatible save was found. Only v18 is supported; your data has not been overwritten. Load another save or start a new game.',
  '公司已经创建':'The company has already been created.',
  '公司名称须为 1–24 个字符，不能包含控制字符':'Company names must contain 1–24 characters without control characters.',
  '公司标志无效，请重新选择图片':'Invalid company logo. Choose another image.',
  '公司标志图片无法读取':'The company logo image could not be read.',
  '检测到版本不兼容的存档。当前仅接受 v18；原数据未被覆盖。请先保留浏览器数据，确认版本后再决定是否重新开始。':'An incompatible save was found. Only v18 is supported; your data has not been overwritten. Keep your browser data and check the version before restarting.',
  '离线缓存未就绪；当前仍可在线游玩，请稍后重新打开。':'Offline cache is not ready. You can keep playing online and try again later.',
  '浏览器无法保存显示偏好；本次缩放仍然生效。':'The browser could not save the display preference; this scale still applies for the current session.',
  '运营资金不足':'Insufficient operating funds',
  '飞机正在飞行':'Aircraft is in flight',
  '飞机正在飞行，不能装卸':'Aircraft in flight; loading is unavailable',
  '请选择已解锁的其他机场':'Choose another unlocked airport',
  '飞机正在地面周转':'Aircraft is in ground turnaround',
  '请选择不同的目的地':'Choose a different destination',
  '航线超出这架飞机的航程':'This route exceeds the aircraft range',
  '未找到这架飞机':'Aircraft not found',
  '机库机位不足，请先扩建机库':'No hangar slots available; expand the hangar first',
  '任务尚未完成':'Task not complete',
  '奖励已经领取':'Reward already claimed',
  '总经理直接向玩家汇报':'The general manager reports directly to you.',
  '总经理不支持内部转任':'Internal reassignment is unavailable for the general manager.',
  '部门经理只能向总经理或玩家汇报':'Department managers may report only to the general manager or you.',
  '任命为总经理直属部门经理':'Appointed to report directly to the general manager.',
  '总经理岗位已满':'The general manager position is filled.',
  '以总经理身份入职，包含7天合同':'Joined as general manager with a seven-day contract.',
  '总经理已入职，已含7天工资':'General manager hired, including seven days of pay.',
  '没有可分配的空闲飞机':'No idle aircraft available for assignment',
  '没有空缺地勤岗位的机场':'No airport with an open ground position',
  '机场尚未开放':'Airport is not open',
  '未知业务类型':'Unknown business type',
  '完成首次有偿运输后开放公司业务':'Complete your first paid flight to unlock company businesses',
  '该业务需要运营设施Lv.1':'This business requires operating facilities Lv.1',
  '该业务需要运营设施Lv.2':'This business requires operating facilities Lv.2',
  '该业务需要运营设施Lv.3':'This business requires operating facilities Lv.3',
  '该城市已开设此业务':'This city already has this business',
  '业务团队已达上限':'Business team limit reached',
  '业务或人员编号已达上限':'Business or employee IDs are exhausted',
  '人员编号已达上限':'Employee IDs are exhausted',
  '未找到业务员工':'Business employee not found',
  '未找到业务团队':'Business team not found',
  '团队岗位已满，请先扩建':'Team slots are full; expand first',
  '未知业务命令':'Unknown business command',
  '请先升级运营设施，或团队已达到扩建上限':'Upgrade operating facilities, or the team has reached its expansion limit',
  '员工已达到潜力上限':'The employee has reached their potential limit',
  '业务团队已开设，包含主管与1名员工':'Business team opened with a leader and one worker',
  '业务员工已上岗，每秒净收入增加':'Business worker hired; net income per second increased',
  '业务团队已扩建，新增2个岗位':'Business team expanded with two new slots',
  '业务员工培养完成，后续每秒收入已更新':'Business training completed; future income rate updated',
  '请从业务团队招募员工':'Recruit business employees from their team',
  '请使用业务团队的培养与管理操作':'Use the business team training and management controls',
  '该机场有业务团队，不能关闭':'This airport has business teams and cannot be closed',
  '加入业务团队，工资从业务收入中按秒扣除':'Joined the business team; wages are deducted from business revenue each second',
  '存档公司业务数据无效，原进度未被覆盖':'Invalid saved business data. Existing progress was not overwritten.',
  '业务收入超出安全计算范围':'Business income exceeds the safe calculation range',
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
    .replace(/该机型需要两端机场达到 (\d+) 星/, 'This aircraft requires both airports to have $1 stars')
    .replace(/交付机场需要达到 (\d+) 星/, 'Delivery airport requires $1 stars')
    .replace(/业务(管理|专业)提升至(\d+)级/, (_match, field: string, level: string) => `Business ${field === '管理' ? 'management' : 'professional'} reached level ${level}`)
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
