export const OFFLINE_LIMIT = 8 * 3600;
export const MAX_FLEET = 16;
export const TURNAROUND = 8;

export interface Flight {
  id: string;
  routeId: string;
  from: string;
  to: string;
  departAt: number;
  arriveAt: number;
  passengers: number;
  cargo: number;
  revenue: number;
  cost: number;
}

export interface Plane {
  id: string;
  modelId: string;
  airportId: string;
  readyAt: number;
  autoRouteId: string | null;
  flight: Flight | null;
}

export interface Route {
  id: string;
  from: string;
  to: string;
}

export interface GameState {
  version: number;
  credits: number;
  simTime: number;
  lastWallTime: number;
  nextId: number;
  airports: { id: string; level: number }[];
  fleet: Plane[];
  routes: Route[];
  stats: {
    flights: number;
    passengers: number;
    cargo: number;
    revenue: number;
    costs: number;
  };
  claimedTasks: string[];
  log: { at: number; text: string; amount: number }[];
}

export type Command =
  | { type: 'unlock'; airportId: string }
  | { type: 'upgrade'; airportId: string }
  | { type: 'buy'; modelId: string; airportId: string }
  | { type: 'route'; from: string; to: string }
  | { type: 'dispatch'; planeId: string; to: string; auto: boolean }
  | { type: 'stop'; planeId: string }
  | { type: 'claim'; taskId: string };

export interface AdvanceReport {
  elapsed: number;
  flights: number;
  revenue: number;
  profit: number;
  capped: boolean;
  clockBack: boolean;
}
