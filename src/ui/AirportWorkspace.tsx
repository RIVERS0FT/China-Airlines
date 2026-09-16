import { airport, aircraftSpecs } from '../core/catalog.js';
import { loadSummary, type Command, type GameState } from '../core/game.js';
import { controller } from '../runtime.js';
import { useI18n } from '../i18n/I18n.js';
import { airportScene } from './airport-presentation.js';
import { energyText } from './EnergyService.js';
import { FlightMoney } from './FlightBoard.js';
import { flightStatus } from './flight-status.js';
import { AviationScene } from './AviationScene.js';
import { AirportSceneTools } from './AirportSceneTools.js';
import { OrderBoard } from './OrderBoard.js';
import { ignore } from './Panels.js';

/** Airport-specific scene composition; the shell owns navigation and page size. */
export function AirportWorkspace({ game, context, busy, aboard, orderViewKey, onInspect, onSelectPlane, onCycle, onCabin, onTasks }: {
  game: GameState; context: ReturnType<typeof airportScene>; busy: boolean; aboard: boolean; orderViewKey: number;
  onInspect: (id: string) => void; onSelectPlane: (id: string) => void; onCycle: (direction: number) => void; onCabin: () => void; onTasks: () => void;
}) {
  const { t, duration, airportName, modelName, ui } = useI18n();
  const { plane, airportId: current } = context;
  const total = plane ? loadSummary(game, plane.id) : { passengers: 0, cargo: 0 };
  const model = plane ? aircraftSpecs(plane) : null;
  const status = plane ? flightStatus(game, plane) : null;
  const flight = plane?.flight;
  const city = (id: string) => airportName(id, airport(id).city);
  const act = (command: Command) => ignore(controller.command(command));
  return <>
    <div className="airport-titlebar">
      <button className="airport-info-trigger" aria-label={t('airport.currentDetails')} onClick={() => onInspect(current)} title={t('airport.detailsHint')}>{t('airport.details')}</button>
      <div className="gate-sign"><b>{flight ? t('airport.flight') : '01'}</b><div><strong>{flight ? t('flight.route', { from:city(flight.from), to:city(flight.to) }) : t('airport.name', { city:city(current) })}</strong><small>{t('common.level', { value:game.airports.find(item => item.id === current)?.level ?? 0 })}</small></div></div>
      <div className="plane-status"><strong>{plane ? `${modelName(plane.modelId, model!.name)} · ${plane.id}` : t('airport.browseEmpty')}</strong><span>{!plane ? t('airport.browseOnly') : status && status.remaining !== null ? `${ui(status.label)} · ${ui('{time} 后{event}',{time:duration(status.remaining),event:ui(status.nextEvent)})}` : t('airport.parked')}</span></div>
      <div className="capacity"><span data-testid="passenger-capacity">{t('airport.passengers', { used:total.passengers, capacity:model?.seats ?? 0 })}</span><span>{t('airport.cargo', { used:total.cargo, capacity:model?.cargo ?? 0 })}</span>{plane && <span className="plane-energy" data-testid="plane-energy">{t('airport.energy', { value:energyText(plane.energy.availableSeconds) })}</span>}</div>
      {plane && plane.itinerary.length > 0 && <button className="plan-cancel" disabled={busy} onClick={() => act({ type:'cancel-plan', planeId:plane.id })}>{t('airport.cancelPlan')}</button>}
      {plane?.autoRouteId && <button disabled={busy} onClick={() => act({ type:'stop', planeId:plane.id })}>{t('airport.stopAuto')}</button>}
    </div>
    <div className="scene-wrap">
      {context.pinned && <button className="return-selected-plane" onClick={() => onSelectPlane(context.selected.id)}>{t('airport.backPlane', { id:context.selected.id })}</button>}
      {plane && plane.itinerary.length > 0 && <div className="itinerary-banner" data-testid="active-plan">{t('airport.onward', { route:plane.itinerary.map(city).join(' → ') })}</div>}
      <AviationScene game={game} plane={plane} busy={busy} cabinFocusKey={aboard ? orderViewKey : 0} onCabin={onCabin}/><AirportSceneTools game={game} plane={plane} onTasks={onTasks}/>
      <button className="switch-plane previous" aria-label={t('airport.previousPlane')} disabled={context.choices.length < 2} onClick={() => onCycle(-1)}>◀</button><button className="switch-plane next" aria-label={t('airport.nextPlane')} disabled={context.choices.length < 2} onClick={() => onCycle(1)}>▶</button>
      {flight && <div className="air-progress"><span>{city(flight.from)}</span><progress aria-label={t('flight.progress', { from:city(flight.from), to:city(flight.to) })} max={1} value={Math.max(0, (game.simTime - flight.departAt) / (flight.arriveAt - flight.departAt))}/><span>{city(flight.to)}</span></div>}
      {status?.flight && <div className="scene-flight-summary"><FlightMoney flight={status.flight}/></div>}
    </div>
    {!flight && <OrderBoard game={game} plane={plane} airportId={current} aboard={Boolean(plane) && aboard} viewKey={orderViewKey} busy={busy}/>}
  </>;
}
