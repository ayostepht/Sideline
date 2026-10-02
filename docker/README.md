# docker/

Reserved for the container entrypoint and supervisor (task T4.3).

What goes here later:

- `entrypoint`: runs as PID 1's child under tini. Applies `PUID` and `PGID` to `/data`, backs up the
  SQLite database to `/data/backups` (keep the last 5), runs migrations, then starts the web server
  and the worker.
- Supervisor behavior: if either the web process or the worker dies, exit non-zero so Docker
  restarts the container.

Until then, the `Dockerfile` at the repo root starts `node apps/web/server.js` directly.
