# apps/api-gateway/Dockerfile
#
# S67 D3 — multi-stage Docker build for the @pryzm/api-gateway service.
# Build context MUST be the repository root (so pnpm-workspace.yaml + packages/*
# are visible).  pryzm-selfhost/docker-compose.yml sets this for you.
#
# Build (from repo root):
#   docker build -f apps/api-gateway/Dockerfile -t pryzm/api-gateway:dev .
#
# Run:
#   docker run --rm -p 5101:5101 -e API_GATEWAY_PORT=5101 pryzm/api-gateway:dev
#
# Notes:
#   * Image runs `pnpm start` which is `tsx src/index.ts` per the package.json.
#     A pre-compiled JS path lands at S67 D8 / S70 (lint + size pass).
#   * Multi-arch: this Dockerfile is arch-agnostic; ARM64 builds work via
#     `docker buildx build --platform linux/arm64,linux/amd64`.  CI publish
#     pipeline lands at S67 D5 (deferred — no CI/registry in dev env).

# ────────────────────────────────────────────────────────────────────
# Stage 1 — install workspace dependencies.
# We use the full repo so pnpm resolves workspace:* references.  In a
# follow-up we can switch to `pnpm deploy` for a slimmer runtime image.
# ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /workspace

# Copy lockfile + workspace manifest first for layer caching.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy every package.json before sources — pnpm needs the full workspace
# graph to resolve `workspace:*` deps.  Sources copied in stage 2.
COPY packages packages
COPY tools tools
COPY plugins plugins
COPY tests/audit-log-s57 tests/audit-log-s57
COPY tests/family-load-into-project tests/family-load-into-project
COPY tests/family-marketplace-publish tests/family-marketplace-publish

# Apps: copy each app's package.json.  We use --filter to only build
# the dep graph for api-gateway.
COPY apps apps

# `--config.engine-strict=false` mirrors the dev workflow's pnpm install policy.
RUN pnpm install --frozen-lockfile --config.engine-strict=false \
    --filter "@pryzm/api-gateway..."

# ────────────────────────────────────────────────────────────────────
# Stage 2 — runtime image.
# ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
RUN apk add --no-cache wget tini
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /workspace

# Bring over node_modules + workspace sources from deps stage.
COPY --from=deps /workspace /workspace

ENV NODE_ENV=production
ENV API_GATEWAY_PORT=5101
EXPOSE 5101

# tini = PID 1 reaper; reaps zombie tsx children cleanly on container stop.
ENTRYPOINT ["/sbin/tini", "--"]
WORKDIR /workspace/apps/api-gateway
CMD ["pnpm", "start"]
