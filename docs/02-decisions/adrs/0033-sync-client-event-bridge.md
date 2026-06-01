# ADR-0033 — Sync-client + Immer ⇄ Y.Doc event bridge

- **Status**: Accepted (S43 implementation companion to strategic ADR-002)
- **Date**: 2026-04-28
- **Phase**: 2D — `Q4 — M22-M24 SYNC, AWARENESS, BETA`, sprint **S43**
- **Spec source**: `docs/03-execution/plans/legacy/phases/PHASE-2/2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md`
  §S43 lines 91-269 (D1-D2 = SyncClient + EventBridge; D5-D6 = chaos harness)
- **Implementation**: `packages/sync-client/`
- **Bench gate**: `apps/bench/src/benches/sync-roundtrip.bench.ts` (extended in S43 D6 with the chaos-convergence assertion)
- **Related ADRs**: `[strategic ADR-002]` (CRDT ↔ event-log bridge — accepted 2026-04-27, this ADR is its sprint-scoped implementation companion); `[strategic ADR-019]` (soft-lock semantics, S45); code-level `0019-sync-server-linearisation.md` (S22 server contract, this ADR consumes it); `[strategic ADR-010]` (bake debounce, 250 ms — pinned on the server side, this ADR does NOT touch); `[strategic ADR-018]` (capacity cuts T1.7/T1.8)

## 1. Context

`[strategic ADR-002]` defines the **two byte streams** architecture: PRYZM events (MessagePack + ULID, source of truth, used for L0 persistence + undo log + audit trail + public API + `.pryzm` file format) and Yjs updates (Yjs-native binary, in-memory wire format on the network between collaborating clients). The translator is the only code that converts between them.

ADR-002 was accepted 2026-04-27 as a strategic decision; its phased rollout (lines 90-94) explicitly assigns:
- **S05** — translator skeleton (event → Yjs, one direction)
- **S22** — round-trip identity test passes; LWW behaviour preserved
- **S43** — full bidirectional translator; soft locks live
- **S48** — Yjs CRDT replaces LWW everywhere

S22 shipped (`apps/sync-server/`) with the LWW behaviour preserved per code-level `0019-sync-server-linearisation.md`. S22 does NOT ship the translator — the spec deferred it to S43 because the chunk-streaming model (ADR-018) and the JSON-over-WebSocket protocol (ADR-019 §2.1) were the risk-reducing primitives that needed to land first.

This ADR is the **sprint-scoped implementation companion** to strategic ADR-002 for S43. It scopes:
1. The package layout (`packages/sync-client/`).
2. The translator's exact contract (event ⇄ Y.Doc.Map operations, keyed by event-ID).
3. The non-broadcast `applyPatchOnly` primitive that prevents network loops.
4. The chaos-test harness fixture (S43 D5-D6).
5. The relationship to existing `apps/sync-server/` JSON wire format vs. the new Yjs binary wire format (both ship in S43; ADR-019's JSON path remains the durable transport, the Yjs path is the convergence transport).

## 2. Decision

### 2.1 Package layout

```
packages/sync-client/
├── package.json              # @pryzm/sync-client v0.1.0; deps: yjs, y-websocket, @pryzm/protocol, @pryzm/command-bus
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── src/
│   ├── index.ts              # public surface (re-export SyncClient, EventBridge, PryzmAwareness, types)
│   ├── types.ts              # SyncClientOptions, SyncClientStatus, EventEnvelope
│   ├── SyncClient.ts         # Yjs document setup + WebSocketProvider transport + reconnect
│   ├── event-bridge.ts       # the Immer ⇄ Y.Doc translator (the ADR-002 translator at the client)
│   ├── awareness.ts          # PryzmAwareness wrapper (S44 land; skeleton lit in S43 for the event-bridge to depend on the type)
│   └── tracing.ts            # OTel spans (pryzm.sync-client.{commit,inbound,reconnect})
└── __tests__/
    ├── SyncClient.test.ts            # happy path: instantiate, connect, observe status transitions (no real WS in unit test)
    ├── event-bridge.test.ts          # forward + reverse + dedup + non-broadcast invariant
    ├── event-bridge-roundtrip.test.ts# the strategic ADR-002 round-trip identity assertion (CI gate)
    └── awareness.test.ts             # state-set / state-get; full feature in S44
```

The package is **`private: true`** per the workspace convention; it is consumed by `apps/editor/` and (in S46) by `apps/sync-server/` for the server-side Y.Doc cache.

### 2.2 SyncClient contract

```typescript
// packages/sync-client/src/SyncClient.ts (excerpt; full file ships in S43 D1)

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { CommandBus } from '@pryzm/command-bus';
import type { EventLog, ProjectId, EventId } from './types.js';
import { EventBridge } from './event-bridge.js';

export interface SyncClientOptions {
  readonly projectId: ProjectId;
  readonly url: string;          // wss://sync.pryzm.com/projects/<id>
  readonly authToken: string;
  readonly commandBus: CommandBus;
  readonly eventLog: EventLog;   // durable source of truth (SPEC-03 §3)
  /** Optional: inject a Y.Doc for tests; default = new Y.Doc(). */
  readonly doc?: Y.Doc;
  /** Optional: inject a provider factory for tests; default = WebsocketProvider. */
  readonly providerFactory?: ProviderFactory;
}
```

Key invariants:

- **Y.Map keyed by event-ID**, NOT a Y.Array. Per spec §S43 line 149, "events carry their own monotonic IDs from the durable log; we use the map keyed by event-ID so out-of-order delivery is convergent without ordering tricks. Per `[ADR 0019-sync-server-linearisation]` the server linearises at the log layer, not the Yjs layer." The map-not-array choice is the single most important detail: it allows late-arriving events to be inserted without re-keying anything.
- **Yjs replay is best-effort**, the durable log is authoritative. On reconnect after offline, the client pulls missing events from the durable log via the existing S22 `events.load` JSON path (`apps/sync-server/src/handlers/LoadEvents.ts`), NOT from Yjs replay. This preserves the S22 contract that "a successful `event.ack` means the event is in the log and every connected peer has been told about it" (ADR-019 §2.4).
- **Status surface**: `'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error'`. The status is observable so the editor can paint offline indicators per `[strategic ADR-019]` UX.

### 2.3 EventBridge contract (the ADR-002 translator at the client)

```typescript
// packages/sync-client/src/event-bridge.ts (excerpt; full file ships in S43 D2)

export class EventBridge {
  constructor(
    private readonly doc: Y.Doc,
    private readonly commandBus: CommandBus,
    private readonly eventLog: EventLog,
  ) {
    // Forward: local command-bus commit → Y.Map.set(eventId, payload)
    commandBus.onCommitted((event) => {
      const events = this.doc.getMap('events');
      events.set(event.id, event.payload);
    });

    // Reverse: inbound Y.Map op → applyPatchOnly (NO re-broadcast)
    this.doc.getMap('events').observe((evt) => {
      for (const key of evt.keysChanged) {
        if (this.eventLog.has(key)) continue;            // dedup against log
        const payload = this.doc.getMap('events').get(key);
        this.eventLog.appendInbound(key, payload);       // log it for durability
        this.commandBus.applyPatchOnly(payload);         // patch stores; do NOT re-broadcast
      }
    });
  }
}
```

Key invariants:

- **`applyPatchOnly` is the critical primitive.** If an inbound Y.Map op triggered another local broadcast we would loop the network. The patch-only path bypasses the broadcast hook on `CommandBus`. Per spec §S43 line 183, this is the single most important method we add to `CommandBus` for S43.
- **Dedup happens in two places**: the `eventLog.has(key)` check (cheap, O(1) Map lookup) + the server-side ULID dedup in `apps/sync-server/src/eventLog/` (defense in depth). The client check prevents spurious patch re-application; the server check prevents log duplication.
- **Round-trip identity (CI gate)** per strategic ADR-002: `toEvent(toYjs(toEvent(yjsUpdate))) === toEvent(yjsUpdate)` and `toYjs(toEvent(yjsUpdate)) merges identically to yjsUpdate`. Asserted by `__tests__/event-bridge-roundtrip.test.ts` as the S43 D6 hard CI gate. The test uses `Y.encodeStateAsUpdate` to capture the binary state and re-merges into a fresh Y.Doc to verify identity.

### 2.4 Wire-format coexistence (JSON + Yjs)

Per ADR-019 the server speaks JSON over WebSocket; per this ADR the client speaks Yjs binary over WebSocket. **Both wire formats coexist in S43**:

| Channel | Wire format | Purpose | Source of truth |
|---|---|---|---|
| `event.append` / `event.push` / `events.load` (existing S22) | JSON over WS | Durable event log linearisation; reconnect catch-up | YES (per ADR-019 §2.1) |
| Y.Doc updates over WS (new S43) | Yjs binary | Real-time CRDT broadcast for in-memory convergence | NO — best-effort transport per ADR-002 §"Storage division" |

The two channels share the same WebSocket connection but are framed independently:
- The editor opens `wss://sync.pryzm.com/projects/<id>?token=<jwt>`. The sync-server's `SessionManager` (`apps/sync-server/src/session/`) already handles the JSON channel. The S43 server-side extension adds a parallel frame type that wraps a `Y.Doc` update; the message dispatcher routes to the existing JSON handler or the new Yjs handler based on the first byte (JSON `'{'` = 0x7B vs MessagePack-framed Yjs binary).
- Client side, `SyncClient` owns the Yjs frame; the existing `@pryzm/runtime` JSON protocol code remains the owner of the JSON frame. They share the WS but never collide because frame types are disjoint.

This explicitly defers the "MessagePack on the wire for the event-log channel" decision (ADR-019 §1 line 60-63 noted MessagePack as a future codec swap). S43 keeps JSON for the event-log channel because the binary cost is in the chunks (ADR-018), not the events.

### 2.5 Chaos test harness (S43 D5-D6)

`packages/sync-client/causal-test/chaos.test.ts` per spec §S43 line 190-208 ships the convergence assertion:

```typescript
it('100 random edits across 4 tabs converge in < 5s', async () => {
  const tabs = await spawnTabs(4, 'chaos-fixture-001.pryzm');
  const generator = new RandomEditGenerator({ seed: 0xC0FFEE });
  for (let i = 0; i < 100; i++) {
    const tab = tabs[i % 4];
    const edit = generator.next();
    await tab.commit(edit);  // no inter-tab wait — purposely concurrent
  }
  const start = performance.now();
  await waitForConvergence(tabs, { timeoutMs: 5_000 });
  expect(performance.now() - start).toBeLessThan(5_000);
  expect(snapshotsEqual(tabs)).toBe(true);
});
```

**Convergence definition**: `snapshotsEqual` deep-compares the in-memory store snapshots of every tab; equality is achieved when every tab has applied every event.

**S43 D5-D6 staging**: the harness lands as a **fixture against the existing sync-server** (no Yjs server-side path yet) at `apps/sync-server/__tests__/Chaos.test.ts`. It exercises the S22 JSON path with N concurrent virtual clients that each append events at a fixed rate, asserting:
1. Every client receives every other client's events (broadcast invariant).
2. All clients agree on the final ordering (linearisation invariant per ADR-019 §2.2).
3. The append-to-broadcast round-trip stays under 250 ms p95 (the existing S22 hard-fail bench gate).

When the Yjs transport lands at S43 D2, the same test suite is **promoted** to also instantiate `SyncClient` and assert Y.Doc convergence — the JSON-only assertions remain green throughout. The fixture in S43 D5-D6 is the safety net that lets us add the Yjs path without breaking the JSON path.

The kill-switch K2D-A (spec line 802) fires if the chaos test fails to converge after 100 random edits in < 5 s at end of S43; this harness is what arms K2D-A.

### 2.6 Soft-lock integration (S45 hand-off)

S43 ships `awareness.ts` as a **type-only skeleton** so that `event-bridge.ts` can take a stable type-side dependency on `PryzmAwarenessState.heldLocks`. The full feature lands at S45 per `[strategic ADR-019]` (TTL 30 s, server-side lease tracking in Postgres `soft_locks` table). The S43 skeleton ensures the wire shape is frozen before S45 begins; this is the same pattern `view-sync.ts` followed in the post-2B closeout per ADR-0030 §2.4.

## 3. Alternatives considered

### 3.1 Translator on the server, not the client

Rejected. Strategic ADR-002 §"Decision" places the translator at L3 (the sync layer); we put it on the client because:
- The server is intentionally thin per ADR-019 (one Node process holds the session map and the in-memory event log; multi-instance scale-out at S46 via Redis Pub/Sub).
- The client is where the `CommandBus` lives, and the translator needs to call `commandBus.applyPatchOnly`. Putting the translator on the server would force a round-trip per inbound event.
- The server-side Y.Doc cache (per ADR-002 §"Mitigation for the load cost") is a separate, S46-scoped piece of code that uses the same translator package as a library.

### 3.2 Yjs Y.Array instead of Y.Map

Rejected. A Y.Array would force a global ordering at the Yjs layer, duplicating the linearisation that the server already does at the event-log layer (ADR-019 §2.2). Worse, late-arriving events would reorder existing entries, making the in-memory snapshot churn unnecessarily. Y.Map keyed by event-ID is convergent without ordering tricks per spec line 149.

### 3.3 Replace JSON wire with Yjs binary entirely

Rejected for S43. Coexistence (§2.4) is the right shape because:
- The JSON path is the durable transport (ADR-019 §2.4 contract).
- Replacing it would force a server-side rewrite of `apps/sync-server/src/eventLog/` to log binary frames, breaking the operator-debuggability that JSON gives us (ADR-019 §1 line 62).
- The Yjs binary frame is the **convergence** transport, not the **durable** transport. Conflating them would re-introduce the very thing strategic ADR-002 §"Decision" rejected.

The MessagePack-on-event-log-channel swap (ADR-019 line 60-63) is still on the table for a future sprint when bandwidth becomes the bottleneck; it does not need to ship in S43.

### 3.4 Awareness as a separate channel from soft locks

Rejected per strategic ADR-019. The lock holder is broadcast as awareness state, not as a separate channel. This avoids two-channel sync issues (e.g., lock granted in channel A but awareness still says "free" in channel B for one frame).

## 4. Consequences

### 4.1 Positive

- **Strategic ADR-002 has a sprint-scoped implementation companion** — the previous gap (no code-level ADR for S43) is closed.
- **Wire-format coexistence preserves ADR-019 contracts** — the durable JSON channel remains operator-debuggable; the Yjs channel is added without disturbing it.
- **Chaos-test fixture exists today** — even without the Yjs path, the JSON-only convergence assertions arm K2D-A. When Yjs lands the same suite is promoted, not rewritten.
- **`applyPatchOnly` is the single primitive the CommandBus must add** — the rest of S43 D2 is wiring.
- **Y.Map keyed by event-ID is convergent without server linearisation duplication** — the Yjs layer adds zero coordination overhead beyond what the server already does.

### 4.2 Negative

- **Two wire formats on one socket** — debug tooling needs to recognise both. Mitigated by the disjoint first-byte rule (§2.4) and by the JSON path remaining the operator-facing one.
- **Translator complexity is non-trivial** (~800 LOC estimate per strategic ADR-002 §"Negative"). Mitigated by S05 having shipped the one-direction skeleton; S43 D2 adds the reverse direction + dedup + the non-broadcast primitive.
- **Initial-load cost** — replaying all events into Y.Doc on project open. Mitigated by ADR-002 §"Mitigation for the load cost" (compaction at SPEC-02 §3 + server-side Y.Doc cache at S46).
- **`packages/sync-client/awareness.ts` ships type-only in S43** — the editor that wants to bind to `PryzmAwarenessState.heldLocks` must wait until S45 for the runtime. Mitigated by the type stability contract documented in `awareness.ts` JSDoc.

### 4.3 Mitigations

- **`applyPatchOnly` regression risk** — if a future contributor refactors `CommandBus` and accidentally re-broadcasts on the patch path, the network loops. Mitigated by `__tests__/event-bridge.test.ts` asserting `mockCommandBus.broadcast` is called exactly once per local commit and zero times per inbound observation. The test is the contract.
- **Round-trip identity drift** — the CI gate must run on every PR per strategic ADR-002. Mitigated by `__tests__/event-bridge-roundtrip.test.ts` being part of the S43 D6 vitest suite.
- **Chaos test flakiness on slow CI** — convergence timeout is 5 s; if CI is slow the test could flap. Mitigated by the seeded RNG + the `timeoutMs` knob; if flake rate > 1 % we tune the timeout via the same `apps/bench/baseline.json` mechanism the S22 sync-roundtrip bench uses.

## 5. Verification

| Concern | Where it's tested |
|---|---|
| Y.Doc + WebsocketProvider lifecycle | `packages/sync-client/__tests__/SyncClient.test.ts` |
| Forward direction (commit → Y.Map.set) | `packages/sync-client/__tests__/event-bridge.test.ts` |
| Reverse direction (Y.Map.observe → applyPatchOnly) | `packages/sync-client/__tests__/event-bridge.test.ts` |
| Dedup against `eventLog.has` | `packages/sync-client/__tests__/event-bridge.test.ts` |
| Non-broadcast invariant (no network loop) | `packages/sync-client/__tests__/event-bridge.test.ts` |
| Round-trip identity (strategic ADR-002 CI gate) | `packages/sync-client/__tests__/event-bridge-roundtrip.test.ts` |
| Chaos: 100 random edits across 4 clients converge in < 5 s | `apps/sync-server/__tests__/Chaos.test.ts` (JSON path; S43 D5-D6) → promoted in S43 D6 to also assert Y.Doc convergence |
| Latency budget < 250 ms p95 | `apps/bench/src/benches/sync-roundtrip.bench.ts` (existing S22 gate; extended in S43 D6 with chaos-mode bench) |
| Awareness type stability | `packages/sync-client/__tests__/awareness.test.ts` |

The S43 exit criteria (spec line 263-268) map to these tests as follows:
- "Two tabs converge after 100 random edits in < 5 s" → `Chaos.test.ts`
- "Sync latency < 250 ms p95 for single-edit propagation across two tabs" → `sync-roundtrip.bench.ts`
- "Chaos-test invariants assert in CI" → both of the above
- "Supabase is primary write path; Replit-PG dual-write continues until S45 D5" → out of scope for this ADR (per ADR-031 CDE-storage-topology + SPEC-27 §3)
- "`authz.can` enforced on every gateway route; audit log has zero unprotected handlers" → out of scope for this ADR (per ADR-028 Part F)
- "`pnpm spec:audit-storage` green" → out of scope for this ADR

## 6. Open questions deferred to future sprints

- **S43 D7** — `authz.can` rollout to every gateway route (per ADR-028 Part F); this ADR explicitly does NOT cover routing/authorization.
- **S44** — full `PryzmAwareness` runtime (cursor / view / tool / selection / heldLocks) per spec §S44.
- **S45** — soft-lock semantics with TTL 30 s per `[strategic ADR-019]`; the wire shape (`heldLocks: ElementId[]`) is frozen here.
- **S46** — server-side Y.Doc cache (hot-project resident); Redis Pub/Sub for cross-instance fan-out; multi-view-sync production hardening per `PHASE-2B-AUDIT-2026-04-28.md` §6.
- **S48** — Yjs CRDT replaces LWW everywhere per strategic ADR-002 §"Phase rollout"; this ADR does NOT remove LWW yet, it adds Yjs alongside.
- **`packages/sync/`** — strategic ADR-002 references `packages/sync/src/translator.ts` as the canonical translator location. We chose `packages/sync-client/src/event-bridge.ts` instead because the translator is client-side (§3.1 above) and the server-side cache is S46. If the S46 work needs a shared library, we will extract `packages/sync-translator/` then; both names honour ADR-002.

---

*Authors: Engineering main-track. Review: Architecture lead. Companion docs: strategic ADR-002 (the architectural decision), code-level 0019-sync-server-linearisation.md (the S22 server contract this ADR consumes), `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S43 (the spec).*
