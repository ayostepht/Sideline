# Phase 4 Batch A code review

Date: 2026-10-03. Branch: `phase/4-waivers`. Diff: `main..HEAD` at the time of review (commits `ad3b10a`, `b94c236`, `7711881`, plus docs commits `7785a4a`, `cf73cea`, `83fc87a`). Reviewer: code-reviewer subagent.

VERDICT: CHANGES REQUIRED (3 Major, in T4.3's Docker entrypoint/migrate scope; fixed before Batch B per CLAUDE.md section 4)

**Resolution (2026-10-03, commit `91a616c`, T4.3-FIX): all 3 Major findings fixed and independently re-verified** (real `docker build`/`run` exercises of each new failure path, plus `isMigrated` confirmed as a real `@sideline/db` export). Minors m1 and m3 remain open, logged in `docs/PROGRESS.md`'s backlog for T6.2.

## Findings

**[M1] Major** `docker/migrate.ts:1-17` — The entrypoint's migration step never verifies migrations actually applied. The pre-existing sibling script `packages/db/src/cli/migrate.ts:10-11` calls `isMigrated(handle)` and throws `"migrations did not apply cleanly"` after `migrate()` for exactly this reason — `drizzleMigrate` can return successfully having applied zero migrations if the migrations folder it's pointed at is empty or wrong (e.g. a future `.dockerignore`/COPY-path regression in `Dockerfile`). `docker/migrate.ts` duplicates the open/migrate/close logic but drops that safety check, so a packaging bug could let the container boot against an unmigrated DB without the backup-then-migrate flow ever failing loudly. Fix: add the same `isMigrated(handle)` check (ideally reuse `packages/db/src/cli/migrate.ts`'s logic rather than duplicating it).

**[M2] Major** `docker/docker-entrypoint.sh:15-16` — `chown -R "$PUID:$PGID" "$DATA_DIR"` runs recursively as root with no validation that `$DATA_DIR` is a sane path. `DATA_DIR` is fully operator/env-controlled and interpolated straight into a destructive recursive root operation before any privilege drop. A misconfigured `.env`/`docker-compose.yml` (e.g. `DATA_DIR=/`) would recursively re-own the entire container filesystem from a startup typo, with no guard rail. Fix: validate `DATA_DIR` is non-empty, absolute, and not an obviously dangerous path before `chown -R`.

**[M3] Major** `docker/docker-entrypoint.sh:6-7, 20-22` — `PUID`/`PGID` are used directly in `setpriv --reuid="$PUID" --regid="$PGID"` with no check against `0`. If `PUID=0`/`PGID=0` is set, `setpriv` "drops" to root, and both web and worker run as root for the container's life — silently defeating the entire privilege-drop design. No numeric-format validation either. Fix: reject (or require explicit opt-in for) `PUID=0`/`PGID=0`, and validate both are decimal integers before use.

## Minor (logged to backlog, not blocking)

- **[m1]** No `trap` on `SIGTERM`/`SIGINT` in the entrypoint to forward shutdown to the backgrounded web/worker PIDs — `docker stop` doesn't get a graceful drain, only a hard kill after the stop timeout. Not a data-loss risk (WAL tolerates it).
- **[m2]** `AppConfigSchema.puid`/`pgid` default 1000/1000 vs. the container's real 99/100 default — already tracked in `docs/PROGRESS.md` as a T6.2 follow-up.
- **[m3]** `chown -R` over all of `$DATA_DIR` runs unconditionally on every boot, not just first-run; O(data size) cost on every restart as the DB/backups grow.

## Requirements coverage

All of TREND-1 to 5, WAIVER-1/2, and HOST-1 to 4 implemented and tested as scoped; see the full subagent report for the per-requirement test-case breakdown. No ownership or purity violations found (T4.1/T4.2a stayed within `packages/core/src/trends/` and `.../waiver/` respectively; T4.3 stayed within devops-owned root config and Docker paths).

## Checks run

`pnpm typecheck`, `pnpm lint`, `pnpm test:unit` (106 files / 1024 tests) all clean. No `shellcheck` available in the review environment to supplement manual shell review.
