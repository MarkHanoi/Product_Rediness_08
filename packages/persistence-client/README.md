# `@pryzm/persistence-client`

PRYZM 2 persistence client — L0 of the architecture stack (S03–S04).

Provides an **append-only event log** backed by either an in-memory buffer
(tests / SSR) or IndexedDB (browser).  The event log is the single source of
truth for every project state change; stores are rebuilt by replaying events
forward from the log.

## API surface

```ts
import {
  EventLog,
  InMemoryBackend,
  IndexedDbBackend,
  JsonCodec,
  MsgpackCodec,
  attachEventLog,
} from '@pryzm/persistence-client';
```

### `EventLog`

```ts
const log = new EventLog({
  backend: new InMemoryBackend(),
  codec:   new MsgpackCodec(),          // JsonCodec for debug / tests
});

await log.open();

await log.append(myPatchEmitterEvent);            // write
for await (const event of log.replay(0)) { … }   // read from seq 0
await log.checkpoint(seq);                         // prune before seq
await log.close();
```

### Backends

| Backend | Use case |
|---|---|
| `InMemoryBackend` | Tests; SSR; ephemeral sessions |
| `IndexedDbBackend` | Browser persistence — survives reload |

`IndexedDbBackend` uses a **single-writer queue** to prevent IndexedDB
concurrent-write races (S06-T5 hardening).  Every write is serialised
through an async lock; reads are concurrent.

### Codecs

| Codec | Wire format | Notes |
|---|---|---|
| `JsonCodec` | JSON (UTF-8) | Default for development / tests |
| `MsgpackCodec` | MessagePack binary | Production default (ADR-004) |
| `MsgpackAliasedCodec` | MessagePack + field-alias map | Smaller wire size for known field names |

ADR-004 ratifies the MessagePack choice based on S03-T8 codec spike
benchmarks (payload size + parse time vs JSON and CBOR alternatives).

### `attachEventLog`

Convenience helper that wires the `PatchEmitter` → `EventLog.append()`
subscription in one call:

```ts
const handle = attachEventLog({ bus, log });
handle.dispose(); // unsubscribes
```

## Architecture

Replaces `src/core/persistence/ProjectSerializer.ts` (857 LOC JSON monolith
with 26+ store imports).  The event log pattern separates *write* (append)
from *read* (replay), enabling incremental checkpoint + prune without
understanding element schemas.

Event versioning: each event carries `version: number`.  Forward-compat
replay (replay v1 events on a v2 reader) tested at S04 D7.

See `docs/04-reference/architecture-detail/persistence.md` for the full design brief.

## Sprint citations

| Sprint | Sub-phase | Deliverable |
|---|---|---|
| S03 | T6 | `EventLog` interface + pluggable `Backend` + `InMemoryBackend` |
| S03 | T7 | Codec abstraction design; `JsonCodec` shipped |
| S03 | T8 | `@msgpack/msgpack` codec spike + ADR-004 bench numbers |
| S03 | T9 | `IndexedDbBackend` sketch |
| S04 | T1 | `MsgpackCodec` + `MsgpackAliasedCodec` implementations |
| S04 | T3 | `attachEventLog` bus wiring; `IndexedDbBackend` complete |
| S04 | T5 | Forward-compat replay test (v1 events on v2 reader) |
| S06 | T5 | Persistence stress hardening — 10 K events replay < 2 s |
