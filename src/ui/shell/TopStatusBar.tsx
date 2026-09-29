import { careerLevel } from '../../core/career.js';
import { useGame } from '../../runtime.js';
import { useI18n } from '../../i18n/I18n.js';
import { Icon } from '../Panels.js';
import { CompanyLogo } from '../CompanyLogo.js';

export function TopStatusBar({ hidden, onFleet, onHelp, onSettings }: {
  hidden: boolean; onFleet: () => void; onHelp: () => void; onSettings: () => void;
}) {
  const view = useGame(), game = view.game;
  const { t, money } = useI18n();
  return <header className="game-hud" hidden={hidden}>
    <div className="game-brand company-brand" data-testid="company-brand"><span className="pilot-badge"><CompanyLogo logo={game?.company?.logo ?? { kind: 'preset', id: 'wing' }} label={t('company.logoAlt', { name: game?.company?.name ?? t('app.name') })}/></span><div><h1 title={game?.company?.name} data-testid="company-name">{game?.company?.name ?? t('app.name')}</h1><small>{t('hud.company', { level: game ? careerLevel(game) : 1 })}</small></div></div>
    <div className="resource"><Icon name="coin"/><span><small>{t('hud.credits')}</small><strong data-testid="credits">{money(game?.credits ?? 0)}</strong></span></div>
    <button type="button" className="resource fleet-status-button" aria-label={t('hud.fleetOpen')} disabled={!game} onClick={onFleet}><Icon name="fleet"/><span><small>{t('hud.fleet')}</small><strong data-testid="fleet-count">{t('common.aircraftCount', { count: game?.fleet.length ?? 0 })}</strong></span></button>
    <div className="resource" data-testid="tickets-resource"><Icon name="ticket"/><span><small>{t('hud.tickets')}</small><strong data-testid="tickets-count">{t('common.ticketCount', { count: game?.career.tickets ?? 0 })}</strong><span className="sr-only" data-testid="flights-count">{t('common.flightCount', { count: game?.stats.flights ?? 0 })}</span></span></div>
    <button type="button" aria-label={t('hud.help')} onClick={onHelp}><Icon name="help"/></button>
    <button type="button" aria-label={t('hud.save')} onClick={onSettings}><Icon name="save"/><span>{view.busy ? t('common.saving') : view.error ? t('common.attention') : t('common.saved')}</span></button>
  </header>;
}
