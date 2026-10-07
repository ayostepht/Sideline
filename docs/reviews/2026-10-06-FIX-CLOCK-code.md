# Code review: FIX-CLOCK (game clock override, ADR-019)

Date: 2026-10-06 | Branch: fix/e2e-clock | Reviewer: code-reviewer

**Verdict:** no Blocker, no Major. Approve with minors.

- Leak check: no auth, session, rate-limit, sync or cache path reads `gameNow()`. `proxy.ts` session check, `handleLogin`, `handlePatchSettings`, `requestSync`, `getSyncStatus`, `getHealth` heartbeat and `http.ts` timing stay on real time. The login test (clock pinned to 2020, session still expires in real time) is a real check. The override is never read from request input.
- Env caching keyed on the raw string, returns a copy per call, warns once per value: correct.

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| m1 | Minor | `app/page.tsx`, `app/not-found.tsx`, `app/onboarding/page.tsx` still passed `new Date()` to `getLeagueOverview` | Fixed (orchestrator, switched to `gameNow()`) |
| m2 | Minor | No health test for an invalid pinned value leaking into the body | Fixed (FIX-CLOCK-2). The test exposed a real leak: the ConfigError text reached `db.error`; health now returns a generic message |
| m3 | Minor | Bad value surfaced as a generic "database error" page with no log naming the variable | Fixed (FIX-CLOCK-2): validated in `loadConfig`, `instrumentation.ts` stops the server at boot. Verified: prints `SIDELINE_GAME_CLOCK: must be an ISO 8601 UTC datetime...` and exits 1 |
| m4 | Minor | Import order in `api-handlers.ts` | No change; lint and format pass |
| n1 | Nit | No `+00:00` case | Fixed (FIX-CLOCK-2) |
