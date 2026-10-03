#!/bin/bash
# Runs as root (tini's direct child) so it can fix /data ownership and drop privileges per
# process. See docker/README.md for the design this implements (T4.3).
set -euo pipefail

PUID="${PUID:-99}"
PGID="${PGID:-100}"
DATA_DIR="${DATA_DIR:-/data}"
DB_FILE="$DATA_DIR/sideline.sqlite"
BACKUP_DIR="$DATA_DIR/backups"
KEEP=5

log() { echo "[entrypoint] $*"; }

mkdir -p "$DATA_DIR" "$BACKUP_DIR"
chown -R "$PUID:$PGID" "$DATA_DIR"

# Runs a command as the configured PUID/PGID. setpriv accepts raw numeric ids, so PUID/PGID never
# need an /etc/passwd entry (Unraid's 99/100 usually has none in the container's image).
run_as() {
  setpriv --reuid="$PUID" --regid="$PGID" --clear-groups -- "$@"
}

if [ -f "$DB_FILE" ]; then
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  backup_base="$BACKUP_DIR/sideline-$ts.db"
  log "backing up existing database to $backup_base"
  cp -p "$DB_FILE" "$backup_base"
  # WAL mode (packages/db) can leave committed data in -wal that is not yet in the main file;
  # copy it (and -shm) alongside so the trio restores to a consistent state.
  [ -f "$DB_FILE-wal" ] && cp -p "$DB_FILE-wal" "$backup_base-wal"
  [ -f "$DB_FILE-shm" ] && cp -p "$DB_FILE-shm" "$backup_base-shm"
  chown "$PUID:$PGID" "$backup_base" "$backup_base-wal" "$backup_base-shm" 2>/dev/null || true

  # Keep only the 5 most recent backups. Sort by filename (the embedded UTC timestamp sorts
  # chronologically), not mtime: `cp -p` preserves the source's mtime, which is not backup time.
  backups_to_prune="$(ls -1 "$BACKUP_DIR"/sideline-*.db 2>/dev/null | sort -r | tail -n +"$((KEEP + 1))")"
  if [ -n "$backups_to_prune" ]; then
    echo "$backups_to_prune" | while IFS= read -r old; do
      log "pruning old backup $old"
      rm -f "$old" "$old-wal" "$old-shm"
    done
  fi
fi

# The .bin/tsx shim is a shell script (not JS); invoke tsx's actual entry point with node directly.
TSX_CLI=/app/worker/node_modules/tsx/dist/cli.mjs

log "running migrations"
run_as node "$TSX_CLI" /app/worker/migrate.ts

log "starting web server (pid next)"
run_as node /app/apps/web/server.js &
WEB_PID=$!

log "starting worker (pid next)"
run_as node "$TSX_CLI" /app/worker/src/main.ts &
WORKER_PID=$!

log "web pid=$WEB_PID worker pid=$WORKER_PID"

set +e
wait -n "$WEB_PID" "$WORKER_PID"
exit_code=$?
set -e

if kill -0 "$WEB_PID" 2>/dev/null; then
  log "worker exited (code $exit_code); stopping web"
  kill "$WEB_PID" 2>/dev/null || true
else
  log "web exited (code $exit_code); stopping worker"
  kill "$WORKER_PID" 2>/dev/null || true
fi
wait "$WEB_PID" 2>/dev/null || true
wait "$WORKER_PID" 2>/dev/null || true

# Either process dying means the container is only half alive; always exit non-zero so Docker's
# restart policy brings the whole container (both processes) back up, even if the dying process
# happened to exit 0.
if [ "$exit_code" -eq 0 ]; then
  exit_code=1
fi
log "exiting ($exit_code) so the container restarts"
exit "$exit_code"
