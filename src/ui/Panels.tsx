import { DisplaySettings } from './DisplaySettings.js';
import { AircraftPurchase } from './AircraftPurchase.js';
import { careerLevel } from '../core/career.js';
import { useRef, useState } from 'react';
import { airport, MODELS } from '../core/catalog.js';
import { type GameState } from '../core/game.js';
import { controller, useGame } from '../runtime.js';
import { installUpdate } from '../pwa.js';
import { artAsset, BUTTON_ART } from './art-assets.js';
import { formatDuration, formatMoney, LanguagePicker, useI18n } from '../i18n/I18n.js';
import { GameDialog } from './components/GameDialog.js';
import { PageToolbar } from './layout/PageFrame.js';
import { usePageState } from './shell/PageState.js';
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
  const view=useGame(), input=useRef<HTMLInputElement>(null);
  const {locale,t,text}=useI18n();
  const [storageMessage,setStorageMessage]=useState('');
  async function exportSave(){try{const raw=await controller.export();const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`china-airlines-${new Date().toISOString().slice(0,10)}.json`;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{/* Controller displays the error. */}}
  async function readFile(file:File|undefined){
    if(!file)return;
    if(file.size>1_000_000){useGame.setState({error:t('settings.importLarge')});return;}
    if(!window.confirm(t('settings.importConfirm')))return;
    try{await controller.import(await file.text());}catch{/* Invalid files leave the game untouched. */}
  }
  return <GameDialog title={t('settings.title')} closeLabel={t('settings.close')} className="settings-modal" onClose={onClose}>
    <div className="settings-grid">
      <section className="settings-section" aria-labelledby="settings-interface-title">
        <h3 id="settings-interface-title">{t('settings.interface')}</h3>
        <div className="settings-language"><span>{t('settings.language')}</span><LanguagePicker/></div>
        <DisplaySettings/>
      </section>
      <section className="settings-section" aria-labelledby="settings-save-title">
        <h3 id="settings-save-title">{t('settings.saves')}</h3>
        <div className="save-summary"><Icon name="save"/><div><strong>{view.savedAt?t('settings.saveConfirmed'):t('settings.saveMissing')}</strong>{view.savedAt!==null&&<p>{t('settings.lastSaved',{time:new Date(view.savedAt).toLocaleTimeString(locale)})}</p>}</div></div>
        <div className="settings-actions"><button className="primary" disabled={view.busy||!view.game} onClick={()=>ignore(controller.save())}>{t('settings.saveNow')}</button><button disabled={view.busy||!view.game} onClick={()=>ignore(exportSave())}>{t('settings.export')}</button><button disabled={view.busy} onClick={()=>input.current?.click()}>{t('settings.import')}</button><button disabled={view.busy} onClick={()=>{if(window.confirm(t('settings.restoreConfirm')))ignore(controller.restoreBackup());}}>{t('settings.restore')}</button></div>
        <p className="settings-note">{t('settings.saveCompatibilityHelp')}</p>
      </section>
    </div>
    <input ref={input} type="file" accept=".json,application/json" aria-label={t('settings.chooseFile')} className="file-input" onChange={e=>{ignore(readFile(e.target.files?.[0]));e.target.value='';}}/>
    <div className="settings-system">
      <section className="settings-status-row"><div><strong>{t('settings.offline')}</strong><p className="settings-note">{t('settings.offlineLimit')}</p></div><span className={`settings-cache-status${view.offlineReady?' is-ready':''}`} role="status">{view.offlineReady?t('settings.offlineReady'):t('settings.offlineFirst')}</span></section>
      <section className="settings-status-row"><div><strong>{t('settings.persistence')}</strong>{storageMessage&&<p className="settings-note" role="status">{storageMessage}</p>}</div><button onClick={()=>{if(!navigator.storage?.persist){setStorageMessage(t('settings.persistenceUnsupported'));return;}void navigator.storage.persist().then(ok=>setStorageMessage(ok?t('settings.persistenceGranted'):t('settings.persistenceDenied'))).catch(()=>setStorageMessage(t('settings.persistenceFailed')));}}>{t('settings.persistenceApply')}</button></section>
    </div>
    {view.updateAvailable&&<button className="primary full" disabled={view.busy||!view.game} onClick={()=>ignore(installUpdate())}>{t('settings.update')}</button>}
    {view.error&&<p role="alert" className="inline-error">{text(view.error)}</p>}
    {!view.error&&view.notice&&<p role="status" className="workshop-feedback">{text(view.notice)}</p>}
    <div className="settings-footer"><p className="settings-note">{t('settings.saveHelp')}</p><button className="danger" disabled={view.busy} onClick={()=>{if(window.confirm(t('settings.restartConfirm')))ignore(controller.restart());}}>{t('settings.restart')}</button></div>
  </GameDialog>;
}
export function Shop({game,busy,selected}:{game:GameState;busy:boolean;selected:string}) {
  const [delivery,setDelivery]=usePageState('shop.delivery',selected);
  const [purchase,setPurchase]=useState<{ modelId: string; airportId: string } | null>(null);
  const to=game.airports.some(a=>a.id===delivery)?delivery:'PEK', view=useGame();
  const {ui,t,text,airportName,modelName}=useI18n();
  return <section className="content-page fleet-shop"><PageToolbar className="shop-toolbar"><strong>1–10 格容量机型</strong><label className="field-label delivery">{ui('交付机场')}<select aria-label={ui('交付机场')} value={to} onChange={e=>setDelivery(e.target.value)}>{game.airports.map(a=><option key={a.id} value={a.id}>{airportName(a.id,airport(a.id).city)} · {a.level} {ui('级')}</option>)}</select></label><span>{ui('机位 {used} / {capacity}',{used:game.fleet.length,capacity:game.hangarSlots})}</span></PageToolbar>
    <div className="shop-grid">{MODELS.map(m=>{const level=game.airports.find(a=>a.id===to)!.level,enough=game.credits>=m.price,full=game.fleet.length>=game.hangarSlots,name=modelName(m.id,m.name);return <article className="aircraft-card shop-card" key={m.id} data-testid="shop-aircraft"><div className="card-top"><span className="eyebrow">{m.family.toUpperCase()}</span><span className="type-ribbon">总容量 {m.capacity} 格</span></div><img className="painted-aircraft" src={artAsset(m.art)} alt={name}/><h3>{name}</h3><div className="aircraft-reference"><span>{ui('现实参考')} · {m.reference.prototype}</span><small>{ui('现实容量')}：{ui(m.reference.capacity)}；游戏格数为经营配置</small></div><dl className="spec-grid"><div><dt>{t('purchase.configuration')}</dt><dd>{t('purchase.free')}</dd></div><div><dt>{t('purchase.layout')}</dt><dd>{t('purchase.choose')}</dd></div><div><dt>{ui('航程')}</dt><dd>{m.range}<small>km</small></dd></div><div><dt>{ui('机场等级')}</dt><dd>{m.level}<small>{ui('级')}</small></dd></div></dl><div className="price">{money(m.price)}</div><button data-guide={m.id === 'diamond-da40' ? 'buy-first-plane' : undefined} className="primary full" disabled={busy||!enough||level<m.level||full||careerLevel(game)<m.rank} onClick={()=>setPurchase({modelId:m.id,airportId:to})}>{careerLevel(game)<m.rank?ui('公司需达到 Lv.{level}',{level:m.rank}):level<m.level?ui('交付机场需升至 {level} 级',{level:m.level}):full?ui('请先扩建机库'):!enough?ui('运营资金不足'):ui('购买{model}',{model:name})}</button></article>;})}</div>
    {view.error && <p role="alert" className="workshop-feedback">{text(view.error)}</p>}{view.notice && <p role="status" className="workshop-feedback">{text(view.notice)}</p>}
    <p className="muted-text">{t('purchase.shopHelp')}</p>
    {purchase && <AircraftPurchase key={`${purchase.modelId}:${purchase.airportId}`} {...purchase} game={game} busy={busy} onClose={()=>setPurchase(null)}/>}</section>;
}
