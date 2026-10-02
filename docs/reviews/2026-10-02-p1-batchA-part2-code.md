# Code review: Phase 1 Batch A part 2 (T1.4a nflverse spike)

Date: 2026-10-02 | Reviewer: code-reviewer | Diff: `git show d5b2200` | Verdict: APPROVE (0 Blocker, 0 Major)

Checks: `pnpm verify` green (281 tests); scripts project 154 tests. Reviewer re-derived fixture facts: 272 games, 77 with lines, moneyline/spread agreement 75 of 77, weekday counts, neutral-site games, KC week 1 targets and carries, manifest row counts, kickoff conversions.

## Minor

- **m1** api-notes 14d: `2026_01_ARI_LAC` evidence said LAC won 26 to 14; ARI won. Conclusion unaffected (moneyline is the evidence). Fixed by orchestrator.
- **m2** ADR-006 item 3: lines also exist for played weeks, not only the next 1 to 2 weeks. Fixed by orchestrator.
- **m3** `nflverse-lib.ts:14-52` parseCsv: no BOM strip; ragged rows padded/truncated silently; no tests for BOM, quoted newline, ragged rows. To T1.4b brief.
- **m4** `nflverse-lib.ts:162-173` kickoffUtc: nonexistent spring-forward hour resolves an hour early; impossible dates roll over; untested. Not reachable in season. To T1.4b brief (validate ranges, round-trip, test DST edges).
- **m5** `nflverse-lib.ts:96-102` normalizeName: no NFD accent strip; name+team isn't unique and the matcher can't tiebreak by position. To T1.4b brief (Map of candidates, position tiebreak, suffix/accent tests).
- **m6** `nflverse.ts`: no cache refresh flag, no size check against asset size, no fetch timeout, `as` casts on JSON, cwd as repo root, rmSync before writes. Backlog (dev script).
- **m7** Ownership of `tests/fixtures/nflverse/`: already granted in ADR-005 item 9.
- **m8** api-notes 14f join rates were spike measurements against the full Sleeper dump and aren't reproducible from committed code. Backlog: label as spike measurements or add a `--report` mode.

## Nit

- **n1** matcher tests lack a same-name different-team case. To T1.4b brief.
