import type { currentFlight } from './flight-status.js';
import { money } from './Panels.js';
import { useI18n } from '../i18n/I18n.js';

export function FlightMoney({ flight }: { flight: NonNullable<ReturnType<typeof currentFlight>> }) {
  const { ui } = useI18n();
  return <div className="flight-money" role="group" aria-label={ui('当前航班收支')}>
    <span><small>{ui('已付成本')}</small><strong data-testid="flight-cost">{money(flight.cost)}</strong></span>
    <span><small>{ui('到达交付')}</small><strong data-testid="flight-revenue">{money(flight.revenue)}</strong></span>
    <span><small>{ui('本段净收益')}</small><strong data-testid="flight-profit">{money(flight.profit)}</strong></span>
  </div>;
}
