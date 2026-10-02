# Code review: Phase 0, Batch C (T0.5, T0.3b)

Date: 2026-10-01 | Reviewer: code-reviewer | Diff: `3308ac3..7c0ff9f` (49 non-fixture files, fixture structure and privacy spot-check)
Verdict: CHANGES REQUIRED (0 Blocker, 1 Major, 12 Minor, 3 Nit)

## Checks run by the reviewer
scripts project 108 tests pass; `pnpm gate --fast --only=U1,U2a,U2b,U4` U1/U2a/U4 PASS, U2b SKIPPED; route size for `/` 133,532 B gzipped; no 16+ digit ids outside fake ranges in tracked non-fixture files; fixtures contain only manager_NN, Team NN, Example League and fake ids. Gate honesty confirmed: PASS requires exit 0; exit 2 is SKIPPED only with the stub marker; missing tools SKIPPED with reason; docker size via inspect Size.

## Findings and disposition

| ID | Sev | Location | Finding | Disposition |
|---|---|---|---|---|
| M1 | Major | scripts/gate/routes-size.ts | Page route with missing client manifest silently skipped, can escape 200 KB budget | Fix: devops-engineer (T0.5 fix round) |
| m1 | Minor | scripts/screens.ts | Browser launch outside try orphans server | Fix: devops |
| m2 | Minor | scripts/gate/checks.ts | Container not removed if `docker run` fails after create | Fix: devops |
| m3 | Minor | scripts/gate/report.ts | All-SKIPPED exits 0 | Fix: devops adds `--strict`; G0 runs `pnpm gate --amd64 --strict` with only the U2b stub expected (orchestrator judges SKIPPED items in the gate report) |
| m4 | Minor | scripts/gate/checks.ts | UI1/UI2 PASS with skipped tests or fewer than 3 projects | Fix: devops |
| m5 | Minor | scripts/gate/checks.ts | `/` must be exactly 200; redirects (onboarding) would fail U3b | Fix: devops (accept 2xx/3xx) |
| m6 | Minor | docs/gates/latest.json | Untracked; warning baseline lost on fresh clone | Orchestrator: commit `docs/gates/latest.json` at every gate |
| m7 | Minor | scripts/gate/u4-scan.ts | False negatives (skipIf, todo, fixme, block-comment TODOs, mid-generic any) and false positives | Fix: devops |
| m8 | Minor | scripts/fixtures/sanitize.ts | Denylist sanitizer; other users[].metadata free text not handled; substring replace could corrupt enum values | Fix: sleeper-data-engineer (allowlist metadata keys; display-text keys only) |
| m9 | Minor | scripts/fixtures/leak-check.ts | Short names only matched on whole-value equality | Fix: sleeper-data-engineer (word-boundary match) |
| m10 | Minor | scripts/fixtures/recorded-fixtures.test.ts | Hard-coded weeks break on re-record | Fix: sleeper-data-engineer |
| m11 | Minor | scripts/gate tests | Temp dirs not cleaned | Fix: devops |
| m12 | Minor | scripts/fixtures/record.ts | `--root` / arg validation footguns before `rmSync` | Fix: sleeper-data-engineer |
| n1 | Nit | .github/workflows/ci.yml | Duplicate pnpm version source; add U4 | Fix: devops |
| n2 | Nit | tests/fixtures/README.md | Fake id ranges description out of date | Backlog: qa-engineer (with manifest keys update) |
| n3 | Nit | scripts/lib/server.ts | SIGKILL fallback kills only wrapper | Fix: devops |
