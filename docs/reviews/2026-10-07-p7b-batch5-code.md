# Code review: Phase 7b Batch 4c and Batch 5

Date: 2026-10-07 | Diff: `8fc0ddb..af9c331` (docs excluded, 52 files) | Reviewer: code-reviewer (static read)
VERDICT: CHANGES REQUIRED (3 Major)

## Major
- **M1** `scripts/fixtures/leak-check.ts` `stripAllowedUrls`: no trailing boundary after the handle, and only the prefix is removed, so `github.com/<handle>tanner` strips to `tanner` and a real longer identifier starting with the handle can be hidden. Privacy gate false negative. Fix: `(?![A-Za-z0-9_-])` after the handle (or exact-token match), replace with a space, tests for handle-prefixed names. Routed to P7b.13d (sleeper-data).
- **M2** `apps/web/components/player-modal.tsx` (~55): the intercepting-route modal renders null until the dialog chunk loads (dead-looking tap on a cold load), and a rejected dynamic import leaves it blank forever; no `.catch` in any lazy component. Fix: aria-busy placeholder while loading; on import failure fall back to a full navigation to the player page; test the rejection path. Routed to P7b.14f.
- **M3** `apps/web/components/info-popover.tsx` (~58-62): a tap before the chunk loads is lost (WhySheet replays it, InfoPopover doesn't), and the placeholder-to-impl swap remounts the button so keyboard focus is lost. Fix: replay via `defaultOpen`, keep one host element. Routed to P7b.14f.

## Minor
- **m1** `why-sheet.tsx` (~96-110): pre-load tap replaces the trigger's own `onClick`; controlled mode ignores the replayed tap; trigger remount loses focus. P7b.14f.
- **m2** `weather.tsx` `kindFromLabel`: icon inferred from label text (fragile; unknown wording falls to "cold"); `key={c.label}` may collide. Derive the kind from structured `weather.flags` instead. P7b.14f.
- **m3** `apps/web/lib/server/trades.perf.test.ts:73-74` absolute wall-clock bounds may flake on loaded CI. Backlog.
- **m4** `packages/core/src/trade/finder.ts` `candidates`: multi-position players pooled under the alphabetically first surplus position. Backlog.
- **m5** `scripts/lib/stale-build.ts` counts test files as source (conservative false "stale"). Backlog.

## Nit
- **n1** `weather-thresholds.test.ts` could compare key sets. Backlog.

## Verified OK
Finder exclusion, ranking total order, `capBySets`; mirrored trade constant test; image skipping keeps path checks; screens clock and stale-build check; `getAllTeamRosters` single pass; E2E_PORT offsets consistent, `info.ts` waits on a real readiness signal; no skip/only/timeouts; weather chips server-rendered; lazy caches SSR-safe.
