# apps/sync-server/Dockerfile
#
# S67 D3 — multi-stage Docker build for the @pryzm/sync-server service.
# Build context MUST be the repository root.  See apps/api-gateway/Dockerfile
# for the full pattern explanation.

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
    --filter "@pryzm/sync-server..."

FROM node:20-alpine AS runtime
RUN apk add --no-cache wget tini
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /workspace

COPY --from=deps /workspace /workspace

ENV NODE_ENV=production
ENV SYNC_PORT=4000
EXPOSE 4000

ENTRYPOINT ["/sbin/tini", "--"]
WORKDIR /workspace/apps/sync-server
CMD ["pnpm", "start"]
