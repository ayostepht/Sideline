# Phase 6 archive: Hardening and v1.0 release

G6 PASS 2026-10-04 (human checkpoint, PLAN's gate table -- Steph approved). Gate report: `docs/gates/G6.md`. Merged to `main`, tagged `gate-G6` and `v1.0.0`.

## Task table

Batch letters and task splits amended from PLAN.md's literal table per ADR-017 (T6.1 stays one task but its login page splits out as T6.1c, frontend ownership; T6.3 splits into T6.3a/b/c). Batch E is a post-gate fix round, outside PLAN's original table, triggered by Steph's live-testing report after the first G6 presentation (same precedent as Phase 4's T4.8 fold-in, ADR-015) -- full root-cause writeup in `docs/DECISIONS.md`'s ADR-017 amendments.

| ID | Task | Agent | Depends | Batch | Status | Attempts | Commit |
|---|---|---|---|---|---|---|---|
| T6.1 | Auth (HOST-8: session cookie, login/logout API routes, rate limiter, constant-time compare) + security headers (both via `apps/web/proxy.ts`, Next 16's renamed `middleware.ts`) + structured logging (`pino`, matching the worker's existing convention) | backend-engineer | G5 | A | Done | 1 | `40e3bc4`, `098e296` |
| T6.2 | Docker final: PUID/PGID default fix, Unraid template, `docs/self-hosting.md` + README rewrite | devops-engineer | G5 | A | Done | 1 | `6c2b9f3`, `89d703c` |
| T6.3a | PWA manifest, icons, favicon; theme-color/toggle conflict fix | frontend-engineer | G5 | A | Done | 1 | `0ed301f` |
| T6.1c | Login page (`apps/web/app/login/page.tsx`), ownership split from T6.1 (non-API page) | frontend-engineer | T6.1 | B | Done | 1 | `77b4dab` |
| T6.3b | Preseason and offseason states (consolidate existing ad hoc preseason copy, add offseason) | frontend-engineer | G5 | B | Done | 1 | `aa4d4f4` |
| T6.3c | League UX polish: desktop density (`lg:` tables, 5 sections), "You" markers (6 sections), manager-tendencies pluralization | frontend-engineer | G5 | B | Done | 1 | `a3f2b4a`, `de716fd`, `f9ce390` |
| T6.4 | Full regression; fresh-install test; upgrade test; auth e2e; 60-minute live soak | qa-engineer | T6.1, T6.1c, T6.2, T6.3a, T6.3b, T6.3c | C | Done | 1 | `9ef2fdb` |
| T6.5 | Whole-repo security and quality review | code-reviewer | T6.1, T6.1c, T6.2, T6.3a, T6.3b, T6.3c | C | Done (APPROVE) | 1 | `12a2a58` |
| T6.6 | Final UX review of every screen | ux-reviewer | T6.1c, T6.3a, T6.3b, T6.3c | C | Done (APPROVE) | 1 | `f3fa2d0` |
| T6.7 | Fix round | owning agents | T6.4, T6.5, T6.6 | D | Skipped (zero Blocker/Major in Batch C) | 0 | |
| T6.8 | Lineup optimizer solver stability tiebreak (fix zero-benefit swap recommendations) | analytics-engineer | G6 gate, Steph's live-testing report | E | Done | 1 | `89edcde` |
| T6.9 | Lineup page UI materiality floor (mirrors Home's `hasSwaps` guard) | frontend-engineer | G6 gate, Steph's live-testing report | E | Done | 1 | `dd94a74` |
| T6.10 | Optimizer stability property test | qa-engineer | T6.8 | E | Done | 1 | `96a495b` |
| T6.11 | Wire GHCR into CI Docker build (Steph approved at the G6 checkpoint) | devops-engineer | G6 gate | E | Done | 1 | `666e787` |
| T6.12 | Dedupe the 0.05pt materiality floor into one shared module (code review Major fix) | frontend-engineer | T6.9 code review | E | Done | 1 | `31b3f72` |

**Decided at Phase 6 planning (ADR-017 item 2):** T6.3c's UX polish is a curated, bounded list (desktop density, "You" markers, pluralization), not the full accumulated Minor backlog -- score-range dot contrast, `sparkline.tsx`'s latent overflow risk, the win-probability triple-display, and swing-player tap-through stay backlogged for Phase 7/P1.

## Batch E: the post-gate fix round

G6 was first presented with automated checks PASS. Steph answered two of three open questions immediately (single shared password is fine; yes to GHCR) and flagged a real bug from live testing on her phone: the Lineup page recommended "3 swaps available, projected +0.0 pts" with a swap chain netting to zero real benefit.

Root cause (found by reading `packages/core/src/optimizer/{solve,recommend,eligibility}.ts` directly): WR and FLEX slots overlap in eligibility, and the Hungarian solver's only tiebreak (ascending `playerId`) had no notion of preferring the player's current slot. When several WR-eligible players are tied in value across interchangeable WR/FLEX slots, every permutation sums to the same total, so the solver could return a different-but-equal-value permutation than the real current lineup -- reported as a meaningless swap chain.

Fixed across five tasks (T6.8-T6.12) plus a code review (one Major: the `0.05` materiality floor was duplicated in two places, fixed by T6.12) and a targeted UX review (APPROVE, zero findings, independently confirmed live on real fixture data that the fix holds). Re-running the full `pnpm gate --amd64` twice to reach a clean final state also surfaced and fixed two pre-existing, unrelated gaps: a stale `e2e/lineup.spec.ts` assertion against the corrected behavior, and a `vitest.config.ts` coverage-exclusion glob that never matched the literal filename `apps/web/lib/server/perf.test.ts` (dating to Phase 4/T4.7) -- both fixed directly by the orchestrator as small, well-understood config/test corrections.

Final `pnpm gate --amd64`: 11/11 PASS, route JS and Docker image sizes unchanged from the original G6 run. Full detail: `docs/gates/G6.md`, `docs/DECISIONS.md`'s ADR-017 amendments.

## Backlog at phase end (carried forward to `docs/PROGRESS.md`)

Genuinely open items (Minor/Nit severity, none release-blocking) carried into `docs/PROGRESS.md`'s active backlog under "Carried from Phase 6": T6.5's CSP `'unsafe-inline'` accepted risk and `favicon.ico` header bypass; a timing side-channel in `constantTimeStringEqual`'s wrong-length path; League desktop table row-height variance; the login card's slight off-center position at 390px; missing e2e coverage for `*-offseason` testids and a `complete`-status league; `proxy.ts`'s login redirect missing a `?from=` param; the `withUniqueClientIp` e2e pattern note; PWA icon maskable-safe-zone clipping and favicon softness; Waivers' repetitive "Suggested drop" text; `e2e/lineup.spec.ts`'s `LINEUP-FLOW-5` being pinned to a specific fixture state that may need re-verification if the fixture is ever re-recorded.
