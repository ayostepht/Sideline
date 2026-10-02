# Standing rules for every task

Every Task Brief points here. Read this file before starting work. The brief wins where it is more specific.

## Environment

- Use Node 24: prefix shell commands with `export PATH="$HOME/.local/share/fnm/node-versions/v24.21.0/installation/bin:$PATH"` (the tool shell defaults to Node 25).
- The sync CLI is `pnpm run sync`, not `pnpm sync` (pnpm 12 has a built-in `sync`).
- Playwright `--project` is variadic: put the spec path before `--project`.
- Use the whole-repo coverage run; per-project coverage prints Unknown%.
- Never run `next build` while another agent may be building (parallel builds clobber `.next`). To wait for one, use `pgrep -f "[n]ext build"`, not `pgrep -f "next build"`, which matches its own shell.

## Privacy

- Real identifiers (Sleeper username, league id, league name, user ids, avatars, manager and team names) come only from `.env` and never go into tracked files (ADR-000). Tests and docs use the sanitized fixture names.
- Screenshots come only from a fixture-seeded temp DATA_DIR, never `./data`. ux-reviewer captures stay in gitignored `.screens/` (ADR-009 item 17).
- No Sleeper calls during development. Only the orchestrator makes live calls, at gates.

## Code and tests

- TypeScript strict; no `any` (use `unknown` plus zod); zod at every external boundary.
- Use msw 3 APIs.
- No `.skip`, `.only`, weakened thresholds, deleted failing tests, or unjustified lint or axe rule disables.
- Partial week 4 is excluded from golden expectations and SCORE-2 validation (ADR-000 item 9).
- Every `db:generate` must also update `packages/db/src/migrations-manifest.ts`; a journal-sync test fails otherwise. Run prettier on the generated drizzle meta JSON.

## Ownership

- Edit only your owned paths (CLAUDE.md section 2). Report failures in other agents' paths instead of fixing them.
- Only devops-engineer changes dependencies (ADR-005 item 15, ADR-008). Report missing dependencies.
- `apps/web/next.config.ts` and `postcss.config.mjs` belong to devops-engineer.

## UI

- Copy plain and short, no em dashes. Jargon gets a tooltip.
- WCAG 2.1 AA. Color is never the only signal. Touch targets at least 44 px. `tabular-nums` for stats.
- Route JS target at most 170 KB gzipped (hard budget 200 KB). Lazy-load heavy client code; per-icon lucide imports (ADR-009 item 6).

## Reports

- The token budget is tight. Work efficiently, filter command output to counts and failures, and keep the Task Report short.
