from pathlib import Path
p=Path('.')
import hashlib
expected = {'src/ui/App.tsx': 'e92c7e992b3694f84b140013388f4a65dfe806b5', 'src/ui/AviationScene.tsx': 'c4403b870811a71f4a2a5bb54ee5517f577241af', 'src/ui/Panels.tsx': '53b746cd37bd299e23d0c95ce963756cebbe26fa', 'src/core/legacy.ts': '9ab6c6dd20e76733e3eff93e3d2c0d18c7267592', 'package.json': '72f1d9b4c96ede5219a1df021d8b330d357cc22b', 'package-lock.json': '538c69151ff32327cca14c356a9de73a07bb5793', 'e2e/orders.spec.ts': '7799b75cfd758ce2d73a5ad3c089d3607568f1cd', 'tests/orders.test.ts': '9d80781a706ce63f5ae67ec9120d5b942f951e6d', 'docs/PLAYING.md': '493038dd8ba6a951e89354fed0f91886129fba66', 'docs/DELIVERY.md': '0dc9740bdf3af4cf06c4a6f4076b7b5675cea185'}
for name, expected_sha in expected.items():
 data=(p/name).read_bytes()
 actual=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
 if actual != expected_sha: raise RuntimeError('Unexpected source; refusing to overwrite: '+name)

f=p/'src/ui/Panels.tsx'; s=f.read_text().replace("airport, MODELS, TASKS", "airport, MODELS, TASKS, AIRCRAFT_KIND_LABEL, type AircraftKind")
s=s.replace('function PlaneArt({variant}:{variant:number})', 'export function PlaneArt({variant,cargo=false}:{variant:number;cargo?:boolean})')
s=s.replace("['#318dc0','#55a58f','#de934b'][variant]", "['#318dc0','#55a58f','#de934b'][variant % 3]")
s=s.replace('<path d="M126 86h112" stroke="#346280" strokeWidth="5" strokeDasharray="5 9"/>', '{cargo ? <rect x="132" y="80" width="75" height="21" rx="3" fill="#dbc393" stroke="#826d4d" strokeWidth="2"/> : <path d="M126 86h112" stroke="#346280" strokeWidth="5" strokeDasharray="5 9"/>}')
a=s.index('export function Shop'); b=s.index('export function Tasks',a)
s=s[:a]+'''export function Shop({game,busy,selected}:{game:GameState;busy:boolean;selected:string}) {
  const [delivery,setDelivery]=useState(selected), [kind,setKind]=useState<AircraftKind | 'all'>('mixed');
  const to=game.airports.some(a=>a.id===delivery)?delivery:'PEK', view=useGame();
  return <section className="content-page fleet-shop"><div className="shop-toolbar"><div className="shop-categories" role="group" aria-label="机型分类">{(['mixed','passengers','cargo','all'] as const).map(k=><button key={k} aria-pressed={kind===k} onClick={()=>setKind(k)}>{k==='all'?'全部机型':AIRCRAFT_KIND_LABEL[k]}</button>)}</div><label className="field-label delivery">交付机场<select aria-label="交付机场" value={to} onChange={e=>setDelivery(e.target.value)}>{game.airports.map(a=><option key={a.id} value={a.id}>{airport(a.id).city} · {a.level}级</option>)}</select></label><span>机位 {game.fleet.length} / {game.hangarSlots}</span></div>
    <div className="shop-grid">{MODELS.filter(m=>kind==='all'||m.kind===kind).map(m=>{const level=game.airports.find(a=>a.id===to)!.level,enough=game.credits>=m.price,full=game.fleet.length>=game.hangarSlots;return <article className="aircraft-card shop-card" key={m.id} data-testid="shop-aircraft"><div className="card-top"><span className="eyebrow">{m.family.toUpperCase()}</span><span className={`type-ribbon ${m.kind}`}>{m.role}</span></div><PlaneArt variant={m.family==='lark'?0:m.family==='swallow'?1:2} cargo={m.kind==='cargo'}/><h3>{m.name}</h3><dl className="spec-grid"><div><dt>载客</dt><dd>{m.seats}<small>人</small></dd></div><div><dt>载货</dt><dd>{m.cargo}<small>吨</small></dd></div><div><dt>航程</dt><dd>{m.range}<small>km</small></dd></div><div><dt>机场等级</dt><dd>{m.level}<small>级</small></dd></div></dl><div className="price">{money(m.price)}</div><button className="primary full" disabled={busy||!enough||level<m.level||full} onClick={()=>ignore(controller.command({type:'buy',modelId:m.id,airportId:to}))}>{level<m.level?`交付机场需升至 ${m.level} 级`:full?'请先扩建机库':!enough?'运营资金不足':`购买${m.name}`}</button></article>;})}</div>
    {view.error && <p role="alert" className="workshop-feedback">{view.error}</p>}{view.notice && <p role="status" className="workshop-feedback">{view.notice}</p>}
    <p className="muted-text">3个系列，9种机型。纯客机只能装旅客，纯货机只能装货物，客货机分别使用两类容量。数值为本作配置。</p></section>;
}
''' + s[b:]; f.write_text(s)
f=p/'src/ui/App.tsx'; s=f.read_text().replace('AIRPORTS, airport, model,', 'AIRPORTS, airport, aircraftSpecs,')
s=s.replace("import { AviationScene }", "import { Hangar } from './Hangar.js';\nimport { PlanControls } from './PlanControls.js';\nimport './workshop.css';\nimport { AviationScene }")
s=s.replace("  const [auto, setAuto] = useState(false);", "  const [planMode, setPlanMode] = useState(false), [stops, setStops] = useState<string[]>([]);\n  const [auto, setAuto] = useState(false);")
s=s.replace('const inFlight = Boolean(plane?.flight), cooling = plane && game.simTime < plane.readyAt;', 'const inFlight = Boolean(plane?.flight), cooling = plane && (game.simTime < plane.readyAt || plane.itinerary.length > 0);')
s=s.replace('<div className="network-map"><MapView', '<div className="network-mode"><button aria-pressed={!planMode} onClick={() => setPlanMode(false)}>单段派航</button><button aria-pressed={planMode} onClick={() => { setPlanMode(true); setAuto(false); }}>多段计划</button></div>\n    <div className="network-map"><MapView')
s=s.replace('<div className="network-controls"><label>', '<div className="network-controls"><label>')
s=s.replace("{from !== destination && !opened ?", "{!planMode && (from !== destination && !opened ?")
s=s.replace('</button></>}\n      </>}', '</button></>)}\n      </>}')
s=s.replace('    </div>\n  </section>;\n}\nexport function App()', '    </div>\n    {planMode && plane && <PlanControls game={game} plane={plane} stops={stops} setStops={setStops} candidate={destination} busy={busy} onDepart={onDepart}/>}\n  </section>;\n}\nexport function App()')
s=s.replace('m = plane ? model(plane.modelId) : null;', 'm = plane ? aircraftSpecs(plane) : null;')
s=s.replace('航空运输经营 · v0.2', '航空运输经营 · v0.3')
s=s.replace('Boolean(plane.autoRouteId) || plane.readyAt', 'Boolean(plane.autoRouteId) || Boolean(plane.itinerary.length) || plane.readyAt')
s=s.replace("{plane?.autoRouteId &&", "{plane && plane.itinerary.length > 0 && <button className=\"plan-cancel\" disabled={view.busy} onClick={() => ignore(act({ type: 'cancel-plan', planeId: plane.id }))}>取消剩余计划</button>}\n            {plane?.autoRouteId &&")
s=s.replace('<div className="scene-wrap"><AviationScene', '<div className="scene-wrap">{plane && plane.itinerary.length > 0 && <div className="itinerary-banner" data-testid="active-plan">后续航段：{plane.itinerary.map(id => airport(id).city).join(" → ")}</div>}<AviationScene')
a=s.index("modal === 'fleet' ? <div className=\"hangar-list\""); b=s.index(' : <div className="help-content">',a)
s=s[:a]+"modal === 'fleet' ? <Hangar game={game} busy={view.busy} onSelect={selectPlane}/>"+s[b:]
s=s.replace('本轮是复刻方向的第一阶段。完整机型分类、改装养成、多段计划及原版数值对照尚未完成。', '机库支持扩建与四类改装；商店分纯客、纯货和客货机。多段计划最多5段，逐站交付，不在途中自动接新订单。完整原版数值与美术仍需对照。')
f.write_text(s)
f=p/'src/ui/AviationScene.tsx'; s=f.read_text().replace('airport, model', 'airport, aircraftSpecs').replace('model(plane.modelId)', 'aircraftSpecs(plane)').replace('const occupied = m ?', 'const occupied = m && m.seats > 0 ?')
s=s.replace("plane.modelId === 'horizon'", "m!.kind === 'cargo' ? true : m!.family === 'horizon'")
s=s.replace('{Array.from({ length: 14 },', '{m!.seats > 0 && Array.from({ length: 14 },')
s=s.replace('<rect x="260" y="210" width="138" height="25" rx="3" fill="#eee7cb"/>', '{m!.kind === \'cargo\' && <g><rect x="290" y="148" width="340" height="41" rx="3" fill="#debb83"/>{Array.from({length:8},(_,i)=><rect key={i} x={301+i*40} y="151" width="33" height="35" fill={i < Math.ceil(total.cargo / m!.cargo * 8) ? "#b68548" : "#e6d7b5"} strokeWidth="1.5"/>)}</g>}\n          {m!.cargo > 0 && <rect x="260" y="210" width="138" height="25" rx="3" fill="#eee7cb"/>}')
s=s.replace('{Array.from({ length: 4 },', '{m!.cargo > 0 && Array.from({ length: 4 },')
f.write_text(s)
# Version metadata is now consistent with the functionality release (lock deps unchanged).
import json
for name in ['package.json','package-lock.json']:
 f=p/name; data=json.loads(f.read_text()); data['version']='0.3.0'
 if 'packages' in data: data['packages']['']['version']='0.3.0'
 f.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
# Only the expected resulting version / added metadata changes in old migration tests.
f=p/'e2e/orders.spec.ts'; f.write_text(f.read_text().replace('upgrades to v2','upgrades to v3').replace('save.version).toBe(2)','save.version).toBe(3)'))
f=p/'tests/orders.test.ts'; s=f.read_text().replace('s.version).toBe(2)','s.version).toBe(3)').replace('expect(s.fleet).toEqual(legacy.fleet);', 'expect(s.fleet.map(({upgrades: _u,itinerary: _i,...p})=>p)).toEqual(legacy.fleet);'); f.write_text(s)

f=p/'src/ui/AviationScene.tsx'; f.write_text(f.read_text().replace("m!.kind === 'cargo' ? true : m!.family === 'horizon'", "(m!.kind === 'cargo' || m!.family === 'horizon')"))
f=p/'src/core/legacy.ts';f.write_text(f.read_text().replace("from './catalog.js'", "from './legacy-catalog.js'"))
f=p/'src/ui/App.tsx';s=f.read_text()
s=s.replace('function OrderCard({ order, aboard, disabled, onClick }: { order: Order; aboard: boolean; disabled: boolean; onClick: () => void })', 'function OrderCard({ order, aboard, disabled, reason, onClick }: { order: Order; aboard: boolean; disabled: boolean; reason?: string; onClick: () => void })')
s=s.replace("{aboard ? '已装载 · 点击卸下'", "{reason ? reason : aboard ? '已装载 · 点击卸下'")
s=s.replace("  const shown = list.filter(o => filter === 'all' || o.kind === filter);", """  const capacity = plane ? aircraftSpecs(plane) : null, total = plane ? loadSummary(game, plane.id) : {passengers:0,cargo:0};
  function reason(o: Order) {
    if (aboard || !capacity) return undefined;
    if (o.kind === 'passengers' && capacity.seats === 0) return '纯货机不载客';
    if (o.kind === 'cargo' && capacity.cargo === 0) return '纯客机不载货';
    if (o.kind === 'passengers' ? total.passengers + o.amount > capacity.seats : total.cargo + o.amount > capacity.cargo) return '剩余容量不足';
    return undefined;
  }
  const shown = list.filter(o => filter === 'all' || o.kind === filter);""")
s=s.replace('aboard={aboard} disabled={locked}', 'aboard={aboard} reason={reason(o)} disabled={locked || Boolean(reason(o))}')
f.write_text(s)
f=p/'docs/PLAYING.md';f.write_text(f.read_text()+'\n\n## v0.3 机型、机库与多段计划\n\n在飞机商店使用“纯客机”“纯货机”“客货两用”切换类别。纯货机不能载客，纯客机没有可操作货舱；同目的地装载会跳过类型不兼容或放不下的订单。交付地点必须满足机型机场等级。飞机越多不代表能继续购买：机库初始4位，进入“机队管理”可以付费扩建，每次2位，最高16位。\n\n机库中选择飞机可进行舱位、发动机、航程和节能改装，每项最多3级。界面给出当前值、下一等级和费用；飞行中、周转中或自动运输时不可改装。扩舱不会把纯货机变成客机。\n\n先在机场装好不同目的地的客货，再打开地图选择“多段计划”。点选机场并按“添加…航段”，最多5段；可撤销末段或清空。全部段都须在航程和机场等级范围内。缺少航线时先点“开通计划航线”，建设费与运营费分开。\n\n“执行运输计划”先起飞第一段。飞机到站只交付目的地匹配的订单，周转8秒后继续下一段，不在途中自动接新订单。每次起飞才扣该段成本，未预留整趟费用；钱不够会在地面停下并保留未交付客货。\n\n飞行画面显示后续目的地，“取消剩余计划”只取消尚未起飞的段，不会把在途飞机瞬移回机场或退回已消耗的运营费。计划中没有覆盖的订单会继续留在机上。再次经过同一目的地不会重复领取已经交付的报酬。\n\n旧存档会自动迁移，保留原航班进度和收入，新增改装均从0级开始。新格式无法在旧程序内使用，更新前建议导出备份。\n')
f=p/'docs/DELIVERY.md';f.write_text(f.read_text()+'\n\n## v0.3 验收增量\n\n增加fleet-plans单元与浏览器测试：9种机型容量和不兼容装载、改装上限/费用/真实参数、机库扩建、多段逐站交付、重复节点不重复收益、途中取消、资金不足地面停止、v2固定样本及v1迁移、升级航班校验、分步与8小时离线一致性。根/子路径都测试新功能和旧存档/离线/并发回归。交付包名称标注0.3.0，包版本与功能版本一致；存档version为3，数据库结构仍为1。\n')

expected_after = {'src/ui/App.tsx': '3959be28b1f4ef8587675c48562c9abfe0acba6b', 'src/ui/AviationScene.tsx': '2d9400b94012e0bf033ef7878ea765c1d0dce5e1', 'src/ui/Panels.tsx': 'e4504413f2d822682511948a03481e36a5172f1b', 'src/core/legacy.ts': 'dd67caceea3e327d91331da0bcd761ec3014207b', 'package.json': '80bfebb39c03b25cfe65607ed065e6f4946fee2a', 'package-lock.json': '127264c9463fbd2d999a92a487a950f7c5ff4301', 'e2e/orders.spec.ts': 'd3ce7699865069ba5fb42acf2eb5e92edcea0524', 'tests/orders.test.ts': '0a1c1695c3e257417fecdac1f8e3dc00a6d9e258', 'docs/PLAYING.md': 'a04ee8b505e6aeb771f88559c151badc72abb26d', 'docs/DELIVERY.md': '344f99e8f79ccfd940bf24d0ea6cc78abc9c04a4'}
for name, expected_sha in expected_after.items():
 data=(p/name).read_bytes()
 actual=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
 if actual != expected_sha: raise RuntimeError('Assembly mismatch: '+name)
print('Exact source edits verified; dependency resolutions unchanged.')
