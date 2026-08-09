# ADR-0311 — The patch stream is the autosave; the snapshot becomes the compaction checkpoint

**Status:** PROPOSED · **Date:** 2026-08-09 · **Context tag:** `§DELTA-PERSIST`
**Implements:** `SCALE-REMEDIATION-PROGRAM.md` §5 (Tranche 3) — L-786 + L-391 as one project
**Amends:** [C05](../contracts/C05-PERSISTENCE-AND-FILE-FORMAT.md) §1.1 · [C66](../contracts/C66-CONCURRENCY-AND-SCALE.md) §4 · [C13](../contracts/C13-PROJECT-LIFECYCLE-AND-ISOLATION.md)
**Related:** [C08](../contracts/C08-COLLABORATION-AND-SECURITY.md) §3.1 · [C47](../contracts/C47-FILE-FORMAT-VERSIONING.md) · [ADR-0299](./ADR-0299-a-recovery-that-conceals-is-a-defect.md) · L-786, L-391, L-792, L-791, L-793, L-789
**Origin:** `docs/03-execution/analysis/production-readiness-1000-users-2026-08-09.md`

---

## 1. Context

Every autosave serialises the entire document. The code's own measurement, recorded at
`SaveOrchestrator.ts:179-189` (`§PERF-AUTOSAVE-DEBOUNCE`): **793 elements → ~16.6 MB, twice per
fire** — once in `getHash()` for the dirty check, once in `saveVersionInternal()` for the payload —
on a 2.5 s debounce, shipped under `express.json({limit:'50mb'})` and inserted as a new JSONB row in
`project_versions` behind a `SELECT … FOR UPDATE` on the `projects` row.

**Save cost is O(document), not O(change).** Moving one wall in a 10,000-element model costs the
same as rebuilding it. A one-hour editing session at the debounce ceiling writes ~1,440 rows of
~16.6 MB.

The waste is gratuitous. `CommandBus.executeCommand()` already computes exact forward **and**
inverse Immer patches for every mutation and hands them to the caller as
`EventRecord.patches: PatchSnapshotEntry[]` (`CommandBus.ts:330-420`, `types.ts:164-181`). They are
routed to the undo stacks and then discarded. `packages/persistence-client/attachEventLog.ts`
already subscribes the `PatchEmitter` to an `EventLog` — the client half of a delta pipeline exists
and terminates in IndexedDB, never on a server.

Meanwhile a complete Yjs CRDT stack — `apps/sync-server` (session manager, per-project and
per-level `Y.Doc` cache, advisory-lock event log, soft locks, presence, chaos harness) and
`packages/sync-client` (`YjsDocAdapter`, `CRDTConflictResolver`, awareness, websocket provider) —
is written, tested and **not deployed**. `engineLauncher.ts:847-901` says so in a comment and gates
the provider behind `VITE_COLLAB_CRDT` + `VITE_SYNC_URL`, both unset.

**L-786 and L-391 are one problem seen from two ends.** The bus emits deltas. The `Y.Doc` knows how
to merge them. The missing piece is a durable, ordered, server-side home for them. Building either
alone means building half of the other.

Two governance facts bind this design:

- **C05 §1.1** says `packages/persistence-client/` is the **single write gateway** for all project
  data. The autosave path bypasses it: `apps/editor/src/ui/platform/PlatformSaveController.ts`
  serialises the document itself and `ServerSyncQueue.ts:434` POSTs it. Per the repo's conflict
  order, **the code is wrong**. This ADR makes C05 §1.1 true rather than routing around it.
- **C66 §1** — a tier is HELD only when measured. Every capacity number below is arithmetic from
  the audit, not a load-test result. The probes in Phase 0 exist to fix that before, not after.

---

## 2. The decision

### 2.1 — Deltas live in a new `project_patches` table

```sql
-- server/dbMigrate.js SCHEMA_SQL — additive, idempotent
CREATE TABLE IF NOT EXISTS project_patches (
    project_id      TEXT   NOT NULL REFERENCES projects(id)         ON DELETE CASCADE,
    seq             BIGINT NOT NULL,          -- per-project, monotonic, gap-free
    command_id      TEXT   NOT NULL,          -- EventRecord.id (ULID) — the idempotency key
    command_type    TEXT   NOT NULL,
    actor_id        TEXT   NOT NULL,
    client_id       TEXT   NOT NULL,
    base_version_id TEXT   NOT NULL REFERENCES project_versions(id) ON DELETE CASCADE,
    patches         JSONB  NOT NULL,          -- PatchSnapshotEntry[] — forward
    inverse         JSONB,                    -- inverse patches; NULL only for legacy imports
    byte_size       INTEGER NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, seq),
    UNIQUE (project_id, command_id)
);
CREATE INDEX IF NOT EXISTS idx_pp_base ON project_patches(project_id, base_version_id, seq);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS patch_seq                 BIGINT  NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS patches_since_compaction  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS bytes_since_compaction    BIGINT  NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS persistence_mode          TEXT    NOT NULL DEFAULT 'snapshot';

ALTER TABLE project_versions ADD COLUMN IF NOT EXISTS is_compaction        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE project_versions ADD COLUMN IF NOT EXISTS compacted_through_seq BIGINT;
```

`base_version_id` is load-bearing: it anchors a patch to the snapshot it is relative to, so a patch
can never be replayed onto the wrong base. `UNIQUE (project_id, command_id)` makes append
idempotent, which is what makes at-least-once delivery safe on a flaky connection.

**Sequence assignment is O(1), not O(rows):**

```sql
UPDATE projects
   SET patch_seq = patch_seq + 1,
       patches_since_compaction = patches_since_compaction + 1,
       bytes_since_compaction   = bytes_since_compaction + $2
 WHERE id = $1
 RETURNING patch_seq, patches_since_compaction, bytes_since_compaction, persistence_mode;
```

One statement, one row lock held for microseconds, no `COUNT(*)`, no `FOR UPDATE` block around a
multi-megabyte insert.

⚠ **`apps/sync-server/src/eventLog/PgEventLog.ts` must be repointed at this table and its sequencing
replaced.** It currently computes the sequence number as
`(SELECT count(*) … WHERE project_id = $1) + 1` inside `pg_advisory_lock` — an O(rows) count on
every append, which recreates L-786's shape in the delta layer. Its `sync_event_log` table has
never been deployed and therefore has zero production rows, so this rename is free. Doing it now
is the difference between one durable log and two.

### 2.2 — Compaction, with a bound that three mechanisms enforce

Open = **latest `project_versions` row + every `project_patches` row whose `base_version_id` is that
row, in `seq` order**. Replay happens on the **client**, in `persistence-client`, because the server
has no domain knowledge of the document and acquiring some would be a far larger change than this
one.

Bound: **`MAX_REPLAY_PATCHES = 200`** and **`MAX_REPLAY_BYTES = 2 MB`**. At an estimated ~1 KB per
patch, 200 patches ≈ 200 KB ≈ **1.2 % of a 16.6 MB snapshot** — the design target is that replay is
lost in the noise of the snapshot transfer that already happens today. ⚠ **200 is a placeholder
until P0.1 measures real patch sizes and real replay time** (§6).

*Open must not get slower* is the constraint most likely to be violated silently, so it is enforced
three times, deliberately redundantly — a bound policed only by a background job is not a bound:

1. **Write-side ratchet (primary).** The append response carries `compactionDue: true` once
   `patches_since_compaction ≥ 200` or `bytes_since_compaction ≥ 2 MB`. The client performs one
   compaction save — which is exactly today's snapshot save, done once per ~200 edits instead of
   every 2.5 s.
2. **Server-side backstop (refusal).** At `patches_since_compaction ≥ 400` (2×) the append endpoint
   returns **429 `compaction_required`** and refuses further patches until a compaction snapshot
   lands. Per C66 §5.1 this is an honest refusal; the alternative is an unbounded replay that
   nobody notices until an open takes 30 s.
3. **Read-side probe.** The open path emits `pryzm.persistence.open.replay_count`,
   `.replay_bytes` and `.replay_ms` (P8) and WARNs above the bound. **This ships in Phase 0, before
   anything else in this ADR** — ship the probe before the fix.

### 2.3 — Snapshots do not disappear; they change job

`project_versions` keeps three roles and loses one:

| Role | Before | After |
|---|---|---|
| Autosave mechanism | ✅ every 2.5 s | ❌ **removed** |
| User-named versions (C13) | ✅ | ✅ unchanged |
| Compaction checkpoint | — | ✅ new (`is_compaction = true`, hidden from the version list by default) |
| The open anchor | ✅ | ✅ unchanged |

C13 stays true: open still begins from a persisted version row. What changes is that the
authoritative persisted document is the **pair** (latest row, its patch run), and the row alone is
never stale by more than the bound in §2.2. **C66 §4's "Persisted document" row must be amended to
name that pair** — the orchestrator owns that edit.

### 2.4 — `persistence-client` becomes the single writer, in fact

To make C05 §1.1 true rather than aspirational:

- **New** `packages/persistence-client/src/ProjectWriteGateway.ts` — the only module that issues a
  project write. Two methods: `appendPatches(projectId, records)` and
  `saveSnapshot(projectId, snapshot, { isCompaction, baseVersionId })`.
- **Moved down** `apps/editor/src/ui/platform/ServerSyncQueue.ts` →
  `packages/persistence-client/src/ServerSyncQueue.ts`. Its retry/back-off/`§L-B2-RECONCILE` logic
  is transport concern, not shell concern, and it is currently the reason the shell can write
  behind the gateway's back.
- **`SaveOrchestrator` loses `getHash()`-by-serialize.** Dirtiness in delta mode is
  `patchBuffer.length > 0` — O(1). *This alone deletes half of L-786's client cost*, because
  `getHash()` is one of the two 16.6 MB serialisations per fire.
- `PlatformSaveController` keeps the UI concerns (modal, chip, thumbnail, toasts) and calls the
  gateway.

### 2.5 — `§PATCH-COMPLETENESS-LATCH` — the legacy mutation path is the sharpest hazard here

**A delta stream is only correct if every mutation emits a patch. Today, some do not.**
`CommandBus.ts:371` carries a permanent `isEmptyPatchRecord` special case *precisely* to stop
legacy bridge handlers from poisoning the ring-buffer cursor, and L-793 records ~236 surviving
`commandManager.execute()` sites — with `apps/` explicitly excluded from the CI ratchet's scan, so
the largest concentration is legal by construction.

A mutation that changes state and emits no patch produces a delta stream that is **silently
incomplete**: replay yields a document missing that change, and nothing reports it.

The decision: **do not make L-793 (15 d) a hard prerequisite. Latch instead.**

> The moment the runtime observes a state mutation that produced no patch record, the session sets
> `§PATCH-COMPLETENESS-LATCH`. The next save is forced to a full compaction snapshot with
> `fallbackReason: 'patch_incomplete'`, the latch clears, and the counter
> `pryzm.persistence.patch_incomplete{command_type}` increments.

This is self-healing (the document is never wrong for longer than one save), honest (the fallback
is reported, never silent), and it converts L-793 from a grep count into a **measurement of how
often the legacy path actually fires in real sessions** — which is the number that should decide
how much L-793 is worth.

### 2.6 — The rollout flag is server-side and per-project, and the fallback is named

A client env var cannot be turned off for a project already mid-rollout, and two clients editing one
project **must** agree on the mode. So:

- **`projects.persistence_mode ∈ {'snapshot','delta'}`** is the authority. The open response tells
  the client which mode this project is in; **the client does not decide.**
- `PRYZM_DELTA_PERSISTENCE_COHORT` (server env) admits projects to `'delta'` on their next open.

**Observability — this is the L-789 re-creation guard.** A refusal and a success must not be the
same value (C66 §5.1); a *degraded success* and a *healthy success* must not be either.

- Every save response carries `mode: 'delta' | 'snapshot'`. When a delta-mode project takes the
  snapshot path, the response **must** carry `fallbackReason` from a closed enum:
  `patch_stream_gap` · `base_version_missing` · `compaction_required` · `patch_too_large` ·
  `patch_incomplete` · `client_unsupported` · `apply_failed`.
  **A fallback with no reason is rejected 400.** You cannot fall back anonymously.
- Metric `pryzm.persistence.save{mode,fallback_reason}`; span attribute
  `pryzm.persistence.mode` on `pryzm.persistence.save` (P8).
- **`GET /api/v1/projects/:id/persistence`** answers the operator's only question in one call:
  `{ mode, patchSeq, patchesSinceCompaction, bytesSinceCompaction, baseVersionId,
  lastFallbackReason, lastFallbackAt }`.
- **The user sees it too.** A session that has fallen back shows *"Saving in compatibility mode"*,
  not plain *"Saved"*. Per ADR-0299, a recovery that conceals is a defect.

### 2.7 — `createVersionTransactional`, its row lock, and the 412

**The lock stops being a hot-path problem by frequency, not by re-engineering.** Autosave leaves
`createVersionTransactional` entirely and becomes `POST /api/v1/projects/:id/patches` — the O(1)
`UPDATE … RETURNING` of §2.1 plus one small INSERT, with no `FOR UPDATE` on `projects` and no
`COUNT(*)`. `createVersionTransactional` survives unchanged in shape for **explicit versions and
compaction only**, i.e. roughly 1 write per 200 edits instead of 1 per 2.5 s.

L-792's bounded fix is adopted **inside** T3 rather than before it, which is why tranche 2
deliberately deferred it (doing it twice is the wrong order):

- `SELECT … FOR UPDATE` on `projects` → **`pg_advisory_xact_lock(hashtext(project_id))`**. Identical
  save-vs-save serialisation, without locking the `projects` row against thumbnail/rename/patch
  writes.
- Drop the redundant step-5 `COUNT(*)` recount; the plan-limit count is index-served since L-788.
- Keep `expectedVersionCount`.

**On the 412 — the program document's claim that "the 412 goes away" is narrowed here.** Per the
L-792 correction, the 412 was never data loss: `ServerSyncQueue.ts:474-516` (`§L-B2-RECONCILE`)
reads the server's actual count from the 412 body, re-bases and retries once inline, and on a second
412 preserves the snapshot as `local-only` and surfaces it via `onSaveRejected`. Nothing is
stranded.

What was actually lossy is one level up: **the retry appends our whole-document snapshot after
theirs, so the other editor's changes are absent from current state.** That is document-level
last-writer-wins, and a patch stream is what fixes it — two editors' work interleaves by `seq`
instead of each shipping a rival copy of the whole model.

The 412 therefore **remains**, correctly, on explicit and compaction versions, where it is rare. The
patch append gets its own, different precondition: appends are unconditional and ordering is
server-assigned; a client whose `base_version_id` is no longer current gets **409 `stale_base`**
with the current base and must re-open or compact.

### 2.8 — The CRDT sync-server is the transport, deployed last

Phase 3 deploys `apps/sync-server` as a **separate Fly app**, one instance, `SYNC_EVENT_LOG=pg`
pointed at `project_patches`, and sets `VITE_SYNC_URL` + `VITE_COLLAB_CRDT` for the cohort — the
gate at `engineLauncher.ts:865-878` already reads exactly those two.

Sequenced **after T2.2 (L-336)**: while the access gate is owner-only there is at most one user per
project, so there is nothing to merge and the payoff is unobservable.

⚠ **The sync-server inherits C66 §3.1 and is not exempt from it.** `SessionManager`,
`YjsProjectCache._projectDocs` / `._levelDocs` and `presenceService` are per-process Maps, and
`apps/sync-server/src/index.ts` says so in its header (*"single-instance only … multi-instance via
Redis Pub/Sub deferred"*). Deploying it at N = 1 is fine. **Scaling it past one instance without
moving that state to Redis is the same defect class as L-770** and must be written into C66 §3.3 as
a new category-A row when it deploys.

---

## 3. Consequences

- **Autosave payload falls from ~16.6 MB to ~1 KB per edit** — the ~1000× the audit projects. ⚠ This
  is arithmetic, not a measurement (C66 §1); P0.1 and the k6 harness (L-800) settle it.
- **Row count goes up ~200× while bytes go down ~1000×.** Postgres cares about both. `project_patches`
  needs a retention policy of its own before Phase 4 — patches older than their compaction base are
  history, not state. Not designed here (§5).
- **Open transfers slightly more, not less** — snapshot + ≤2 MB of patches. Open does not get
  *cheaper* from this work; it gets *bounded*. See §4 for what it does not solve.
- **`project_command_log` becomes redundant for collaboration catch-up** once Phase 3 lands, because
  `project_patches` is a durable ordered log with the same information and a longer life. T3
  deliberately does **not** merge them — L-791 is in flight on that table and a cross-tranche
  dependency would stall both. Its removal is a named follow-up.
- **The `_inMemoryProjects` tier-3 fallback has no delta story.** In delta mode a project with no
  durable patch table cannot be reconstructed. Tier 3 stays snapshot-only, forever, and
  `persistence_mode` must be forced to `'snapshot'` on that path.
- **C47:** `project_patches.patches` is Immer patch JSON, which is *not* the `.pryzm` file format.
  Export and import stay snapshot-based. A C47 MAJOR bump invalidates in-flight patches — the
  reader must refuse to replay a patch run whose base snapshot predates the bump
  (`fallbackReason: apply_failed`).
- **Undo is unchanged.** `inverse` is stored for durability and audit, not consumed —
  `performUndoRedo.ts` and the three stacks (L-793/S-2) are untouched by this ADR.

---

## 4. Failure modes — what the user sees

C66 §5: refuse honestly.

| Failure | Detected by | Behaviour | User sees |
|---|---|---|---|
| **Gap in the patch stream** (non-contiguous `seq` from base) | client-side contiguity check before replay | abort the replay entirely; open from the snapshot alone. **Patches are never deleted.** | banner: *"Opened from the last full save at HH:MM — N later changes could not be applied. They are still on the server."* + a **Recover** action |
| **Out-of-order arrival** | `seq` is server-assigned; client buffers | applied in `seq` order; a hole persisting > 5 s triggers a re-fetch of the run | nothing — this is normal operation |
| **Offline for a week** | queued patches carry a `base_version_id` that has since been compacted | append → 409 `stale_base`. Work is preserved locally exactly as `§L-B2-RECONCILE` preserves it today and offered as *"Save as a new version"*. Never silently discarded, never silently merged. | a choice, not a loss |
| **A patch fails to apply** (schema drift, C47 bump) | `applyPatches` throws | abort replay, open from snapshot, mark the project compaction-due; span `pryzm.persistence.open.replay_failed` with the failing `seq` | same banner as *gap* |
| **Compaction never happens** (last client left mid-session) | `patches_since_compaction ≥ 400` | append refuses **429 `compaction_required`**; the next client to open compacts on open | *"This project needs to finish saving — reopen it to continue."* ⚠ **the ugliest state in this design**; see §6 Q1 |
| **A patch bigger than a snapshot** (10k-element import) | `byte_size > PATCH_MAX_BYTES` (256 KB) | that save takes the snapshot path with `fallbackReason: 'patch_too_large'` — a deliberate, reported fallback | nothing; the operator sees the reason |
| **Legacy mutation with no patch** | `§PATCH-COMPLETENESS-LATCH` (§2.5) | next save forced to full compaction, `fallbackReason: 'patch_incomplete'` | *"Saving in compatibility mode"* |

Until Phase 3, the week-offline case **forks and asks**. Merging it rather than asking is precisely
what the CRDT layer buys, and it is the honest reason the two halves are one project.

---

## 5. What this does **NOT** solve

Stated plainly, because a fix that is oversold is the next audit's finding.

1. **Open cost.** Open still transfers a full snapshot. The audit's *"~16 GB egress at 1,000
   concurrent opens"* row is **untouched**. Fixing it needs chunked or level-scoped snapshots in
   object storage (C47 / ADR-0203) — a separate project.
2. **Client serialize cost.** A compaction still does the 16.6 MB `JSON.stringify` on the main
   thread. It happens ~200× less often; it does not get cheaper.
3. **L-336.** The access gate stays owner-only. The merge payoff is invisible until T2.2 lands.
4. **L-770.** One machine, no Socket.io adapter. T3 removes the *write* bottleneck that made
   scale-out pointless; it does not make scale-out *safe*.
5. **Socket.io fan-out.** Cursor/presence traffic is unchanged until awareness moves onto the Yjs
   provider (authored, unwired).
6. **Distributed undo.** Undo remains local and remains split three ways (L-793).
7. **`project_patches` retention.** Not designed here. Without it, the table grows forever — the
   same unbounded-table shape as `project_versions` today, just with smaller rows.
8. **Any capacity claim.** Nothing in this ADR moves a C66 §1 tier from CLAIMED to HELD. Only a
   recorded k6 run does that.

---

## 6. Phases, effort, reversibility

| Phase | Content | Effort | Reversible? |
|---|---|---|---|
| **0 — Probes** | P0.1 open/save instrumentation shipped in **snapshot mode** (replay-count/bytes/ms spans, snapshot-size + serialize-ms histograms, saves-per-session). P0.2 `§PROBE-PATCH-APPLIES-TO-SNAPSHOT` — offline harness asserting `snapshot(t0) + patches == snapshot(t1)` byte-for-byte after canonicalisation over N recorded sessions. P0.3 run the L-800 k6 harness against staging. | **3 d** | ✅ fully — no behaviour change |
| **1 — Shadow** | `project_patches` DDL; `POST /api/v1/projects/:id/patches`; `ProjectWriteGateway` + `ServerSyncQueue` moved into `persistence-client` (closes C05 §1.1). Client appends patches **in addition to** today's snapshot saves. **Nothing reads them.** Continuous production comparison of replay-result vs the snapshot the same client just saved. | **8–10 d** | ✅ fully — stop writing, drop the table |
| **2 — Cut over** | Flip the cohort to `persistence_mode='delta'`. Autosave stops serialising. Compaction every 200 patches. Open replays. `§PATCH-COMPLETENESS-LATCH` live. L-792's advisory-lock swap lands here. | **8–10 d** | ⚠ **per project, not globally.** Flip-back = one metadata update + one compaction. Data written in delta mode survives, but its granularity is abandoned |
| **3 — CRDT transport** | Deploy `apps/sync-server` (separate Fly app, 1 instance, `SYNC_EVENT_LOG=pg` → `project_patches`); repoint `PgEventLog`; set `VITE_SYNC_URL` + `VITE_COLLAB_CRDT` for the cohort; awareness onto the Yjs provider. | **10–14 d** | ❌ **not reversible.** The flag can be turned off, but a project whose concurrent edits merged cannot be un-merged, and the client Y.Doc state vector is not reconstructible from snapshots |
| **4 — Retire** | Delete the snapshot-autosave path; retire `project_command_log` catch-up; `project_patches` retention. | **4 d** | ❌ not reversible |

**Total ≈ 33–41 d** (the program's 25–35 d, plus the probes it did not cost).

**Gates between phases — a phase does not start because the previous one shipped:**

- Phase 1 **must not start** if P0.2 fails. If patches do not reconstruct the snapshot, the design is
  wrong, not the implementation.
- Phase 2 requires Phase 1's shadow comparison ≥ 99.99 % identical over ≥ 1,000 real production
  saves, and a measured replay p95 inside the §2.2 bound.
- Phase 3 requires L-336 closed **and** either a Redis story for the sync-server's per-process state
  or an explicit, written C66 §3.1 single-instance waiver.
- Phase 4 requires the GA tier HELD by a recorded k6 run (C66 §1, §6.5).

---

## 7. Alternatives rejected

| Option | Why rejected |
|---|---|
| **Reuse `project_command_log` as the delta store** | Wrong lifetime, wrong payload, wrong shape. Its retention is 24 h and L-791 is converting it to buffered multi-row inserts with day-partitioning and scheduled partition **drops** — a durable document log cannot live in a table whose rows are designed to be deleted. It stores the command *payload*, not the patches, and has no per-project monotonic sequence (ordering by `created_at` is neither gap-free nor collision-free). |
| **Reuse `sync_event_log` as-is** | Right lineage, wrong sequencing: `(SELECT count(*) WHERE project_id=$1)+1` inside an advisory lock is O(rows) per append — L-786's own shape, reintroduced one layer down. Adopted as ancestry (`PgEventLog` repoints at `project_patches`), rejected as-is. Free to change: it has never been deployed. |
| **Yjs update blobs as the *primary* durable form** | Makes the durable record opaque to everything that is not Yjs — no SQL inspection, no partial replay, no server-side audit, no diffing an incident. Compaction and versioning would require a Yjs runtime on the BFF. Couples the durability of customer data to one library's binary format. Yjs stays the **transport and merge** layer; Postgres stays the **record**. |
| **Server-side replay (server returns one merged document on open)** | The BFF would have to understand the document's store topology. Larger change than this ADR, and it puts domain knowledge in the layer C05 keeps free of it. Deferred, and it is the *only* thing that would make open cheaper (§5.1). |
| **Make L-793 (finish the command migration) a hard prerequisite** | +15 d and it blocks T3 behind an unrelated refactor. `§PATCH-COMPLETENESS-LATCH` (§2.5) makes the incompleteness *self-healing and measured* instead, and produces the number that should decide L-793's priority. |
| **Client env flag (`VITE_DELTA_PERSISTENCE`) as the rollout gate** | Two clients on one project could disagree about the mode, which is a data-corruption vector, and a project already mid-rollout could not be pulled back. The mode is a property of the project, so it lives on the project row. |
| **Silent snapshot fallback whenever the delta path errors** | This is L-789 relocated. A degraded save that looks identical to a healthy one is the exact defect this repo has paid for at L-716, L-752, L-779 and L-789. Hence the closed `fallbackReason` enum and the 400 on an unnamed fallback. |
| **Do L-792's lock fix first, then T3** | T3 rewrites that write path and removes the multi-MB insert that is the only thing worth serialising. Doing it twice is the wrong order — the tranche-2 note already records this. |
| **Delta persistence without deploying the sync-server** | Delivers the write-cost win and leaves document-level LWW intact (§2.7), i.e. exactly half of the problem, with a second merge mechanism still to be built later against a patch format chosen without it in view. |

---

## 8. What is NOT decided here, and what needs a measurement or a founder call

Flagged rather than asserted, per the program's standing rule.

**Q1 — ⚠ Load-bearing: do the bus's patches actually reconstruct the snapshot?**
`PatchSnapshotEntry` carries `storeKey` + store-relative paths; `IProjectSnapshot` is a
serialise-adapter product. Whether the snapshot's JSON shape maps 1:1 onto store keys **is not
established in this ADR and must not be assumed.** P0.2 is the gate. If it fails, client-side replay
is impossible in this form and the design changes materially. *This is the single most important
unknown in T3.*

**Q2 — Is 200 the right bound?** Chosen so that 200 × ~1 KB ≈ 1.2 % of a 16.6 MB snapshot. Both
numbers are estimates. P0.1's real patch-size distribution and replay-ms p95 settle it. **Measure
before implementing §2.2.**

**Q3 — Is 16.6 MB still true?** It is the codebase's own figure from 2026-06-27, not re-measured by
the audit or by this ADR. Everything downstream (the ~1000×, the ~2 GB/s, the OOM path) is arithmetic
from it.

**Q4 — Is ~200× more rows actually cheaper for Postgres?** Bytes fall ~1000×; row count rises ~200×.
Index maintenance, autovacuum and WAL volume respond to both. Only the k6 harness against a
production-shaped target answers this, and it is the one way this design could be net-negative at the
database.

**Q5 — The 429 `compaction_required` dead-end.** The backstop in §2.2 assumes some client will come
back and compact. If P0.2 succeeds, server-side compaction becomes possible and this state can be
removed entirely. If it fails, this refusal is the design and it needs a founder call on whether it
is acceptable. **Do not implement the backstop before Q1 resolves.**

**Q6 — Founder call: a second deployed service.** `apps/sync-server` is a second Fly app — a second
bill, a second deploy pipeline, a second on-call surface, and its own single-instance ceiling
(§2.8). Phase 3 is also the irreversible one. This is a product decision, not an engineering one,
and it is the same September-launch decision L-391 has been waiting on since 2026-07-17.

**Q7 — `project_patches` retention.** Deliberately undesigned (§5.7). It needs its own decision
before Phase 4, informed by Q4.

**Nothing here is browser-verified or measured.** This is a design ADR: no code was changed and no
probe has been run. Every number in it is derived from reading code, and C66 §1 says a number that
has not been measured is a claim.
