# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# PRYZM editor — production container.
#
# Canonical contract: ADR-055 (docs/02-decisions/adrs/ADR-055-one-pryzm-cloudflare-supabase.md).
# This image hosts the Express + Vite + Socket.io editor on Fly.io. Postgres
# is Supabase (managed), so the image is stateless — no volumes, no DB sidecar.
#
# Two stages:
#   1. builder  — installs full deps (incl. devDeps), runs `pnpm run build:docker`,
#                 prunes to prod deps, swaps in the precompiled server deps, and
#                 SMOKE-BOOTS the result.
#   2. runtime  — copies only what's needed to boot, runs as non-root, exposes 5000.
#
# §L-442 (2026-08-09) — THE RUNTIME NO LONGER TRANSPILES AT BOOT.
# --------------------------------------------------------------
# Previously `dist/index.cjs` re-spawned `node --import tsx server.js`, so every
# cold boot registered the tsx loader and transpiled workspace TypeScript before
# `httpServer.listen()` was reached — and boot time IS scale-out latency.
#
# What was actually true (measured, not assumed): `server.js` and all of
# `server/**` are already plain JavaScript. Only TWO imports crossed into
# TypeScript — `@pryzm/crash-reporter` and `@pryzm/file-format/server` (74 source
# modules between them, not the "~100 packages" the old comment claimed). Those
# two are now precompiled to self-contained ESM by
# `scripts/build/build-server-deps.mjs` and swapped over the pnpm symlinks by
# `scripts/build/apply-server-deps-overlay.mjs`, so the runtime is plain `node`.
#
# Consequences for this image:
#   • no `tsx` anywhere in the runtime command line;
#   • `packages/`, `apps/`, `plugins/`, `tools/` are NO LONGER copied into the
#     runtime stage (~105 MB of TypeScript source that only tsx ever read);
#   • a hard smoke gate (`scripts/build/smoke-prod-boot.mjs`) boots the artefact
#     inside the builder and fails `docker build` if it cannot bind and serve.
#
# Measured on the dev box (median of 5, warm page cache, PRYZM_FORCE_INMEMORY=1):
#   boot→listen  BEFORE (tsx)  2500 ms      AFTER (plain node)  993 ms
# The residual ~1 s is npm dependency loading (express, socket.io, stripe,
# exceljs, pdf-lib…), which this change does not address.
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

# Build runs: project-isolation check → vite build → check+build server-deps →
# write-prod-shim.
# We use `build:docker` (NOT `build`) which OMITS the whole-repo `tsc --skipLibCheck`
# typecheck. Rationale: nothing in the image consumes tsc's output — the server half
# is hand-written JS and the two TypeScript workspace entry points are compiled by
# esbuild in `build:server-deps` (type-checking is not esbuild's job) — so tsc here is
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
# ─── §OBS-TRACING-COLLECTOR (L-10300) — THE BROWSER HALF OF THE TRACING SWITCH ──
# MEASURED 2026-08-24: 347 `trace.getTracer()` sites, 346 of them in the browser,
# and a span created with tracing OFF is a `NonRecordingSpan` with an all-zero
# trace context — DROPPED AT THE API, before any provider or exporter exists.
# `vite.config.ts`'s `defineTracing()` reads these three names at BUILD time and
# bakes them in as `__PRYZM_TRACING__` &c. (C10 §2.6.1); until this block existed
# the Dockerfile declared no such ARG, so a `--build-arg VITE_PRYZM_TRACING=…`
# was accepted by Docker and baked NOTHING — the exact silent-failure trap the
# deploy contract §3.2 documents.
#
# ⛔ ALL THREE DEFAULT EMPTY AND EMPTY MEANS OFF, BY CONSTRUCTION, NOT BY LUCK.
# `defineTracing()`'s `pick()` requires `v.length > 0`, so an empty value yields
# the JS literal `undefined`, `typeof __PRYZM_TRACING__ === 'undefined'` folds to
# the OFF branch, and the whole tracing path is dead-code-eliminated at zero
# runtime cost. An unset ARG and an empty ARG are therefore the SAME safe state
# here — which is deliberately UNLIKE `VITE_GLB_URL` above, where empty is a
# cliff. Adding these cannot affect a deploy that does not pass them.
#
# VALUES: `console` (stdout — dev/debug only, unsampled) · `otlp` (OTLP/HTTP JSON,
# and then VITE_OTEL_EXPORTER_OTLP_ENDPOINT is REQUIRED or the bundle refuses at
# boot and logs why) · anything else / empty → OFF.
ARG VITE_PRYZM_TRACING=""
ENV VITE_PRYZM_TRACING=${VITE_PRYZM_TRACING}
# Head sample ratio 0..1. Empty → `initTracing()`'s own default: 0.05 in otlp
# mode, 1.0 in console mode (C10 §2.6.3 carries the arithmetic — 288 spans and
# 126 KB per project-open unsampled, ~6.3 KB at 0.05).
ARG VITE_PRYZM_TRACING_SAMPLE=""
ENV VITE_PRYZM_TRACING_SAMPLE=${VITE_PRYZM_TRACING_SAMPLE}
# ⚠ PUBLIC by design — inlined into a bundle every visitor downloads, same
# posture as VITE_CESIUM_TOKEN. It MUST be an ingest endpoint that is safe to
# publish and CORS-enabled for the app origin. ⛔ There is deliberately NO
# `VITE_`-prefixed mirror of OTEL_EXPORTER_OTLP_HEADERS: that variable carries
# the collector auth token (classification SECRET) and `vite.config.ts` hard-codes
# `__PRYZM_TRACING_HEADERS__` to `undefined` so no future edit can leak it.
ARG VITE_OTEL_EXPORTER_OTLP_ENDPOINT=""
ENV VITE_OTEL_EXPORTER_OTLP_ENDPOINT=${VITE_OTEL_EXPORTER_OTLP_ENDPOINT}
RUN pnpm run build:docker

# Prune dev-only deps from node_modules so the runtime stage can copy a smaller tree.
# `--prod` keeps the workspace package symlinks (they're in `dependencies`).
RUN --mount=type=cache,target=/pnpm/store,sharing=locked \
    pnpm install --prod --frozen-lockfile --prefer-offline

# §L-442 step 1 — replace the two `@pryzm/*` symlinks the server imports with the
# precompiled bundles from dist-server-deps/. MUST come AFTER the `--prod` install
# (that install recreates the symlinks and would undo this) and BEFORE the smoke
# test (so the smoke test exercises exactly the graph that ships).
RUN node scripts/build/apply-server-deps-overlay.mjs --yes

# §L-442 step 2 — HARD GATE. Boot `node dist/index.cjs` for real, on a throwaway
# port, with no database, and require that it binds, answers /api/health/live with
# 200, answers / with a non-5xx, and shuts down on SIGTERM. Non-zero exit fails
# `docker build` here, before the runtime stage exists.
#
# This is the check the old design lacked: a bundler emitting a subtly broken
# module graph is WORSE than a slow boot, because the failure would otherwise
# surface on a scaled-out instance under load rather than in CI. Running it after
# the prod prune means it also proves no devDependency leaked into the boot path.
RUN node scripts/build/smoke-prod-boot.mjs

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
# server.js ships as LIVE JavaScript source and is NOT bundled (§L-442 keeps it
# unbundled on purpose: it computes `__dirname` from `import.meta.url` to find
# dist/ and public/, and bundling would relocate that anchor) — so these can be
# plain runtime ENV vars, read fresh by process.env at request time, rather than
# needing a build-time-baked JSON file.
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
# 1. Pruned node_modules — biggest layer; rarely changes vs source. This already
#    contains the §L-442 overlay: node_modules/@pryzm/{crash-reporter,file-format}
#    are real directories holding precompiled ESM, not symlinks into packages/.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
# 2. §L-442 — `packages/`, `apps/`, `plugins/` and `tools/` are NO LONGER copied.
#    They existed here only so the tsx loader could read `.ts` sources at boot
#    (~105 MB). Verified before removal: server.js + server/** contain exactly two
#    `@pryzm/*` import specifiers (both precompiled, both enforced by
#    scripts/build/check-server-deps.mjs) and ZERO filesystem reads of any
#    packages//apps//plugins//tools/ path. The remaining node_modules/@pryzm/*
#    entries are now dangling symlinks — harmless, because importing one is
#    precisely what the build-time guard forbids.
#    REVERT: re-add the four COPY lines and restore the tsx shim.
# 3. Server runtime — Express monolith + helpers (plain JS, run directly).
COPY --from=builder --chown=node:node /app/server.js ./server.js
COPY --from=builder --chown=node:node /app/server ./server
# 4. Client build output + static public assets the Express app serves.
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/public ./public
# 5. Manifests (pnpm resolves workspace links lazily on import).
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder --chown=node:node /app/pnpm-lock.yaml ./pnpm-lock.yaml
# 6. Vite config + tsconfig + index.html.
#    §L-442: these are NO LONGER read at boot (there is no tsx loader to read
#    tsconfig "paths"). They are retained only because server.js falls back to a
#    Vite middleware server when `dist/` is absent — a path this image never takes,
#    but one whose absence would turn a misbuild into a confusing crash instead of
#    a clear one. Combined size is a few KB; not worth the risk of removing.
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=node:node /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=builder --chown=node:node /app/vite.config.ts ./vite.config.ts
COPY --from=builder --chown=node:node /app/index.html ./index.html

USER node

EXPOSE 5000

# /api/health already exists in server.js (line 2000) — deep schema check.
# We use /api/health/live here (line 1988) because Docker's HEALTHCHECK is a
# liveness probe — readiness (DB connectivity) is owned by Fly's [http_service.checks]
# block in fly.toml. --start-period gives Express init ~30s; §L-442 removed the tsx
# transpile that used to eat much of that budget (measured 2500 ms → 993 ms to bind
# on the dev box). Kept at 30s deliberately: the container still has to page in a
# large npm dependency graph from a cold layer on first boot.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://127.0.0.1:5000/api/health/live || exit 1

# tini → node, ONE process. §L-442: dist/index.cjs used to `spawn()` a second node
# under `--import tsx` and forward signals to it; it now `import()`s server.js
# in-process, so tini's SIGTERM lands directly on the Express process.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "./dist/index.cjs"]
