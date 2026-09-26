import { useRef, useState } from 'react';
import { airport, model } from '../core/catalog.js';
import type { GameState } from '../core/game.js';
import { controller, useGame } from '../runtime.js';
import { formatMoney, useI18n } from '../i18n/I18n.js';
import { GameDialog } from './components/GameDialog.js';
import './aircraft-purchase.css';

/** Selection remains local until the core buys and configures the aircraft atomically. */
export function AircraftPurchase({ modelId, airportId, game, busy, onClose }: {
  modelId: string; airportId: string; game: GameState; busy: boolean; onClose: () => void;
}) {
  const m = model(modelId), { t, text, airportName, modelName } = useI18n();
  const [passengers, setPassengers] = useState(0), [cargo, setCargo] = useState(0);
  const [submitting, setSubmitting] = useState(false), pending = useRef(false);
  const error = useGame(s => s.error);
  const valid = Number.isSafeInteger(passengers) && Number.isSafeInteger(cargo) && passengers >= 0 && cargo >= 0 &&
    passengers + cargo > 0 && passengers + cargo <= m.capacity;
  async function confirm() {
    if (!valid || busy || pending.current) return;
    pending.current = true; setSubmitting(true);
    try {
      await controller.command({ type: 'buy', modelId, airportId, passengers, cargo });
      onClose();
    } catch { /* Keep the selection visible; the controller supplies the error. */ }
    finally { pending.current = false; setSubmitting(false); }
  }
  return <GameDialog title={t('purchase.title')} className="aircraft-purchase" onClose={onClose}
    footer={<div className="purchase-actions"><button disabled={submitting} onClick={onClose}>{t('purchase.cancel')}</button><button className="primary" disabled={busy || submitting || !valid || game.credits < m.price} onClick={() => { void confirm(); }}>{t('purchase.confirm')}</button></div>}>
    <p className="purchase-model"><strong>{modelName(m.id, m.name)}</strong> · {airportName(airportId, airport(airportId).city)}</p>
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
