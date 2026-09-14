import { DisplaySettings } from './DisplaySettings.js';
import { careerLevel } from '../core/career.js';
import { useEffect, useRef, useState } from 'react';
import { airport, MODELS, AIRCRAFT_KIND_LABEL, type AircraftKind } from '../core/catalog.js';
import { type GameState } from '../core/game.js';
import { controller, useGame } from '../runtime.js';
import { installUpdate } from '../pwa.js';
import { artAsset, BUTTON_ART } from './art-assets.js';
import { formatDuration, formatMoney, LanguagePicker, useI18n } from '../i18n/I18n.js';
export const money = formatMoney;
export const duration = formatDuration;
export const ignore = (promise: Promise<unknown>) => { void promise.catch(()=>undefined); };
export function Icon({name}:{name:string}) {
  const asset = BUTTON_ART[name];
  if (asset) return <img className="icon painted-icon" width="22" height="22" src={artAsset(asset)} alt="" aria-hidden="true" draggable={false}/>;
  const paths:Record<string,string>={plane:'m21 3-5 12-6 1-4 5-2-2 3-5-5-3 1-2 7 1 8-7Z',map:'m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Zm6-3v15m6-12v15',fleet:'M4 18h16M7 14h10M12 3v10m-7-4 7-3 7 3m-11 5 4-2 4 2',shop:'M3 9h18l-2-6H5ZM5 9v12h14V9M9 21v-7h6v7',task:'M8 4H5v17h14V4h-3M8 2h8v5H8Zm0 11 2 2 5-5m-7 8h7',save:'M4 3h13l4 4v14H3V3Zm3 0v6h10V3M7 21v-8h10v8',check:'m4 12 5 5L20 6',rotate:'M7 3h10v18H7ZM3 5 1 8l2 3M21 19l2-3-2-3'};
  return <svg className="icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]||paths.plane}/></svg>;
}
export function Settings({onClose}:{onClose:()=>void}) {
  const view=useGame(), dialog=useRef<HTMLDialogElement>(null), input=useRef<HTMLInputElement>(null);
  const {locale,t,text}=useI18n();
  const [storageMessage,setStorageMessage]=useState('');
  useEffect(()=>{const d=dialog.current!;d.showModal();return()=>{if(d.open)d.close();};},[]);
  async function exportSave(){try{const raw=await controller.export();const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`china-airlines-${new Date().toISOString().slice(0,10)}.json`;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{/* Controller displays the error. */}}
  async function readFile(file:File|undefined){
    if(!file)return;
    if(file.size>1_000_000){useGame.setState({error:t('settings.importLarge')});return;}
    if(!window.confirm(t('settings.importConfirm')))return;
    try{await controller.import(await file.text());}catch{/* Invalid files leave the game untouched. */}
  }
  return <dialog ref={dialog} className="settings-modal" onClose={onClose} aria-labelledby="settings-title">
    <div className="modal-heading"><h2 id="settings-title">{t('settings.title')}</h2><button aria-label={t('settings.close')} onClick={()=>dialog.current?.close()}>×</button></div>
    <section className="setting-row language-setting"><div><strong>{t('settings.language')}</strong><p>{t('settings.languageHelp')}</p></div><LanguagePicker/></section>
    <DisplaySettings/>
    <div className="save-summary"><Icon name="save"/><div><strong>{view.savedAt?t('settings.saveConfirmed'):t('settings.saveMissing')}</strong><p>{view.savedAt?t('settings.lastSaved',{time:new Date(view.savedAt).toLocaleTimeString(locale)}):t('settings.saveSafe')}</p></div></div>
    <p className="muted-text">{t('settings.saveHelp')}</p>
    <div className="settings-actions"><button className="primary" disabled={view.busy||!view.game} onClick={()=>ignore(controller.save())}>{t('settings.saveNow')}</button><button disabled={view.busy||!view.game} onClick={()=>ignore(exportSave())}>{t('settings.export')}</button><button disabled={view.busy} onClick={()=>input.current?.click()}>{t('settings.import')}</button><button disabled={view.busy} onClick={()=>{if(window.confirm(t('settings.restoreConfirm')))ignore(controller.restoreBackup());}}>{t('settings.restore')}</button></div>
    <input ref={input} type="file" accept=".json,application/json" aria-label={t('settings.chooseFile')} className="file-input" onChange={e=>{ignore(readFile(e.target.files?.[0]));e.target.value='';}}/>
    <section className="setting-row"><div><strong>{t('settings.offline')}</strong><p>{view.offlineReady?t('settings.offlineReady'):t('settings.offlineFirst')}</p></div></section>
    <section className="setting-row"><div><strong>{t('settings.saveCompatibility')}</strong><p>{t('settings.saveCompatibilityHelp')}</p></div></section>
    <section className="setting-row"><div><strong>{t('settings.persistence')}</strong><p>{storageMessage||t('settings.persistenceHelp')}</p></div><button onClick={()=>{if(!navigator.storage?.persist){setStorageMessage(t('settings.persistenceUnsupported'));return;}void navigator.storage.persist().then(ok=>setStorageMessage(ok?t('settings.persistenceGranted'):t('settings.persistenceDenied'))).catch(()=>setStorageMessage(t('settings.persistenceFailed')));}}>{t('settings.persistenceApply')}</button></section>
    {view.updateAvailable&&<button className="primary full" disabled={view.busy||!view.game} onClick={()=>ignore(installUpdate())}>{t('settings.update')}</button>}
    {view.error&&<p role="alert" className="inline-error">{text(view.error)}</p>}
    {!view.error&&view.notice&&<p role="status" className="workshop-feedback">{text(view.notice)}</p>}
    <div className="danger-zone"><p>{t('settings.privacy')}</p><button className="danger" disabled={view.busy} onClick={()=>{if(window.confirm(t('settings.restartConfirm')))ignore(controller.restart());}}>{t('settings.restart')}</button></div>
  </dialog>;
}
export function PlaneArt({variant,cargo=false}:{variant:number;cargo?:boolean}) {
  const {ui}=useI18n();
  return <svg className="plane-art" viewBox="0 0 360 160" role="img" aria-label={ui('原创虚构飞机')}><ellipse cx="180" cy="135" rx="132" ry="7" fill="#42607b" opacity=".1"/><g stroke="#4c7287" strokeWidth="2"><path d="m48 104 36-34h175l28-44h19l-1 49 25 25-47 20H88Z" fill="#fffbed"/><path d="m260 74 27-48h19l-1 49Z" fill={['#318dc0','#55a58f','#de934b'][variant % 3]}/><path d="m145 103 56 29h50l-52-30" fill="#cddddd"/><path d="m49 104 280-4-46 20H88Z" fill="#7dbdd4" stroke="none"/><path d="m150 103 62 32h42l-49-32" fill="#d9e3e0"/><path d="m69 88 17-12h18v14Z" fill="#40657c"/></g>{cargo ? <rect x="132" y="80" width="75" height="21" rx="3" fill="#dbc393" stroke="#826d4d" strokeWidth="2"/> : <path d="M126 86h112" stroke="#346280" strokeWidth="5" strokeDasharray="5 9"/>}</svg>;
}
export function Shop({game,busy,selected}:{game:GameState;busy:boolean;selected:string}) {
  const [delivery,setDelivery]=useState(selected), [kind,setKind]=useState<AircraftKind | 'all'>('mixed');
  const to=game.airports.some(a=>a.id===delivery)?delivery:'PEK', view=useGame();
  const {ui,text,airportName,modelName,modelRole}=useI18n();
  const category=(key:AircraftKind|'all')=>key==='all'?ui('全部机型'):ui(AIRCRAFT_KIND_LABEL[key]);
  return <section className="content-page fleet-shop"><div className="shop-toolbar"><div className="shop-categories" role="group" aria-label={ui('机型分类')}>{(['mixed','passengers','cargo','all'] as const).map(k=><button key={k} aria-pressed={kind===k} onClick={()=>setKind(k)}>{category(k)}</button>)}</div><label className="field-label delivery">{ui('交付机场')}<select aria-label={ui('交付机场')} value={to} onChange={e=>setDelivery(e.target.value)}>{game.airports.map(a=><option key={a.id} value={a.id}>{airportName(a.id,airport(a.id).city)} · {a.level} {ui('级')}</option>)}</select></label><span>{ui('机位 {used} / {capacity}',{used:game.fleet.length,capacity:game.hangarSlots})}</span></div>
    <div className="shop-grid">{MODELS.filter(m=>kind==='all'||m.kind===kind).map(m=>{const level=game.airports.find(a=>a.id===to)!.level,enough=game.credits>=m.price,full=game.fleet.length>=game.hangarSlots,name=modelName(m.id,m.name);return <article className="aircraft-card shop-card" key={m.id} data-testid="shop-aircraft"><div className="card-top"><span className="eyebrow">{m.family.toUpperCase()}</span><span className={`type-ribbon ${m.kind}`}>{modelRole(m.id,m.role)}</span></div><img className="painted-aircraft" src={artAsset(m.art)} alt={name}/><h3>{name}</h3><dl className="spec-grid"><div><dt>{ui('载客')}</dt><dd>{m.seats}<small>{ui('人')}</small></dd></div><div><dt>{ui('载货')}</dt><dd>{m.cargo}<small>{ui('吨')}</small></dd></div><div><dt>{ui('航程')}</dt><dd>{m.range}<small>km</small></dd></div><div><dt>{ui('机场等级')}</dt><dd>{m.level}<small>{ui('级')}</small></dd></div></dl><div className="price">{money(m.price)}</div><button className="primary full" disabled={busy||!enough||level<m.level||full||careerLevel(game)<m.rank} onClick={()=>ignore(controller.command({type:'buy',modelId:m.id,airportId:to}))}>{careerLevel(game)<m.rank?ui('公司需达到 Lv.{level}',{level:m.rank}):level<m.level?ui('交付机场需升至 {level} 级',{level:m.level}):full?ui('请先扩建机库'):!enough?ui('运营资金不足'):ui('购买{model}',{model:name})}</button></article>;})}</div>
    {view.error && <p role="alert" className="workshop-feedback">{text(view.error)}</p>}{view.notice && <p role="status" className="workshop-feedback">{text(view.notice)}</p>}
    <p className="muted-text">{ui('4个系列，12种机型。纯客机只能装旅客，纯货机只能装货物，客货机分别使用两类容量；新机型4至18客位、3至14货位。机型价格、数值与等级为航空化配置。')}</p></section>;
}
