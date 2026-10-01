# Code review: Phase 0, Batches A and B (T0.1, T0.2, T0.4, T0.3a)

Date: 2026-10-01 | Reviewer: code-reviewer | Diff: `9a1f115..6c89e16` (98 files)
Verdict: CHANGES REQUIRED (0 Blocker, 3 Major, 7 Minor, 3 Nit)

## Checks run by the reviewer
`pnpm verify` green (32 tests); `pnpm test:coverage` green, thresholds enforced per glob (confirmed by forcing core to 101%); stub scripts exit 2; helper e2e 18/18 on 3 projects; smoke 4/4 desktop; lint rules apply in tests/, e2e/, scripts/, apps/web, packages/*; no `.skip`/`.only`/`any`/`!`/TODO; no real identifiers; spike scripts write only to `.spike-cache/`, throttle at 1.1 s, call `/players/nfl` once.

## Findings and disposition

| ID | Sev | Location | Finding | Disposition |
|---|---|---|---|---|
| M1 | Major | apps/web/tsconfig.json | `include` misses lib/, components/, middleware.ts, config files; lint project service fails on them | Fix: devops-engineer (T0.2 fix round) |
| M2 | Major | playwright.config.ts | webServer uses `next start` with standalone output (unsupported); e2e and lhci measure a different server than Docker ships | Fix: devops adds `start:standalone`; qa switches webServer |
| M3 | Major | lighthouserc.json | No route JS budget (200 KB gzip); no server start for `lhci autorun` | Fix: qa-engineer |
| m1 | Minor | .dockerignore | `.env*` only matches root; nested `.env.local` copied | Fix now: devops |
| m2 | Minor | Dockerfile deps stage | Filter excludes worker deps needed by T4.3 | Fix now: TODO with T4.3 |
| m3 | Minor | package.json in b5e50ad | Reported as qa ownership violation | No change: the orchestrator made this edit as an integration fix (4 script lines, within the 15-line allowance) |
| m4 | Minor | vitest.config.ts | Coverage does not measure apps/web/app/api | Backlog: decide in T1.6 brief (keep handlers thin, or add to threshold group) |
| m5 | Minor | tests/harness withDelay test | Wall-clock assertion can flake | Fix now: qa |
| m6 | Minor | pnpm-workspace.yaml | `minimumReleaseAgeExclude` for next@16.3.8 undocumented | Fix now: devops comment; ADR-001 records it |
| m7 | Minor | health route.test.ts | Unjustified `as string` cast | Fix now: devops |
| n1 | Nit | tests/fixtures/README.md | Manifest uses camelCase, ADR-000 said `recorded_at` | Orchestrator: camelCase (`recordedAt`, `partialWeeks`) is canonical; ADR-000 corrected |
| n2 | Nit | playwright.config.ts | `--project foo` value counted as a spec file | Fix now: qa |
| n3 | Nit | apps/web/next-env.d.ts tracked | Next regenerates it | Fix now: devops (gitignore, untrack) |
