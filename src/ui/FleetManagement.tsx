import { EmployeePortrait } from './EmployeePortrait.js';
import { employeeDisplayName } from './organization-presentation.js';
import { useRef, useState } from 'react';
import type { GameState } from '../core/game.js';
import { FlightBoard } from './FlightBoard.js';
import { Hangar } from './Hangar.js';
import { useI18n } from '../i18n/I18n.js';

export type FleetTab = 'planes' | 'flights';
export function FleetManagement({ game, busy, selectedPlaneId, initialTab = 'planes', onSelect, onEmployee }: {
  game: GameState; busy: boolean; selectedPlaneId?: string; initialTab?: FleetTab; onSelect: (id: string) => void; onEmployee?: (id: number) => void;
}) {
  const [tab, setTab] = useState<FleetTab>(initialTab);
  const [selected, setSelected] = useState(selectedPlaneId ?? game.fleet[0]!.id);
  const { ui, locale } = useI18n();
  const pilot = game.career.employees.find(e => e.planeId === selected);
  const tabs = useRef<HTMLDivElement>(null);
  function inspect(id: string) { setSelected(id); setTab('planes'); tabs.current?.querySelector<HTMLButtonElement>('#fleet-planes-tab')?.focus(); }
  return <section className="fleet-management">
    <div className="fleet-management-tabs" role="tablist" aria-label={ui('机队管理栏目')} ref={tabs} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const next = event.key === 'Home' ? 'planes' : event.key === 'End' ? 'flights' : tab === 'planes' ? 'flights' : 'planes';
      setTab(next); tabs.current?.querySelector<HTMLButtonElement>(`#fleet-${next}-tab`)?.focus();
    }}>
      <button role="tab" id="fleet-planes-tab" aria-controls="fleet-panel" aria-selected={tab === 'planes'} tabIndex={tab === 'planes' ? 0 : -1} onClick={() => setTab('planes')}>{ui('飞机')}</button>
      <button role="tab" id="fleet-flights-tab" aria-controls="fleet-panel" aria-selected={tab === 'flights'} tabIndex={tab === 'flights' ? 0 : -1} onClick={() => setTab('flights')}>{ui('航班')}</button>
    </div>
    {pilot && onEmployee && <button className="fleet-employee-link" onClick={() => onEmployee(pilot.id)}><EmployeePortrait id={pilot.id}/><span>{locale === 'en-US' ? 'Assigned pilot' : '负责飞行员'} · {employeeDisplayName(pilot)}</span></button>}
    <div role="tabpanel" id="fleet-panel" aria-labelledby={`fleet-${tab}-tab`}>
      {tab === 'planes' ? <Hangar game={game} busy={busy} selectedPlaneId={selected} onInspect={setSelected} onSelect={onSelect}/> : <FlightBoard game={game} selectedId={selected} onSelect={inspect}/>}
    </div>
  </section>;
}
