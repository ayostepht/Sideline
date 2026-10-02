export const POSITION_KEYS = [
  "QB",
  "RB",
  "WR",
  "TE",
  "K",
  "DEF",
  "DL",
  "LB",
  "DB",
  "FLEX",
] as const;
export type PositionKey = (typeof POSITION_KEYS)[number];

const ALIASES: Record<string, PositionKey> = {
  DST: "DEF",
  D: "DEF",
  PK: "K",
  DE: "DL",
  DT: "DL",
  OLB: "LB",
  ILB: "LB",
  MLB: "LB",
  CB: "DB",
  S: "DB",
  SS: "DB",
  FS: "DB",
};

/** Maps a raw position string to a display key. Unknown or empty values fall back to FLEX. */
export function normalizePosition(raw: string | null | undefined): PositionKey {
  const upper = (raw ?? "").trim().toUpperCase();
  if ((POSITION_KEYS as readonly string[]).includes(upper)) return upper as PositionKey;
  return ALIASES[upper] ?? "FLEX";
}

export const POSITION_CLASS: Record<PositionKey, string> = {
  QB: "bg-pos-qb",
  RB: "bg-pos-rb",
  WR: "bg-pos-wr",
  TE: "bg-pos-te",
  // K is an outline badge, DEF is the neon purple fill with black text (5.6:1), so WR, K and DEF differ.
  K: "bg-transparent text-foreground ring-1 ring-inset ring-foreground",
  DEF: "bg-highlight text-highlight-foreground",
  DL: "bg-pos-dl",
  LB: "bg-pos-lb",
  DB: "bg-pos-db",
  FLEX: "bg-pos-flex",
};

export function positionClass(key: PositionKey): string {
  return POSITION_CLASS[key];
}
