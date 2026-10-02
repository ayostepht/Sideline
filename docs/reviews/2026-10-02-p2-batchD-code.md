# Code review: Phase 2 Batch D (T2.3c pages, T2.3b onboarding and Settings)

Date: 2026-10-02 | Reviewer: code-reviewer | Diff: `41fd0c1..9490c57 -- apps/web`, 25 files

VERDICT: CHANGES REQUIRED. 0 Blocker, 3 Major, 9 Minor, 2 Nit. `vitest run apps/web`: 16 files, 131 tests passed. Ownership clean; server components only call `lib/server`; `now` comes from the server; no `dangerouslySetInnerHTML`, no `any`.

## Findings

| ID | Sev | Where | Problem and failure scenario | Fix | Routed to |
|---|---|---|---|---|---|
| M1 | Major | onboarding-flow.tsx:229, first-sync.tsx:516, lib/client/onboarding.ts:62-63 | First-sync completion compares the browser clock (`Date.now() - 2000`) with the worker's `finishedAt`. A phone 2+ s ahead of the server never sees completion (120 s wait then "taking longer"). A phone behind it counts the previous league's old runs and lands on Home before the new data exists | `POST /api/onboarding/league` returns a server-side `syncSince` (the requested-at of the queued or reused `all`, or null when no sync was needed); the client compares against that | T2.2e (backend), then T2.3b-fix (frontend) |
| M2 | Major | onboarding-flow.tsx:239 | The client ignores `sync: "rate_limited" \| "pending_reused"`. Re-selecting the active league runs no new sync, so the first-sync view waits the full 120 s | Read `sync`; treat `rate_limited` as already synced (go to Home); `pending_reused` waits on that request | T2.3b-fix |
| M3 | Major | onboarding-flow.tsx:175-202 | The status poll has no ceiling and swallows errors: repeated 5xx or a worker that dies mid-job leaves "Looking up your Sleeper account..." forever | Client deadline (for example 90 s) or N consecutive failures leads to the failed or offline view with Try again | T2.3b-fix |
| m1 | Minor | onboarding/_components/api.ts:622 and call sites | Responses cast `json as T` with no zod parse; a malformed `ready` payload crashes the tree | Parse with the shared schemas; `ok:false` on parse failure | T2.3b-fix |
| m2 | Minor | settings-sections.tsx:77-92 | "Change username" with the same username lands on "You're set up" instead of a restart | Disable Change when unchanged | T2.3b-fix |
| m3 | Minor | onboarding-flow.tsx:226-240 | "Use a different username" isn't disabled while selecting a league; the response yanks the user back to sync | Disable while pending, or a request token | T2.3b-fix |
| m4 | Minor | settings-sections.tsx:104-108 | After a league switch, Settings shows the raw league id and other tabs show the DB error state; `sync` result ignored | Route to the onboarding sync view (or the "Still syncing" state) after a switch | T2.3b-fix |
| m5 | Minor | sync-section.tsx:131 | The `role="status"` text changes every second during the 429 countdown | Static live text; visual-only countdown | T2.3b-fix |
| m6 | Minor | first-sync.tsx:559-565 | A failed job still shows "Pulling in your league..." until the timeout | Show the failure and stop polling early | T2.3b-fix |
| m7 | Minor | onboarding/page.tsx:659 | A bare `catch {}` treats any DB error as a first run (safe for unmigrated; a locked or corrupt DB shows the username form) | Swallow only "no such table"; otherwise DbError | T2.3b-fix |
| m8 | Minor | onboarding-flow.tsx:277, first-sync.tsx:554 | Live regions mount together with their text, so the first message may not be announced | Always-present live container | T2.3b-fix |
| m9 | Minor | team/page.tsx:21, league/teams/[rosterId]/page.tsx:23 | An unknown `leagueId` renders the DB error state instead of `notFound()` | `notFound()` on `not_found` | T2.3b-fix |
| n1 | Nit | format.test.ts, onboarding.test.ts | No test for clock skew or a failed run with null `finishedAt` | Add with M1 | T2.3b-fix |
| n2 | Nit | settings sync poll | Polls every 3 s while the tab is hidden; unbounded if the worker is offline | Pause when hidden; ceiling | T2.3b-fix |

## Checked and OK

- **Phase handling:** `stepForPhase` and `viewForStatus` cover all six phases; terminal phases stop the poll.
- **Effects and timers:** effects abort and clear timers on unmount; no double navigation; the Retry-After parse has a fallback; Settings polls only while busy.
- **Page logic:** rosterId check plus `notFound()`; bounded `parseWeek`; `highlight` checked against the roster; preseason, empty slots, unknown players and bye logic handled.
- **Accessibility:** one h1 per page; focus moves to the step heading; radio cards use fieldset and legend plus a check icon; "You" is a text badge; standings use a table at `lg` and cards below, with scoped headers.
