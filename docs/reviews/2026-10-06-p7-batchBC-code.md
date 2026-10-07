# Code review: Phase 7a Batches B and C

Date: 2026-10-06 | Diff: `5080504..08c76f6` (P7.5b 259506e, P7.4 f6368c2, P7.6a 0c04c89, P7.6b 08c76f6), excluding docs
VERDICT: CHANGES REQUIRED

Batch A findings M1, m1-m6, n1: all confirmed fixed in this diff.

| ID | Sev | Where | Finding | Disposition |
|---|---|---|---|---|
| M1 | Major | `players/_components/news-section.tsx:30`, `lib/server/players.ts` requestPlayerNewsRefresh | Staleness uses only `max(player_news.fetched_at)`; players with no ESPN news always read null, so every open queues an ESPN fetch and the 60-min throttle never applies | P7.8a (backend: `player_news_fetches` attempt marker) then P7.8b (worker records attempts) |
| M2 | Major | `e2e/search.spec.ts:43-64` | SEARCH-3 and the free-agent sheet test assert removed behavior | P7.7 (qa) |
| M3 | Major | `components/shell/app-shell.tsx:~80` | Focus-to-main skipped whenever the previous path was a player path, including full-page (non-modal) views: no focus move on route change (WCAG regression) | P7.8c (frontend): skip only when the modal slot is actually involved |
| m1 | Minor | `lib/server/players.ts` | Raw `COUNT(*)` on `sync_requests` with an `as` cast in the web layer | P7.8a (move to `packages/db`) |
| m2 | Minor | `lib/client/focus-return.ts`, `player-link.tsx` | Trigger remembered on modified (new-tab) clicks; stale trigger focused on a later search-opened pop-up close | P7.8c |
| m3 | Minor | `lib/server/players.ts` weeklyRowsFor | Opponent/bye use the player's current team for all weeks; traded players show wrong past opponents | Backlog (known limit) |
| m4 | Minor | weeklyRowsFor | PERF-1 holds (fixed query count); optional test for `state === null` | Backlog |
| m5 | Minor | `news-section.tsx` | StrictMode dev-only: aborted first POST may still queue, retry returns `queued:false`, no refresh | P7.8c (comment) |
| n1 | Nit | `search-dialog.tsx` | `teamLabel()` computed twice | P7.8c |

Verified OK: bye vs DNP logic; current week only with stats, no hardcoded week; refresh route id regex, guardedWrite, proxy auth, 404s; CSP widened to sleepercdn img-src only; news links sanitized, `rel="noopener noreferrer"`, no `dangerouslySetInnerHTML`; refresh-on-open is a single aborted POST; table semantics; no new ownership violations.
