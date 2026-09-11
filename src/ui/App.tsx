import { useEffect, useRef, useState } from 'react';
import { AIRPORTS, airport, model, MODELS, routeId, routePrice, TASKS, upgradePrice } from '../core/catalog.js';
import { MAX_FLEET, quote, taskProgress, type Command, type GameState } from '../core/game.js';
import { controller, useGame } from '../runtime.js';
import { installUpdate } from '../pwa.js';
import { MapView } from './MapView.js';
const money = (n: number) => `¥ ${Math.round(n).toLocaleString('zh-CN')}`;
const duration = (n: number) => { const s=Math.max(0,Math.ceil(n)); return s>=60?`${Math.floor(s/60)}分${String(s%60).padStart(2,'0')}秒`:`${s}秒`; };
const ignore = (promise: Promise<unknown>) => { void promise.catch(()=>undefined); };
function Icon({name,className=''}:{name:string;className?:string}) {
  const paths:Record<string,string>={
    plane:'m21 3-5 12-6 1-4 5-2-2 3-5-5-3 1-2 7 1 8-7Z',
    map:'m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Zm6-3v15m6-12v15',
    fleet:'M4 18h16M7 14h10M12 3v10m-7-4 7-3 7 3m-11 5 4-2 4 2',
    shop:'M3 9h18l-2-6H5ZM5 9v12h14V9M9 21v-7h6v7',
    task:'M8 4H5v17h14V4h-3M8 2h8v5H8Zm0 11 2 2 5-5m-7 8h7',
    save:'M4 3h13l4 4v14H3V3Zm3 0v6h10V3M7 21v-8h10v8',
    close:'m6 6 12 12M6 18 18 6',
    arrow:'M4 12h16m-6-6 6 6-6 6',
    clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    lock:'M6 10h12v11H6Zm2 0V6a4 4 0 0 1 8 0v4',
    check:'m4 12 5 5L20 6',
    download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
    rotate:'M7 3h10v18H7ZM3 5 1 8l2 3M21 19l2-3-2-3'
  };
  return <svg className={`icon ${className}`} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]||paths.plane}/></svg>;
}
function PlaneArt({variant=0}:{variant?:number}) {
  return <svg className={`plane-art variant-${variant}`} viewBox="0 0 360 160" role="img" aria-label="原创虚构客货飞机示意">
    <ellipse cx="180" cy="133" rx="124" ry="8" fill="currentColor" opacity=".08"/>
    <path d="m83 87 76-53 33 2-37 48 93 1 35 11-37 11-91-2 36 29-28 3-78-36-31-1-25-10 7-6Z" fill="#fafcf6" stroke="#638e83" strokeWidth="1.8"/>
    <path d="m70 83-31-36 23 1 38 38-23 8Z" fill="#296e60"/>
    <path d="m48 98 183 5 38-7-31-5-150-3Z" fill="#7db69d" opacity=".7"/>
    <path d="m258 90 13 5-15 2-2-7Z" fill="#28574f"/>
    <path d="m167 63 25 0-5 13h-26Zm-1 51 25 1-3 11h-11Z" fill="#dde9dd" stroke="#638e83" strokeWidth="1.4"/>
    <path d="M115 91h104" stroke="#214d49" strokeWidth="3" strokeDasharray="3 8"/>
  </svg>;
}
function Settings({onClose}:{onClose:()=>void}) {
  const view=useGame(), dialog=useRef<HTMLDialogElement>(null), input=useRef<HTMLInputElement>(null);
  const [storageMessage,setStorageMessage]=useState('');
  useEffect(()=>{const d=dialog.current!;d.showModal();return()=>{if(d.open)d.close();};},[]);
  async function exportSave(){try{const raw=await controller.export();const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`china-airlines-${new Date().toISOString().slice(0,10)}.json`;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{/* Controller displays the error. */}}
  async function readFile(file:File|undefined){
    if(!file)return;
    if(file.size>1_000_000){useGame.setState({error:'存档文件过大（上限 1 MB）'});return;}
    if(!window.confirm('导入将替换当前进度，并保留上一份有效备份。确定继续？'))return;
    try{await controller.import(await file.text());}catch{/* Invalid files leave the game untouched. */}
  }
  return <dialog ref={dialog} className="settings-modal" onClose={onClose} aria-labelledby="settings-title">
    <div className="modal-heading"><div><span className="eyebrow">LOCAL SAVE</span><h2 id="settings-title">本地存档与设置</h2></div><button className="icon-button" aria-label="关闭存档设置" onClick={()=>dialog.current?.close()}><Icon name="close"/></button></div>
    <div className="save-summary"><Icon name="save"/><div><strong>{view.savedAt?'进度已保存在此浏览器':'尚无已确认的保存'}</strong><p>{view.savedAt?`最近保存 ${new Date(view.savedAt).toLocaleTimeString('zh-CN')}`:'读取失败时不会自动覆盖原有数据。'}</p></div></div>
    <p className="muted-text">关键经营操作后保存，每 10 秒自动保存。请定期导出：清理浏览器数据或使用隐私模式可能丢失进度。</p>
    <div className="settings-actions">
      <button className="primary" disabled={view.busy||!view.game} onClick={()=>ignore(controller.save())}>立即保存</button>
      <button disabled={view.busy||!view.game} onClick={()=>ignore(exportSave())}><Icon name="download"/>导出存档</button>
      <button disabled={view.busy} onClick={()=>input.current?.click()}>导入存档</button>
      <button disabled={view.busy} onClick={()=>{if(window.confirm('恢复上一份有效备份？当前进度将成为新的备份。'))ignore(controller.restoreBackup());}}>恢复上一份备份</button>
    </div>
    <input ref={input} type="file" accept=".json,application/json" aria-label="选择存档文件" className="file-input" onChange={e=>{ignore(readFile(e.target.files?.[0]));e.target.value='';}}/>
    <section className="setting-row"><div><strong>离线运行</strong><p>{view.offlineReady?'资源缓存已就绪，可在断网后重新打开。':'首次访问需要网络；资源缓存完成后才能离线启动。'}</p></div><span className={`badge ${view.offlineReady?'':'neutral'}`}>{view.offlineReady?'已就绪':'准备中'}</span></section>
    <section className="setting-row"><div><strong>离线经营</strong><p>自动往返离线最多结算 8 小时。时间回拨不发放收益；导入存档不补算文件时间。</p></div></section>
    <section className="setting-row"><div><strong>减少存储被回收的风险</strong><p>{storageMessage||'请求浏览器保留站点存储；这不能替代导出备份。'}</p></div><button onClick={()=>{if(!navigator.storage?.persist){setStorageMessage('此浏览器不支持持久存储申请。');return;}void navigator.storage.persist().then(ok=>setStorageMessage(ok?'浏览器已允许持久存储。':'浏览器暂未授予持久存储；请保留导出备份。')).catch(()=>setStorageMessage('申请失败，请保留导出备份。'));}}>申请保留</button></section>
    {view.updateAvailable&&<button className="primary full" disabled={view.busy||!view.game} onClick={()=>ignore(installUpdate())}>保存进度并更新应用</button>}
    {view.error&&<p role="alert" className="inline-error">{view.error}</p>}
    <div className="danger-zone"><p>虚构机型与游戏化数值。全部经营在本机完成，不使用账号、遥测或云存档。</p><button className="danger" disabled={view.busy} onClick={()=>{if(window.confirm('确定重新开始？当前有效进度会保留为上一份备份。'))ignore(controller.restart());}}>重新开始</button></div>
  </dialog>;
}
function AirportPanel({game,selected,onSelect,onShop,busy}:{game:GameState;selected:string;onSelect:(id:string)=>void;onShop:()=>void;busy:boolean}) {
  const [destination,setDestination]=useState('PVG'),[planeId,setPlaneId]=useState('AC0001'),[auto,setAuto]=useState(true);
  const a=airport(selected),owned=game.airports.find(x=>x.id===selected),destinations=game.airports.filter(x=>x.id!==selected);
  const to=destinations.some(x=>x.id===destination)?destination:(destinations[0]?.id??'');
  const available=game.fleet.filter(p=>p.airportId===selected&&!p.flight),plane=available.find(p=>p.id===planeId)??available[0];
  const opened=game.routes.some(r=>r.id===routeId(selected,to));
  let pricing:ReturnType<typeof quote>|null=null,error='';
  if(owned&&plane&&to){try{pricing=quote(game,plane,to);}catch(e){error=e instanceof Error?e.message:'无法安排航班';}}
  const act=(command:Command)=>ignore(controller.command(command));
  return <aside className="inspector" aria-label="机场与航班调度">
    <label className="field-label">机场导航<select aria-label="选择机场" value={selected} onChange={e=>onSelect(e.target.value)}>{AIRPORTS.map(x=><option key={x.id} value={x.id}>{x.city} · {x.id}{game.airports.some(a=>a.id===x.id)?'':' · 未解锁'}</option>)}</select></label>
    <div className="airport-hero"><div className="airport-code">{a.id}</div><div><span className="eyebrow">{a.region}</span><h2>{a.city}<small>机场</small></h2></div><span className={`badge ${owned?'':'neutral'}`}>{owned?`Lv.${owned.level}`:'未解锁'}</span></div>
    {!owned?<><p className="muted-text">将{a.city}加入你的航线网络，连接新的客货运输需求。</p><div className="airport-stats"><div><span>客货需求</span><strong>{Math.round(a.demand*100)}%</strong></div><div><span>开放等级</span><strong>1 级</strong></div></div><button className="primary full" disabled={busy||game.credits<a.price} onClick={()=>act({type:'unlock',airportId:a.id})}><Icon name="lock"/>解锁机场 · {money(a.price)}</button></>:
      <><div className="airport-stats"><div><span>本场停机</span><strong>{available.length}<small> 架</small></strong></div><div><span>连接航线</span><strong>{game.routes.filter(r=>r.from===selected||r.to===selected).length}<small> 条</small></strong></div></div>
        {owned.level<3?<button className="upgrade-button" disabled={busy||game.credits<upgradePrice(owned.level)} onClick={()=>act({type:'upgrade',airportId:selected})}>升级至 {owned.level+1} 级<span>{money(upgradePrice(owned.level))}</span></button>:<p className="level-max">机场已达最高等级 · 可接纳所有机型</p>}
        <div className="section-heading"><h3>航班调度</h3><span>DISPATCH</span></div>
        <label className="field-label">目的地<select aria-label="目的地" value={to} onChange={e=>setDestination(e.target.value)}>{destinations.map(x=><option key={x.id} value={x.id}>{airport(x.id).city} · {x.id}</option>)}</select></label>
        {plane?<><label className="field-label">派遣飞机<select aria-label="派遣飞机" value={plane.id} onChange={e=>setPlaneId(e.target.value)}>{available.map(p=><option value={p.id} key={p.id}>{p.id} · {model(p.modelId).name}</option>)}</select></label>
          {pricing&&<div className="quote-card"><div><span>{pricing.km.toLocaleString()} km</span><span><Icon name="clock"/>{duration(pricing.duration)}</span></div><p>预计装载 {pricing.passengers} 人 / {pricing.cargo} 吨</p><dl><div><dt>起飞成本</dt><dd>{money(pricing.cost)}</dd></div><div><dt>到达收入</dt><dd>{money(pricing.revenue)}</dd></div><div className="quote-profit"><dt>单程净收益</dt><dd>+ {money(pricing.profit)}</dd></div></dl></div>}
          {error&&<p className="inline-error">{error}</p>}
          <label className="checkbox-row"><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/>自动往返<span>到达后周转 8 秒</span></label>
          {!opened?<button className="primary full" disabled={busy||!pricing||game.credits<routePrice(selected,to)} onClick={()=>act({type:'route',from:selected,to})}>开通航线 · {money(routePrice(selected,to))}</button>:
            <button className="primary full" data-testid="dispatch" disabled={busy||!pricing||game.credits<(pricing?.cost??0)||plane.readyAt>game.simTime} onClick={()=>act({type:'dispatch',planeId:plane.id,to,auto})}><Icon name="plane"/>{plane.readyAt>game.simTime?`周转中 · ${duration(plane.readyAt-game.simTime)}`:'派遣航班'}</button>}
        </>:<div className="empty-local"><Icon name="plane"/><p>这里暂无可派遣飞机</p><small>等待在途航班到达，或在此交付新飞机。</small><button onClick={onShop}>前往飞机商店<Icon name="arrow"/></button></div>}
      </>}
    <p className="panel-footnote">航线双向开放。飞机必须从当前停靠机场出发，航程和机场等级需同时满足要求。</p>
  </aside>;
}
function Fleet({game,busy,onDispatch}:{game:GameState;busy:boolean;onDispatch:(id:string)=>void}) {
  return <section className="content-page"><div className="page-heading"><div><span className="eyebrow">YOUR FLEET</span><h2>机队管理</h2><p>每一架飞机，都有下一段旅程。</p></div><span className="count-pill">{game.fleet.length} / {MAX_FLEET} 架</span></div>
    <div className="fleet-grid">{game.fleet.map(p=>{const m=model(p.modelId),f=p.flight;return <article className="aircraft-card" key={p.id}><div className="card-top"><span className="serial">{p.id}</span><span className={`badge ${f?'':'neutral'}`}>{f?'飞行中':p.readyAt>game.simTime?'地面周转':'待命'}</span></div><PlaneArt variant={MODELS.findIndex(x=>x.id===m.id)}/><h3>{m.name}</h3><p className="muted-text">{m.role} · {m.range.toLocaleString()} km 航程</p><div className="fleet-location">{f?<><strong>{airport(f.from).city}</strong><Icon name="arrow"/><strong>{airport(f.to).city}</strong><span>{duration(f.arriveAt-game.simTime)}</span></>:<><Icon name="map"/><strong>{airport(p.airportId).city}机场</strong><span>{p.autoRouteId?'等待自动起飞':'等待调度'}</span></>}</div>
      {p.autoRouteId?<button className="full" disabled={busy} onClick={()=>ignore(controller.command({type:'stop',planeId:p.id}))}>停止自动往返</button>:<button className="full" disabled={Boolean(f)||busy} onClick={()=>onDispatch(p.airportId)}>{f?'到达后可再次调度':'安排航班'}<Icon name="arrow"/></button>}</article>;})}</div>
  </section>;
}
function Shop({game,busy,selected}:{game:GameState;busy:boolean;selected:string}) {
  const [delivery,setDelivery]=useState(selected);const to=game.airports.some(a=>a.id===delivery)?delivery:'PEK';
  return <section className="content-page"><div className="page-heading"><div><span className="eyebrow">AIRCRAFT COLLECTION</span><h2>下一架，为更远的航程。</h2><p>3 种原创虚构机型，逐步建立你的客货运输网络。</p></div></div>
    <label className="field-label delivery">交付机场<select aria-label="交付机场" value={to} onChange={e=>setDelivery(e.target.value)}>{game.airports.map(a=><option key={a.id} value={a.id}>{airport(a.id).city} · {a.level} 级</option>)}</select></label>
    <div className="shop-grid">{MODELS.map((m,index)=>{const level=game.airports.find(a=>a.id===to)!.level,enough=game.credits>=m.price;return <article className="aircraft-card shop-card" key={m.id}><div className="card-top"><span className="eyebrow">SERIES 0{index+1}</span><span className="badge neutral">{m.role}</span></div><PlaneArt variant={index}/><h3>{m.name}</h3><p className="aircraft-tagline">{['从第一条航线开始。','连接繁忙的城市群。','让航网跨越更远距离。'][index]}</p><dl className="spec-grid"><div><dt>载客</dt><dd>{m.seats}<small> 人</small></dd></div><div><dt>载货</dt><dd>{m.cargo}<small> 吨</small></dd></div><div><dt>航程</dt><dd>{m.range.toLocaleString()}<small> km</small></dd></div><div><dt>机场等级</dt><dd>{m.level}<small> 级</small></dd></div></dl><div className="price">{money(m.price)}<span>游戏币</span></div><button className="primary full" disabled={busy||!enough||level<m.level||game.fleet.length>=MAX_FLEET} onClick={()=>ignore(controller.command({type:'buy',modelId:m.id,airportId:to}))}>{level<m.level?`交付机场需升至 ${m.level} 级`:!enough?'运营资金不足':game.fleet.length>=MAX_FLEET?'机队已达上限':`购买${m.name}`}</button></article>;})}</div>
    <p className="muted-text">购机后飞机立即在交付机场待命。所有参数均为游戏平衡数值，不代表真实航空器性能。</p>
  </section>;
}
function Tasks({game,busy}:{game:GameState;busy:boolean}) {
  return <section className="content-page"><div className="page-heading"><div><span className="eyebrow">OPERATIONS</span><h2>每一步，都值得记录。</h2><p>完成运营目标，领取一次性发展奖励。</p></div></div>
    <div className="operations-grid"><div className="task-list">{TASKS.map(t=>{const n=taskProgress(game,t.id),claimed=game.claimedTasks.includes(t.id);return <article className="task-card" key={t.id}><div className={`task-icon ${claimed?'completed':''}`}><Icon name={claimed?'check':'task'}/></div><div className="task-body"><h3>{t.title}</h3><p>{t.description}</p><div className="progress-track"><i style={{width:`${Math.min(100,n/t.target*100)}%`}}/></div><small>{Math.min(n,t.target)} / {t.target}</small></div><div className="task-reward"><strong>+ {money(t.reward)}</strong><button disabled={busy||claimed||n<t.target} onClick={()=>ignore(controller.command({type:'claim',taskId:t.id}))}>{claimed?'已领取':n>=t.target?'领取奖励':'进行中'}</button></div></article>;})}</div>
      <aside className="ledger"><div className="section-heading"><h3>运营日志</h3><span>最近 60 条</span></div>{game.log.map((entry,i)=><div className="ledger-entry" key={`${entry.at}-${i}`}><span>{entry.text}</span>{entry.amount!==0&&<strong className={entry.amount>0?'positive':''}>{entry.amount>0?'+':'−'}{money(Math.abs(entry.amount))}</strong>}</div>)}</aside></div>
  </section>;
}
export function App() {
  const view=useGame(),[tab,setTab]=useState('map'),[selected,setSelected]=useState('PEK'),[settings,setSettings]=useState(false);
  useEffect(()=>{if(!view.notice)return;const id=window.setTimeout(()=>useGame.setState({notice:null}),5500);return()=>window.clearTimeout(id);},[view.notice]);
  const game=view.game,flights=game?.fleet.filter(p=>p.flight)??[];
  const tabs=[['map','map','航线地图'],['fleet','fleet','机队管理'],['shop','shop','飞机商店'],['tasks','task','运营任务']];
  return <>
    <div className="app-shell">
      <header className="topbar"><div className="brand"><div className="brand-mark"><Icon name="plane"/></div><div><h1>中华航空</h1><span>AIRLINE MANAGER</span></div><span className="edition">单机经营</span></div>
        <div className="hud"><div className="hud-funds"><span>运营资金 · 游戏币</span><strong data-testid="credits">{money(game?.credits??0)}</strong></div><div><span>机队规模</span><strong data-testid="fleet-count">{game?.fleet.length??0}<small> 架</small></strong></div><div><span>累计运输</span><strong data-testid="flights-count">{game?.stats.flights??0}<small> 班</small></strong></div></div>
        <button className="save-button" aria-label="存档设置" onClick={()=>setSettings(true)}><Icon name="save"/><span>{view.error?'保存需注意':view.busy?'保存中…':'本地存档'}</span><i className={`status-dot ${view.error?'warning':''}`}/></button>
      </header>
      <div className="body-layout"><nav className="sidebar" aria-label="主导航"><div className="nav-items">{tabs.map(([id,icon,label])=><button key={id} className={tab===id?'active':''} aria-current={tab===id?'page':undefined} onClick={()=>setTab(id!)}><Icon name={icon!}/><span>{label}</span></button>)}</div><div className="sidebar-bottom"><span className="local-indicator"/><span>{view.online?'本地单机':'离线运行'}</span><small>v0.1.0</small></div></nav>
        <main className="main-content">
          {!game?<div className="startup"><div className="brand-mark"><Icon name="plane"/></div><h2>{view.booting?'正在准备起航…':'进度尚未载入'}</h2><p>{view.error??'正在检查本地存档与经营数据。'}</p>{!view.booting&&<div><button className="primary" onClick={()=>setSettings(true)}>导入或恢复存档</button><button onClick={()=>location.reload()}>重新载入</button></div>}</div>:
            <><div className="workspace">{tab==='map'?<><MapView game={game} selected={selected} onSelect={setSelected}/><AirportPanel game={game} selected={selected} onSelect={setSelected} onShop={()=>setTab('shop')} busy={view.busy}/></>:tab==='fleet'?<Fleet game={game} busy={view.busy} onDispatch={id=>{setSelected(id);setTab('map');}}/>:tab==='shop'?<Shop game={game} busy={view.busy} selected={selected}/>:<Tasks game={game} busy={view.busy}/>}</div>
              <section className="flight-board" aria-label="在途航班"><div className="board-title"><span className="eyebrow">LIVE FLIGHTS</span><h3>在途航班 <span>{flights.length.toString().padStart(2,'0')}</span></h3><small>按游戏时间结算</small></div>
                {flights.length?<div className="flight-cards">{flights.map(p=>{const f=p.flight!;return <article className="flight-mini" key={p.id}><div><span className="serial">{p.id}</span><span>{p.autoRouteId?'自动往返':'单程航班'}</span></div><div className="flight-cities"><strong>{airport(f.from).city}</strong><Icon name="plane"/><strong>{airport(f.to).city}</strong></div><div className="progress-track"><i style={{width:`${Math.max(0,Math.min(100,(game.simTime-f.departAt)/(f.arriveAt-f.departAt)*100))}%`}}/></div><small>预计 {duration(f.arriveAt-game.simTime)} 后抵达</small></article>;})}</div>:<div className="board-empty"><Icon name="plane"/><div><strong>{game.stats.flights?'机队正在等待下一次调度':'你的第一条航线，即将起飞。'}</strong><p>{game.stats.flights?'选择停靠机场，为飞机安排下一段旅程。':'从北京出发，开通前往上海的航线。'}</p></div><button onClick={()=>{setSelected(game.fleet.find(p=>!p.flight)?.airportId??'PEK');setTab('map');}}>安排航班<Icon name="arrow"/></button></div>}
              </section></>}
        </main>
      </div>
      <footer className="statusbar"><span>{view.offlineReady?'离线资源已就绪':'离线资源准备中'}<i/>自动保存间隔 10 秒</span><span>横屏单机 · 原创示意航网 · 虚构经营数值</span></footer>
    </div>
    {view.notice&&!settings&&<div className="toast" role="status"><Icon name="check"/><span>{view.notice}</span><button className="icon-button" aria-label="关闭提示" onClick={()=>useGame.setState({notice:null})}><Icon name="close"/></button></div>}
    {view.error&&game&&!settings&&!view.blocked&&<div className="error-toast" role="alert"><span>{view.error}</span><button onClick={()=>setSettings(true)}>查看存档</button><button className="icon-button" aria-label="关闭错误提示" onClick={()=>useGame.setState({error:null})}><Icon name="close"/></button></div>}
    {view.report&&!settings&&<div className="return-report" role="status"><span className="eyebrow">WELCOME BACK</span><h3>{view.report.clockBack?'系统时间发生回拨':'欢迎回到你的航线网络'}</h3><p>{view.report.clockBack?'本次不结算时间收益，已重新对齐系统时间。':`补算 ${duration(view.report.elapsed)}，完成 ${view.report.flights} 班，运营净收入 ${money(view.report.profit)}。`}</p>{view.report.capped&&<small>离线补算上限为 8 小时，超出部分已丢弃。</small>}<button className="primary" onClick={()=>useGame.setState({report:null})}>继续经营</button></div>}
    {view.updateAvailable&&!settings&&<button className="update-notice" onClick={()=>setSettings(true)}>新版本已就绪 · 保存后更新</button>}
    {settings&&<Settings onClose={()=>setSettings(false)}/>}
    {view.blocked&&<div className="blocking-screen" role="alert"><Icon name="lock"/><h2>此存档正在另一个窗口中使用</h2><p>为避免进度互相覆盖，此窗口已停止写入。</p><button className="primary" onClick={()=>location.reload()}>重新载入最新进度</button></div>}
    <div className="rotate-screen"><Icon name="rotate"/><h2>请旋转设备，横屏起航。</h2><p>更宽的视野，留给更远的航线。</p><span>中华航空 · 单机经营</span></div>
  </>;
}
