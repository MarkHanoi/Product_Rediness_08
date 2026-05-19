# Founding Platform Engineer — Technical Architecture Brief
## Enterprise Cloud BIM Authoring Platform · 10,000 Users · DAR / Sidara

> This document is a technical reference for the founding platform engineer interview. It covers every major architectural domain of a production-grade, browser-native BIM authoring platform designed from the ground up for a large AEC enterprise.

---

## 1. The Problem Space — Why This Is Hard

Building a BIM authoring platform in the browser is not a scaled-up viewer. It is a distributed system that must simultaneously satisfy constraints that usually pull in opposite directions:

| Constraint | Why it is hard |
|---|---|
| **Geometric precision** | BIM coordinates can span 10 km at sub-millimetre tolerance. Floating-point representation, coordinate system transformation, and WASM precision gaps all matter. |
| **Frame budget** | The browser's main thread has a 16 ms budget for 60 fps. A single 100 MB IFC model can carry 500,000+ triangles. Geometry cannot touch the main thread during load. |
| **Collaboration semantics** | Two structural engineers editing the same floor simultaneously cannot produce a corrupted model. Conflict resolution must be mathematically guaranteed, not "best effort." |
| **Memory ceiling** | Chrome on a 64-bit machine grants roughly 2–4 GB to the WASM heap. Large buildings exceed this. The platform must never load what is not visible. |
| **Interoperability** | The AEC industry's lingua franca (IFC) is a 30-year-old STEP-based text format — not streamable, not diffable, not queryable. The platform must both speak it fluently and not be enslaved to it. |
| **AI cost vs. determinism** | An LLM hallucinating a structural column location is a liability issue. AI must be advisory, auditable, and overridable by a deterministic validator layer. |
| **Enterprise compliance** | ISO 19650 mandates a specific document lifecycle (WIP → Shared → Published → Archived). SOC 2 / GDPR require audit trails. The platform enforces these as code, not policy. |

These constraints define the non-negotiable architectural decisions before any feature is discussed.

---

## 2. Data Model — The Foundation

### Principle: semantic-first, geometry-as-projection

The internal data model is the source of truth. Geometry is a deterministic, rebuildable **projection** of structured data — never the other way. If geometry is lost, it can be reconstructed from the semantic model. If the semantic model is corrupted, nothing can save it.

### Core entity schema

```
Element {
  id:              UUID            -- stable, cross-version, cross-system
  type:            IFC4X3 class    -- IfcWall | IfcColumn | IfcSlab | ...
  ifc_guid:        string          -- 22-char IFC GUID for external referencing
  discipline:      arch | struct | mep | civil
  level_id:        UUID → SpatialLevel.id
  geometry_ref:    UUID → GeometryRecord.id
  properties:      JSONB           -- IFC property sets (heterogeneous)
  version:         integer
  created_at:      timestamp
  updated_at:      timestamp
  created_by:      UUID → User.id
}

GeometryRecord {
  id:              UUID
  element_id:      UUID → Element.id
  glb_url:         string          -- pre-tessellated fragment (Three.js consumable)
  brep_ref:        string?         -- STEP/BREP for precision operations
  bbox:            float[6]        -- [minX, minY, minZ, maxX, maxY, maxZ] — spatial queries
  lod_urls:        JSONB           -- { lod0, lod1, lod2 } → different-detail GLBs
  mesh_hash:       string          -- SHA256 of tessellation — detects repeated geometry for instancing
  updated_at:      timestamp
}

Relationship {
  id:              UUID
  type:            IFC relationship class (IfcRelContainedInSpatialStructure | IfcRelAggregates | ...)
  from_id:         UUID → Element.id
  to_id:           UUID → Element.id
  props:           JSONB
}

SpatialLevel {
  id:              UUID
  project_id:      UUID
  name:            string          -- "Ground Floor", "Level 1"
  elevation:       float           -- metres above project base point
  ifc_guid:        string
}

ProjectSnapshot {
  id:              UUID
  project_id:      UUID
  yjs_state:       bytea           -- serialized Yjs update vector (CRDT state)
  label:           string          -- "Design Review v3"
  state:           wip | shared | published | archived   -- ISO 19650
  element_count:   integer
  created_by:      UUID
  created_at:      timestamp
}
```

### Key design decisions

**JSONB for properties, not a fixed schema.** IFC has hundreds of standard property sets plus project-specific extensions. A rigid column schema requires a migration for every new property set definition. JSONB with a GIN index for property-set queries gives schema flexibility with acceptable query performance at BIM dataset sizes.

**Geometry separated from element data.** Element identity and semantic data change at a different rate than geometry. Storing them separately avoids bloating the element table on geometry updates and enables independent caching/eviction of geometry assets.

**Yjs snapshot alongside row data.** The CRDT state vector is stored as a binary blob per snapshot. Point-in-time recovery works by replaying Yjs updates from the last snapshot forward to any target timestamp.

**Spatial index on bbox.** A PostGIS GiST index on the bounding box column enables frustum-culling queries at the database level: "give me all elements whose bbox intersects camera frustum." This eliminates transferring element IDs for invisible geometry to the client.

**IFC-aligned type system, not native IFC storage.** IFC STEP files are not queryable, not diffable, and not streamable. The internal model uses IFC4X3 class names as the type vocabulary but stores data in a relational/JSONB model. IFC is the import/export codec — not the storage format.

---

## 3. System Architecture

### Five-tier architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ CLIENT TIER                                                          │
│ 3D Viewport (Three.js/WebGPU)  │  UI Shell (React)  │  PWA/Offline  │
│ ───────────────────────────────────────────────────────────────────  │
│ Engine Layer (WASM + TypeScript)                                     │
│ Geometry Kernel · Scene Graph · FrameScheduler · CommandBus · CRDT  │
└─────────────────────────────────────────────────────────────────────┘
         │ REST / WebSocket / Socket.io       │ Service Workers
┌─────────────────────────────────────────────────────────────────────┐
│ BACKEND TIER (Node.js BFF + modular services)                        │
│ Auth/IAM  │ Projects  │ AI Gateway  │ Collab Relay  │ IFC Service   │
│ Export    │ Jobs API  │ Webhooks    │ Audit Log      │ Marketplace   │
└─────────────────────────────────────────────────────────────────────┘
         │ HTTP + Message Queue
┌─────────────────────────────────────────────────────────────────────┐
│ COMPUTE TIER (isolated workers)                                      │
│ IFC Parser  │  DWG Converter  │  Geometry Worker  │  Bake Worker    │
└─────────────────────────────────────────────────────────────────────┘
         │ read / write
┌─────────────────────────────────────────────────────────────────────┐
│ DATA TIER                                                            │
│ PostgreSQL (entities + snapshots)  │  Object Store (IFC/GLB/DWG)   │
│ Redis (queues + Socket.io adapter) │  Vector DB (embeddings + RAG)  │
│ Time-series (OTel metrics + costs) │                                 │
└─────────────────────────────────────────────────────────────────────┘
         │
┌─────────────────────────────────────────────────────────────────────┐
│ AI TIER                                                              │
│ LLM Gateway (Claude/GPT)  │  Embedding Service  │  Rule Engine      │
│ Cost Meter (per-user)      │  OTel Tracing       │  Validation Layer │
└─────────────────────────────────────────────────────────────────────┘
```

### Deployment model for 10,000 users

**Phase 1 (0–2,000 users): Monolith + managed services**
- Single Node.js API server (Express)
- Managed PostgreSQL (Supabase / Neon / RDS)
- Cloudflare R2 for binary storage (IFC, GLB, DWG)
- Redis Cloud for job queues and Socket.io adapter
- Vercel/Railway/Render or a single VPS — zero-ops

**Phase 2 (2,000–10,000 users): Horizontal scaling**
- API servers behind a load balancer (stateless by design — all state in DB/Redis)
- Socket.io with Redis adapter (sticky-session-free collaboration)
- Compute workers as auto-scaling services (separate from API)
- CDN (Cloudflare) for GLB fragment delivery with edge caching
- PostgreSQL read replicas for analytics/search queries
- Connection pooling via PgBouncer or Supabase Pooler

**Phase 3 (10,000+ / enterprise): Service extraction**
- Extract AI gateway as an independent service (cost isolation)
- Extract collab sync server (Yjs over WebSocket is stateful — sticky routing or Liveblocks-style infra)
- Edge auth (Cloudflare Workers) for reduced auth latency across regions
- pgvector or dedicated vector DB for semantic search at scale
- Multi-region PostgreSQL (CockroachDB or Aurora Global) for global enterprise

---

## 4. Frontend Engine Architecture

### Non-negotiable separation of concerns

The engine is not a React application with Three.js inside it. The engine is an autonomous runtime that React observes.

```
Yjs Document (CRDT state)
  └── typed element store (in-memory, read from Yjs)
        └── SceneCommitter (computes diff between current and last committed state)
              └── FrameScheduler (priority queue: interaction > scene > idle > background)
                    └── Renderer (Three.js WebGL2 / WebGPU)
                          └── Post-processing → Overlay → Path tracer (async accumulation)
```

React never writes to Three.js. Three.js never writes to React state. The boundary is the `SceneCommitter` — it is the only actor that translates data-layer changes into GPU mutations.

### FrameScheduler

A singleton that owns the `requestAnimationFrame` loop. Tick listeners register at a priority tier:

| Priority | Consumers | Timing |
|---|---|---|
| `interaction` | Selection feedback, snapping response | First — must complete in <2 ms |
| `render` | Scene commit, draw call submission | Main render — 8–12 ms budget |
| `post-render` | SSAO, bloom, tone mapping | After main draw |
| `overlay` | Annotation labels, 2D dimension lines | Last, blended above scene |
| `idle` | LOD swaps, geometry eviction, thumbnail generation | `requestIdleCallback` |
| `background` | Path tracer accumulation | Throttled, never blocking frame |

The scheduler enforces that frame timing is respected even under heavy state update load. No state update can starve the render tick.

### LOD and streaming strategy

**LOD tiers (distance from camera):**
- **LOD 0** (<10 m): full tessellation, all material channels
- **LOD 1** (10–50 m): simplified mesh (meshopt_simplify at 30% triangle count), diffuse only
- **LOD 2** (>50 m): axis-aligned bounding box sprite — one draw call per element at any distance
- Transitions cross-faded over 200 ms to eliminate pop-in

**Streaming:**
- On project load: fetch spatial hierarchy first (fast metadata — element IDs, bboxes, levels)
- Stream GLB fragments by proximity to camera, sorted by bbox-to-frustum distance
- HTTP/2 multiplexed requests for parallel fragment fetching
- Loaded fragments cached in IndexedDB; evicted (and GPU memory released) when cold

**Instancing:**
- Detect repeated geometry by `mesh_hash` (SHA256 of tessellated buffer)
- Replace N identical meshes with one `InstancedMesh` + per-instance transform matrix
- Selection/highlight via secondary instance attribute buffer (not a separate mesh)
- Typical BIM models: window families, structural bolts, column grids → 10,000 instances from one draw call

**Memory budget manager:**
- Polls `performance.memory` (Chrome) each frame
- When approaching ceiling: evict LOD 0 → LOD 1 → LOD 2 for elements furthest from camera
- Release GPU memory via `geometry.dispose()` + `renderer.forceContextLoss()` only on critical pressure

### CommandBus

Every model mutation is a typed command:

```typescript
interface Command<T extends string, P> {
  type: T
  payload: P
  correlationId: string   // for optimistic update rollback
  actorId: string
}

// Examples
type PlaceWallCommand = Command<'wall.place', {
  startPoint: Vec3; endPoint: Vec3; levelId: string; typeId: string
}>

type MoveElementCommand = Command<'element.move', {
  elementId: string; delta: Vec3
}>
```

Flow:
1. Command enters `CommandBus.execute()`
2. **Schema validation** (Zod) — malformed commands are rejected immediately
3. **Constraint check** — soft constraints evaluated (level exists, element type valid for discipline)
4. **Optimistic apply** — command applied to local Yjs document immediately (user sees instant feedback)
5. **OTel span opened** — `pryzm.command.execute` records command type, actor, latency
6. **Server ACK** — command relayed via WebSocket; server applies to authoritative Yjs state
7. **Confirm or rollback** — on network failure, local optimistic change is reverted
8. **AI commands follow the same path** — AI proposals enter the bus after human confirmation; they are indistinguishable from human commands in the audit log

---

## 5. Real-Time Collaboration at Scale

### Why CRDT over OT for BIM

Operational Transformation was designed for linear text (Google Docs, Notion). A BIM model is a typed, attributed graph. CRDTs — specifically Yjs — provide:

- **Peer-to-peer capability** — no central sequencing server required
- **Mathematically proven convergence** — not algorithm-dependent "best effort"
- **First-class offline** — merge any two diverged states at reconnect
- **Yjs primitives map to BIM naturally** — `Y.Map` for element properties, `Y.Array` for ordered command logs, `Y.Text` for comments

### Collaboration infrastructure

```
Client A                   Sync Server                   Client B
  │                             │                              │
  │── Yjs update (binary) ─────▶│                              │
  │                             │── broadcast ────────────────▶│
  │                             │── persist to event_log       │
  │                             │                              │── apply to local Y.Doc
  │                             │                              │── SceneCommitter diff
  │◀── awareness ───────────────│◀── cursor/selection ─────────│
  │ (cursor, active tool, name) │                              │
```

**Sync server responsibilities:**
- Receive binary Yjs updates from clients via WebSocket (`/sync`)
- Apply updates to a server-side `Y.Doc` (merge with server authority)
- Broadcast merged update to all clients subscribed to the same `projectId`
- Persist updates to `event_log` table (append-only, JSONB payload) for catch-up on reconnect
- Enforce soft locks on spatial structure elements (prevents simultaneous restructuring)

**Multi-instance collab (Phase 2+):**
- Redis pub/sub as the broadcast bus between sync server instances
- Sticky routing not required — Yjs updates are self-contained (include their own causal history)
- Redis also used for Socket.io adapter (for notification events separate from CRDT relay)

**Conflict types and resolution:**

| Conflict type | Resolution |
|---|---|
| Same property edited simultaneously | Yjs LWW on the shared `Y.Map` entry — deterministic, no user intervention |
| Same element moved simultaneously | Both moves recorded; CRDT picks one based on causal ordering; notification sent to losing user |
| Element deleted while another user is editing it | Yjs tombstone (element disappears); notification: "Element deleted by Alice while you were editing" |
| Spatial hierarchy restructuring | Soft lock required (5-min timeout, visible to all); prevents structural conflicts |
| Numeric property conflicts (e.g., wall thickness) | Additive delta merge — both changes summed, not overwritten |

### Presence and awareness

- Yjs awareness protocol for ephemeral state (not persisted to DB)
- Cursor position (throttled to 50 ms), active selection set, current tool, user color, display name
- Server enriches awareness with authoritative `displayName` — clients cannot spoof names
- Presence shown in 3D viewport (ghost cursor on canvas) and in the user panel

### Offline mode

- IndexedDB stores the last known project snapshot (`pryzm-offline-v1` DB)
- On load without network: serve from IndexedDB — read-only mode with banner
- On reconnect: send local Yjs state vector to server; server replies with missing updates since divergence; CRDT auto-merges — no user action required
- Awareness and cursors are ephemeral and do not need merging

---

## 6. AI Architecture

### AI is a system layer, not a feature

The principle: AI actions are structurally identical to user actions. Both enter the `CommandBus`. Both pass through the same validators. Both appear in the audit log with their actor ID. The only difference is that AI commands require explicit human confirmation before entering the bus.

```
User natural language input
        ↓
   Intent parser (LLM with structured output + Zod validation)
        ↓
   Constraint checker (deterministic — spatial rules, level existence, type validity)
        ↓
   Command proposal (preview rendered in 3D, shown to user)
        ↓
   Human confirmation (mandatory — no autonomous commits)
        ↓
   CommandBus.execute() → Yjs → render diff → audit log
```

### AI pipeline architecture

```
Client → POST /v1/ai/invoke → Auth middleware → Quota middleware
                                    ↓
                           AI Router (workflow dispatcher)
                                    ↓
                   ┌────────────────┼────────────────┐
                   ↓                ↓                 ↓
            LLM Gateway      Embedding Service    Rule Engine
        (Claude/GPT-4)       (text-embed-3-small)  (deterministic)
                   ↓                ↓
            Usage Recorder   Vector DB (pgvector)
        (per-token metering, OTel spans)
```

**LLM gateway:** All LLM calls proxied through the server. API keys never touch the browser. Supports Anthropic Claude (primary) and OpenAI GPT-4 (fallback). Abstracted behind a gateway interface — provider swap requires no client code change.

**Cost metering:** Per-user, per-plan budget limits enforced before every LLM call:
- Per-call token cap
- Daily spend ceiling
- Monthly spend ceiling
- Model allowlist per plan tier (e.g., free tier restricted to haiku, enterprise tier unrestricted)

**OpenTelemetry instrumentation on every AI call:**
- `pryzm.ai.workflow.${kind}` span
- Attributes: model ID, input token count, output token count, cost USD, latency ms, command type
- Enables cost attribution per project, per user, per workflow type

### AI feature tiers for enterprise BIM

**Tier 1 — High value, build first:**
- Natural language element queries ("show me all load-bearing walls on Level 3 thicker than 200mm")
  → LLM translates to a structured query → SQL or Yjs map traversal → result highlighted in 3D
- AI-assisted plan critique (floor plan SVG + brief → structured [{issue, severity, affected_elements, suggestion}])
- Change summarization ("what changed between snapshot A and snapshot B?" → diff of two Yjs state vectors)
- Quantity extraction from spec PDFs → structured BIM properties

**Tier 2 — Build carefully:**
- Generative design options (massing → 3–5 structural options, user picks one → applies via CommandBus)
- Voice commands for hands-free site review on tablet/AR device
- Design rule checking against building codes (RAG over regulations + ML classifier for gray-area clauses)

**Tier 3 — Defer:**
- AI-generated detailed geometry (hallucination risk unacceptable for safety-critical elements)
- Autonomous design agents without human review gates

### LLM usage patterns

**Pattern 1: Structured output**
```
Prompt:  "Parse this IFC property set and return JSON schema"
Output:  { "type": "object", "properties": { "FireRating": { "type": "string" } } }
Validation: Zod parse — reject and retry with clarifying prompt on schema mismatch
```

**Pattern 2: RAG over building regulations**
```
Query:   "What fire rating is required for this corridor wall?"
→ Embed query → ANN search in vector DB (building codes + project specs)
→ Top-k chunks → LLM prompt with chunks as context
→ Structured answer: { rating: "60 min", clause: "BS 9999 §8.3", confidence: 0.91 }
```

**Pattern 3: Tool-calling for model mutations**
```
User:    "Move all structural columns on grid A to grid A-prime"
→ LLM intent parse → tool call: select_elements({ type: "IfcColumn", grid: "A" })
→ Server returns element IDs
→ LLM constructs typed move commands → preview → human confirms → CommandBus
```

### Reliability and verification

AI output is never trusted implicitly:
1. Zod schema validation on every LLM JSON output — reject malformed, retry with correction prompt
2. Deterministic pre/post constraint checks on all AI-generated commands
3. Separate audit log entries for AI actions: timestamp, model ID, input hash, output hash, human confirmation ID
4. Confidence thresholds — classification outputs below 85% surface a "needs review" flag
5. Every AI-generated change is undoable via standard Ctrl+Z (Yjs undo manager)

---

## 7. Interoperability

### IFC — the non-negotiable

IFC4X3 is the AEC industry standard for building data exchange. The platform must:
- Import any IFC 2x3 / IFC 4 / IFC 4X3 file without data loss
- Export to IFC4X3 from the internal element graph
- Carry an `ifc_guid` on every element for stable external referencing
- Handle IFC's quirks (duplicate GUIDs, non-conformant exporters, schema version mixing)

**Import pipeline:**
```
IFC file upload (multer)
  → Server-side job queue (priority: high — user waiting)
    → Node.js worker thread (web-ifc WASM)
      → Parse IFC → extract spatial hierarchy, elements, properties, geometry
        → Generate per-element GLB fragment files
          → Store in object storage (R2/S3)
            → Write element rows + geometry records to PostgreSQL
              → Emit Socket.io event → client receives import complete
                → Client streams GLB fragments by proximity
```

**Export pipeline:**
```
User requests IFC export
  → Server constructs IFC entity graph from element rows + relationships
    → web-ifc generates STEP text
      → Validation step (IfcOpenShell schema check)
        → Store in object storage
          → Return presigned URL (time-limited)
```

### Additional formats

| Format | Direction | Method | Location |
|---|---|---|---|
| DWG | Import | Autodesk APS Model Derivative (cloud conversion) | Server-side service |
| DXF | Import/Export | Server-side `dxf` library | Node worker |
| Rhino 3DM | Import | `rhino3dm` WASM (openNURBS port) | Client-side (browser) |
| GLB/GLTF | Import/Export | `@gltf-transform` | Server-side |
| PDF (sheets) | Export | `pdf-lib` + `svg2pdf.js` | Server-side |
| BCF | Import/Export | BCF 2.1 JSON API | Plugin |
| Revit | Import | C# Revit add-in → IFC4X3 export → platform import | External tool + API |

### Revit integration model

A C# .NET Revit add-in communicates with the platform via REST:
- Add-in exports the current Revit model to IFC4X3 on demand
- Pushes IFC to platform `/api/v1/projects/{id}/import`
- Platform processes, returns element graph
- AI-generated design options returned to Revit as linked IFC files
- Platform webhooks notify the add-in when an approved design needs to be pushed back

This is a one-way pipeline initially. True bidirectional sync (editing in both systems simultaneously) is a Phase 3+ problem.

---

## 8. Plugin / Extensibility System

### Why plugins are non-negotiable for enterprise

A single enterprise firm has 50+ discipline-specific workflows. No product team can build them all. The platform must provide the conditions for others to extend it safely.

### Manifest-driven architecture

Every plugin is described by a `plugin.manifest.json`:

```json
{
  "pryzmPlugin": "1.0",
  "id": "com.dar.clash-detection",
  "version": "2.1.0",
  "displayName": "DAR Clash Detection",
  "permissions": ["read:project", "write:project", "network:fetch"],
  "allowedOrigins": ["https://clash-api.dar.com"],
  "contributions": [
    { "kind": "tool", "id": "clash-run", "label": "Run Clash", "icon": "clash.svg" },
    { "kind": "panel", "id": "clash-results", "label": "Clash Results" }
  ],
  "main": "dist/plugin.js"
}
```

### Sandbox isolation

- Plugin code runs in an iframe with `sandbox="allow-scripts"` only — no `allow-same-origin`
- CSP is generated from the manifest's `permissions` array:
  - No `network:fetch` → `connect-src 'none'` (no outbound requests possible)
  - With `network:fetch` → `connect-src` restricted to `allowedOrigins`
- All communication via typed postMessage envelope — plugin cannot access DOM or engine internals directly
- Host drops any inbound message type not on the allow-list

### Permission system (7 locked permissions)

| Permission | Grants |
|---|---|
| `read:project` | Read access to element graph, properties, geometry |
| `write:project` | Propose commands via CommandBus (user must confirm) |
| `read:user` | Read authenticated user's name, email, plan |
| `network:fetch` | Outbound HTTP requests (restricted to `allowedOrigins`) |
| `register:tool` | Add a button to the toolbar |
| `register:panel` | Add a side panel |
| `register:command` | Register a keyboard shortcut command |

### Distribution and signing

- Plugin packages are signed with Ed25519 — marketplace verifies signature on publish
- Revocation list (`revocations.json`) checked at install and on each activation
- Versioned installs per project or per organization
- Marketplace API: `GET /v1/plugins`, `POST /v1/plugins/{publisher}/{slug}/versions`

### Three developer tiers

**Tier 1 — REST API:** OAuth2 client credentials. Query/mutate project data, upload IFC, trigger exports. Auto-generated OpenAPI documentation.

**Tier 2 — Plugin SDK (`@pryzm/plugin-sdk`):** TypeScript package with typed element graph access, UI component primitives matching the platform design system, CommandBus integration for mutations in the undo/redo stack, AI command primitives billed to the user's plan.

**Tier 3 — Headless SDK:** Run the geometry kernel, IFC parser, and rendering pipeline from Node.js without a browser. Target: CI/CD workflows, automated compliance checks, batch processing of large IFC portfolios.

---

## 9. Security Architecture

### Authentication

- Email/password: bcrypt (cost 12) + JWT (30-day expiry, `SESSION_SECRET`)
- OAuth: Google, Microsoft — code exchange → upsert user → mint same PRYZM JWT
- JWT payload: `{ sub: userId, email }` — no roles (resolved server-side on every request)
- Enterprise: SAML 2.0 / OIDC SSO planned for Phase 2

### Authorization — RBAC + ISO 19650

```
Organization
  └── Project
        ├── Role: Appointing Party   → full control, approve/publish
        ├── Role: Lead Appointed     → read + write elements, issue documents
        ├── Role: Team Manager       → read + write elements + manage members
        ├── Role: Team Member        → read + write elements
        └── Role: Viewer             → read only, no download
```

- Roles are resolved from DB on every API request — never trust client-supplied role
- ISO 19650 CDE state machine: `wip → shared → published → archived` (terminal)
- State transitions are role-gated: only Appointing Party can approve to `published`
- Archived documents are immutable — no mutation commands accepted

### ISO 19650 compliance in code

The version state machine (`versionStateMachine`) enforces:
- Valid transitions (e.g., you cannot skip from `wip` directly to `archived`)
- Role requirements per transition
- Mandatory rejection reason when returning a document to `wip`
- Append-only audit entry on every transition (actor, timestamp, from_state, to_state)

### Data isolation

- Every database query includes `WHERE project_id = $1` and `WHERE org_id = $1` — no cross-tenant data leakage possible at the ORM/query level
- Presigned URLs for object storage: time-limited (15 minutes), not guessable, no direct public bucket access
- AI prompts include only the requesting user's project data — no cross-project RAG

### Transport and headers

- TLS 1.3 everywhere; HSTS `max-age=31536000`
- CORS: origin allowlist from `ALLOWED_ORIGIN` env var (no wildcard in production)
- Security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
- `COOP: same-origin` and `COEP: credentialless` — required for `SharedArrayBuffer` (WASM threading)
- CSP: `default-src 'self'`; `unsafe-eval` retained (required by Three.js shader compilation)

### Audit trail

Two independent audit tracks:
1. **CDE audit log** (`version_audit_log`): every ISO 19650 state transition — tamper-evident append-only
2. **Command log** (`project_command_log`): every model mutation — actor, timestamp, command type, payload hash — for compliance and catch-up replay

### Rate limiting

Three tiers using `express-rate-limit`:
- Global: 200 req / 15 min per IP (all `/api/*`)
- API: 60 req / min per IP (`/api/v1/*`)
- AI: 20 req / 15 min per IP (`/v1/ai/*`) — aggressive to control LLM costs

---

## 10. Observability — OpenTelemetry

The platform is instrumented with OpenTelemetry from day one. This is not optional — you cannot optimize what you cannot measure.

### Instrumented operations

| Operation | Span name | Key attributes |
|---|---|---|
| Command execution | `pryzm.command.execute` | command_type, actor_id, project_id, latency_ms |
| AI workflow | `pryzm.ai.workflow.${kind}` | model_id, input_tokens, output_tokens, cost_usd |
| IFC parse | `pryzm.ifc.parse` | file_size_mb, element_count, duration_ms |
| Scene commit | `pryzm.scene.commit` | delta_count, lod_tier, gpu_memory_mb |
| Collaboration sync | `pryzm.collab.sync` | project_id, update_size_bytes, latency_ms |
| Bake worker job | `pryzm.bake.job` | job_type, queue_wait_ms, processing_ms, outcome |

### Key metrics for 10,000 users

| Metric | Target |
|---|---|
| API P99 response time (metadata queries) | < 200 ms |
| Socket.io relay latency (collab quality) | < 50 ms |
| IFC parse time (100 MB file) | < 30 s |
| Frame rate during model interaction | ≥ 60 fps |
| Cold project load (first paint, 50 MB model) | < 4 s |
| AI query response (P50) | < 3 s |

### Alerting triggers

- Dead-letter queue depth > 10 (stuck jobs)
- AI spend rate > 2x daily baseline (cost runaway)
- P99 API latency > 500 ms sustained for 5 min
- Yjs sync error rate > 0.1% (collaboration integrity)
- Memory pressure events > 3 per hour per user (renderer crisis)

---

## 11. WASM Strategy

WASM is used exclusively for **pure compute** — never for I/O or UI. The rule: use WASM when the JS runtime is demonstrably insufficient (precision, performance, or existing C++ library with no JS equivalent).

| Use case | WASM module | Why JS is insufficient | Runs where |
|---|---|---|---|
| IFC STEP parsing | `web-ifc` (C++) | ~50x speed advantage; STEP parser complexity | Node.js worker (server) |
| Geometry boolean ops | `manifold` (C++) | JS float precision breaks topological correctness | Server-side worker |
| Mesh simplification | `meshopt` (C++) | Called on every model load — must be fast | Server-side worker |
| Rhino 3DM import | `rhino3dm` (C++) | Direct port of openNURBS — no JS equivalent | Browser (client) |
| Section plane computation | `web-ifc` geometry eval | Frame-level real-time — must be off main thread | Browser Web Worker |

WASM is NOT used for: rendering (Three.js + GPU handles this), network I/O, React UI, or authentication.

---

## 12. Infrastructure & DevOps

### CI/CD pipeline

```
git push → GitHub Actions
  → lint + type-check (eslint + tsc --noEmit)
  → unit tests (vitest)
  → integration tests (playwright, headless)
  → build (vite build)
  → Docker image build + push
  → staging deploy (automatic)
  → production deploy (manual gate)
```

### Self-hosted architecture (enterprise requirement)

Many large AEC firms cannot use public cloud SaaS due to data sovereignty requirements. The platform is packaged for on-premise deployment:

```
docker-compose / Kubernetes:
  ┌─────────────────────────────────────────────────────┐
  │ nginx (reverse proxy + TLS termination)              │
  │ api-gateway (Node.js Express, port 5101)            │
  │ sync-server (WebSocket collab, port 4000)           │
  │ bake-worker (geometry compute, port 4001)           │
  │ ai-worker (AI workflow processor)                   │
  │ postgres (or external managed)                      │
  │ redis (queues + Socket.io adapter)                  │
  │ minio (S3-compatible object storage)                │
  └─────────────────────────────────────────────────────┘
```

All services communicate over an internal Docker network. External access only through nginx.

### Key environment variables / configuration

```
DATABASE_URL              PostgreSQL connection string
SESSION_SECRET            JWT signing secret (min 48 bytes random)
REDIS_URL                 Redis connection (queue + collab adapter)
OBJECT_STORAGE_URL        R2/S3/MinIO endpoint
AI_GATEWAY_URL            LLM proxy URL (or ANTHROPIC_API_KEY for direct)
ALLOWED_ORIGIN            Comma-separated CORS origin allowlist
PRYZM_OWNER_EMAIL         Owner user (bypasses RBAC checks in dev)
SMTP_*                    Email delivery for invitations/notifications
```

---

## 13. Migration Path from Existing Tools

For an enterprise like DAR currently using desktop BIM tools, the migration is phased:

**Phase 0 — Read-only overlay (months 1–3)**
Platform consumes IFC exports from Revit/Archicad. Users can view, navigate, annotate, and run AI queries. No authoring yet. Builds trust in the 3D viewer before asking users to change workflows.

**Phase 1 — Hybrid authoring (months 4–9)**
Platform becomes the system of record for new project documents. Revit/Archicad used for detailed parametric modelling; platform used for coordination, review, and AI-assisted decisions. IFC is the bridge.

**Phase 2 — Native authoring (months 10+)**
Common element types (walls, slabs, columns, doors, windows) authored natively in the platform. Revit reserved for highly parametric families only. Most day-to-day coordination happens browser-native.

**Phase 3 — Platform-first (18+ months)**
Plugin SDK enables DAR's own discipline teams to build extensions. Marketplace of DAR-specific plugins. Revit becomes a data source / output sink rather than the primary authoring environment.

---

## 14. Technology Stack Summary

| Layer | Technology | Rationale |
|---|---|---|
| Frontend framework | React 19 | Industry default; concurrent features for complex UI |
| 3D rendering | Three.js + WebGL2 (WebGPU path ready) | Mature ecosystem; clear upgrade path to WebGPU |
| Engine language | TypeScript (strict) | Type safety at the command/schema boundary |
| CRDT | Yjs | Proven in production (Figma, Linear, Notion); first-class offline |
| Backend | Node.js Express | Team expertise; single language full-stack; pnpm monorepo |
| Database | PostgreSQL | JSON, GIS, recursive CTEs, full-text — no specialist DB needed at this scale |
| Job queue | BullMQ (Redis) | BullMQ-shaped interface; swap from in-memory without code change |
| Object storage | Cloudflare R2 (or MinIO for self-hosted) | Zero egress cost; edge CDN integration |
| AI | Anthropic Claude (primary) / OpenAI (fallback) | Behind a gateway interface — provider-agnostic |
| IFC | web-ifc (C++ WASM) | Fastest browser-compatible IFC parser; same library client and server |
| Observability | OpenTelemetry → Grafana / Honeycomb | Vendor-agnostic; traces + metrics from day one |
| Auth | JWT/bcrypt + OAuth (Google/Microsoft) + SAML (Phase 2) | Incremental — start simple, add enterprise SSO when needed |

---

*Document prepared for DAR / Sidara Founding Platform Engineer interview. Covers architecture appropriate for 0 → 10,000 users on a browser-native BIM authoring platform.*
