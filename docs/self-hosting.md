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

## Review on your phone (dev)

This is for working on the app from your Mac, not for the server. It lets your phone open the dev build over your home Wi-Fi.

1. In a terminal at the repo root, run `pnpm dev:lan`. It prints `Open http://<ip>:3000 on your phone (same Wi-Fi)`.
2. Open that address on your phone. Your Mac and phone must be on the same Wi-Fi.
3. The first time, macOS asks "Do you want the application node to accept incoming network connections?" Click Allow. If you missed it, go to System Settings, Network, Firewall, and allow node.
4. To run the background sync worker locally, use `pnpm dev:worker` in a second terminal. It reads `.env` and uses `./data` unless you set `DATA_DIR`.

`pnpm run sync` also reads `.env` when it exists.
