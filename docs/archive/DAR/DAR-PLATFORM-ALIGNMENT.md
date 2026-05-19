# PRYZM vs DAR Platform Vision — Alignment Analysis

> **Context:** This document compares the architectural vision described in the *DAR – Founding Platform Engineer* interview preparation document (MIAW Foundations, 2nd Round) against what PRYZM has actually built. The DAR document outlines how an expert would design a browser-native BIM platform from scratch for a large organization. Each section covers a major architectural theme: what the document prescribes, what PRYZM did, and — where they differ — how PRYZM actually solved it.

---

## 1. Data Model — Semantic-First Architecture

### What the document says
- The data model is the source of truth; geometry is a **deterministic projection of structured data**
- No "dumb meshes"; everything rebuildable, traceable, consistent
- **Separate relational tables**: `Element`, `GeometryRecord`, `Relationship`, `Snapshot`
- Each element carries `id`, `type` (IFC4X3 class), `disciplineTag`, `geometry_ref`, `properties: JSONB`, `version`
- Geometry record stores `glb_url`, `brep_ref`, `bbox`, `lod_urls`
- Typed relational edge table for element-to-element relationships
- Spatial index on bbox (PostGIS / GiST) for frustum queries
- JSONB for properties — IFC properties are heterogeneous

### What PRYZM built
**Partially aligned — with a different trade-off.**

PRYZM's PostgreSQL schema (`server/schema.sql`) does not normalize elements, geometry, and relationships into separate tables. Instead:
- **`project_versions.snapshot JSONB`** stores the entire serialized BIM model as one JSON blob per version
- Geometry and element identity live **inside** the JSON snapshot, not as separate `Element` / `GeometryRecord` tables
- There is no `Relationship` edge table in the DB schema
- JSONB is used extensively — for command payloads, audit metadata, webhook config, visibility rules — but not as per-element property storage in individual rows

The internal element graph exists as an **in-memory typed store** (managed by `@pryzm/stores`, `@pryzm/schemas`) and is synced via the Yjs CRDT layer rather than being persisted row-by-row in PostgreSQL.

**Why PRYZM chose this approach:** The snapshot-as-JSONB model keeps schema migrations simple and allows the internal element graph (which can evolve rapidly) to be decoupled from the DB schema. The trade-off is that element-level SQL queries (e.g., "show all walls thicker than 200mm") require deserializing the snapshot rather than querying indexed rows.

**Gap:** No spatial index, no `GeometryRecord` table with separate `lod_urls`, no typed relational edge table. The document's element-graph DB model is not yet implemented.

---

## 2. System Architecture Layers

### What the document says
Five explicit tiers:
1. **Client layer** — 3D viewport, UI shell (React), offline/PWA (IndexedDB + SW)
2. **Engine layer** — WASM + TypeScript: geometry kernel, scene graph, command bus, CRDT
3. **Backend layer** — Node.js BFF: auth, projects, AI router, collab (Socket.io), IFC service, export, jobs API, webhook/events
4. **Compute layer** — isolated workers: geometry jobs, IFC parser, render bake worker
5. **Data layer** — PostgreSQL (entities), object store (IFC/GLB/DWG), vector DB (embeddings), time-series (telemetry)
5. **AI layer** — LLM gateway, embedding service, validation/rules

### What PRYZM built
**Strongly aligned at the structural level.**

PRYZM implements all five layers:

| Layer | Document vision | PRYZM implementation |
|---|---|---|
| Client | 3D viewport + React shell + PWA/IndexedDB | `packages/renderer-three`, React UI in `src/`, PWA via service worker, `@pryzm/persistence-client` (IndexedDB) |
| Engine | WASM + TS: geometry kernel, scene graph, command bus, CRDT | `packages/command-bus`, `packages/scene-committer`, `packages/frame-scheduler`, `packages/sync-client` (Yjs), WASM via `web-ifc` / `rhino3dm` |
| Backend | Node BFF: auth, projects, AI router, collab, IFC svc, export, webhooks | `server.js` (Express BFF), `server/authStore.js`, `server/projectStore.js`, `server/aiPublicApiRoutes.js`, Socket.io in `server.js`, `server/ifcStorageService.js`, `server/webhookService.js` |
| Compute | Isolated workers: IFC parser, bake worker | `apps/bake-worker`, `apps/ai-worker`, `apps/sync-server`, IFC parsing in `plugins/ifc-import/src/workers/IFCParseWorker.ts` |
| Data | PostgreSQL + object storage + optional vector DB | Replit PostgreSQL (primary) / Supabase (fallback), binary files via `server/ifcStorageService.js`, no vector DB yet |
| AI | LLM gateway + embedding + validation | `packages/ai-host`, `packages/ai-cost`, Anthropic via CF Worker relay or direct key |

**Gap:** Vector DB (embeddings, semantic search) and time-series telemetry storage are not yet implemented. The document lists these as part of the data layer from day one.

---

## 3. Frontend Architecture

### What the document says
- Three.js scene graph wrapped by an **engine abstraction layer**
- Renderer is **not React-aware** — owns its own RAF loop via a `FrameScheduler` singleton
- BIM **fragments** (instanced geometry batches) as primitive rendering unit
- LOD system: full tessellation <10m, simplified 10–50m, billboard/box >50m
- Path tracer (`three-gpu-pathtracer`) loaded lazily on demand
- Two state domains: **engine state** (Yjs/CRDT, typed element store) and **UI state** (React/Zustand)
- Commands flow through a typed `CommandBus`: `{type, payload}` → validated → applied to Yjs → triggers renderer diff
- Optimistic updates: applied locally, confirmed/rolled back on server ACK
- Yjs awareness for cursors/presence (ephemeral)
- IndexedDB persistence via `y-indexeddb` for offline support

### What PRYZM built
**Strongly aligned — some items partially implemented.**

- **FrameScheduler:** Fully implemented in `packages/frame-scheduler/src/FrameScheduler.ts` with priority lanes (`interaction` / `idle` / `background`) and tick ordering (`pre-render` / `render` / `post-render` / `overlay`). Renderer attaches as a tick listener. The renderer RAF loop is completely independent of React's render cycle.

- **SceneCommitter:** Fully implemented in `packages/scene-committer/`. `CommitterHost` owns `SceneRegistry`, `MaterialPool`, and `LODManager`. `dispatcher.ts` translates store diffs into `SceneDelta[]` batches. The renderer does not touch Three.js directly — all mutations flow through `SceneCommitter`. This matches the document's prescription exactly.

- **LOD system:** Implemented via `packages/scene-committer/src/LODManager.ts` (`computeLOD(distanceMetres)` → tiers 0/1/2). It is a commit-time selection model (skips commits for far elements) rather than a separate GPU LOD pass, which is a simpler but functionally equivalent approach.

- **CommandBus:** Fully implemented in `packages/command-bus/src/CommandBus.ts` with OpenTelemetry span `pryzm.command.execute`. Commands flow through typed bus, are applied to Yjs, and trigger renderer diffs.

- **State separation:** Engine state (Yjs CRDT via `@pryzm/stores`) and UI state (React) are kept fully separate.

- **Path tracer:** `three-gpu-pathtracer` is listed as a dependency in `package.json` but a full `PathTracer` implementation was not found in the source packages — appears to be a dependency stub or in a feature branch.

- **Instancing:** No `InstancedMesh` usage found in `packages/renderer-three/src`. This is a gap versus the document's prescription.

- **WebGPU/WebGL2 fallback:** `packages/renderer/src/Renderer.ts` implements `resolveMode()` with auto → WebGPU → WebGL2 fallback at the mode-resolution level, but the Three.js renderer is still instantiated as `WebGLRenderer` in all paths. Full WebGPU renderer backend is not yet active.

**How PRYZM differed:** LOD is handled at scene commit time rather than as a multi-pass render feature. This is simpler to implement and appropriate for the current scale.

---

## 4. Backend Design

### What the document says
Versioned REST APIs:
- `/api/v1/` — CRUD for projects, elements, members
- `/api/v1/families` — plugin/family marketplace
- `/v1/ai/` — AI public API (metered, auth-gated)
- `/api/stripe/` — payment webhooks

Modular services: `authStore`, `projectStore`, `ifcStorageService`, `renderService`, `aiUsageStore`, `webhookService`, `familyMarketplaceRoutes`

No GraphQL in v1. WebSocket (Socket.io) for real-time events and CRDT relay. Job queue for compute. Workers are separate Node.js processes or containers.

### What PRYZM built
**Exactly aligned — this appears to have been built to this specification precisely.**

The API routes in `server.js` match the document's prescribed structure verbatim:
- `app.use('/api/v1/families', ...)` — family marketplace
- `app.use('/api/v1', apiLimiter, authMiddleware, v1Router)` — CRUD
- `app.use('/v1/ai', authMiddleware, buildAiPublicApiRouter())` — AI public API
- `app.use('/api/stripe/webhook', ...)` — raw body stripe webhook

All prescribed service modules exist in `server/`:
- `authStore.js`, `projectStore.js`, `ifcStorageService.js`, `renderService.js`, `aiUsageStore.js`, `webhookService.js`, `familyMarketplaceRoutes.js`

No GraphQL. Socket.io used for real-time. Compute workers are separate apps (`apps/bake-worker`, `apps/ai-worker`, `apps/sync-server`). This is a near-perfect implementation of the described backend.

**Minor gap:** The document describes a job queue (BullMQ/Redis) for compute. PRYZM implements this with an abstracted queue interface that defaults to **in-memory** (via `InMemoryBakeQueue`) and has an opt-in BullMQ/Redis path when `REDIS_URL` is set. Redis/BullMQ is not active in the current deployment.

---

## 5. Scalability Strategy

### What the document says
Three tiers:
- **Tier 1 (0–10k users):** Single Node.js server, managed PostgreSQL, R2/S3, Redis for job queues
- **Tier 2 (10k–200k):** Horizontally scaled BFF behind load balancer, Socket.io with Redis adapter, auto-scaling compute workers, CDN for GLBs
- **Tier 3 (200k+):** Extract AI gateway, extract collab sync server, edge auth, vector DB

Modular monolith → extract services at proven pain points. Not microservices from day one.

### What PRYZM built
**Partially aligned — currently at Tier 1, with Tier 2/3 infrastructure partially pre-built.**

PRYZM is in a "Tier 1 with Tier 2 scaffolding" state:
- Single Node.js BFF (`server.js`) serving all API, auth, and collab
- PostgreSQL via Replit (or Supabase) — managed
- `apps/bake-worker` and `apps/sync-server` are **already separate services** (Tier 2 pattern) but run in-process or co-located currently
- Redis/BullMQ adapter exists but is not active
- No CDN configuration or Redis Socket.io adapter yet
- Collab sync server (`apps/sync-server`) is already extracted as its own deployable service (Tier 2/3 pattern)

**Where PRYZM went ahead of the document:** The sync-server and bake-worker are already designed as separate deployable services with HTTP/WebSocket boundaries, which is the Tier 2+ pattern. This is forward-looking.

**Gap:** Redis, CDN, horizontal scaling, and vector DB are not configured. The platform is currently designed for Tier 1 deployment.

---

## 6. Real-Time Collaboration (CRDT)

### What the document says
- **Yjs CRDT** — chosen over OT for BIM (typed graph, not linear text)
- Yjs `Map`/`Array`/`Text` primitives for element properties, relationships, command lists
- Socket.io rooms per project (join on auth, leave on disconnect)
- Redis pub/sub as Socket.io adapter for multi-instance
- Yjs awareness protocol for ephemeral presence (cursor, active tool, user color/name)
- IndexedDB via `y-indexeddb` for offline support
- On reconnect: merge local Yjs state vector with server — CRDT handles conflicts
- Named versions: Snapshot record with label, linked to ISO 19650 state machine
- Semantic conflict detection for simultaneous geometric edits (notify, don't block)

### What PRYZM built
**Strongly aligned with notable architectural detail differences.**

- **Yjs CRDT:** Fully implemented via `packages/sync-client/src/YjsDocAdapter.ts`. One `Y.Doc` per project. Element properties stored in Yjs `Y.Map`. Server applies binary updates and broadcasts merged deltas via `apps/sync-server/src/YjsProjectCache.ts`.

- **CRDT conflict resolution:** PRYZM goes **beyond** the document's description with a `CRDTConflictResolver` (`packages/sync-client/src/CRDTConflictResolver.ts`). Numeric values use an additive delta merge; string/scalar conflicts are surfaced to the user for resolution rather than silently LWW-resolved. This is more sophisticated than the document prescribes.

- **Presence/awareness:** Implemented via Yjs awareness wrapper (`packages/sync-client/src/awareness.ts`). Cursor position is throttled/coalesced at 50ms. Server enriches presence with authoritative `displayName` (prevents client spoofing) via `apps/sync-server/src/presence/PresenceService.ts`.

- **Transport:** The authoritative sync server (`apps/sync-server`) uses **plain WebSockets** at `/sync` with a per-`projectId` subscription/broadcast model — not Socket.io rooms. However, the older engine subsystem (`src/engine/subsystems/initCollaboration.ts`) still references Socket.io `join-project` / `remote-cursor` events. There are **two coexisting collaboration implementations** — the newer Yjs/WebSocket layer and the older Socket.io layer.

- **Offline/IndexedDB:** Implemented as a snapshot facade (`packages/persistence-client/src/IndexedDBStore.ts`, DB name `pryzm-offline-v1`) with `snapshots` and `geometryCache` stores. This is a **read-only offline mode** (showing cached snapshots), not the full `y-indexeddb` bidirectional sync described in the document.

- **Redis Socket.io adapter:** Not implemented. Multi-instance collab is noted as deferred in `apps/sync-server/src/index.ts` ("single-instance only" comment).

**Gap:** True `y-indexeddb` offline-first merge-on-reconnect is not implemented. Offline mode is read-only. Redis pub/sub for Socket.io is not active. Two collaboration layers coexist and need consolidation.

---

## 7. AI Integration Architecture

### What the document says
- AI is a **system layer**, not a feature
- AI actions translate into structured commands via the **same pipeline as user actions**
- Architecture: Client → `/v1/ai` → Auth + Quota Middleware → AI Router → LLM Gateway → Usage Recorder
- **`packages/ai-host/`** as isolated module: takes NL command, returns typed BIM mutations
- OpenTelemetry spans on every AI call (latency, token count, model ID, command type)
- Streaming responses via Server-Sent Events for long LLM outputs
- Never call LLM APIs directly from the frontend
- LLM patterns: structured output, RAG, tool-calling/function-calling, design critique
- Embeddings for semantic search over BIM content (pgvector or Pinecone)
- AI-generated commands pass through the same constraint validators as human commands
- Human confirmation gate for any action that creates/moves/deletes elements
- Rollback via Yjs — any AI action is undoable via Ctrl+Z

### What PRYZM built
**Strongly aligned on the core pipeline; some advanced patterns not yet implemented.**

- **`packages/ai-host/` isolation:** Fully implemented. Lazy dynamic import boundary (`AiHost.ts` → `AiHost.impl.ts`) enforces that the AI plane does not pollute the main bundle. The AI bus separates workflow lifecycle events from the command bus — only **approved** workflow outputs reach the command bus.

- **Command bus integration:** AI proposes commands via `commandProposalStore`; the human confirms before `CommandBus` commits. This exactly matches "human confirmation gates" and "AI commands pass through same validators."

- **Quota/cost metering:** `packages/ai-cost/src/CostMeter.ts` implements per-call caps, daily caps, monthly caps, model allowlists, and `PLAN_BUDGETS`. OTel metrics: `pryzm.ai.cost.usd` counter and per-call histogram.

- **OpenTelemetry spans:** AI workflow spans (`pryzm.ai.workflow.${kind}`), AI bus events, and command bus spans (`pryzm.command.execute`) are all instrumented.

- **AI features built:** `VoiceCommand`, `PlanCritique`, `Generate3Options` workflows; AI plugins (`plugins/ai-floorplan`, `plugins/ai-generative`, `plugins/ai-query`, `plugins/ai-rules`, `plugins/ai-voice`); AI element creation UI and `QueryEngine`.

- **LLM calls never from frontend:** Correct. All AI calls flow through the Express server's `/v1/ai` and `/api/anthropic/v1/messages` routes.

- **Streaming via SSE:** Not found. The AI API returns async invocation immediately and results come via WebSocket project events (polling `runId`), not token-by-token SSE streaming. This is a simplification.

- **Tool-calling / function-calling pattern:** Not found in `packages/ai-host/`. The AI layer uses workflow/proposal patterns rather than explicit LLM tool-calling.

- **RAG / embeddings / semantic search:** Not implemented. No vector DB, no embedding pipeline, no `pgvector`. This is the largest AI gap versus the document's vision.

**How PRYZM differed:** The async WebSocket invocation pattern (post → get `runId` → WS event on completion) is simpler and more reliable than SSE streaming, but loses the "progressive response" UX the document describes.

---

## 8. Interoperability & WASM

### What the document says

| Use case | WASM module | Reason |
|---|---|---|
| IFC parsing | `web-ifc` (C++) | ~50x faster than pure JS |
| Geometry booleans | `manifold` (C++) | JS number precision insufficient |
| Mesh simplification | `meshopt` (C++) | Performance-critical |
| PDF generation | `pdf-lib` WASM path | Typographic control |
| Rhino 3DM import | `rhino3dm` (C++) | Direct openNURBS port |

- IFC: first-class, both import and export, IFC4X3
- Revit: C# add-in exporting IFC on demand, two-way sync via webhook
- DWG/DXF: server-side conversion (no open-source WASM DWG reader)
- IFC stored internally as hybrid (typed element graph, not raw IFC storage)

### What PRYZM built
**Aligned on most WASM modules; some gaps.**

- **`web-ifc`:** Fully implemented. IFC parsing runs in a dedicated Node worker (`plugins/ifc-import/src/workers/IFCParseWorker.ts`). IFC export uses `webifc-helpers.ts`. Both import and export are supported.

- **`rhino3dm`:** Fully implemented. Client-side lazy dynamic import in `plugins/rhino-import/src/reader.ts` using `File3dm.fromByteArray()`. Also uses Three.js's `Rhino3dmLoader` for `.3dm` files.

- **`manifold-3d`:** Listed as a dependency in `package.json` but **no usage found** in the source code. Geometry boolean operations are not yet implemented.

- **`meshopt`:** Not found as an explicit WASM import. Mesh simplification is not explicitly implemented in the reviewed code.

- **`pdf-lib`:** Used in `plugins/schedules/src/export/pdf.ts` as a pure JS PDF generator, not via the WASM path described in the document.

- **DWG/DXF:** Server-side DWG conversion via Autodesk APS Model Derivative API (`server/dwgConversionService.js`). The DXF plugin (`plugins/dxf/src/index.ts`) is a stub with empty wiring — not yet active.

- **Revit add-in:** A `revit-addin/` directory exists in the repo, indicating this has been started. Full two-way sync via webhook is the documented intent.

- **IFC storage model:** PRYZM uses a hybrid approach (internal element graph in memory/Yjs + IFC as import/export codec), which matches the document's recommendation exactly.

---

## 9. Plugin System

### What the document says
- Manifest-driven: `PluginManifest` with `id`, `version`, `entryPoint`, `permissions[]`, `uiSlots[]`, `schema`
- Sandbox isolation: plugin code in sandboxed iframe or Web Worker, structured message passing, no direct DOM access
- Capability tokens: plugin requests permission, user approves, server issues scoped JWT
- Plugin marketplace: manifest registry in PostgreSQL, versioned installs, per-org pinning
- Third-party developer tiers: REST API → Plugin SDK → Headless SDK

### What PRYZM built
**Exceeds the document's specification in several areas.**

- **PluginManifest:** `PluginManifestSchema` in `packages/plugin-sdk/src/descriptor.ts` with `id`, `version`, `displayName`, `permissions` (7 locked types), `contributions` (5 kinds: `tool`, `panel`, `command`, `element-type`, `view-template`), `uiSlots`, marketplace pricing fields (`pricingModel`, `pricingCurrency`, `pricingAmount`).

- **Sandbox isolation:** iframe with `sandbox="allow-scripts"` only (no `allow-same-origin`). Permission-sensitive CSP built from manifest (`packages/plugin-sdk/src/sandbox/policy.ts`): `connect-src` is `'none'` unless `network:fetch` is granted, in which case it's restricted to `allowedOrigins`. Typed postMessage envelope with directional allowlisting. An **escape-vector audit test suite** is referenced.

- **Plugin SDK:** Full lifecycle hooks (`onActivate`, `onDeactivate`, `onUpdate`), `PluginActivationContext` with permission-gated host proxies, 5-second hook timeout/kill-switch.

- **Marketplace:** Full marketplace API server (`apps/marketplace-api/`) with publish/revoke endpoints, **Ed25519 signature verification** on publish, revocation list (`revocations.json`), per-publisher/slug versioning. This is more robust than the document describes (which mentions only a "manifest registry in PostgreSQL").

- **38 first-party plugins** seeded at S64 D1, covering AI workflows, all BIM element types, format import/export, discipline views, and annotations.

- **Headless SDK:** Documented in `apps/docs-site/src/content/docs/headless/`, allowing the geometry kernel and rendering pipeline to run in Node.js without a browser.

- **Gap:** Per-project plugin version pinning and per-org installs are described in docs but the runtime enforcement mechanism was not verified in code. Scoped JWT per plugin per project (as described in the document) is not clearly visible in the implementation.

---

## 10. Security & Access Control

### What the document says
- RBAC: `Owner` / `Editor` / `Reviewer` / `Viewer` per project
- JWT carries `{ userId, orgId }` — no roles in token
- Every API request: middleware resolves role from DB
- ISO 19650 CDE: state machine enforces additional access rules
- Plugin permissions declared in manifest, user approves on install
- TLS, HSTS, bcrypt (cost 12), server-side RBAC, data isolation per `project_id`, presigned URLs, rate limiting, CORS allowlist, security headers (CSP, COEP, COOP), AI data isolation, append-only audit log, secrets in env vars only

### What PRYZM built
**Strongly aligned — the security implementation closely matches the document's spec.**

- **RBAC:** Roles are ISO 19650 aligned: `appointing_party`, `lead_appointed`, `team_manager`, `team_member`, `viewer` (plus `owner` as platform bypass). Permission matrix in `server/permissions.js`. `hasPermission(role, action, isOwner)` with owner bypass semantics.

- **JWT:** Custom JWT signed with `SESSION_SECRET` (`server/authStore.js`). 30-day expiry. `sub` + `email` in payload — roles are **not** in the token (matched exactly). Roles resolved from DB on each request via `roleCheck(action)` middleware.

- **CDE state machine:** `server/versionStateMachine.js` implements `wip → shared → published → archived` (terminal). Transitions are role-gated. Rejection requires a reason. Every transition writes to `version_audit_log` (append-only).

- **Security headers:** `server/securityHeaders.js` sets `X-Content-Type-Options`, `X-Frame-Options: DENY` (prod), `Referrer-Policy`, `Permissions-Policy`, and CSP (with Three.js/Cesium compatibility noted).

- **CORS:** Centralised allowlist from `ALLOWED_ORIGIN` env var (`server/corsPolicy.js`), shared by Express and Socket.io.

- **Rate limiting:** Three tiers — `globalLimiter` (200 req/15 min), `apiLimiter` (60 req/min), `aiLimiter` (20 req/15 min).

- **Audit log:** Two tracks — `version_audit_log` (CDE state transitions) and `project_command_log` (command catch-up replay with probabilistic 24h purge).

- **COEP/COOP headers** on the Vite dev server: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` (required for SharedArrayBuffer / WASM).

- **Gap:** The document mentions presigned URLs for object storage. PRYZM's `ifcStorageService.js` handles IFC file storage but presigned URL generation for object storage buckets (R2/S3) is not confirmed as implemented (depends on deployment target). OAuth (Google/Microsoft) is implemented in `server/oauthService.js` but `orgId` is not currently in the JWT payload.

---

## 11. Compute Workers & Job Queues

### What the document says
- Job types: IFC parse (5–30s for 10 MB, 5–15 min for 500 MB), DWG conversion (30–120s), mesh simplification, baked lighting (5–60 min), structural analysis, PDF export
- BullMQ (Redis-backed) queue architecture with priority lanes (high/medium/low)
- Workers: stateless, separate process/container, pull job → process → write results → mark complete
- Failed jobs retry with exponential backoff; dead letter queue
- API pattern: POST job → returns `{ jobId }` → Socket.io event on completion

### What PRYZM built
**Architecture aligned; production queue backend deferred.**

- **`apps/bake-worker`:** Express server with `POST /enqueue`, `GET /health`, `GET /stats`. Queue interface (`BakeQueue`) is BullMQ-shaped. `createQueue.ts` selects in-memory (default) or BullMQ (when `REDIS_URL` is set). CPU-based concurrency (`os.cpus().length - 1`). Coalescing window (250ms) before enqueuing. Graceful shutdown with flush.

- **`apps/ai-worker`:** `InMemoryQueue` with `HandlerRegistry` dispatch. BullMQ adapter is noted but not wired in this build.

- **`apps/sync-server`:** Posts to bake-worker via `HttpBakeEnqueuer` (fire-and-forget, does not block WebSocket ack path).

- **IFC parsing:** Runs in a Node.js worker thread (`IFCParseWorker.ts`), not blocking the API server.

- **Gap:** Redis/BullMQ is not active. Dead letter queue, priority lanes, and exponential retry backoff are not yet wired. The `POST /api/v1/jobs/{type}` → `{ jobId }` pattern described in the document is not evidenced as a public API route — job dispatch happens via internal service calls.

---

## 12. What the Document Describes That PRYZM Has Not Built

The following capabilities are explicitly described in the document and are **not yet implemented** in PRYZM:

| Capability | Document section | Status in PRYZM |
|---|---|---|
| Vector DB / embedding pipeline for semantic search | §22–23 | Not implemented. No pgvector, Pinecone, or embedding service |
| RAG-based design rule checking and code compliance | §19, §27 | Not implemented |
| Time-series DB for telemetry/observability metrics | §2 data layer | Not implemented |
| SSE token streaming for LLM responses | §20 | Not implemented; uses async WS polling instead |
| LLM tool-calling / function-calling pattern | §21 | Not implemented; uses workflow/proposal model |
| Geometry instancing (InstancedMesh for repeated elements) | §15 | Not found in renderer packages |
| Production path tracer (three-gpu-pathtracer) | §16 | Dependency exists, implementation not verified as active |
| Active BullMQ/Redis job queue | §38 | In-memory fallback only |
| Redis Socket.io adapter (multi-instance collab) | §34 | Not implemented; single-instance only |
| True y-indexeddb offline merge-on-reconnect | §4 | Read-only offline mode only |
| Manifold boolean geometry operations | §17 | Dependency exists, no usage found |
| PostgreSQL spatial index (bbox frustum queries) | §8, §10 | Not implemented |
| Separate relational element/geometry/relationship tables | §8 | Snapshot JSONB model used instead |
| OpenAPI spec auto-generated from Zod schemas | §30 | Not implemented |
| Presigned URLs for object storage | §41 | Not confirmed |
| Per-org plugin version pinning | §32 | Described in docs, not verified in runtime |

---

## 13. Summary — Alignment Score by Theme

| Theme | Alignment | Notes |
|---|---|---|
| System architecture (5-layer model) | High | All layers present; vector DB and time-series missing |
| Backend API structure | Very High | Matches document spec almost verbatim |
| Frontend architecture (FrameScheduler, SceneCommitter) | High | Core implemented; instancing and full WebGPU pending |
| CRDT / Yjs collaboration | High | Exceeds in semantic conflict resolution; gaps in offline and Redis |
| AI pipeline isolation & metering | High | `ai-host`, `ai-cost`, OTel spans all implemented |
| Plugin system & marketplace | Very High | Exceeds document spec (Ed25519 signing, 38 plugins) |
| Security & RBAC | High | JWT, ISO 19650 state machine, audit log all implemented |
| WASM interoperability | Medium | web-ifc and rhino3dm done; manifold and meshopt gaps |
| Semantic DB data model | Low | Snapshot JSONB used instead of typed element/geometry tables |
| Job queues & compute | Medium | Architecture correct; Redis/BullMQ not active |
| AI semantic search (embeddings, RAG) | Not started | Vector DB and embedding pipeline not yet built |
| Scalability (Redis, CDN, horizontal scale) | Low/Tier 1 | Infrastructure designed for it but not activated |

---

## 14. How PRYZM Solved Things Differently (And Why)

**Snapshot JSONB vs. normalized element tables**
The document prescribes a fully normalized relational element graph. PRYZM chose a "snapshot as JSONB" model, keeping the element graph in-memory (Yjs / typed stores) and persisting it as versioned snapshots. This trades query power for operational simplicity and schema flexibility — appropriate for a rapidly evolving product.

**Plain WebSocket sync server vs. Socket.io rooms**
The document recommends Socket.io rooms. The newer PRYZM sync server uses plain WebSockets with a `projectId` subscription map. This avoids Socket.io overhead and is more lightweight, but loses the Redis pub/sub adapter path for multi-instance collab without additional work.

**Async WS polling vs. SSE streaming for AI**
The document describes Server-Sent Events for progressive LLM output. PRYZM returns a `runId` immediately and pushes the completion event over the existing WebSocket project channel. This reuses existing infrastructure but loses the streaming UX (users see nothing until the full response arrives).

**In-memory queues vs. BullMQ/Redis**
The document prescribes BullMQ from the start. PRYZM built the interface correctly (queue abstraction with BullMQ-shaped API) but defers Redis to when it's operationally warranted. This is a valid "build for 10x, not 100x" trade-off the document itself endorses (§49).

**Two collaboration layers coexisting**
The legacy `initCollaboration.ts` (Socket.io) and the current `@pryzm/sync-client` (Yjs/WebSocket) appear to coexist. This suggests an in-progress migration from the older approach to the newer one, which matches the document's recommendation to "integrate CRDT early" — though PRYZM added it after the initial Socket.io layer rather than from day one.

---

*Document prepared May 2026. Reflects PRYZM codebase state as of the migration checkpoint.*
