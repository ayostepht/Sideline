# Self-hosting Sideline

This page is a stub for T1.8. The full guide (Unraid, Nginx Proxy Manager, backup and restore,
env reference) lands with T4.3.

## Run it with Docker

```sh
docker compose up -d --build
curl http://localhost:3000/api/health
```

- The app listens on port 3000 and keeps its SQLite database in the `/data` volume.
- The image runs as the non-root `node` user (uid 1000). `/data` is owned by that user in a fresh volume.
- On a new, empty volume the health endpoint returns 200 with status `degraded`. That means the
  web app is up but the database is not migrated yet and the worker has not reported in.
- Migrations are bundled at `/app/packages/db/drizzle` and found through `SIDELINE_MIGRATIONS_DIR`.
- The image builds for linux/amd64 and linux/arm64. better-sqlite3 ships prebuilt binaries for both,
  so no compiler is needed in the build.
