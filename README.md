# Sideline

Sideline is a self-hosted fantasy football analyzer for Sleeper leagues. It connects to
Sleeper's public, read-only API (no login needed) and turns your league data into decisions:
who to start, who to pick up, how much to bid, and where every team stands, all computed under
your league's exact scoring rules. It runs as a single Docker container on your own server.

## Quickstart (self-hosting)

CI publishes a multi-arch (amd64 and arm64) image to `ghcr.io/ayostepht/sideline`. Tags:
`latest` (main), `sha-*`, and `v*.*.*` for releases. On Unraid, use the template at
`unraid/sideline.xml`. To build from source with Docker Compose:

```sh
cp .env.example .env   # fill in what you need; every value is optional except where noted
docker compose up -d --build
curl http://localhost:3000/api/health
```

For the full install guide (Docker Compose and Unraid), updates, backups and restores, every
environment variable, Nginx Proxy Manager setup, and troubleshooting, see
[`docs/self-hosting.md`](docs/self-hosting.md).

## Development

This is a pnpm workspace on Node 24 with TypeScript project references. Common commands:

```sh
pnpm install     # install workspace dependencies
pnpm verify      # typecheck, lint, format check, unit tests
pnpm dev:lan     # run the dev server reachable from your phone on the same Wi-Fi
pnpm dev:worker  # run the background sync worker locally
pnpm gate        # run every automated QA gate check, writes docs/gates/latest.json
```

See `PLAN.md` for the full product and architecture plan, and `CLAUDE.md` for how this repo's
agents work together.
