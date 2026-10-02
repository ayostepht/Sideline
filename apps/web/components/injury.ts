export type InjuryKey = "questionable" | "doubtful" | "out" | "ir" | "pup" | "suspended" | "na";
export type InjuryTone = "warning" | "negative" | "info";

export interface InjuryInfo {
  key: InjuryKey;
  /** Short visible text. */
  short: string;
  /** Full word for the accessible name. */
  full: string;
  tone: InjuryTone;
}

const INFO: Record<InjuryKey, InjuryInfo> = {
  questionable: { key: "questionable", short: "Q", full: "Questionable", tone: "warning" },
  doubtful: { key: "doubtful", short: "D", full: "Doubtful", tone: "warning" },
  out: { key: "out", short: "Out", full: "Out", tone: "negative" },
  ir: { key: "ir", short: "IR", full: "Injured reserve", tone: "negative" },
  pup: { key: "pup", short: "PUP", full: "Physically unable to perform", tone: "negative" },
  suspended: { key: "suspended", short: "Susp", full: "Suspended", tone: "info" },
  na: { key: "na", short: "NA", full: "Not active", tone: "info" },
};

/** Maps a raw injury status to display info, or null when healthy or unknown. */
export function normalizeInjury(raw: string | null | undefined): InjuryInfo | null {
  const s = (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  switch (s) {
    case "questionable":
    case "q":
      return INFO.questionable;
    case "doubtful":
    case "d":
      return INFO.doubtful;
    case "out":
    case "o":
      return INFO.out;
    case "ir":
    case "injuredreserve":
      return INFO.ir;
    case "pup":
      return INFO.pup;
    case "sus":
    case "suspended":
      return INFO.suspended;
    case "na":
    case "notactive":
      return INFO.na;
    default:
      return null;
  }
}

export const INJURY_KEYS: readonly InjuryKey[] = [
  "questionable",
  "doubtful",
  "out",
  "ir",
  "pup",
  "suspended",
  "na",
];

export function injuryInfo(key: InjuryKey): InjuryInfo {
  return INFO[key];
}
