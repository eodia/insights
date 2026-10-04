# syntax=docker/dockerfile:1.7
#
# Image unique d'eodia insights : api, web, worker et mcp, choisis par l'argument du conteneur
# (`docker run eodia-insights api`, voir docker/entrypoint.sh). Les applications tournent
# depuis leurs sources TypeScript avec tsx ; seul le web est compilé (next build).
#
#   docker build -t eodia-insights .
#   docker build --build-arg API_URL=http://api:4100 -t eodia-insights .
#
# API_URL est lu par next.config.ts AU BUILD : les rewrites `/api/*` de Next y sont
# figés. Derrière Caddy (docker-compose.prod.yml), `/api/*` va directement à l'API et ce
# relais ne sert pas ; en mode `all`, l'API est sur 127.0.0.1:4100 (la valeur par défaut).

ARG NODE_VERSION=22

# ── Base : Node + pnpm ───────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    CI=1
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ── Dépendances : seulement les manifestes, pour garder la couche en cache ────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY apps/mcp/package.json apps/mcp/
COPY packages/catalog-schema/package.json packages/catalog-schema/
COPY packages/compiler/package.json packages/compiler/
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/package.json packages/core/
COPY packages/drivers/package.json packages/drivers/
COPY packages/engine/package.json packages/engine/
# tsx (devDependency) sert à l'exécution : on installe tout, sans élaguer.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ── Build : sources + next build ─────────────────────────────────────────────
FROM deps AS build
COPY . .
ARG API_URL=http://127.0.0.1:4100
ARG PUBLIC_URL=http://localhost:3100
ENV API_URL=${API_URL}
ENV PUBLIC_URL=${PUBLIC_URL}
RUN pnpm --filter @eodia/web build \
 && rm -rf apps/web/.next/cache \
 && sed -i 's/\r$//' docker/entrypoint.sh \
 && chmod +x docker/entrypoint.sh

# ── Exécution ────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    API_PORT=4100 \
    MCP_PORT=4200 \
    WEB_PORT=3100
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3100 4100 4200
ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker/entrypoint.sh"]
CMD ["all"]
