"""One-time, reviewable edits against the verified v0.3 baseline; removed before PR."""
from pathlib import Path
import hashlib
import json

root = Path.cwd()
def blob(path):
    raw = (root/path).read_bytes()
    return hashlib.sha1(f'blob {len(raw)}\0'.encode()+raw).hexdigest()
for path, expected in {'src/core/game.ts':'c585ef8cc18c13fd16288359a33ac95e91acc3e9','src/core/catalog.ts':'c9c926f3c378e68a1800c4c098689ce5d96549ce','src/ui/App.tsx':'11e37f8554b7ec10934dfe62f55f3ffb7fe85cb4','src/ui/Hangar.tsx':'2fe11dac37ceaf99f42dfabd5ac90646a5d1a27c'}.items():
    assert blob(path) == expected, f'Baseline changed: {path}'

p=root/'src/core/game.ts'
old=p.read_text()
(root/'src/core/catalog-v3.ts').write_text((root/'src/core/catalog.ts').read_text())
(root/'src/core/save-v3.ts').write_text('/** Frozen v0.3 migration baseline; not the current simulation. */\n'+old.replace("from './catalog.js'", "from './catalog-v3.js'"))
s=old.replace("import { validateV2, type GameState as V2State } from './save-v2.js';", "import { validateV2, type GameState as V2State } from './save-v2.js';\nimport { validateSave as validateV3 } from './save-v3.js';\nimport { DISPATCHER_PRICE, resaleValue } from './management.js';")
s=s.replace('export const SAVE_VERSION = 3;', "export const SAVE_VERSION = 4;\nexport type TutorialState = 'available' | 'active' | 'completed' | 'skipped';")
s=s.replace('upgrades: Upgrades; itinerary: string[] }','upgrades: Upgrades; itinerary: string[]; dispatcher: boolean }')
s=s.replace('version: 3; fleet:', 'version: 4; fleet:')
s=s.replace('nextDemandAt: number;\n}', 'nextDemandAt: number; fleetPeak: number; tutorial: TutorialState;\n}')
s=s.replace("| { type: 'cancel-plan'; planeId: string };", "| { type: 'cancel-plan'; planeId: string }\n  | { type: 'hire-dispatcher' | 'dismiss-dispatcher' | 'sell-plane'; planeId: string }\n  | { type: 'start-duty'; planeId: string; to: string }\n  | { type: 'tutorial'; action: 'start' | 'skip' | 'finish' };")
s=s.replace("t.metric === 'fleet' ? s.fleet.length", "t.metric === 'fleet' ? s.fleetPeak")
s=s.replace("check(!auto || manifest(s, p.id).every", "check(!auto || p.dispatcher, '请先在机库雇用随航调度员');\n  check(!auto || manifest(s, p.id).every")
s=s.replace("clock(now); this.state = saved === undefined ? migrateV1(new LegacyCore(now).snapshot()) : validateSave(saved);", "clock(now); this.state = saved === undefined ? migrateV1(new LegacyCore(now).snapshot()) : validateSave(saved);\n    if (saved === undefined) this.state.tutorial = 'available';")
s=s.replace('    switch (command.type) {', '''    switch (command.type) {
      case 'hire-dispatcher': {
        const p = planeAtGate(s, command.planeId);
        check(!p.dispatcher, '这架飞机已有调度员'); spend(s, DISPATCHER_PRICE); p.dispatcher = true;
        note(s, `${p.id} 随航调度员已入职`, -DISPATCHER_PRICE); break;
      }
      case 'dismiss-dispatcher': {
        const p = planeAtGate(s, command.planeId); check(p.dispatcher, '这架飞机没有调度员');
        p.dispatcher = false; note(s, `${p.id} 调度员已解聘，雇用费用不退还`); break;
      }
      case 'start-duty': {
        const p = planeAtGate(s, command.planeId); check(p.dispatcher, '请先在机库雇用随航调度员');
        legQuote(s, p, p.airportId, command.to);
        const id = routeId(p.airportId, command.to);
        check(s.routes.some(r => r.id === id), '请先开通这条航线');
        check(manifest(s, p.id).every(o => o.to === command.to), '自动值勤只运送直达订单，请先卸下中转订单');
        loadForDestination(s, p, command.to);
        if (manifest(s, p.id).length) depart(s, p, command.to, true);
        else { p.autoRouteId = id; p.readyAt = s.nextDemandAt; }
        note(s, `${p.id} 自动值勤已开始 · ${p.flight ? '装载起飞' : '等待真实客源'}`); break;
      }
      case 'sell-plane': {
        const p = planeAtGate(s, command.planeId);
        check(s.fleet.length > 1, '必须保留至少一架飞机');
        check(manifest(s, p.id).length === 0, '请先卸下全部客货，不能随飞机删除订单');
        const value = resaleValue(p); s.fleet = s.fleet.filter(item => item.id !== p.id); s.credits += value;
        note(s, `${p.id} 已出售，机位已释放${p.dispatcher ? '，随航调度员合同已结束' : ''}`, value); break;
      }
      case 'tutorial': {
        check(['start', 'skip', 'finish'].includes(command.action), '无效的引导操作');
        if (command.action === 'finish') check(s.claimedTasks.includes('first-flight'), '请先完成首航并领取奖励');
        s.tutorial = command.action === 'start' ? 'active' : command.action === 'skip' ? 'skipped' : 'completed';
        note(s, command.action === 'start' ? '起航引导已打开' : command.action === 'skip' ? '已跳过引导，可从帮助重新打开' : '起航引导已完成'); break;
      }''')
s=s.replace('upgrades: emptyUpgrades(), itinerary: [] });', 'upgrades: emptyUpgrades(), itinerary: [], dispatcher: false });\n        s.fleetPeak = Math.max(s.fleetPeak, s.fleet.length);')
s=s.replace('version: 3, fleet: old.fleet.map(p => ({ ...p, upgrades: emptyUpgrades(), itinerary: [] }))', "version: 4, fleetPeak: old.fleet.length, tutorial: 'skipped', fleet: old.fleet.map(p => ({ ...p, upgrades: emptyUpgrades(), itinerary: [], dispatcher: true }))")
s=s.replace('version: 3, hangarSlots:', "version: 4, fleetPeak: old.fleet.length, tutorial: 'skipped', hangarSlots:")
s=s.replace('fleet: old.fleet.map(p => ({ ...p, upgrades: emptyUpgrades(), itinerary: [] }))', 'fleet: old.fleet.map(p => ({ ...p, upgrades: emptyUpgrades(), itinerary: [], dispatcher: true }))')
pos=s.index('export function validateSave(value: unknown): GameState {')
s=s[:pos]+'''/** Preserve all old automatic permissions without charging or changing locked flights. */
export function migrateV3(value: unknown): GameState {
  const old = validateV3(value);
  return { ...old, version: 4, fleetPeak: old.fleet.length, tutorial: 'skipped',
    fleet: old.fleet.map(p => ({ ...p, dispatcher: true })) };
}
'''+s[pos:]
s=s.replace('if (version === 2) return validateSave(migrateV2(value));', 'if (version === 2) return validateSave(migrateV2(value));\n  if (version === 3) return validateSave(migrateV3(value));')
s=s.replace("'nextDemandAt','hangarSlots']);", "'nextDemandAt','hangarSlots','fleetPeak','tutorial']);")
s=s.replace('  // The frozen validator checks infrastructure', '''  number(s.fleetPeak, MAX_FLEET);
  if (s.fleetPeak < s.fleet.length || !['available','active','completed','skipped'].includes(s.tutorial) ||
    !Array.isArray(s.claimedTasks) || new Set(s.claimedTasks).size !== s.claimedTasks.length ||
    s.claimedTasks.some(id => !TASKS.some(t => t.id === id))) fail();
  if (s.tutorial === 'completed' && !s.claimedTasks.includes('first-flight')) fail();
  for (const id of s.claimedTasks) {
    const task = TASKS.find(t => t.id === id)!;
    if (task.metric === 'fleet' && s.fleetPeak < task.target) fail();
  }
  // The frozen validator checks infrastructure''')
s=s.replace('Real v3 aircraft', 'Real v4 aircraft')
s=s.replace('hangarSlots: _slots, ...rest', 'hangarSlots: _slots, fleetPeak: _peak, tutorial: _tutorial, ...rest')
s=s.replace('const projection: LegacyState = { ...rest, version: 1, fleet:', "const projection: LegacyState = { ...rest, version: 1,\n    claimedTasks: s.claimedTasks.filter(id => TASKS.find(t => t.id === id)!.metric !== 'fleet'), fleet:")
s=s.replace("'upgrades','itinerary']);", "'upgrades','itinerary','dispatcher']);\n    if (typeof p.dispatcher !== 'boolean') fail();")
s=s.replace('if (p.autoRouteId !== null) {\n      const r', 'if (p.autoRouteId !== null) {\n      if (!p.dispatcher) fail();\n      const r')
p.write_text(s)
for f in ['package.json','package-lock.json']:
    p=root/f; d=json.loads(p.read_text()); d['version']='0.4.0'
    if f=='package-lock.json': d['packages']['']['version']='0.4.0'
    p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
p=root/'src/core/catalog.ts';p.write_text(p.read_text().replace("description: '拥有 3 架飞机'", "description: '机队曾达到 3 架飞机'"))
for f in ['tests/orders.test.ts','tests/fleet-plans.test.ts','e2e/orders.spec.ts','e2e/fleet-plans.spec.ts']:
    p=root/f;s=p.read_text().replace('.version).toBe(3)', '.version).toBe(4)').replace('to v3','to v4').replace('exports v3','exports v4')
    p.write_text(s.replace('upgrades: _u,itinerary: _i,...p','upgrades: _u,itinerary: _i,dispatcher: _d,...p'))
p=root/'src/ui/Hangar.tsx';s=p.read_text().replace("import { useState }", "import { AircraftService } from './AircraftService.js';\nimport './management.css';\nimport { useState }")
p.write_text(s.replace('    {view.error &&','    <AircraftService key={p.id} game={game} plane={p} busy={busy}/>\n    {view.error &&'))
p=root/'src/ui/Panels.tsx';p.write_text(p.read_text().replace('v1/v2自动迁移为v3','v1/v2/v3自动迁移为v4').replace('v3不能由旧游戏读取','v4不能由旧游戏读取'))
p=root/'src/ui/App.tsx';s=p.read_text().replace("import { Hangar }", "import { Tutorial } from './Tutorial.js';\nimport './management.css';\nimport { Hangar }")
s=s.replace('<Network game={game}', '<Network key={plane?.id} game={game}')
s=s.replace('<div className="aviation-game">', '<div className={`aviation-game ${game?.tutorial === \'active\' && !modal ? \'training-active\' : \'\'}`}>')
s=s.replace('航空运输经营 · v0.3','航空运输经营 · v0.4')
s=s.replace('</header>\n      {!game', '''</header>
      {game && plane && game.tutorial === 'active' && !modal && <Tutorial game={game} plane={plane} screen={screen} destination={to} busy={view.busy} onLocate={target => { if (target === 'tasks') setModal('tasks'); else { setScreen(target); if (target === 'airport') setAboard(false); } }}/>}
      {!game''')
s=s.replace('<button onClick={() => setModal(\'tasks\')}>', '<button data-guide="tasks" onClick={() => setModal(\'tasks\')}>')
s=s.replace('<div className="dock-status"><strong>', '''<div className="dock-status">{game?.tutorial === 'available' && <button className="start-guide" disabled={view.busy} onClick={() => ignore(act({type:'tutorial',action:'start'}))}>开始起航引导</button>}<strong>''')
s=s.replace('<div className="help-content"><h3>', '''<div className="help-content"><button className="start-guide-help" disabled={view.busy} onClick={() => { ignore(act({type:'tutorial',action:'start'}).then(() => { setModal(null); setScreen('airport'); })); }}>开始分步引导</button><h3>''')
s=s.replace('自动往返仅运送直达订单；','自动往返需随航调度员，仅运送直达订单；')
s=s.replace('完整原版数值与美术仍需对照。','机库可雇用调度员或出售卸空的飞机，至少保留一架。完整原版数值与美术仍需对照。')
s=s.replace('<button className="gold-button" disabled={busy || game.credits < routePrice(from, destination)}','<button data-guide="open-route" className="gold-button" disabled={busy || game.credits < routePrice(from, destination)}')
s=s.replace('checked={auto} onChange=', 'checked={auto} disabled={!plane?.dispatcher} onChange=')
s=s.replace('/>自动往返</label>', '/>自动往返{!plane?.dispatcher && <small className="crew-note">需在机库雇用调度员</small>}</label>')
p.write_text(s)
# A fixed v3 fixture uses unchanged v2 flight data with the v3-only default fields.
f=json.loads((root/'tests/fixtures/v2-flying.json').read_text()); f['version']=3; f['hangarSlots']=max(4,((len(f['fleet'])+1)//2)*2)
for plane in f['fleet']:
    plane['upgrades']={'capacity':0,'engine':0,'range':0,'efficiency':0};plane['itinerary']=[]
    if plane['flight']:plane['autoRouteId']=plane['flight']['routeId']
(root/'tests/fixtures/v3-dispatching.json').write_text(json.dumps(f,ensure_ascii=False,indent=2)+'\n')
print('v0.4 edits materialized; full validation is required before merging')
