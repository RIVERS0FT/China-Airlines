import { DisplaySettings } from './DisplaySettings.js';
import { AircraftPurchase } from './AircraftPurchase.js';
import { careerLevel } from '../core/career.js';
import { useRef, useState } from 'react';
import { MODELS, airport } from '../core/catalog.js';
import { aircraftProjectQuote } from '../core/investment.js';
import { MAX_SAVE_BYTES } from '../core/balance-policy.js';
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
  const paths:Record<string,string>={plane:'m21 3-5 12-6 1-4 5-2-2 3-5-5-3 1-2 7 1 8-7Z',map:'m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Zm6-3v15m6-12v15',fleet:'M4 18h16M7 14h10M12 3v10m-7-4 7-3 7 3m-11 5 4-2 4 2',shop:'M3 9h18l-2-6H5ZM5 9v12h14V9M9 21v-7h6v7',task:'M8 4H5v18h14V4h-3M8 2h8v5H8Zm0 11 2 2 5-5m-7 8h7',save:'M4 3h13l4 4v14H3V3Zm3 0v6h10V3M7 21v-8h10v8',check:'m4 12 5 5L20 6',rotate:'M7 3h10v18H7ZM3 5 1 8l2 3M21 19l2-3-2-3'};
  return <svg className="icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]||paths.plane}/></svg>;
}
export function Settings({onClose,onReturnTitle,onLoaded}:{onClose:()=>void;onReturnTitle?:()=>Promise<void>;onLoaded?:()=>void}) {
  const view=useGame(), input=useRef<HTMLInputElement>(null);
  const {locale,t,text}=useI18n();
  async function exportSave(){try{const raw=await controller.export();const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`china-airlines-${new Date().toISOString().slice(0,10)}.json`;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{/* Controller displays the error. */}}
  async function readFile(file:File|undefined){
    if(!file)return;
    if(file.size>MAX_SAVE_BYTES){useGame.setState({error:t('settings.importLarge')});return;}
    if(onReturnTitle&&!window.confirm(t('settings.importConfirm')))return;
    try{await controller.import(await file.text(),!onReturnTitle);onLoaded?.();}catch{/* Invalid files leave the game untouched. */}
  }
  return <><GameDialog title={t('settings.title')} closeLabel={t('settings.close')} className="settings-modal" onClose={onClose}>
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
      </section>
    </div>
    <input ref={input} type="file" accept=".json,application/json" aria-label={t('settings.chooseFile')} className="file-input" onChange={e=>{ignore(readFile(e.target.files?.[0]));e.target.value='';}}/>
    {view.updateAvailable&&<button className="primary full" disabled={view.busy||!view.game} onClick={()=>ignore(installUpdate())}>{t('settings.update')}</button>}
    {view.error&&<p role="alert" className="inline-error">{text(view.error)}</p>}
    {!view.error&&view.notice&&<p role="status" className="workshop-feedback">{text(view.notice)}</p>}
    <div className="settings-footer"><p className="settings-note">{t('settings.saveHelp')}</p>{onReturnTitle&&<button disabled={view.busy} onClick={()=>ignore(onReturnTitle())}>{t('settings.returnTitle')}</button>}</div>
  </GameDialog></>;
}
export function Shop({game,busy,selected}:{game:GameState;busy:boolean;selected:string}) {
  const [delivery,setDelivery]=usePageState('shop.delivery',selected);
  const [purchase,setPurchase]=useState<string|null>(null);
  const to=game.airports.some(a=>a.id===delivery)?delivery:game.airports[0]!.id, view=useGame();
  const {ui,t,text,modelName,airportName,locale}=useI18n();
  return <section className="content-page fleet-shop"><PageToolbar className="shop-toolbar"><span>{ui('机位 {used} / {capacity}',{used:game.fleet.length,capacity:game.hangarSlots})}</span></PageToolbar>
    <div className="shop-grid">{MODELS.map(m=>{
      const name=modelName(m.id,m.name);
      const destination=game.airports.find(a=>a.id!==to)?.id ?? (to==='PVG'?'PEK':'PVG');
      const project=aircraftProjectQuote(game,m.id,to,destination);
      const unavailable=careerLevel(game)<m.rank?ui('公司需达到 Lv.{level}',{level:m.rank})
        :!game.airports.some(a=>airport(a.id).stars>=m.level)?t('purchase.airportStars',{stars:m.level})
        :game.fleet.length>=game.hangarSlots?ui('请先扩建机库'):game.credits<m.price?ui('运营资金不足'):'';
      return <article className="aircraft-card shop-card" key={m.id} data-testid="shop-aircraft" aria-labelledby={`shop-model-${m.id}`}>
        <div className="card-top"><h3 id={`shop-model-${m.id}`}>{name}</h3><span className="type-ribbon">{t('purchase.capacity',{count:m.capacity})}</span></div>
        <img className="painted-aircraft" src={artAsset(m.art)} alt={name}/>
        <dl className="spec-grid"><div><dt>{ui('航程')}</dt><dd>{m.range}<small>km</small></dd></div><div><dt>{t('purchase.requiredStars')}</dt><dd>{'★'.repeat(m.level)}</dd></div></dl>
        <details><summary>{locale==='en-US'?'Route investment estimate':'航线投资估算'}</summary><small>{airportName(to,to)} → {airportName(destination,destination)} · {locale==='en-US'?'Aircraft, airports and slots:':'机价、两端机场及机位合计：'} {money(project.total)}{!project.inRange && (locale==='en-US'?' · Beyond range':' · 超出航程')}{!project.compatibleAirports && ` · ${t('purchase.airportStars',{stars:m.level})}`} · {locale==='en-US'?'Operating reserve and staffing excluded':'未含周转金与人员投入'}</small></details>
        <button data-guide={m.id==='diamond-da40'?'buy-first-plane':undefined} className="primary full" aria-describedby={unavailable?`shop-unavailable-${m.id}`:undefined} disabled={busy||Boolean(unavailable)} onClick={()=>setPurchase(m.id)}>{t('purchase.confirm',{amount:money(m.price)})}</button>
        {unavailable&&<p className="shop-unavailable" id={`shop-unavailable-${m.id}`}>{unavailable}</p>}
      </article>;
    })}</div>
    {view.error && <p role="alert" className="workshop-feedback">{text(view.error)}</p>}{view.notice && <p role="status" className="workshop-feedback">{text(view.notice)}</p>}
    {purchase && <AircraftPurchase key={purchase} modelId={purchase} airportId={to} onDeliveryChange={setDelivery} game={game} busy={busy} onClose={()=>setPurchase(null)}/>}</section>;
}
