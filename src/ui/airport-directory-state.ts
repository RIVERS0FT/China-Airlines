import type { ContinentFilter } from './airport-search.js';
import { create } from 'zustand';
import type { AirportFilter } from './airport-presentation.js';

interface DirectoryState {
  continent: ContinentFilter;
  setContinent: (continent: ContinentFilter) => void;
  filter: AirportFilter;
  search: string;
  scrollTop: number;
  returnTo: string | null;
  setFilter: (filter: AirportFilter) => void;
  setSearch: (search: string) => void;
  showAll: () => void;
}

/** Session-only navigation memory. Never persisted into or used to modify a game save. */
export const useAirportDirectoryState = create<DirectoryState>(set => ({
  continent: 'all', setContinent: continent => set({ continent, scrollTop: 0, returnTo: null }),
  filter: 'open', search: '', scrollTop: 0, returnTo: null,
  setFilter: filter => set({ filter, scrollTop: 0, returnTo: null }),
  setSearch: search => set({ search, scrollTop: 0, returnTo: null }),
  showAll: () => set({ continent: 'all', filter: 'all', search: '', scrollTop: 0, returnTo: null })
}));
