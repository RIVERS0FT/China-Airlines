/** Frozen v7 shapes. Do not extend these when adding organization fields. */
import type { Plane as LegacyPlane, GameState as LegacyState } from './legacy.js';
import type { Upgrades, Tuning, Material, Building } from './career-catalog-v7.js';
import type { EnergyBudget } from './energy-v6.js';
export interface Plane extends LegacyPlane { upgrades: Upgrades; itinerary: string[]; dispatcher: boolean; energy: EnergyBudget; tuning: Tuning }
export interface Order { id:string; kind:'passengers'|'cargo'; from:string; to:string; amount:number; reward:number; location:string; createdAt:number; expiresAt:number|null; service:string; product:Material|null }
export interface GameState extends Omit<LegacyState,'version'|'fleet'> { version:7; career:Career; fleet:Plane[]; hangarSlots:number; orders:Order[]; nextOrderId:number; nextDemandAt:number; fleetPeak:number; tutorial:'available'|'active'|'completed'|'skipped' }
export interface Pilot {
  id: number;
  name: string;
  planeId: string | null;
  paidUntil: number;
  skill: number;
}
export interface Production {
  id: number;
  recipe: string;
  airportId: string;
  count: number;
  finishAt: number;
}
export interface Career {
  tickets: number;
  xp: number;
  day: number;
  nextDayAt: number;
  seed: number;
  nextId: number;
  airportPeak: number;
  inventory: Record<Material, number>;
  warehouses: Record<string, Record<Material, number>>;
  stored: Plane[];
  pilots: Pilot[];
  buildings: Record<Building, number>;
  production: Production[];
  claimed: string[];
  museum: string[];
  achievement: number;
  assemblies: number;
  produced: number;
  trades: number;
  dailyFlights: number;
  dailyDeliveries: number;
  dailyBought: Record<string, number>;
  weekly: number;
  demandOff: string[];
  promotions: Record<string, number>;
  savedRoutes: { name: string; stops: string[] }[];
  investment: { amount: number; finishAt: number } | null;
  licenses: string[];
  deliveredGoods: Record<string, Record<Material, number>>;
}
