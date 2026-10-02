# Handoff

Single source for resuming after a session limit or `/clear`. The orchestrator updates this file and commits it after every task commit, review, and dispatch. If it disagrees with `git log`, trust `git log` and fix this file.

Last updated: 2026-10-02, Phase 2 Batch E (T2.5b in flight). Plan: ADR-009 and the PROGRESS Phase 2 table.

## 1. Resume in five steps

1. Read `CLAUDE.md`, then this file, then `docs/PROGRESS.md` and the "Rules in force" list at the top of `docs/DECISIONS.md`. Read PLAN.md only by section: section 9 for the current phase, section 10 for gates, and whatever sections the next task cites. Open full ADRs, reviews and `docs/archive/` only when a task needs them.
2. Run `git status` and `git log --oneline -10` on branch `phase/2-shell`.
3. Check every task listed under "In flight" (section 3). Agents die with the session, so any uncommitted files in their paths are partial work. Verify and commit, or discard and re-dispatch.
4. Run `pnpm verify` (Node 24 PATH prefix, `docs/brief-rules.md`) to confirm a green baseline. Show only counts and failures.
5. Continue with "Next steps" (section 4), in order.

## 2. Where things stand

- **Phase 1 done** (G1 PASS, tag `gate-G1`). **Phase 2 in progress** on `phase/2-shell`; T2.0 to T2.4 committed.
- **Baseline:** `pnpm verify` 690 unit tests; e2e 75; a11y 36. Route JS: `/l/[leagueId]` about 161.6 KB, settings 168.5 KB, gallery 189.2 KB.
- **Local data:** `./data` (gitignored) holds a live-synced DB. Never take screenshots from it (ADR-009 item 17).

## 3. In flight (Batch E)

- T2.5b (qa-engineer): `e2e/**`, `tests/**`, `playwright.config.ts`, `lighthouserc.json`. Onboarding e2e, navigation, pages, search, Settings, axe on every Phase 2 route in both themes, Lighthouse on Home and League, perf integration test (p95 at most 300 ms), requirements trace, e2e run twice. Reports app bugs separately.

## 4. Next steps (in order)

1. Verify and commit T2.5b.
2. Batch F (T2.6, frontend; backend split out if needed): T2.4 M1 (one freshness pattern: quiet "Updated 1 day ago" line with an icon when stale, no "Stale:" prefix; the banner keeps the PLAN 3.4 rule and gets Sync now; "1 day ago", not "1 d ago"), T2.4 m1 to m7, n1, n2, plus app bugs from T2.5b. Then code-reviewer and a ux-reviewer recheck.
3. G2 gate: `pnpm gate --amd64`; code-reviewer on `git diff main...phase/2-shell`; full coverage run; live onboarding by the orchestrator (about 22 calls); LAN check (`pnpm dev:lan` plus a request with a non-localhost Origin); archive 390 and 1280 px screenshots from the seeded dir to `docs/gates/G2/screens/` after eyeballing each; write `docs/gates/G2.md`; stop for Steph with run instructions (LAN URL, `dev:lan` and worker commands, macOS firewall prompt) and questions.

## 5. Briefs

Every Task Brief says: "Read `docs/brief-rules.md` first." Restate in the brief only the rules that matter most for that task (for example identifiers for fixture work, the migrations manifest for backend schema work).

## 6. Before every commit (orchestrator)

1. Run `pnpm verify`. If a parallel agent's files are mid-edit, run targeted checks on the task's paths instead, then the full verify before the next batch.
2. Walk the acceptance criteria against real output. Confirm `git diff --stat` stays in the agent's paths.
3. Scan the staged diff for identifiers:
   ```
   set -a && . ./.env && set +a && git diff --cached | grep -c -e "$SLEEPER_USERNAME" -e "$DEFAULT_LEAGUE_ID"
   ```
   It must print 0.
4. Run `pnpm fixtures:check` when `tests/fixtures/` changed.
5. Stage exact paths only (never `git add docs` or `git add .`).
6. Commit with the task id and the attribution line, update the PROGRESS.md task table, then update sections 2 to 4 of this file and commit it.
7. After each batch's reviews are saved and committed, suggest `/clear` to Steph: this file is enough to resume.
