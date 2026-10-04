# Code review: Phase 6 Batch A (T6.1, T6.2, T6.3a)

Date: 2026-10-04
Scope: `git diff main...HEAD` on `phase/6-hardening` (30 files, +1395/-37) -- the first auth implementation in this codebase, Docker/self-hosting hardening, and the first PWA manifest/icons.

## Verdict

CHANGES REQUIRED (one Major; fixed same-session via two parallel fix rounds, backend + devops). Two Minors fixed directly by the orchestrator (stale PLAN.md/CLAUDE.md references). See `docs/PROGRESS.md` backlog for the remaining nit.

## Findings

| Severity | Location | Finding | Status |
|---|---|---|---|
| Major (M1) | `apps/web/lib/server/auth.ts`, `docs/self-hosting.md`, `unraid/sideline.xml` | The login rate limiter's "per IP" trust model depends on a reverse proxy always being present to sanitize `X-Forwarded-For`, but nothing enforces or clearly warns about this, and the shipped quickstart defaults to direct port exposure. If violated: (a) an attacker can spoof a fresh fake IP per login attempt, fully bypassing the 5/min rate limit; (b) the unpruned `attempts` Map grows unboundedly, a real memory-exhaustion DoS vector against a long-running container. | Fixed: backend-engineer bounded the rate-limiter's memory (fix-round commit pending); devops-engineer added a prominent warning to the self-hosting docs and Unraid template (fix-round commit pending). |
| Minor (m1) | `PLAN.md:149` | Env var table still said PUID/PGID defaulted to 1000/1000, contradicting T6.2's real 99/100 fix everywhere else. Reviewer noted this is the orchestrator's job per CLAUDE.md (PLAN.md amendments), not a subagent's. | Fixed directly (`4ae74d7`). |
| Minor (n1) | `CLAUDE.md` ownership table | Still listed `apps/web/middleware.ts`; Next 16 renamed the convention to `proxy.ts` (correctly identified and used by T6.1 from the real pinned-version docs). | Fixed directly (`4ae74d7`). |
| Minor (n2) | `apps/web/lib/server/auth.ts:36-44` | `constantTimeStringEqual`'s length-mismatch branch compares against a short placeholder instead of a same-length one, leaking a small timing signal about the configured password's length. Low real-world risk given the LAN/self-hosted threat model. | Backlog (`docs/PROGRESS.md`, Phase 6 section). |

## Requirements coverage

HOST-7, HOST-8, security headers, structured logging, the PUID/PGID fix, and the PWA manifest/icons/theme-color sync all implemented and well-tested, verified by the reviewer independently tracing `verifySession`'s HMAC-before-expiry order, `constantTimeHexEqual`/`constantTimeStringEqual`'s use of `node:crypto`'s `timingSafeEqual`, `clientIp`'s last-entry logic against constructed header values, the rate limiter's window-reset arithmetic, every `handleLogin` failure path's identical generic response, the real Dockerfile's unconditional `NODE_ENV=production`, and the real Next.js 16.3.8 docs for both the `middleware.ts`->`proxy.ts` rename and the `manifest.ts`->`/manifest.webmanifest` served-path convention -- none of these were taken on faith from the implementing agents' own claims.

## Checks run by the reviewer (independently)

- `pnpm verify` -- 147 files, 1428 tests, clean
- `git diff --stat` cross-checked against all three tasks' stated ownership -- no cross-ownership writes
- grep for `eslint-disable`, `any`, `.only`/`.skip`, `@ts-ignore`/`@ts-expect-error` -- none found
- Manual trace of the session-verification, constant-time-compare, client-IP, and rate-limiter logic against constructed inputs, not just the test suite's own assertions
