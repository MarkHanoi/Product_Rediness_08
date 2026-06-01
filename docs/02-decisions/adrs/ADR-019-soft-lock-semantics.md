# ADR-019 — Soft-Lock Semantics

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `CONFLICT-ANALYSIS.md §6.8`; `CRITICAL-REVIEW-2026-04-27.md §B3` |
| Required by | Sprint S48 (Phase 2D — M24 Beta with concurrent geometry edits) |
| Owner | Architecture lead |
| Implementation | `packages/sync/locks.ts`; consumed by L5 tools at edit-start. |
| Spec dependency | `SPEC-03-SYNC-CRDT.md` §4; `SPEC-08-SECURITY-COLLAB.md` §3.3 |

---

## Context

Multiple users editing the same project simultaneously is a v1 feature (D3 — real-time multi-user). CRDT (Yjs, per ADR-002) handles low-frequency concurrent commits gracefully. It does **not** prevent two users from grabbing the same drag handle at the same moment and racing each other's mid-drag mouse movements into structurally inconsistent geometry.

The corpus mandates "soft locks": short-TTL ownership that prevents simultaneous interactive edit on the same element while still permitting concurrent edits across different elements. `CONFLICT-ANALYSIS.md §6.8` and `CRITICAL-REVIEW-2026-04-27.md §B3` flag the absence of TTL, conflict-resolution, lock-expiry-mid-edit, and AI-batch semantics. SPEC-03 §4 proposes the full model. This ADR ratifies it.

---

## Decision

**Per-element soft locks with role-aware TTLs; conflict resolved by Yjs-native LWW on the lock map; mid-edit lock loss aborts the local edit and surfaces a structured toast.**

### Lock record (per SPEC-03 §4.1)
```ts
type LockRecord = {
  elementId:    ElementId,
  ownerActorId: ActorId,
  acquiredAt:   ISO8601,
  expiresAt:    ISO8601,           // = acquiredAt + TTL
  reason:       'editing' | 'transforming' | 'parametric-edit' | 'ai-batch',
  scope:        'element' | 'element+relations',
};
```
Stored in `Y.Doc.locks: Y.Map<elementId, LockRecord>`.

### Acquire policy
- An L5 tool requests a lock when the user enters an interactive edit (drag handle, modal property edit).
- TTLs:
  - `editing` — 60 s.
  - `transforming` — 30 s (drag/move/rotate; expected to be short).
  - `parametric-edit` — 120 s (modal dialog lifetimes).
  - `ai-batch` — 600 s (long-running AI proposals).
- **Heartbeat:** while the tool is active, it renews the lock every TTL/2 seconds.
- If the lock map already has a non-expired entry for the element, the request is **denied**. The tool surfaces the awareness-based "X is editing this" message. No retries.

### Conflict resolution (sub-millisecond races)
- Two users request the same lock at near-simultaneous time:
  - Yjs CRDT for `Y.Doc.locks` resolves to a deterministic winner (Yjs-native LWW on `Y.Map.set`).
  - Both clients see the same winner after Yjs convergence.
  - The losing client's tool aborts the interaction and shows the awareness-based ownership message.

### Lock expiry mid-edit (the painful case)
Scenario: A locks W, network drops, TTL expires, B locks W, A reconnects.

- A's client checks the lock state every frame while editing (in the tool's `useFrame` callback).
- On detecting expiry-or-ownership-by-another-actor, A's tool **aborts**: pending uncommitted edits (in-progress drag, unblurred modal field) are **discarded**, and a toast surfaces:
  > "You lost the lock on this element. Your unsaved changes were not applied."
- Already-committed edits before the disconnect remain in A's local event log; the translator (per ADR-002) catches the conflict at reconnect and surfaces a structured merge dialog (per SPEC-03 §5).

### Permission gate
- A guest editor cannot acquire a lock on an element of class `Wall.structural`, `Column.loadBearing`, `Beam.loadBearing`. The L2 command handler rejects with `PermissionError` before reaching L3 (per SPEC-08 §3.3, ADR-011).

### AI batches
- An AI plugin proposing a batch acquires the `ai-batch` lock on every affected element.
- If any lock acquisition fails, the entire batch is queued in the approval queue but cannot commit until all locks are acquired (per SPEC-07 §AI-batch flow).
- Batch ownership is per-actor (the human approver of the AI proposal); the AI worker holds locks on the approver's behalf.

### Lock release
- Explicit: tool's `dispose()` releases the lock immediately.
- Implicit: TTL expires; another client can claim.
- Server janitor: a sync-server cron removes lock records whose `expiresAt + 60 s` has passed (defense in depth against client crashes).

### Storage shape
- Live in `Y.Doc.locks` (ephemeral; not persisted to event log).
- Server-side persistence: the sync-server snapshots `Y.Doc.locks` to a `lock_state` table every 30 s for crash recovery.
- Persistence is **not** authoritative; clients on reconnect read the live Y.Doc state.

### OpenTelemetry
- `lock.acquire { elementId, reason, ttlSec, success }`
- `lock.deny    { elementId, ownerActorId, reason }`
- `lock.heartbeat { elementId, ttlRemaining }`
- `lock.release { elementId, releasedBy: 'tool'|'ttl'|'janitor' }`
- `lock.midedit-lost { elementId, lostTo: ActorId, durationMs }`

---

## Consequences

**Positive:**
- Structurally inconsistent races prevented at interactive scale.
- Yjs LWW on the lock map gives deterministic resolution without central coordination.
- AI batches integrate cleanly without bespoke locking.
- Mid-edit lock loss has explicit, predictable UX.

**Negative:**
- Locks add UI complexity ("X is editing this" must be communicated clearly).
- TTL tuning is empirical; default values may need adjustment based on telemetry post-beta.
- Server janitor adds an ops surface; mitigated by it being a single cron.
- Permission failure on lock acquire is one more fail-mode for tools to handle.

---

## Alternatives considered

### Centralised lock service (Postgres advisory lock)
- Rejected: defeats the point of Yjs CRDT (central coordination); high latency on remote regions.

### No locks; rely on CRDT alone
- Rejected: CRDT merges *concurrent commits* but doesn't prevent two users dragging the same handle to wildly different positions; user experience is incoherent.

### Hard locks (no TTL; explicit release)
- Rejected: a user closes the tab mid-edit and the lock stays forever. TTL + heartbeat is the established pattern.

### Pessimistic locks at command level (every command takes a lock)
- Rejected: dramatically reduces concurrency; CRDT resolves command-level concurrency just fine.

### Optimistic concurrency (commit-then-apologize)
- Rejected for interactive edits: mid-drag concurrent edits make for a confusing rollback story.

---

## Phase rollout
- S22 (M12 alpha) — single-user only; no concurrent geometry edits; lock model not exercised in production.
- S43 — `packages/sync/locks.ts` lands; lock API stable.
- S46 — first tools (`wall.move`, `wall.modify-properties`) acquire locks.
- S48 (M24 beta) — all interactive edit tools acquire locks; mid-edit-loss UX live; janitor cron live.
- S55 — AI-batch lock integration live (per SPEC-07).
- S62 — TTL tuning pass based on telemetry.
- S72 (M36 GA) — chaos tests at 50 concurrent users (per `10-MASTER-IMPLEMENTATION-PLAN-36M.md` R-02 mitigation).
