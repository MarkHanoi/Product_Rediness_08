# PRYZM 2 — Target Architecture

> Inspiration: Autodesk Forma (cloud-native BIM, server-baked geometry, design-space exploration), Qonic (cloud modelling, GPU-accelerated, conflict-free editing), Motif (real-time collab CAD, command/event log, hybrid web/desktop).
> Goal: a layered, headless-first, streaming-capable, multi-user BIM platform that PRYZM can grow into without becoming the same incremental tangle a second time.

---

## §0 — Alignment header (re-anchored 2026-04-26)

> **Strategic anchor**: This document is now subordinate to `08-VISION.md`, `09-AS-IS-VS-TO-BE.md`, `10-MASTER-IMPLEMENTATION-PLAN-36M.md`, and the four PHASE-1 sub-docs in `phases/`.
>
> **Conflict order** (highest wins): `06-PRYZM-IDENTITY-AND-RECOUNT.md` + the `.pryzm` file-format spec → `08-VISION.md` → `10-MASTER…` and the PHASE docs → this doc.
>
> **TypeScript Vanilla Decision (binding)**: PRYZM 2 stays **vanilla TypeScript** for L7 (Presentation). There is **no React/Next.js migration of the editor shell**. The L4 kernel is pure (no THREE, no DOM, no React). The only places `THREE` may be imported are `packages/scene-committer/` and `plugins/*/committer.ts`. See `08-VISION.md` §3 P1 / P2 / §10.
>
> **What in this doc is still authoritative**:
> - The 10 architectural principles in §0 — adopted verbatim into `08-VISION.md` §3 (P1 … P8) with two principles (P9 build-time enforcement, P10 observability) absorbed into P5/P8.
> - The dependency rule "code in layer N may only import from layer ≤ N", enforced by `eslint-plugin-boundaries`.
> - The L0 chunked binary `.pryzm/` project format (§2.1) — this is the seed of the binding `.pryzm` file-format spec referenced as the highest-priority override.
> - The L0/L2/L3/L4/L5/L6 contracts — the *shape* of every layer is correct; only stack choices in L5/L7 are revised.
>
> **What in this doc is SUPERSEDED**:
> - The **7-layer model** (L0 → L7) → **superseded by the 8-layer model** in `08-VISION.md` §4. L7.5 (AI Operations) is now a first-class layer between L7 and L6, with its own command bus, approval flow, and public API. Wherever this doc says "7 layers" or numbers L7 as the top, mentally insert L7.5 above L6.
> - Any reference to "L7 Presentation = React shell" or "@react-three/fiber" in L5/L6/L7 → **superseded by the TypeScript Vanilla Decision**. L7 = vanilla TS panels + canvas hosts. The R3F-style "scene as JSX" pattern is replaced by the imperative `SceneCommitter` API (`08-VISION.md` §3 P2).
> - "12+ node types" / "5–8 plugins" sizing assumptions → superseded by `06-PRYZM-IDENTITY-AND-RECOUNT.md` §3 (27 → ~50 stores, ~30–35 first-party plugins).
> - 40-week sequencing language → superseded by the 36-month plan in `10-MASTER…` and the four PHASE-1 sub-docs.

---

## 0. Architectural principles

These are the non-negotiable rules. Any feature that violates them gets refused.

1. **Domain is pure.** No `THREE`, no `OBC`, no DOM, no `window` reads. Runs in Node and the browser unchanged.
2. **Geometry is a function.** `(DTO + context) → BufferGeometryDescriptor`. Same code in worker, server, and browser.
3. **Render is a projection.** The scene graph reflects domain state; it never holds source-of-truth.
4. **Mutation is intent.** All changes flow through Commands → Events. No direct store mutation from UI.
5. **Persistence is chunked.** Levels, zones, and asset libraries are independently addressable; the wire format is binary.
6. **The frame loop has one owner.** No subsystem schedules its own `requestAnimationFrame`.
7. **Collaboration is the default.** Single-user is multi-user with one client.
8. **Plugins are first-class.** Tools, importers, AI, exporters all extend through the same plugin contract.
9. **Build-time enforcement.** Architectural rules are linted (e.g. `eslint-plugin-boundaries`), not just documented.
10. **Observability is built in.** Every layer emits structured spans; nothing is debugged by `console.log` in production.

---

## 1. Layered model

```
┌────────────────────────────────────────────────────────────────┐
│  L7  Presentation        UI shells (React), tool palettes,    │
│                          inspectors. Read-only on domain.     │
├────────────────────────────────────────────────────────────────┤
│  L6  Plugin Host         Tools, importers, exporters, AI as   │
│                          isolated plugins with manifests.     │
├────────────────────────────────────────────────────────────────┤
│  L5  Render Runtime      Single frame scheduler, scene        │
│                          committer, pluggable passes.         │
├────────────────────────────────────────────────────────────────┤
│  L4  Geometry Kernel     Pure (DTO+ctx)→IR functions.         │
│                          Runs in browser worker AND Node.     │
├────────────────────────────────────────────────────────────────┤
│  L3  Sync Engine         CRDT replication, conflict resolve,  │
│                          presence, awareness.                  │
├────────────────────────────────────────────────────────────────┤
│  L2  Command/Event Bus   CQRS: Commands→Events→Stores.        │
│                          Event log is the wire format.        │
├────────────────────────────────────────────────────────────────┤
│  L1  Domain Stores       DTO maps. Validated by Zod.          │
│                          Reducers from event log.             │
├────────────────────────────────────────────────────────────────┤
│  L0  Persistence         Chunked binary project format,       │
│                          server bake, CDN delivery, auth.     │
└────────────────────────────────────────────────────────────────┘
```

**Dependency rule**: code in layer N may only import from layer ≤ N. Verified by `eslint-plugin-boundaries` at PR time.

---

## 2. L0 — Persistence

### 2.1 Project format (binary, chunked)

```
project.pryzm/
  manifest.json           # version, schema, chunk index
  events/
    000000.evt.bin        # event log, append-only, ~4MB segments
    000001.evt.bin
    ...
  chunks/
    levels/
      L0.geo.glb          # baked geometry per level (Draco + Meshopt)
      L0.tex.ktx2         # baked textures
      L1.geo.glb
      ...
    libraries/
      walls.lib.glb       # shared/library geometry, content-addressed
      doors.lib.glb
  thumbnails/
    cover.webp
    L0_iso.webp
```

- **Append-only event log** is the source of truth. Stores are reduced from it.
- **Chunks are derived**, baked by the server, content-addressed by hash. Any chunk can be regenerated from the event log.
- **Manifest** declares chunk hashes, byte ranges, level extents. The client downloads only what the camera needs.
- **No more single-file JSON snapshots.** The legacy `ProjectSerializer` v5 becomes a one-way importer.

### 2.2 Storage backend

- **Hot store**: Postgres for manifest + auth + small metadata. (Existing Supabase fits.)
- **Object store**: S3-compatible (Cloudflare R2 / Backblaze B2 recommended for egress cost) for event segments and chunks.
- **CDN**: Cloudflare or Bunny in front of object store. Range requests enabled. HTTP/2 push optional.

### 2.3 API surface

```
GET  /projects/:id/manifest                 → manifest.json
GET  /projects/:id/events?from=N&to=M       → event segments (range-served)
GET  /projects/:id/chunks/:hash             → binary chunk (cache-forever, hash-keyed)
POST /projects/:id/events                   → append events (CRDT-merged server-side)
POST /projects/:id/bake                     → enqueue bake job (or auto-triggered)
WS   /projects/:id/sync                     → presence + event stream
```

### 2.4 Server bake service

- A Node service (separate deployable) consumes new event segments from a queue (BullMQ / SQS).
- Imports the **same headless geometry kernel** the browser uses.
- Bakes affected level chunks → glTF + Draco + Meshopt + KTX2.
- Writes back to object store, updates manifest atomically.
- Bake granularity: one chunk per (level × dirty-region). Touching one wall re-bakes one level chunk, not the project.

---

## 3. L1 — Domain Stores

Keep the existing store pattern (it's the cleanest layer in PRYZM today), but tighten the contract:

- Stores expose **read-only views** to the rest of the system.
- The **only writer** is the event reducer. UI cannot mutate.
- DTOs are **frozen** (already true in `WallStore.ts:cloneWallData`). Keep it.
- Each store declares: `name`, `dtoSchema (Zod)`, `reduce(state, event) → state`, `selectors`.
- Store registry is a typed map; no `(window as any).slabBuilder` cross-wiring.

```ts
// Example shape
interface DomainStore<TDto, TEvent> {
  readonly name: string;
  readonly schema: ZodSchema<TDto>;
  reduce(state: ReadonlyMap<string, TDto>, event: TEvent): ReadonlyMap<string, TDto>;
  select(state: ReadonlyMap<string, TDto>): Selectors<TDto>;
}
```

---

## 4. L2 — Command / Event Bus (CQRS)

### 4.1 Concept

- **Command** = user intent: *"create wall from A to B with thickness 0.2m"*.
- **Event** = fact: *"wall W42 was created at T=12345 with payload {...}"*.
- Commands are validated, may be rejected, may produce 0..N events.
- Events are **immutable**, **ordered**, **append-only**.
- Reducing the event log produces store state. Time-travel is `reduce(events.slice(0, N))`.

### 4.2 Wire format

Events serialize to **MessagePack** (compact binary, language-neutral). Each event:

```
{
  id:        ULID,                  // monotonic, sortable, includes timestamp
  actor:     UserId,
  command:   string,                // "wall.create"
  payload:   object,                // typed per command
  parentId:  ULID | null,           // for causal ordering
  meta:      { client, version }
}
```

### 4.3 Why this replaces the 264-class command system

- One `CommandHandler` per command name (registered by plugins). Not 264 classes — closer to 50–80 handlers, each tiny.
- The wire format is the same as the undo log AND the collab broadcast AND the server bake input. **One representation, three uses.**
- Undo = revert events in a transaction (server-supported). Redo = re-apply.
- AI tools call commands via the same path the UI does. No special API.

### 4.4 Transactionality

- Commands run inside a **transaction**: a batch of events that succeed or fail together.
- A single drag operation = one transaction with hundreds of `wall.move` events compacted server-side.
- Transactions carry **affected-region** metadata so the bake service knows what to invalidate.

---

## 5. L3 — Sync Engine

### 5.1 CRDT choice

**Yjs** as the substrate. Reasons:
- Mature, MIT-licensed, battle-tested in Linear, Notion-likes, Figma-adjacent tools.
- Built-in awareness protocol (cursors, presence) that maps cleanly to BIM "who's editing what".
- Pluggable transport (WebSocket, WebRTC). Existing Socket.io can host the WS provider.

### 5.2 What CRDT covers vs what it doesn't

- **Yjs handles**: text fields (notes, names), simple property edits, awareness/presence, offline merge for non-overlapping edits.
- **Geometry-conflicting edits** (two users moving the same wall) resolve through **server-side serialization**: events arrive at the relay, are linearized in arrival order, optionally rebased through a `ConflictResolver` per command type (e.g. last-write-wins for color, reject for delete-after-modify).
- **Locking** for high-conflict ops (e.g. opening editing): cooperative locks held in awareness; a soft warning UI.

### 5.3 Offline support

- All events queued locally in IndexedDB.
- On reconnect, replayed against server. CRDT merges what it can; a **conflict inbox** surfaces what needs human resolution.

---

## 6. L4 — Headless Geometry Kernel

### 6.1 Contract

Every primitive exposes:

```ts
interface GeometryProducer<TDto, TCtx> {
  readonly kind: string;                     // "wall" | "slab" | "roof" | ...
  produce(dto: TDto, ctx: TCtx): GeometryIR; // pure, deterministic
}

interface GeometryIR {
  meshes: MeshDescriptor[];                  // per material slot
  edges?: EdgeDescriptor[];                  // for line overlays
  bounds: AABB;
  metadata: { sourceId, version, materialIds };
}

interface MeshDescriptor {
  positions:  Float32Array;
  normals:    Float32Array;
  uvs?:       Float32Array;
  indices:    Uint32Array;
  materialId: string;
}
```

- **No imports from `three`.**
- **No scene access.** No mounting, no disposal.
- **Deterministic**: same input → same output, byte-equal. Enables content-addressing and cache reuse.
- **Pure** (no side effects, no globals, no time). Property-testable.

### 6.2 Runtime hosts

The same producer module runs in three hosts:

| Host | Why | How |
|---|---|---|
| **Browser worker pool** | Off-main-thread interactive build | Vite-bundled Web Worker; postMessage transfers `Float32Array` zero-copy. |
| **Node bake service** | Server-side baking | Same package imported as ESM in Node 22+. |
| **Browser main thread (fallback)** | Tiny edits / when worker is busy | Direct call. |

Pool size = `navigator.hardwareConcurrency - 1`. Producers are stateless, so any worker can take any job.

### 6.3 What ports cleanly today

- `RoofGeometryBuilder.generate(data)` — already pure (`RoofFragmentBuilder.ts:128`). Done.
- `SlabGeometryUtils.outsetPolygon` — pure. Reusable.
- `RoofGeometryBuilder` — pure.

### 6.4 What needs ground-up rewrite

- `WallFragmentBuilder.buildWall()` — extract pure `produceWallGeometry(wall, joinData, ctx)`. Discard scene mutation. Discard global reads. ~3 weeks for one engineer per primitive.
- `SlabFragmentBuilder._buildSlab()` — same.
- `CurtainWallBuilder` — same.

### 6.5 Materials

Materials are **descriptors**, not THREE objects, in the kernel:

```ts
interface MaterialDescriptor {
  id: string;
  type: "physical" | "basic" | "line";
  color: [r,g,b];
  roughness?: number;
  metalness?: number;
  textures?: { albedo?, normal?, roughness?, ao? };
}
```

The Scene Committer (L5) translates descriptors → `MeshStandardMaterial` etc. The kernel never sees a `THREE.Material`.

---

## 7. L5 — Render Runtime

### 7.1 Single frame scheduler

```ts
class FrameScheduler {
  requestFrame(reason: DirtyReason): void;     // any change goes through here
  registerListener(name: string, fn: TickFn, phase: Phase): void;
  // Phases: input → simulate → commit → render → post → idle
}
```

- **Only one** `requestAnimationFrame` in the whole codebase, owned by `FrameScheduler`.
- **Linted**: `no-restricted-globals: ['requestAnimationFrame']` outside the scheduler module.
- Idle frames continue accumulating SSGI/TRAA temporal samples after motion stops, then halt.

### 7.2 Scene Committer

- Subscribes to store changes → diffs against last commit → applies minimal mesh add/update/remove to the THREE scene.
- This is the **only** place `scene.add` / `scene.remove` is called. Builders never touch the scene.
- Committer caches IR by `sourceId + version`; if version unchanged, re-uses GPU buffers. (Today's `WallFragmentBuilder._lastBuiltVersion` pattern, but at the renderer boundary.)

### 7.3 Render passes

- Salvage the existing `RenderPipelineManager` TSL/WebGPU pipeline (1,261 lines of mostly good code).
- Reorganize as a **pass plugin registry**: ScenePass, ZonePass, SSGI, TRAA, Outline, Bloom each declare `dependsOn`, `dirtyTrigger`, `cost`.
- `FrameScheduler` runs only the passes whose dirty triggers fired. Idle frames re-run cheap passes only.

### 7.4 OBC demotion

OBC stays only as the **IFC import plugin**. After import, IFC fragments are converted to PRYZM IR via a one-time adapter and committed by the Scene Committer like any other primitive. `ViewController`, `PlanViewManager`, `EdgeProjectorService`, `PlanViewService` lose their direct OBC dependencies.

---

## 8. L6 — Plugin Host

### 8.1 Plugin manifest

```ts
interface PluginManifest {
  id: string;                              // "@pryzm/wall-tool"
  apiVersion: "1.0";
  contributes: {
    commands?:    CommandHandler[];        // L2 handlers
    producers?:   GeometryProducer[];      // L4 producers
    passes?:      RenderPass[];            // L5 passes
    tools?:       Tool[];                  // L7 toolbar items
    importers?:   Importer[];              // file → events
    exporters?:   Exporter[];              // events → file
  };
  dependsOn?: string[];                    // plugin ids
}
```

### 8.2 What becomes a plugin

| Plugin | Today | New |
|---|---|---|
| `@pryzm/wall` | Hard-coded across 30 files | One package: command handlers + producer + tool |
| `@pryzm/slab` | Same | Same |
| `@pryzm/ifc-import` | OBC fused in | OBC isolated here |
| `@pryzm/ai-copilot` | `src/ai/` mixed throughout | Plugin that subscribes to events, dispatches commands |
| `@pryzm/export-pdf` | `src/export/` mixed | Plugin |
| `@pryzm/export-ifc` | Same | Plugin |

### 8.3 Loading

- Core plugins (wall, slab, level, grid, view, selection) are statically bundled in the editor build.
- Optional plugins (AI, advanced exports) are dynamically imported on activation.
- Server-side bake imports only the producers it needs.

---

## 9. L7 — Presentation

- React for shells, panels, inspectors. (Existing.)
- **No business logic in components.** Components dispatch commands, read selectors. Period.
- Tool overlays render through React Three Fiber; the main 3D view uses raw THREE managed by the Scene Committer (faster, fewer abstractions on the hot path).
- Theme/tokens centralized; existing Tailwind config keeps working.

---

## 10. Hot-path sequence diagrams

### 10.1 Cold project load (target: ~700 ms perceived)

```
t=0      User clicks project
t=10     Manifest GET (CDN cached) ............................. ~50 ms
t=60     Spin renderer + scheduler in parallel with ............ ~80 ms
         Event log GET (first 4 MB segment) ................... ~100 ms
t=160    Replay events for active level into stores ........... ~80 ms
t=240    Commit baked chunk for active level (range fetch) .... ~250 ms
t=490    First paint with skeleton + active level geometry .... 0 ms
t=490+   Background: stream remaining levels, warm caches,
         resume SSGI/TRAA accumulation in idle frames.
```

Two requests are critical-path: manifest + active-level chunk. Everything else is parallel or background.

### 10.2 User edits a wall

```
Tool emits intent → Command "wall.update" dispatched
  → CommandHandler validates, produces Event "wall.updated"
  → Event appended to local log, broadcast over WS
  → Sync Engine merges (no conflict for solo)
  → Reducer updates WallStore
  → Scene Committer diffs, marks wallId dirty
  → Geometry Worker enqueued: produceWallGeometry(newDto, ctx)
  → Worker returns IR via transferable buffers
  → Scene Committer swaps mesh in scene
  → FrameScheduler.requestFrame("geometry-update")
  → Render runs minimal passes, then idles
  → Server bake invalidates affected chunk in background
```

Total interactive latency target: **<33 ms** (one frame + one worker round trip).

### 10.3 Collaborator edits the same project

```
Remote user appends event to server log
  → Server fans out via WS
  → Local Sync Engine applies event
  → Reducer updates store
  → Scene Committer marks dirty
  → Same render path as 10.2
```

No special collab code path. Local and remote edits use the same machinery.

### 10.4 Undo

```
User presses Cmd+Z
  → Command "history.undo" dispatched
  → Server (or local for solo) emits inverse events for the last transaction
  → Reducer applies them like any other events
  → Scene Committer reflects
```

No snapshot restore. No store-replay. Just inverse events.

---

## 11. Technology choices (concrete)

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript 5.5+ strict | Already in use, matches team. |
| Runtime (server) | Node 22 (LTS) | Native ESM, worker_threads, fetch. |
| Frontend bundler | Vite (existing) | Already producing the dev experience the team wants. |
| 3D library | THREE r163+ (existing) | Reuse what works, demote OBC. |
| GPU pipeline | WebGPU via TSL where available, WebGL2 fallback | Existing `RenderPipelineManager` is a strong starting point. |
| Workers | Native Web Workers + Comlink | Simple, no SharedArrayBuffer assumptions. |
| Geometry math | gl-matrix or wgpu-matrix | Pure, fast, no THREE dep. |
| Mesh compression | Draco (geometry) + Meshopt (vertex order) + KTX2 (textures) | Industry standard for streamed glTF. |
| CRDT | Yjs | Mature, awareness protocol included. |
| Wire format | MessagePack | 30–50% smaller than JSON, schema-flexible. |
| Object storage | Cloudflare R2 (or B2) | Zero egress for R2; CDN fronting for B2. |
| Queue (server bake) | BullMQ on Redis | Light, observable, well-tooled. |
| Auth | Existing Supabase | No reason to change. |
| Schema validation | Zod (existing) | Reuse store schemas at the wire boundary too. |
| Telemetry | OpenTelemetry → Honeycomb or Tempo | Spans across L0–L7 give you actual flame graphs. |
| Lint | `eslint-plugin-boundaries` + custom rule disallowing rAF outside scheduler | Architecture rules enforced at PR time. |

---

## 12. Repository layout

```
packages/
  domain/                  # L1 stores, L2 command/event types, pure
  geometry-kernel/         # L4 producers, used by browser+node
  sync/                    # L3 Yjs glue + transport
  render-runtime/          # L5 scheduler + committer + passes
  plugin-host/             # L6 plugin loader + manifest
  protocol/                # MessagePack schemas, wire types
  persistence-client/      # L0 client SDK (manifest+chunks+events)

apps/
  editor/                  # L7 React app
  viewer/                  # L7 read-only viewer build
  bake-worker/             # L0 Node service for server bake
  sync-server/             # L3 WebSocket relay + auth glue

plugins/
  wall/  slab/  roof/  curtain-wall/  level/  grid/
  ifc-import/  pdf-export/  ifc-export/
  ai-copilot/

tools/
  load-bench/              # CI perf gate
  fixture-projects/        # known-size projects for regression
```

This is a **monorepo**. pnpm workspaces. Each package versioned independently. Each package has its own README, tests, and `boundaries` config.

---

## 13. Non-functional targets

These are the success criteria the new architecture is held to:

| Metric | Target | Today |
|---|---|---|
| Cold load (50k-element project, cached chunks) | < 1s perceived, < 3s full | ~10–30s |
| Edit-to-paint latency | < 33 ms (1 frame + 1 worker hop) | 100–500 ms |
| Idle CPU when scene unchanged | < 1% (demand-driven) | 5–15% always running |
| Undo latency (any operation) | < 50 ms | varies, snapshot-restore based |
| Multi-user merge of non-conflicting edits | invisible | n/a |
| Server bake of one wall change | < 2 s end-to-end | n/a |
| Worker pool utilization on big load | > 70% on N-1 cores | 0% (main-thread only) |
| Test coverage of geometry kernel | > 90% line, property-tested | minimal |
| Lint enforcement of layer boundaries | 100% | 0% |

CI fails if any of these regress beyond budget. Tracked via `tools/load-bench`.

---

## 14. What this architecture does NOT solve

Be honest about scope:

- **Photo-real rendering** beyond TRAA+SSGI is out of scope. (Path tracer is a separate plugin if/when needed.)
- **Generative AI design** (Forma's design-space exploration) is a downstream feature; the architecture enables it (events are a clean substrate) but doesn't deliver it.
- **Mobile-native client** is also downstream; the editor app is web-only at v1, the viewer app is web+mobile-friendly.
- **Versioning of plugin APIs** between major versions is policy work, not solved by the architecture itself.

---

The next document sequences this into deliverables.
