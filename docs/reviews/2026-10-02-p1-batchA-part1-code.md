# Code review: Phase 1 Batch A0+A part 1 (T1.0, T1.1, T1.2a)

Date: 2026-10-02 | Reviewer: code-reviewer | Diff: `e4330e4..aab3c0c` | Verdict: APPROVE (0 Blocker, 0 Major)

Checks: committed code typechecks; `pnpm test:unit` 31 files, 247 tests pass. `pnpm verify` was red only from uncommitted T1.4a files (out of scope).

## Minor

- **m1** `packages/sleeper/src/http/client.ts:208`: `Retry-After` is clamped to 60 s. A `Retry-After: 120` triggers an early retry, another 429, and wasted tokens. Fix: fail immediately when the header exceeds the cap, or raise the cap and document it.
- **m2** `client.ts:168,181`: 304 and non-ok response bodies are never read or cancelled; undici holds sockets until GC. Fix: `await res.body?.cancel()` in try/catch.
- **m3** `rate-limiter.ts:81`: a backward clock step makes elapsed negative, so tokens go negative and acquire stalls. Fix: clamp elapsed at 0; prefer a monotonic default clock.
- **m4** `rate-limiter.ts`: verified OK (FIFO, bounded stamps, each retry reacquires).
- **m5** `client.test.ts:149-159`: the timeout test uses a real 20 ms timer. Fix: fake timers or an injectable timer.
- **m6** `packages/shared/src/config.ts:16,110`: the cron check accepts garbage like "foo bar baz qux quux". Fix: tighten the field grammar and test rejection.
- **m7** `config.ts:133`: `TZ` isn't validated. Fix: check with `Intl.DateTimeFormat` (pure).
- **m8** `domain/transaction.ts:17-33`: omits `draft_picks`, `consenter_ids`, trade `waiver_budget`; `type` is a strict enum, so a new Sleeper type would fail a whole batch. Fix: add nullable fields; make `type` tolerant.
- **m9** shared timestamps: two conventions (ISO strings and ms epoch). Fix: document in `shared/index.ts`.
- **m10** T1.0 ownership: per-package `package.json` edits by devops. Fix: log that package manifests are devops-owned for dependency changes.

## Nit

- **n1** `client.ts:62-68`: comment that numeric-looking `Date.parse` inputs fall to 0 harmlessly.

## Disposition

- m1, m2, m3, m5, n1 -> T1.2a-fix (sleeper-data-engineer).
- m6, m7, m8, m9 -> T1.1-fix (backend-engineer), before Batch B consumes the contracts.
- m10 -> logged in ADR-005 item 15.
