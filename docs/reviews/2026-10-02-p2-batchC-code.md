# Code review: Phase 2 Batch C part 1 (T2.2b-fix, T2.1c, getLeagueChoices, T2.3a, T2.0b-fix2)

Date: 2026-10-02 | Reviewer: code-reviewer | Diff: `a5e32da..494e0bd` (docs and e2e excluded), 51 files

VERDICT: CHANGES REQUIRED. 0 Blocker, 2 Major, 5 Minor, 1 Nit. `vitest run apps scripts packages`: 65 files, 628 tests passed.

## Findings

| ID | Sev | Where | Problem and failure scenario | Fix | Routed to |
|---|---|---|---|---|---|
| M1 | Major | apps/web/app/page.tsx:30, app/l/[leagueId]/layout.tsx:29, app/not-found.tsx | `/` redirects to `/l/{active}` whenever an active league is set, and the layout calls `notFound()` when the league row is missing. Right after choosing a league (sync not done, failed, or worker offline), or after a DB reset, the user lands on a 404 whose "Go home" link loops back to the same 404 | Redirect to `/l/{id}` only when the league row exists, otherwise to `/onboarding` (which shows sync progress); in the layout, show a "Still syncing this league" state for the active league instead of `notFound()` | T2.3a-fix |
| M2 | Major | app/l/[leagueId]/layout.tsx:26-35, error.tsx | A segment's `error.tsx` doesn't catch errors thrown by its own layout. The overview and league-choice reads aren't wrapped, and there is no `app/error.tsx`, so a DB read error (unmigrated, locked) shows Next's bare error page | Wrap the layout reads and render the DB error state; add `app/error.tsx` using `retry` | T2.3a-fix |
| m1 | Minor | components/shell/search-dialog.tsx:84-89 | Selecting a result closes without resetting the query, so reopening shows stale results | Reset query and state on close | T2.3a-fix |
| m2 | Minor | components/shell/league-switcher.tsx:34-61, app-shell.tsx:63-100 | The sidebar and mobile header both render the switcher and search trigger (hidden by CSS), duplicating `data-testid`s | Distinct test ids per variant | T2.3a-fix |
| m3 | Minor | components/shell/league-menu.tsx:41-48 | A league switch always lands on Home, dropping the current section and week | Keep the current section (and week) when switching | T2.3a-fix |
| m4 | Minor | apps/web/lib/server/sync.ts:~130 | `.get() as { id: number } \| undefined` is an unvalidated cast | Typed helper or zod parse | T2.2b-fix2 |
| m5 | Minor | apps/web/lib/server/onboarding.ts (startOnboarding) | The active league is cleared only when the previous username was non-null; an env-only setup keeps a stale league after a username change | Clear whenever the username differs from the stored one (the env-seeded first run is the exception: the first username equal to `SLEEPER_USERNAME` keeps `DEFAULT_LEAGUE_ID`) | T2.2b-fix2 |
| n1 | Nit | components/shell/week-selector.tsx | An explicit `?week=` in preseason shows "Week N" | Probably intended | None |

## Confirmed OK

- **Security:** no `dangerouslySetInnerHTML`; hrefs use `encodeURIComponent`; `rosterId` validated; no open redirect.
- **Search:** zod-validated responses, 200 ms debounce, aborts handled.
- **Lazy loading:** cmdk and the overlays are lazy; client components import only shared types; DB access stays server-side.
- **Route sizes:** a wrong decode can't silently under-measure (a missing file throws).
- **Screens:** query slugs are filesystem-safe; the DATA_DIR guard is untouched.
- **Accessibility:** skip link, main focus on route change, `aria-current`, labelled nav, 44 px targets, dialog title and description, non-color active state.
- **Week handling:** clamped to 1 to 18, other params kept, preseason handled.
- **Onboarding fixes:** the error mapping and roster tie-break are correct. `requestSyncForLeagueChange` is correct (immediate transaction, pending reuse, debounce skipped only on change).
