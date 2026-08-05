# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# PRYZM editor — production container.
#
# Canonical contract: ADR-055 (docs/02-decisions/adrs/ADR-055-one-pryzm-cloudflare-supabase.md).
# This image hosts the Express + Vite + Socket.io editor on Fly.io. Postgres
# is Supabase (managed), so the image is stateless — no volumes, no DB sidecar.
#
# Two stages:
#   1. builder  — installs full deps (incl. devDeps) and runs `pnpm run build`,
#                 producing `dist/` (Vite client + `dist/index.cjs` prod shim).
#   2. runtime  — copies only what's needed to boot, runs as non-root, exposes 5000.
#
# Why we still ship `node_modules/` at runtime: the build emits `dist/index.cjs`
# which spawns `node --import tsx server.js` (see scripts/build/write-prod-shim.mjs).
# `server.js` imports ~100 workspace packages whose `main` is `./src/index.ts`,
# so tsx + the workspace source tree + runtime deps must all be present until
# Phase H ships per-package tsc outputs. We minimise this with `pnpm install --prod`
# below to drop devDeps (eslint, vitest, playwright, etc).
# ─────────────────────────────────────────────────────────────────────────────

# ─── Stage 1: builder ────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

# pnpm pinned to the exact version in package.json#packageManager. Bumping
# requires a coordinated bump there too — drift will fail CI on lockfile shape.
ARG PNPM_VERSION=10.26.1
# LOWMEM=1 makes vite skip the minify pass for a memory-starved builder. Default
# 0 = full minify: the supported deploy path is CI (GitHub Actions builds on a
# 16GB runner via `flyctl deploy --local-only`), which has ample RAM. Fly's
# MANAGED builder OOM-kills this build (exit 137) and can't be CLI-resized.
ARG LOWMEM=0
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    # CI=true makes pnpm strict about peer-dep mismatches and disables prompts.
    CI=true \
    # The root build script peaks ~5.5 GB heap on Vite chunking; 6 GB matches
    # the `node --max-old-space-size=6144` flag baked into package.json#scripts.build.
    NODE_OPTIONS="--max-old-space-size=6144" \
    # Driven by ARG LOWMEM (default 0 = full esbuild minify). When 1,
    # vite.config.ts skips the minify pass so the emit high-water mark fits a
    # memory-starved builder. CI (GitHub Actions, 16GB runner) builds at LOWMEM=0.
    PRYZM_LOWMEM_BUILD=${LOWMEM}

# Enable Corepack and pin pnpm. `corepack prepare ... --activate` is faster
# and reproducible vs `npm i -g pnpm`.
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app

# ── Deps layer (cached unless lockfile or workspace manifests change) ───────
# We deliberately copy ONLY the manifests first so Docker can cache the
# (slow) `pnpm install` layer across source edits.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Workspace package manifests — required for pnpm to resolve workspace:* refs.
# The wildcard hits every package.json under packages/, apps/, plugins/, tools/, tests/.
COPY packages packages
COPY apps     apps
COPY plugins  plugins
COPY tools    tools
# tests/* are pnpm workspace members too (pnpm-workspace.yaml). Only their
# package.json manifests survive .dockerignore (`!tests/*/package.json`); copying
# them here lets `pnpm install --frozen-lockfile` resolve the full workspace.
# Without this the install fails with ERR_PNPM_OUTDATED_LOCKFILE.
COPY tests    tests
# Note: we copied full source above (not just manifests) because the manifests
# are scattered across hundreds of subfolders and a fine-grained `**/package.json`
# copy isn't expressible portably in Docker. The trade-off: source edits invalidate
# the install layer. Acceptable for now; revisit when build minutes become precious.

RUN --mount=type=cache,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile

# ── Source + build ─────────────────────────────────────────────────────────
# Pull in the rest of the repo (server.js, scripts/, server/, vite.config.ts, etc).
# `.dockerignore` already strips docs, tests, MasterMiawW, .git, etc.
COPY . .

# Build runs: project-isolation check → vite build → write-prod-shim.
# We use `build:docker` (NOT `build`) which OMITS the whole-repo `tsc --skipLibCheck`
# typecheck. Rationale: the runtime executes TS source directly via `tsx` (see the
# prod-shim note above — nothing in the image consumes tsc's output), so tsc here is
# purely a CI type-gate, not an image input. CI still runs the full `build` (with tsc)
# on every PR. Dropping it from the image build removes tsc's heap spike and ~30–60s,
# leaving vite as the single memory peak (~5.5GB) — which is why this deploy uses a
# Depot builder (16GB) rather than Fly's 8GB legacy remote builder.
# Output: dist/ (client bundle + dist/index.cjs entrypoint).
#
# GIS-CESIUM-PHOTOREAL (2026-06-05) — optional Cesium ion token. When supplied as
# a build-arg (from the VITE_CESIUM_TOKEN CI/Fly secret), vite bakes it into the
# client bundle so the "3D globe" streams Google Photorealistic 3D Tiles + the ion
# satellite base (full photoreal). EMPTY (the default) → the keyless ESRI satellite
# basemap, no photoreal 3D buildings. Cesium ion tokens are PUBLIC client tokens by
# design (they ship in the browser bundle); scope the token to the streamed asset(s)
# and rotate it from the ion dashboard. Must be set BEFORE the build so vite sees it.
ARG VITE_CESIUM_TOKEN=""
ENV VITE_CESIUM_TOKEN=${VITE_CESIUM_TOKEN}
# GIS-CESIUM-GOOGLE-KEY (A.21.D31) — alternative real-tiles credential. A Google
# Maps Platform API key streams the SAME Google Photorealistic 3D Tiles directly
# (no Cesium ion account needed). Branch order in CesiumViewport.ts is ion-token →
# google-key → keyless. EMPTY (the default) → no effect, keyless fallback unchanged.
# Like the ion token this is a PUBLIC client key (it ships in the browser bundle) —
# restrict it to the Map Tiles API + your domain referrers in the Google Cloud
# console and rotate it there. Must be set BEFORE the build so vite bakes it in.
ARG VITE_GOOGLE_MAPS_KEY=""
ENV VITE_GOOGLE_MAPS_KEY=${VITE_GOOGLE_MAPS_KEY}
# L-570 OBJECT-STORAGE-GLB — base URL of the re-hosted furniture catalogue on
# Cloudflare R2 (`pryzm-assets/items/`). `public/items/**` (~186 MB, 164 GLBs) is
# .dockerignore'd OUT of this image on purpose, so every `/items/**` request 404s
# in prod unless the client is told where the catalogue actually lives. This value
# is NOT a secret — it is a public CDN base URL that ships in the bundle by design.
# EMPTY (the default) → the client keeps the local `/items/…` path, which is what
# local dev wants (vite serves public/items/ directly). Must be set BEFORE the
# build: `VITE_*` is INLINED by vite at build time, so setting it as a Fly RUNTIME
# secret has no effect whatsoever. Verify with: grep -r 'r2.dev' dist/assets | head
ARG VITE_GLB_URL=""
ENV VITE_GLB_URL=${VITE_GLB_URL}
# L-513b context tiles — base URL of the baked PMTiles (`pryzm-assets/tiles/`).
# Same build-time/inlining rules. Also public. EMPTY (the default) → the client
# falls back to live Overpass, i.e. today's behaviour, so setting it is the only
# step needed to switch the 3D-Site context onto static tiles once they are baked.
ARG VITE_CONTEXT_TILES_URL=""
ENV VITE_CONTEXT_TILES_URL=${VITE_CONTEXT_TILES_URL}
RUN pnpm run build:docker

# Prune dev-only deps from node_modules so the runtime stage can copy a smaller tree.
# `--prod` keeps the workspace package symlinks (they're in `dependencies`).
RUN --mount=type=cache,target=/pnpm/store,sharing=locked \
    pnpm install --prod --frozen-lockfile --prefer-offline

# ─── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

# tini gives us proper PID-1 signal handling (graceful SIGTERM → SIGINT → exit).
# Without it, Fly's machine-stop sends SIGTERM directly to node which sometimes
# leaves Socket.io clients hanging.
RUN apt-get update \
 && apt-get install --no-install-recommends -y tini ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    # Bind explicit. server.js already uses `process.env.PORT || 5000` + 0.0.0.0.
    PORT=5000 \
    # Disable npm telemetry / update notifier at runtime.
    npm_config_update_notifier=false

# ── Build/deploy provenance (GET /version, server.js) ───────────────────────
# server.js runs as LIVE source under tsx (see the prod-shim note at the top of
# this file) — it is never bundled/inlined the way VITE_* client build-args are
# — so these can be plain runtime ENV vars, read fresh by process.env at request
# time, rather than needing a build-time-baked JSON file.
#   • GitHub Actions passes real values: --build-arg GIT_SHA=${{ github.sha }}
#     --build-arg GIT_BRANCH=${{ github.ref_name }} --build-arg BUILT_AT=<UTC ISO>
#     --build-arg RUN_NUMBER=${{ github.run_number }} (see deploy-fly.yml).
#   • A manual `flyctl deploy` that does NOT pass these build-args gets the
#     literal string "unknown" here — never a fabricated/guessed value. The
#     `scripts/deploy/local-deploy.mjs` helper populates them for you via
#     `git rev-parse HEAD` for exactly this case (Objective 5).
ARG GIT_SHA=unknown
ARG GIT_BRANCH=unknown
ARG BUILT_AT=unknown
ARG RUN_NUMBER=unknown
ENV GIT_SHA=${GIT_SHA} \
    GIT_BRANCH=${GIT_BRANCH} \
    BUILT_AT=${BUILT_AT} \
    RUN_NUMBER=${RUN_NUMBER}

# Run as non-root. `node` user comes preinstalled on the official node image (uid 1000).
WORKDIR /app

# Copy ONLY runtime artefacts from the builder. Order: largest-cache-stable first.
# 1. Pruned node_modules — biggest layer; rarely changes vs source.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
# 2. Workspace source — required by tsx loader at runtime (see prod-shim note above).
COPY --from=builder --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/apps ./apps
COPY --from=builder --chown=node:node /app/plugins ./plugins
COPY --from=builder --chown=node:node /app/tools ./tools
# 3. Server runtime — Express monolith + helpers.
COPY --from=builder --chown=node:node /app/server.js ./server.js
COPY --from=builder --chown=node:node /app/server ./server
# 4. Client build output + static public assets the Express app serves.
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/public ./public
# 5. Manifests (pnpm resolves workspace links lazily on import).
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder --chown=node:node /app/pnpm-lock.yaml ./pnpm-lock.yaml
# 6. Vite config + tsconfig — tsx ESM loader reads tsconfig at boot for paths.
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=node:node /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=builder --chown=node:node /app/vite.config.ts ./vite.config.ts
COPY --from=builder --chown=node:node /app/index.html ./index.html

USER node

EXPOSE 5000

# /api/health already exists in server.js (line 2000) — deep schema check.
# We use /api/health/live here (line 1988) because Docker's HEALTHCHECK is a
# liveness probe — readiness (DB connectivity) is owned by Fly's [http_service.checks]
# block in fly.toml. --start-period gives the tsx loader + Express init ~30s.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://127.0.0.1:5000/api/health/live || exit 1

# tini → node (NOT npm/pnpm) so SIGTERM goes straight to the prod shim, which
# re-spawns server.js with `--import tsx`. The shim forwards signals (stdio: inherit).
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "./dist/index.cjs"]
