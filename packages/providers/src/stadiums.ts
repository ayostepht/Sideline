export type Roof = "outdoors" | "dome" | "closed" | "open" | "retractable";

export interface StadiumLocation {
  name: string;
  lat: number;
  lon: number;
  /** Fallback only. The schedule's per-game `roof` wins (it reflects roof status for that game). */
  roof: Roof;
}

/** Home stadium per team, keyed by Sleeper/schedule team code (LAR, not LA). */
export const TEAM_STADIUMS: Readonly<Record<string, StadiumLocation>> = {
  ARI: { name: "State Farm Stadium", lat: 33.5276, lon: -112.2626, roof: "retractable" },
  ATL: { name: "Mercedes-Benz Stadium", lat: 33.7554, lon: -84.4008, roof: "retractable" },
  BAL: { name: "M&T Bank Stadium", lat: 39.278, lon: -76.6227, roof: "outdoors" },
  BUF: { name: "Highmark Stadium", lat: 42.7738, lon: -78.787, roof: "outdoors" },
  CAR: { name: "Bank of America Stadium", lat: 35.2258, lon: -80.8528, roof: "outdoors" },
  CHI: { name: "Soldier Field", lat: 41.8623, lon: -87.6167, roof: "outdoors" },
  CIN: { name: "Paycor Stadium", lat: 39.0954, lon: -84.516, roof: "outdoors" },
  CLE: { name: "Huntington Bank Field", lat: 41.506, lon: -81.6995, roof: "outdoors" },
  DAL: { name: "AT&T Stadium", lat: 32.7473, lon: -97.0945, roof: "retractable" },
  DEN: { name: "Empower Field at Mile High", lat: 39.7439, lon: -105.0201, roof: "outdoors" },
  DET: { name: "Ford Field", lat: 42.34, lon: -83.0456, roof: "dome" },
  GB: { name: "Lambeau Field", lat: 44.5013, lon: -88.0622, roof: "outdoors" },
  HOU: { name: "NRG Stadium", lat: 29.6847, lon: -95.4107, roof: "retractable" },
  IND: { name: "Lucas Oil Stadium", lat: 39.7601, lon: -86.1639, roof: "retractable" },
  JAX: { name: "EverBank Stadium", lat: 30.3239, lon: -81.6373, roof: "outdoors" },
  KC: { name: "GEHA Field at Arrowhead Stadium", lat: 39.0489, lon: -94.4839, roof: "outdoors" },
  LAC: { name: "SoFi Stadium", lat: 33.9535, lon: -118.3392, roof: "dome" },
  LAR: { name: "SoFi Stadium", lat: 33.9535, lon: -118.3392, roof: "dome" },
  LV: { name: "Allegiant Stadium", lat: 36.0909, lon: -115.1833, roof: "dome" },
  MIA: { name: "Hard Rock Stadium", lat: 25.958, lon: -80.2389, roof: "outdoors" },
  MIN: { name: "U.S. Bank Stadium", lat: 44.9737, lon: -93.2577, roof: "dome" },
  NE: { name: "Gillette Stadium", lat: 42.0909, lon: -71.2643, roof: "outdoors" },
  NO: { name: "Caesars Superdome", lat: 29.9511, lon: -90.0812, roof: "dome" },
  NYG: { name: "MetLife Stadium", lat: 40.8135, lon: -74.0745, roof: "outdoors" },
  NYJ: { name: "MetLife Stadium", lat: 40.8135, lon: -74.0745, roof: "outdoors" },
  PHI: { name: "Lincoln Financial Field", lat: 39.9008, lon: -75.1675, roof: "outdoors" },
  PIT: { name: "Acrisure Stadium", lat: 40.4468, lon: -80.0158, roof: "outdoors" },
  SEA: { name: "Lumen Field", lat: 47.5952, lon: -122.3316, roof: "outdoors" },
  SF: { name: "Levi's Stadium", lat: 37.4033, lon: -121.9694, roof: "outdoors" },
  TB: { name: "Raymond James Stadium", lat: 27.9759, lon: -82.5033, roof: "outdoors" },
  TEN: { name: "Nissan Stadium", lat: 36.1665, lon: -86.7713, roof: "outdoors" },
  WAS: { name: "Northwest Stadium", lat: 38.9076, lon: -76.8645, roof: "outdoors" },
};

/**
 * nflverse `stadium_id` for neutral and international venues (seen in games.csv 2022 to 2026).
 * Caveat: nflverse reuses the home team's id for some London games (for example JAX00), so those
 * resolve to the home stadium via `stadiumId` or the team fallback; there is no way to tell them apart.
 */
export const INTERNATIONAL_STADIUMS: Readonly<Record<string, StadiumLocation>> = {
  LON00: { name: "Wembley Stadium", lat: 51.556, lon: -0.2796, roof: "outdoors" },
  LON01: { name: "Twickenham Stadium", lat: 51.4559, lon: -0.3415, roof: "outdoors" },
  LON02: { name: "Tottenham Hotspur Stadium", lat: 51.6043, lon: -0.0663, roof: "retractable" },
  GER00: { name: "Allianz Arena", lat: 48.2188, lon: 11.6247, roof: "outdoors" },
  MUN01: { name: "FC Bayern Munich Stadium", lat: 48.2188, lon: 11.6247, roof: "outdoors" },
  FRA00: { name: "Deutsche Bank Park", lat: 50.0686, lon: 8.6455, roof: "outdoors" },
  MEX00: { name: "Estadio Banorte", lat: 19.3029, lon: -99.1505, roof: "outdoors" },
  SAO00: { name: "Arena Corinthians", lat: -23.5453, lon: -46.4742, roof: "outdoors" },
  RIO00: { name: "Maracana Stadium", lat: -22.9122, lon: -43.2302, roof: "outdoors" },
  MAD01: { name: "Santiago Bernabeu", lat: 40.453, lon: -3.6883, roof: "retractable" },
  MEL00: { name: "Melbourne Cricket Ground", lat: -37.82, lon: 144.9834, roof: "outdoors" },
  PAR00: { name: "Stade de France", lat: 48.9245, lon: 2.3601, roof: "outdoors" },
};

/** nflverse `stadium_id` match first, else the home team's stadium; null when neither is known. */
export function stadiumLocation(args: {
  home: string;
  stadiumId?: string | null;
}): StadiumLocation | null {
  if (args.stadiumId) {
    const hit = INTERNATIONAL_STADIUMS[args.stadiumId];
    if (hit) return hit;
  }
  return TEAM_STADIUMS[args.home] ?? null;
}
