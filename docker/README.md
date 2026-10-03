# docker/

Implements T4.3: one image runs both the web server and the sync worker.

## Files

- `docker-entrypoint.sh`: runs as root (tini's direct child). In order:
  1. `mkdir -p` + `chown -R $PUID:$PGID` on `$DATA_DIR` (default `/data`), so the volume is owned
     correctly even on a fresh mount.
  2. If `$DATA_DIR/sideline.sqlite` already exists, copies it (plus `-wal`/`-shm` if present) into
     `$DATA_DIR/backups/sideline-<UTC timestamp>.db[-wal|-shm]`, then deletes all but the 5 most
     recent backups (sorted by the timestamp in the filename, not file mtime: `cp -p` preserves the
     source's mtime, which is not backup time).
  3. Runs `packages/db` migrations via `docker/migrate.ts` (invoked through `tsx`, since
     `@sideline/db` ships TypeScript source and is not bundled for the worker).
  4. Starts the web server (`node apps/web/server.js`) and the worker (`tsx src/main.ts`) in the
     background, both via `setpriv --reuid=$PUID --regid=$PGID` (no `/etc/passwd` entry required,
     unlike `gosu`/`su`, which matters since Unraid's 99/100 usually has no matching user).
  5. `wait -n` on both. Whichever exits first, the script kills the other and exits non-zero (even
     if the dying process happened to exit 0), so Docker's restart policy restarts the whole
     container rather than leaving only one process alive.
- `migrate.ts`: a small script that opens the DB at `$DATA_DIR` and applies pending migrations.
  Copied into the worker's deployed `node_modules` tree so it can resolve `@sideline/db`.

## Why the image needs to start as root

`chown` to an arbitrary `PUID`/`PGID` and `setpriv --reuid=<uid>` to a uid with no `/etc/passwd`
entry both require root. The Dockerfile has no `USER` instruction, so `docker exec` without
`--user` (and `whoami`/`id` run that way) shows `root` by design, same as the official
postgres/mysql images that use this pattern. The actual long-running application processes (web,
worker) run as the configured non-root `PUID`/`PGID`; confirm with `docker top <container>` or
`docker exec -u <PUID>:<PGID> <container> id`, not with a bare `docker exec ... whoami`.

## Build layout

- `deps`: installs workspace deps for `@sideline/web...` and `@sideline/worker...` only (not the
  whole repo, so root-level test/lint tooling never lands in a cached layer unnecessarily).
- `build`: `next build` with `output: "standalone"`.
- `worker-build`: `pnpm deploy --filter @sideline/worker --prod /app/worker-out`. The worker runs
  its TypeScript source directly via `tsx` (no bundling step), so `pnpm deploy` is used instead of
  a build: it resolves workspace packages (`@sideline/core`, `db`, `providers`, `shared`,
  `sleeper`) into a plain, self-contained `node_modules` (no symlinks back into a monorepo that is
  not shipped), production dependencies only.
- `runtime`: copies the web standalone bundle and the worker deploy output side by side, adds
  `tini` as PID 1, and the entrypoint above.

## Environment variables this stage introduces or defaults

| Variable   | Default (set in Dockerfile) | Purpose                                                          |
| ---------- | --------------------------- | ---------------------------------------------------------------- |
| `PUID`     | `99`                        | Unraid-style owner uid applied to `/data` and the app processes. |
| `PGID`     | `100`                       | Matching group id.                                               |
| `DATA_DIR` | `/data`                     | Where the SQLite DB, WAL files, and `backups/` live.             |

These are read directly by `docker-entrypoint.sh` (shell, default-substitution), independent of
`packages/shared`'s `loadConfig` (which also validates `PUID`/`PGID` for display purposes inside
the app, defaulting to 1000/1000 there; see Task Report DECISIONS for why the two defaults differ
on purpose).

## Volume contract

Mount one volume at `/data`. The container creates and manages, under it:

- `sideline.sqlite`, `sideline.sqlite-wal`, `sideline.sqlite-shm`: the database (WAL mode).
- `backups/`: up to 5 pre-migration snapshots, named `sideline-<UTC timestamp>.db` (plus `-wal`/
  `-shm` siblings when present at backup time). To restore, stop the container, copy a backup
  trio back to `sideline.sqlite[-wal][-shm]`, and start the container again (it will back up
  whatever was there before applying migrations, so this is non-destructive).

## Known limitation when testing on a macOS bind mount

On Docker Desktop/OrbStack, a bind mount from the macOS host (`-v /some/mac/path:/data`) does not
reliably honor `chown` to an arbitrary uid (files can show as owned by the VM's root regardless of
what the container did). This is a property of the macOS virtualized bind-mount layer, not of this
image: a named Docker volume, or a bind mount on a real Linux host (Unraid), reflects `PUID`/`PGID`
ownership correctly, as verified in the T4.3 Task Report.
