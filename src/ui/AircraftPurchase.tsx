import { useRef, useState } from 'react';
import { airport, model } from '../core/catalog.js';
import { careerLevel } from '../core/career.js';
import type { GameState } from '../core/game.js';
import { controller, useGame } from '../runtime.js';
import { formatMoney, useI18n } from '../i18n/I18n.js';
import { GameDialog } from './components/GameDialog.js';
import './aircraft-purchase.css';

/** Selection remains local until the core buys and configures the aircraft atomically. */
export function AircraftPurchase({ modelId, airportId, onDeliveryChange, game, busy, onClose }: {
  modelId: string; airportId: string; onDeliveryChange: (airportId: string) => void; game: GameState; busy: boolean; onClose: () => void;
}) {
  const m = model(modelId), { t, ui, text, airportName, modelName } = useI18n();
  const [passengers, setPassengers] = useState(0), [cargo, setCargo] = useState(0);
  const [submitting, setSubmitting] = useState(false), pending = useRef(false);
  const error = useGame(s => s.error);
  const valid = Number.isSafeInteger(passengers) && Number.isSafeInteger(cargo) && passengers >= 0 && cargo >= 0 &&
    passengers + cargo > 0 && passengers + cargo <= m.capacity;
  const unavailable=careerLevel(game)<m.rank?ui('公司需达到 Lv.{level}',{level:m.rank})
    :!game.airports.some(a=>a.id===airportId)||airport(airportId).stars<m.level?t('purchase.airportStars',{stars:m.level})
    :game.fleet.length>=game.hangarSlots?ui('请先扩建机库'):game.credits<m.price?ui('运营资金不足'):'';
  async function confirm() {
    if (!valid || unavailable || busy || pending.current) return;
    pending.current = true; setSubmitting(true);
    try {
      await controller.command({ type: 'buy', modelId, airportId, passengers, cargo });
      onClose();
    } catch { /* Keep the selection visible; the controller supplies the error. */ }
    finally { pending.current = false; setSubmitting(false); }
  }
  return <GameDialog title={t('purchase.title')} className="aircraft-purchase" onClose={onClose}
    footer={<div className="purchase-actions"><button disabled={submitting} onClick={onClose}>{t('purchase.cancel')}</button><button className="primary" aria-describedby={unavailable?'purchase-unavailable':undefined} disabled={busy || submitting || !valid || Boolean(unavailable)} onClick={() => { void confirm(); }}>{t('purchase.confirm',{amount:formatMoney(m.price)})}</button></div>}>
    <p className="purchase-model"><strong>{modelName(m.id, m.name)}</strong></p>
    <label className="purchase-delivery">{ui('交付机场')}<select aria-label={ui('交付机场')} value={airportId} disabled={busy||submitting} onChange={e=>onDeliveryChange(e.target.value)}>
      {game.airports.map(a=><option key={a.id} value={a.id}>{airportName(a.id,airport(a.id).city)} · {'★'.repeat(airport(a.id).stars)} · {t('airport.facilityLevel',{level:a.level})}</option>)}
    </select></label>
    {unavailable&&<p className="inline-error" id="purchase-unavailable">{unavailable}</p>}
    <p>{t('purchase.help', { capacity: m.capacity })}</p>
    <div className="purchase-controls">
      <label>{t('purchase.passengers')}<input type="number" min="0" max={m.capacity} step="1" value={Number.isNaN(passengers) ? '' : passengers} disabled={submitting} onChange={e => setPassengers(e.target.valueAsNumber)}/></label>
      <label>{t('purchase.cargo')}<input type="number" min="0" max={m.capacity} step="1" value={Number.isNaN(cargo) ? '' : cargo} disabled={submitting} onChange={e => setCargo(e.target.valueAsNumber)}/></label>
    </div>
    <p className="purchase-rule">{valid ? t('purchase.remaining', { count: m.capacity - passengers - cargo }) : t('purchase.invalid', { capacity: m.capacity })}</p>
    <dl className="purchase-price"><div><dt>{t('purchase.airframe')}</dt><dd>{formatMoney(m.price)}</dd></div><div><dt>{t('purchase.configuration')}</dt><dd>{t('purchase.free')}</dd></div><div><dt>{t('purchase.total')}</dt><dd>{formatMoney(m.price)}</dd></div></dl>
    <p className="muted-text">{t('purchase.laterRefits')}</p>
    {error && <p role="alert" className="inline-error">{text(error)}</p>}
  </GameDialog>;
}
