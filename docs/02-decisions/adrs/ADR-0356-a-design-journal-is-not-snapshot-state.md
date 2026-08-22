# ADR-0356 — A design journal is not snapshot state, and a version container is not a document

- **Status:** Accepted for §3 (implemented) · **PROPOSED for §5, §6, §7** (costed, deliberately not built)
- **Date:** 2026-08-22
- **Lane:** LOAD30
- **Supersedes:** nothing.
- **Amends:** nothing. It NAMES an invariant that `ProjectSnapshot` has violated since schema v4
  without anyone writing it down.
- **Adds:** `TemporalGraphManager.suspendRecording()` / `resumeRecording()` /
  `isRecordingSuspended()`; `packages/core-app-model/src/temporalLoadReplayRatchet.test.ts`;
  `LocalVersionRepository._envelopeSlots()` / `_persistSlots()` / `_commitSlots()`;
  `apps/editor/__tests__/versionRepositoryEnvelopeWrite.test.ts`;
  `apps/editor/__tests__/serverSyncQueueIfMatch.test.ts`.
- **Contract:** [C05 §3.5, §3.6](../contracts/C05-PERSISTENCE-AND-FILE-FORMAT.md) (new).
- **Issue log:** L-5800 … L-5851.

---

## 1 · Context — the complaint, and the measurement that reframed it

Founder, 2026-08-22:

> *"honestly the performance of both navigation and **project opening** is not yet good … analyse -
> review - audit - look for gaps - issues - bugs - performance gaps … then review - document - and
> fix."*

His console, on a **264-element** project, while he merely clicked a slab and pressed Escape:

```
[VersionRepository] 20 version(s) persisted to IndexedDB (project "proj-1787…c18c5", ~70.8 MB compressed)
[ProjectSerializer] Snapshot created: 264 elements, 7 levels, 62 walls, 10 slabs, 31 furniture
POST …/projects/proj-1787…c18c5/versions  412 (Precondition Failed)
[ServerSyncQueue] §L-B2-RECONCILE 412 for "Auto-save" — expected 1, server has 746.
```

Two of those four lines are **the same defect stated twice**, and the reframing is the point of this
ADR. MEASURED (`node --expose-gc tools/perf/bench-version-container.mjs`, this machine, 2026-08-22):

| temporal mutation records per snapshot | ONE version, raw | 20-version container | `getVersions()` |
|---|---|---|---|
| **0** | **0.1 MB** | **0.3 MB** | **60 ms** |
| 5 000 | 1.3 MB | 5.9 MB | 691 ms |
| 33 500 | 7.9 MB | 37.5 MB | 2231 ms |

**264 elements of real building model serialise to ~0.1 MB — about 400 bytes per element.** The
founder's container is ~35 MB (the log's own figure was 2× overstated; see L-5806). So **the model
is under one percent of what his project open decodes**, and *"~13 KB per element"* describes
nothing about elements.

## 2 · Decision — the invariant, in one sentence

> **⭐ A JOURNAL OF WHAT HAPPENED IS NOT PART OF THE STATE THAT HAPPENED TO IT.**
>
> `ProjectSnapshot` is a description of a building at an instant. `temporalGraph` is an append-only
> log of every mutation that has ever occurred to it. Embedding the second inside the first makes
> every copy of the state carry a full copy of the history, so N stored versions hold N copies of
> one monotonically growing journal — and the size of the *present* becomes a function of the length
> of the *past*.

Two consequences follow, and they are separable:

- **§3 — a journal must not record its own replay.** Implemented.
- **§5 — a journal should not live inside the snapshot at all.** Proposed, costed, not built.

## 3 · §3 — a load is a REPLAY, and a replay is not history (IMPLEMENTED)

`TemporalGraphManager.init()` subscribes to `StoreEventBus` and mints one `NodeMutationRecord` per
create/update/delete. Hydrating a project writes every restored element into its store, so a load
emits one `create` per restored element.

`ProjectLoader` runs the whole hydration inside `storeEventBus.beginBatch()`, and its `endBatch()`
sits in the **`finally`** — which is **after** the Phase G `temporalGraphManager.deserialize()` that
clear-then-restores the real journal. So the replay's events were delivered *after* the restore and
appended **on top** of it:

```
journal(N) → open → restore elements (E events buffered) → deserialize (clear → N)
           → endBatch() flush (+E)  →  journal(N + E)  →  autosave writes N+E into ALL 20 snapshots
           →  and POSTs it to the server  →  next open: N + 2E  →  …
```

**The act of opening a project made the next open more expensive, without bound, and nothing in the
loop ever paid it back.** At E ≈ 264 the founder's ~33 500 records is on the order of a hundred
sessions — consistent with the **746** versions his server holds.

**DECIDED:** the manager gains a depth-counted `suspendRecording()` / `resumeRecording()` pair, and
`ProjectLoader` holds it across exactly its batch window — opened beside `beginBatch()`, released in
the `finally` immediately after `endBatch()`.

- ⛔ **It deletes nothing.** Suspension declines to *mint* records for a replay of history the
  snapshot already carries. `deserialize()` restores that journal byte-for-byte.
- Depth-counted so a nested load cannot resume early; **floored at zero** so an unbalanced resume can
  never leave the manager permanently deaf to the user's real edits.
- Released from the `finally`, so a fatal load cannot leave it deaf either.

**Rejected alternative — move the Phase G restore after `endBatch()`.** It would work (the
clear-then-restore would absorb the replay), and it is smaller. Rejected because it makes the
correctness of the journal depend on the *ordering of two unrelated blocks* in a 2 900-line loader,
which is exactly the property that broke here. A named suspension states the intent where the intent
lives.

**Tests** reproduce the loader's real ordering against the real bus and the real manager rather than
calling the new switch — including one asserting the flush lands *after* the restore (the premise
the defect depended on), and one running five successive opens and asserting the count does not move
where it previously climbed by 264 each time.

## 4 · §4 — what §3 does NOT do, stated before anyone assumes it

**§3 stops the ratchet. It does not shrink what the ratchet already built.** The founder's stored
journal stays at ~33 500 records until something compacts it. His open is faster by the read and
write fixes (L-5801, L-5810) and his history stops growing — but he is still carrying the payload.

Remediation options are enumerated and costed in **L-5823** and are **not decided here**, because the
governing rule is the founder's: *never lose user data to make it fast*. The journal is a real
feature — `DesignHistoryPanel` and `GhostOverlayRenderer` both read it. ⛔ **A blind retention cap is
not among the options**; it would delete design history the user never agreed to lose, to fix a bug
that was ours.

## 5 · §5 — PROPOSED: the journal moves out of band

**One journal per PROJECT, stored once, versioned by its own tail — not a copy inside each of 20
snapshots.**

- Removes the N-fold duplication at its root rather than bounding it.
- Makes a snapshot describe state only, which is what its name says.
- Makes the journal appendable, so writing it costs one record rather than a rewrite.

**Cost:** a `ProjectSnapshot` schema version (readers must accept both shapes); a migration that
lifts the journal out of existing snapshots on first read; `SnapshotStreaming`'s header carries
`temporalGraph` today and would carry a reference instead; the server's `project_versions.snapshot`
JSONB shrinks, which is a wire-visible change. **Estimated 2–3 days with tests and migration.**

## 6 · §6 — PROPOSED: one IndexedDB record per version

Today every save re-assembles and re-writes the **entire** container:
`V2_CONTAINER_MARKER + JSON.stringify(entries)` → `putVersions()`. After the read/write fixes, the
residual per-save main-thread cost is **87 ms to assemble + 40 ms to parse the envelope**, plus an
unmeasured structured clone of the whole payload into IndexedDB — and all of it scales with
container **bytes**.

**PROPOSED:** key the store by `projectId|versionId`, so a save writes **one ~2 MB record** and the
assemble+clone cost stops scaling with history at all.

**Cost:** `VersionCacheStore` `DB_VERSION` bump + a new object store; a new synchronous mirror shape;
a reversible migration; every reader updated — with the whole durability story (**§QUOTA-EVICT**, the
localStorage fallback ladder, and `probeVersions()`'s *unreadable-vs-empty* distinction) re-proved
against it. **Estimated 3–5 days.**

⛔ **Explicitly NOT started in this lane.** A half-built storage migration is worse than the
container it replaces, and the founder's brief said so: *"If an append-only/delta container is right,
say so, cost it, and do not half-build it."*

⚠ **`MAX_VERSIONS_STORED = 20` is NOT the lever.** Both costs that scale with 20 scale with container
**bytes**, which §3 and §5 cut by two orders of magnitude for new history. Lowering the version count
would trade the user's history for an effect the payload fix delivers for free.

## 7 · §7 — PROPOSED: server-side version retention has no policy

The client keeps 20. The server keeps **everything**: `versionLimitFor(plan)` returns `-1` for an
uncapped plan, so `POST /api/projects/:id/versions` accumulates for ever — **746 rows for one
project**, each holding a full `snapshot` JSONB, with another POSTed on every autosave.

C05 has no section on server-side retention. It should. ⛔ **Pruning existing rows is not a
performance change and is out of a lane's authority** — it is a product decision with a storage bill
attached, and it belongs to the founder.

Related and separable: the optimistic-lock count. `POST /api/projects/:id/versions` returns a
`project_versions` row from all of its backends, while `version_count` lives on `projects` — so the
client was never told the count and invented one (L-5830). The client no longer invents it, which
means **`If-Match` is now effectively never sent until a return site carries the count** (L-5831).
That is a one-field, contract-visible change to a C05 §3 route.

## 8 · Consequences

**Positive**

- Project open no longer decodes nineteen snapshots it discards: **2231 ms → 78 ms** measured.
- One autosave no longer pays a whole-history decode twice: **2623 → 223 ms** and **2640 → 324 ms**.
- Stored history stops growing by ~one record per element per open, for ever.
- A save with IndexedDB unavailable reaches the localStorage durability ladder again (L-5805) — the
  one fix here that is about **data**, not milliseconds.
- The `[ProjectSerializer]` log now names the journal it was silently carrying, so a single console
  paste answers "how big is it really" without this analysis being repeated.

**Negative / accepted**

- `If-Match` is off until §7's server change lands. Named in L-5831 rather than papered over; the
  rejected shortcut (seeding from the LOCAL version count) would have been the same defect with a
  different number.
- The founder's existing journal is untouched (§4).
- §5, §6 and §7 remain **proposed**. Their cost is stated so the decision is his.

**Not established by this ADR** — every figure above is a Node bench, a test run or a grep on a
synthetic payload calibrated to the founder's own log line. ⛔ **Nothing here was verified in a
browser.** L-5850 enumerates the six claims that need his console, and what to read for each.
