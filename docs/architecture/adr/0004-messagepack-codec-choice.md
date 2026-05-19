# ADR-004 — MessagePack codec choice for the persistence wire format

| Field | Value |
|---|---|
| Status | **Accepted** (S03 D4 spike, ratified S03 exit; **byte-budget closed at S04** — see §6) |
| Decision owner | F (sign-off) |
| Drafters | Agent A (Track A) |
| Affects layers | L0 (persistence-client), L2 (PatchEmitter), L3 (sync) |
| Supersedes | — |
| Related | `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md §S03-T8` (line 376), `§S03 exit criteria` (line 414), `§S04 Track A` (line 419); ADR-002 (PatchEmitter envelope shape) |

---

## 1. Context

`PatchEmitter` (S02) and `EventLog` (S03) both need a binary wire format
for `EventRecord` / `PersistedEvent`. S02 shipped JSON as the placeholder
("**S02 ships JSON-only; codec swap is a single-file change later**" —
spec line 296) so the L0/L2/L3 surfaces could solidify without coupling
to a codec library. S03 owes the codec choice (spec line 376):

> Encode 1K sample events with `@msgpack/msgpack`, `msgpack-lite`,
> `notepack.io`. Measure: bytes-per-event avg, encoding speed, decoding
> speed, bundle size of the codec. Output to ADR-004 draft. **Target:
> avg < 200 bytes per command event.**

The decision must satisfy:

1. **Wire size** — directly drives upload bandwidth on the L3 sync path
   and IDB write cost on L0; the spec's < 200 B/event target is the
   forcing function.
2. **Encode/decode latency** — the L2 hot path runs the codec on every
   `executeCommand`; the cost must not show up in the
   `command-bus.execute.move-cube` < 1 ms p95 budget (S02 exit).
3. **Bundle size** — the codec ships in every browser entry chunk, so
   it counts against the S06 bundle budget.
4. **TypeScript ergonomics** — the codec must round-trip a typed
   `PersistedEvent` without custom replacers (matches the JSON baseline).
5. **Maintenance posture** — actively maintained library with a
   non-trivial install base.

## 2. Decision

The wire format is **MessagePack via `@msgpack/msgpack`** (the reference
implementation). The S03 ship retains JSON in `JsonCodec` as the
debugging baseline (no envelope-shape lock-in).

The codec is pluggable behind the `Codec` interface in
`packages/persistence-client/src/types.ts`; swapping to a different
MessagePack implementation is a one-file change.

### S03-T8 spike numbers (1K `wall.create` events, headless Node 20 CI)

```
[bench] codec-spike bytes/event — json=762.68 msgpack=643.4
[bench] persistence.codec-spike (S03-T8) > encode-1k-batch — msgpack 466 ms
[bench] persistence.codec-spike (S03-T8) > decode-1k-batch — msgpack 499 ms
```

Source: `apps/bench/.run-output/codec-spike-bytes.json` and the four
`persistence.codec-spike.{encode,decode}.{json,msgpack}.json` per-sample
files. Reproduce with `npm run bench --workspace=@pryzm/bench`.

| Codec   | Bytes/event | Ratio vs JSON | Encode 1K | Decode 1K | Bundle (min, ~) |
|---------|------------:|--------------:|----------:|----------:|----------------:|
| JSON    |      762.68 |          1.00 | (baseline)| (baseline)|         0 (built-in) |
| MsgPack |      643.40 |          0.84 |    466 ms |    499 ms |          ~28 KB |

### Why `@msgpack/msgpack` over the alternatives

- `msgpack-lite` — last published 2018; no maintenance pulse; spec
  drift on `bigint` and binary types.
- `notepack.io` — small (~9 KB), but missing typed-array round-trip
  (we will need this for S20 `.pryzm` v1 binary geometry blobs).
- `@msgpack/msgpack` — strict MessagePack-spec compliance, well-typed,
  active maintenance, ~28 KB minified gzipped to ~9 KB, no native
  dependency. Wins on every axis except raw bundle size, where the gap
  to `notepack.io` is recovered by bundle-splitting (the codec is only
  loaded on the persistence path, not the eager startup path).

### Why we accept being above the < 200 B/event target at S03

The S03 spike measured the **un-optimised envelope shape** — full
JSON-Patch path arrays inside `PatchSnapshotEntry`, ISO-8601 timestamp
strings, ULID strings spelled out as 26-char Crockford-base32. That is
the right shape for L2 to emit (debuggable, JSON-compatible) but the
wrong shape for the L3 wire. **S04 is owed the byte-budget closure**
via four orthogonal optimisations, scoped by `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md §S04`:

- **Field aliasing** — replace the long property names (`commandId`,
  `forwardPatches`, `inversePatches`, `affectedStores`, `persistedAt`)
  with single-character keys at encode time; `Codec` owns the
  alias map. Estimated saving: ~40% of envelope overhead per event.
- **Forward/inverse patch dedup** — many handler patches are mirror
  pairs (`{op:'replace', path, value}` ↔ `{op:'replace', path,
  value:prev}`); store the path once and the value-pair as a tuple.
- **Epoch-ms timestamps** — replace ISO-8601 with `number` (8 B vs 25 B).
- **ULID base-64 packing** — the Crockford-base32 ULID compresses to
  16 bytes raw; the existing string form is 26 bytes.

Aggregate target after S04: < 200 B/event for `wall.create`-class
commands (matches spec line 376).

### Wire-format version

`PERSISTED_EVENT_VERSION` (in `packages/persistence-client/src/types.ts`)
is the L0/L2 contract for codec evolution. ADR-004 sets it to `1`
(JSON + msgpack with the un-aliased envelope). S04 bumps to `2` once
the alias-map ships; the migration path is documented inline at the
bump point.

## 3. Consequences

### Good

- The codec swap is visibly a one-file change: `JsonCodec` → `MsgpackCodec`
  in the L0 backends and the L2 `PatchEmitter` (the latter still ships
  JSON until S04 alias-map work — keeps S03 deployable).
- Every byte saved by the S04 optimisations is observable in the
  existing `apps/bench/.run-output/codec-spike-bytes.json` report;
  CI runs the spike on every PR.
- `PersistedEvent` round-trips without custom replacers — the
  `Codec` interface (`encode(event) → bytes`, `decode(bytes) →
  PersistedEvent`) is symmetric and uses MessagePack's native typed
  support for the future S20 binary blobs.

### Bad

- Wire format is not human-readable; OTel attributes carry the
  semantic fields so traces remain greppable, and `JsonCodec` stays
  shipped as the debug-only fallback.
- Bundle size on the persistence path grows by ~9 KB gzipped vs JSON.
  Acceptable per S06 bundle audit (see spec line 628 — the entry
  chunk excludes msgpack via dynamic import).

## 4. Alternatives considered

- **Stay on JSON forever** — lost: violates the < 200 B/event target
  by ~3.8× even after S04 optimisations; bandwidth is the dominant
  cost of L3 sync.
- **CBOR (`cbor-x`)** — comparable bytes/event to MessagePack but
  lower install base in the JS ecosystem; rejected on maintenance
  posture, not technical grounds.
- **Custom binary** — rejected: every PRYZM-1 custom format we
  shipped became an unbounded source of migration debt
  (`MigrationEngine.ts:1-300`). Standardisation on MessagePack
  defers binary-format invention to the bake worker (S21+) where it
  is justified.

## 5. S04 update — byte-budget closure

The four-axis optimisation plan above shipped at S04 as
`MsgpackAliasedCodec` (codec name `msgpack-v2`,
`packages/persistence-client/src/codecs/MsgpackAliasedCodec.ts`).
`PERSISTED_EVENT_VERSION` bumped **1 → 2**. The decoder branches on the
version field; v1 records still round-trip through `MsgpackCodec`.

### Measured at S04 (same fixture, headless Node 20 CI)

```
[bench] save-edit per-event-size — json=762.68 msgpack-v1=643.41 msgpack-v2=194.55 (target < 200).
[bench] codec-spike bytes/event — json=762.68 msgpack-v1=643.4 msgpack-v2=194.55 (target < 200 — v2 closure).
```

| Codec     | Bytes/event | Ratio vs JSON | vs msgpack-v1 | Target met |
|-----------|------------:|--------------:|--------------:|:----------:|
| JSON      |      762.68 |          1.00 |          1.19 |     no     |
| MsgPack v1|      643.40 |          0.84 |          1.00 |     no     |
| **MsgPack v2** | **194.55** |     **0.255** |     **0.302** |   **yes**  |

### Optimisations that landed (relative to S03 plan)

| Plan item | Shipped form | Per-event saving |
|---|---|---|
| Field aliasing | single-char keys (`c`, `t`, `f`, `i`, `s`, `p`, `v`) | ~40% of envelope |
| Drop `payload` from wire | recomputed from `forward` patches on decode | full payload size |
| Drop `affectedStores` from wire | derivable from patch root paths on decode | array overhead |
| Drop `inverse` from wire when symmetric | absence of `i` key signals "mirror of forward" | 100% of inverse half |
| `op` enum (1=add, 2=remove, 3=replace) | per-patch `op` int8 | 4–6 B per patch |
| ULID base-256 packing | 16-byte raw vs 26-char Crockford | 10 B per event |
| Epoch-ms timestamps | `int64` vs ISO-8601 string | 17 B per event |

CI artefact: `apps/bench/.run-output/persistence.event-size.json`
(emitted by `apps/bench/src/benches/save-edit.bench.ts`; written on
every bench run with avg + p95 bytes per event for all three codecs).

The byte-budget line item from §2 ("Aggregate target after S04: < 200
B/event") is now **closed**.

## 6. References

- `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` — §S03-T8 (line 376),
  §S03 exit criteria (line 414).
- `apps/bench/src/benches/codec-spike.bench.ts` — the spike harness.
- `apps/bench/.run-output/codec-spike-bytes.json` — bytes/event report.
- `apps/bench/.run-output/persistence.codec-spike.{encode,decode}.{json,msgpack}.json`
  — per-sample timing baselines.
- `packages/persistence-client/src/types.ts` — `Codec` interface,
  `PERSISTED_EVENT_VERSION`.
- `packages/persistence-client/src/codecs/{JsonCodec,MsgpackCodec}.ts`
  — the two S03 implementations.
- ADR-002 (PatchEmitter envelope shape, ULID + audit metadata).
