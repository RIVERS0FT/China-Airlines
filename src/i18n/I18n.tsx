import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { airport as airportDefinition } from '../core/catalog.js';
import { legacyText } from './legacy-en.js';

export type Locale = 'zh-CN' | 'en-US';
export const LOCALE_KEY = 'china-airlines:locale:v1';

const zh = {
  'app.name': '中华航空',
  'app.subtitle': '航线经营',
  'app.tagline': '连接世界，经营你的航空网络',
  'start.loading': '正在准备机场与航班…',
  'start.enter': '进入游戏',
  'start.recovery': '存档需要恢复后才能继续',
  'start.settings': '存档与设置',
  'start.ready': '离线单机航空运输经营',
  'start.kicker': '离线 · 单机',
  'locale.label': '语言',
  'locale.zh': '中文',
  'locale.en': 'English',
  'nav.main': '主导航',
  'nav.map': '地图',
  'nav.airport': '机场装载',
  'nav.directory': '机场目录',
  'nav.fleet': '机队管理',
  'nav.shop': '飞机商店',
  'nav.organization': '公司组织',
  'nav.career': '经营中心',
  'nav.dispatch': '制定路线',
  'map.browse': '地图浏览',
  'map.title': '地图',
  'map.unlocked': '已解锁 {open} / {total} 城市',
  'map.find': '查找城市',
  'map.airport': '机场装载',
  'map.flight': '查看航班',
  'map.guide': '点城市查看详情与解锁',
  'map.settings': '存档设置',
  'map.returnFlight': '返回航班', 'map.returnAirport': '返回机场',
  'map.locate': '定位当前飞机',
  'map.globeHint': '拖动旋转 · 双指缩放',
  'map.selectCity': '选择城市',
  'map.selectAirport': '选择机场',
  'map.selectCityBrowse': '选择城市查看机场、客货与解锁条件。',
  'map.selectCityFlight': '只浏览城市，不修改当前航班。',
  'map.selectCityPlan': '从{city}出发，按选择顺序添加，最多{count}段。',
  'map.search': '搜索全球机场',
  'map.searchPlaceholder': '城市、机场代码或区域',
  'map.region': '世界区域',
  'map.cityRegion': '城市世界区域',
  'map.allRegions': '全球全部区域',
  'map.noResults': '没有符合条件的机场。',
  'map.clearFilters': '清除城市筛选',
  'map.browseCity': '浏览城市',
  'map.addCity': '添加目的城市',
  'map.chooseCity': '请选择城市',
  'map.locked': '未解锁',
  'map.inspect': '查看{city}机场详情',
  'map.catalogNote': '首批50座全球机场。未解锁城市打开详情；取消解锁不追加航段。远程需升级机型或安排中转，关闭窗口保留球面视角。',
  'map.routeTip': '拖动地球旋转；点机场选路，顶部目的地可搜索全球。',
  'map.closeTip': '关闭选路提示',
  'map.destination': '目的地',
  'map.selectDestination': '选择目的城市',
  'map.remaining': '剩余时间',
  'map.estimated': '预计时间',
  'map.profit': '净利润',
  'map.cost': '成本',
  'map.a11yBrowse': '地图浏览',
  'map.a11yFlight': '航班地图',
  'map.a11yPlan': '起飞规划',
  'map.globeTitle': '全球航网',
  'map.globeA11y': '球形机场航线示意图，当前选择{city}。拖动旋转，双指缩放；方向键旋转，Home定位飞机。',
  'map.routeMap': '制定路线地图',
  'map.map': '地图',
  'map.fallback': '地图不可用，请点击顶部「{control}」搜索全球机场并选择城市。',
  'map.passengerBadge': '乘客 {count}',
  'map.showOthers': '显示其他飞机',
  'map.hideOthers': '隐藏其他飞机',
  'map.show': '显示',
  'map.hide': '隐藏',
  'map.otherAircraft': '其他飞机',
  'map.zoomIn': '放大地图',
  'map.zoomOut': '缩小地图',
  'map.disclaimer': '游戏示意图 · 非导航地图',
  'common.close': '关闭',
  'common.closeNotice': '关闭提示',
  'common.settings': '设置',
  'common.loading': '加载中',
  'common.saved': '已存档',
  'common.saving': '保存中',
  'common.attention': '需注意',
  'common.level': '{value} 级',
  'common.aircraftCount': '{count} 架',
  'common.ticketCount': '{count} 券',
  'common.flightCount': '{count} 班',
  'common.seconds': '{count}秒',
  'common.minutesSeconds': '{minutes}分{seconds}秒',
  'hud.company': '公司 Lv.{level} · 单机经营',
  'hud.credits': '运营资金',
  'hud.fleet': '机队概况',
  'hud.fleetOpen': '机队管理概览',
  'hud.tickets': '点券',
  'hud.help': '操作帮助',
  'hud.save': '存档设置',
  'rotate.title': '请旋转设备，横屏起航。',
  'rotate.subtitle': '中华航空 · 机场装载与航空运输',
  'flight.running': '航班运行中 · 可切换其他飞机继续经营',
  'flight.view': '查看当前航班',
  'flight.sceneLabel': '{model}客舱与货舱示意',
  'flight.route': '{from} → {to}',
  'flight.progress': '{from}至{to}航班进度',
  'airport.details': '详情',
  'airport.currentDetails': '当前机场详情',
  'airport.detailsHint': '查看本机场客货、停靠和到离港航班',
  'airport.flight': '飞行',
  'airport.name': '{city}航空港',
  'airport.browseEmpty': '机场浏览 · 暂无停靠飞机',
  'airport.browseOnly': '可查看客货，不可装载异地飞机',
  'airport.parked': '停靠中 · 等待装载',
  'airport.passengers': '旅客 {used} / {capacity} 人',
  'airport.cargo': '货物 {used} / {capacity} 吨',
  'airport.energy': '能量 {value} 点',
  'airport.cancelPlan': '取消剩余计划',
  'airport.stopAuto': '停止自动往返',
  'airport.backPlane': '返回所选飞机 {id}',
  'airport.onward': '后续航段：{route}',
  'airport.previousPlane': '上一架飞机',
  'airport.nextPlane': '下一架飞机',
  'airport.noPlane': '本机场无停靠飞机',
  'airport.saving': '正在保存，请稍候',
  'airport.flying': '飞行中 · 可查看航班',
  'airport.servicing': '地勤补能中',
  'airport.turnaround': '周转完成后可起飞',
  'airport.routeHint': '选择目的地并预览航程',
  'settings.display': '界面显示',
  'settings.language': '界面语言',
  'settings.languageHelp': '立即生效，单独保存在此浏览器，不随存档导入或重新开始而改变。',
  'settings.title': '本地存档与设置',
  'settings.close': '关闭存档设置',
  'settings.scaleHelp': '按可用屏幕比例适配。同一宽高比与缩放设置下，手机和电脑布局一致。仅调整界面大小，不改变地图缩放级别或游戏进度。',
  'settings.scaleDown': '缩小界面', 'settings.scaleUp': '放大界面', 'settings.scaleLabel': 'UI 缩放',
  'settings.scalePresets': '界面缩放预设', 'settings.scaleReset': '恢复默认缩放',
  'settings.scaleStored': '实时生效，单独保存在此浏览器，不随导入或重新开始而重置。',
  'settings.saveConfirmed': '进度已保存在此浏览器', 'settings.saveMissing': '尚无已确认的保存',
  'settings.lastSaved': '最近保存 {time}', 'settings.saveSafe': '读取失败时不会自动覆盖原有数据。',
  'settings.saveHelp': '关键经营操作后保存，每10秒自动保存。清理浏览器数据或使用隐私模式可能丢失进度，请定期导出。',
  'settings.saveNow': '立即保存', 'settings.export': '导出存档', 'settings.import': '导入存档', 'settings.restore': '恢复上一份备份',
  'settings.chooseFile': '选择存档文件', 'settings.importLarge': '存档文件过大（上限 1 MB）',
  'settings.importConfirm': '导入将替换当前进度，并保留上一份有效备份。确定继续？',
  'settings.restoreConfirm': '恢复上一份有效备份？当前进度将成为新的备份。',
  'settings.offline': '离线运行', 'settings.offlineReady': '资源缓存已就绪，可在断网后重新打开。',
  'settings.offlineFirst': '首次访问需要网络；缓存完成后才能离线启动。',
  'settings.saveCompatibility': '离线经营与旧存档',
  'settings.saveCompatibilityHelp': '最多补算8小时。导入不补算文件时间；v1—v7严格校验后迁移至v8，保留旧飞机、员工合同、订单和在途收益。v8无法由旧游戏读取。',
  'settings.persistence': '保留本地存储', 'settings.persistenceHelp': '申请不能替代导出备份。', 'settings.persistenceApply': '申请保留',
  'settings.persistenceUnsupported': '此浏览器不支持持久存储申请。', 'settings.persistenceGranted': '浏览器已允许持久存储。',
  'settings.persistenceDenied': '浏览器暂未授予持久存储，请保留导出备份。', 'settings.persistenceFailed': '申请失败，请保留导出备份。',
  'settings.update': '保存进度并更新应用',
  'settings.privacy': '虚构机型和经营参数，无账号、遥测或云存档。', 'settings.restart': '重新开始',
  'settings.restartConfirm': '确定重新开始？当前有效进度会保留为上一份备份。',
  'status.offlineReport': '离线运输报告',
  'status.clockBack': '设备时间回拨',
  'status.continue': '继续经营',
  'status.offlineSummary': '推进 {elapsed} · 完成 {flights} 班 · 净收入 {profit}',
  'status.offlineCap': '最多补算8小时，超出部分已丢弃。',
  'status.update': '新版本就绪 · 保存后更新',
  'status.blocked': '此存档正在另一个窗口中使用',
  'status.blockedText': '此窗口已停止写入，以免覆盖更新的进度。',
  'status.reload': '重新载入最新进度',
  'modal.career': '公司经营中心',
  'modal.organization': '公司组织',
  'modal.shop': '飞机商店',
  'modal.fleet': '机队管理',
  'modal.tasks': '任务中心',
  'modal.help': '起航指南',
  'modal.airports': '机场目录',
  'modal.airportDetails': '机场详情',
  'modal.close': '关闭{title}',
  'startup.missing': '进度尚未载入',
  'startup.recover': '导入或恢复存档',
} as const;

type MessageKey = keyof typeof zh;
const en: Record<MessageKey, string> = {
  'app.name': 'China Airlines',
  'app.subtitle': 'Route Operations',
  'app.tagline': 'Connect the world and build your airline network',
  'start.loading': 'Preparing airports and flights…',
  'start.enter': 'Enter Game',
  'start.recovery': 'Recover your save before continuing',
  'start.settings': 'Saves & Settings',
  'start.ready': 'Offline single-player airline management',
  'start.kicker': 'OFFLINE · SINGLE PLAYER',
  'locale.label': 'Language',
  'locale.zh': '中文',
  'locale.en': 'English',
  'nav.main': 'Main navigation',
  'nav.map': 'Map',
  'nav.airport': 'Airport',
  'nav.directory': 'Directory',
  'nav.fleet': 'Fleet',
  'nav.shop': 'Aircraft Shop',
  'nav.organization': 'Organization',
  'nav.career': 'Operations',
  'nav.dispatch': 'Plan Route',
  'map.browse': 'Map browser',
  'map.title': 'Map',
  'map.unlocked': '{open} / {total} cities unlocked',
  'map.find': 'Find City',
  'map.airport': 'Airport',
  'map.flight': 'View Flight',
  'map.guide': 'Select a city to view details or unlock it',
  'map.settings': 'Save settings',
  'map.returnFlight': 'Return to Flight', 'map.returnAirport': 'Return to Airport',
  'map.locate': 'Locate current aircraft',
  'map.globeHint': 'Drag to rotate · Pinch to zoom',
  'map.selectCity': 'Choose City',
  'map.selectAirport': 'Choose Airport',
  'map.selectCityBrowse': 'Choose a city to view its airport, traffic, and unlock requirements.',
  'map.selectCityFlight': 'Browse cities without changing the current flight.',
  'map.selectCityPlan': 'Departing {city}; add cities in order, up to {count} legs.',
  'map.search': 'Search Airports',
  'map.searchPlaceholder': 'City, airport code, or region',
  'map.region': 'World Region',
  'map.cityRegion': 'City world region',
  'map.allRegions': 'All Regions',
  'map.noResults': 'No airports match the current filters.',
  'map.clearFilters': 'Clear Filters',
  'map.browseCity': 'Browse City',
  'map.addCity': 'Add Destination',
  'map.chooseCity': 'Choose a city',
  'map.locked': 'Locked',
  'map.inspect': 'View {city} Airport Details',
  'map.catalogNote': 'The first release includes 50 airports. Locked cities open details first. Long-range travel may require upgrades or intermediate stops. Closing this dialog preserves the globe camera.',
  'map.routeTip': 'Drag to rotate the globe; select airports to build a route, or search from the destination control.',
  'map.closeTip': 'Close route tip',
  'map.destination': 'Destination',
  'map.selectDestination': 'Choose destination city',
  'map.remaining': 'Time Left',
  'map.estimated': 'Est. Time',
  'map.profit': 'Net Profit',
  'map.cost': 'Cost',
  'map.a11yBrowse': 'Map browser',
  'map.a11yFlight': 'Flight map',
  'map.a11yPlan': 'Flight planning',
  'map.globeTitle': 'Global Network',
  'map.globeA11y': 'Spherical airport route map, currently focused on {city}. Drag to rotate, pinch to zoom, use arrow keys to rotate, and press Home to locate the aircraft.',
  'map.routeMap': 'Route planning map',
  'map.map': 'Map',
  'map.fallback': 'The map is unavailable. Use “{control}” above to search airports and choose a city.',
  'map.passengerBadge': '{count} passengers',
  'map.showOthers': 'Show other aircraft',
  'map.hideOthers': 'Hide other aircraft',
  'map.show': 'Show',
  'map.hide': 'Hide',
  'map.otherAircraft': 'Other Aircraft',
  'map.zoomIn': 'Zoom in',
  'map.zoomOut': 'Zoom out',
  'map.disclaimer': 'Game visualization · Not for navigation',
  'common.close': 'Close',
  'common.closeNotice': 'Dismiss Notice',
  'common.settings': 'Settings',
  'common.loading': 'Loading',
  'common.saved': 'Saved',
  'common.saving': 'Saving',
  'common.attention': 'Attention',
  'common.level': 'Level {value}',
  'common.aircraftCount': '{count} aircraft',
  'common.ticketCount': '{count} tickets',
  'common.flightCount': '{count} flights',
  'common.seconds': '{count}s',
  'common.minutesSeconds': '{minutes}m {seconds}s',
  'hud.company': 'Company Lv.{level} · Single Player',
  'hud.credits': 'Operating Funds',
  'hud.fleet': 'Fleet Overview',
  'hud.fleetOpen': 'Open Fleet Management',
  'hud.tickets': 'Tickets',
  'hud.help': 'Help',
  'hud.save': 'Save settings',
  'rotate.title': 'Rotate your device to take off.',
  'rotate.subtitle': 'China Airlines · Airport & Flight Operations',
  'flight.running': 'Flight in progress · You can manage other aircraft',
  'flight.view': 'View current flight',
  'flight.sceneLabel': '{model} cabin and cargo hold',
  'flight.route': '{from} → {to}',
  'flight.progress': 'Flight progress from {from} to {to}',
  'airport.details': 'Details',
  'airport.currentDetails': 'Current airport details',
  'airport.detailsHint': 'View waiting cargo, parked aircraft, arrivals and departures',
  'airport.flight': 'Flight',
  'airport.name': '{city} Airport',
  'airport.browseEmpty': 'Airport browser · No parked aircraft',
  'airport.browseOnly': 'Browse only · Aircraft elsewhere cannot be loaded',
  'airport.parked': 'Parked · Ready for loading',
  'airport.passengers': 'Passengers {used} / {capacity}',
  'airport.cargo': 'Cargo {used} / {capacity} t',
  'airport.energy': 'Energy {value}',
  'airport.cancelPlan': 'Cancel Remaining Plan',
  'airport.stopAuto': 'Stop Auto Shuttle',
  'airport.backPlane': 'Return to aircraft {id}',
  'airport.onward': 'Onward legs: {route}',
  'airport.previousPlane': 'Previous aircraft',
  'airport.nextPlane': 'Next aircraft',
  'airport.noPlane': 'No aircraft parked here',
  'airport.saving': 'Saving, please wait',
  'airport.flying': 'In flight · View flight',
  'airport.servicing': 'Ground energy service in progress',
  'airport.turnaround': 'Available after turnaround',
  'airport.routeHint': 'Choose destinations and preview the route',
  'settings.display': 'Display',
  'settings.language': 'Interface language',
  'settings.languageHelp': 'Changes immediately and is stored only in this browser, independently of game saves.',
  'settings.title': 'Local Saves & Settings',
  'settings.close': 'Close save settings',
  'settings.scaleHelp': 'Fits the available screen. Phones and computers use the same layout at the same aspect ratio and scale. This changes interface size only, not map zoom or game progress.',
  'settings.scaleDown': 'Reduce interface size', 'settings.scaleUp': 'Increase interface size', 'settings.scaleLabel': 'UI scale',
  'settings.scalePresets': 'Interface scale presets', 'settings.scaleReset': 'Reset Scale',
  'settings.scaleStored': 'Applies immediately and is stored in this browser independently of imported saves and restarts.',
  'settings.saveConfirmed': 'Progress saved in this browser', 'settings.saveMissing': 'No confirmed save yet',
  'settings.lastSaved': 'Last saved {time}', 'settings.saveSafe': 'A read failure never overwrites existing data.',
  'settings.saveHelp': 'Key operations are saved immediately, with an autosave every 10 seconds. Clearing browser data or using private mode may lose progress; export regularly.',
  'settings.saveNow': 'Save Now', 'settings.export': 'Export Save', 'settings.import': 'Import Save', 'settings.restore': 'Restore Previous Backup',
  'settings.chooseFile': 'Choose save file', 'settings.importLarge': 'Save file is too large (1 MB limit)',
  'settings.importConfirm': 'Importing replaces current progress and preserves the last valid save as a backup. Continue?',
  'settings.restoreConfirm': 'Restore the last valid backup? Current progress will become the new backup.',
  'settings.offline': 'Offline Play', 'settings.offlineReady': 'Resources are cached and the game can be reopened offline.',
  'settings.offlineFirst': 'The first visit requires a connection. Offline launch is available after caching finishes.',
  'settings.saveCompatibility': 'Offline Progress & Older Saves',
  'settings.saveCompatibilityHelp': 'Offline progress is capped at 8 hours. Imports do not advance file time. Versions 1–7 are strictly validated and migrated to v8 while preserving aircraft, employee contracts, orders, and in-flight income. Older games cannot read v8.',
  'settings.persistence': 'Persistent Local Storage', 'settings.persistenceHelp': 'This request does not replace exported backups.', 'settings.persistenceApply': 'Request',
  'settings.persistenceUnsupported': 'This browser does not support persistent-storage requests.', 'settings.persistenceGranted': 'Persistent storage is allowed.',
  'settings.persistenceDenied': 'Persistent storage was not granted; keep exported backups.', 'settings.persistenceFailed': 'The request failed; keep exported backups.',
  'settings.update': 'Save and Update App',
  'settings.privacy': 'Fictional aircraft and economics. No account, telemetry, or cloud saves.', 'settings.restart': 'Restart Game',
  'settings.restartConfirm': 'Start over? Current valid progress will be kept as the previous backup.',
  'status.offlineReport': 'Offline Flight Report',
  'status.clockBack': 'Device Clock Moved Back',
  'status.continue': 'Continue',
  'status.offlineSummary': 'Advanced {elapsed} · {flights} flights · Net income {profit}',
  'status.offlineCap': 'Offline progress is capped at 8 hours; excess time was discarded.',
  'status.update': 'Update ready · Save and update',
  'status.blocked': 'This save is open in another window',
  'status.blockedText': 'Writing has stopped here to avoid overwriting newer progress.',
  'status.reload': 'Reload Latest Progress',
  'modal.career': 'Company Operations',
  'modal.organization': 'Company Organization',
  'modal.shop': 'Aircraft Shop',
  'modal.fleet': 'Fleet Management',
  'modal.tasks': 'Task Center',
  'modal.help': 'Flight Guide',
  'modal.airports': 'Airport Directory',
  'modal.airportDetails': 'Airport Details',
  'modal.close': 'Close {title}',
  'startup.missing': 'Progress has not loaded',
  'startup.recover': 'Import or Recover Save',
};

const AIRPORT_EN: Readonly<Record<string, [string, string]>> = {
  PEK:['Beijing','North China Hub'], PVG:['Shanghai','East China Hub'], WUH:['Wuhan','Central China Hub'], XIY:["Xi'an",'Northwest Gateway'],
  CTU:['Chengdu','Southwest Hub'], CKG:['Chongqing','Mountain Gateway'], CAN:['Guangzhou','South China Hub'], KMG:['Kunming','Yunnan Gateway'],
  HKG:['Hong Kong','Bay Airport'], TPE:['Taipei','Island Airport'], SYX:['Sanya','Coastal Airport'], URC:['Urumqi','Western Gateway'],
  ICN:['Seoul','South Korea · East Asia'], NRT:['Tokyo','Japan · East Asia'], MNL:['Manila','Philippines · Southeast Asia'], BKK:['Bangkok','Thailand · Southeast Asia'],
  SIN:['Singapore','Singapore · Southeast Asia'], CGK:['Jakarta','Indonesia · Southeast Asia'], DEL:['Delhi','India · South Asia'], BOM:['Mumbai','India · South Asia'],
  DXB:['Dubai','UAE · West Asia'], IST:['Istanbul','Türkiye · Eurasian Gateway'], LHR:['London','United Kingdom · Western Europe'], CDG:['Paris','France · Western Europe'],
  FRA:['Frankfurt','Germany · Central Europe'], FCO:['Rome','Italy · Southern Europe'], SVO:['Moscow','Russia · Eastern Europe'], KEF:['Reykjavík','Iceland · North Atlantic'],
  CAI:['Cairo','Egypt · North Africa'], ADD:['Addis Ababa','Ethiopia · East Africa'], NBO:['Nairobi','Kenya · East Africa'], JNB:['Johannesburg','South Africa · Southern Africa'],
  CPT:['Cape Town','South Africa · Southern Africa'], LOS:['Lagos','Nigeria · West Africa'], CMN:['Casablanca','Morocco · North Africa'], ANC:['Anchorage','United States · Alaska'],
  HNL:['Honolulu','United States · Hawaii'], YVR:['Vancouver','Canada · Pacific Gateway'], LAX:['Los Angeles','United States · Pacific Gateway'], JFK:['New York','United States · Atlantic Gateway'],
  MEX:['Mexico City','Mexico · Southern North America'], BOG:['Bogotá','Colombia · Northern South America'], LIM:['Lima','Peru · Western South America'], GRU:['São Paulo','Brazil · Eastern South America'],
  SCL:['Santiago','Chile · Western South America'], EZE:['Buenos Aires','Argentina · Southern South America'], SYD:['Sydney','Australia · East'], PER:['Perth','Australia · West'],
  AKL:['Auckland','New Zealand · South Pacific'], NAN:['Nadi','Fiji · South Pacific'],
};

const MODEL_EN: Readonly<Record<string, [string, string]>> = {
  'starter-swift':['Swift First Flight','Starter mixed-use aircraft'],
  'swift-p':['Swift Passenger','Light passenger aircraft'], 'swift-f':['Swift Freighter','Light cargo aircraft'], 'swift-m':['Swift Mixed','Light mixed-use aircraft'],
  'heron-p':['Heron Passenger','Regional passenger aircraft'], 'heron-f':['Heron Freighter','Regional cargo aircraft'], 'heron-m':['Heron Mixed','Regional mixed-use aircraft'],
  'albatross-p':['Albatross Passenger','Heavy passenger aircraft'], 'albatross-f':['Albatross Freighter','Heavy cargo aircraft'], 'albatross-m':['Albatross Mixed','Heavy mixed-use aircraft'],
  'aurora-p':['Aurora Passenger','Long-range passenger aircraft'], 'aurora-f':['Aurora Freighter','Long-range cargo aircraft'], 'aurora-m':['Aurora Mixed','Long-range mixed-use aircraft'],
  'starter-lark':['Lark 6','Starter light mixed-use aircraft'], lark:['Lark 70','Regional mixed-use aircraft'], swallow:['Swallow 160','Medium-range mixed-use aircraft'], horizon:['Horizon 280','Long-range mixed-use aircraft'],
  'lark-p':['Lark 90P','Regional passenger aircraft'], 'lark-f':['Lark 8F','Regional cargo aircraft'], 'swallow-p':['Swallow 190P','Mainline passenger aircraft'], 'swallow-f':['Swallow 24F','Mainline cargo aircraft'],
  'horizon-p':['Horizon 330P','Wide-body passenger aircraft'], 'horizon-f':['Horizon 50F','Wide-body cargo aircraft'],
};

const CONTINENT_EN: Readonly<Record<string, string>> = { 亚洲:'Asia', 欧洲:'Europe', 非洲:'Africa', 北美洲:'North America', 南美洲:'South America', 大洋洲:'Oceania' };

function savedLocale(): Locale {
  try { return localStorage.getItem(LOCALE_KEY) === 'en-US' ? 'en-US' : 'zh-CN'; }
  catch { return 'zh-CN'; }
}

let activeLocale: Locale = savedLocale();

export function currentLocale() { return activeLocale; }
export function formatNumber(value: number, locale: Locale = activeLocale) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(value));
}
export function formatMoney(value: number, locale: Locale = activeLocale) { return `¥ ${formatNumber(value, locale)}`; }
export function formatDuration(value: number, locale: Locale = activeLocale) {
  const seconds = Math.max(0, Math.ceil(value));
  if (locale === 'en-US') return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s` : `${seconds}s`;
  return seconds >= 60 ? `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, '0')}秒` : `${seconds}秒`;
}
export function airportSearchAliases(id: string) { return AIRPORT_EN[id]?.join(' ') ?? ''; }

const DOMAIN_EN: Readonly<Record<string, string>> = {
  '操作完成':'Operation complete', '操作失败，请保留导出的进度并重试':'Operation failed. Keep an exported save and try again.',
  '尚未载入游戏':'The game has not loaded yet.', '没有可导出的进度':'There is no progress to export.',
  '主存档与备份均无法读取。请导入有效存档，或确认重新开始。':'Neither the main save nor its backup could be read. Import a valid save or restart.',
  '主存档损坏，已从上一份有效备份恢复。':'The main save was damaged and has been recovered from the last valid backup.',
  '存档导入成功，旧进度已保留为备份。':'Save imported. The previous progress is preserved as a backup.',
  '已恢复上一份有效备份。':'The last valid backup has been restored.', '已重新开始。':'A new game has started.',
  '离线缓存未就绪；当前仍可在线游玩，请稍后重新打开。':'Offline cache is not ready. You can keep playing online and try again later.',
  '浏览器无法保存显示偏好；本次缩放仍然生效。':'The browser could not save the display preference; this scale still applies for the current session.',
  '运营资金不足':'Insufficient operating funds', '飞机正在飞行':'Aircraft is in flight', '飞机正在飞行，不能装卸':'Aircraft in flight; loading is unavailable',
  '飞机正在地面周转':'Aircraft is in ground turnaround', '请选择已解锁的其他机场':'Choose another unlocked airport',
  '请选择不同的目的地':'Choose a different destination', '航线超出这架飞机的航程':'This route exceeds the aircraft range',
  '未找到这架飞机':'Aircraft not found', '机库机位不足，请先扩建机库':'No hangar slots available; expand the hangar first',
  '任务尚未完成':'Task not complete', '奖励已经领取':'Reward already claimed',
};

export function translateDomainText(value: string | null | undefined, locale: Locale = activeLocale) {
  if (!value || locale === 'zh-CN') return value ?? '';
  if (DOMAIN_EN[value]) return DOMAIN_EN[value]!;
  let result = value;
  for (const [id, [name]] of Object.entries(AIRPORT_EN)) result = result.replaceAll(airportDefinition(id).city, name);
  return result
    .replace(/(AC\d+) ([^ ]+) → ([^ ]+) 起飞/, '$1 departed $2 → $3')
    .replace(/(AC\d+) 抵达([^·]+) · 交付 (\d+) 单/, '$1 arrived at $2 · $3 orders delivered')
    .replace(/解锁(.+)机场/, '$1 Airport unlocked')
    .replace(/(.+)机场升至 (\d+) 级/, '$1 Airport upgraded to Level $2')
    .replace(/完成任务：(.+)/, 'Task completed: $1');
}
function interpolate(template: string, params: Record<string, string | number> = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`));
}

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  money: (value: number) => string;
  number: (value: number) => string;
  duration: (seconds: number) => string;
  airportName: (id: string, fallback: string) => string;
  airportRegion: (id: string, fallback: string) => string;
  modelName: (id: string, fallback: string) => string;
  modelRole: (id: string, fallback: string) => string;
  continentName: (value: string) => string;
  text: (value: string | null | undefined) => string;
  ui: (source: string, params?: Record<string, string | number>) => string;
}
const Context = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setCurrent] = useState<Locale>(savedLocale);
  activeLocale = locale;
  const setLocale = (next: Locale) => {
    setCurrent(next);
    try { localStorage.setItem(LOCALE_KEY, next); } catch { /* The choice still applies to this session. */ }
  };
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = locale === 'zh-CN' ? '中华航空 · 航线经营' : 'China Airlines · Route Operations';
    document.querySelector('meta[name="description"]')?.setAttribute('content', locale === 'zh-CN'
      ? '中华航空：横屏、离线、单机的航空运输经营游戏。'
      : 'China Airlines: a landscape-first, offline, single-player airline management game.');
  }, [locale]);
  const value = useMemo<I18nValue>(() => {
    const table = locale === 'zh-CN' ? zh : en;
    const number = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(n));
    return {
      locale, setLocale, number,
      t: (key, params) => interpolate(table[key], params),
      money: n => `¥ ${number(n)}`,
      duration: value => {
        const seconds = Math.max(0, Math.ceil(value));
        return seconds >= 60 ? interpolate(table['common.minutesSeconds'], { minutes: Math.floor(seconds / 60), seconds: String(seconds % 60).padStart(2, '0') }) : interpolate(table['common.seconds'], { count: seconds });
      },
      airportName: (id, fallback) => locale === 'en-US' ? AIRPORT_EN[id]?.[0] ?? fallback : fallback,
      airportRegion: (id, fallback) => locale === 'en-US' ? AIRPORT_EN[id]?.[1] ?? fallback : fallback,
      modelName: (id, fallback) => locale === 'en-US' ? MODEL_EN[id]?.[0] ?? fallback : fallback,
      modelRole: (id, fallback) => locale === 'en-US' ? MODEL_EN[id]?.[1] ?? fallback : fallback,
      continentName: value => locale === 'en-US' ? CONTINENT_EN[value] ?? value : value,
      text: value => translateDomainText(value, locale),
      ui: (source, params) => legacyText(source, locale, params),
    };
  }, [locale]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useI18n() {
  const value = useContext(Context);
  if (!value) throw new Error('I18nProvider is required');
  return value;
}

export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return <div className={`language-picker ${compact ? 'is-compact' : ''}`} role="group" aria-label={t('locale.label')}>
    <button type="button" aria-pressed={locale === 'zh-CN'} onClick={() => setLocale('zh-CN')}>{t('locale.zh')}</button>
    <button type="button" aria-pressed={locale === 'en-US'} onClick={() => setLocale('en-US')}>{t('locale.en')}</button>
  </div>;
}
