#!/bin/bash
# Runs as root (tini's direct child) so it can fix /data ownership and drop privileges per
# process. See docker/README.md for the design this implements (T4.3).
set -euo pipefail

PUID="${PUID:-99}"
PGID="${PGID:-100}"
DATA_DIR="${DATA_DIR:-/data}"
# Opt-in escape hatch for PUID=0/PGID=0 (see validate_id below). Off by default: running the app
# as root silently defeats the entire privilege-drop design this entrypoint implements.
SIDELINE_ALLOW_ROOT="${SIDELINE_ALLOW_ROOT:-0}"
DB_FILE="$DATA_DIR/sideline.sqlite"
BACKUP_DIR="$DATA_DIR/backups"
KEEP=5

log() { echo "[entrypoint] $*"; }
die() {
  log "ERROR: $*"
  exit 1
}

# Rejects PUID/PGID that are not a positive decimal integer, and (absent explicit opt-in) rejects
# exactly 0: setpriv --reuid=0/--regid=0 "drops" to root, which would run web and worker as root
# for the container's life with no indication anything went wrong.
validate_id() {
  name="$1"
  value="$2"
  case "$value" in
    '' | *[!0-9]*) die "$name must be a positive decimal integer, got '$value'" ;;
  esac
  if [ "$value" -eq 0 ] && [ "$SIDELINE_ALLOW_ROOT" != "1" ]; then
    die "$name=0 would run the web server and worker as root, defeating this entrypoint's privilege-drop design. Set SIDELINE_ALLOW_ROOT=1 to explicitly allow this (not recommended)."
  fi
}
validate_id PUID "$PUID"
validate_id PGID "$PGID"

# Guards against a misconfigured DATA_DIR (operator/env-controlled) turning the chown -R below
# into a destructive recursive re-own of an unintended part of the container filesystem.
validate_data_dir() {
  dir="$1"
  [ -n "$dir" ] || die "DATA_DIR must not be empty"
  case "$dir" in
    /*) ;;
    *) die "DATA_DIR must be an absolute path, got '$dir'" ;;
  esac
  case "$dir" in
    / | /app | /app/* | /etc | /etc/* | /usr | /usr/* | /bin | /bin/* | /sbin | /sbin/* | /lib | /lib/* | /root | /root/* | /home | /home/*)
      die "DATA_DIR='$dir' is a reserved system path; refusing to chown -R it. Set DATA_DIR to a dedicated data directory (default /data)."
      ;;
  esac
}
validate_data_dir "$DATA_DIR"

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
