import type { Reason } from "@sideline/shared";

export const GALLERY_NOW = Date.parse("2026-10-02T12:00:00Z");
export const ago = (min: number) => new Date(GALLERY_NOW - min * 60_000).toISOString();

export const FEW_REASONS: Reason[] = [
  { code: "matchup", label: "Soft matchup", value: "A", impact: 1.4 },
  { code: "injury", label: "Teammate out", impact: 0.9 },
];
export const MANY_REASONS: Reason[] = [
  { code: "matchup", label: "Soft matchup", value: "A", impact: 1.4 },
  { code: "trend", label: "Scoring up over 3 weeks", value: "+3.2", impact: 0.9 },
  { code: "weather", label: "Wind over 20 mph", impact: -1.1 },
  { code: "inj", label: "Listed questionable", impact: -2.3 },
  { code: "snap", label: "Snap share", value: "78%" },
  {
    code: "long",
    label: "A very long reason label that has to wrap or truncate cleanly on a phone screen",
    value: 12.5,
    impact: -0.4,
  },
];
