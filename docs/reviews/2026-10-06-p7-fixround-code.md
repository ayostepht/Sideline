# Code re-review: Phase 7a fix round

Date: 2026-10-06 | Diff: `08c76f6..3ee5490` (P7.8a c74522d, P7.8b 4aac7d0, P7.8c 2a0b262, P7.7 89830e3, P7.8d 3ee5490), excluding docs. Static review.
VERDICT: CHANGES REQUIRED (test coverage)

Prior items confirmed resolved: B/C M1, m1, M2, M3, m2, n1; UX M1, M2, M3, M4, m2. No ownership violations. Empty-news throttle applies; modal-mount counter has no leak path.

| ID | Sev | Where | Finding | Disposition |
|---|---|---|---|---|
| M1 | Major | `e2e/player-card.spec.ts` | Untested after catch-all removal: Back then Forward to the player URL; opening a second player from inside the pop-up then Back; leaving via a link inside the pop-up (and resulting focus) | P7.9 (qa) |
| m1 | Minor | `app-shell.tsx:~82`, `focus-return.ts` | If the pop-up mounts in a later commit than the pathname change, focus may move to main; leaving via a link inside the pop-up restores a stale trigger | P7.9 tests expose it; frontend fix only if a test fails |
| m2 | Minor | `focus-return.ts:~8` | Trigger never cleared after a non-modal navigation (mostly covered by `isConnected`) | Backlog |
| m3 | Minor | `packages/db/src/sync-reads.ts` | Failed attempts ignored: while ESPN is down every open re-queues (bounded by cap and dedupe) | Backlog (add 5-10 min cooldown for ok=0) |
| m4 | Minor | PLAYERCARD-7 | Uses Next internal `window.next.router` | Backlog |
| m5 | Minor | `e2e/helpers/news.ts` | `new Date()` seed time; opens SQLite while server runs (check busy timeout) | P7.9 (confirm busy timeout) |
| n1 | Nit | `format.ts`, `format-count.ts` | Possible duplicate count formatting | Backlog |
