# L0 persistence-client — S04 implementation

> Status: shipped at S04. Companion to `persistence-design.md` (S03
> design ratification) and ADR-004 (codec choice + byte budget).
>
> Owner package: `packages/persistence-client/`.
>
> Source spec: `docs/03_PRYZM3/reference/phases/PHASE-1/1A-Q1-M1-M3-SKELETON-RAILS.md` §S04 Track A (lines 419-441).

## What S04 added

S03 shipped the `EventLog` skeleton — single-writer queue, append +
replay + checkpoint, JSON + first-cut MessagePack codec, in-memory and
fake-IDB backends. **S04 turned the skeleton into something the rest of
the stack can plug into.** Three things landed:

1. **`attachEventLog(emitter, log)`** — the bus → log glue that was
   previously hand-rolled in tests now lives in the package.
2. **`MsgpackAliasedCodec`** (codec name `msgpack-v2`) — closes the
   ADR-004 byte budget at **194.55 B/event** (target < 200) on the
   canonical `wall.create` fixture.
3. **OTel `pryzm.persistence.append` span** + per-event-size CI report.

The wire-format version bumped **1 → 2**:

```ts
// packages/persistence-client/src/types.ts
export const PERSISTED_EVENT_VERSION = 2;
```

## Public API at S04

```ts
import {
  EventLog,
  InMemoryBackend,
  IndexedDbBackend,
  JsonCodec,
  MsgpackCodec,           // legacy v1 — kept for compatibility & A/B
  MsgpackAliasedCodec,    // v2, ADR-004 byte-budget closure (default)
  attachEventLog,         // bus → log glue
  type Backend,
  type Codec,
  type PersistedEvent,
} from '@pryzm/persistence-client';

import { CommandBus } from '@pryzm/command-bus';

const bus = new CommandBus({ /* … */ });
const log = new EventLog(
  new IndexedDbBackend({ projectId: 'p-7' }),
  { codec: new MsgpackAliasedCodec() },
);

const detach = attachEventLog(bus.patches, log, {
  onError: (err, record) => console.error('persist failed', record.commandId, err),
});

// Every executeCommand(...) now persists durably before the next tick.
// Cold-load: replay in seq order.
for await (const ev of log.replay(0)) { /* re-apply to stores */ }

// On project close:
detach();
await log.close();
```

## `attachEventLog(emitter, log, opts?)`

```ts
function attachEventLog(
  emitter: PatchEmitter,
  log: EventLog,
  opts?: { onError?: (err: unknown, record: EventRecord) => void },
): () => void;
```

- Subscribes the supplied `EventLog` to every record produced by the
  bus's `PatchEmitter`.
- Each record is appended in arrival order. The L2 emitter is already
  serialised on the bus's single-writer queue, so attach inherits the
  causal order.
- Backend errors do NOT propagate to the bus (the command has already
  succeeded by the time the patch fires). They surface via `opts.onError`,
  which lets the app decide how loudly to fail (toast vs hard-stop).
- Returns a `detach()` cleanup. Calling it removes the subscription and
  drains in-flight appends; the log itself is not closed.
- Test coverage: `packages/persistence-client/__tests__/attach-to-bus.test.ts`
  (4 tests including bus-error propagation, monotonic seq, and detach
  draining).

## `MsgpackAliasedCodec` — closing the byte budget

ADR-004 owed the < 200 B/event target for `wall.create`-class commands.
S04 ships `MsgpackAliasedCodec` (codec name on the wire: `msgpack-v2`)
with **five orthogonal optimisations**, each justified inline in
`packages/persistence-client/src/codecs/MsgpackAliasedCodec.ts`:

| Optimisation | Source field | Encoded form | Saving (per event) |
|---|---|---|---|
| Field aliasing | `commandId`, `commandType`, `forwardPatches`, `inversePatches`, `affectedStores`, `persistedAt`, `seq` | single-char keys | ~40% of envelope |
| Drop `payload` from wire | recomputed from `forward` patches on decode | (omitted) | full payload size |
| Drop `affectedStores` from wire | derivable from patch root paths | (omitted) | array overhead |
| Drop `inverse` from wire when mirror of `forward` | absence of `i` key signals "mirror" | (omitted when symmetric) | 100% of inverse half |
| `op` enum (`'add'=1`, `'remove'=2`, `'replace'=3`) | per-patch `op` string | `int8` | 4–6 B per patch |
| ULID base-256 packing | `commandId` (26-char Crockford) | 16-byte raw | 10 B per event |
| Epoch-ms timestamps | `persistedAt` (ISO-8601) | `int64` | 17 B per event |

### Measured at S04

```
[bench] codec-spike bytes/event — json=762.68 msgpack-v1=643.4 msgpack-v2=194.55 (target < 200 — v2 closure).
```

CI artefact: `apps/bench/.run-output/persistence.event-size.json`
(written by `save-edit.bench.ts`, contains avg + p95 bytes per event
across all three codecs).

### Compatibility

- `PERSISTED_EVENT_VERSION` is now `2`. The decoder branch on
  `PersistedEvent.version`; v1 records (the few that may exist in
  development databases) decode through `MsgpackCodec` unchanged.
- The codec is selected by the `EventLog` constructor; nothing in the
  L0 backend or L2 emitter knows about the alias map. Future codec
  iterations are still a one-file change (per ADR-004).

## OTel `pryzm.persistence.append`

`EventLog.append()` is wrapped in `withSpan('pryzm.persistence.append', …)`
via a no-op tracer that lights up when a real `TracerProvider` is
registered. The span attributes are:

| Attribute | Value |
|---|---|
| `pryzm.persistence.command_id` | the source `EventRecord.commandId` (ULID) |
| `pryzm.persistence.command_type` | the registered command type string |
| `pryzm.persistence.codec` | `'json'` \| `'msgpack'` \| `'msgpack-v2'` |
| `pryzm.persistence.bytes` | encoded byte count |
| `pryzm.persistence.seq` | the assigned monotonic seq (set on success) |
| `pryzm.persistence.backend` | `'memory'` \| `'idb'` |

Sibling span names — `pryzm.command.execute` (L2) and
`pryzm.scene.commit` (L5, S04 Track B) — make a single-trace
"who-did-what-took-how-long" view possible across the visible→
persisted→committed pipeline.

The L0 module imports `@opentelemetry/api` directly; it does NOT
depend on `@pryzm/command-bus` for the tracer helper (keeps L0 free of
L2 imports per ADR-002).

## Bench gates (S04-T4)

Two bench files cover the persistence path:

- **`apps/bench/src/benches/save-edit.bench.ts`**
  - `persistence.save-edit.append.memory` — single-event append p95.
  - `persistence.save-edit.append.idb` — same but through `fake-indexeddb`.
  - **Hard-fail** at p95 ≥ 12 ms (per spec line 432 — "p95 < 10 ms;
    bench hard-fails at 12").
  - Per-event-size report — emits `persistence.event-size.json` with
    bytes/event for json, msgpack-v1, msgpack-v2 (CI artefact).
- **`apps/bench/src/benches/codec-spike.bench.ts`** — extended to
  exercise the v2 codec encode/decode at the same 1K-event sample size
  used by the S03 spike (numbers in ADR-004).

## Causal-ordering tests (S04-T5)

`packages/persistence-client/__tests__/causal-order-and-volume.test.ts`:

- Same-millisecond timestamps replayed in `seq` order (the
  `Date.now()` resolution is not enough to break ties — `seq` is the
  authoritative ordering key).
- 10K-event append + replay — no gaps, no duplicates, the in-memory
  and IDB backends agree byte-for-byte at every checkpoint.

## Files of interest

```
packages/persistence-client/
  src/
    EventLog.ts              ← S03; serialised writer + append + replay
    attachEventLog.ts        ← S04 NEW; bus → log glue
    otel.ts                  ← S04 NEW; pryzm.persistence.append helper
    types.ts                 ← bumped PERSISTED_EVENT_VERSION 1 → 2
    codecs/
      JsonCodec.ts           ← S03; debug-only
      MsgpackCodec.ts        ← S03; v1, kept for compat
      MsgpackAliasedCodec.ts ← S04 NEW; v2 byte-budget closure
    backends/
      InMemoryBackend.ts     ← S03
      IndexedDbBackend.ts    ← S03
  __tests__/
    attach-to-bus.test.ts            ← S04 NEW (4 tests)
    msgpack-aliased-codec.test.ts    ← S04 NEW (13 tests)
    causal-order-and-volume.test.ts  ← S04 NEW (4 tests inc. 10K)
```

## What's next (S05 hand-off)

- L1 stores layer reads from `replay()` on cold-load and re-applies
  patches to seed the store snapshots.
- L3 sync engine (`packages/sync/`) is the second consumer of the
  log: `replay(checkpoint)` for the upload tail; `checkpoint(seq)`
  to advance after server ack; GC of `seq <= checkpoint` ranges.
- `pryzm.persistence.append` joins `pryzm.command.execute` and
  `pryzm.scene.commit` in the editor OTel exporter (S05).
