# Developer onboarding — the two persistence formats & the sync systems

> **Stamp**: 2026-07-16 · **Status**: LIVING · **Audience**: new engineers
> **Why this doc exists**: PRYZM has **two persistence formats** and **three sync code-paths** that are easy to conflate. This has caused real confusion (and bugs). Read this before you touch `save`/`load`, collaboration, or the `.pryzm` format, so you don't re-introduce the conflation. Filed as L-351 (the Guide-layer gap from the readiness audit).

---

## 1 — Persistence: TWO formats, TWO different jobs

They are **not competitors and not versions of each other.** Each is canonical *on its own axis* (see [ADR-0130](../../02-decisions/adrs/ADR-0130-canonical-persistence-format.md), PROPOSED).

| | **Live JSON `ProjectSnapshot`** | **`.pryzm` envelope** |
|---|---|---|
| Role | Canonical **live persisted state** — the source of truth for a project as it's being worked on | Canonical **portable export / archive** — interchange, sharing, durable customer archive |
| Where | Server version rows + browser IndexedDB (`VersionRepository`) | A file the user exports / imports |
| Written by | `save` / autosave (every ~2.5 s) / version-history | The export action only |
| Schema marker | `SNAPSHOT_SCHEMA_VERSION = 5` (`ProjectSerializer.ts`, `SnapshotConstants.ts`) | its own `schemaVersion` (v1) |
| Round-trip test | **not yet** (the gap that let L-334 silent-loss hide) | **yes** — the only format with a byte-equal round-trip test |

**The mental model:** a project's live truth is the JSON snapshot. A `.pryzm` is a *serialization of that snapshot (+ assets)* for portability — never a second, parallel live store. When you touch save/load, you are almost always touching the **JSON snapshot** path; `.pryzm` only comes up for export/import.

> ⚠️ Governance caveat: the contracts historically gave three contradictory definitions of what `.pryzm` contains (C05 §2.1 vs `pryzm-binary.md` vs C47 §2.3). [ADR-0130](../../02-decisions/adrs/ADR-0130-canonical-persistence-format.md) proposes the single answer above and is pending ratification + a code check on the real on-disk `.pryzm` structure. If you're doing format work, read that ADR first.

Related: L-334 (load-time integrity/quarantine/checksum — shipped), C05, C47.

---

## 2 — Collaboration: THREE code-paths, only ONE runs in prod

This is the bigger trap. There are **three** sync systems in the tree; **only (B) is live today.**

### (A) The Yjs CRDT — `packages/sync-client` — WRITTEN, unit-tested, but was DEAD-WIRED
`YjsDocAdapter`, `SyncClient`, `CRDTConflictResolver`. This is the *intended* conflict-safe future (C08 §3.1/§3.3, P8: silent LWW forbidden). Historically it had **no transport in prod** — `SyncClient`'s provider factory threw. Do NOT assume "we have Yjs, so we're conflict-safe" — until Fix 2 Phase 3 lands, this path does not carry live edits.
- **Foundation now shipped** (L-335 Path-a, founder-chosen): Phase 1 = `InProcessSyncTransport` + a proven CRDT-convergence test; Phase 2 = `CommandBus.onCommitted` / `applyPatchOnly` (the hook the CRDT broadcast will route through; mechanically closes L-206). Both are **additive foundation — they change nothing in prod yet.**

### (B) The JSON command-rebroadcast — `initCollaboration.ts` ↔ `server.js` — THIS IS WHAT RUNS IN PROD
`command-executed` → `remote-command` JSON rebroadcast, no merge / version-vector / conflict field. Consequences you must know:
- Concurrent moves + property-edits = **silent last-writer-wins** (L-53). A contract violation (C08 forbids it); the fix is Fix 2, not a patch here.
- Bus-dispatched creates (drag-drop / plan tools / AI furnish) were **never broadcast** (L-206) — Phase 2's `onCommitted` is the mechanism that closes this once Phase 3 wires it.

### (C) `apps/sync-server` — a real JSON event-log relay — NOT deployed, NOT the prod path
Functional authz + gap-free linearised `EventLog` (+ `PgEventLog`) + reconnect catch-up + soft-locks + presence. It also contains `YjsProjectCache` (a server-side Yjs merge cache) — but that is **dead-wired** (no WS path calls it). Don't confuse "there's a sync-server app" with "collaboration runs through it." It doesn't, today.

### Where it's going (so you build in the right direction)
Fix 2 **Path (a)** (founder-chosen) makes the **real Yjs CRDT the live path**: transport = **option (ii)** — tunnel Yjs binary frames over the *existing authenticated socket.io channel* (reusing `canUserAccessProject` + the project room + `YjsProjectCache`), route **all** mutations through the doc, and **retire the JSON/LWW rebroadcast**. Phases 1–2 (foundation) are shipped; **Phase 3 (prod wiring) is gated on founder go.** If you're adding a mutation path, make it flow through the CommandBus (so `onCommitted` sees it) — don't add a new one-off broadcast.

Related: L-335 (the re-platform), L-53 (silent LWW), L-206 (bus-creates), C08, ADR-0249 (Y.Doc-per-level).

---

## 3 — The one-paragraph version (put this on your wall)

> **Persistence:** the JSON `ProjectSnapshot` (v5) is the live truth; `.pryzm` is its portable export. **Collaboration:** prod runs a JSON rebroadcast that does silent last-writer-wins (B); the Yjs CRDT (A) is the conflict-safe future whose foundation is shipped but not yet the live path; `apps/sync-server` (C) is a real relay that isn't deployed. When you add a mutation, route it through the CommandBus. When in doubt, grep the L-item (L-334 persistence, L-335 sync) and read the linked ADR before you change behavior.

---

_See also: [C05 Persistence](../../02-decisions/contracts/C05-PERSISTENCE-AND-FILE-FORMAT.md) · [C08 Collaboration](../../02-decisions/contracts/C08-COLLABORATION-AND-SECURITY.md) · [ADR-0130](../../02-decisions/adrs/ADR-0130-canonical-persistence-format.md) · the V1 audit L-334/L-335/L-53/L-206._
