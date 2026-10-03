# syntax=docker/dockerfile:1

# ---- base: Node LTS plus pnpm ----
FROM node:24.21.0-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@12.8.1 && npm cache clean --force
WORKDIR /app

# ---- deps: install workspace dependencies from manifests only (cache friendly) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/providers/package.json packages/providers/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/sleeper/package.json packages/sleeper/package.json
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter "@sideline/web..." --filter "@sideline/worker..."

# ---- build: Next.js standalone output ----
FROM deps AS build
COPY . .
RUN pnpm --filter @sideline/web build

# ---- worker-build: self-contained production deploy of the worker (tsx runs its TS source
# directly, so there is no build step; `pnpm deploy` resolves workspace deps into a plain
# node_modules so the final image needs no symlinks back into a monorepo that is not shipped) ----
FROM deps AS worker-build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm deploy --filter @sideline/worker --prod /app/worker-out

# ---- runtime: slim image, tini as PID 1, dynamic PUID/PGID, web + worker supervised together ----
FROM node:24.21.0-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data \
    PUID=99 \
    PGID=100 \
    SIDELINE_MIGRATIONS_DIR=/app/packages/db/drizzle
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# The standalone bundle is traced from the monorepo root, so the server lives at apps/web/server.js.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
# Migrations are plain files the bundler cannot trace, so ship them and point the migrator at them.
COPY --from=build /app/packages/db/drizzle ./packages/db/drizzle
# Worker: self-contained pnpm deploy output (its own node_modules, including tsx).
COPY --from=worker-build /app/worker-out ./worker
COPY docker/migrate.ts ./worker/migrate.ts
COPY docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
# setpriv (util-linux) ships in the base node:*-bookworm-slim image already; no extra apt install.
# No USER instruction: the entrypoint starts as root (needed to chown /data and to drop privileges
# to an arbitrary PUID/PGID via setpriv, which has no /etc/passwd entry requirement), then execs
# the web and worker processes under that non-root uid/gid. See docker/README.md.
EXPOSE 3000
VOLUME /data
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
