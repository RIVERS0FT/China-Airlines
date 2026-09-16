import { Icon } from '../Panels.js';
import { useI18n } from '../../i18n/I18n.js';
import type { Page } from './navigation.js';

const items = [
  ['map', 'map', 'nav.map'], ['airport', 'airport', 'nav.airport'],
  ['airports', 'directory', 'nav.directory'], ['fleet', 'plane', 'nav.fleet'],
  ['shop', 'shop', 'nav.shop'], ['organization', 'pilot', 'nav.organization'],
  ['career', 'trophy', 'nav.career'],
] as const;
export function MainNavigation({ page, onNavigate, departure }: {
  page: Page; onNavigate: (page: Page) => void;
  departure: { disabled: boolean; reason: string; onClick: () => void };
}) {
  const { t } = useI18n();
  if (page === 'dispatch') return null;
  return <nav className="game-dock" aria-label={t('nav.main')}>
    {items.map(([target, icon, label]) => <button type="button" key={target} className={page === target ? 'active' : ''} aria-current={page === target ? 'page' : undefined} onClick={() => onNavigate(target)}><Icon name={icon}/><span>{t(label)}</span></button>)}
    {page === 'airport' && <button type="button" className="gold-button depart-button" aria-label={t('nav.dispatch')} aria-describedby="airport-departure-reason" title={departure.reason || t('airport.routeHint')} disabled={departure.disabled} onClick={departure.onClick}><Icon name="plane"/><span>{t('nav.dispatch')}</span><small id="airport-departure-reason" className="airport-departure-reason">{departure.reason}</small></button>}
  </nav>;
}
