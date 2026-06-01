# ADR-002 — CRDT / Event-Log Bridge

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `CONFLICT-ANALYSIS.md §6.1` |
| Required by | Sprint S05 (Phase 1A close — translator skeleton) |
| Owner | Architecture lead |
| Implementation | `packages/sync/src/translator.ts` |
| Spec dependency | `specs/SPEC-03-SYNC-CRDT.md` §3 |

---

## Context

`08-VISION §3` P4 mandates "MessagePack-encoded events with ULIDs … are simultaneously the undo log, the persistence event log, the sync wire format, and the audit trail."

`09-AS-IS §L3` mandates "Yjs CRDT with conflict-free merge."

These are not the same byte stream. Yjs has its own update encoding (`Y.encodeStateAsUpdate` / `Y.applyUpdate`). The two cannot both be the canonical wire format unless one is a derived form of the other.

---

## Decision

There are **two byte streams**, not one. They are connected by a single translator owned by L3:

1. **PRYZM event stream** — MessagePack + ULID. Source of truth. Used for:
   - L0 persistence (event log).
   - Undo/redo log.
   - Audit trail.
   - Public API (REST + WebSocket).
   - `.pryzm` file format.

2. **Yjs update stream** — Yjs-native binary. Wire format **on the network between collaborating clients**. Used for:
   - Real-time CRDT broadcast on the sync server.
   - In-memory Y.Doc state on each client.

The **translator** (`packages/sync/src/translator.ts`) is the only code that:
- Converts PRYZM events → Y.Doc mutations (outbound).
- Converts Y.Doc updates → PRYZM events (inbound).

### Round-trip identity (CI gate)
```
toEvent(toYjs(toEvent(yjsUpdate))) === toEvent(yjsUpdate)
toYjs(toEvent(yjsUpdate)) merges identically to yjsUpdate
```

Asserted by property test `packages/sync/__tests__/property/translator-roundtrip.test.ts`. Required by S08 (warning), S22 (error).

### Storage division
- L0 stores PRYZM events. Y.Doc state is reconstructed on project open by `replayEventsIntoYDoc(doc, events)`.
- The Yjs update stream is **not durable**.

---

## Consequences

**Positive:**
- Single source of truth (event log).
- CRDT correctness guarantees are scoped to the in-memory Y.Doc only.
- Audit / public API / file format are independent of Yjs versioning.
- Yjs can be replaced (e.g. with Loro or Automerge) by swapping the translator without touching the file format.

**Negative:**
- Two encodings to maintain.
- Translator complexity is non-trivial (estimated ~800 LOC).
- Initial-load cost: replaying all events into Y.Doc on open.

**Mitigation for the load cost:**
- Compaction (SPEC-02 §3) — snapshot events shrink the replay set.
- Server-side Y.Doc cache: hot projects keep their Y.Doc resident; client receives `Y.encodeStateAsUpdate` instead of replaying.

---

## Alternatives considered

### A1 — Y.Doc updates as the only wire/disk format
- Rejected: ties the file format and audit trail to Yjs's binary format and version.
- Yjs has had multiple binary-format breaking changes. We cannot accept that risk on the file format.

### A2 — Custom CRDT built on top of the event log
- Rejected: the maintenance cost of building a CRDT correctly is enormous. Yjs is battle-tested.

### A3 — Operational Transformation instead of CRDT
- Rejected: OT requires central server coordination; LWW-as-stop-gap-then-Yjs is the path the rest of the architecture is built around.

---

## Phase rollout
- S05 — translator skeleton; one-direction (event → Yjs only).
- S22 (M12 alpha) — translator round-trip identity test passes; LWW behaviour preserved.
- S43 — full bidirectional translator; soft locks live.
- S48 (M24 beta) — Yjs CRDT replaces LWW everywhere.
