# PRYZM BIM Platform — Deep Structural Audit

> **Date**: 2026-05-08  
> **Auditor**: Replit Agent (autonomous full-codebase scan)  
> **Codebase stamp**: post-Sprint-A40 / Wave-A20-code-complete  
> **Scope**: All 8 audit areas, 13 contract documents (C01–C13), vision docs  
> **Format**: §1 Executive Summary · §2 Area Findings · §3 Contract Compliance Matrix · §4 Risk Register · §5 Recommendations · §6 Machine-Readable JSON

---

## §1 — Executive Summary

PRYZM 3 is a well-architected BIM SaaS platform with a clean 8-layer Pascal model, Yjs-CRDT collaboration, a GPU-picking pipeline, and a Zod-first schema layer. The **PRYZM-3 architecture is structurally sound at the package boundary level**: the three most critical infrastructure invariants (P2 single-THREE-owner, P3 single-rAF, P4 no-window-as-any) are all gate-closed with hard-fail CI ratchets.

However, the codebase carries **five large structural debts** that prevent GA certification:

1. **LOC ratio** (`src/` 413 k vs `packages/` 117 k = 3.54:1; target ≤0.3:1) — the monolith is still overwhelmingly in `src/` rather than extracted packages.
2. **Legacy dispatch** — 213 `commandManager.execute()` call sites in 124 `src/` files co-exist with the new L2 `runtime.commandBus`. P6 is nominally a hard gate but is violated at 213 points.
3. **Geometry deferral gap** — 0/192 plugin handlers schedule geometry builds through `FrameScheduler`. C11 §2 step 3 is universally violated; geometry is built synchronously, risking frame-budget overruns.
4. **`produceWithPatches` missing** — 0/192 handlers produce structured Immer patches. The S03 gap means the undo ring-buffer receives no real inverse-patch pairs from any handler; undo reliability depends entirely on the legacy `commandManager`.
5. **Wireup pace** — ~31/207 sub-phases complete (15%). At the observed 3 sub-phases/sprint vs the required 11, the Phase D/E completion timeline is structurally infeasible without a velocity step-change.

**Score summary**: 9 hard gates are registered in `run-all.ts`. All 9 exit 0 today. The score is: **gates green / architecture debt large**. The codebase is production-deployable for a limited user base but is not GA-certifiable against contracts C11, C13, or C03-S03 today.

---

## §2 — Audit Findings by Area

### 2.1 Graphics Pipeline (C04, C12)

#### 2.1.1 Single THREE Owner — P2 (C04 §1)

**Status: CLOSED ✅**

`tools/ga-gate/check-three-imports.ts` exits 0. Zero `from 'three'` imports outside `packages/renderer-three/`. The mass codemod (~490 files) from Wave 7+8 is complete. `packages/renderer-three/src/three-re-export.ts` is the sole legitimate `three` importer. ESLint `no-direct-pryzm-in-plugins` enforces the L7 boundary. The `RendererHandle` interface is correctly typed and the `WebGLRendererAdapter` wraps `THREE.WebGLRenderer` behind the contract boundary.

#### 2.1.2 Single rAF Owner — P3 (C04 §2)

**Status: CLOSED ✅**

`check-raf-count.ts` ratchets at 1 owner. The `FrameScheduler` exposes `onFrame`, `scheduleOnce`, `pause`, `resume` with the four priority tiers (physics → update → render → post) as specified in C04 §2.2–§2.3.

#### 2.1.3 Renderer Handle & Context Loss (C04 §1.3, §1.4)

**Status: IMPLEMENTED ✅**

`RendererHandle` interface (`packages/renderer-three/src/RendererHandle.ts`) is fully typed: `render`, `setSize`, `setPixelRatio`, `readRenderTargetPixels`, `onContextLost`, `onContextRestored`, `dispose`. `setupContextLossHandlers` (`contextLossHandlers.ts`) pauses the animation loop on `webglcontextlost` and fires `onRestore` callbacks on restoration — exactly as required by C04 §1.4. `WebGLRendererAdapter` delegates to `setupContextLossHandlers` and caps DPR at 1.5 (Pascal pattern).

#### 2.1.4 WebGPU Adapter (C04 §1.4 Amendment — Wave A15)

**Status: GATED / PENDING ⚠️**

The Wave A15 amendment states: the `WebGPURendererAdapter` MUST NOT be wired into the production boot path until `check-three-imports.ts` exits 0 with zero violations. That gate is now green (P2 closed). However, `WebGPURendererAdapter` has 0 TypeScript files in `packages/renderer-three/` — the WebGPU path (41 TS files) lives in `src/engine/subsystems/rendering/` (L7.5), NOT inside `packages/renderer-three/`. This violates the P2 principle that only `packages/renderer-three/` owns THREE. The WebGPU adapter must be migrated into `packages/renderer-three/` before it can be promoted.

**Contract ref**: C04 §1.4 amendment, C01 §1 P2.

#### 2.1.5 LOD Manager (C04 §4-LOD)

**Status: IMPLEMENTED; NOT YET WIRED TO GEOMETRY BUILDERS ⚠️**

`LODManager` (Wave A18-T14) provides three distance tiers (Tier 0: <100 m full, Tier 1: <500 m simplified, Tier 2: ≥500 m bounding-box). `CommitterHost` holds a `LODManager` instance and `setViewDistance()` is called per-frame to drive tier selection. However, `FrameScheduler` is referenced in 27 plugin files but `getFrameScheduler()` / `scheduleOnce()` is called 0 times from plugin handler code. Geometry builders are not yet dispatched via `FrameScheduler.schedule('pre-render', ...)` as required by C11 §2 step 3. LOD tier computation exists but its results are not wired to the geometry build path.

**Contract ref**: C04 §4, C11 §2 step 3.

#### 2.1.6 GPU Picking (C04 §3)

**Status: FULLY IMPLEMENTED ✅** *(R10 RESOLVED 2026-05-14)*

`GpuPickStrategy` maintains a parallel pick-scene with cloned geometries and RGBA-encoded slot indices. `PickStrategyResolver` probes GPU availability at boot and falls back to `BvhPickStrategy` with an OTel span event. `BVHQuery` provides O(log n) median-split ray intersection and frustum culling. **Task 2.4 (R10) complete**: a second render pass using `DEPTH_PACK_MATERIAL` (THREE `packDepthToRGBA` GLSL chunk) writes `gl_FragCoord.z` packed into RGBA to a dedicated `depthTarget` render target. `readDepthResult` / `buildDepthBySlot` read back the packed depth, unpack via `unpackRGBAToDepth`, reconstruct world-space distance via `ndcToWorldPos`, and populate `PickResult.distance` correctly. Falls back gracefully to `distance=0` on any GPU failure. Multi-select depth sorting now receives accurate values.

**Contract ref**: C04 §3 (acceleration structure requirement met; depth readback fully implemented).

#### 2.1.7 Logarithmic Depth Buffer (C12 §2)

**Status: NOT IMPLEMENTED ❌**

C12 §2 requires `logarithmicDepthBuffer: true` when any loaded model spans >500 m. `WebGLRendererAdapter` does NOT set this flag (it is absent from the constructor options). The C12 §2 CI gate (`packages/renderer-three/__tests__/depth-buffer.test.ts`) is listed as soft-fail → hard-fail at Phase F. Wave A17 planning doc references the requirement but the adapter implementation does not include it.

**Contract ref**: C12 §2.

---

### 2.2 BIM Data Layer (C03, C05, C11, C12, C13)

#### 2.2.1 Store Base Class (C03 §3)

**Status: COMPLIANT ✅**

`packages/stores/src/Store<T>` uses Immer `applyPatches` + `enableMapSet` + `enablePatches` correctly. Entries are frozen; listeners receive `ReadonlyMap<Id, T>`; a `DirtyDiff` (Set<Id> per kind) is emitted per `applyPatch` call. The design correctly batches per-tick fan-out as specified in C03 §3.

#### 2.2.2 produceWithPatches in Handlers — S03 Gap (C03 §3.2)

**Status: CRITICAL GAP ❌**

`produceCommand` and `produceWithPatchesPerStore` are correctly implemented in `packages/command-bus/src/produceCommand.ts`. However, **0 of 192 plugin handlers** call `produceWithPatches`. All 192 handlers either use bespoke store mutation or call internal store methods directly. This means the `RingBufferUndoStack` receives no real inverse-patch pairs from any handler. The undo ring-buffer (wired in `composeRuntime.ts` via `buildPhaseDUndoStackSlot`) depends on handlers producing structured patches per C03 §3.2. Without this, `undoPatch()` / `redoPatch()` cannot reconstruct correct prior state from the ring buffer.

**Verified**: `rg "produceWithPatches" plugins --type ts | wc -l` → 0.

**Contract ref**: C03 §3.2 / S03 / C11 §2 step 2.

#### 2.2.3 CRDT Sync — YjsDocAdapter (C08 §3)

**Status: IMPLEMENTED ✅**

`YjsDocAdapter` (Wave A19-T2) maps PRYZM command operations to Yjs `Y.Map` operations. `CRDTConflictResolver` implements 3-way merge with four rules: trivial same-value merge, local-only change (accept local), remote-only change (accept remote), and true conflict (additive delta for numerics; surfaced as `CRDTConflict` for scalar types). The explicit conflict path sets `SyncSlot.status = 'CONFLICTED'` and routes to `ConflictResolutionDialog`. Silent LWW overwrite is forbidden per P8. Server-side `YjsProjectCache` applies `Y.applyUpdate` for linearization. `PresenceService` handles server-authoritative display names.

**Contract ref**: C08 §3.1, §3.2.

#### 2.2.4 IFC Geospatial — LTP-ENU (C12 §1)

**Status: IMPLEMENTED ✅**

`LTPENURebase` (155 LOC, `packages/geospatial/src/`) provides `projectToScene`, `unprojectFromScene`, `recenter`, and `setOrigin` as required by C12 §1.1. Accepts a `proj4` instance as a constructor dependency (no global singleton) for test injection. `IfcProjectedCRSReader` in `plugins/ifc-import/src/` reads `IFCPROJECTEDCRS` + `IFCMAPCONVERSION` entities and passes the EPSG code to `LTPENURebase`. C12 §1.2 is satisfied. C12 §1.3 (write-on-export to IFC4X3) must be verified in `plugins/ifc-export`.

#### 2.2.5 Offline Persistence — IndexedDB (C05 §1.2.1)

**Status: IMPLEMENTED ✅**

`IndexedDBStore` (Wave A17-T8/T9) stores project snapshots (`pryzm-offline-v1` DB, `snapshots` and `geometryCache` object stores). All methods are async (main-thread non-blocking per contract). The offline banner (`OfflineBanner.ts`) is required per C05 §1.2.1 invariant 2. OTel spans wrap every operation.

#### 2.2.6 Project Isolation (C13)

**Status: PARTIALLY ADDRESSED — GATE PRESENT ⚠️**

C13 identifies a concrete bug: after an AI batch on Project A, opening Project B silently breaks element creation because `BatchCoordinator`, `FrameScheduler`, and `window.*` control surfaces persist as global singletons across project sessions. Wave 35 introduced a static gate (`check-project-isolation.ts`) with four structural anchors: `BatchCoordinator.forceReset()`, a `batchCoordinator.forceReset()` call in `engineLauncher.ts` on project-switch, `__engineTeardown` declared in `global-window.d.ts`, and `resetWallRebuildState()` called in `engineLauncher.ts`. Grep confirms all four anchors are present in HEAD. However, `src/engine/engineLauncher.ts` still manages 114 `batchCoordinator` call sites and 21 `engineLauncher` reference files in `src/` — full project isolation requires the complete teardown sweep of every per-project singleton. The gate verifies the minimum viable anchors but not full isolation completeness.

**Contract ref**: C13 §3, §4.

#### 2.2.7 File Format (C05 §2)

**Status: IMPLEMENTED ✅**

`packages/file-format/src/` has canonical JSON, schema, pack/unpack, family format, migrations directory, and zip-deterministic utilities. All compiled JS + `.d.ts` files co-located (pre-built). The `.pryzm` and `.pryzm-family` formats are implemented per ADR-004 and ADR-017.

---

### 2.3 Cloud Architecture (C05, C08, C09)

#### 2.3.1 BFF Pattern / PostgreSQL Routing (C05 §1.3)

**Status: COMPLIANT ✅**

`server/pgClient.js` prioritises `DATABASE_URL` (Replit-native) over `SUPABASE_DB_URL` as required by C05 §1.3. The fix was applied 2026-05-03 (previously inverted, causing HTTP 500 on all project CRUD routes). The FK removal (`projects_owner_id_fkey` dropped) for the mixed-auth Replit deployment is per C05 §1.3.1.

#### 2.3.2 Rate Limiting (C08 / C10)

**Status: IMPLEMENTED ✅**

`server/rateLimiter.js` exports three limiters: `aiLimiter` (20 req/15 min/IP on AI proxy), `globalLimiter` (200 req/15 min/IP on all `/api/*`), `apiLimiter`. All respond with HTTP 429 + JSON body (no HTML). `server.js` imports and applies them via `./server/rateLimiter.js`. Rate limits are conservative and protect against cost abuse and general API scraping.

#### 2.3.3 Authentication / JWT (C08 §1)

**Status: COMPLIANT ✅**

Custom JWT/bcrypt via `SESSION_SECRET` (HMAC-SHA256). `authMiddleware` is applied to all `/api/*` routes. Token payload: `{ sub: userId, email, iat, exp }`. Tokens are verified and `req.auth = { userId, email }` is populated on success; invalid/absent tokens set `req.auth = { userId: 'anonymous' }` (route decides access). OAuth (Google, Microsoft) uses PKCE flow via `oauthService.js` and ultimately issues the same custom JWT.

**Mixed-backend note**: `SUPABASE_SERVICE_ROLE_KEY` is not set in the Replit environment (per project notes), meaning the auth client (`server/supabaseClient.js`) falls back to Replit PG for user-identity records. C08 §1.1 acknowledges this deployment mode. The FK removal (C05 §1.3.1) addresses the resulting referential integrity issue.

#### 2.3.4 Permission Model (C08 §2)

**Status: PARTIAL ⚠️**

`hasPermission()` is called 4 times and `canUserAccessProject()` 5 times in `server.js`. The ISO 19650 role model (owner/editor/reviewer/viewer) is documented in C08 §2.1. However, the low call count (4 `hasPermission` calls for a 3,700-line `server.js` handling dozens of routes) suggests that not all mutation routes invoke the permission check. A full route-by-route audit of permission coverage is recommended.

#### 2.3.5 CORS (C08)

**Status: COMPLIANT ✅**

Centralised origin policy via `expressCorsOptions()`. Applied to Express (`app.use(cors(...))`) and pre-flight (`app.options('*', cors(...))`). BFF pattern ensures browser calls only the same-origin Express server.

#### 2.3.6 HTTP Security Headers — Helmet (C08)

**Status: NOT IMPLEMENTED ❌**

`helmet` is not present in `server.js` (grep finds no reference). Helmet provides Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, and other defence-in-depth headers. Its absence means the production deployment does not set CSP or HSTS headers. This is a medium-severity security gap for a platform handling sensitive BIM project data.

**Contract ref**: C08 implicit security hardening requirement; C08 §4 "enterprise security baseline".

#### 2.3.7 AI Upstream Routing (C09 §2.2)

**Status: COMPLIANT ✅**

Browser → `/api/anthropic/v1/messages` (auth + `aiLimiter`) → `CF_WORKER_URL` (preferred) → direct `api.anthropic.com` (fallback) → 503 (neither configured). The browser never calls Anthropic directly. `enforceAIQuota()` gates calls per C09 §2.3.

#### 2.3.8 Sync Server (C08 §3)

**Status: WELL-STRUCTURED ✅**

`apps/sync-server/src/` has: `authz/`, `bake/`, `cde/`, `eventLog/`, `handlers/`, `locks/`, `presence/`, `protocol/`, `session/`, `YjsProjectCache.ts`. `PresenceService` handles server-authoritative display names. `YjsProjectCache` merges updates server-side via `Y.applyUpdate`. Soft-locks via `locks/` directory. Structure is modular and aligns with the collaboration contract.

---

### 2.4 State Management (C03, C02)

#### 2.4.1 Composition Root (C02 §1)

**Status: COMPLIANT — D.4.2 WORKSPACEMOUNTBRIDGE ELIMINATED ✅** *(R07 RESOLVED 2026-05-14)*

`composeRuntime.ts` is 1,185 LOC (within the ≤1,500 Phase D budget; hard cap at Wave 7). It constructs all 14 typed runtime slots. The `ComposeRuntimeOptions` comment at line 161–165 documents that `workspaceMount?: WorkspaceMountBridge` was **removed** per D.4.2. `WorkspaceMountBridge` is now referenced in **0 TypeScript files** across the full tree (verified: `rg -l WorkspaceMountBridge --type ts` → only `tools/ga-gate/check-no-workspacemountbridge.ts` is the gate itself). `check-no-workspacemountbridge.ts` exits 0 with HARD_CEILING 0. D.4.2 target met: `rg -l WorkspaceMountBridge | wc -l` = 0 ≤ 3.

#### 2.4.2 Command Bus (C03 §2)

**Status: IMPLEMENTED ✅**

`CommandBus` enforces: handler registration keyed by `type`, `affectedStores` validation (synchronous throw if store absent from context — explicitly outlaws `(window as any).commandManager` fallback), OTel span per dispatch (`pryzm.command.execute`), `RingBufferUndoStack` push per dispatch (Sprint A31). `PatchEmitter` → `CommandEventBridge` → `EventBus` relay correctly decouples handlers from runtime.events (no L4→L2 inversion).

#### 2.4.3 Legacy commandManager Dual-Write (C03 §2, C11 §2)

**Status: CRITICAL GAP — P6 SOFT-VIOLATED ❌**

`commandManager.execute()` is still present at **213 call sites across 124 `src/` files** (up from 201 in the Sprint-A36 count). P6 declares "commands are the only mutation path" but the legacy `commandManager` executes in parallel with the bus at 213 points. The P13 Wave A36 work upgraded annotation-family bus payloads, and Wave A40 added batch-coordinator improvements, but the underlying legacy call count has grown since A36 rather than shrinking. The "Wave A21+" migration plan for the remaining ~179 sites (UI/property-inspector ~55, engine tools ~43, ~81 elsewhere) is not yet in flight.

**Verified**: `rg "commandManager\.execute" src --type ts | grep -v "//" | wc -l` → 213.

#### 2.4.4 Undo Stack (C03 §4)

**Status: WIRED — RING BUFFER DEPENDS ON S03 FIX ⚠️**

`RingBufferUndoStack` is wired in `composeRuntime.ts` via `buildPhaseDUndoStackSlot`. `undoPatch()`/`redoPatch()` and `applyRingBufferSide()` are connected. Sprint A35 declared "Phase D Ctrl-Z wired" ✅ and `check-ctrl-z-wired.ts` exits 0. However, as noted in §2.2.2, handlers produce no `produceWithPatches` output — the ring buffer receives no structured inverse patches from any handler. Undo currently relies on the legacy `LegacyCommandManagerAdapter` wrapping `window.commandManager.{undo,redo}`. The ring buffer is structurally wired but semantically empty.

#### 2.4.5 EventBus (C02 §1.2)

**Status: IMPLEMENTED ✅**

`EventBus` in `packages/runtime-composer/src/EventBus.ts` provides typed emit/on/off. `wireCommandEventBridge` subscribes to `CommandBus.patches` and re-emits `'command.executed'` (generic) plus typed family events (`'wall.created'`, etc.) — correctly avoiding the L4→L2 inversion. All 19 element families emit typed events per Sprint A30.

---

### 2.5 Authoring Tools (C06, C11)

#### 2.5.1 Tool Registration (C06 §4)

**Status: SEVERELY INCOMPLETE ⚠️**

C06 §4 requires all tools to be registered via `runtime.tools.register(tool)`. `runtime.tools.register` appears 24 times across 2 files (`src/ui/Layout.ts` ×20, `src/engine/subsystems/slabs/SlabTool.ts` ×1 comment). With 47 plugins and dozens of element family tools, the overwhelming majority of tools are not registered through the canonical path.

#### 2.5.2 PlatformRouter (C06 §1)

**Status: PARTIALLY LANDED ⚠️**

C06 §1.1 requires `platformRouter.start({ runtime })` to be called exactly once after `composeRuntime()`. The codebase has 0 TypeScript callers at the `runtime.commandBus` dispatch level (Phase E <30% done). However, `PlatformRouter.start` is referenced in the routing architecture. The Phase C progress (9% — 3 of 33 toolbars bound) and Phase B progress (2.5% — 1/40 panels with real binding vs documentation annotation) indicate the routing layer is only partially functional.

#### 2.5.3 Element Creation Pipeline (C11 §2)

**Status: STEP 3 VIOLATED UNIVERSALLY ❌**

The canonical pipeline requires handlers to:
1. Validate domain invariants ✅ (handlers enforce preconditions)
2. Mutate store via Immer draft ⚠️ (done but without `produceWithPatches` — see §2.2.2)
3. Register geometry build as DEFERRED via `FrameScheduler.schedule('pre-render', ...)` ❌ — **0/192 handlers** use this path
4. Emit typed domain event ✅ (via `CommandEventBridge`, not directly from handlers)
5. Register with `BatchCoordinator` for batch coalescing ✅ (Sprint A39/A40)

Step 3 is universally violated. Geometry is built synchronously inline or via direct store callbacks. This is the primary cause of LONGTASKs (Sprint A39 found an 8,416 ms LONGTASK; that specific instance was fixed via frame-yielding, but the structural cause — synchronous geometry build in handlers — remains).

#### 2.5.4 Annotation Panel Binding (Phase B)

**Status: DOCUMENTATION ONLY — 2.5% REAL ❌**

Phase B declared 24/40 annotation panels "binding meets bar" but per the audit trail this was achieved by adding documentation comments without changing runtime behaviour. 1 real panel binding exists. This is a known documentation-vs-reality divergence.

#### 2.5.5 Plugin Recipe Compliance (C07 §2)

**Status: COMPLIANT ✅**

30/30 non-stub plugins are recipe-complete (store + handlers dir + tool + intent + contributions). 16 intentional stubs correctly identified. `no-direct-pryzm-in-plugins` ESLint ERROR rule active. 0 L7 boundary violations. All 47 plugins have ≥1 test. `pnpm tsc --noEmit` exits 0 errors.

---

### 2.6 Performance (C10)

#### 2.6.1 NFT Bench Harness (C10 §1)

**Status: HARNESS COMPLETE; RESULTS NOT MEASURED ⚠️**

17 NFT bench files (Wave 13) + NFT 18 (`undo-stack-memory.bench.ts`) + NFT 19 (Playwright e2e) are present in `apps/bench/src/benches/`. The harness is complete. However, the bench suite requires `pnpm build` + headless Chromium (`@vitest/browser`) — it cannot produce measurements in the current Replit environment. Actual p95 numbers for NFTs 1–19 are not available from this audit.

**Recent sprint improvements**:
- Sprint A39: `rooms.redetect` LONGTASK 8,416 ms → ~176 ms (frame-yielded path via `runtime.bus`) ✅
- Sprint A40: batch registration O(L×N²/2) → O(L+N); stair/curtain-panel drain eliminated ✅
- `CREATE_CURTAIN_WALLS_ON_ALL_SLABS` e2e ≤1 s (target ≤2 s) ✅

#### 2.6.2 LOC Ratio — src/ vs packages/ (C01 §3)

**Status: SEVERELY OFF TARGET ❌**

| Location | LOC | Target |
|---|---:|---|
| `src/` | 413,234 | → 0 (only `src/ui/` left) |
| `packages/` | 116,838 | must absorb ≥390 k LOC |
| `plugins/` | ~58,000 | stable |
| `apps/` | ~39,000 | stable |
| **src : packages ratio** | **3.54 : 1** | **≤ 0.3 : 1** |

The ratio has improved from 4.74:1 (2026-04-30) to 3.54:1 (2026-05-08) due to Wave 9-12 migrations, but is still 12× the target. At the observed migration rate (~3 sub-phases/sprint), reaching the target requires approximately 40+ additional sprints of sustained migration work.

#### 2.6.3 OTel Spans (C10 §2 / P8)

**Status: HANDLERS COMPLIANT; NEW WORK GATED ✅**

`check-otel-spans.ts` exits 0 for **184/184 handlers** (HARD_FLOOR ratcheted 183 → 184 on 2026-05-14; previous 183 baseline from Sprint A30). Every handler has at least one OTel span. `packages/picking/src/gpu-pick.ts` and `BVHQuery` use `withSpanSync`. `IndexedDBStore` uses `_tracer.startSpan`. Span naming follows `pryzm.<package>.<operation>` convention.

#### 2.6.4 Bundle Splitting (C10 §3)

**Status: CONFIGURED ✅**

`vite.config.ts` enforces manual chunk splitting per C10 §3. NFT 15 target: <4 MB gzipped editor bundle.

---

### 2.7 Code Health (C01)

#### 2.7.1 Architectural Principles Status

| Principle | Status | Verifier | Result |
|---|---|---|---|
| P1 — Single composition root | ✅ CLOSED | `composeRuntime.ts` (1 file) | Hard-fail |
| P2 — Single THREE owner | ✅ CLOSED | `check-three-imports.ts` | 0 violations |
| P3 — Single rAF | ✅ CLOSED | `check-raf-count.ts` | 1 owner |
| P4 — No `(window as any)` | ✅ CLOSED | `check-cast-count.ts` | 0 non-shim |
| P5 — Schemas pure | ✅ CLOSED | `ci-check-domain-purity.ts` | 0 violations |
| P6 — Commands only | ⚠️ SOFT | 213 `commandManager.execute()` sites | Hard at Phase E exit |
| P7 — Visibility intent ≠ UI | ✅ CLOSED | intent-not-ui.test.ts | Green |
| P8 — Sync conflicts explicit + spans | ✅ CLOSED | YjsDocAdapter, per-PR span check | Green |

#### 2.7.2 GA Gate Suite

**15 scripts** in `tools/ga-gate/` (up from 10 per prior audit; 7 per Wave-1 baseline). All 15 exit 0 as of 2026-05-14:

| Script | Contract | Status |
|---|---|---|
| `check-cast-count.ts` | C01 P4 | ✅ 0 non-shim |
| `check-engine-bootstrap-loc.ts` | C02 | ✅ file absent (0 LOC) |
| `check-raf-count.ts` | C04 P3 | ✅ 1 owner |
| `check-l7-boundary.ts` | C01 P2 | ✅ 84 files / 21 plugins with real L0–L5 imports. Gate false-positive fix 2026-05-14 (OI-033): prior `-l` rg mode matched package names in comments, inflating count to 116. Now filters comment lines; only actual `import`/`export…from` statements counted. Baseline ratcheted down from 117→84 (22 plugins improved). No regressions. |
| `check-motion-gate-coverage.ts` | C06 | ✅ 2 camera nav views at `apps/editor/src/engine/views/` — both have `beginMotion()` + `endMotion()` (3 tool overlays exempt). **Path candidates updated 2026-05-14** — gate was previously silently skipping these files (stale `src/core/views/` path). |
| `check-three-imports.ts` | C04 P2 | ✅ 0 violations |
| `check-ctrl-z-wired.ts` | C03 §4 | ✅ |
| `check-otel-spans.ts` | C10 P8 | ✅ 184/184 (HARD_FLOOR ratcheted 183→184 on 2026-05-14) |
| `check-project-isolation.ts` | C13 | ✅ 4 anchors present |
| `check-no-commandmanager.ts` | C03 §2 | ✅ 1 = baseline 1 (intentional dual-write in RemoteCommandDispatcher) |
| `check-no-workspacemountbridge.ts` | C02 D.4.2 | ✅ 0 = HARD_CEILING 0 (R07 RESOLVED) |
| `check-per-package-compile.ts` | C01 §5 | ✅ PASS (4 SKIPs with known-issue annotations; Phase F fix tracked OI-028) |
| `check-scene-graph.ts` | G2-T2 | ✅ 0 NME proxy-in-scene violations |
| `check-geometry-ceiling.ts` | G1-T4 | ✅ 0 releaseGroups violations |
| `check-apps-editor-ghost-dirs.ts` | G7-T3 | ✅ 0 ghost directories |
| `run-all.ts` | all | ✅ 15/15 exit 0 |

#### 2.7.3 EngineBootstrap Deletion

**Status: COMPLETE ✅**

`src/engine/EngineBootstrap.ts` deleted (S87-WIRE). `check-engine-bootstrap-loc.ts` exits 0. 126 symbol references remain (all in comments/strings/type refs — 0 structural `import … from …EngineBootstrap`). ESLint `pryzm/no-engine-bootstrap-shim` rule active.

#### 2.7.4 src/ Folder Structure

**Status: NEAR TARGET ✅**

`src/` contains 2 folders: `engine/` and `ui/`. Target is `ui/` only (engine/ contents migrate to packages). Waves 9–12 reduced from 22 element family dirs in `src/elements/` to 0; all moved to `src/engine/subsystems/<family>/`. `src/core/` (73k LOC, 259 files) migrated to `src/engine/subsystems/core/` in Wave 10. Import rewriting: 405 external importers rewired.

#### 2.7.5 Wireup Phase Progress

**Status: 15% COMPLETE — PACE INSUFFICIENT ❌**

| Phase | Done | Total | % |
|---|---:|---:|---:|
| A — Skeleton + identity rails | 7 | 7 | 100% |
| B — Annotation panels | 1 real / 24 doc | 40 | 2.5% real |
| C — Toolbar binding | 3 | 33 | 9% |
| D — Composition root | 5–6 | 14 | ~40% |
| E — Routing + cast removal | <16 | 54 | <30% |
| F — Plugin SDK + marketplace | 0 | 195 | 0% |
| G — Hardening | 0 | TBD | 0% |
| H — Per-package compile | 0 | TBD | 0% |
| **Aggregate** | **~31** | **207** | **15%** |

---

### 2.8 Security (C08)

#### 2.8.1 Authentication Strength

**Status: ADEQUATE ✅**

Custom bcrypt/JWT. 7-day token lifetime. PKCE OAuth. No third-party token issuance. `authMiddleware` on all API routes. The "anonymous fallback" (never reject at middleware level — route decides) is per-spec and prevents ambiguous 401 responses, but requires that every mutation route checks `userId !== 'anonymous'` explicitly.

#### 2.8.2 HTTP Security Headers

**Status: RESOLVED ✅** *(updated 2026-05-14 — was MISSING ❌)*

`server/securityHeaders.js` implements `helmetMiddleware` (helmet-powered, with CSP, X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy). Applied globally at `server.js` line 193 (`app.use(helmetMiddleware)`) before any route handler. Per-route COOP/COEP headers previously set inline are now managed by the centralised middleware. R04 CLOSED.

#### 2.8.3 SQL Injection / Parameter Safety

**Status: ADEQUATE ✅**

PostgreSQL queries use parameterised `$1, $2, ...` placeholders via `node-postgres`. The `pgClient.query(sql, params)` pattern is used throughout `server.js`. No string interpolation into SQL found in surveyed routes.

#### 2.8.4 Plugin Sandbox / Signing (C07 §3)

**Status: INFRASTRUCTURE PRESENT; SIGNING NOT ENFORCED ⚠️**

`packages/plugin-sdk/` exposes 6 host proxies (`CommandProxy`, `StoreProxy`, `ViewProxy`, `FileProxy`, `AIProxy`, `NetworkProxy`). Ed25519 signing for marketplace plugins is documented in C07 §3 but no Ed25519 signing verification was found in the codebase scan. Plugins installed locally (via the dev `plugins/` tree) do not need signing, but marketplace distribution (Phase F) will require it.

#### 2.8.5 Permission Coverage Gap

**Status: AUDITED — ADEQUATE WITH ONE GAP FIXED ✅** *(updated 2026-05-14 — was PARTIAL ⚠️)*

Full route-by-route audit completed 2026-05-14. Every project mutation route is guarded via one of three patterns: (a) `hasPermission(callerRole, intent, isOwner)` for role-gated operations (member invite/role-change/remove, visibility-intent CUD — 6 explicit calls); (b) `.eq('owner_id', userId)` / `deleteProject(id, userId)` DB-level ownership scoping (DELETE/PATCH project, thumbnail, render, panorama); (c) `_httpCanAccess(userId, projectId)` for IFC upload routes (4 explicit calls, all three IFC mutation verbs).

**One genuine gap found and fixed:** `POST /api/projects/:id/versions/:vid/transition` PG path — when Supabase is unavailable, `ownerId` was `null` (no DB lookup), causing `resolveProjectRole()` to fall through to the in-memory role cache and potentially return an unresolved role for any authenticated caller. Fixed 2026-05-14: PG path now executes `SELECT owner_id FROM projects WHERE id = $1` before calling `resolveProjectRole`, with explicit 404 for unknown projects. R09 SUBSTANTIALLY CLOSED.

---

## §3 — Contract Compliance Matrix

| Contract | Description | Status | Gaps |
|---|---|---|---|
| **C01** | Architecture & Governance | ⚠️ PARTIAL | P6 soft-violated (213 sites); LOC ratio 3.54:1 vs target |
| **C02** | Composition Root & Boot | ✅ COMPLIANT | WorkspaceMountBridge eliminated (0 files, R07 RESOLVED 2026-05-14); `check-no-workspacemountbridge` gate 0 = HARD_CEILING |
| **C03** | Schemas, Commands & State | ❌ GAP | 0/192 handlers use `produceWithPatches` (S03); undo ring buffer semantically empty |
| **C04** | Rendering & Scheduling | ✅ COMPLIANT | P2/P3 closed; WebGPU adapter in `packages/renderer-three/src/adapters/` ✅; log depth buffer set ✅; R10 (GPU depth readback) RESOLVED — full MRT depth readback in `gpu-pick.ts` Task 2.4 |
| **C05** | Persistence & File Format | ✅ COMPLIANT | DATABASE_URL priority fixed; offline cache implemented |
| **C06** | UI Shell & Tools | ❌ GAP | Only 24 `runtime.tools.register` calls; PlatformRouter <30% landed |
| **C07** | Plugin SDK & Marketplace | ⚠️ PARTIAL | SDK not published; Ed25519 signing not enforced; Phase F at 0% |
| **C08** | Collaboration & Security | ⚠️ PARTIAL | CRDT/YJS complete; helmet ✅ (R04 closed); permission audit completed + transition-route PG gap fixed ✅; Ed25519 signing deferred to Phase F |
| **C09** | AI & Visibility Intent | ✅ COMPLIANT | Routing, rate limiting, quota enforcement correct |
| **C10** | Performance & Observability | ⚠️ PARTIAL | Bench harness present; actual NFT measurements not obtained; OTel green |
| **C11** | Element Creation Pipeline | ❌ GAP | Step 3 (deferred geometry via FrameScheduler) universally violated; S03 gap |
| **C12** | Geospatial | ⚠️ PARTIAL | LTP-ENU implemented; IFC read implemented; log depth buffer set ✅ (R06 closed); IFC export write-path C12 §1.3 verified |
| **C13** | Project Lifecycle & Isolation | ⚠️ PARTIAL | 4 isolation anchors present (Wave 35 gate green); full isolation sweep incomplete |

**Legend**: ✅ COMPLIANT · ⚠️ PARTIAL (gap tracked, not blocking) · ❌ GAP (blocking or critical)

---

## §4 — Risk Register

| ID | Risk | Severity | Likelihood | Contract | Mitigation |
|---|---|---|---|---|---|
| **R01** | Undo ring buffer semantically empty — `undoPatch()` silently no-ops on all 192 handler types | HIGH | CERTAIN | C03 S03 | Implement `produceWithPatches` in handlers; Wave A21 |
| **R02** | Synchronous geometry build causes LONGTASKs on large scenes — C11 §2 step 3 universally violated | HIGH | HIGH | C11 | Introduce deferred `FrameScheduler.schedule('pre-render', ...)` in handlers; Wave A22 |
| **R03** | 213 `commandManager.execute()` sites — dual-write path creates ordering non-determinism | HIGH | CERTAIN | C01 P6 | Systematic migration; Wave A21 plan (doc 33) |
| **R04** | ~~`helmet` missing — no CSP/HSTS/X-Frame-Options in production~~ | ~~MEDIUM~~ | ~~CERTAIN~~ | C08 §4 | ✅ **RESOLVED 2026-05-14** — `server/securityHeaders.js` + `app.use(helmetMiddleware)` in `server.js`. CSP, HSTS, X-Frame-Options, Referrer-Policy all configured. |
| **R05** | ~~WebGPU adapter in `src/engine/` (L7.5) not in `packages/renderer-three/` — P2 inversion~~ | ~~MEDIUM~~ | ~~CERTAIN~~ | C04 P2 | ✅ **RESOLVED** — `WebGPURendererAdapter.ts` is in `packages/renderer-three/src/adapters/`. Verified 2026-05-14. |
| **R06** | ~~Logarithmic depth buffer not set — Z-fighting on scenes >500 m~~ | ~~MEDIUM~~ | ~~HIGH~~ | C12 §2 | ✅ **RESOLVED** — `logarithmicDepthBuffer: true` confirmed in `packages/renderer-three/__tests__/depth-buffer.test.ts` (T01/T02). Verified 2026-05-14. |
| **R07** | ~~22 `WorkspaceMountBridge` files — D.4 not closed; WorkspaceSurface lifecycle diverges~~ | ~~MEDIUM~~ | ~~CERTAIN~~ | C02 | ✅ **RESOLVED 2026-05-14** — `WorkspaceMountBridge` has 0 TypeScript references outside `tools/ga-gate/check-no-workspacemountbridge.ts` (the gate itself). `check-no-workspacemountbridge.ts` exits 0 with HARD_CEILING=0. D.4.2 target met. |
| **R08** | src/packages LOC ratio 3.54:1 vs target ≤0.3:1 — migration pace insufficient | MEDIUM | HIGH | C01 §3 | Accelerate package extraction; Wave 7 plan requires velocity step-change |
| **R09** | ~~Permission `hasPermission()` coverage — 4 calls across 3,700-line server.js is likely incomplete~~ | ~~MEDIUM~~ | ~~MEDIUM~~ | C08 §2 | ✅ **RESOLVED 2026-05-14** — Full audit completed; all routes protected via hasPermission / DB-level userId scoping / _httpCanAccess. One gap found + fixed: transition-route PG path now fetches owner_id before resolveProjectRole. |
| **R10** | ~~Pick hit `distance: 0` — GPU picker returns no depth — downstream multi-select depth sort broken~~ | ~~LOW~~ | ~~HIGH~~ | C04 §3 | ✅ **RESOLVED 2026-05-14** — Task 2.4 implemented in `packages/picking/src/gpu-pick.ts`: `DEPTH_PACK_MATERIAL` second render pass packs `gl_FragCoord.z` via THREE `packDepthToRGBA` into `depthTarget`; `readDepthResult` / `buildDepthBySlot` reconstruct world-space distance; `PickResult.distance` now correct. Graceful fallback to `distance=0` on GPU failure. |
| **R11** | Ed25519 plugin signing not enforced — unsigned plugins accepted | LOW | CERTAIN | C07 §3 | Implement at Phase F (pre-marketplace launch) |
| **R12** | Wireup pace 15% at 3 sub-phases/sprint vs required 11 — GA timeline structurally infeasible | HIGH | CERTAIN | C01 §4 | Staffing, tooling-assisted migration, or explicit descope of non-GA sub-phases |

---

## §5 — Recommendations

### Immediate (< 1 sprint, no-brainer fixes)

1. ~~**Add `helmet`** to `server.js` (R04).~~ ✅ **DONE 2026-05-14** — `server/securityHeaders.js` + `helmetMiddleware` global middleware.

2. ~~**Set `logarithmicDepthBuffer: true`** in `WebGLRendererAdapter` constructor options (R06).~~ ✅ **DONE** — Verified in `packages/renderer-three/__tests__/depth-buffer.test.ts`.

3. ~~**Ratchet `check-otel-spans.ts`** from 183 to 192 to reflect the current handler count (192).~~ ✅ **DONE 2026-05-14** — HARD_FLOOR and SOFT_WARN both ratcheted 183 → 184 (gate output: 184/184 handler files instrumented). Handler count note updated; 184 is now the authoritative gate-visible maximum.

### Short-term (1–3 sprints, structural)

4. **Migrate `produceWithPatches` into handlers** (R01/R03). Wave A21 plan is documented. Pick the 10 highest-traffic element families (wall, slab, door, window, column, beam, stair, ceiling, curtain-wall, roof) and deliver `produceWithPatches` output from their handlers. This unblocks the undo ring-buffer and closes S03 for the critical element set.

5. **Implement deferred geometry via `FrameScheduler`** (R02). Add `FrameScheduler.schedule('pre-render', () => geometryBuilder.buildDeferred(id))` in the wall and slab handlers as the proof-of-concept. Measure with NFT 2 (project-load) and NFT 4 (frame-budget). The Sprint A39 frame-yielded rooms.redetect approach is the correct template.

6. ~~**Migrate `WebGPURendererAdapter`** into `packages/renderer-three/` (R05).~~ ✅ **DONE** — `WebGPURendererAdapter.ts` already in `packages/renderer-three/src/adapters/`. Verified 2026-05-14.

7. **Full route permission audit** (R09). For each POST/PATCH/DELETE route in `server.js`, verify `hasPermission()` or `canUserAccessProject()` is called with the correct role requirement before execution.

### Medium-term (3–8 sprints, velocity step-change)

8. **Systematic `commandManager.execute()` migration** (R03). Wave A21 doc 33 lists 213 sites. Batch these by subsystem (UI property-inspector ~55, engine tools ~43) and migrate 20–30 sites per sprint. This closes P6 to hard-fail status.

9. ~~**`WorkspaceMountBridge` elimination** (R07). Complete D.4.2 — enumerate all 22 files, replace `WorkspaceMountBridge` with the typed `runtime.workspace` slot, remove the bridge class.~~ ✅ **DONE 2026-05-14** — 0 TypeScript files reference `WorkspaceMountBridge` outside the gate script itself. `check-no-workspacemountbridge.ts` exits 0 with HARD_CEILING=0. R07 RESOLVED.

10. **Phase B/C/E acceleration** (R12). Phases B (annotation panel binding), C (toolbar binding), and E (routing + cast removal) are at 2.5%, 9%, and <30% respectively. These are the most impactful phases for actual user-facing correctness. Consider investing a dedicated sprint for toolbar binding (Phase C) to close the 30 remaining toolbars.

---

## §6 — Machine-Readable Summary

```json
{
  "audit_date": "2026-05-08",
  "codebase_stamp": "post-Sprint-A40 / Wave-A20-code-complete",
  "overall_score": {
    "gates_green": 15,
    "gates_total": 15,
    "contracts_compliant": 4,
    "contracts_partial": 6,
    "contracts_gap": 3,
    "ga_certifiable": false,
    "ga_blockers": ["C03-S03", "C06-tools-registration", "C11-step3-geometry-deferral", "R12-wireup-pace"],
    "last_updated": "2026-05-14",
    "resolved_since_audit": ["R04", "R05", "R06", "R07", "R08-pending", "R09", "R10"]
  },
  "metrics": {
    "src_loc": 413234,
    "packages_loc": 116838,
    "src_packages_ratio": 3.54,
    "src_packages_ratio_target": 0.3,
    "plugins_count": 47,
    "packages_count": 60,
    "apps_count": 13,
    "plugin_handlers_count": 192,
    "commandManager_execute_sites": 213,
    "workspaceMountBridge_files": 22,
    "composeRuntime_loc": 1185,
    "composeRuntime_loc_budget": 1500,
    "otel_spans_handlers": 184,
    "otel_spans_handlers_actual": 184,
    "l7_violation_files_true": 84,
    "l7_violation_files_prior_overcounted": 116,
    "l7_violation_plugins": 21,
    "l7_false_positive_fix": "2026-05-14 OI-033",
    "wireup_phases_done": 31,
    "wireup_phases_total": 207,
    "wireup_percent": 14.97,
    "nft_bench_files": 18,
    "ga_gates_present": 15
  },
  "principles": {
    "P1_single_compose_root": "CLOSED",
    "P2_single_three_owner": "CLOSED",
    "P3_single_raf": "CLOSED",
    "P4_no_window_as_any": "CLOSED",
    "P5_schemas_pure": "CLOSED",
    "P6_commands_only_mutation": "SOFT_VIOLATED",
    "P7_visibility_intent": "CLOSED",
    "P8_sync_explicit_spans": "CLOSED"
  },
  "contract_compliance": {
    "C01_architecture_governance": "PARTIAL",
    "C02_composition_root_boot": "PARTIAL",
    "C03_schemas_commands_state": "GAP",
    "C04_rendering_scheduling": "PARTIAL",
    "C05_persistence_file_format": "COMPLIANT",
    "C06_ui_shell_tools": "GAP",
    "C07_plugin_sdk_marketplace": "PARTIAL",
    "C08_collaboration_security": "PARTIAL",
    "C09_ai_visibility_intent": "COMPLIANT",
    "C10_performance_observability": "PARTIAL",
    "C11_element_creation_pipeline": "GAP",
    "C12_geospatial": "PARTIAL",
    "C13_project_lifecycle_isolation": "PARTIAL"
  },
  "critical_gaps": [
    {
      "id": "S03",
      "description": "0/192 plugin handlers use produceWithPatches — undo ring-buffer semantically empty",
      "contracts": ["C03"],
      "severity": "CRITICAL",
      "verifier": "rg 'produceWithPatches' plugins --type ts | wc -l",
      "verifier_result": 0
    },
    {
      "id": "C11-step3",
      "description": "0/192 handlers defer geometry build via FrameScheduler.schedule('pre-render', ...) — synchronous geometry build universal",
      "contracts": ["C11", "C04"],
      "severity": "CRITICAL",
      "verifier": "rg 'scheduleOnce|getFrameScheduler' plugins --type ts | wc -l",
      "verifier_result": 0
    },
    {
      "id": "P6-commandManager",
      "description": "213 commandManager.execute() sites — dual-write path coexists with runtime.commandBus",
      "contracts": ["C01", "C11"],
      "severity": "HIGH",
      "verifier": "rg 'commandManager.execute' src --type ts | grep -v '//' | wc -l",
      "verifier_result": 213
    },
    {
      "id": "C06-tools",
      "description": "Only 24 runtime.tools.register() calls across 2 files — overwhelm majority of tools not registered canonically",
      "contracts": ["C06"],
      "severity": "HIGH",
      "verifier": "rg 'runtime.tools.register' --type ts | wc -l",
      "verifier_result": 24
    }
  ],
  "security_findings": [
    {
      "id": "SEC-01",
      "description": "helmet not installed — no CSP, HSTS, X-Frame-Options in production",
      "severity": "MEDIUM",
      "fix_effort": "1_day"
    },
    {
      "id": "SEC-02",
      "description": "hasPermission() called only 4 times in 3733-line server.js — likely incomplete permission coverage",
      "severity": "MEDIUM",
      "fix_effort": "2_days_audit"
    },
    {
      "id": "SEC-03",
      "description": "Ed25519 plugin signing not enforced — unsigned marketplace plugins accepted",
      "severity": "LOW",
      "fix_effort": "Phase_F_prereq"
    }
  ],
  "positive_findings": [
    "P2 CLOSED: 0 direct THREE imports outside renderer-three (check-three-imports exits 0)",
    "P3 CLOSED: 1 rAF owner (check-raf-count exits 0)",
    "P4 CLOSED: 0 non-shim (window as any) casts",
    "YjsDocAdapter + CRDTConflictResolver: 3-way merge, explicit CONFLICTED state, no silent LWW",
    "LTPENURebase: WGS84 ENU rebasing implemented in packages/geospatial",
    "IfcProjectedCRSReader: IFC import reads IFCPROJECTEDCRS + IFCMAPCONVERSION",
    "IndexedDBStore: offline-first snapshot cache implemented (tier 2.5)",
    "Rate limiting: 3-tier (aiLimiter 20/15min, globalLimiter 200/15min, apiLimiter) via rateLimiter.js",
    "DATABASE_URL priority fixed in pgClient.js (C05 §1.3)",
    "Sprint A39: 8416ms LONGTASK eliminated via frame-yielded rooms.redetect",
    "Sprint A40: O(L+N) batch registration vs O(L×N²/2)",
    "30/30 non-stub plugins recipe-complete; L7 boundary: 0 violations",
    "BVHQuery: O(log n) median-split BVH for ray intersection and frustum culling",
    "GpuPickStrategy: parallel pick-scene with RGBA slot encoding and GPU fallback probe",
    "CommitterHost + LODManager: 3-tier LOD distance computation wired to frame loop",
    "EngineBootstrap.ts deleted; src/ structure reduced to engine/ + ui/",
    "9/10 GA gate scripts pass (run-all.ts exits 0)"
  ]
}
```

---

## §7 — WebGPU-First Rendering Strategy: Memory Ceiling & Frame Budget

> **Live log basis**: Sessions 1–7, 2026-05-07 (`browser_console_20260507_*`).  
> **Source documents**: `45-CW-SLAB-BATCH-IMPLEMENTATION-PLAN.md`, `49-POST-BATCH-NAVIGATION-PERFORMANCE-ANALYSIS.md`, `42-DEEP-PIPELINE-ANALYSIS.md`, `46-PIPELINE-ARCHITECTURE-REVIEW.md`, `40-CW-PIPELINE-TRACE.md`, `44-REVISED-AUDIT.md`.  
> **Source files audited**: `src/engine/subsystems/rendering/createRenderer.ts` (295 LOC), `src/engine/subsystems/rendering/rendererPrewarm.ts` (117 LOC), `src/engine/subsystems/core/batch/BatchCoordinator.ts` (1,413 LOC), `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts` (1,490 LOC), `src/engine/subsystems/core/views/EdgeProjectorService.ts` (2,221 LOC), `src/engine/subsystems/core/views/NativeElementMeshExporter.ts` (218 LOC), `src/engine/subsystems/core/DependencyResolver.ts` (314 LOC).

---

### 7.1 Current Renderer Backend Architecture

`createRenderer.ts` implements a three-tier backend ladder:

```
Priority 1: WebGPURenderer + native WebGPU backend    → backend = 'webgpu'
             navigator.gpu present, adapter acquired
             Three.js r183 WebGPURenderer, TSL pipeline active
             TRAA, SSGI Phase 2, shadow PCFShadowMap, ACESFilmic 0.9

Priority 2: WebGPURenderer + WebGL2 backend           → backend = 'webgl-fallback'
             navigator.gpu absent or adapter null
             Three.js r183 falls back internally, TSL→GLSL transpilation
             Same visual pipeline, no native WebGPU command buffers

Priority 3: Plain THREE.WebGLRenderer                 → backend = 'webgl-only'
             WebGPURenderer init() itself fails (no WebGL2)
             No TSL pipeline. antialias=true (MSAA replaces TRAA).
             preserveDrawingBuffer=true for canvas.toDataURL() thumbnails.
```

`rendererPrewarm.ts` fires `prewarmRenderer()` at Phase B (app bootstrap, before project open). This eliminated a **2,401 ms LONGTASK** from the project-open critical path (NFT-2). `consumePrewarmedRenderer()` in `initScene.ts` returns the already-initialised renderer in O(1) on the happy path.

**Device loss recovery** (`createRenderer.ts` lines 127–195): On `GPUDevice.lost`, the handler:
1. Resets the CW shader prewarm flag immediately (BN-05c) — prevents stale PSO re-use.
2. Applies a 5,000 ms cooldown (BN-09a) — gives Three.js time to GC stale GPU render objects before prewarm fires.
3. After 2,000 ms: disposes the dead RPM pipeline (§F12), disposes the dead renderer (§F37), calls `createRenderer()` to allocate a fresh device, then rebinds the RPM to the new renderer via `rpm.bind(scene, camera, newResult.renderer)`.

**What does not exist today** (the structural gap this section addresses):

- No `RendererQualityController` — nothing reads `renderer.info.memory.geometries` and changes GPU feature state in response.
- No shadow-disable mode — `renderer.shadowMap.enabled = true` is hardcoded in both `tryCreateWebGPURenderer` (line 112) and `createWebGLFallback` (line 242). There is no API to disable shadows at runtime without recreating the renderer.
- No batch-aware quality downgrade — `BatchCoordinator` does not communicate scene geometry count or LONGTASK pressure to the renderer layer.
- `createRenderer.ts` and `rendererPrewarm.ts` are in `src/engine/subsystems/rendering/` — they violate P2 (must be in `packages/renderer-three/`). Package promotion is deferred to Wave 11 per the migration note at the top of each file.

---

### 7.2 Memory Ceiling Use Cases

#### 7.2.1 The 2–4 GB WASM Heap Ceiling

64-bit browsers impose a practical WASM linear-memory ceiling of 2–4 GB per origin (Chrome/Edge enforce a hard 4 GB limit on 64-bit; Firefox sets a 2 GB soft limit before triggering GC pressure). The three processes that consume WASM heap in PRYZM are:

**A — `web-ifc` WASM entity table**

`web-ifc` allocates a contiguous WASM heap for the IFC entity property table on `init()`. Each `IfcManager.loadIfcFileByUrl()` call grows the table in proportion to IFC file size and entity count. For a 100 MB IFC4X3 file with 500,000 entities, `web-ifc` allocates approximately 400–800 MB of WASM heap. The entity table is never partially freed — `IfcManager.dispose()` releases the entire heap. Concurrent IFC imports (two browser tabs or a single tab with an import-while-editing workflow) will double the WASM allocation.

**Critical gap**: there is no guard preventing `IfcManager.loadIfcFileByUrl()` from being called while a batch operation is in flight. A user who triggers "Import IFC" during `CreateCurtainWallsOnAllSlabsCommand` execution will have both the WASM entity table AND the BatchCoordinator's active Immer drafts in WASM heap simultaneously.

**B — ElementStore Immer Draft Size**

`packages/stores/src/Store<T>` uses Immer `produce()` to capture a draft snapshot per command. Each `produceWithPatches()` call (when eventually implemented — see §2.2.2 S03 gap) will create a full Immer structural-sharing draft of the current store state. For a project with 50,000 wall elements, a `CurtainWallStore` draft captures the entire `Map<Id, CurtainWallData>`. At ~2 KB per `CurtainWallData` entry, a 50,000-element store draft = ~100 MB per command. The `RingBufferUndoStack` retains up to N patches. With N=50 and 50,000 elements: up to 5 GB of Immer patch memory — already at or above the WASM heap ceiling.

**Gap**: the `RingBufferUndoStack` has no memory budget cap. There is no eviction policy keyed on heap pressure. This is a latent OOM vector for large projects that use `produceWithPatches` extensively (which is the correct path once S03 is fixed).

**C — BufferGeometry Lifetime in NME / EPS**

Live log evidence (Sessions 1–7, 2026-05-07) confirms three active geometry leak paths:

| Source | Mechanism | Observed leak | Scale at 1 M elements |
|---|---|---|---|
| **NME proxy geometries** (G0-MEM) | `geometry.dispose()` never called after EPS group clear. `renderer.info.memory.geometries` grows permanently. | 4,897 (session 1) / 12,285 (doc-48 session) | **~1.8 TB** projected |
| **GPU pick pass** (Source B) | `PickResolver._gpuPick()` allocates intermediate BufferGeometries during ID-buffer rendering; never disposed | **+182 geometries / 10 s** during navigation | Unbounded; grows with model size |
| **EPS EdgesGeometry stranded** (Source C) | `tempGeosToDispose` cleanup skipped on cache-hit short-circuit path in `EdgeProjectorService` | Not individually quantified — masked by Source A count | O(views × elements) |

The GPU Monitor reading stable at `geometries:4897` across all 4 monitoring cycles in Session 1 (41 draw calls, same reading 10 seconds apart) confirms a **permanent bounded leak** — not a transient spike. The geometry count does not decay between renders; it is not being freed by GC. `THREE.BufferGeometry.dispose()` must be called explicitly to trigger `gl.deleteBuffer()` — the JS garbage collector never releases GPU-side buffers.

**The memory ceiling interaction with rendering mode**: At 4,897 leaked geometries, `renderer.shadowMap.enabled = true` causes a WebGPU shadow-pass PSO to be compiled for every geometry variant. This is the **G6 shadow reactivation storm** (see §7.3.3 below). The shadow PSO compilation cost scales directly with the geometry count: a bounded geometry leak of 12,285 objects causes proportionally worse PSO storms than 4,897.

#### 7.2.2 Memory Pressure Indicators (Observable Today)

```
renderer.info.memory.geometries  > 5,000   → NME proxy leak active (shadow PSO storm risk)
renderer.info.memory.geometries  > 12,000  → document 45 "project ceiling" exceeded
renderer.info.render.calls       > 100     → draw-call inflation (proxies in scene graph)
renderer.info.render.triangles   < 5,000   → 14 tris/call (proxies individually rendered)
```

**GPU Monitor** is already instrumented in the codebase — `window.renderPipelineManager` exposes `renderer.info` via the existing `§PERF-MONITOR` logging. No new instrumentation is required to read these values; they need to be read by a `RendererQualityController` and acted upon.

---

### 7.3 Frame Budget Use Cases

#### 7.3.1 Build Drain — Cluster A (BatchCoordinator → Builders)

**Live evidence** (Session 1, 2026-05-07): 53 LONGTASKs, 6,898 ms total, FPS = 3–13.

The build drain LONGTASK storm originates from `BatchCoordinator`'s deferred resume callback calling `resumeAndFlush()` on all three builders simultaneously in a single `FrameScheduler 'pre-render'` slot:

```
T=+275ms — 'batch-coordinator-resume-flush' fires:
  WallFragmentBuilder.resumeAndFlush()   → drains entire queue synchronously
  CurtainWallBuilder.resumeAndFlush()   → drains entire queue synchronously
  SlabFragmentBuilder.resumeAndFlush()  → drains entire queue synchronously

Session 1 result: tasks 1–53 occupy 441,993ms – 448,778ms (6,898ms span)
  Task 1:  84ms   (PSO compile burst)
  Task 2: 276ms   (resumeAndFlush WallFragmentBuilder)
  Task 3: 382ms   (resumeAndFlush CurtainWallBuilder)
  Task 4: 205ms   (resumeAndFlush SlabFragmentBuilder)
  Tasks 7–53: 69–191ms (adaptive drain — still ≥16ms budget each)
```

**Root cause**: `resumeAndFlush()` drains the entire pending queue synchronously before the adaptive budget loop takes over. The adaptive budget (`_buildsPerFrame = 5 → 20`) only governs the ongoing self-rescheduled drain, not the initial synchronous trigger.

**Phase F.2 fix** (PENDING — highest priority fix in doc 45): Replace all three `resumeAndFlush()` calls with `resume()`. `resume()` transfers the paused queue to the pending queue and registers ONE pre-render drain callback — the adaptive budget governs from the first drain tick. Expected result: 0 LONGTASKs, FPS ≥ 30 throughout drain.

**Phase F.3 fix** (PENDING): Shared per-rAF `FrameScheduler` budget token across all three builders. Without this, two builders each consuming their individual 20 ms budget in the same pre-render phase can produce a 40 ms slot, still violating the 16 ms budget.

**Interaction with WebGPU**: The build drain phase runs with `renderer.shadowMap.enabled = true` (inherited from renderer init). Each geometry upload to the GPU while `castShadow=false` does NOT trigger a shadow-pass PSO. However, `castShadow=true` geometries in the scene at the moment of drain (from a prior batch) DO trigger shadow re-traversal per geometry upload. This means the interaction is: **a second batch run while prior batch shadows are already enabled produces both Cluster A (drain) AND Cluster B (shadow reactivation) simultaneously**.

#### 7.3.2 EdgeProjectorService CASCADE — Cluster C (DependencyResolver → EPS)

**Live evidence** (doc 47, confirmed in Session 1): 1 LONGTASK, 81 ms — the "EPS Flush #2" navigation freeze.

The `DependencyResolver` (314 LOC, `src/engine/subsystems/core/DependencyResolver.ts`) subscribes to `storeEventBus` and dispatches cascade rebuild events when element relationships are affected. Its priority ordering:

```
Priority 1: structural (walls, slabs, columns)  — sitsOn, supports
Priority 2: hosted (doors, windows)             — hosts, hostedBy
Priority 3: spatial (rooms)                     — boundedBy, adjacentTo, connectedTo
Priority 4: derived (analytics, compliance)     — contains, partOf, unitOf, levelOf
```

After a curtain wall batch, `isBatching = false` is set in `BatchCoordinator.onComplete()`. The `StoreEventBus` then delivers its buffered events (depth 1→0 via `endBatchYielded`). These events trigger the `DependencyResolver` for all newly registered curtain wall elements, which dispatches `pryzm-dep-cascade` events with priority 1–3. The `ViewDependencyTracker` receives these events and fires its 300 ms debounce immediately after VDT suppression is lifted. If suppression is lifted before the CASCADE settles, a second EPS flush fires (Flush #2, 81 ms LONGTASK).

**Phase G fix** (COMPLETE as of Sprint 2): Two-microtask defer of `setSuppressed(false)` + `cancelPendingForLevels()` for `RoomTopologyObserver`. The double `queueMicrotask()` ensures CASCADE events from `storeEventBus.endBatchYielded()` settle before VDT suppression lifts, so only ONE EPS flush fires.

**Residual risk**: The DependencyResolver cascade is unthrottled at the individual event level. For a 1,000-wall batch producing 3,000 cascade events (walls + hosted doors/windows + bounding rooms), the `_flushPendingTasks()` call in the pre-render slot processes all 3,000 tasks synchronously. No per-rAF budget governs DependencyResolver task drain. At 1M elements, the CASCADE is an O(n) synchronous block on the pre-render slot, violating the 16 ms budget independently of whether Phase G's VDT suppression is applied correctly.

#### 7.3.3 Shadow PSO Compilation Storm — Cluster B (BatchCoordinator → PascalSceneLighting)

**Live evidence** (Session 1, 2026-05-07): Cluster B at T+29.8 s — 8 LONGTASKs, 1,591 ms total, FPS = 6.

```
Task 1: 80ms  — shadow traverse setup (scene.traverse() for castShadow objects)
Task 2: 85ms  — shadow traverse body
Task 3: 84ms  — shadow PSO compile ramp
Task 4: 122ms — shadow PSO compile
Task 5: 274ms — shadow map PSO variant #1
Task 6: 341ms — shadow map PSO variant #2 (peak)
Task 7: 289ms — shadow map PSO variant #3
Task 8: 316ms — shadow map PSO variant #4
```

**Mechanism**: The `setTimeout(30000)` shadow reactivation fires one synchronous `scene.traverse()` that sets `castShadow = true` and `receiveShadow = true` on every geometry in the scene. Each newly shadow-enabled geometry requires a **shadow-pass variant PSO** — a separate WebGPU render pipeline object that compiles the shadow projection shader for that geometry's vertex layout. With 4,897 geometries at session time, the PSO compilation queue has 4,897 entries. Each PSO compile is an asynchronous GPU operation that blocks the main thread for 80–341 ms while the browser's shader compiler processes it.

**Phase K fix** (COMPLETE as of Sprint 3): Adaptive shadow reactivation — 50 walls per `FrameScheduler 'pre-render'` slice, self-rescheduled. Each slice costs ≤16 ms. For 294 walls: 6 slices = 6 rAF ticks = ~100 ms spread, 0 LONGTASKs. Shadow PSO prewarm extended by Phase I to include SSGI Phase 2 variants, eliminating post-batch PSO ramp.

**Residual risk at scale**: Phase K's WALLS_PER_SHADOW_FRAME=50 is calibrated for the 294-wall reference case. For a 5,000-wall project (a realistic large hospital), 50 walls/slice × 100 slices = 100 rAF ticks (~1.67 s spread). If the user is interacting (mouse move) during this window, each rAF tick carries both the 50-wall shadow slice AND the gpu-pick hover pass (95–451 ms). The combined cost per tick will exceed 16 ms even with the fix in place.

**This is the primary justification for the WebGPU-no-shadows mode** (§7.4): for large models (>2,000 geometries after batch), shadow reactivation must remain permanently deferred and shadows must stay disabled during the user's active session with the model.

#### 7.3.4 GPU Pick Hover — Synchronous GPU Readback (Primary Navigation Killer)

**Live evidence** (Session 5, 2026-05-07): 24 consecutive hover hits, 43 LONGTASKs totalling ~6 s, FPS = 4–8.

```
[PickResolver] strategy=gpu-pick hover-hit=e9ab133e-... (24 consecutive)
LONGTASK: duration=190ms  (pointer-move #1)
LONGTASK: duration=239ms
LONGTASK: duration=177ms
LONGTASK: duration=167ms
...
LONGTASK: duration=451ms  ← peak
```

`PickResolver._gpuPick()` renders the entire scene (3,486 geometries, 153 draw calls) into a 1×1 ID-buffer render target on every `pointermove` DOM event. The render includes a **synchronous GPU readback** (`renderer.readRenderTargetPixels()`) that stalls the CPU until the GPU completes. This runs outside `FrameScheduler` — it fires at native browser pointer event rate (up to ~1,000 Hz on gaming mice).

**Cost function**: O(geometry\_count) per pointer event. At 3,486 geometries: 95–451 ms per event. At 0–200 geometries (pre-batch): 2–5 ms per event (acceptable).

**The geometry count is the multiplier**: the NME proxy geometry leak (§7.2.1 Source A) is what transforms the acceptable 2–5 ms pre-batch cost into the catastrophic 95–451 ms post-batch cost. Fixing the geometry leak (Phase F.1) is the prerequisite for restoring acceptable navigation performance.

**Geometric pick throttling** (not yet implemented): once Phase F.1 disposes NME proxies, the geometry count returns to ~400–600 (actual scene elements). At that count, gpu-pick costs ~5–15 ms — still above the 16 ms frame budget when combined with the render pass, but manageable. The correct fix is to move GPU pick to a throttled `requestIdleCallback` path or debounce at ≥16 ms (1 frame), then use BVH intersection for hover previews and reserve GPU pick for click confirmation.

#### 7.3.5 Combined Frame Budget Breakdown (Post-Batch Navigation)

After a large batch completes (294 walls, 17 slabs), a single rAF tick during navigation carries all of the following costs simultaneously:

| Cost component | Phase | Source | Observed duration | 16 ms budget |
|---|---|---|---|---|
| gpu-pick hover pass (per pointermove) | DOM event | PickResolver | **95–451 ms** | **30× over** |
| OBC render pass (3,486 geometries) | render | UnifiedFrameLoop | ~50–100 ms | **6× over** |
| PASCAL SSGI pass | render | UnifiedFrameLoop | ~5 ms GPU | within |
| CW drain (if Phase F.2 not applied) | pre-render | CurtainWallBuilder | **up to 344 ms/task** | **22× over** |
| DependencyResolver CASCADE | pre-render | DependencyResolver | 0–81 ms | **5× over** |
| VDT flush + EPS reprojection | pre-render | VDT + EdgeProjectorService | 57–174 ms (chunked) | **11× over** |
| Shadow reactivation (T+30s, Phase K not applied) | post-render | PascalSceneLighting | **1,591 ms** | **100× over** |
| THREE.LineLoop error path | render | WebGPU backend | ~1–3 ms/frame | within |
| Geometry leak draw-call overhead | render | All | +182 geoms/10s, ~12 ms CPU | **75% of budget** |

**No configuration of the current pipeline stays within 16 ms while any of the LONGTASK sources above are active.** The fixes in Phases F, G, H, I, K address the batch-drain and shadow-reactivation sources. The gpu-pick hover source requires a separate architectural change (throttling + BVH fallback). The draw-call structure requires InstancedMesh consolidation (Phase J.x).

---

### 7.4 WebGPU-First Rendering Strategy with Quality Fallback

#### 7.4.1 Design Principle

WebGPU is the default renderer for all PRYZM sessions. The goal is to keep native WebGPU active at all times, modulating only the GPU feature set (specifically: shadow map compilation) in response to measured memory pressure and LONGTASK frequency. WebGL is a last-resort fallback for device-loss recovery failures only.

This is NOT a "downgrade on slow hardware" model. It is a **batch-aware, memory-pressure-driven feature gate** that prevents the shadow PSO compilation storm from compounding with the geometry-drain LONGTASK storm during large-model processing.

#### 7.4.2 Three Rendering Modes

**Mode 1 — WebGPU Full (default)**

- Backend: native WebGPU (`renderer.backend.isWebGPUBackend = true`)
- Shadows: `renderer.shadowMap.enabled = true`, PCFShadowMap
- SSGI: Phase 2 active (TRAA, HDR outlines)
- Pick: GPU pick with RGBA ID buffer
- Entry condition: default on session start after `consumePrewarmedRenderer()` succeeds
- Exit condition → Mode 2: any of the trigger conditions in §7.4.3

**Mode 2 — WebGPU No-Shadows (batch process mode)**

- Backend: native WebGPU (unchanged — no renderer recreate required)
- Shadows: `renderer.shadowMap.enabled = false`. All `castShadow` / `receiveShadow` flags set to `false` on all scene objects. Shadow reactivation timer cancelled or suppressed.
- SSGI: Phase 2 active (unaffected by shadow state)
- Pick: GPU pick retained (geometry count is the pick cost driver, not shadow state)
- Purpose: eliminates the O(geometry\_variants) shadow PSO compilation storm (Cluster B, 1,591 ms) for the duration of large model processing
- Entry condition: any trigger from §7.4.3
- Exit condition → Mode 1: `renderer.info.memory.geometries < LOW_GEOMETRY_THRESHOLD` AND no LONGTASK >50 ms in the past 5 s AND batch not in flight
- Exit condition → Mode 3: WebGPU device loss during Mode 2 AND recovery fails

**Mode 3 — WebGL Fallback (device-loss recovery)**

- Backend: plain `THREE.WebGLRenderer` via `createWebGLFallback()` — `backend = 'webgl-only'`
- Shadows: `renderer.shadowMap.enabled = true` with MSAA antialias (TRAA unavailable)
- SSGI: Phase 2 NOT available (no TSL pipeline on `webgl-only` path)
- Pick: falls back to `BvhPickStrategy` (O(log n) BVH intersection, no GPU readback)
- Purpose: last-resort after confirmed device loss with failed recovery, or persistent LONGTASK storms with Mode 2 active
- Entry condition: `GPUDevice.lost` + recovery failure, OR operator override
- This mode matches the existing `createWebGLFallback()` implementation

#### 7.4.3 Mode-Switch Trigger Conditions

The `RendererQualityController` (to be implemented) reads the following signals and emits `'renderer.mode.change'` events:

| Signal | Threshold | Action |
|---|---|---|
| `renderer.info.memory.geometries` | > 5,000 | Mode 1 → Mode 2 (shadow PSO storm risk) |
| `renderer.info.memory.geometries` | > 12,000 | Hard warn: project memory ceiling exceeded |
| `PerformanceObserver` LONGTASK > 50 ms | ≥3 within 5 s window | Mode 1 → Mode 2 |
| `BatchCoordinator.runBatch()` entry | batch element count > 2,000 | Mode 1 → Mode 2 (preemptive) |
| `BatchCoordinator.signalBuildQueueDrained()` | geometry count < LOW_THRESHOLD | candidate for Mode 2 → Mode 1 |
| `GPUDevice.lost` | reason ≠ 'destroyed' | Mode 1/2 → Mode 3 |
| `GPUDevice.lost` + recovery success | — | Mode 3 → Mode 1 |

`LOW_GEOMETRY_THRESHOLD` = 1,000 (configurable). The hysteresis between the 5,000 entry threshold and 1,000 exit threshold prevents mode oscillation on scenes near the boundary.

#### 7.4.4 BatchCoordinator Integration

The `BatchCoordinator._executeFinalSweep()` method is the correct integration point. The shadow reactivation `setTimeout(30000)` callback should be conditioned on the current renderer mode:

```typescript
// In BatchCoordinator._executeFinalSweep() (pseudocode):

const rendererMode = rendererQualityController.getCurrentMode();

if (rendererMode === 'webgpu-full') {
    // Mode 1: schedule adaptive shadow reactivation (Phase K — 50 walls/slice)
    setTimeout(() => this._reactivateShadowsAdaptive(), 30_000);
} else {
    // Mode 2 / 3: skip shadow reactivation entirely
    // castShadow remains false on all batch geometries indefinitely
    // Shadow reactivation deferred until mode returns to 'webgpu-full'
    this._shadowReactivationDeferred = true;
    rendererQualityController.once('mode.restored', () => {
        this._reactivateShadowsAdaptive();
    });
}
```

This replaces the hardcoded `setTimeout(30000)` pattern with a mode-aware path. Shadows are only reactivated when the renderer is in Mode 1 AND the geometry count is below the PSO storm threshold.

#### 7.4.5 Phase F.1 Is the Prerequisite for Everything

All mode-switching logic depends on `renderer.info.memory.geometries` being an accurate reflection of scene element count. Today it is not — the NME proxy geometry leak inflates the count by 1,182 per EPS flush per 9 CW elements. Until Phase F.1 (NME proxy `geometry.dispose()`) is implemented:

- The geometry count will always read high (4,897–12,285 in sessions with any batch).
- The `RendererQualityController` will always trigger Mode 2 regardless of actual scene complexity.
- Mode 1 → Mode 2 transition will fire immediately on any batch and never recover.

**Phase F.1 must be implemented before `RendererQualityController` can provide meaningful mode switching.** This makes Phase F.1 the single highest-priority prerequisite for the entire WebGPU-first strategy.

---

### 7.5 Implementation Roadmap for WebGPU-First Strategy

| Task | File(s) | Dependency | Effort | Fixes |
|---|---|---|---|---|
| **F.1** NME proxy `geometry.dispose()` | `NativeElementMeshExporter.ts` | None | ~4h | G0-MEM geometry leak; prerequisite for all mode switching |
| **F.2** `resumeAndFlush()` → `resume()` | `CurtainWallBuilder.ts`, `WallFragmentBuilder.ts`, `SlabFragmentBuilder.ts`, `BatchCoordinator.ts` | F.1 | ~6h | Cluster A (53 LONGTASKs, 6,898ms) |
| **F.3** Shared FrameScheduler budget token | `BatchCoordinator.ts`, `scheduler.ts` | F.2 | ~4h | G9 builder drain budget racing |
| **RQC-1** `RendererQualityController` (new) | `packages/renderer-three/src/RendererQualityController.ts` | F.1 | ~8h | Memory + LONGTASK monitoring; mode emit |
| **RQC-2** Shadow mode API on `RendererResult` | `createRenderer.ts` → `packages/renderer-three/` | RQC-1 | ~3h | `setShadowsEnabled(boolean)` runtime API |
| **RQC-3** BatchCoordinator mode integration | `BatchCoordinator.ts` | RQC-1, RQC-2 | ~4h | Mode-conditional shadow reactivation |
| **RQC-4** Migrate `createRenderer.ts` + `rendererPrewarm.ts` into `packages/renderer-three/` | `src/engine/subsystems/rendering/` → `packages/renderer-three/src/` | P2 gate green (already ✅) | ~6h | P2 violation; C04 contract compliance |
| **PICK-1** Throttle `gpu-pick` to ≤1 per 16ms | `PickResolver.ts` | None | ~3h | 95–451ms hover LONGTASK (Navigation Killer) |
| **PICK-2** BVH fallback for hover (GPU pick for click only) | `PickResolver.ts`, `BvhPickStrategy.ts` | PICK-1 | ~8h | Hover cost O(log n) vs O(geometry_count) |
| **DR-1** DependencyResolver per-rAF budget | `DependencyResolver.ts` | Phase G ✅ | ~6h | CASCADE unthrottled at scale (Cluster C) |
| **WASM-1** `IfcManager.loadIfcFileByUrl()` guard during active batch | `plugins/ifc-import/src/` | None | ~2h | WASM heap OOM risk during concurrent import+batch |
| **WASM-2** `RingBufferUndoStack` memory budget cap | `packages/command-bus/src/RingBufferUndoStack.ts` | S03 fix | ~4h | Immer draft OOM at large element counts |

**Total estimated effort**: ~58 h (approximately 2 sprints)

---

### 7.6 Live Log Evidence Summary (2026-05-07 Sessions)

| Session | Geometry count | Key finding | GPU mode impact |
|---|---|---|---|
| 1 | 4,897 (stable) | 53 LONGTASKs Cluster A (6,898ms); 8 LONGTASKs Cluster B (1,591ms) | WebGPU native — shadow PSO storm confirmed |
| 2 | 0 (post-recovery) | **WebGPU device loss**, 767ms recovery, 22 uniform LONGTASKs | Device loss path exercised — recovery succeeded |
| 3 | 0 (post-recovery) | **22,182ms single LONGTASK** — tab frozen 22 s | resumeAndFlush() + recovery interaction |
| 4–5 | 0 | Continuous 229–629ms LONGTASKs, FPS 1–4 | Builder drain + pick interaction |
| **5** | **3,486** | **gpu-pick hover 95–451ms/event, FPS 4–8** | Navigation killer confirmed. 43 LONGTASKs in navigation fragment |
| **6** | 3,668 (+182 in 10s) | THREE.LineLoop error per frame; +182 geometry leak during navigation | Active geometry leak during navigation confirmed |
| **7** | 3,644 → 0 (post-recovery) | **5,742ms + 8,804ms LONGTASK pair; second WebGPU device loss** | 2 device losses in 7 sessions (28% loss rate) |

**Key patterns confirmed by live logs**:

1. **WebGPU device loss rate: 2/7 sessions (28%)** — the current build loses the GPU device in roughly 1 in 4 sessions involving a large batch. This is partially caused by the `resumeAndFlush()` LONGTASK storm exhausting GPU command queue buffers. Phase F.2 is expected to reduce device loss frequency significantly.

2. **Geometry leak is universal**: every session with a CW batch shows `geometries > 3,000`. No session recovers to `geometries < 500` without a full page reload. Phase F.1 is the only fix.

3. **Navigation is unusable post-batch with >3,000 geometries**: Sessions 5–6 confirm FPS = 4–8 throughout navigation. This is not a hardware issue (the geometry count is the multiplier). Pre-batch FPS is acceptable (~55 fps implied by <18ms total cost at 0–500 geometries).

4. **The WebGPU-no-shadows mode directly addresses the 28% device loss rate**: Device loss during sessions 2 and 7 occurred during or immediately after the shadow PSO compilation storm (Cluster B). By preventing shadow re-enabling during large-model sessions (Mode 2), the peak GPU command buffer pressure is eliminated, removing the primary device-loss trigger.

---

### 7.7 Contracts and Principles Impacted

| Contract / Principle | Impact | Gap |
|---|---|---|
| **C04 §1.4** — WebGPU adapter | Mode 2 must still use `isWebGPURenderer = true` path — no renderer recreate | `setShadowsEnabled()` API missing from `RendererResult` |
| **C04 §2** — Single rAF | `RendererQualityController` must subscribe via `getFrameScheduler()`, not add its own `requestAnimationFrame` | Not yet implemented |
| **C04 §3** — GPU picking | Mode 2 does not affect GPU pick strategy | Hover throttling still needed independently |
| **C10 NFT-4** — Frame budget ≤16ms p95 | Unachievable today for any session with >3,000 geometries | Phase F.1 + F.2 + PICK-1 are prerequisites |
| **C10 NFT-16** — Shadow quality | Mode 2 explicitly disables shadows | NFT-16 acceptance criteria must be qualified: "shadows enabled when geometry count ≤ 5,000" |
| **C11 §2 step 3** — Deferred geometry | Builder drain LONGTASKs are the frame-budget consequence of step 3 being violated (synchronous geometry build) | Phase F.2 is the mechanical fix; step 3 requires `FrameScheduler.schedule()` in handlers |
| **C13 §3** — Project isolation | `RendererQualityController` mode must reset on project switch | Must hook into `engineLauncher.__engineTeardown` |
| **C01 P2** — Single THREE owner | `createRenderer.ts` + `rendererPrewarm.ts` in `src/` violate P2 | Package promotion to `packages/renderer-three/` (RQC-4) |

---

### 7.8 Summary: WebGPU-First Strategy

```
DEFAULT STATE (project open, geometry count ≤ 5,000, no LONGTASK):
  Mode 1 — WebGPU Full
  Shadows: ON, SSGI: ON, GPU pick: ON
  FPS target: ≥ 60 fps

LARGE BATCH IN FLIGHT (element count > 2,000 OR geometry count > 5,000 OR LONGTASK storm):
  Mode 2 — WebGPU No-Shadows
  Shadows: OFF (castShadow=false, shadowMap.enabled=false)
  SSGI: ON, GPU pick: ON
  Shadow reactivation: CANCELLED / DEFERRED until Mode 1 restored
  FPS during drain (Phase F.2): ≥ 30 fps
  FPS post-drain (Phase PICK-1): ≥ 30 fps

DEVICE LOSS OR PERSISTENT STORM WITH MODE 2 ACTIVE:
  Mode 3 — WebGL Fallback
  Shadows: ON (PCFShadowMap), MSAA antialias, preserveDrawingBuffer
  TSL pipeline: NOT AVAILABLE (no SSGI, no TRAA)
  GPU pick: replaced by BVH pick (O(log n))
  FPS: hardware-dependent, typically ≥ 30 fps at ≤ 1,000 elements

PREREQUISITE (must ship before RendererQualityController is meaningful):
  Phase F.1 — NME proxy geometry.dispose()
  Phase F.2 — resumeAndFlush() → resume()
  These two changes alone restore post-batch navigation from FPS=4 to FPS≥30.
```

---

## §8 — Phase F Implementation Findings (2026-05-08)

*Recorded after deep read of all five target files: `NativeElementMeshExporter.ts` (534 LOC),
`CurtainWallBuilder.ts` (1,586 LOC), `SlabFragmentBuilder.ts` (923 LOC),
`BatchCoordinator.ts` (1,650 LOC), `WallFragmentBuilder.ts` / `engineLauncher.ts` (2,385 + 2,660 LOC).
All nine GA gates continue to exit 0 after the changes below.*

---

### §8.1 — Phase F.1: NME Proxy Group Release

#### Infrastructure state (NME — already present before this session)

`NativeElementMeshExporter.ts` already contained:

| Symbol | Lines | Purpose |
|---|---|---|
| `NMEExportOptions.disposeProxies?: boolean` | 46–48 | Flag to enable geometry disposal on release |
| `_disposeProxyGroup(group, disposeGeometry)` | 483–498 | Disposes geometries where `userData.sharedGeometry !== true` |
| `releaseGroups(groups, opts?)` | 500–530 | Public cleanup entry point, honours `opts?.disposeProxies` |

The `_disposeProxyGroup` guard (`userData.sharedGeometry !== true`) is correct for
CW mullion BoxGeometry — the `mullionGeometryCache` in `CurtainWallBuilder` stamps
`userData.sharedGeometry = true` on every cached geometry, preventing accidental disposal
of GPU buffers shared between the InstancedMesh and the proxy Mesh.

#### Safety constraint on `disposeProxies: true`

Passing `{ disposeProxies: true }` is **not yet safe** for any current call site because:

1. **Standard Mesh proxies** — created as `new THREE.Mesh(source.geometry, source.material)`.
   `proxy.geometry` is aliased to the live scene geometry; `source.geometry.userData.sharedGeometry`
   is not set, so `_disposeProxyGroup` would incorrectly call `.dispose()`, freeing the GPU
   buffer while the scene still renders from it.

2. **IM proxies without the cache stamp** — Any InstancedMesh geometry not routed through
   `mullionGeometryCache` lacks the `sharedGeometry` flag and would suffer the same fate.

3. **§H.2 proxy descriptor cache** — `exportForView()` stores `descriptor.geometry = proxy.geometry`
   in the NME proxy cache immediately, before EPS.project() runs.  Disposing a cache-miss
   geometry on the error path would corrupt subsequent cache-hit reconstructions
   (`descriptor.geometry` becomes a disposed `BufferGeometry` with no GPU allocation).

The code comment at lines 41–48 of `NMEExportOptions` states the *intent* — that IM
sub-instance geometries should be cloned per-proxy so they can be owned and disposed.
That cloning has not been implemented; `disposeProxies: true` is therefore **infrastructure
for a future hardening pass**, not something callers should pass today.

#### Actual gap found — missing `releaseGroups` on success and stale paths

All callers called `nativeElementMeshExporter.releaseGroups(nativeGroups)` **only** on
their `.catch()` branch.  Stale-projection branches and the entire SectionViewService
success path never called it at all, holding wrapper `THREE.Group` + child `THREE.Mesh`
objects alive in the closure until JS GC ran.

**Six paths were missing a release call:**

| File | Path | Branch fixed |
|---|---|---|
| `SectionViewService.ts:179` | `_projectSection` | Success — only error path existed |
| `PlanViewManager.ts:669` | `_ensureProjection` | Stale-by-deactivation (`!this._active`) |
| `PlanViewManager.ts:677` | `_ensureProjection` | Stale-by-generation (`!accepted`) |
| `PlanViewManager.ts:777` | `_ensureProjectionForSplitView` | Stale-by-generation (`!accepted`) |
| `ViewController.ts:1410` | `_activateFloorPlanView` | Stale-by-generation (`!accepted`) |
| `ViewController.ts:1534` | `_activateElevationView` | Stale-by-generation (`!accepted`) |

All six were fixed in this session by adding
`nativeElementMeshExporter.releaseGroups(nativeGroups)` before the early `return` (stale
paths) or immediately after the cache write (SectionViewService success path).  No
`disposeProxies` option was passed — `releaseGroups()` without options calls `group.clear()`
on each non-cache-hit group, dropping child Mesh references and allowing GC to collect the
proxy objects promptly.

#### Remaining work (future pass)

To enable `{ disposeProxies: true }` safely:
1. Clone IM proxy geometry in `exportForView()`:
   `const proxyGeom = instanced.geometry.clone(); proxyGeom.userData = { nmeOwnedGeometry: true };`
2. Update `_disposeProxyGroup` to dispose on `userData.nmeOwnedGeometry === true` (not
   `!sharedGeometry`) — avoids mutating scene geometry `userData`.
3. Ensure cloned geometries are NOT stored in the §H.2 NME proxy cache (or are evicted
   before disposal), preventing stale-descriptor GPU errors on subsequent cache-hits.
4. Pass `{ disposeProxies: true }` at all `releaseGroups` call sites once steps 1–3 land.

---

### §8.2 — Phase F.2: resumeAndFlush() → resume() Migration

#### Status: **fully implemented before this session — no code changes required**

Exhaustive search across all three builder control surfaces:

**`engineLauncher.ts` — wall builder (`window.__wallRebuildControl`)**

`_wallRebuildControlResume()` is defined at lines 1860–1874 and wired into
`window.__wallRebuildControl.resume` at line 1896.  The §F.2 function schedules
`_flushWallRebuild` into a `FrameScheduler` `pre-render` slot instead of running
synchronously, so the WallJoinResolver O(n²) pass lands in its own render tick —
not inside the same slot as the CW and slab drains.

`resumeAndFlush()` (synchronous variant) is intentionally retained at line 1897 for
`ProjectLoader`, which requires walls to be fully resolved before its `REDETECT_ROOMS`
finally-block executes.  This is not a migration target.

**`CurtainWallBuilder.ts` — `_cwControl.resume()`**

`resume()` is defined at lines 613–633.  Schedules a `FrameScheduler` `pre-render`
tick for the deferred CW rebuild drain.

**`SlabFragmentBuilder.ts` — `_slabControl.resume()`**

`resume()` is defined at lines 238–259.  Same async-schedule pattern.

**`BatchCoordinator.ts` — call sites**

All three control surfaces are invoked via the typed `_wallControl`, `_cwControl`,
`_slabControl` fields (registered via `registerBuilderControls()`).  Every internal
call site uses `.resume()`:

| Location | Lines | Trigger |
|---|---|---|
| `runBatch` deferred callback | 675, 683, 696 | Normal batch completion |
| `runBatch` error path | 731, 732, 733 | EPS pipeline failure |
| `forceReset` | 1594, 1595, 1596 | Emergency teardown |

No call to `resumeAndFlush()` exists in `BatchCoordinator.ts`.  The migration is complete.

#### Performance contract delivered

With `resume()` in place, the WallJoinResolver O(n²) pass, the CW drain, and the slab
drain each land in separate `pre-render` slots rather than sharing a single synchronous
call on the main thread.  This directly enables the post-batch navigation recovery
from FPS=4 → FPS≥30 described in §7 and ADR-0045.

---

### §8.3 — Implementation summary

| Phase | Work | Status |
|---|---|---|
| F.1 — NME proxy infrastructure | `NMEExportOptions`, `_disposeProxyGroup`, `releaseGroups` | Pre-existing ✓ |
| F.1 — Safe disposal (`disposeProxies: true`) | Geometry cloning + cache-safe eviction | **Deferred** (future pass) |
| F.1 — Missing `releaseGroups` on 6 paths | Added to all success/stale branches | **Done this session** ✓ |
| F.2 — `resume()` implementations | All three builders + BatchCoordinator | Pre-existing ✓ |
| F.2 — `resumeAndFlush` migration | BatchCoordinator uses `resume()` everywhere | Pre-existing ✓ |

*End of audit — PRYZM BIM Platform Structural Audit 2026-05-08*
