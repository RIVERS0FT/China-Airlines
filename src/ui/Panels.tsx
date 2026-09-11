import { useEffect, useRef, useState } from 'react';
import { airport, MODELS, TASKS } from '../core/catalog.js';
import { MAX_FLEET, taskProgress, type GameState } from '../core/game.js';
import { controller, useGame } from '../runtime.js';
import { installUpdate } from '../pwa.js';
export const money = (n: number) => `¥ ${Math.round(n).toLocaleString('zh-CN')}`;
export const duration = (n: number) => { const s=Math.max(0,Math.ceil(n)); return s>=60?`${Math.floor(s/60)}分${String(s%60).padStart(2,'0')}秒`:`${s}秒`; };
export const ignore = (promise: Promise<unknown>) => { void promise.catch(()=>undefined); };
export function Icon({name}:{name:string}) {
  const paths:Record<string,string>={plane:'m21 3-5 12-6 1-4 5-2-2 3-5-5-3 1-2 7 1 8-7Z',map:'m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Zm6-3v15m6-12v15',fleet:'M4 18h16M7 14h10M12 3v10m-7-4 7-3 7 3m-11 5 4-2 4 2',shop:'M3 9h18l-2-6H5ZM5 9v12h14V9M9 21v-7h6v7',task:'M8 4H5v17h14V4h-3M8 2h8v5H8Zm0 11 2 2 5-5m-7 8h7',save:'M4 3h13l4 4v14H3V3Zm3 0v6h10V3M7 21v-8h10v8',check:'m4 12 5 5L20 6',rotate:'M7 3h10v18H7ZM3 5 1 8l2 3M21 19l2-3-2-3'};
  return <svg className="icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]||paths.plane}/></svg>;
}
export function Settings({onClose}:{onClose:()=>void}) {
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
    <div className="modal-heading"><h2 id="settings-title">本地存档与设置</h2><button aria-label="关闭存档设置" onClick={()=>dialog.current?.close()}>×</button></div>
    <div className="save-summary"><Icon name="save"/><div><strong>{view.savedAt?'进度已保存在此浏览器':'尚无已确认的保存'}</strong><p>{view.savedAt?`最近保存 ${new Date(view.savedAt).toLocaleTimeString('zh-CN')}`:'读取失败时不会自动覆盖原有数据。'}</p></div></div>
    <p className="muted-text">关键经营操作后保存，每10秒自动保存。清理浏览器数据或使用隐私模式可能丢失进度，请定期导出。</p>
    <div className="settings-actions"><button className="primary" disabled={view.busy||!view.game} onClick={()=>ignore(controller.save())}>立即保存</button><button disabled={view.busy||!view.game} onClick={()=>ignore(exportSave())}>导出存档</button><button disabled={view.busy} onClick={()=>input.current?.click()}>导入存档</button><button disabled={view.busy} onClick={()=>{if(window.confirm('恢复上一份有效备份？当前进度将成为新的备份。'))ignore(controller.restoreBackup());}}>恢复上一份备份</button></div>
    <input ref={input} type="file" accept=".json,application/json" aria-label="选择存档文件" className="file-input" onChange={e=>{ignore(readFile(e.target.files?.[0]));e.target.value='';}}/>
    <section className="setting-row"><div><strong>离线运行</strong><p>{view.offlineReady?'资源缓存已就绪，可在断网后重新打开。':'首次访问需要网络；缓存完成后才能离线启动。'}</p></div></section>
    <section className="setting-row"><div><strong>离线经营与旧存档</strong><p>最多补算8小时。导入不补算文件时间；v1自动迁移为v2，保留在途收入。v2不能由旧游戏读取。</p></div></section>
    <section className="setting-row"><div><strong>保留本地存储</strong><p>{storageMessage||'申请不能替代导出备份。'}</p></div><button onClick={()=>{if(!navigator.storage?.persist){setStorageMessage('此浏览器不支持持久存储申请。');return;}void navigator.storage.persist().then(ok=>setStorageMessage(ok?'浏览器已允许持久存储。':'浏览器暂未授予持久存储，请保留导出备份。')).catch(()=>setStorageMessage('申请失败，请保留导出备份。'));}}>申请保留</button></section>
    {view.updateAvailable&&<button className="primary full" disabled={view.busy||!view.game} onClick={()=>ignore(installUpdate())}>保存进度并更新应用</button>}
    {view.error&&<p role="alert" className="inline-error">{view.error}</p>}
    <div className="danger-zone"><p>虚构机型和经营参数，无账号、遥测或云存档。</p><button className="danger" disabled={view.busy} onClick={()=>{if(window.confirm('确定重新开始？当前有效进度会保留为上一份备份。'))ignore(controller.restart());}}>重新开始</button></div>
  </dialog>;
}
function PlaneArt({variant}:{variant:number}) {
  return <svg className="plane-art" viewBox="0 0 360 160" role="img" aria-label="原创虚构飞机"><ellipse cx="180" cy="135" rx="132" ry="7" fill="#42607b" opacity=".1"/><g stroke="#4c7287" strokeWidth="2"><path d="m48 104 36-34h175l28-44h19l-1 49 25 25-47 20H88Z" fill="#fffbed"/><path d="m260 74 27-48h19l-1 49Z" fill={['#318dc0','#55a58f','#de934b'][variant]}/><path d="m145 103 56 29h50l-52-30" fill="#cddddd"/><path d="m49 104 280-4-46 20H88Z" fill="#7dbdd4" stroke="none"/><path d="m150 103 62 32h42l-49-32" fill="#d9e3e0"/><path d="m69 88 17-12h18v14Z" fill="#40657c"/></g><path d="M126 86h112" stroke="#346280" strokeWidth="5" strokeDasharray="5 9"/></svg>;
}
export function Shop({game,busy,selected}:{game:GameState;busy:boolean;selected:string}) {
  const [delivery,setDelivery]=useState(selected);const to=game.airports.some(a=>a.id===delivery)?delivery:'PEK';
  return <section className="content-page"><div className="page-heading"><div><h2>下一架，为更远的航程。</h2><p>3种原创虚构机型，逐步建立你的客货运输网络。</p></div></div><label className="field-label delivery">交付机场<select aria-label="交付机场" value={to} onChange={e=>setDelivery(e.target.value)}>{game.airports.map(a=><option key={a.id} value={a.id}>{airport(a.id).city} · {a.level}级</option>)}</select></label>
    <div className="shop-grid">{MODELS.map((m,index)=>{const level=game.airports.find(a=>a.id===to)!.level,enough=game.credits>=m.price;return <article className="aircraft-card shop-card" key={m.id}><div className="card-top"><span className="eyebrow">SERIES 0{index+1}</span><span className="badge neutral">{m.role}</span></div><PlaneArt variant={index}/><h3>{m.name}</h3><dl className="spec-grid"><div><dt>载客</dt><dd>{m.seats}<small>人</small></dd></div><div><dt>载货</dt><dd>{m.cargo}<small>吨</small></dd></div><div><dt>航程</dt><dd>{m.range}<small>km</small></dd></div><div><dt>机场等级</dt><dd>{m.level}<small>级</small></dd></div></dl><div className="price">{money(m.price)}</div><button className="primary full" disabled={busy||!enough||level<m.level||game.fleet.length>=MAX_FLEET} onClick={()=>ignore(controller.command({type:'buy',modelId:m.id,airportId:to}))}>{level<m.level?`交付机场需升至 ${m.level} 级`:!enough?'运营资金不足':game.fleet.length>=MAX_FLEET?'机队已达上限':`购买${m.name}`}</button></article>;})}</div><p className="muted-text">购机后飞机立即在交付机场待命。所有参数均为游戏数值。</p></section>;
}
export function Tasks({game,busy}:{game:GameState;busy:boolean}) {
  return <section className="content-page"><div className="operations-grid"><div className="task-list">{TASKS.map(t=>{const n=taskProgress(game,t.id),claimed=game.claimedTasks.includes(t.id);return <article className="task-card" key={t.id}><div className="task-icon"><Icon name="task"/></div><div className="task-body"><h3>{t.title}</h3><p>{t.description}</p><div className="progress-track"><i style={{width:`${Math.min(100,n/t.target*100)}%`}}/></div><small>{Math.min(n,t.target)} / {t.target}</small></div><div className="task-reward"><strong>+ {money(t.reward)}</strong><button disabled={busy||claimed||n<t.target} onClick={()=>ignore(controller.command({type:'claim',taskId:t.id}))}>{claimed?'已领取':n>=t.target?'领取奖励':'进行中'}</button></div></article>;})}</div><aside className="ledger"><h3>运营日志 · 最近60条</h3>{game.log.map((entry,i)=><div className="ledger-entry" key={`${entry.at}-${i}`}><span>{entry.text}</span>{entry.amount!==0&&<strong>{entry.amount>0?'+':'−'}{money(Math.abs(entry.amount))}</strong>}</div>)}</aside></div></section>;
}
