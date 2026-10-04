# Self-hosting Sideline

Sideline runs as a single Docker container: a web server and a background sync worker, backed
by a SQLite database that lives entirely in one `/data` volume. This page covers installing it
with Docker Compose or on Unraid, updating, backing up and restoring, every environment
variable, putting it behind Nginx Proxy Manager, and troubleshooting.

## Install with Docker Compose

1. Copy `.env.example` to `.env` and fill in what you need (see the env reference below). Every
   value is optional except the ones noted.
2. From the repo root:

   ```sh
   docker compose up -d --build
   curl http://localhost:3000/api/health
   ```

3. The app listens on port 3000 and keeps its SQLite database in the `sideline-data` named
   volume (mapped to `/data` inside the container).
4. On a brand new, empty volume the health endpoint returns HTTP 200 with status `degraded`.
   That means the web app is up but the database has not finished migrating yet and the worker
   has not reported a heartbeat. Give it a minute and check again; `status: "ok"` means both the
   database and the worker are healthy.

If you are not building from source, replace `build: .` in `docker-compose.yml` with an `image:`
line pointing at a published Sideline image once one exists (see "A note on images" below).

## Install on Unraid

1. In Unraid's Docker tab, go to **Add Container**, then switch to entering a template URL, or
   add the template manually. The template lives in this repo at `unraid/sideline.xml`.
2. The template's `Repository` field is a placeholder until Sideline is published to a container
   registry (Docker Hub, GHCR, or similar is Steph's call, not yet made). Until then:
   - Build the image yourself on the Unraid box or another machine with
     `docker compose build` from this repo, tag it to match the `Repository` field in the
     template (or edit the template's `Repository` field to match whatever tag you built), and
     Unraid will run the local image.
   - Once a real registry and tag exist, update the template's `Repository` (and `Registry` if
     it is not Docker Hub) and it works like any other Community Applications app.
3. Fill in the template fields:
   - **WebUI Port**: host port to map to the container's 3000 (default 3000).
   - **Data**: a path under `/mnt/user/appdata/` to hold the database and backups (default
     `/mnt/user/appdata/sideline`).
   - **PUID** / **PGID**: leave at the defaults (99/100, Unraid's usual `nobody`/`users` ids)
     unless your appdata share uses different ids.
   - **TZ**, **APP_PASSWORD**, **SESSION_SECRET**, **SLEEPER_USERNAME**, **DEFAULT_LEAGUE_ID**:
     see the env reference below. The rest are under "Show more settings".
4. Start the container, then open the WebUI link Unraid shows for it.

## Update

Docker Compose:

```sh
docker compose pull
docker compose up -d
```

(If you are building from source instead of pulling a published image, use
`docker compose up -d --build` instead.)

Unraid: use the **Check for Updates** / **Update** action in the Docker tab, or stop the
container, re-pull/rebuild the image, and start it again.

In both cases, the container backs up the database automatically before applying any pending
migration (see Backup and restore below), and the entrypoint aborts the whole container (so
Docker's restart policy retries it) if a migration fails to apply, so a failed update never
leaves you on a half-migrated database.

## Backup and restore

Every time the container starts, before it runs any pending database migration, the entrypoint
copies the current database (`sideline.sqlite` plus its `-wal`/`-shm` files, if present) into
`/data/backups/sideline-<UTC timestamp>.db` (with matching `-wal`/`-shm` siblings). It keeps the
5 most recent backups and deletes older ones automatically. This happens on every restart, not
just on updates, so you always have recent snapshots even if you never change anything.

**To restore a backup:**

1. Stop the container.
2. In your `/data` volume (the Docker named volume, or the Unraid appdata path you mapped),
   find the backup you want under `backups/`, for example
   `backups/sideline-20260115T030000Z.db`.
3. Copy it back over the live database, including its `-wal`/`-shm` siblings if the backup has
   them:
   ```sh
   cp backups/sideline-20260115T030000Z.db sideline.sqlite
   cp backups/sideline-20260115T030000Z.db-wal sideline.sqlite-wal   # if present
   cp backups/sideline-20260115T030000Z.db-shm sideline.sqlite-shm   # if present
   ```
4. Start the container again. It backs up whatever was there before applying migrations, so
   this restore step is itself non-destructive: you can always undo it.

To copy a backup out of the container entirely (for off-box storage), use
`docker cp sideline:/data/backups/. ./sideline-backups/` (Compose) or copy directly from the
appdata path on the Unraid array.

## Environment variable reference

Copy `.env.example` to `.env` (Docker Compose) or fill in the matching template fields (Unraid).
Every variable is validated at startup; the app refuses to start and logs exactly what is wrong
if a value is invalid.

| Variable | Default | Purpose |
| --- | --- | --- |
| `SLEEPER_USERNAME` | empty | Your Sleeper username. Optional; the in-app onboarding screen can set it instead. |
| `DEFAULT_LEAGUE_ID` | empty | Sleeper league id to open by default. Optional. |
| `DATA_DIR` | `/data` | Where SQLite, caches, and backups live. Leave at `/data` in Docker; only change this for non-containerized runs. |
| `TZ` | `America/New_York` | Display timezone, an IANA name. |
| `APP_PASSWORD` | empty | Set this to turn on password login. Leave empty for no password. |
| `SESSION_SECRET` | empty | Required when `APP_PASSWORD` is set. At least 32 characters. Generate one with `openssl rand -hex 32`. |
| `PUID` | `99` | User id that should own files under `/data`. Unraid's usual "nobody" id. |
| `PGID` | `100` | Group id that should own files under `/data`. Unraid's usual "users" group id. |
| `ENABLE_NFLVERSE` | `true` | Pull supplementary nflverse player data. |
| `ODDS_API_KEY` | empty | Optional API key for betting odds. Leave empty to disable that feature. |
| `SYNC_STATE_CRON`, `SYNC_LEAGUE_CRON`, `SYNC_USERS_CRON`, `SYNC_ROSTERS_CRON`, `SYNC_MATCHUPS_CRON`, `SYNC_TRANSACTIONS_CRON`, `SYNC_PLAYERS_CRON`, `SYNC_TRENDING_CRON`, `SYNC_STATS_CRON`, `SYNC_PROJECTIONS_CRON`, `SYNC_NFLVERSE_CRON` | empty (built-in defaults) | Per-job cron overrides, for example `*/15 * * * *`. Leave empty unless you have a reason to change the sync schedule. |
| `LOG_LEVEL` | `info` | Log verbosity: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `PORT` | `3000` | Port the web server listens on inside the container. Usually left alone; map a different host port instead of changing this. |

`SIDELINE_GALLERY` and `SIDELINE_DEV_ORIGINS` also exist in `.env.example` but are development
only (component gallery page and LAN access for `pnpm dev:lan`). They have no effect you need in
a production container and are not in the Unraid template.

### How PUID/PGID actually work

The container image has no fixed application user. It starts as root just long enough to
`chown` `/data` to whatever `PUID`/`PGID` you set (default 99/100, matching Unraid's usual
`nobody`/`users` ids) and then drops privileges to that uid/gid (via `setpriv`) to run the actual
web and worker processes. There is no uid 1000 "node" user involved; the container adapts to
whatever ids you give it, which is what lets it write to an Unraid appdata share owned by 99/100
without any manual `chown` on the host. If you see `docker exec ... whoami` report `root`, that
is expected for a one-off exec without `--user`; the long-running web and worker processes are
not root (check with `docker exec -u <PUID>:<PGID> sideline id` or `docker top sideline`).

## Nginx Proxy Manager

Sideline expects to sit at the root of its own subdomain (for example `sideline.yourdomain.com`),
not under a path prefix.

1. In NPM, add a new **Proxy Host**.
2. **Domain Names**: your subdomain, e.g. `sideline.yourdomain.com`.
3. **Scheme**: `http`. **Forward Hostname/IP**: your Unraid box's LAN IP (or the Docker service
   name if NPM and Sideline share a Docker network). **Forward Port**: whatever host port you
   mapped to the container's 3000.
4. **Block Common Exploits**: on. **Websockets Support**: not required; Sideline does not use
   WebSockets yet.
5. Under the **SSL** tab, request a Let's Encrypt certificate and force SSL if you want HTTPS
   (recommended if you set `APP_PASSWORD`, so the password is not sent in plain text).
6. NPM forwards `X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Forwarded-Host` by default. Leave
   those on; Sideline trusts them to build correct URLs and to log real client IPs instead of
   NPM's own address.

No path rewriting or custom locations are needed; the default "forward everything" proxy host
is enough.

## Enabling the password

By default Sideline has no login. To add one:

1. Set `APP_PASSWORD` to the password you want.
2. Set `SESSION_SECRET` to a random string at least 32 characters long, for example the output
   of `openssl rand -hex 32`.
3. Restart the container. If `APP_PASSWORD` is set without a valid `SESSION_SECRET`, the app
   refuses to start and logs exactly that.

Put the app behind HTTPS (see the NPM section above) before relying on the password over the
internet; it protects against casual access on your LAN or through a reverse proxy, not against
network eavesdropping on its own.

## Troubleshooting

**Permission errors writing to `/data` (SQLite "unable to open database file", or files owned
by the wrong user on the host).** Your `PUID`/`PGID` do not match the owner of the host path you
mapped to `/data`. On Unraid, check what user/group owns your appdata share
(`ls -la /mnt/user/appdata/sideline` from the Unraid terminal) and set `PUID`/`PGID` to match, or
leave them at the default 99/100 and `chown -R 99:100` the path yourself. On macOS with Docker
Desktop or OrbStack, a bind mount from the Mac host does not reliably honor an arbitrary
`chown`; use a named Docker volume there instead of a host path bind mount.

**Container exits right after "APP_PASSWORD is set" in the logs.** `SESSION_SECRET` is missing
or shorter than 32 characters. Set it to the output of `openssl rand -hex 32` and restart.

**Port conflict on startup (`bind: address already in use`, or Unraid refuses to start the
container).** Another service is already using the host port you mapped. Change the host-side
port in `docker-compose.yml` (the left side of `"3000:3000"`) or the Unraid template's WebUI
Port field; the container's internal port can stay 3000.

**`/api/health` returns `degraded`.** This is normal right after first start or an update: it
means the database has not finished migrating or the worker has not sent its first heartbeat
yet. Give it a minute. If it stays `degraded`, check the container logs
(`docker logs sideline`, or the Unraid container's log tab) for the migration or worker startup
error.

**`/api/health` returns HTTP 503 with `status: "error"`.** The database cannot be opened at all,
usually a permission problem (see above) or a corrupted database file. Check the logs for the
specific error, and consider restoring from `/data/backups` (see above) if the database file
itself is damaged.

**Checking sync status.** `/api/health`'s `lastSync` field shows the most recently finished sync
job, its status, and when it finished. The worker logs each job as it runs; check
`docker logs sideline` (both the web and worker processes log to the same container log) for
details on a specific job.

## For contributors: reviewing on your phone during development

This is for working on the app from your own machine, not for a deployed server. It lets your
phone open the dev build over your home Wi-Fi.

1. In a terminal at the repo root, run `pnpm dev:lan`. It prints
   `Open http://<ip>:3000 on your phone (same Wi-Fi)`.
2. Open that address on your phone. Your computer and phone must be on the same Wi-Fi.
3. The first time, macOS asks "Do you want the application node to accept incoming network
   connections?" Click Allow. If you missed it, go to System Settings, Network, Firewall, and
   allow node.
4. To run the background sync worker locally, use `pnpm dev:worker` in a second terminal. It
   reads `.env` and uses `./data` unless you set `DATA_DIR`.

`pnpm run sync` also reads `.env` when it exists.

## A note on images

This repository builds a multi-arch (amd64 and arm64) image in CI on every push to `main`, but
does not currently publish it anywhere; `.github/workflows/ci.yml`'s Docker job verifies the
build only. Until a registry is configured, install by building from source (`docker compose
build`, or `docker build .` and tag it to match the Unraid template). If you want a published
image, raise it with Steph; publishing needs a registry decision and credentials this repo does
not currently have.
