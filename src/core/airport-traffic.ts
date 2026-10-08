/** Frozen single-airport passenger observations. No runtime network access.
 * Periods and rounded figures are explicit; see docs/AIRPORT-TRAFFIC.md. */
export const TRAFFIC_SOURCES = {
  caac: 'https://www.caac.gov.cn/XXGK/XXGK/TJSJ/202602/t20260226_230119.html',
  atd: 'https://fracs.aero/wp-content/uploads/2026/04/ATD_Trends_Bulletin_0426_en.pdf',
  hkg: 'https://www.hongkongairport.com/en/media-centre/press-release/2026/pr_1849',
  kef: 'https://www.kefairport.com/news/8-million-guests-in-2025',
  per: 'https://edit-prod.perthairport.com.au/home/corporate/articles/2026/01/19/05/31/perth-airport-hits-all-time-high-18-million-passenger-number-record',
  akl: 'https://corporate.aucklandairport.co.nz/news/latest-media/2025/akl-fy25-delivering-essential-infrastructure-as-transformation-of-new-zealands-gateway-airport-gains-pace',
  anc: 'https://dot.alaska.gov/anc/passengers-press-releases.shtml',
  nan: 'https://www.aci-asiapac.aero/media-centre/news/fiji-airports-awards-nadi-international-airport-baggage-handling-system-upgrade-to-alstef-group',
} as const;
export interface AirportTrafficObservation {
  annualPassengers: number;
  trafficPeriod: string;
  trafficSource: keyof typeof TRAFFIC_SOURCES;
  trafficApproximate: boolean;
}
const observation = (annualPassengers: number, trafficSource: AirportTrafficObservation['trafficSource'] = 'atd',
  trafficPeriod = '2025', trafficApproximate = false): AirportTrafficObservation =>
  ({ annualPassengers, trafficSource, trafficPeriod, trafficApproximate });

export const AIRPORT_TRAFFIC: Readonly<Record<string, AirportTrafficObservation>> = {
  PEK: observation(70_742_712, 'caac'), PVG: observation(84_994_548, 'caac'),
  CAN: observation(83_582_952, 'caac'), CKG: observation(50_094_770, 'caac'),
  KMG: observation(49_705_725, 'caac'), XIY: observation(48_535_594, 'caac'),
  CTU: observation(33_518_945, 'caac'), WUH: observation(31_339_277, 'caac'),
  URC: observation(29_179_737, 'caac'), SYX: observation(22_685_734, 'caac'),
  HKG: observation(61_000_000, 'hkg', '2025', true), TPE: observation(47_795_969),
  ICN: observation(74_071_475), NRT: observation(41_196_846), MNL: observation(52_020_551),
  BKK: observation(62_902_056), SIN: observation(69_980_000), CGK: observation(54_940_134),
  DEL: observation(78_148_081), BOM: observation(55_492_394), DXB: observation(95_192_160),
  LHR: observation(84_482_126), CDG: observation(72_029_407), FRA: observation(63_186_114),
  FCO: observation(50_987_924), IST: observation(84_457_421), SVO: observation(43_427_591),
  KEF: observation(8_100_000, 'kef', '2025', true),
  CAI: observation(31_137_557), JNB: observation(19_735_437), CPT: observation(11_113_490),
  NBO: observation(8_996_281), ADD: observation(13_134_076), LOS: observation(7_468_125),
  CMN: observation(11_456_284), LAX: observation(73_709_594), JFK: observation(62_629_455),
  YVR: observation(26_913_561), HNL: observation(22_115_182),
  ANC: observation(5_500_000, 'anc', '2024', true),
  GRU: observation(47_174_529), SCL: observation(26_512_000), LIM: observation(25_496_109),
  EZE: observation(12_002_179), BOG: observation(45_464_526), MEX: observation(44_605_800),
  SYD: observation(43_669_583), PER: observation(18_026_000, 'per', '2025', true),
  AKL: observation(18_700_000, 'akl', '2024/25 FY', true),
  NAN: observation(2_900_000, 'nan', '2024', true),
};

/** Gameplay tiers, not real runway certification or administrative city levels. */
export const airportStars = (annualPassengers: number): 1 | 2 | 3 =>
  annualPassengers >= 40_000_000 ? 3 : annualPassengers >= 10_000_000 ? 2 : 1;
/** Compress throughput to playable queues, anchored to Beijing's 18 base orders. */
export const baseDemand = (annualPassengers: number) =>
  Math.max(6, Math.min(24, Math.round(18 * Math.sqrt(annualPassengers / AIRPORT_TRAFFIC.PEK!.annualPassengers))));

export function airportScale(id: string) {
  const data = AIRPORT_TRAFFIC[id];
  if (!data) throw new Error(`机场缺少客流资料：${id}`);
  return { ...data, stars: airportStars(data.annualPassengers), baseDemand: baseDemand(data.annualPassengers) };
}
