# PRYZM 2 — Master Implementation Plan

> ⚠️ **SUPERSEDED BY** `10-MASTER-IMPLEMENTATION-PLAN-36M.md` for sequencing and scope (re-anchored 2026-04-26; banner formalised 2026-04-29 per `phases/audits/PRYZM2-WIREUP-PLAN-S72/25-architecture-docs-cross-alignment.md` §25.8.2 Doc-PR-1).
>
> This document is preserved as the **package-contract reference** that the 36-month plan executes against. Read `10-MASTER…` and the four `phases/PHASE-1*` sub-docs first; consult this doc only for per-package contract details.
>
> Companion to `00-AUDIT.md`, `01-TARGET-ARCHITECTURE.md`, `02-ORCHESTRATION.md`, `03-PASCAL-EDITOR-ANALYSIS.md`, `04-PRODUCTION-PARITY.md`.
> Audience: tech lead + engineers building PRYZM 2.

---

## §0 — Alignment header (re-anchored 2026-04-26)

> **Strategic anchor**: The "definitive plan" title above is now held by `10-MASTER-IMPLEMENTATION-PLAN-36M.md` and the four PHASE-1 sub-docs in `phases/`. This document is preserved as the **package-contract reference** that the 36-month plan executes against.
>
> **Conflict order** (highest wins): `06-PRYZM-IDENTITY-AND-RECOUNT.md` + the `.pryzm` file-format spec → `08-VISION.md` → `10-MASTER…` and the PHASE docs → this doc.
>
> **TypeScript Vanilla Decision (binding)**: PRYZM 2 stays **vanilla TypeScript** at L7. The reference stack in §2 below lists React 19 + @react-three/fiber + @react-three/drei + Zustand + Zundo + Next.js patterns — **all of these are SUPERSEDED for the editor shell**. They remain valid only as descriptions of Pascal's stack (per `03-PASCAL-EDITOR-ANALYSIS.md` §0).
>
> **What in this doc is still authoritative**:
> - **§3 Repository structure** — pnpm workspace + `packages/` + `apps/` + `plugins/` + `tools/` shape, with the expansions in `06` §3.3 (ai-host, cde, headless packages; component-editor / ai-worker / ifc-worker apps; ~30–35 plugins).
> - **§4 Layer interfaces (TypeScript contracts)** — the L0/L1/L2/L3/L4/L5/L6 TS contracts, with **L4 hardened to be pure** per `08-VISION.md` §3 P1 (no THREE, no DOM, no React in the kernel) and **L5 split** so that `THREE` only appears in `packages/scene-committer/` and `plugins/*/committer.ts` per P2.
> - **§5 Wire format & on-disk format** — superseded **only** by the binding `.pryzm` file-format spec when it disagrees; otherwise authoritative.
> - **§6 Database schema, §7 Server services, §8 Plugin SDK contract, §9 Permissions/security, §10 CI/CD gates, §11 Telemetry** — all still authoritative; the 36-month plan ships them in the order specified by `10-MASTER…` and the PHASE docs.
> - **§13 Wall primitive walkthrough** — still the canonical end-to-end example. PHASE-1B uses it as the M4–M6 acceptance reference.
> - **§15 Definition of Done per layer** and **§16 Risk register** — still authoritative.
> - **§17 ADRs** — still the seed list. PHASE-1A/B/C/D extend it with ADRs 001–019 (and counting).
>
> **What in this doc is SUPERSEDED**:
> - **§1 Strategy in one page** "20 × 2-week sprints / 40 calendar weeks", "Sprint 8 alpha / Sprint 14 beta / Sprint 20 GA" → **superseded by `10-MASTER…`'s 72-sprint / 36-month plan**: M12 alpha (PHASE-1D), end Year 2 beta (PHASE-2), M36 GA (PHASE-3). The 40-week number was set before the recount in `06` exposed ~5× the assumed scope.
> - **§2 Reference stack** rows for React (`@react-three/fiber`, `@react-three/drei`, Zustand, Zundo) → **superseded by the TypeScript Vanilla Decision**. The L7 shell remains vanilla TS; R3F is not adopted; Zundo is replaced by event-log replay (already noted in §2 as a future intent — now binding). Three.js, msgpackr, Yjs, Zod, Comlink, Vite, Supabase, Stripe rows remain authoritative.
> - **§3 Repository structure** "9 packages + 4 apps" → superseded by `06` §3.3: **~12 packages + ~7 apps + ~30–35 plugins**. The expansion adds `ai-host` (L7.5), `cde`, `headless`, plus `component-editor`, `ai-worker`, `ifc-worker` apps.
> - **§12 Sprint plan (20 sprints)** → **superseded entirely** by `10-MASTER-IMPLEMENTATION-PLAN-36M.md` and the four PHASE-1 sub-docs. Read this section for *which work happens*, not for *when*.
> - **§14 Migration of PRYZM's 264 legacy commands** — count is now ~110 *new* handlers (per `06` §3.1 L2 row); use this section's *recipe*, not its raw count.
> - The 7-layer references throughout → use the 8-layer model in `08-VISION.md` §4 (L7.5 added between L7 and L6).

---

## Table of contents

1. Strategy in one page
2. Reference stack
3. Repository structure
4. Layer interfaces (TypeScript contracts)
5. Wire format & on-disk format
6. Database schema
7. Server services
8. Plugin SDK contract
9. Permissions & security model
10. CI/CD & quality gates
11. Telemetry & observability
12. Sprint plan (20 × 2-week sprints)
13. Wall primitive — canonical end-to-end walkthrough
14. Migration of PRYZM's 264 legacy commands
15. Definition of Done per layer
16. Risk register & mitigations
17. Decisions to make before Sprint 1 (ADRs)
18. Appendices (file-by-file checklist)

---

## 1. Strategy in one page

**Adoption strategy**: **Strategy B** from `03-PASCAL-EDITOR-ANALYSIS.md` — adopt Pascal's patterns and rules without forking the runtime. Reasons:

- Keeps PRYZM's Vite + Express + Supabase + Stripe stack intact (no Next.js shell migration).
- Preserves PRYZM's IFC pipeline, plan/section views, sheet exporter, multi-tenant access control, billing — features Pascal does not have.
- Lets PRYZM start with event-sourcing on day one (Pascal does not support it; retrofitting Pascal is more expensive than building fresh).
- Pascal's `.cursor/rules/` and exact directory layout are copied verbatim as the architectural blueprint.

**What we build**: a pnpm workspace monorepo with 9 internal packages, 4 deployable apps, and a published plugin SDK. Strangler-fig migration over 40 calendar weeks (20 sprints) keeping the legacy app shippable throughout.

**What we ship at each gate**:
- **Sprint 8 (week 16)** — internal alpha (single user, new architecture, walls + slabs working).
- **Sprint 14 (week 28)** — external beta (multi-user, IFC import, sheets, all primitives).
- **Sprint 20 (week 40)** — production GA (plugin SDK 1.0, full Forma-class lead-ons, legacy code deleted).

---

## 2. Reference stack

| Layer | Technology | Version | Why |
|---|---|---|---|
| Language | TypeScript strict | 5.9+ | Type safety end-to-end (browser + Node). |
| Runtime — server | Node | 22 LTS | Native ESM, `worker_threads`, `fetch`, `node:test`. |
| Runtime — browser | Modern evergreen | — | Chrome, Edge, Safari 17+, Firefox 120+. |
| Bundler / dev | Vite | 7.x (existing) | Fast HMR, ESM-first. |
| 3D library | Three.js | r163+ (existing) | Industry standard. Pascal pins r0.184 — we pick the latest LTS tag at sprint 0. |
| 3D React binding | @react-three/fiber + @react-three/drei | r9 / r10 | Composable scene graph; matches Pascal patterns. |
| Render mode | WebGPU primary, WebGL2 fallback | — | Pascal-proven path. |
| State — client | Zustand + Zundo | z5 / z2 | Pascal-proven. Zundo replaced by event-log replay in PRYZM. |
| Schema validation | Zod | 4.x | Pascal-proven; Zod schemas are the source of truth for nodes and events. |
| Boolean geometry | three-bvh-csg | 0.0.18+ | Pascal-proven; replaces existing csg-js. |
| Spatial | three-mesh-bvh | 0.9+ | Fast raycast, BVH refit. |
| Wire encoding | msgpackr | 1.11+ | Compact, fast, schema-flexible binary. |
| CRDT | Yjs + y-protocols | 13.6+ / 1.0+ | Mature awareness protocol; WS provider available. |
| Worker bridge | Comlink | 4.4+ | Type-safe RPC over postMessage. |
| Auth (existing) | Supabase | (existing) | Keep current. |
| DB (existing) | Postgres via Supabase | (existing) | Keep current; add new tables. |
| Object store | S3-compatible (R2 first choice) | — | Egress-free egress (R2) or low-cost (B2) for chunks. |
| Queue | BullMQ on Redis | 5.x / Redis 7 | Bake jobs, IFC-conversion jobs. |
| Lint / format | ESLint + `eslint-plugin-boundaries` + Prettier | 9.x / 4.x / 3.x | Boundary rules enforced at PR. |
| Test — unit | Vitest | 2.x | Fast, browser+Node compatible. |
| Test — visual | Playwright + pixelmatch | 1.x | Visual diff for renderer regressions. |
| Test — perf | `tools/load-bench` (Playwright + custom harness) | — | Cold-load timing in CI. |
| Telemetry | OpenTelemetry SDK browser + Node | 1.x | Spans across all layers. |
| Telemetry backend | Honeycomb (or self-hosted Tempo + Grafana) | — | Trace search across users. |
| Workspace | pnpm workspaces + Turborepo | pnpm 9 / turbo 2 | Deterministic install + cached builds. |

Locked at **Sprint 0 freeze**. Any change requires an ADR.

---

## 3. Repository structure

```
pryzm/
├─ packages/
│  ├─ protocol/                 # Shared types: events, commands, manifest, chunk schema
│  ├─ domain/                   # L1 stores (browser + Node), event reducer, selectors
│  ├─ geometry-kernel/          # L4 pure producers, Material/Geometry IR types
│  ├─ render-runtime/           # L5 frame scheduler, scene committer, passes, R3F shell
│  ├─ sync/                     # L3 Yjs glue, awareness, transport-agnostic
│  ├─ persistence-client/       # L0 client SDK (manifest, chunk fetch, event stream)
│  ├─ plugin-host/              # L6 manifest loader, lifecycle, dev/prod hosts
│  ├─ ui/                       # L7 shared React primitives (panels, inspectors, toolbars)
│  └─ test-utils/               # Fixtures, golden projects, perf harness shared utils
├─ apps/
│  ├─ editor/                   # L7 main editor SPA (Vite + React + R3F)
│  ├─ viewer/                   # L7 read-only viewer SPA (Vite + React + R3F, smaller)
│  ├─ sync-server/              # L3 server: Express + Socket.io + Yjs WS provider + auth
│  └─ bake-worker/              # L0 server: Node service consuming bake queue
├─ plugins/                     # First-party plugins, each its own workspace package
│  ├─ wall/  slab/  roof/  curtain-wall/  level/  grid/  zone/
│  ├─ ifc-import/               # OBC + web-ifc, isolated to this package
│  ├─ ifc-export/
│  ├─ pdf-export/  ifc-export/
│  ├─ ai-copilot/               # Existing src/ai/* refactored as a plugin
│  └─ analysis-daylight/        # v2 lead-on
├─ tools/
│  ├─ load-bench/               # CI perf gate harness
│  ├─ visual-diff/              # CI visual regression
│  ├─ fixture-projects/         # 10/1k/10k/50k/200k element fixtures
│  └─ scripts/                  # migration scripts, ADR template, etc.
├─ docs/
│  └─ 00_NEW_ARCHITECTURE/      # this folder
├─ .cursor/rules/               # Architectural rules (lifted from Pascal + PRYZM additions)
├─ .github/workflows/           # CI pipelines
├─ pnpm-workspace.yaml
├─ turbo.json
├─ tsconfig.base.json
├─ .eslintrc.cjs
└─ package.json
```

### Why this layout

- **Packages** are libraries; **apps** are deployable units; **plugins** are also packages but follow the plugin manifest contract.
- Every package has its own `package.json`, `tsconfig.json`, `README.md`, `vitest.config.ts`, and an `eslint-plugin-boundaries` config declaring which other packages it may import.
- Apps cannot be imported by anyone — they're terminal.
- Plugins import from packages but not from each other (enforced by lint).

### Per-package import rules (enforced)

```
protocol     → (none)
domain       → protocol
geometry-kernel → protocol
sync         → protocol, domain
persistence-client → protocol
render-runtime → protocol, domain, geometry-kernel
plugin-host  → protocol, domain
ui           → (none — pure UI primitives)
test-utils   → protocol, domain
plugins/*    → protocol, domain, geometry-kernel, render-runtime, plugin-host, ui
apps/editor  → all packages, plugins/*
apps/viewer  → protocol, domain, render-runtime, persistence-client, ui, plugins/wall, plugins/slab, ...
apps/sync-server → protocol, domain (Node-only build)
apps/bake-worker → protocol, domain, geometry-kernel (Node-only build)
```

Violations break CI via `eslint-plugin-boundaries`.

---

## 4. Layer interfaces (TypeScript contracts)

These are the contracts between layers. Every package must implement them; apps wire them together.

### 4.1 L0 — `packages/persistence-client`

```ts
// Types
export type ProjectId = `prj_${string}`
export type ChunkHash = `sha256-${string}`
export type EventSegmentId = `seg_${string}`

export interface ProjectManifest {
  version: 1
  projectId: ProjectId
  schemaVersion: number          // bumped when chunk format changes
  createdAt: string              // ISO
  updatedAt: string
  bakedAt: string | null         // null until first bake
  events: EventSegmentRef[]
  chunks: ChunkRef[]
  thumbnails: { cover: string; perLevel: Record<string, string> }
}

export interface EventSegmentRef {
  id: EventSegmentId
  fromEventId: string            // ULID inclusive
  toEventId: string              // ULID inclusive
  byteSize: number
  url: string                    // CDN URL
  hash: ChunkHash
}

export interface ChunkRef {
  hash: ChunkHash
  kind: 'level-geo' | 'level-tex' | 'library-geo' | 'library-tex' | 'metadata'
  scope: { levelId?: string; libraryId?: string }
  byteSize: number
  url: string
  bbox: [number, number, number, number, number, number]   // for frustum streaming
}

// Client SDK
export class PersistenceClient {
  constructor(opts: { baseUrl: string; auth: AuthProvider; transport?: Transport }) {}

  fetchManifest(projectId: ProjectId): Promise<ProjectManifest>
  streamEvents(projectId: ProjectId, fromEventId?: string): AsyncIterable<DomainEvent>
  fetchChunk(ref: ChunkRef): Promise<ArrayBuffer>          // CDN-cached, hash-verified
  appendEvents(projectId: ProjectId, events: DomainEvent[]): Promise<{ accepted: string[] }>
  enqueueBake(projectId: ProjectId, scope: { levelIds: string[] }): Promise<{ jobId: string }>
}
```

### 4.2 L1 — `packages/domain`

```ts
// Store contract — one per entity type
export interface DomainStore<TDto, TId extends string = string> {
  readonly name: string                        // 'wall' | 'slab' | ...
  readonly schema: ZodSchema<TDto>
  readonly idPrefix: string                    // 'wall'

  reduce(state: ReadonlyMap<TId, TDto>, event: DomainEvent): ReadonlyMap<TId, TDto>
  selectors(state: ReadonlyMap<TId, TDto>): {
    all: () => ReadonlyArray<TDto>
    byId: (id: TId) => TDto | undefined
    byParent: (parentId: string) => ReadonlyArray<TDto>
    byBbox: (bbox: AABB) => ReadonlyArray<TDto>
  }
}

// Aggregate scene state (mirrors Pascal's useScene shape)
export interface SceneState {
  nodes: ReadonlyMap<string, AnyNode>
  rootNodeIds: ReadonlyArray<string>
  dirtyNodes: ReadonlySet<string>             // set by reducer when geometry must rebuild
}

// Reducer composition — pure function
export function reduceScene(state: SceneState, event: DomainEvent): SceneState
```

### 4.3 L2 — Commands & events (shared in `packages/protocol`)

```ts
export type ULID = string & { __brand: 'ULID' }
export type ActorId = string

export interface CommandBase<K extends string, P> {
  command: K
  payload: P
  parentId?: ULID                              // for causal ordering
  meta?: { client?: string; version?: number }
}

export interface DomainEvent<K extends string = string, P = unknown> {
  id: ULID                                     // monotonic, includes timestamp
  command: K                                   // what command produced this
  actor: ActorId
  payload: P
  parentId: ULID | null
  affectedRegions: AffectedRegion[]            // for bake invalidation
  meta: { client: string; version: number }
}

export interface AffectedRegion {
  scope: 'level' | 'library' | 'project'
  scopeId: string
  bbox?: AABB                                  // optional spatial bound
}

// Handler registration
export interface CommandHandler<K extends string, P> {
  command: K
  payloadSchema: ZodSchema<P>
  validate(cmd: CommandBase<K, P>, ctx: HandlerContext): ValidationResult
  produce(cmd: CommandBase<K, P>, ctx: HandlerContext): DomainEvent[]
}

export interface HandlerContext {
  scene: SceneState
  actor: ActorId
  now: () => number
  newId<T extends string>(prefix: T): `${T}_${string}`
}

// Transaction = atomic batch of events
export interface Transaction {
  id: ULID
  events: DomainEvent[]
  rollbackOf?: ULID                            // for undo
}
```

### 4.4 L3 — `packages/sync`

```ts
export interface SyncEngine {
  connect(projectId: ProjectId, auth: AuthProvider): Promise<void>
  disconnect(): void

  // Local edits
  appendLocal(events: DomainEvent[]): void

  // Remote stream
  onRemote(fn: (events: DomainEvent[]) => void): () => void

  // Awareness
  setLocalState(state: AwarenessState): void
  onAwareness(fn: (peers: Map<ActorId, AwarenessState>) => void): () => void
}

export interface AwarenessState {
  cursor?: [number, number, number]
  selection?: string[]
  cameraPose?: { position: [number,number,number]; target: [number,number,number] }
  editing?: { nodeId: string; lockedUntil: number }    // soft lock
}
```

### 4.5 L4 — `packages/geometry-kernel`

```ts
// Pure geometry IR — no THREE dependency
export interface MaterialDescriptor {
  id: string
  type: 'physical' | 'basic' | 'line' | 'unlit'
  color?: [number, number, number]
  roughness?: number
  metalness?: number
  textures?: { albedo?: TextureRef; normal?: TextureRef; roughness?: TextureRef; ao?: TextureRef }
}

export interface TextureRef {
  hash: ChunkHash                              // content-addressed
  channels: 'rgb' | 'rgba' | 'r'
  encoding: 'srgb' | 'linear' | 'data'
}

export interface MeshDescriptor {
  positions: Float32Array
  normals: Float32Array
  uvs?: Float32Array
  indices: Uint32Array
  materialId: string
}

export interface GeometryIR {
  meshes: MeshDescriptor[]
  edges?: EdgeDescriptor[]
  bounds: AABB
  metadata: { sourceId: string; version: number; materialIds: string[] }
}

// Producer contract — pure function
export interface GeometryProducer<TDto, TCtx = ProducerContext> {
  readonly kind: string                        // 'wall'
  readonly inputSchema: ZodSchema<TDto>
  produce(dto: TDto, ctx: TCtx): GeometryIR
}

export interface ProducerContext {
  // Read-only access to neighbouring nodes (for joins, holes, etc.)
  getNeighbour(id: string): AnyNode | undefined
  getMaterials(): ReadonlyMap<string, MaterialDescriptor>
  // No THREE, no scene, no globals.
}
```

### 4.6 L5 — `packages/render-runtime`

```ts
// Single-owner frame scheduler
export class FrameScheduler {
  requestFrame(reason: DirtyReason): void
  registerListener(name: string, fn: TickFn, phase: Phase): () => void
}
export type Phase = 'input' | 'simulate' | 'commit' | 'render' | 'post' | 'idle'

// Scene committer — only place scene.add/remove may happen
export interface SceneCommitter {
  commit(diff: SceneDiff): Promise<void>       // diff = added/updated/removed node ids
}

export interface SceneDiff {
  added: string[]
  updated: string[]
  removed: string[]
}

// Render pass plugin (pluggable post-processing)
export interface RenderPass {
  id: string
  dependsOn: string[]
  dirtyTriggers: ('camera' | 'geometry' | 'material' | 'selection')[]
  cost: 'cheap' | 'medium' | 'expensive'
  setup(ctx: RenderContext): void
  execute(ctx: RenderContext): void
}
```

### 4.7 L6 — `packages/plugin-host`

```ts
export interface PluginManifest {
  id: string                                   // '@pryzm/wall'
  version: string                              // semver
  apiVersion: '1.0'
  permissions: PluginPermission[]              // 'commands.dispatch', 'storage.read', 'network.fetch'
  contributes: {
    commands?: CommandHandler<string, any>[]
    producers?: GeometryProducer<any>[]
    passes?: RenderPass[]
    tools?: ToolDescriptor[]
    importers?: ImporterDescriptor[]
    exporters?: ExporterDescriptor[]
    panels?: PanelDescriptor[]
  }
  dependsOn?: string[]
}

export class PluginHost {
  load(manifest: PluginManifest): Promise<void>
  unload(id: string): Promise<void>
  list(): PluginManifest[]
  // Hot reload in dev
  setDevMode(on: boolean): void
}
```

### 4.8 L7 — `apps/editor`

The editor is **not in a package** — it composes packages. Responsibilities:

- Mount React app (Vite + React 19).
- Compose `<Viewer>` + injected editor systems + tool manager.
- Provide auth bootstrap (Supabase session).
- Provide telemetry init.
- Provide error boundary + crash reporter.
- Bind URL routes (`/projects/:id`, `/projects/:id/viewer`, etc.).

---

## 5. Wire format & on-disk format

### 5.1 Event encoding (MessagePack)

```
Event = msgpack({
  id:               string (ULID, 26 chars)
  command:          string
  actor:            string
  payload:          object
  parentId:         string | null
  affectedRegions:  array of { scope, scopeId, bbox? }
  meta:             { client, version }
})
```

Average wall-edit event ≈ 180 bytes encoded (vs ~600 bytes JSON).

### 5.2 Event segments on disk

- Append-only `.evt.bin` files in object storage.
- Default segment size 4 MiB; new segment on rollover.
- Each segment is `[length-prefixed event] × N`. No segment-level compression (each event is small; CDN handles gzip).
- Segment manifest entry: `{ id, fromId, toId, byteSize, url, hash }`.

### 5.3 Geometry chunks (glTF + Draco + Meshopt + KTX2)

- One chunk per `(level, version)` baked by `apps/bake-worker`.
- Format: `.glb` with Draco-compressed positions/normals/indices, Meshopt vertex order, KTX2 textures.
- Naming: `chunks/<projectId>/<levelId>/<hash>.glb`.
- Hash is content-addressed (SHA-256 of the canonical-serialized IR fed to the baker).
- Old chunk hashes stay live until garbage-collected (allows version rollback).

### 5.4 Project manifest

`manifest.json` lives at `manifests/<projectId>/current.json`. Server-bake updates atomically (write to `current-<ts>.json`, `mv` to `current.json`).

---

## 6. Database schema (additive on existing Supabase Postgres)

Existing PRYZM tables (`projects`, `project_members`, `auth.users`, Stripe-related) stay. Add:

```sql
-- Event log (server-canonical view; clients also keep IndexedDB copies)
CREATE TABLE pryzm_events (
  id          TEXT PRIMARY KEY,            -- ULID
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor       UUID NOT NULL REFERENCES auth.users(id),
  command     TEXT NOT NULL,
  payload     JSONB NOT NULL,
  parent_id   TEXT,
  meta        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  segment_id  TEXT NOT NULL                -- which on-disk segment owns this event
);
CREATE INDEX ix_pryzm_events_project_time ON pryzm_events (project_id, created_at);
CREATE INDEX ix_pryzm_events_segment ON pryzm_events (segment_id);

-- Event segments (metadata; bytes live in object storage)
CREATE TABLE pryzm_event_segments (
  id          TEXT PRIMARY KEY,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_id     TEXT NOT NULL,
  to_id       TEXT NOT NULL,
  byte_size   BIGINT NOT NULL,
  url         TEXT NOT NULL,
  hash        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chunk index
CREATE TABLE pryzm_chunks (
  hash        TEXT PRIMARY KEY,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  scope       JSONB NOT NULL,
  byte_size   BIGINT NOT NULL,
  url         TEXT NOT NULL,
  bbox        DOUBLE PRECISION[] NOT NULL,
  baked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded  BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX ix_pryzm_chunks_project ON pryzm_chunks (project_id, kind);

-- Bake jobs queue (in BullMQ for processing; mirrored here for audit)
CREATE TABLE pryzm_bake_jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope       JSONB NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('queued','running','done','failed')),
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error       TEXT
);

-- Comments / issues (anchored to nodes)
CREATE TABLE pryzm_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author      UUID NOT NULL REFERENCES auth.users(id),
  parent_id   UUID REFERENCES pryzm_comments(id) ON DELETE CASCADE,
  anchor      JSONB NOT NULL,                -- { nodeId, position, viewport }
  body_md     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'resolved'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_pryzm_comments_project ON pryzm_comments (project_id, status);

-- Awareness presence (ephemeral; backed by Redis in production)
-- (No Postgres table; Redis hash keyed by project_id with TTL=30s)

-- Plugin installations
CREATE TABLE pryzm_plugins (
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  plugin_id   TEXT NOT NULL,
  version     TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  config      JSONB,
  installed_by UUID REFERENCES auth.users(id),
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, plugin_id)
);

-- Per-element permissions (project-level remains in projects/project_members)
CREATE TABLE pryzm_element_permissions (
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  node_id     TEXT NOT NULL,
  role        TEXT NOT NULL,
  permissions JSONB NOT NULL,                -- { read, write, comment, delete }
  PRIMARY KEY (project_id, node_id, role)
);
```

### 6.1 RLS policies

Extend existing `supabase-rls.sql` with policies on every new table:
- `pryzm_events`: SELECT allowed if member of project; INSERT only via sync-server (service role).
- `pryzm_chunks`, `pryzm_event_segments`: SELECT allowed if member.
- `pryzm_comments`: SELECT/INSERT/UPDATE per project membership; DELETE only by author or project owner.
- `pryzm_plugins`: only project admins may install.

### 6.2 Migration plan

- Sprint 2 lands the schema as a single migration `migrations/2026XX_pryzm2_init.sql`.
- New tables coexist with old; no destructive changes until Sprint 19.
- Sprint 19 drops old `project_state` blob column from `projects` once all projects migrated.

---

## 7. Server services

### 7.1 `apps/sync-server`

**Purpose**: WebSocket relay for real-time collab + event log writer + bake job enqueuer.

```
Express + Socket.io (existing)
  + Yjs WebSocket Provider
  + Auth middleware (Supabase JWT)
  + Event linearisation pipeline:
      WS message → validate JWT → validate event schema → assign canonical ULID
      → INSERT pryzm_events → broadcast → enqueue bake (if affected regions)
```

**Endpoints (HTTP)**:
- `POST /v2/projects/:id/events` — append events (idempotent via client-side ULID dedup).
- `GET /v2/projects/:id/manifest` — current manifest.
- `GET /v2/projects/:id/events?from=<ULID>&limit=N` — historical events (also exposed via WS subscribe).
- `POST /v2/projects/:id/bake` — manual bake trigger (admin/debug).

**Endpoints (WebSocket)**:
- `/v2/projects/:id/ws` — Yjs sync messages + custom `event-batch`, `awareness`, `presence` messages.

**Scaling**: stateless behind a load balancer; sticky sessions per project ID for WS coherence.

### 7.2 `apps/bake-worker`

**Purpose**: Consume bake jobs, run geometry kernel headlessly, write chunks to object storage, update manifest.

```
Node 22 + BullMQ worker
Imports: @pryzm/protocol, @pryzm/domain, @pryzm/geometry-kernel
For each job:
  1. Read recent events for project
  2. Reduce to scene state (or load cached state)
  3. For each affected region: re-produce geometry via kernel
  4. Bake to .glb (Draco + Meshopt + KTX2 via gltf-transform)
  5. Compute hash, upload to object storage
  6. UPDATE pryzm_chunks (mark old as superseded), regenerate manifest
  7. Notify sync-server via Redis pub/sub
```

**Scaling**: horizontal worker pool; each worker handles N concurrent jobs based on CPU.

### 7.3 Existing `server.js` (Express)

**Keep** for:
- Auth (Supabase wrappers).
- Stripe (billing, webhooks).
- Project CRUD (list, create, archive, members).
- IFC pre-processing (existing storage service).
- DXF/DWG conversion (existing).

**Migrate out**:
- Old project state save/load → replaced by sync-server + persistence-client.
- Anything calling `ProjectSerializer` → deleted in Sprint 19.

### 7.4 Object storage

- Bucket: `pryzm-chunks-prod` (R2).
- Path convention: `<projectId>/chunks/<hash>` (no level/library subfolders — hash collision unlikely; flat is faster).
- CDN: Cloudflare in front of R2 with `Cache-Control: public, max-age=31536000, immutable` since hashes are content-addressed.
- Lifecycle: superseded chunks GC'd nightly after 90-day grace period.

### 7.5 Queue

- Redis 7 (managed: Upstash for prod, Docker for dev).
- BullMQ queues:
  - `bake-geometry`: per-project debounce 500 ms (collapse rapid edits).
  - `ifc-import`: long-running, per-project serialised.
  - `pdf-export`: per-user concurrency 1.

---

## 8. Plugin SDK contract

### 8.1 Manifest

A plugin is a published npm package whose `package.json` includes:

```json
{
  "name": "@pryzm/wall",
  "version": "1.0.0",
  "pryzm": {
    "manifestPath": "./dist/pryzm-manifest.js",
    "apiVersion": "1.0",
    "permissions": ["commands.dispatch", "scene.read", "scene.commit"]
  }
}
```

The `manifestPath` exports a default `PluginManifest` object.

### 8.2 Lifecycle

```
load(manifest):
  1. Verify signature (production) / trust (dev).
  2. Check apiVersion compat.
  3. Resolve dependsOn (load missing).
  4. Register all contributions atomically.
  5. Call onActivate(ctx) hook.

unload(id):
  1. Call onDeactivate(ctx) hook.
  2. Remove all contributions.
  3. Refuse if other plugins depend on it.
```

### 8.3 Permission model

| Permission | What it allows |
|---|---|
| `commands.dispatch` | Send commands to the bus. Required by all interactive plugins. |
| `commands.register` | Register new command handlers. Required by tool plugins. |
| `scene.read` | Read store selectors. |
| `scene.commit` | Contribute to scene committer (renderers / passes). |
| `network.fetch` | Make outbound fetches (limited to declared origins). |
| `storage.user` | Read/write per-user plugin storage. |
| `storage.project` | Read/write per-project plugin storage. |

Permissions are declared in `package.json#pryzm.permissions` and granted at install time. Production runtime denies undeclared permissions.

### 8.4 Sandboxing (production)

- First-party plugins run in-process (trusted).
- Third-party plugins run in a cross-origin iframe with postMessage RPC, scoped to declared permissions.
- Plugin manifest is pre-validated server-side at install; invalid manifests are rejected.

### 8.5 Dev experience

- `pnpm pryzm-plugin dev <pkg>` boots editor with the plugin hot-reloaded via Vite's module replacement.
- `pnpm pryzm-plugin pack <pkg>` builds, bundles, and signs a production plugin.

---

## 9. Permissions & security model

### 9.1 Layers

1. **Tenant isolation** (existing `projectAccess.js` patterns) — user can access only projects in their org.
2. **Project role** — owner | editor | viewer | commenter (matches existing `project_members` patterns).
3. **Element-level overrides** — per-`pryzm_element_permissions` row, can lock specific nodes.
4. **Plugin permissions** — per-plugin grants.

### 9.2 Enforcement points

| Layer | Where enforced |
|---|---|
| Tenant | Supabase RLS + sync-server JWT validation |
| Project role | sync-server (rejects events from unauthorized actors) + RLS on read endpoints |
| Element | Command handler `validate()` step in sync-server |
| Plugin | Plugin host runtime (browser) + manifest validation (server) |

### 9.3 Audit

- Every event in `pryzm_events` carries actor + timestamp; serves as audit trail.
- Comments table similarly tracked.
- Plugin install/uninstall logged in separate `pryzm_audit_log` table (write-only, append-only).

### 9.4 Threat model

- See `docs/X_Security/` for existing threat model; extend with:
  - **Plugin-injected events**: mitigated by command handler validation.
  - **Replay attacks on event append**: mitigated by ULID monotonicity + JWT freshness.
  - **Sync server DoS**: mitigated by per-project rate limit (1000 events/min/user).
  - **Manifest tampering**: mitigated by manifest stored in DB, not derived from CDN.

---

## 10. CI/CD & quality gates

### 10.1 Pipeline (GitHub Actions)

```
On every PR:
  ├─ install        (pnpm i --frozen-lockfile)
  ├─ typecheck      (turbo run check-types)
  ├─ lint           (eslint + boundaries)
  ├─ test:unit      (vitest)
  ├─ test:visual    (playwright + pixelmatch on golden fixtures)
  ├─ test:perf      (load-bench: small + medium fixture)
  └─ build          (turbo run build, all packages + apps)

On merge to main:
  ├─ release-please (semver tagging per package)
  ├─ publish-to-npm (packages with version bump)
  ├─ deploy-staging (apps to staging environment)
  └─ run smoke suite
```

### 10.2 Hard gates

PR blocked if any of:

- Any TypeScript error.
- Any ESLint error (boundaries violations are errors).
- Any unit test failure.
- Visual diff > 1 px MSE on golden fixtures (with explicit override label).
- Cold-load regression > 5% on either fixture.
- Bundle size regression > 5% on `apps/viewer` or `apps/editor`.
- New `requestAnimationFrame` outside `packages/render-runtime`.
- New `(window as any)` cast.
- New `import * from 'three'` in `packages/domain`, `packages/protocol`, or `packages/geometry-kernel`.

### 10.3 Lint rules to add

```js
// .eslintrc.cjs additions
'no-restricted-globals': ['error', {
  name: 'requestAnimationFrame',
  message: 'Use FrameScheduler.requestFrame from @pryzm/render-runtime',
}],
'no-restricted-syntax': ['error', {
  selector: "TSAsExpression[typeAnnotation.typeName.name='any'][expression.name='window']",
  message: 'Cross-module wiring through window is banned. Use the typed registry.',
}],
'boundaries/element-types': [...],   // per packages/* config
```

### 10.4 `tools/load-bench`

```ts
// What it does:
// 1. Spawn headless Chromium via Playwright
// 2. Open a fixture project from tools/fixture-projects/
// 3. Capture timestamps for: nav, manifest fetch, first event applied, first paint, first interactive
// 4. Compare against golden numbers in tools/load-bench/baseline.json
// 5. Fail if regression > threshold

// Fixtures:
// - small.pryzm:  ~50 elements   target: full < 800ms
// - medium.pryzm: ~5,000 elements target: skeleton < 700ms, full < 2500ms
// - large.pryzm:  ~50,000 elements target: skeleton < 1000ms, full < 5000ms
// - xlarge.pryzm: ~200,000 elements target: skeleton < 1500ms, full < 12s
```

---

## 11. Telemetry & observability

### 11.1 Span taxonomy

| Span name | Phase | Attributes |
|---|---|---|
| `nav.load` | App boot | `route`, `auth.userId` |
| `manifest.fetch` | L0 | `projectId`, `byteSize`, `cacheHit` |
| `events.replay` | L1 | `projectId`, `eventCount` |
| `chunk.fetch` | L0 | `chunkHash`, `byteSize`, `cacheHit` |
| `chunk.commit` | L5 | `levelId`, `meshCount` |
| `worker.geometry` | L4 | `kind`, `nodeId`, `version` |
| `command.dispatch` | L2 | `command`, `actor` |
| `command.validate` | L2 | `command`, `result` |
| `event.append.local` | L1 | `eventId`, `command` |
| `event.append.remote` | L3 | `eventId`, `actor` |
| `frame.commit` | L5 | `dirtyCount` |
| `frame.render` | L5 | `passCount`, `cost` |
| `idle.accumulate` | L5 | `samples` |
| `bake.job` | bake-worker | `projectId`, `levelIds`, `chunkCount` |
| `sync.message` | sync-server | `direction`, `byteSize` |

### 11.2 Backends

- **Dev**: console exporter + local Tempo + Grafana (docker-compose included).
- **Prod**: Honeycomb (or self-hosted Tempo + Grafana for self-host).

### 11.3 Customer-facing observability

- "Project performance" panel inside editor (admin only): shows last 10 cold loads, last 100 commands, slowest 20 frames.
- Per-customer Honeycomb saved query for "slow events" (> 200 ms commit).

### 11.4 Error handling

- Uncaught exceptions → Sentry.
- Plugin errors → caught at the host boundary, surfaced in a "Plugin failed" UI, never crash editor.
- Worker errors → restart worker, retry once, then surface error.

---

## 12. Sprint plan (20 × 2-week sprints)

Sprint cadence: **2 weeks**. Total **40 calendar weeks**. Two seniors (S1, S2) + lead (L). Lead writes code ~30%.

Each sprint has: **Goal**, **Deliverables**, **Owners**, **Exit criteria**, **Demo**.

### Sprint 0 — Sprint -1 prep (week -2..0)

Pre-sprint: lock stack (§2), write ADRs §17, freeze repo schema, set up CI shell.

### Sprint 1 (weeks 1–2) — Monorepo foundation
- **Goal**: Empty monorepo with all packages scaffolded, CI green.
- **Deliverables**: pnpm workspace, turbo.json, all `packages/*` and `apps/*` directories with empty index files; ESLint boundaries config; Vitest harness; Playwright harness; Honeycomb dev exporter; GitHub Actions pipeline running.
- **Owner**: L
- **Exit**: `pnpm i && pnpm test && pnpm build` succeeds with zero warnings; CI runs in < 5 min.
- **Demo**: PR opens against this scaffold; CI shows all gates green.

### Sprint 2 (weeks 3–4) — Database & telemetry baseline
- **Goal**: New schema migrated; OpenTelemetry plumbed; load-bench baseline numbers captured.
- **Deliverables**: SQL migration applied to staging Supabase; OTel SDK initialised in `apps/editor` with all spans (§11.1) registered (most will be no-op until later); `tools/load-bench` runs against current legacy PRYZM in CI nightly; baseline numbers in `tools/load-bench/baseline.json`.
- **Owner**: S2
- **Exit**: nightly CI shows current PRYZM cold-load numbers; OTel UI shows traces.
- **Demo**: open Honeycomb / Tempo, point at last night's cold-load trace.

### Sprint 3 (weeks 5–6) — `packages/protocol` + `packages/domain` skeleton
- **Goal**: Event types, ULID helpers, msgpack codecs, base store contract, scene reducer for 3 node types (level, wall, slab).
- **Deliverables**: All types from §4.1–§4.3; `reduceScene()` pure function; property tests via fast-check; 95% coverage on reducer.
- **Owner**: S1
- **Exit**: 1000-event random sequence reduces deterministically; round-trip msgpack ↔ event identical.
- **Demo**: CLI tool that consumes a `.evt.bin` file and prints the resulting `SceneState`.

### Sprint 4 (weeks 7–8) — `packages/geometry-kernel` (walls)
- **Goal**: Pure `produceWallGeometry(dto, ctx)` — no THREE, no scene; runs in Node and browser.
- **Deliverables**: `MaterialDescriptor`, `GeometryIR`, `MeshDescriptor` types; `produceWallGeometry` ported from `WallFragmentBuilder.ts` keeping miter / opening / curve math; vitest suite running in Node; visual regression suite running with golden meshes (compared via positions/indices hash).
- **Owner**: S1
- **Exit**: 50 wall fixtures produce byte-identical IR in browser and Node; vs legacy `WallFragmentBuilder` mesh, MSE < 0.01 mm² per vertex.
- **Demo**: Node script loads fixture, produces IR, dumps glb; renders identical in legacy viewer.

### Sprint 5 (weeks 9–10) — Persistence v1 (client-only chunks)
- **Goal**: Project save/load via the new chunk format, no server bake yet (client bakes its own chunks at save time).
- **Deliverables**: `packages/persistence-client` with manifest GET/POST; `packages/protocol` chunk schema; client-side baker stub in `apps/editor` that writes glbs to R2; load path: manifest → events → reduce → display.
- **Owner**: S2
- **Exit**: a small fixture saves to R2 and reloads correctly; manifest atomic update verified.
- **Demo**: open project A, edit, save, force reload, see the edit persisted.

### Sprint 6 (weeks 11–12) — `packages/render-runtime` + Scene Committer
- **Goal**: Single frame scheduler + scene committer + R3F `<Viewer>` shell.
- **Deliverables**: `FrameScheduler` (single rAF owner); R3F Canvas in `frameloop="demand"` mode; `SceneCommitter` that subscribes to scene store and applies diffs; `scene-registry` ported verbatim from Pascal; `<Viewer>` component accepting children.
- **Owner**: S1
- **Exit**: render demonstrably idles (CPU < 1%) when scene unchanged for 5 s; lint catches any new rAF outside the scheduler.
- **Demo**: open empty project, Chrome perf shows zero frames; click a tool, frames resume; tool releases, frames stop.

### Sprint 7 (weeks 13–14) — Worker pool + wall integration
- **Goal**: Walls produced in worker pool, committed to scene by committer, visible in editor.
- **Deliverables**: `packages/render-runtime/workers/geometry.worker.ts` with Comlink; pool size = `hardwareConcurrency - 1`; `WallCommitter` that listens to wall store dirty set, dispatches to worker, swaps THREE meshes on response; behind feature flag `PRYZM_NEW_ARCH=walls`.
- **Owner**: S1
- **Exit**: 1000-wall fixture renders identically under flag; cold-load improvement ≥ 30% vs legacy on medium fixture; worker pool utilisation > 50% during initial bake.
- **Demo**: side-by-side legacy vs new-arch viewer, drag toolbar to add 100 walls; new-arch stays at 60fps, legacy stutters.

### Sprint 8 (weeks 15–16) — **MVP gate**: slabs + doors + windows + tools
- **Goal**: Internal alpha — single user can build a small project end-to-end on the new architecture.
- **Deliverables**: Geometry kernel for slab, door, window; tools for wall, slab, door, window in `apps/editor`; selection manager (Pascal pattern); undo/redo via event log replay; basic snap (grid only); auth + project loading from existing Supabase.
- **Owners**: S1 (kernel), S2 (tools, UI)
- **Exit**: 5 internal users can build and save a residential project < 100 walls without using legacy editor.
- **Demo**: full session — login, create project, draw walls, add doors, save, reload, edit, undo.

### Sprint 9 (weeks 17–18) — Server bake worker
- **Goal**: Geometry baked server-side; client no longer responsible for chunk creation.
- **Deliverables**: `apps/bake-worker` Node service; BullMQ queue; chunk format (Draco + Meshopt + KTX2 via gltf-transform); manifest atomic update; sync-server triggers bake on event append.
- **Owner**: S2
- **Exit**: a single wall edit triggers chunk re-bake in < 2 s; chunk URL appears in updated manifest; client streams new chunk.
- **Demo**: edit a wall, network panel shows manifest refresh + new chunk fetch within 2 s.

### Sprint 10 (weeks 19–20) — Sync server + Yjs awareness (no merge yet)
- **Goal**: Multi-user awareness (cursors, selection halos, live camera). No conflict resolution yet — first writer wins.
- **Deliverables**: `apps/sync-server` Yjs WS provider; `packages/sync` with awareness API; `apps/editor` shows other users' cursors and selection; per-project rate limit; auth via Supabase JWT.
- **Owner**: S2
- **Exit**: 3 simultaneous users see each other's cursors and selection halos within 100 ms.
- **Demo**: 3 browsers in a project, watch coloured cursors move.

### Sprint 11 (weeks 21–22) — Conflict-free merge
- **Goal**: Two users editing different rooms don't conflict; same-element conflicts resolve deterministically.
- **Deliverables**: server-side event linearisation; per-command conflict policy in handlers (LWW for properties, reject-on-delete for refs); client rebase on rejected events; conflict inbox UI for unresolvable cases.
- **Owner**: S1
- **Exit**: scripted stress test: 5 users editing 50 walls in parallel; final scene matches deterministic expected state.
- **Demo**: two users edit different walls simultaneously, both edits visible to both within one frame; one user deletes a wall, other tries to move it, conflict surfaces in inbox.

### Sprint 12 (weeks 23–24) — Roofs, ceilings, curtain walls (geometry kernel parity)
- **Goal**: All major primitives on new architecture.
- **Deliverables**: Pure producers for roof, ceiling, curtain wall (parity tests vs legacy builders); workers handle all primitives.
- **Owners**: S1 (roof), S2 (ceiling, curtain wall)
- **Exit**: 5 customer fixtures render identically in new arch (visual MSE < 1 px).
- **Demo**: largest customer fixture loads in new arch, < 5 s cold load with bake warm.

### Sprint 13 (weeks 25–26) — IFC import as plugin
- **Goal**: OBC + web-ifc isolated to `plugins/ifc-import`; demoted from core.
- **Deliverables**: `plugins/ifc-import` package consuming IFC files and emitting domain events; OBC removed from `ViewController`, `PlanViewManager`, `EdgeProjectorService`, `PlanViewService`; viewer-only build excludes OBC entirely.
- **Owner**: S2
- **Exit**: viewer build < 800 KB gzipped without OBC; IFC import parity vs legacy on test corpus (see existing `IFC-IMPORT-NATIVE-PARITY-IMPLEMENTATION.md`).
- **Demo**: import a real customer IFC, walk the model in the new viewer.

### Sprint 14 (weeks 27–28) — **Beta gate**: plan view, sheets, comments, search
- **Goal**: External beta — feature parity with PRYZM v1 customer base on new architecture.
- **Deliverables**: Plan/section view as multi-canvas pattern (one viewer per view, shared store); sheet exporter ported (existing PDF code → plugin); comments anchored to nodes (DB schema in §6); search across all elements (Postgres FTS over JSONB payloads).
- **Owners**: S1 (plan view), S2 (sheets, comments, search)
- **Exit**: 10 beta customers migrated; 0 critical bugs in last 7 days.
- **Demo**: customer scenario — open project, switch plan/3D, export sheet, leave comment, search "kitchen door".

### Sprint 15 (weeks 29–30) — Element permissions + audit
- **Goal**: Per-element soft locks + queryable audit trail.
- **Deliverables**: `pryzm_element_permissions` table active; per-command authorization in sync-server; audit query API + UI; "who changed this wall?" inspector tab.
- **Owner**: S2
- **Exit**: locked element rejects unauthorised edits; audit query for any node returns full history < 500 ms.
- **Demo**: lock a wall as project owner; collaborator's edit attempt rejected with explanation.

### Sprint 16 (weeks 31–32) — Plugin host (first-party plugins migrated)
- **Goal**: Wall, slab, roof, ceiling, curtain wall, IFC import, AI copilot, PDF export — all loading via `packages/plugin-host`.
- **Deliverables**: `packages/plugin-host` with manifest loader and lifecycle; all listed plugins refactored to expose manifests; editor boots by loading manifests in dependency order.
- **Owner**: S1
- **Exit**: editor boots with zero plugins loaded → empty canvas; load wall plugin → wall tool appears; unload wall plugin → tool gone, no crashes.
- **Demo**: dev panel showing plugin list, toggle each on/off live.

### Sprint 17 (weeks 33–34) — Plugin SDK 1.0 + dev experience
- **Goal**: Public-grade SDK that an external dev can consume.
- **Deliverables**: `@pryzm/plugin-sdk` published to npm; `pnpm pryzm-plugin dev <pkg>` and `pnpm pryzm-plugin pack <pkg>` CLIs; sandbox for third-party plugins (cross-origin iframe + postMessage RPC); SDK docs page; example plugin (`pryzm-plugin-hello-world`).
- **Owner**: S1
- **Exit**: external dev (member of beta program) authors a non-trivial plugin from docs alone in < 1 day.
- **Demo**: live workshop building a custom "label tool" plugin, hot-reloaded into the editor.

### Sprint 18 (weeks 35–36) — Lead-on features (D1–D7)
- **Goal**: Differentiators from `04-PRODUCTION-PARITY.md` §4.
- **Deliverables**:
  - D1 same-second collab: stress-test confirmed at < 100 ms p95 update latency.
  - D2 AI plugin: existing `src/ai/*` ported to `plugins/ai-copilot` consuming events.
  - D3 self-host: `docker-compose.yaml` + helm chart bringing up sync-server + bake-worker + Postgres + Redis + MinIO (S3-compat).
  - D5 customer obs: "project performance" panel.
  - D6 multi-view: 3D + plan + section all open simultaneously, scene-synced.
  - D7 headless: `@pryzm/headless` package — same domain + kernel, runnable in Node script for batch project generation.
- **Owners**: split S1/S2/L
- **Exit**: each lead-on has a runnable demo and a docs page.
- **Demo**: `docker-compose up`, follow README, full PRYZM 2 instance running locally.

### Sprint 19 (weeks 37–38) — Cutover & legacy decommission
- **Goal**: Delete `EngineBootstrap.ts`, `ProjectSerializer.ts`, the 264 commands, all `(window as any)` cross-wiring.
- **Deliverables**: Migration script converts every customer project to new format (run in `apps/bake-worker`); legacy editor (`apps/editor-legacy/`) deleted; lint rules upgraded to fail on banned patterns; replit.md updated.
- **Owner**: L (with both seniors on standby for hotfixes)
- **Exit**: monorepo grep for `EngineBootstrap`, `ProjectSerializer`, `as any`, `requestAnimationFrame` (outside scheduler), `from '@thatopen` (outside ifc-import) returns zero matches.
- **Demo**: PR showing -50,000 LOC, +0 LOC; CI green; staging stable.

### Sprint 20 (weeks 39–40) — **GA gate**: harden, document, launch
- **Goal**: Production GA.
- **Deliverables**: 30-day perf observation summary; full docs site (architecture, plugin SDK, REST/WS API); marketing-grade demo project; launch checklist signed off (security review, load test at 100 concurrent users, runbook published).
- **Owner**: L + product
- **Exit**: §6 of `04-PRODUCTION-PARITY.md` Definition of Production-Ready met on real customer project ≥ 10,000 elements.
- **Demo**: public launch.

---

## 13. Wall primitive — canonical end-to-end walkthrough

This is the worked example. Every other primitive follows the same pattern.

### 13.1 Schema (`packages/domain/src/schema/nodes/wall.ts`)

```ts
import { z } from 'zod'
import { BaseNode, objectId, nodeType, vec2 } from '../base'

export const WallNode = BaseNode.extend({
  id:        objectId('wall'),
  type:      nodeType('wall'),
  parentId:  z.string(),                 // levelId
  start:     vec2(),
  end:       vec2(),
  thickness: z.number().min(0.05).default(0.1),
  height:    z.number().min(0.1).default(2.5),
  materials: z.object({
    front: z.string().optional(),
    back:  z.string().optional(),
    top:   z.string().optional(),
  }).default({}),
  curve:     z.object({ midOffset: z.number() }).optional(),
}).describe('Linear or curved wall between two points on a level')

export type WallNode = z.infer<typeof WallNode>
export type WallNodeId = WallNode['id']
```

### 13.2 Commands & events (`packages/protocol/src/commands/wall.ts`)

```ts
export const WallCreate = command('wall.create', z.object({
  parentId: z.string(),
  start: vec2(), end: vec2(),
  thickness: z.number().optional(),
  height: z.number().optional(),
}))

export const WallUpdate = command('wall.update', z.object({
  id: z.string(),
  patch: WallNode.partial().omit({ id: true, type: true }),
}))

export const WallDelete = command('wall.delete', z.object({ id: z.string() }))

// Each command, when applied, produces one or more events:
export const WallCreated = event('wall.created', WallNode)
export const WallUpdated = event('wall.updated', z.object({ id: z.string(), patch: z.unknown() }))
export const WallDeleted = event('wall.deleted', z.object({ id: z.string() }))
```

### 13.3 Handler (`packages/domain/src/handlers/wall.ts`)

```ts
export const wallCreateHandler: CommandHandler<'wall.create', WallCreatePayload> = {
  command: 'wall.create',
  payloadSchema: WallCreate.payload,
  validate(cmd, ctx) {
    const parent = ctx.scene.nodes.get(cmd.payload.parentId)
    if (!parent || parent.type !== 'level') return reject('Parent must be a level')
    if (distance(cmd.payload.start, cmd.payload.end) < 0.05) return reject('Wall too short')
    return ok()
  },
  produce(cmd, ctx) {
    const wall = WallNode.parse({ ...cmd.payload, id: ctx.newId('wall') })
    return [{
      id: ctx.newEventId(),
      command: 'wall.created',
      actor: ctx.actor,
      payload: wall,
      parentId: cmd.parentId ?? null,
      affectedRegions: [{ scope: 'level', scopeId: cmd.payload.parentId, bbox: bboxOfSegment(wall) }],
      meta: { client: 'editor', version: 1 },
    }]
  },
}
```

### 13.4 Reducer slice (`packages/domain/src/store/wall-store.ts`)

```ts
export const wallStore: DomainStore<WallNode> = {
  name: 'wall',
  schema: WallNode,
  idPrefix: 'wall',
  reduce(state, event) {
    switch (event.command) {
      case 'wall.created': {
        const next = new Map(state)
        next.set(event.payload.id, event.payload)
        return next
      }
      case 'wall.updated': {
        const cur = state.get(event.payload.id)
        if (!cur) return state
        const next = new Map(state)
        next.set(event.payload.id, { ...cur, ...event.payload.patch })
        return next
      }
      case 'wall.deleted': {
        const next = new Map(state)
        next.delete(event.payload.id)
        return next
      }
      default: return state
    }
  },
  selectors(state) { /* ...see §4.2... */ },
}
```

### 13.5 Producer (`packages/geometry-kernel/src/producers/wall.ts`)

```ts
export const wallProducer: GeometryProducer<WallNode> = {
  kind: 'wall',
  inputSchema: WallNode,
  produce(wall, ctx) {
    // PURE FUNCTION. No THREE. No scene. No globals.
    const adjacency = ctx.getAdjacentWalls(wall.id)
    const miter = computeMiterCorners(wall, adjacency)         // pure math (lifted from Pascal)
    const footprint = wall.curve ? curvedFootprint(wall, miter) : straightFootprint(wall, miter)
    const openings = ctx.getChildren(wall.id).filter(n => n.type === 'door' || n.type === 'window')

    const positions = new Float32Array(/* extruded prism vertices, with openings cut */)
    const normals   = new Float32Array(/* ... */)
    const indices   = new Uint32Array(/* ... */)

    return {
      meshes: [{ positions, normals, indices, materialId: wall.materials.front ?? 'default' }],
      bounds: bboxOfPositions(positions),
      metadata: { sourceId: wall.id, version: hashOf(wall, openings, adjacency), materialIds: [...] },
    }
  },
}
```

The math (`computeMiterCorners`, `curvedFootprint`, `straightFootprint`) is **lifted from PRYZM's existing `WallFragmentBuilder.ts` lines 800–1500** — those calculations are already pure; what's not pure (THREE.Group creation, scene mutation) is removed.

### 13.6 Worker host (`packages/render-runtime/src/workers/geometry.worker.ts`)

```ts
import * as Comlink from 'comlink'
import { wallProducer, slabProducer, ... } from '@pryzm/geometry-kernel'

const producers = new Map([
  ['wall', wallProducer],
  ['slab', slabProducer],
  // ...
])

const api = {
  produce(kind: string, dto: unknown, ctx: ProducerContext): GeometryIR {
    const p = producers.get(kind)
    if (!p) throw new Error(`No producer for ${kind}`)
    return p.produce(p.inputSchema.parse(dto), ctx)
  }
}
Comlink.expose(api)
```

### 13.7 Scene committer (`packages/render-runtime/src/committers/wall-committer.ts`)

```ts
export class WallCommitter implements PrimitiveCommitter {
  constructor(
    private readonly pool: WorkerPool,
    private readonly registry: SceneRegistry,
  ) {}

  async commit(diff: SceneDiff, scene: SceneState) {
    for (const id of diff.removed) {
      const obj = this.registry.nodes.get(id)
      if (obj) {
        obj.parent?.remove(obj)
        disposeRecursive(obj)
        this.registry.unregister(id)
      }
    }

    const upserts = [...diff.added, ...diff.updated]
      .map(id => scene.nodes.get(id))
      .filter((n): n is WallNode => n?.type === 'wall')

    await Promise.all(upserts.map(async (wall) => {
      const ir = await this.pool.produce('wall', wall, makeContext(scene))
      let mesh = this.registry.nodes.get(wall.id) as Mesh | undefined
      if (!mesh) {
        mesh = new THREE.Mesh()
        addToScene(mesh)
        this.registry.register(wall.id, 'wall', mesh)
      }
      applyIRtoMesh(mesh, ir)                                  // disposes old buffers
      this.frameScheduler.requestFrame('geometry-update')
    }))
  }
}
```

### 13.8 Tool (`apps/editor/src/components/tools/wall-tool/index.tsx`)

```tsx
export function WallTool() {
  const dispatch = useCommands()
  const levelId = useViewer(s => s.selection.levelId)

  const handlePointerDown = (e: PointerEvent) => {
    setStart(worldPosFromPointer(e))
  }
  const handlePointerUp = (e: PointerEvent) => {
    if (!start || !levelId) return
    const end = worldPosFromPointer(e)
    dispatch.send({
      command: 'wall.create',
      payload: { parentId: levelId, start, end, thickness: 0.1, height: 2.5 },
    })
    setStart(null)
  }

  return <ToolMesh onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}>
    {start && <PreviewWall from={start} to={cursor} />}
  </ToolMesh>
}
```

### 13.9 The full hot path — when a user clicks to place a wall

1. **Pointer up** in `WallTool` → `dispatch.send({ command: 'wall.create', payload })`
2. **Local optimistic apply**: `useCommands` hook validates, runs `wallCreateHandler.produce`, gets event(s), applies via reducer, marks wall ID dirty in `scene.dirtyNodes`.
3. **Scene committer** notices dirty set → calls `WallCommitter.commit()`.
4. **Worker pool** receives `produce('wall', dto, ctx)` → returns IR (Float32Array transferred zero-copy).
5. **Committer** creates/updates THREE.Mesh, registers in scene-registry, calls `frameScheduler.requestFrame()`.
6. **Frame scheduler** runs one frame → render passes execute → user sees the wall.
7. **In parallel**: event queued for sync-server append. Sync-server validates auth + rate limit, writes to `pryzm_events`, broadcasts to other clients, enqueues bake.
8. **Bake worker** picks up job, re-bakes affected level chunk, uploads to R2, updates manifest.
9. **Other clients** receive event over WS → same steps 2–6 → see the wall within one frame of receiving.

End-to-end interactive latency target: **< 33 ms** (steps 1–6). Network propagation target: **< 100 ms p95** to other users. Bake settled: **< 2 s p95**.

---

## 14. Migration of PRYZM's 264 legacy commands

### 14.1 Triage (Sprint 1 deliverable)

Audit categorises every command in `src/commands/` into:

- **DROP** — temporary/debug commands that never should have been commands. Estimate: 30–50.
- **MERGE** — ten variants of "update wall thickness" / "update wall height" / etc. that collapse into one `wall.update` command with a patch payload. Estimate: 100–140 commands → ~30 handlers.
- **PORT** — genuinely distinct operations (e.g. `wall.split`, `wall.merge`, `slab.cut-hole`). Each becomes one event-producing handler. Estimate: 60–80 commands → ~50 handlers.
- **PLUGIN-LIFT** — commands that belong in a specific plugin (IFC import, AI, export). Estimate: 20–30.

Net: **264 classes → ~80 command handlers**, declared in 8 plugin packages.

### 14.2 Per-command migration recipe

For each legacy command:

1. Identify the **intent** (what the user is trying to do).
2. Find or create the matching plugin (`plugins/wall`, `plugins/slab`, etc.).
3. Add a `CommandHandler` in `<plugin>/src/handlers/<command>.ts`:
   - Define payload Zod schema.
   - Implement `validate()` (lift checks from legacy class).
   - Implement `produce()` (return event(s)).
4. Update affected stores' reducers to handle new event types.
5. Delete the legacy class.
6. Add a parity test: legacy → run command → snapshot. New → dispatch command → snapshot. Snapshots must match.

### 14.3 Cutover order (which to migrate first)

- Sprint 8: walls (~19 legacy commands → 5 handlers).
- Sprint 8: slabs (~12 → 4 handlers).
- Sprint 8: doors, windows (~24 → 6 handlers).
- Sprint 12: roofs, ceilings, curtain walls.
- Sprint 13: IFC commands (lifted into `plugins/ifc-import`).
- Sprint 14: plan view, sheets.
- Sprint 16: AI commands (lifted into `plugins/ai-copilot`).
- Sprint 19: anything left → DROP or plugin-lift.

### 14.4 Coexistence rules (during migration)

- Both systems run side by side under feature flag.
- Legacy command path: `CommandManager.execute()` → legacy class → store mutation → legacy builders.
- New command path: `dispatch.send()` → handler → events → reducer → committer → worker.
- A project is on **exactly one** system at a time (per-project flag in `projects` table).
- Migration script runs each project through one-time conversion before flipping the flag.

---

## 15. Definition of Done per layer

A layer is **Done** when *all* of the following are true:

| Layer | Done means |
|---|---|
| **L0** | Manifest fetch < 100 ms p95; chunk fetch via CDN with cache-hit ratio > 80%; bake-worker scales to 10 concurrent jobs; storage layer abstracted (S3 / MinIO / local FS pluggable); zero `JSON.parse` of project blobs in client. |
| **L1** | All 12+ node types defined as Zod schemas; reducer is pure, byte-deterministic on identical event sequences; 95% line coverage; replay of 1M events in < 5 s in Node. |
| **L2** | All ~80 command handlers registered; payload schemas validated server-side; transaction model supports atomic batches; undo/redo via inverse events; wire format documented. |
| **L3** | Yjs WS provider stable under 100 concurrent users; awareness updates < 100 ms; conflict policies documented per command; offline queue replays cleanly on reconnect. |
| **L4** | All primitive producers pure (no THREE imports, runnable in Node); worker pool sustains > 70% utilisation under bulk load; producer outputs are byte-deterministic. |
| **L5** | Single rAF owner enforced by lint; idle CPU < 1% verified; demand-driven render confirmed via Chrome perf; render passes pluggable. |
| **L6** | Plugin host loads/unloads cleanly; first-party plugins all migrated; SDK 1.0 published; sandbox proven against malicious plugin test. |
| **L7** | All UI calls go through commands or selectors; no direct store mutation; all React components < 300 lines; tools follow Pascal pattern. |

---

## 16. Risk register & mitigations (additive to `02-ORCHESTRATION.md` §5)

| Risk | Likelihood | Impact | Sprint | Mitigation |
|---|---|---|---|---|
| Pascal's WebGPU pipeline doesn't survive PRYZM's customer GPU mix | Medium | Medium | S6 | WebGL2 fallback path tested first; WebGPU is opt-in until S20. |
| Yjs cannot represent a BIM-specific operation | Low | High | S10 | 1-week spike at start of S10 on the worst-case op (multi-user opening edit). |
| Bake economics: per-edit bake cost too high | Medium | Medium | S9 | Debounce 500 ms in queue; per-level granularity; measure $/edit early. |
| Customer projects fail one-shot migration in S19 | Medium | High | S19 | Run migration on staging copies of every project at S15; fix issues before cutover. |
| OBC removal in S13 reveals deeper coupling than the 105 imports suggest | High | Medium | S13 | Spike in S0 enumerates every OBC API touched, not just imports. |
| Plugin sandbox iframe perf hurts UX | Medium | Medium | S17 | Tier 1 plugins (first-party) run in-process; sandbox only for third-party. |
| Tech lead bandwidth eaten by support / PM tasks | High | Medium | All | Both seniors trained as backup leads by S5; ADRs published weekly. |
| Telemetry adds bundle size / runtime cost | Low | Medium | S2 | Sample at 10% in prod for non-error spans; aggressive code-split for OTel SDK. |
| Headless API (D7) discovers pure-function violations late | Medium | Medium | S18 | `apps/bake-worker` is the canary — anything Node-incompatible breaks it long before S18. |
| pnpm + turbo caching gets stuck and CI passes false-positive | Low | High | S1 | Cache invalidation hash includes lockfile + tsconfig + turbo.json; weekly cache reset job. |

---

## 17. Decisions to make before Sprint 1 (ADRs)

Each is a 1-page Architecture Decision Record committed to `docs/00_NEW_ARCHITECTURE/adrs/`.

| # | Title | Question | Recommended | Owner |
|---|---|---|---|---|
| ADR-001 | Pascal adoption strategy | A fork / B patterns / C viewer-only / D none | **B** (per `03-PASCAL-EDITOR-ANALYSIS.md`) | L |
| ADR-002 | CRDT choice | Yjs / Automerge / centralised OT | **Yjs** | L |
| ADR-003 | Object storage | R2 / B2 / S3 | **R2** for prod, MinIO for self-host | L |
| ADR-004 | Wire format | MessagePack / CBOR / FlatBuffers | **MessagePack (msgpackr)** | S1 |
| ADR-005 | Worker pool size policy | Fixed / dynamic / per-task | **Dynamic = `hardwareConcurrency - 1`, min 2 max 8** | S1 |
| ADR-006 | Render mode default | WebGPU / WebGL2 | **WebGL2 default for v1, WebGPU opt-in; flip in v2** | S1 |
| ADR-007 | Telemetry backend | Honeycomb / self-hosted Tempo / both | **Both — self-host primary, Honeycomb option for hosted customers** | L |
| ADR-008 | IFC parity scope for v1 | All IFC4 / structural only / negotiated subset | **Existing PRYZM corpus** (see existing IFC plan doc) | S2 |
| ADR-009 | Plugin sandbox model | iframe / Web Worker / VM / process | **iframe with postMessage RPC** | S1 |
| ADR-010 | Bake debounce window | 100 / 500 / 2000 ms | **500 ms with override per command** | S2 |
| ADR-011 | Element-permission granularity | Per-node / per-type / per-zone | **Per-node, with role inheritance** | L |
| ADR-012 | Self-host minimum requirements | Containers / VM-only / cloud-only | **Docker Compose for SMB; Helm chart for enterprise** | L |

All ADRs reviewed and merged before Sprint 1 begins. Any later contradiction requires a superseding ADR.

---

## 18. Appendix — file-by-file checklist (Sprint 1 starter)

### `packages/protocol/src/`
- [ ] `index.ts` — re-exports
- [ ] `ulid.ts` — generator + comparator
- [ ] `msgpack.ts` — encoder/decoder wrappers
- [ ] `commands/index.ts` — command type helper
- [ ] `events/index.ts` — event type helper
- [ ] `schema/manifest.ts`
- [ ] `schema/chunk.ts`
- [ ] `schema/event-segment.ts`

### `packages/domain/src/`
- [ ] `index.ts`
- [ ] `schema/base.ts` — copied from Pascal `editor/packages/core/src/schema/base.ts`
- [ ] `schema/nodes/{site,building,level,wall,slab,door,window,zone,...}.ts`
- [ ] `schema/types.ts` — `AnyNode` union
- [ ] `store/use-scene.ts` — Zustand store, but `set` only via `applyEvent`
- [ ] `store/reducer.ts` — `reduceScene` pure function
- [ ] `store/selectors.ts`
- [ ] `handlers/wall.ts`, `slab.ts`, ...
- [ ] `vitest.config.ts`

### `packages/geometry-kernel/src/`
- [ ] `index.ts`
- [ ] `types.ts` — `GeometryIR`, `MeshDescriptor`, `MaterialDescriptor`
- [ ] `producers/wall.ts`
- [ ] `producers/slab.ts`
- [ ] `math/{aabb,bbox,polygon,extrude,csg-bridge}.ts`
- [ ] `vitest.config.ts` — runs in Node; no browser-only globals

### `packages/render-runtime/src/`
- [ ] `index.ts`
- [ ] `frame-scheduler.ts`
- [ ] `scene-registry/scene-registry.ts` — copied from Pascal verbatim
- [ ] `scene-registry/use-registry.ts`
- [ ] `committers/{base,wall,slab,...}.ts`
- [ ] `workers/geometry.worker.ts`
- [ ] `workers/pool.ts`
- [ ] `passes/{scene,zone,outline,bloom,ssgi,traa}.ts` — salvaged from existing `RenderPipelineManager`
- [ ] `viewer/Viewer.tsx`

### `packages/sync/src/`
- [ ] `index.ts`
- [ ] `engine.ts`
- [ ] `awareness.ts`
- [ ] `transport/ws.ts`
- [ ] `conflict/policies.ts`

### `packages/persistence-client/src/`
- [ ] `index.ts`
- [ ] `client.ts`
- [ ] `manifest.ts`
- [ ] `chunk-loader.ts`
- [ ] `event-stream.ts`
- [ ] `auth.ts`

### `packages/plugin-host/src/`
- [ ] `index.ts`
- [ ] `manifest.ts`
- [ ] `loader.ts`
- [ ] `lifecycle.ts`
- [ ] `sandbox/iframe.ts`
- [ ] `permissions.ts`

### `apps/sync-server/`
- [ ] `package.json`
- [ ] `src/index.ts` — Express + Socket.io entry
- [ ] `src/auth.ts` — Supabase JWT
- [ ] `src/yjs-provider.ts`
- [ ] `src/event-pipeline.ts` — validate → write → broadcast → enqueue bake
- [ ] `src/rate-limit.ts`
- [ ] `Dockerfile`

### `apps/bake-worker/`
- [ ] `package.json`
- [ ] `src/index.ts` — BullMQ worker entry
- [ ] `src/baker.ts` — produces glb chunks via gltf-transform
- [ ] `src/storage.ts` — R2/S3/MinIO adapter
- [ ] `src/manifest-writer.ts` — atomic manifest update
- [ ] `Dockerfile`

### `tools/`
- [ ] `load-bench/` — Playwright + harness + baseline.json
- [ ] `visual-diff/` — Playwright + pixelmatch + golden assets
- [ ] `fixture-projects/` — small.pryzm, medium.pryzm, large.pryzm, xlarge.pryzm
- [ ] `scripts/migrate-legacy-project.ts`
- [ ] `scripts/check-architecture-rules.ts`

### Root
- [ ] `pnpm-workspace.yaml`
- [ ] `turbo.json`
- [ ] `tsconfig.base.json`
- [ ] `.eslintrc.cjs` with boundaries plugin config
- [ ] `.cursor/rules/*.mdc` — copied from Pascal + 5 PRYZM-specific
- [ ] `.github/workflows/ci.yml`
- [ ] `docker-compose.yaml` for self-host
- [ ] `replit.md` updated

---

## 19. The single most important paragraph in this plan

If only one thing is internalised by every engineer on this project: **the geometry kernel is pure. It does not import THREE. It does not see a scene. It returns descriptors of meshes, never meshes themselves. The committer is the only place THREE objects exist. The frame scheduler is the only place a frame is requested. Everything else flows from these three rules.** When in doubt, ask: "would this code run in `apps/bake-worker` (Node, no DOM, no THREE, no React)?" If the answer is no, you are in the wrong package. This single discipline is the difference between a Forma-class platform and another tangled monolith.

---

End of master plan.
