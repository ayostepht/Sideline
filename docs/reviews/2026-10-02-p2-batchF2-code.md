# Code review: Phase 2 Batch F closeout (T2.6d)

Date: 2026-10-02 | Reviewer: code-reviewer | Diff: `976a355..HEAD -- apps/web` (commits 05d379e, d5d52f4, bdca45e; d8fa529 is test-only, outside apps/web), 42 files, 691 insertions / 209 deletions

VERDICT: CHANGES REQUIRED (one Major, fixed by the orchestrator same session, see below). All six prior-review items (M1, m1-m5, n1) confirmed resolved.

## Findings

| ID | Sev | Where | Problem and failure scenario | Fix | Status |
|---|---|---|---|---|---|
| M1 | Major | `apps/web/app/l/[leagueId]/team/page.tsx` + sibling `loading.tsx` | `team/page.tsx` ("My Team") calls `notFound()` when the league overview resolves `not_found`, but still had its own `loading.tsx`, the same soft-404 conflict ADR-009 item 18 fixed for team detail in T2.6b. Visiting `/l/{leagueId}/team` for an unknown leagueId streamed a 200 instead of a real 404. Pre-existing since fbc6204 (T2.3c), not introduced by Batch F, but live and exactly the bug class this closeout round targeted. | Remove `team/loading.tsx` (mirrors team detail, which has no loading boundary) | **Fixed by orchestrator**, commit 887dc00; verified with `pnpm verify` (710 tests) and `pnpm exec playwright test e2e/pages.spec.ts` (41/42 passed, only the known TEAM-3 flake failed, unrelated) |
| m1 | Minor | `lib/client/nav.ts` `resolvePendingAfterUrlChange`, `week-selector.tsx` | Prior review: week-ref resync race on stacked clicks | RESOLVED — traced through the repro in `nav.test.ts` and by hand for several interleavings; `pending` only clears when the confirmed URL week matches the exact held target | Confirmed |
| m2 | Minor | `sync-now-button.tsx` | Prior review: no refresh after Sync now | RESOLVED — `router.refresh()` after 2s, cleaned up via effect return, cannot leak past unmount. Accepted trade-off: a same-page refresh could shift content if the user is mid-interaction elsewhere; this was the explicit remedy requested | Confirmed |
| m3 | Minor | `sync-section.tsx` cooldown copy | Prior review: said "a few minutes", debounce is 60s | RESOLVED — "about a minute" matches `REQUIRED_DEBOUNCE_MS` in `lib/server/sync.ts` exactly | Confirmed |
| m4 | Minor | `sync-section.tsx` `syncSummary` | Prior review: running-with-no-success counted as up to date; NaN/RangeError on malformed dates; "0 of 0" | RESOLVED — empty case returns "No sync data yet." before `Math.max`; NaN parses filtered; running only counts with a prior success. `sync-section.test.ts` exercises every branch | Confirmed |
| m5 | Minor | `lib/client/api.ts`, schemas layering | Prior review: shared lib importing from an app route's private folder | RESOLVED — `schemas.ts` moved to `lib/client/`; no remaining references to the old path | Confirmed |
| n1 | Nit | `sync-now-button.tsx`, Retry-After testing | Prior review: only `waitMinutes` tested | RESOLVED — `retryAfterSeconds(headers, nowMs)` extracted and tested for integer-seconds, HTTP-date, missing-header, garbage-value | Confirmed |
| n2 | Nit | `docs/DECISIONS.md` ADR-009 item 18 | ADR text claimed the gap was isolated to team detail, missing My Team | **Fixed by orchestrator** alongside M1 — ADR-009 item 18 amended to name both pages | Confirmed |

## Checked and OK

- File ownership: all 42 changed files fall under `apps/web/app/` (excl. `app/api/`), `apps/web/components/`, or `apps/web/lib/client/` — no violations.
- `pnpm --filter web vitest run`: 18 files, 162 tests passed (at review time; full repo count 710 after team/loading.tsx fix).
- `pnpm --filter web typecheck`, `eslint apps/web --quiet`: clean.
- No new `: any`, `as any`, bare non-null assertions, or `dangerouslySetInnerHTML` introduced.
- `m6` (every StaleBanner renders Sync now; duplicate test id risk) correctly left in the backlog, unchanged, per the prior review's instruction.

## Orchestrator follow-up

- Removed `apps/web/app/l/[leagueId]/team/loading.tsx` (commit 887dc00), amended ADR-009 item 18 (same commit).
- Dispatched qa-engineer to add `MYTEAM-3` e2e coverage for the fix (commit 7e00c00): `/l/{unknownLeagueId}/team` returns a real 404. Verified by the orchestrator independently (30/30 clean at `--repeat-each=10`).
