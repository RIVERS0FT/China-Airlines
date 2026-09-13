import { useRef, useState } from 'react';
import type { GameState } from '../core/game.js';
import { FlightBoard } from './FlightBoard.js';
import { Hangar } from './Hangar.js';

export type FleetTab = 'planes' | 'flights';
export function FleetManagement({ game, busy, selectedPlaneId, initialTab = 'planes', onSelect }: {
  game: GameState; busy: boolean; selectedPlaneId?: string; initialTab?: FleetTab; onSelect: (id: string) => void;
}) {
  const [tab, setTab] = useState<FleetTab>(initialTab);
  const [selected, setSelected] = useState(selectedPlaneId ?? game.fleet[0]!.id);
  const tabs = useRef<HTMLDivElement>(null);
  function inspect(id: string) { setSelected(id); setTab('planes'); tabs.current?.querySelector<HTMLButtonElement>('#fleet-planes-tab')?.focus(); }
  return <section className="fleet-management">
    <div className="fleet-management-tabs" role="tablist" aria-label="机队管理栏目" ref={tabs} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const next = event.key === 'Home' ? 'planes' : event.key === 'End' ? 'flights' : tab === 'planes' ? 'flights' : 'planes';
      setTab(next); tabs.current?.querySelector<HTMLButtonElement>(`#fleet-${next}-tab`)?.focus();
    }}>
      <button role="tab" id="fleet-planes-tab" aria-controls="fleet-panel" aria-selected={tab === 'planes'} tabIndex={tab === 'planes' ? 0 : -1} onClick={() => setTab('planes')}>飞机</button>
      <button role="tab" id="fleet-flights-tab" aria-controls="fleet-panel" aria-selected={tab === 'flights'} tabIndex={tab === 'flights' ? 0 : -1} onClick={() => setTab('flights')}>航班</button>
    </div>
    <div role="tabpanel" id="fleet-panel" aria-labelledby={`fleet-${tab}-tab`}>
      {tab === 'planes' ? <Hangar game={game} busy={busy} selectedPlaneId={selected} onInspect={setSelected} onSelect={onSelect}/> : <FlightBoard game={game} selectedId={selected} onSelect={inspect}/>}
    </div>
  </section>;
}
