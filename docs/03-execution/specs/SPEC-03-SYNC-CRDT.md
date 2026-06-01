# SPEC-03 — Sync, CRDT & Multi-User Semantics (L3)

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead |
| Closes | `CRITICAL-REVIEW-2026-04-27.md §B3` |
| Phases | 1D (single-user + shared cursors), 2D (true CRDT), 3D (hardening) |
| Required ADRs | ADR-002 (CRDT/event-log bridge), ADR-019 (soft-lock semantics) |

> L3 is the hardest CS in the rebuild. No published BIM tool runs Yjs as the sole conflict resolver for parametric geometry. This spec defines exactly what Yjs is responsible for, what it is **not** responsible for, and how concurrent BIM operations converge.

---

## §1 Layered responsibilities

| Layer | Owns | Does not own |
|---|---|---|
| L2 (Command Bus) | Validating an intent, computing Immer patches, emitting an event. | Conflict resolution. Convergence. |
| **L3 (Sync)** | Translating events ↔ Y.Doc updates, enforcing soft locks, broadcasting awareness, gating commits during merge. | Geometry, baking, persistence. |
| L0 (Persistence) | Durable storage of merged events. | Concurrent edit semantics. |

The translator (L2 ↔ L3) is the single piece of code that decides what counts as a conflict.

---

## §2 The Yjs document model

### §2.1 What Y.Doc structures hold

```
Y.Doc(projectId)
├── elements: Y.Map<elementId, Y.Map<fieldName, value>>
│   ├── <elementId>
│   │   ├── analytic: Y.Map (centerline, height, layers, …)
│   │   ├── parameters: Y.Map (per-type)
│   │   └── relations: Y.Map (hostId, openingIds[], …)
├── views: Y.Map<viewId, ViewDefinition>
├── annotations: Y.Map<annotationId, ...>
├── locks: Y.Map<elementId, LockRecord>          # see §4
└── awareness (out-of-band, not part of Y.Doc):
      { actorId, name, color, cursor, activeViewId, activeTool, selection[] }
```

### §2.2 What Yjs CRDT does for us
- Field-level convergence on `Y.Map` updates: two users edit different fields of the same element → both win.
- Insert-order preservation in `Y.Array`: two users add openings concurrently → both retained.
- Awareness gossip with sub-second propagation.

### §2.3 What Yjs CRDT does NOT do
- It does not understand BIM semantics. Two users editing the **same** field of the same element produce a Yjs-converged value, but the application semantics may be broken (e.g. wall thickness becomes invalid).
- It does not handle hosted relationships. A door whose host wall was just deleted by another user has a dangling `hostId` that Yjs will faithfully retain.
- It does not enforce schema. Yjs gives you a `Y.Map<string, any>`; we layer Zod validation in the translator.

---

## §3 The translator (L2 ↔ L3) — closes the §6.1 ADR-002 question

### §3.1 Outbound: command → Y.Doc mutation
```ts
// packages/sync/src/translator.ts
export function applyCommandToYDoc(doc: Y.Doc, event: PryzmEvent): void {
  doc.transact(() => {
    for (const patch of event.patches) {
      applyImmerPatchToYStructure(doc, patch);
    }
    // Emit a side-channel record so the inverse translator can recreate event metadata.
    doc.getMap('__metadata').set(event.ulid, { actorId, commandId, timestamp });
  }, /* origin */ event.ulid);
}
```

### §3.2 Inbound: Y.Doc update → command
A remote Y.Doc update arrives. We need to express it as a PRYZM event for the local L1 store and the local UI.

```ts
export function yDocUpdateToCommand(update: Uint8Array, doc: Y.Doc): PryzmEvent[] {
  // Decode the Yjs update into a list of (path, op, value) tuples.
  // Group by element, infer the canonical command_id from the path pattern.
  // Validate against the Zod schema for that command.
  // Emit one event per logical command; preserve actor metadata from `__metadata`.
}
```

### §3.3 The single rule
- The translator is the **only** code that creates Y.Doc mutations from PRYZM events.
- The translator is the **only** code that creates PRYZM events from Y.Doc updates.
- Round-trip identity is a CI test: `toYjs(toEvent(toYjs(e))) === toYjs(e)` for all generated events.

### §3.4 Storage division
- **Source of truth (L0):** the PRYZM event log. Y.Doc state is not durable.
- **CRDT replay buffer:** Y.Doc reconstructed from event log on project open via `replayEventsIntoYDoc(doc, events)`.
- **Wire format on the network:** Yjs binary updates (`Y.encodeStateAsUpdate`).
- **Wire format on disk and on the public API:** PRYZM events (MessagePack).
- The two formats are connected by the translator and never directly mixed.

### §3.5 ADR-002 disposition
ADR-002 ratifies §3.1–§3.4 above. The translator is owned by `packages/sync/`. It must ship by S05 (Phase 1A close) for Yjs scaffolding; full bidirectional support by S43 (Phase 2D start).

---

## §4 Soft locks (closes B3 gap "TTL spec missing"; ADR-019)

### §4.1 Lock record

```ts
type LockRecord = {
  elementId: ElementId;
  ownerActorId: ActorId;
  acquiredAt: ISO8601;
  expiresAt: ISO8601;          // acquiredAt + TTL
  reason: 'editing' | 'transforming' | 'parametric-edit' | 'ai-batch';
  scope: 'element' | 'element+relations';
};
```

Stored in `Y.Doc.locks: Y.Map<elementId, LockRecord>`.

### §4.2 Acquire policy
- A lock is requested by an L5 tool when the user enters an interactive edit (drag handle, modal property edit).
- TTL = 60 s for `editing`, 30 s for `transforming`, 120 s for `parametric-edit`, 600 s for `ai-batch`.
- Heartbeat: while the tool is active, it renews the lock every TTL/2 seconds.
- If the lock map already has an entry for this element with a non-expired `expiresAt`, the request is **denied**. The tool surfaces `"X is editing this element"` from awareness.

### §4.3 Conflict resolution within milliseconds
Two users request the same lock at near-simultaneous time:
- The Yjs CRDT for `Y.Doc.locks` resolves to a deterministic winner (Yjs-native: last-write-wins on `Y.Map.set`).
- Both clients see the same winner after Yjs convergence.
- The losing client's tool aborts the interaction and shows the awareness-based ownership message.
- No retries; the user must wait or coordinate.

### §4.4 Lock expiry mid-edit (the painful case)
Scenario: user A locks wall W, network drops, TTL expires, user B locks W and edits, network returns.
- On reconnect, user A's client checks the lock: it is expired (or owned by B).
- A's tool **must** detect this in its `useFrame` callback (every frame while editing) and abort.
- A's pending uncommitted edits (the in-progress drag, the modal field that hasn't blurred yet) are **discarded** and a toast surfaces: *"You lost the lock on this element. Your unsaved changes were not applied."*
- Already-committed edits before the disconnect remain in A's local event log; the translator catches the conflict at reconnect and surfaces a structured merge dialog (§5).

### §4.5 Permission gate
A guest editor cannot acquire a lock on an element of type `Wall.structural`, `Column.loadBearing`, `Beam.loadBearing`. The L2 command handler rejects with a permission error before reaching L3. (See SPEC-08 §3 for the role/permission matrix.)

### §4.6 AI batches
An AI plugin proposing a batch acquires the `ai-batch` lock on every affected element. If any lock acquisition fails, the entire batch is queued in the approval queue but cannot commit until all locks are acquired.

---

## §5 Concurrent BIM operations — worked semantics

### §5.1 Two users edit the same wall thickness
- Both clients send a `wall.update.v1` event with `patch: { thickness: <value> }`.
- The translator applies both to `Y.Doc.elements[wallId].analytic.thickness`.
- Yjs LWW resolves: latest-write-by-Lamport-timestamp wins.
- The losing client sees its UI re-render to the winner's value.
- A `merge.conflict-resolved` toast is surfaced: *"Your thickness change was overridden by a concurrent edit."*

### §5.2 User A moves wall, user B inserts a door on it
- A's event: `wall.update.v1 { patch: { centerline: [...] } }`.
- B's event: `door.create.v1 { hostId, offsetAlongHost, ... }`.
- These touch different fields → both win after Yjs convergence.
- The kernel re-bakes the wall and the door. Door's `offsetAlongHost` is preserved; the door now sits on the new wall geometry.
- Edge case: if the new wall is shorter than `offsetAlongHost + door.width`, the kernel returns `KernelError.HostTooShort`. The L2 handler catches this and emits a `door.invalid.v1` system event that flags the door for user attention. The door is not deleted; it is rendered with an error decoration.

### §5.3 User A deletes wall, user B inserts a door on it
- A's event: `wall.delete.v1 { wallId }`.
- B's event: `door.create.v1 { hostId: wallId, ... }`.
- Yjs orders these. If A's delete is later, the wall is gone but the door remains with `hostId` pointing at a deleted element.
- The translator on the inbound side checks the `hostId` against current Y.Doc state; if missing, the door is created with `relations.orphaned: true` and a system event flags it. The door renders as a free-standing entity until the user reassigns the host or deletes the door.

### §5.4 User A reconnects from offline with 50 local events
- On reconnect, the client sends its 50 events in order to the server.
- The server applies them to its Y.Doc, broadcasts the resulting Y.Doc updates to all clients.
- Conflicts are resolved per §5.1 / §5.2 / §5.3.
- A's client receives the canonical Y.Doc state, recomputes its L1 stores, and surfaces a single "reconnected" toast with a link to the merge log.

### §5.5 Two users edit the same parameter at the same instant (sub-100 ms)
- Both events queued at the server within Yjs's batching window.
- One wins the LWW; the other becomes a "co-edit" entry in the merge log.
- No data is lost; both edits exist in the event log; only one is applied to the Y.Doc.

---

## §6 The merge log

### §6.1 Purpose
Audit trail of every Yjs-resolved conflict. Visible to the user; queryable by the AI for "what happened to this element."

### §6.2 Storage
A `merge_log` table in Postgres, RLS-scoped to project members:
```sql
CREATE TABLE merge_log (
  project_id UUID, sequence BIGINT,
  conflict_kind TEXT,                 -- 'lww','orphaned-host','too-short','batch-blocked','lock-expired'
  winning_event_ulid CHAR(26),
  losing_event_ulid CHAR(26),
  resolution TEXT,
  surfaced_to_user BOOL DEFAULT false,
  PRIMARY KEY (project_id, sequence)
);
```

### §6.3 UX
- A bell icon in the top bar shows unread merge log entries.
- Per-element dialog ("History") displays the merge log entries that affected this element.
- The AI can query the merge log when asked "why does this wall look weird?".

---

## §7 Awareness

### §7.1 Payload
```ts
{
  actorId, name, color,
  cursor: { x, y, viewId } | null,
  activeViewId, activeTool,
  selection: ElementId[],
  ghostPreview: { kind, vertices } | null,        // mid-creation preview shared cross-user
  status: 'editing' | 'browsing' | 'idle' | 'ai-thinking',
}
```

### §7.2 Update cadence
- Cursor + selection: throttled to 33 ms (~30 fps).
- Status changes: immediate.
- Heartbeat: every 5 s; missing 3 consecutive heartbeats marks the user as "disconnected" in the presence list.

### §7.3 No persistence
Awareness is ephemeral. It is not stored in Postgres, R2, or Y.Doc. Disconnect = entry removed.

---

## §8 Server-side responsibilities (`apps/sync-server/`)

- WebSocket endpoint per project room: `wss://sync.pryzm.com/v1/projects/<id>`.
- Authn/authz: JWT bearer; verify project membership and role.
- For each connection: subscribe to Y.Doc updates from peers, broadcast.
- Persist Y.Doc updates to the event log via the translator on a debounced writer (every 100 ms or on disconnect).
- Rate limiting: 1000 messages / 60 s / actor; burst 50 messages / s.
- Backpressure: if Y.Doc update size > 64 KiB, server fragments before broadcast.
- Disconnection: 30 s TTL on actor presence; cleared on timeout.

---

## §9 Latency targets

| Event | p50 | p95 | p99 |
|---|---|---|---|
| Local edit → wire | < 5 ms | < 15 ms | < 50 ms |
| Wire → remote applied | < 100 ms | < 250 ms | < 500 ms |
| End-to-end (edit on A → render on B) | < 150 ms | < 350 ms | < 750 ms |
| Reconnect resync (10 events backlog) | < 500 ms | < 1500 ms | < 3000 ms |

Bench: `apps/bench/sync-latency.ts` (Phase 2D), `apps/bench/concurrent-users.ts` (10, 20, 50 users).

---

## §10 Phase rollout

| Sprint | Deliverable |
|---|---|
| S05 (Phase 1A) | Sync server scaffolded; translator skeleton; LWW-only path; no Y.Doc yet. |
| S22 (Phase 1D) | M12 Alpha: single-user + shared cursors via awareness only; no concurrent geometry edits. |
| S43–S48 (Phase 2D) | Y.Doc structures live; translator full path; soft locks; merge log; M24 Beta. |
| S67–S72 (Phase 3D) | Hardening at 50 concurrent users; multi-region readiness drill; chaos tests. |

LWW is the **stop-gap** until S43. The contract supersession of Contract 07 LWW is *immediate*; the *implementation* migrates per phase.

---

## §11 Cross-references
- Wire-format conflict and the original ADR-002 problem: `CONFLICT-ANALYSIS.md §3.3`, §6.1.
- Soft-lock open question: `CONFLICT-ANALYSIS.md §6.8` (now closed by §4 here + ADR-019).
- Layer placement: `08-VISION §4` (L3).
- Phase deliverables: `phases/PHASE-2-MIGRATION-MULTIUSER-M13-M24.md` §5 (2D).
- ADRs: `adrs/ADR-002-crdt-event-log-bridge.md`, `adrs/ADR-019-soft-lock-semantics.md`.
