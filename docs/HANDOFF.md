# Handoff

Single source for resuming after a session limit or `/clear`. The orchestrator updates this file and commits it after every task commit, review, and dispatch. If it disagrees with `git log`, trust `git log` and fix this file.

Last updated: 2026-10-06. **v1.0.0 RELEASED.** G6 PASS (Steph approved), `phase/6-hardening` merged to `main`, tagged both `gate-G6` and `v1.0.0` (commit `fd56f10`). All six phases of PLAN.md are now shipped. Remote: `origin` is https://github.com/ayostepht/Sideline (public). Steph pushes; the orchestrator does not push unless asked.

**This is a clean point to `/clear`.** Phase 7 (P1 backlog) planning is the natural next step, but has not started -- do not begin it without Steph's go-ahead, since this is new scope beyond what she's approved so far.

## 1. Resume in five steps

1. Read `CLAUDE.md`, then this file, then `docs/PROGRESS.md` and the "Rules in force" list at the top of `docs/DECISIONS.md`. If starting Phase 7, read PLAN.md section 9's Phase 7 line (currently just a suggested feature order, not a task table -- planning it from scratch is the first real step) plus whatever sections the chosen features cite.
2. Run `git status` and `git log --oneline -10` on branch `main` (v1.0.0 tagged at `fd56f10`).
3. Check every task listed under "In flight" (section 3). Agents die with the session, so any uncommitted files in their paths are partial work. Verify and commit, or discard and re-dispatch.
4. Run `pnpm verify` (Node 24 PATH prefix, `docs/brief-rules.md`) to confirm a green baseline. Show only counts and failures.
5. Continue with "Next steps" (section 4), in order.

## 2. Where things stand

- **Phases 0 to 6 done, v1.0.0 released** (G0-G6 all PASS; G2/G3/G4/G6 human checkpoints approved, G5 had none required; tags `gate-G0` through `gate-G6`, plus `v1.0.0`). History: `docs/archive/progress-phase{0-1,2,3,4,5,6}.md`; gate reports `docs/gates/G1.md` through `G6.md`.
- **Dev server and worker both running again** for Steph's continued hands-on testing (she asked for them back after trying the v1.0.0 build): `pnpm dev:lan` (log `/tmp/sideline-web-dev.log`) and `pnpm dev:worker` (log `/tmp/sideline-worker-dev.log`), `DATA_DIR` pointed at the real `./data`. **Always use `pnpm dev:lan`, never plain `pnpm --filter @sideline/web dev` or `next dev`, for any LAN/phone testing.**
- **What Phase 6 shipped:** optional `APP_PASSWORD` login (HOST-8) with security headers and structured logging; a real Docker/Unraid self-hosting path (PUID/PGID fix, Unraid template, full `docs/self-hosting.md`, GHCR wired into CI); a PWA manifest/icon set; consolidated preseason/offseason states and League desktop-table polish. A post-release fix round (Batch E, `docs/archive/progress-phase6.md`) fixed a real optimizer bug Steph found live-testing: the lineup solver could recommend a zero-benefit swap chain when multiple players tied in value across interchangeable slots -- fixed at the root (a stability tiebreak) and defensively (a UI materiality floor), plus a generalizing property test.
- **Standing lesson from the gate-rerun chase during Batch E: a `pnpm gate` run dispatched through a subagent can silently stall in the subagent's own completion-watcher even though the gate script itself finishes fine** (happened once -- the gate completed in ~9 minutes but the subagent didn't report back for about an hour). If a dispatched gate run goes quiet, check `docs/gates/latest.json`'s `finishedAt` and `.gate/logs/*.log` timestamps directly rather than waiting indefinitely, or just run `pnpm gate` directly via a background Bash command (gets a native harness notification, no extra indirection).
- **Standing lesson, reconfirmed at G5/G6: stop the host's `pnpm dev:lan` and `pnpm dev:worker` before any gate-affecting run, every time, no exceptions** (frees port 3000; avoids resource-contention false-positive perf-test failures, seen at G4, G5, and twice during Batch E).
- **`getPlayerDetail` perf test (`apps/web/lib/server/perf.test.ts`) remains a known-tight budget** (~125-127ms/call, vs. under 1ms for every other data function; no `computed_cache` entry exists). Its coverage-exclusion glob bug is now fixed (Batch E), but the underlying slowness itself is still backlog, not yet actioned -- candidate Phase 7 follow-up if it starts failing its 4800ms budget again even uninstrumented.
- **Known gap, not yet fixed: no worker job calls `upsertUsageWeek`.** TREND-2 and the Waiver Score's usage-trend component silently fall back to a scoring-trend proxy on real data. Logged in `docs/PROGRESS.md` backlog.
- **Real MATCH-3 decision (ADR-014, unchanged): matchup adjustment stays off** (`alpha=0, beta=0`). Matchup grades remain context-only.
- **Design:** ADR-011 is the visual identity (lime fill only, one per-page content-recommendation accent), verified clean across every route through the G6 UX review.
- **Local data:** `./data` (gitignored) holds a live-synced DB with the full 2025 season plus 2026 weeks. Never take screenshots from it (ADR-009 item 17) -- `pnpm screens` only runs against a fixture-seeded temp DATA_DIR.
- **Registry:** CI publishes `ghcr.io/ayostepht/sideline` on pushes to `main` (`latest`, `sha-*`) and version tags (`v*.*.*`). `unraid/sideline.xml` points at it [OPS-1]. The GHCR package must be Public for Unraid to pull without credentials.
- **Backlog:** see `docs/PROGRESS.md`'s "Backlog (open items only)" -- carried-from-Phase-6 items (CSP `'unsafe-inline'` accepted risk, a timing side-channel in `constantTimeStringEqual`, League table row-height variance, login card centering, missing offseason/complete-league e2e coverage, `proxy.ts`'s missing `?from=` redirect param, Waivers' repetitive "Suggested drop" text), carried-from-Phase-5/4/3/2 items, and the standing worker/providers/tests/tooling sections. Nothing there is release-blocking; everything is either a documented design tradeoff or a legitimate follow-up for whenever its owning agent next touches that area.

## 3. In flight

- PERF-1 (backend-engineer, running): speed up `getPlayerDetail`. Its perf test fails on GitHub runners (8.1 s vs 4.8 s budget), which turns CI's verify job red. The Docker job does not depend on verify, so images still publish. Budget must not change.
- DOCS-1..3 docs audit done 2026-10-06 (committed). Historical records (gates, reviews, archive, backtests, ADR bodies) were left as written on purpose.

## 4. Next steps (in order)

1. **Unraid deploy in progress (2026-10-06).** Repo is public at github.com/ayostepht/Sideline; CI publishes `ghcr.io/ayostepht/sideline`. Template fixed [OPS-1]. Steph's to-dos: set the GHCR package Public, push the template commit and the `v1.0.0` tag, install via `my-sideline.xml`. No APP_PASSWORD: it sits behind NPM + Authentik.
2. **Phase 7 (P1 backlog) planning is the natural next step**, per PLAN.md section 9's suggested order: notifications (Home Assistant webhook first, then ntfy and Discord), trade analyzer and finder, Auto lineup mode, weekly backtest job, league history, weather, offline caching, "view as team." Each follows the same brief/verify/review cycle and ends with a mini-gate. **Do not start Phase 7 without Steph's explicit go-ahead** -- PLAN.md only has a suggested feature order, not a task table, so the first real step is planning it (likely an Explore pass plus an ADR, same precedent as every prior phase).
3. Restarting `pnpm dev:lan`/`pnpm dev:worker` is no longer withheld -- both are running now at Steph's request. Stop them only for a gate-affecting run (section 2's standing lesson), and restart after.

## 5. Briefs

Every Task Brief says: "Read `docs/brief-rules.md` first." Restate in the brief only the rules that matter most for that task (for example identifiers for fixture work, the migrations manifest for backend schema work).

## 6. Before every commit (orchestrator)

1. Run `pnpm verify`. If a parallel agent's files are mid-edit, run targeted checks on the task's paths instead, then the full verify before the next batch.
2. Walk the acceptance criteria against real output. Confirm `git diff --stat` stays in the agent's paths.
3. Scan the staged diff for identifiers:
   ```
   set -a && . ./.env && set +a && git diff --cached | sed -E "s#(github\.com|raw\.githubusercontent\.com|ghcr\.io)/$SLEEPER_USERNAME##gI" | grep -c -i -e "$SLEEPER_USERNAME" -e "$DEFAULT_LEAGUE_ID"
   ```
   It must print 0. The sed strips the repo and image URLs that ADR-018 allows.
4. Run `pnpm fixtures:check` when `tests/fixtures/` changed.
5. Stage exact paths only (never `git add docs` or `git add .`).
6. Commit with the task id and the attribution line, update the PROGRESS.md task table, then update sections 2 to 4 of this file and commit it.
7. After each batch's reviews are saved and committed, suggest `/clear` to Steph: this file is enough to resume. After `/clear`, the SessionStart hook loads this file automatically; Steph types `go`.
