# ADR-013 — Persistence Operational Semantics

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `CONFLICT-ANALYSIS.md §6.2` |
| Required by | Sprint S08 (Phase 1A close — bake worker live) |
| Owner | Architecture lead |
| Spec dependency | `specs/SPEC-02-PERSISTENCE.md` |

---

## Context

`08-VISION §3` P7 establishes the event log as the source of truth, but does not specify:
- Compaction policy for an append-only log.
- Schema migration of event payloads (`Wall.v1` → `Wall.v2`).
- Bake-worker idempotency / partial-failure recovery.
- R2 ↔ Postgres consistency window.

Without these decisions, the event log is correct in steady state but undefined under load, schema evolution, partial failures, and multi-region.

---

## Decision

Adopt SPEC-02 in full as the operational contract:

1. **Compaction** (SPEC-02 §3): triggered at 500k events / 1 GiB / 90 days; snapshot event materialises current state; older events move to `events_archive` (RLS-scoped, 7-year retention).

2. **Schema migration** (SPEC-02 §4): every event payload carries `command_id` with explicit version (`wall.create.v1`); migrations live forever in `packages/file-format/migrations/`; geometry-changing migrations mark project bake-stale.

3. **Bake idempotency** (SPEC-02 §6.3): content-addressable R2 keys (`chunks/<projectId>/<elementId>/<analyticHash>/<lod>.glb`); `chunk-manifest` events are no-op idempotent.

4. **R2 ↔ Postgres consistency** (SPEC-02 §5): event log is source of truth; R2 chunks are cache; readers fall back to client-side baking via the kernel after 10 s retry budget.

5. **Region pinning** until M36 GA: single-region per tenant; multi-region replication is post-GA (ADR-021 §8).

---

## Consequences

**Positive:**
- Bounded operational behaviour for every failure mode.
- Schema evolution is forward-only and reversible.
- No data corruption possible from R2 eventual-consistency window.

**Negative:**
- Migration registry is forever-growing; cannot remove entries.
- Compaction requires a brief project-wide read advisory lock (~30 s).
- Client-side baking fallback is slower (1-2 s for medium element); acceptable as a tail-event handler.

---

## Alternatives considered

### A1 — No compaction; rely on partition pruning only
Rejected: 500k+ event projects would have unbounded load times.

### A2 — Snapshot per save (CQRS read-model rebuild every save)
Rejected: defeats the O(Δ) save advantage of the event log.

### A3 — Skip schema versioning; coerce on read
Rejected: silent coercion bugs are unauditable.

### A4 — R2 as source of truth with Postgres as index
Rejected: Postgres ACID is a stronger correctness substrate; chunks belong in object storage.

---

## Phase rollout
- S04 — bake-worker scaffolded; chunk addressing scheme adopted.
- S08 — bake-worker live; idempotency tested.
- S22 (M12 alpha) — first compaction smoke test.
- S43 — multi-user concurrent bake jobs (per-project queue concurrency = 1 enforced).
- S48 (M24 beta) — first production compaction.
- S70 (Phase 3D) — multi-region readiness drill.
