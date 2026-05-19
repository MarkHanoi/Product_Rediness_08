# apps/editor/Dockerfile
#
# S67 D3 — multi-stage Docker build for the editor.
# Builds the root vite project (which produces both PRYZM 1 and PRYZM 2
# entry chunks per src/main.ts) and serves the resulting dist/ via nginx.
# nginx ALSO reverse-proxies /v1/* and WebSocket upgrades to api-gateway,
# so the user has a single front door at http://<host>:3000.
#
# Build context MUST be the repository root.

# ────────────────────────────────────────────────────────────────────
# Stage 1 — build the editor SPA from source.
# ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat git python3 make g++
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /workspace

# Full workspace context — root vite build pulls from packages/* and apps/editor.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages packages
COPY tools tools
COPY plugins plugins
COPY tests/audit-log-s57 tests/audit-log-s57
COPY tests/family-load-into-project tests/family-load-into-project
COPY tests/family-marketplace-publish tests/family-marketplace-publish
COPY apps apps
COPY scripts scripts
COPY src src
COPY index.html ./
COPY tsconfig.json vite.config.* ./

RUN pnpm install --frozen-lockfile --config.engine-strict=false

# Build the SPA.  The root build script is:
#   "build": "node scripts/check-project-isolation.mjs && tsc --skipLibCheck
#             && NODE_OPTIONS=--max-old-space-size=3072 vite build && ..."
# That produces dist/ with index.html + chunks.
RUN NODE_OPTIONS=--max-old-space-size=3072 pnpm run build || \
    (echo "Editor build failed.  Self-host editor image cannot be produced." && exit 1)

# ────────────────────────────────────────────────────────────────────
# Stage 2 — nginx runtime serving dist/ + reverse-proxying the API.
# ────────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
RUN apk add --no-cache wget tini

# Drop the default config and bring in ours.
RUN rm /etc/nginx/conf.d/default.conf
COPY pryzm-selfhost/nginx/editor.conf /etc/nginx/conf.d/editor.conf

# Copy the built SPA.
COPY --from=builder /workspace/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/healthz || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["nginx", "-g", "daemon off;"]
