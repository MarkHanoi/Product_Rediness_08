# ADR-022 — Renderer Topology + Backend Runtime

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `GAP-REVIEW-2026-04-27.md §6.1, §13, §28, §29 #10,#11,#12,#13` |
| Required by | Sprint S31 (Phase 2B start — backend env-var contract + renderer split — Phase 2A holds no gap-closure work per 2026-04-27 directive) |
| Owner | Architecture lead |
| Implementation | `apps/api-gateway/`, `apps/sync-server/`, `apps/bake-worker/`, `apps/ai-worker/`, `packages/renderer/`, `packages/render-runtime/` |
| Spec dependency | `SPEC-15-DEPLOYMENT-TOPOLOGY.md`; `SPEC-12-BUNDLE-SPLITTING.md` |

---

## Context

The corpus repeatedly references "the renderer", "the bake worker", "the sync server" without ever pinning **which package owns which surface, which Node version each runs on, what queue backend hosts BullMQ on Replit, and how the three render packages (`packages/renderer/`, `packages/render-runtime/`, legacy `src/render/` + `src/rendering/`) divide responsibility**. Without an ADR, the next renderer/server PR has to re-derive the answers.

`GAP-REVIEW-2026-04-27.md §6.1` flagged: "the One Renderer is two." `§13` flagged: "Replit Deployments specifically — what hosts the queue?" `§29 #11–#13` flagged: "Node 20 vs 22 ambiguity; Yjs server placement; BullMQ-Redis story."

This ADR resolves all of the above.

---

## Decision

### Part A — renderer topology (one package per surface)

| Surface | Owner | Responsibility |
|---|---|---|
| **`packages/renderer/`** | device | wraps WebGPU (default) + WebGL2 fallback; exposes `RenderDevice` interface; per `[strategic ADR-006]`. |
| **`packages/render-runtime/`** | scheduler + committer host | the single rAF owner; consumes scene-cache + renderer device; per `09-AS-IS-VS-TO-BE` §5 (58 → 1 frame owner). |
| **legacy `src/render/`** | DELETE | scheduled for removal at S55 per SPEC-27 §4.3. |
| **legacy `src/rendering/`** | DELETE | scheduled for removal at S55 per SPEC-27 §4.3. |

The dependency direction is **strict downward**: `packages/render-runtime/` depends on `packages/renderer/`, never the reverse. Boundary lint (`pryzm/no-circular`) enforces.

### Part B — Node runtime version

**Production: Node 20 LTS** (Replit default; matches Reserved VM ship date).

Rationale:
- Replit Hosted ships Node 20 by default. Node 22 requires opt-in.
- `camera-controls@2.x` peer-warns on Node < 22 but **runs fine** on Node 20 (the warning is for unrelated optional features we don't use).
- Node 22 brings ESM-only changes that risk our Jest configuration; defer to post-GA.

**Dev: Node 20 LTS** (parity with prod).

**Self-host minimum: Node 18 LTS** (per `[strategic ADR-012]`); we test Node 18, 20, 22 in CI matrix nightly.

Engines pin in every `package.json`:
```json
"engines": { "node": ">=20.0.0 <23.0.0" }
```

### Part C — BullMQ queue backend on Replit

**Replit Hosted production**: **Upstash Redis** (TLS, regional, per-tenant DB) per SPEC-15 §3.3.
**Replit dev/preview**: bundled `redis-server` container (or Upstash dev tier).
**Self-host**: bundled Redis 7 in compose, per `[strategic ADR-012]`.

Connection string lives in `UPSTASH_REDIS_URL`; never hard-coded; never committed.

### Part D — Yjs server placement

`apps/sync-server` runs on a **Replit Reserved VM** (single instance at v1).

Rationale:
- WebSocket connections are stateful → Autoscale would either break sessions on scale or require a Redis pub/sub broker.
- Reserved VM single-instance ceiling (~2k concurrent WS) covers v1 launch capacity.
- At >2k concurrent, add a second Reserved VM with sticky-session routing by `projectId` hash (`SPEC-15 §2.2.1`, post-GA work).

### Part E — IPC vs HTTP between processes

| From | To | Transport |
|---|---|---|
| `apps/editor` (browser) | `apps/api-gateway` | HTTPS REST (Vite proxy in dev) |
| `apps/editor` (browser) | `apps/sync-server` | WSS (sticky to single Reserved VM) |
| `apps/api-gateway` | `apps/bake-worker` | BullMQ over Upstash Redis |
| `apps/api-gateway` | `apps/ai-worker` | BullMQ over Upstash Redis |
| `apps/api-gateway` | `apps/sync-server` | HTTPS internal (signed JWT) |
| `apps/bake-worker` ↔ Postgres / R2 | direct | per SPEC-15 §3 |

No process-to-process direct HTTP except `gateway → sync-server` for admin operations. All work routes through Redis queue.

### Part F — frame-loop authority

`packages/render-runtime/` is the **only** package permitted to call `requestAnimationFrame`. ESLint rule `pryzm/single-frame-owner` lit at S31 (warning) and S32 (error) — quarantined libraries (Cesium, OBC, ifcjs viewer) operate per `[strategic ADR-023]`.

---

## Consequences

**Positive:**
- Every server / renderer file knows which package owns it.
- Replit-specific operational decisions (Reserved VM for sync, Autoscale for stateless) are in writing.
- Node / BullMQ / Redis are pinned; no surprise upgrades.
- Future renderer rewrite (e.g. WebGPU compute pipelines for plan view) drops into `packages/renderer/` without touching the runtime.

**Negative:**
- Reserved VM is more expensive than Autoscale; cost reviewed at S60.
- Node 20 means we delay some Node 22 features (test runner improvements, WebSocket built-in). Acceptable.
- Two render packages introduce more boundary lint rules; mitigated by clean dependency direction.

---

## Alternatives considered

### A1 — Run Yjs on Autoscale with Redis pub/sub
Rejected at v1: adds operational complexity for a load level we don't have. Revisit at S60.

### A2 — Single render package
Rejected: device vs scheduler responsibilities are separable and mixing them caused legacy `src/render/` + `src/rendering/` to grow into two confused folders. Keep them split.

### A3 — Pin Node 22
Rejected: Replit default + camera-controls ergonomics. Reconsider at S60 when Replit Node 22 image is mature.

### A4 — Use Replit-native queue (no Redis)
Rejected: there is no Replit-native queue. BullMQ + Redis is the standard. Upstash is the path.

---

## Phase rollout

- S31 — ADR-022 land (Phase 2B start; Phase 2A holds no gap-closure); `pryzm/single-frame-owner` ESLint rule warning level; env-var Zod schema in `apps/api-gateway/`; `packages/render-runtime/` consumes `packages/renderer/`; legacy still parallel-running.
- S32 — frame-owner rule promoted to error.
- S38 — `apps/sync-server` provisioned on Reserved VM; staging traffic routed.
- S43 — production cutover (per SPEC-27 §3); Yjs primary.
- S55 — legacy `src/render/` + `src/rendering/` deleted.
- S60 — Reserved VM capacity review; possible second VM for >2k concurrent.
- S72 (M36 GA) — single-frame-owner invariant green in production.
