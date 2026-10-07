# UX re-check: Phase 7b Trades fixes (P7b.3f, P7b.7g, P7b.10f)

Date: 2026-10-07 | Commit: `552d802` | Reviewer: ux-reviewer | Route: Trades only
VERDICT: APPROVE. Captures at 390/768/1280 light and dark, Finder, Analyzer empty and populated, popovers opened at 390 (scratchpad, not committed).

## Original findings
- M1 FIXED: one Top pick (a Leans them card); no Lopsided cards; 9 suggestions; lime only on the Top pick.
- M2 FIXED: popover triggers 44x44; tap opens, Escape closes.
- M3 FIXED: shell in DOM at 64 ms warm (884 ms cold); Finder done by about 0.6 s warm (1.4 s cold); no timeouts.
- m1 FIXED: aligned Before/After/Change grids, tabular numbers, arrows (no drops in the fixture to confirm the down arrow visually; covered by unit tests).
- m2 FIXED: removable selection chips with "(2 of 3)"; no nested scroll at 390.
- m3 FIXED: actions on one row, 44px Open in Analyzer, team name once per card.
No horizontal scroll at any width.

## New
- **m4** Minor, Finder 390/768: many cards share the same give set (4 of 9 give Wicks or Metcalf). Fix in core: cap suggestions per give set (e.g. 2). Routed to P7b.3g.
- **m5** Minor, Analyzer 1280: "Your team" header taller than "Team 03" (info icon row), so the grids misalign. Backlog (frontend).
- **n1** Nit: Leans them and Leans you share one blue hue; text and icon differ, so not color-only.
