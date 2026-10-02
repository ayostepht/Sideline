# Code review: Phase 2 Batch F (T2.6a, T2.6b fix round)

Date: 2026-10-02 | Reviewer: code-reviewer | Diff: `976a355..d5d52f4 -- apps/web`, 35 files

VERDICT: CHANGES REQUIRED. 0 Blocker, 1 Major, 6 Minor, 1 Nit. `vitest run apps/web`: 17 files, 145 tests passed. Ownership clean.

## Findings

| ID | Sev | Where | Problem and failure scenario | Fix (orchestrator decision in italics) | Routed to |
|---|---|---|---|---|---|
| M1 | Major | team detail, settings, stub pages | Moving loading boundaries into `(main)` and `league/(list)` left team detail, Settings and the four stubs with no loading boundary: no feedback on a slow navigation | *Accept for team detail (a real 404 is worth it), logged in DECISIONS.* Give Settings and the stubs their own boundary (route group with `loading.tsx`); team detail may show a client pending indicator | T2.6d |
| m1 | Minor | week-selector.tsx:19-22 | The effect resyncing the ref to the URL week can overwrite a newer click (4, Next, Next, URL commits 5, ref reset to 5, third click lands on 6) | Resync only when no navigation is pending, or only when `week === requested.current` | T2.6d |
| m2 | Minor | sync-now-button.tsx | After "Sync started" nothing refreshes; the banner keeps old data | `router.refresh()` after the sync finishes (poll `/api/sync/status`) or after a short delay | T2.6d |
| m3 | Minor | sync-section.tsx cooldown copy | Says "a few minutes"; the server debounce is 60 s | "about a minute" | T2.6d |
| m4 | Minor | sync-section.tsx `syncSummary` | Running with no success counts as up to date; empty list gives "0 of 0"; unparseable time gives NaN and a RangeError; untested | Count running only with a prior success; guard NaN and empty; unit tests for failed, stale, never, running, empty | T2.6d |
| m5 | Minor | lib/client/api.ts | Shared client lib imports from `app/onboarding/_components/schemas` (inverted layering) | Move `schemas.ts` to `lib/client/` | T2.6d |
| m6 | Minor | stale-banner.tsx:35 | Every banner renders Sync now (test id would duplicate with two banners); bare fallback div may shift layout | Backlog | Backlog |
| n1 | Nit | sync-now-button.test.ts | Only `waitMinutes` tested; Retry-After and state transitions not | Extract and test `retryAfterSeconds(headers)` | T2.6d |

## Checked and OK

- Retry-After parses integers and HTTP dates, clamps at 1, falls back to 60 (matches the debounce). Request body matches `SyncRunRequestBodySchema`. Live region always mounted.
- `notFound()` for an unknown rosterId returns 404; `app/error.tsx`, `[leagueId]/error.tsx` and the layout DB-error catch unaffected; route groups keep URLs and import depths.
- Settings job state precedence running, failed, never, stale, ok; each state has icon plus text.
- Home `starterIssues` reuses `issueReason`; highlight link encoded; 44 px rows.
- InjuryBadge aria-label includes detail; highlighted row has border, tag and sr-only prefix; More sheet `aria-current` plus a visible bar; disabled Button reason via `aria-describedby`; Rosters hidden with `hidden lg:flex`.
- No `dangerouslySetInnerHTML`; names render as text; SyncNowButton lazy.
