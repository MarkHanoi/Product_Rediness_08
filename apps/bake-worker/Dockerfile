# apps/bake-worker/Dockerfile
#
# S67 D3 — multi-stage Docker build for the @pryzm/bake-worker service.
# Build context MUST be the repository root.

FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /workspace

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages packages
COPY tools tools
COPY plugins plugins
COPY tests/audit-log-s57 tests/audit-log-s57
COPY tests/family-load-into-project tests/family-load-into-project
COPY tests/family-marketplace-publish tests/family-marketplace-publish
COPY apps apps

RUN pnpm install --frozen-lockfile --config.engine-strict=false \
    --filter "@pryzm/bake-worker..."

FROM node:20-alpine AS runtime
RUN apk add --no-cache wget tini
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /workspace

COPY --from=deps /workspace /workspace

ENV NODE_ENV=production
ENV BAKE_PORT=4001
ENV WORKER_CONCURRENCY=4
EXPOSE 4001

ENTRYPOINT ["/sbin/tini", "--"]
WORKDIR /workspace/apps/bake-worker
CMD ["pnpm", "start"]
