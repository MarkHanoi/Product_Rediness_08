# @pryzm/sync-client

PRYZM 2 client-side sync skeleton — S43 D1-D2 implementation companion to **strategic ADR-002**.

## Status

**S43 D1-D2 skeleton.** The package ships:

- `SyncClient` — Y.Doc + injectable provider + reconnect + status surface.
- `EventBridge` — the Immer ⇄ Y.Doc translator. Forward direction (local commit → `Y.Map.set(eventId, payload)`) and reverse direction (`Y.Map.observe → CommandBus.applyPatchOnly`) wired with the non-broadcast invariant.
- `PryzmAwareness` — type-only skeleton with the wire shape frozen for S45 soft-locks consumption.
- OTel spans `pryzm.sync-client.{commit,inbound,reconnect}`.
- Round-trip identity CI gate per strategic ADR-002.

What does NOT ship in S43 D1-D2:

- The default `y-websocket` provider wiring — `defaultProviderFactory` throws with a clear error message until that work lands at the transport task. Tests + S43 D1 wiring inject their own factory.
- Multi-user cursor renderer (S44).
- Soft-lock runtime (S45 — only the `heldLocks` field on `PryzmAwarenessState` is frozen here).
- Server-side Y.Doc cache (S46).

## Architecture

See **`docs/architecture/adr/0033-sync-client-event-bridge.md`** for the design decision and **`docs/03_PRYZM3/reference/adrs/ADR-002-crdt-event-log-bridge.md`** for the strategic context.

The two byte streams:

| Stream | Wire format | Purpose | Source of truth |
|---|---|---|---|
| Event log | JSON over WS (S22 path) | Durable, replayable, auditable | YES |
| Y.Doc updates | Yjs binary over WS (S43 path) | Real-time CRDT broadcast | NO (best-effort transport) |

EventBridge is the only code that sits between them.

## API

```typescript
import { SyncClient } from '@pryzm/sync-client';

const client = new SyncClient({
  projectId: 'PRJ-01J7…',
  url: 'wss://sync.pryzm.com/projects/PRJ-01J7…',
  authToken: jwt,
  commandBus,                                  // your @pryzm/command-bus instance
  eventLog,                                    // your @pryzm/persistence-client EventLog
  providerFactory: (args) => new WebsocketProvider(/* … */),  // production wiring at S43 D1
});

client.onStatusChanged((status) => updateOfflineIndicator(status));
client.connect();
```

## Tests

| Test | Asserts |
|---|---|
| `SyncClient.test.ts` | Status surface, lifecycle, listener disposal |
| `event-bridge.test.ts` | Forward direction, reverse direction, dedup, **non-broadcast invariant** |
| `event-bridge-roundtrip.test.ts` | **Strategic ADR-002 CI gate**: `Y.encodeStateAsUpdate(toYjs(toEvent(update))) ≡ Y.encodeStateAsUpdate(originalDoc)` |
| `awareness.test.ts` | Wire shape stability + state set/get |

## Chaos test fixture

The convergence harness (S43 D5-D6) lives at `apps/sync-server/__tests__/Chaos.test.ts`. It exercises the existing JSON path with N concurrent virtual clients; when the Yjs transport lands, the same suite is **promoted** to also assert Y.Doc convergence. The fixture is what arms kill-switch **K2D-A** (spec line 802).
