/** Original aviation balance; the approved former point conversion is 100 coins. */
export const POINT_GOLD = 100;
export const STARTING_CREDITS = 6000 + 24 * POINT_GOLD;
export const EARLY_AIRPORT_PRICES = { PVG: 2500, WUH: 3000, XIY: 5000 } as const;
export const DEMAND_LIMITS = [18, 30, 48] as const;
export const PROMOTION_ORDERS = 6;
export const MAX_WAITING_ORDERS = 70;
export const PRIMARY_DEMAND_WEIGHT = 70;
export const MAX_SAVE_BYTES = 8_000_000;
export const OPERATION_REWARDS = {
  'first-flight': { gold: 600, minRevenue: 1 },
  'three-airports': { gold: 250, minRevenue: 1000 },
  'three-planes': { gold: 1000, minRevenue: 2000 },
  'ten-flights': { gold: 400, minRevenue: 3000 },
} as const;
export const CAREER_REWARDS = {
  'deliver-10': { gold: 300 + 8 * POINT_GOLD, minRevenue: 3000 },
  'network-3': { gold: 350 + 12 * POINT_GOLD, minRevenue: 1000 },
  'flights-10': { gold: 400 + 20 * POINT_GOLD, minRevenue: 3000 },
  'crew-1': { gold: 1000 + 10 * POINT_GOLD, minRevenue: 3000 },
  'assembly-1': { gold: 4000 + 20 * POINT_GOLD, minRevenue: 6000 },
  'production-5': { gold: 5000 + 25 * POINT_GOLD, minRevenue: 8000 },
  'museum-1': { gold: 3000 + 25 * POINT_GOLD, minRevenue: 8000 },
  'trade-3': { gold: 5000 + 30 * POINT_GOLD, minRevenue: 10000 },
} as const;
export const DAILY_TRANSPORT_REWARD = 1000 + 8 * POINT_GOLD;
export const REGION_REWARD_PER_TIER = 1500 + 10 * POINT_GOLD;

/** Rates are integer milli-coins/second; training costs are coins. */
export const BUSINESS_BALANCE = {
  ticketing: { opening: 1200, hiring: 900, expansion: 1600, gross: 240, wage: 80, overhead: 40, specialistTraining: 200, managerTraining: 250 },
  services: { opening: 4000, hiring: 2600, expansion: 4600, gross: 640, wage: 220, overhead: 120, specialistTraining: 550, managerTraining: 700 },
  forwarding: { opening: 12000, hiring: 7800, expansion: 12000, gross: 1800, wage: 620, overhead: 300, specialistTraining: 1500, managerTraining: 1900 },
} as const;
export const paybackMinutes = (cost: number, gainMilliPerSecond: number): number | null =>
  gainMilliPerSecond > 0 ? cost * 1000 / gainMilliPerSecond / 60 : null;
