# Decisions (ADR-lite)

Format: number, date, decision, context, alternatives considered, consequences. ADR-001 (stack) and ADR-002 (data sources) are reserved for T0.6, per PLAN.md section 9.

## ADR-000: Process, privacy, and ownership decisions for Phase 0

Date: 2026-10-01

**Decision**

1. **Instruction precedence.** Steph's kickoff message wins over CLAUDE.md and PLAN.md where they conflict. Conflicts found:
   - Delegation is limited to the 8 project subagents in `.claude/agents/` plus the built-in Explore agent (read-only). No plugin agents, no general-purpose agent, and no built-in Plan agent. CLAUDE.md doesn't forbid others, so this is a narrowing, not a contradiction.
   - The current week always comes from `GET /v1/state/nfl` and is never hardcoded.
   - The dev machine placeholder in the kickoff message was left unfilled. The detected platform is macOS (arm64).
2. **Real identifiers stay out of the repo.** Steph's Sleeper username and league id live only in the gitignored `.env` (`SLEEPER_USERNAME`, `DEFAULT_LEAGUE_ID`). Tracked files say "Steph's league" or use placeholders and never contain the username, league id, league name, user ids, avatars, or manager and team names. Briefs tell subagents to read the values from `.env`. The orchestrator greps every staged diff for live-fetched identifiers before each commit, and greps the whole repo at each gate.
3. **Spike raw data** goes only to the gitignored `.spike-cache/`. Samples in `docs/sleeper-api-notes.md` are sanitized.
4. **T0.2 bootstrap exception:** devops-engineer creates the initial `apps/web` skeleton (package.json, next.config, minimal layout and page, `app/api/health/route.ts`) once. After G0, `apps/web/app/api` belongs to backend-engineer and the rest of `apps/web/app` to frontend-engineer.
5. **Fixture output:** sleeper-data-engineer may write generated files into `tests/fixtures/sleeper/` via `scripts/fixtures/record.ts`. Hand-written test code under `tests/` stays with qa-engineer.
6. **Tracking docs:** the orchestrator writes `docs/PROGRESS.md` and `docs/DECISIONS.md` (removed from T0.1 scope).
7. **Dependency installs:** T0.1 pre-installs all Phase 0 dev dependencies so parallel tasks don't race on `pnpm-lock.yaml`. In a parallel batch, only one designated task may run `pnpm add`.
8. **Fixture layout contract:** `tests/fixtures/sleeper/v1/<url path>.json`, `tests/fixtures/sleeper/projections/<season>/<week>.json`, `tests/fixtures/sleeper/stats/<season>/<week>.json`, plus `tests/fixtures/sleeper/manifest.json` (sanitized league id, weeks, which weeks are partial, recorded_at).
9. **Partial weeks:** in-progress weeks (week 4 at recording time) are marked partial and excluded from SCORE-2 validation and all golden expectations.
10. **Diff budget:** generated fixtures and the lockfile don't count toward the ~400-line task size.
11. **Stub scripts** for not-yet-implemented root scripts exit non-zero with "not implemented until Tn.x". `pnpm gate` reports them as SKIPPED, never PASS.
12. **Toolchain:** Node 24 LTS (via fnm locally, `.nvmrc` plus `engines`) and pnpm pinned through `packageManager`. Container runtime for local checks: OrbStack. Deployable images target `linux/amd64` (Unraid is x86_64). Local dev images may be arm64.
13. **Removed `.DS_Store` from the index** (it was committed with the agent kit) and gitignored it.

**Context:** kickoff instructions and approval notes from Steph on 2026-10-01; the planning pre-flight found no pnpm or container runtime installed.

**Alternatives considered:** running parallel agents in separate git worktrees (rejected: each needs its own install; disjoint paths in one tree are enough for Phase 0).

**Consequences:** sanitization becomes a standing check on every commit. Ownership exceptions 4 and 5 end at G0.

## ADR-003: FAAB recommender to P2; rolling-priority waiver advisor becomes P0

Date: 2026-10-01

**Decision:** WAIVER-5 (FAAB bid recommender) moves to the P2 backlog. WAIVER-6 expands into WAIVER-6a to 6d (waiver position, competing-need flags for teams ahead in the order, claim-worth-it advice against a value-of-priority estimate, waivers clear time and free-agency time). Phase 4 T4.4 becomes "Waiver priority advisor". T4.2, T4.6, T4.7, the G4 checks, the golden test list and LEAGUE-6 (FAAB fields only in FAAB leagues) are amended in PLAN.md. P1 notifications switch to self-hosted Web Push for the installed iPhone PWA.

**Context:** Steph's league settings show `waiver_type: 0` and waiver transactions carry no bids (rolling waivers), even though `waiver_budget: 100` is set. Steph confirmed she uses rolling waivers and doesn't expect to use FAAB. She asked for Web Push to the iPhone PWA for notifications.

**Alternatives considered:** keeping FAAB as P0 tested only on synthetic leagues (rejected by Steph: effort with no user value this season).

**Consequences:** Phase 4 ships sooner and with more value for this league. Leagues without FAAB remain a supported edge case. The T0.3a spike must document the waiver fields WAIVER-6 needs (roster `waiver_position`, waiver day and hour settings, `waiver_type` codes, whether failed claims appear in transactions).
