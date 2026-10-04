import type { LeagueIntelligenceHeatmapEntry } from "@sideline/shared";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { POSITION_KEYS } from "./position";
import { PositionBadge } from "./position-badge";

/**
 * LEAGUE-4 (T5.5b): positional strength heatmap, one row per team and one column per roster
 * position, each cell showing a team's rest-of-season projected total at that position versus the
 * league median. No charting library exists in this codebase (checked `apps/web/package.json`):
 * this is a plain, dependency-free `<table>`, which doubles as its own accessible alternative
 * (WCAG: a table IS the accessible form, no separate summary needed). Color intensity is a
 * secondary cue only -- every cell always shows its numeric delta and a direction icon too, so a
 * colorblind user or a grayscale screenshot still gets the full signal (CLAUDE.md section 8).
 *
 * UX fix round (post-d05ad4b): a real axe run (`pnpm test:a11y`) flagged the horizontally
 * scrollable `<table>` wrapper as a `scrollable-region-focusable` serious violation at 390px on
 * mobile-iphone and mobile-pixel, because at that width TE/K/DEF/FLEX sit past the fold with no
 * keyboard path and no visible scroll affordance. Rather than bolt a scroll hint onto the table,
 * this follows the house convention already used by `players-list.tsx` and `waiver-board.tsx`
 * (table, `StandingsList`): hide the `<table>` below `lg` and render one card per team instead, so
 * every position is visible without any scrolling at all at narrow widths. The table (unchanged
 * markup) still ships at `lg` and up, where every column already fits.
 */

export interface PositionalStrengthGridTeam {
  rosterId: number;
  teamName: string;
}

export interface PositionalStrengthGridProps {
  teams: readonly PositionalStrengthGridTeam[];
  entries: readonly LeagueIntelligenceHeatmapEntry[];
  className?: string;
}

type Tone = "strong-up" | "up" | "neutral" | "down" | "strong-down";

function toneFor(entry: LeagueIntelligenceHeatmapEntry): Tone {
  const { ratio, delta } = entry;
  if (ratio === null) {
    return delta > 0 ? "up" : delta < 0 ? "down" : "neutral";
  }
  if (ratio >= 1.15) return "strong-up";
  if (ratio > 1.0) return "up";
  if (ratio === 1.0) return "neutral";
  if (ratio >= 0.85) return "down";
  return "strong-down";
}

const TONE_BG: Record<Tone, string> = {
  "strong-up": "bg-positive-soft",
  up: "bg-positive-soft/50",
  neutral: "",
  down: "bg-negative-soft/50",
  "strong-down": "bg-negative-soft",
};

const TONE_TEXT: Record<Tone, string> = {
  "strong-up": "text-positive",
  up: "text-positive",
  neutral: "text-muted-foreground",
  down: "text-negative",
  "strong-down": "text-negative",
};

function formatDelta(delta: number): string {
  const abs = Math.abs(delta).toFixed(1);
  return delta > 0 ? `+${abs}` : delta < 0 ? `-${abs}` : abs;
}

/** Canonical column order (`POSITION_KEYS`), then any unrecognized raw position strings appended
 * alphabetically so nothing silently disappears from the grid. */
function orderedPositions(entries: readonly LeagueIntelligenceHeatmapEntry[]): string[] {
  const raw = new Set(entries.map((e) => e.position));
  const known = POSITION_KEYS.filter((k) => raw.has(k));
  const unknown = [...raw].filter((p) => !(POSITION_KEYS as readonly string[]).includes(p)).sort();
  return [...known, ...unknown];
}

export function PositionalStrengthGrid({ teams, entries, className }: PositionalStrengthGridProps) {
  const positions = orderedPositions(entries);
  const cellMap = new Map<string, LeagueIntelligenceHeatmapEntry>();
  for (const e of entries) cellMap.set(`${e.rosterId}:${e.position}`, e);

  if (teams.length === 0 || positions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="positional-strength-grid-empty">
        No positional data yet.
      </p>
    );
  }

  return (
    <div className={className}>
      <ul
        className="mb-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground"
        aria-hidden
      >
        <li className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm bg-positive-soft" /> Above median
        </li>
        <li className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm bg-muted" /> Near median
        </li>
        <li className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm bg-negative-soft" /> Below median
        </li>
      </ul>
      <PositionalStrengthCards teams={teams} positions={positions} cellMap={cellMap} />

      {/* [contain:layout] stops the table's intrinsic width (wider than the viewport at 390px)
          from leaking into the document's scrollable area: without it Chromium still grows
          document.documentElement.scrollWidth even though overflow-x-auto visually clips and
          scrolls the table correctly on its own. Hidden below `lg`: see the module doc, this is
          the house "table on desktop, cards on mobile" convention, which sidesteps the
          scrollable-region-focusable axe violation entirely instead of patching around it.
          `tabIndex`/`role`/`aria-label` stay on the wrapper anyway as defense in depth, in case a
          very wide roster (extra IDP slots) still overflows at `lg`. */}
      <div
        className="hidden overflow-x-auto rounded-card border [contain:layout] lg:block"
        tabIndex={0}
        role="region"
        aria-label="Positional strength table, scroll right for more positions"
      >
        <table className="w-full text-sm" data-testid="positional-strength-grid">
          <caption className="sr-only">
            Positional strength: each team&apos;s projected points at each position versus the
            league median, with the numeric difference
          </caption>
          <thead className="border-b bg-muted">
            <tr>
              <th scope="col" className="sl-label sticky left-0 z-10 bg-muted px-3 py-2 text-left">
                Team
              </th>
              {positions.map((p) => (
                <th key={p} scope="col" className="px-2 py-2 text-center">
                  <PositionBadge position={p} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {teams.map((team) => (
              <tr key={team.rosterId} data-testid="positional-strength-grid-row">
                <th
                  scope="row"
                  className="sticky left-0 z-10 max-w-[9rem] truncate bg-card px-3 py-1.5 text-left font-bold"
                  title={team.teamName}
                >
                  {team.teamName}
                </th>
                {positions.map((p) => {
                  const entry = cellMap.get(`${team.rosterId}:${p}`);
                  if (entry === undefined) {
                    return (
                      <td key={p} className="px-2 py-1.5 text-center text-muted-foreground">
                        <span aria-hidden>-</span>
                        <span className="sr-only">No data</span>
                      </td>
                    );
                  }
                  const tone = toneFor(entry);
                  const Icon = tone === "neutral" ? Minus : entry.delta > 0 ? ArrowUp : ArrowDown;
                  return (
                    <td
                      key={p}
                      className={`px-2 py-1.5 text-center tabular-nums ${TONE_BG[tone]}`}
                      data-testid="positional-strength-grid-cell"
                    >
                      <span className="block font-bold">{entry.value.toFixed(1)}</span>
                      <span
                        className={`inline-flex items-center gap-0.5 text-xs ${TONE_TEXT[tone]}`}
                      >
                        <Icon className="size-3" aria-hidden />
                        <span className="sr-only">vs league median</span>
                        {formatDelta(entry.delta)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** One card per team, below `lg`: every position renders in a wrapping grid, so nothing needs
 * scrolling to be reached (see the module doc for why this replaced a scrollable table here). */
function PositionalStrengthCards({
  teams,
  positions,
  cellMap,
}: {
  teams: readonly PositionalStrengthGridTeam[];
  positions: readonly string[];
  cellMap: ReadonlyMap<string, LeagueIntelligenceHeatmapEntry>;
}) {
  return (
    <ol
      className="flex flex-col gap-2 lg:hidden"
      data-testid="positional-strength-grid-cards"
      aria-label="Positional strength by team"
    >
      {teams.map((team) => (
        <li
          key={team.rosterId}
          className="rounded-card border bg-card p-3"
          data-testid="positional-strength-grid-row"
        >
          <p className="mb-2 truncate text-sm font-bold" title={team.teamName}>
            {team.teamName}
          </p>
          <div className="grid grid-cols-3 gap-1.5 min-[480px]:grid-cols-4">
            {positions.map((p) => {
              const entry = cellMap.get(`${team.rosterId}:${p}`);
              if (entry === undefined) {
                return (
                  <div
                    key={p}
                    className="flex flex-col items-center gap-1 rounded-control px-1.5 py-1.5 text-muted-foreground"
                  >
                    <PositionBadge position={p} />
                    <span aria-hidden>-</span>
                    <span className="sr-only">No data</span>
                  </div>
                );
              }
              const tone = toneFor(entry);
              const Icon = tone === "neutral" ? Minus : entry.delta > 0 ? ArrowUp : ArrowDown;
              return (
                <div
                  key={p}
                  className={`flex flex-col items-center gap-1 rounded-control px-1.5 py-1.5 tabular-nums ${TONE_BG[tone]}`}
                  data-testid="positional-strength-grid-cell"
                >
                  <PositionBadge position={p} />
                  <span className="font-bold">{entry.value.toFixed(1)}</span>
                  <span className={`inline-flex items-center gap-0.5 text-xs ${TONE_TEXT[tone]}`}>
                    <Icon className="size-3" aria-hidden />
                    <span className="sr-only">vs league median</span>
                    {formatDelta(entry.delta)}
                  </span>
                </div>
              );
            })}
          </div>
        </li>
      ))}
    </ol>
  );
}
