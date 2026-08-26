# C05 — Persistence & File Format

> **Stamp**: 2026-05-03 · **Status**: CANONICAL  
> **Scope**: `packages/persistence-client/` (L4), `packages/file-format/` (L5), project lifecycle, project isolation, render gallery storage, and server-side PostgreSQL routing.  
> **References**: [ADR-0203] object storage, [ADR-0204] wire format, [SPEC-26] `.pryzm` file format, [ADR-0217] `.pryzm-family` format.  
> **Changelog**: 2026-08-26 (lane SUSTAIN109) — added **§3.9** (journal retention follows the version ring — the founder's decision, superseding §3.5's "not decided" clause, dated box in place) and the §3.6 req 6 box (the syncStatus sidecar shipped: one container write per save tick); ISSUE-LOG L-11542, L-11545. · 2026-08-22 (lane LOAD30) — added **§3.5** (a snapshot describes state; an append-only journal MUST NOT live inside it) and **§3.6** (a version-history write MUST NOT decode the history it is not changing), per [ADR-0356](../adrs/ADR-0356-a-design-journal-is-not-snapshot-state.md); ISSUE-LOG L-5800 … L-5851. · 2026-05-03 — added §1.3 server-side pgClient routing invariant (`DATABASE_URL` before `SUPABASE_DB_URL`); added §1.3.1 FK-removal invariant (`projects_owner_id_fkey` dropped in mixed-auth deployments); §1.4 renumbered from §1.3.

---

## §1 — Persistence Client (L4)

### §1.1 — Responsibility

`packages/persistence-client/` is the **single write gateway** for all project data. No other package MAY write project data to the database. It owns:

- Project CRUD (create, open, save, delete, duplicate).
- Element-level snapshots (via `project_versions` rows).
- Thumbnail updates.
- The command log (`project_command_log`) for collaboration catch-up.

### §1.2 — Backend targets

The persistence client selects its backend at runtime based on environment:

| Priority | Backend | Condition |
|---|---|---|
| 1 | Supabase REST | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set |
| 2 | Replit PostgreSQL | `DATABASE_URL` set (Replit-native) |
| **2.5** | **IndexedDB / OPFS offline cache** | **Browser environment; project opened at least once (see §1.2.1)** |
| 3 | In-memory fallback | Neither key present (dev / test only) |

The fallback hierarchy MUST be transparent to callers — the same API works against all three. The server logs which backend is active at startup.

#### §1.2.1 — IndexedDB offline cache (tier 2.5) — Wave A17 amendment

**Added 2026-05-03 — closes Part 1 GAP 5 (`D2` differentiator: field-ready offline-capable).**

`IndexedDBStore` (`packages/persistence-client/src/IndexedDBStore.ts`) is the tier 2.5 backend. It stores the last-known project JSON snapshot and geometry cache so the app can open a project in **read-only** mode when Supabase and Replit PostgreSQL are both unreachable (e.g. on a construction site with no connectivity).

**Invariants:**

1. The `IndexedDBStore` MUST be populated on every successful project load from tiers 1 or 2.
2. When the app falls back to tier 2.5, the `OfflineBanner` (`src/ui/OfflineBanner.ts`) MUST be shown with the text `"Offline — read only. Changes will not be saved until reconnected."`.
3. In offline mode, all write operations (save, create, delete) MUST be silently rejected with a user-visible toast — not silently dropped.
4. IndexedDB is scoped per project (`projectId` key) so multiple projects can be cached independently.
5. The `PatchEmitter` → `EventLog` → `IndexedDbBackend` pipeline (via `attachEventLog`) provides the event-level delta log. The `IndexedDBStore` provides the project-snapshot cache. They are **complementary, not overlapping** — the event log is for collaboration catch-up; the snapshot cache is for offline access.

**Implementation files:**
- `packages/persistence-client/src/IndexedDBStore.ts` — snapshot read/write/delete
- `packages/persistence-client/src/backends/IndexedDbBackend.ts` — event-log backend (idb-based)
- `packages/persistence-client/src/attachEventLog.ts` — PatchEmitter wiring
- `src/ui/OfflineBanner.ts` — offline indicator UI

#### §1.2.1a — localStorage version-history cache + §QUOTA-EVICT (2026-05-29)

Client-side `LocalVersionRepository` (`apps/editor/src/ui/platform/ProjectRepository.ts`) stores per-project version history in `localStorage` under `bim-project-<projectId>-versions`. Compressed via `fflate` (level 1) at write; default cap `MAX_VERSIONS_STORED = 20`; trim targets `[20, 5, 1]` cascade on `QuotaExceededError`.

**Invariants:**

1. `saveVersionsWithQuota` MUST trim through the TRIM_TARGETS cascade on quota error before giving up. The fallback ladder is **trim within project → §QUOTA-EVICT across projects → user-visible error toast**.
2. **§QUOTA-EVICT** — when even the smallest `TRIM_TARGETS` slice (1 version) fails, the repository MUST evict OTHER projects' version stores (oldest `updatedAt` first via the `bim-projects-index`, alphabetical fallback) one at a time and retry. The CURRENT project is what the user is working on; stale projects' history is expendable. The repository MUST stop as soon as the save succeeds.
3. The user MUST see a **single** `pryzm:toast` summarising the eviction (`Storage is full — dropped version history of N older project(s) to save this one.`, severity `info`). Eviction is otherwise silent.
4. If no other projects are available to evict and the smallest slice still fails, the repository logs a `console.error` AND emits an `error`-severity toast pointing the user at manual project deletion. Data is never silently dropped.

**Implementation files:**
- `apps/editor/src/ui/platform/ProjectRepository.ts` — `saveVersionsWithQuota` + `_evictAndRetry` + `_emitQuotaToast`

#### §1.2.2 — Single in-memory project authority (tier 3) — §STORE-UNIFY (2026-05-23)

The tier-3 in-memory fallback has **exactly one** project map: `_inMemoryProjects`
in `server/projectStore.js`. The unversioned `/api/projects/*` routes in
`server.js` MUST NOT keep a parallel project map — they delegate to the
`projectStore` accessors (`imGetProject` / `imListProjects` / `imUpsertProject` /
`imDeleteProject` / `imRecordVersionSave` / `imProjectsMapAdapter`), which return
the v0 shape (`{ id, name, updatedAt:<ms>, versionCount, ownerId }`) those routes
expect.

**Why (regression guard):** there used to be two divergent volatile maps —
`server.js` `_projects` (v0 routes) and `projectStore._inMemoryProjects` (v1
routes). The client creates/lists/deletes via v1 but opens/saves versions via v0,
so a v1-created project was invisible to the v0 fallbacks: it failed to open
(#74), delete restored it (#76), and auto-save version counts desynced (#134). A
second project map at tier 3 is therefore **forbidden** — a future contributor
adding one re-opens that whole bug class.

Version snapshots remain in `server.js` `_versions` (the single in-memory version
store — no duplicate ever existed); `imRecordVersionSave` keeps the project row's
`version_count` / `is_empty` / `latest_element_count` consistent after a save.
Covered by `server/__tests__/projectStore-inmemory.test.ts`.

### §1.3 — Server-side PostgreSQL routing (`server/pgClient.js`)

The server uses a direct PostgreSQL connection (not the REST API) for project and version CRUD.
Two environment variables may supply a connection string:

| Priority | Variable | Condition |
|---|---|---|
| **1 — always first** | `DATABASE_URL` | Replit-native PostgreSQL; always reachable |
| 2 | `SUPABASE_DB_URL` | Supabase direct PG (`db.<project>.supabase.co:5432`); only reachable from external deployments |

**Invariant: `DATABASE_URL` MUST be checked before `SUPABASE_DB_URL` in `server/pgClient.js`.**

Rationale: Replit's network blocks outbound connections to port 5432 on external hosts. The Supabase
direct-PG endpoint (`SUPABASE_DB_URL`) is therefore DNS-unreachable from the Replit sandbox, producing
`ENOTFOUND` on every query and an HTTP 500 on all project CRUD routes. `DATABASE_URL` (the Replit-native
PostgreSQL instance) is always available and MUST be preferred in this environment.

This priority is separate from the auth client (`server/supabaseClient.js`), which communicates over
HTTPS (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) and is unaffected by port 5432 restrictions.

> **Do not invert this priority.** The old comment in `pgClient.js` labelled `SUPABASE_DB_URL` as
> "preferred" — that was incorrect for the Replit deployment context and caused a P1 500 regression
> (fixed 2026-05-03). In a future external-server deployment where port 5432 is reachable, override
> the connection string via `DATABASE_URL` pointing at the Supabase pooler instead of swapping
> the priority logic.

#### §1.3.1 — Foreign-key constraint on `projects.owner_id`

**Invariant: `projects.owner_id` MUST NOT carry a PostgreSQL foreign-key constraint referencing
`pryzm_users(id)` in the Replit PG database.**

Rationale: In the standard deployment, authentication is handled entirely by Supabase. User rows
exist in Supabase's copy of `pryzm_users` but are never replicated to the Replit PG copy. A FK
constraint `projects_owner_id_fkey → pryzm_users(id)` in Replit PG therefore produces a
`23503 FK violation` on every `INSERT INTO projects` because the `owner_id` value (e.g.
`user-owner-antonio`) is not present in the empty Replit PG `pryzm_users` table.

Implementation:
- The DDL in `server/dbMigrate.js` declares `owner_id TEXT NOT NULL` without a `REFERENCES` clause.
- `migrateViaPg()` always runs `ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_owner_id_fkey`
  and `ALTER TABLE project_members DROP CONSTRAINT IF EXISTS project_members_user_id_fkey` at boot so
  existing databases (created before this fix) are also corrected idempotently.

Project isolation is still enforced: every route that reads or mutates project data runs through the
`canUserAccessProject` guard which checks `owner_id = $userId` at the SQL level.

### §1.4 — Project isolation invariant

**A user's project data MUST NOT be readable by another user's session.** This is enforced at three levels:

1. Supabase Row Level Security (RLS) policies on `projects` and `project_versions`.
2. Server-side ownership check on every `/api/projects/:id/*` route (the `canUserAccessProject` guard).
3. Socket.io `join-project` authorization (the `H7-FIX` guard) — anonymous sockets are always denied.

A regression in any of these three levels is a **P0 security incident**.

---

## §2 — The `.pryzm` File Format (SPEC-26)

### §2.1 — Format identity

`.pryzm` is a ZIP container.

> ⛔ **CORRECTED 2026-08-18 — the layout previously written here matched NOTHING on disk.** It
> listed `project.json` / `metadata.json` / `assets/` / `ifc/`. **Not one of those four entries is
> written by the shipped writer**, and no reader looks for them. Measured against
> `packages/persistence-client/src/PryzmArchive.ts:13-17` (the format comment) and the
> `PryzmArchiveManifest` interface at `:24-31`. The aspirational layout is preserved below the real
> one so the gap is visible rather than silently overwritten.

**SHIPPED (`.pryzm`, ZIP-DEFLATE level 6)** — `packages/persistence-client/src/PryzmArchive.ts`:

```
manifest.json         — { schemaVersion, projectId, projectName, exportedAt,
                          highestSeq, hasSnapshot }        (PryzmArchive.ts:24-31)
snapshot.json         — OPTIONAL; present iff a snapshotProvider supplied one
events.ndjson         — one PersistedEvent per line, JsonCodec form
```

`PRYZM_ARCHIVE_VERSION = 1 as const` (`:22`); a manifest whose `schemaVersion` differs is
**rejected**, not migrated (`:135-137`). The version field itself is governed here and **not** by
[C47](./C47-FILE-FORMAT-VERSIONING.md) — see C47 §0.0, where that conflict is resolved in this
contract's favour on the status ladder (C05 CANONICAL vs C47 DRAFT). ⚠ **This contract does not
yet specify the field it owns** (`grep -n "schemaVersion\|formatVersion"` in C05 → **0** before
this amendment) — an explicit § for it is **owed work**, not a settled question.

**ASPIRATIONAL, NOT BUILT** (retained for the round-trip intent in §2.2, which depends on `ifc/`):

```
project.json          — Zod-validated project schema (ElementStore snapshot)   ⛔ NOT WRITTEN
metadata.json         — version, app version, creation/update timestamps       ⛔ NOT WRITTEN
assets/               — binary assets (images, GLBs) referenced by elements    ⛔ NOT WRITTEN
ifc/                  — optional embedded IFC file (for round-trip fidelity)   ⛔ NOT WRITTEN
```

⚠ **§2.2's IFC round-trip requirement therefore has no substrate**: it mandates preserving the
source at `ifc/source.ifc`, and the shipped container has no `ifc/` entry. Read §2.2 as
**NOT-YET-TRUE**, never as a description of running behaviour.

### §2.2 — IFC round-trip (Differentiator D1)

A `.pryzm` file that was opened from an IFC4 source MUST:
- Preserve the original IFC geometry in `ifc/source.ifc`.
- Round-trip losslessly: `IFC4 → .pryzm → IFC4` produces a semantically equivalent file.
- Pass `apps/bench/src/benches/ifc-export-tier1.bench.ts` (< 20 s for 10k elements).

### §2.3 — Schema migrations

When the `project.json` schema version does not match the running app version:
- A migration function in `packages/file-format/src/migrations/` MUST upgrade the data.
- Migrations MUST be idempotent and composable (v1→v3 = v1→v2→v3).
- Downgrade (newer file opened in older app) MUST surface a clear user error, not a silent data loss.

---

## §3 — Project Lifecycle

### §3.1 — States

```
NONE → CREATING → OPEN → SAVING → OPEN → CLOSING → NONE
                          ↑________________________↓ (save loop)
                OPEN → CONFLICTED → RESOLVING → OPEN
```

- The current project state MUST be stored in `ProjectStore.status`.
- UI components MUST read state from `ProjectStore` and MUST NOT infer state from network calls.
- `CONFLICTED` state is entered when the CRDT sync layer detects an unresolvable merge (C08 §3).

### §3.2 — Auto-save

Auto-save MUST be debounced at ≥ 1000 ms after the last command. The `SaveOrchestrator` in `persistence-client` owns this timer. It MUST NOT fire during an active conflict resolution session.

### §3.2a — Auto-save MUST be suppressed for the entire load/restore window (binding)

> **Added**: 2026-07-02 · closes ADR-0098 finding **F2** (project-open freeze). Files: `SaveOrchestrator` (`§AUTOSAVE-SUPPRESS-DURING-LOAD`), `ProjectLoader` (`pryzm-load-suppress-begin`/`-end`).

No autosave serialize MUST run until a freshly-opened project is fully interactive. This extends the existing `§AUTOSAVE-BATCH-SUPPRESS` (ref-counted `pryzm-batch-started`/`-ended`) rule across the whole load, and it is **stronger** than the caller-driven `SaveOrchestrator.setLoading(true/false)` fence:

- The `setLoading(false)` fence closes the instant `loadAdapter.load()`'s promise resolves. But `ProjectLoader` continues a **fire-and-forget post-load sweep** (chunked per-level `rooms.redetect` + a deferred whole-level wall resolve, `§LOAD-REDETECT-CHUNKED` / `§WALL-JOIN-LOAD-SKIP`) across subsequent frames. Those deferred store mutations fire `bim-*` events → the debounce → `saveVersionInternal`, which SERIALIZES the whole snapshot (22.7 MB / 1300 elements for the reported office) **while the load is still settling** — the self-inflicted freeze (`_drainBuildQueue → rebuild → emit → handleMutation → scheduleDebounce → onAutoSave → saveVersionInternal`).
- **Required mechanism**: `ProjectLoader` dispatches `pryzm-load-suppress-begin` at the very start of `load()` and `pryzm-load-suppress-end` only once the load body AND the post-load sweep have fully drained (on the frame after the last per-level redetect). `SaveOrchestrator` treats this as a **boolean latch** (`_loadSuppressActive`): while set, mutations mark the project dirty but the serialize is DEFERRED; on `-end` exactly ONE coalesced autosave is armed so the settled project is persisted once.
- The latch is modelled as a boolean (not a ref-count) and is reset by `setLoading(true)` on every new load, so a cancelled/interrupted load's `-end` can never prematurely re-enable autosave for a fresher load (project-switch isolation, C13 §3.6).
- The `beforeunload` emergency flush remains gated by `isLoading` (unchanged) — data is never lost on tab close.

### §3.2b — Degenerate room-bounding-lines MUST NOT be persisted (binding)

> **Added**: 2026-07-02. Files: `ProjectSerializer` (`§RBL-NO-PERSIST-DEGENERATE`), `ProjectLoader` / `ImportProjectCommand` (load-migrate skip).

A room-bounding-line record whose `placement.start` or `placement.end` is `undefined` is degenerate (a partial/legacy record; the build-time `§RBL-PLACEMENT-GUARD` already skips rendering it). Such records MUST NOT be persisted or reloaded:

- **On save**: `ProjectSerializer` MUST filter degenerate records out of `snapshot.roomBoundingLines` so they stop accumulating (the reported office had 940, many partial — the count only ever grew).
- **On load-migrate**: both load paths (`ProjectLoader` legacy + `ImportProjectCommand` fast path) MUST SKIP a degenerate record rather than recreate a bogus 1 m origin line (the old `?? {x:0,z:0}` / `?? {x:1,z:0}` default). Combined with the save-time filter, the snapshot self-heals on the next save.

Well-formed lines are unaffected. This is a persistence-hygiene invariant; it changes no valid element's geometry.

### §3.3 — Project creation

New projects MUST be created server-side (POST `/api/projects`) before the client opens them. The client MUST NOT create a project by directly inserting into the database.

### §3.4 — A rejected upload MUST be retained, scoped and surfaced (binding)

> **Added**: 2026-08-19 · lane SYNC1, closes **L-1310** / **L-1311** / **L-1312**.
> Files: `ServerSyncQueue` + `serverSaveRejectionFate` (`§FIX-REJECTED-SAVE-IS-NOT-A-COMPLETED-SAVE`,
> `§FIX-QUEUE-CAP-SILENT-EVICTION`), `PlatformSaveController`, `server/projectStore.js`
> (`§FIX-LEGACY-UUID-PROJECT-ID-UNSAVABLE`).

**A failed upload is not a completed upload, and a rejected request is not a reason to stop trying
for everything else.** The measured breach this rule exists to forbid: a single free-plan 403 about
ONE project deleted its payload, **emptied the entire sync queue**, and latched a **session-wide**
flag that made every later `enqueue()` a silent no-op — so **nothing could reach the server again
for the rest of that browser session**, while every "Save Version" still reported success. ~50 of
the founder's projects were local-only for exactly this reason: not *"not yet uploaded"*, but
**uploads thrown away**.

Four requirements, each binding:

1. **Only a 2xx may remove an item from the sync queue.** A 4xx MUST attach a recorded reason to the
   item and leave the payload intact. There is no discard path. `serverSaveRejectionFate` is the
   single policy and it has **no `'discard'` arm** — that is the property to preserve, not the
   current list of status codes.
2. **A refusal MUST be applied at the server's scope, never wider.** `401` is session-wide (the
   client is not authenticated at all). A plan/limit `403`, a `400 invalid_id` and a `410` are
   **per-project** — the plan's version limit is *per project*, so it says nothing whatsoever about
   the other projects. A validation `400`, a `409` and a `412` are **per-save**. Widening a
   per-project refusal to the session is the defect; it MUST NOT be re-introduced for performance.
3. **Every terminal refusal MUST be surfaced to the user, and the retained work MUST be
   re-attemptable by a user gesture.** A host that reacts only to `401`/`403` is non-conformant: a
   `400 invalid_id` used to produce no visible surface at all. "Did not reach the server" MUST be
   enumerable (`ServerSyncQueue.getBlockedSaves()`). ⛔ Re-attempt MUST be driven by a **named
   event** (sign-in, plan change, an explicit user action) — **never by a timer**. Retrying a `403`
   on a schedule is a different bug.
4. **A queue cap MUST NOT evict silently.** Reclaiming a slot is permitted only from a **superseded**
   item (an older queued version of a project that also has a newer one queued). With nothing
   superseded, the queue MUST **refuse the new item and report the refusal** rather than delete a
   pending upload. Restoring an over-ceiling persisted queue MUST keep the **newest** items and say
   what it left behind.

**Corollary — the server MUST accept every project-id format its own client mints.** `isValidProjectId`
demanded `proj-<timestamp>-<alnum>` while `LocalProjectRepository.generateProjectId()` (C45 §7.1)
minted `proj-<uuid>`, so those projects got `400 invalid_id` **forever** and could never leave the
browser. `projects.id` is `TEXT PRIMARY KEY` with no format constraint, so the refusal bought
nothing. The allowlist (GAP-04) stays an allowlist — the added patterns are anchored lowercase-hex —
but **a client-minted id being unsavable is a contract breach, and the test that guards it MUST
assert against an id built the way the client builds it, never against a hand-written literal.**

### §3.5 — A snapshot describes STATE; an append-only journal MUST NOT live inside it (binding)

> **Added**: 2026-08-22 · lane LOAD30, closes **L-5820** / **L-5821** / **L-5822**.
> ADR: [ADR-0356](../adrs/ADR-0356-a-design-journal-is-not-snapshot-state.md).
> Files: `TemporalGraph` (`§FIX-TEMPORAL-LOAD-REPLAY-RATCHET`), `ProjectLoader` (the batch window),
> `ProjectSerializer` (`§PROBE-SNAPSHOT-JOURNAL-WEIGHT`).

**A `ProjectSnapshot` is a description of a building at an instant. A journal of every mutation that
has ever occurred to it is not part of that description.** Embedding the second inside the first
makes every stored copy of the state carry a full copy of the history, so N stored versions hold N
copies of one monotonically growing log — and the size of the *present* becomes a function of the
length of the *past*.

MEASURED (`node --expose-gc tools/perf/bench-version-container.mjs`, 2026-08-22): a **264-element**
project's model serialises to **~0.1 MB** (about 400 bytes per element) and its whole 20-version
container to **0.3 MB**. The founder's container was **~35 MB** and cost **2231 ms** of synchronous
main-thread decode on every project open. **Over 99% of it was `temporalGraph`.**

Three requirements, each binding:

1. ⭐ **A LOAD IS A REPLAY, AND A REPLAY MUST NOT BE RECORDED AS HISTORY.** Hydrating a project
   writes every restored element into its store, so a load emits one `create` per restored element.
   `ProjectLoader` buffers those on `storeEventBus` and flushes them from its `finally` — i.e.
   **after** the Phase G `temporalGraphManager.deserialize()` has clear-then-restored the real
   journal — so they landed on top of it and were persisted. **Opening a project therefore made the
   next open more expensive, without bound.** A recorder subscribed to the store event bus MUST be
   suspended across the load's entire batch window, flush included. ⛔ **Suspension MUST decline to
   MINT, never delete**: the snapshot's own journal is restored unchanged.
2. **A suspension MUST be depth-counted and floored at zero.** A nested load may not resume early,
   and an unbalanced resume may never leave the recorder permanently deaf to the user's real edits.
   It MUST be released from a `finally`, so a fatal load cannot leave it deaf either.
3. **A log line that reports a snapshot MUST NOT name only the part that is small.**
   `[ProjectSerializer] Snapshot created: …` reported elements, levels, walls, slabs and furniture —
   and every reading of it silently attributed the payload to the members it happened to name. It
   MUST also report the journal's size. ⛔ **By COUNT, never by re-serialising the sub-tree**: this
   line runs on the autosave path, and a probe that measured the largest member by stringifying it
   would BE the cost it reports.

**Not decided by this section, and deliberately so:** the journal already on a user's disk. Stopping
the ratchet does not shrink it. Remediation options are costed in ISSUE-LOG **L-5823**; ⛔ **a blind
retention cap is not among them** — it would delete design history the user never agreed to lose, to
fix a defect that was ours.

> ⚠ **SUPERSEDED 2026-08-26 (lane SUSTAIN109, ISSUE-LOG L-11542) — THE FOUNDER'S CALL IS MADE.** The
> clause above ("a blind retention cap is not among them") and the §3.8 box's "still not a retention cap"
> both deferred pruning to a founder decision. That decision arrived verbatim: *"please do the best
> possible architecturally sound — this is not sustainable — all fixes need to occur."* PERF104 had
> measured the designed trajectory (`4e4043f9`): the journal NEVER trims — versions cap at 20, every
> save writes a cursor, so the sidecar is unreleasable by construction; 2 056 → 5 361 records in one
> day; projected ×4 → 160 ms/open + 3.2 MB, ×10 → 400 ms/open + 8.3 MB.
> ⭐ **What supersedes what, precisely.** The word "blind" survives: a size cap or an age cap is STILL
> ruled out. What is now binding is a retention floor tied to the RESTORABLE history — every record any
> RETAINED version references is kept, and only records no restorable version can reach are released.
> That is **§3.9**, and it is the FIRST retention rule this contract has ever carried. The record-count
> assertions in §3.8 req 1 remain true of the sidecar MIGRATION (copies → cursors); they are no longer
> true of the journal's lifetime, and any test that asserted "unchanged forever" is now asserting the
> superseded clause. Record this box, not a silent edit: the clause was ratified, and it was right until
> the number it protected became the number that hurt.

> ⭐ **RE-MEASURED 2026-08-23 (lane INTEG51, ISSUE-LOG L-8704) — the ratchet is stopped and the
> SHAPE is unchanged, so the number went UP, not down.** The founder's live console reads
> `281 elements, 7 levels, 62 walls, 10 slabs, 31 furniture … temporalGraph **30 432 mutations**`
> with an integrity suffix of `0x8639ce` = **8 796 110 characters of canonical snapshot** for a model
> this section measures at **~0.1 MB**. The stored container is **~36.8 MB** across 20 versions
> (≈ 1.84 MB each), and the count still grows within a single session (30 357 → 30 432 in about an
> hour of normal editing — which is requirement 1 working: those are *his edits*, not a load replay).
>
> **The journal is ~99 % of the payload and is duplicated twenty times**, because a journal is
> append-only: version *n* is version *n−1* plus a handful of records. Storing it **once per project**,
> with versions referencing a cursor into it, is a **≈15×** reduction on every write and every open
> (≈36.8 MB → ≈2.4 MB) **with no record dropped**. ⛔ That is a FORMAT change and a founder decision;
> it is costed in **L-8704** beside **L-5823** and is **not** authorised by this box. ⛔ **And it is
> still not a retention cap** — the fix is to stop copying the journal, never to trim it.
>
> ⭐ **SHIPPED 2026-08-23 (lane PERF5, founder-approved) — see [§3.8](#38--an-append-only-journal-is-stored-once-per-project-a-version-holds-a-cursor-binding).**
> The estimate above was ≈ 15×; the measured figure at the founder's exact shape is **14.8×**
> (34.33 MB → 2.32 MB, `tools/perf/bench-journal-sidecar.mjs`), with the record count **unchanged at
> 30 432**. §3.8 carries the full table — including the one row this box would have got wrong:
> ⚠ the COLD open's CPU legs are ≈ unchanged (245 → 222 ms), because the loader genuinely needs the
> journal. What an open sheds is the 14.8× smaller container it must read out of IndexedDB, which is
> a browser-only leg and is `§PROBE-OPEN-PATH-STORAGE-LEG`'s to report, not a bench's to claim.

### §3.6 — A version-history WRITE MUST NOT decode the history it is not changing (binding)

> **Added**: 2026-08-22 · lane LOAD30, closes **L-5801** / **L-5802** / **L-5805** / **L-5806** /
> **L-5807** / **L-5810** / **L-5830**.
> Files: `ProjectRepository` (`§PERF-VERSION-ENVELOPE-WRITE`, `§FIX-ENVELOPE-APPEND-BYPASSED-THE-FALLBACK`,
> `§FIX-BULK-SAVE-TRUSTED-A-STALE-BLOB`), `PlatformShell` (`§PERF-OPEN-NARROW-RESTORE`),
> `ServerSyncQueue` (`§FIX-IFMATCH-INVENTED-A-COUNT`).

The local store keeps `MAX_VERSIONS_STORED` snapshots in one v2 container whose envelope carries
every version's id. **The ids are enough to append, replace and trim. Decoding the snapshots to do
it is work performed to answer a question the envelope already answers.**

Five requirements, each binding:

1. **An append or a per-version patch MUST NOT inflate a version it is not changing.** Unchanged
   versions travel as already-compressed BYTES, taken from the stored envelope. MEASURED: append
   **2623 ms → 223 ms**; a `syncStatus` flip **2640 ms → 324 ms** — and both run on **every**
   autosave, so one autosave used to pay the whole-history decode twice.
2. **A caller that wants ONE record MUST ask for one record.** `getLatestVersion()` /
   `countVersions()` / `probeVersions()` exist for exactly this; every project-open restore path
   MUST use them. MEASURED on project open: **2231 ms → 78 ms**. ⚠ This is only safe *because* of
   requirement 1 — `getLatestVersion()` deliberately does not seed the per-version blob cache, so
   while the WRITE path still read that cache, a narrow open merely moved the freeze to the next
   save. **The read and the write must move together.**
3. ⛔ **AN OPTIMISATION MUST NOT BYPASS THE DURABILITY FALLBACK.** The container path is an
   IndexedDB-primary optimisation. When IndexedDB is unavailable — private browsing, blocked site
   data, an `open` error — or when the documented revert switch is set, the writer MUST fall through
   to the localStorage trim/evict ladder. The measured breach: an envelope append entered on
   "an envelope exists" alone terminated in a store write that a disabled store answers **from
   memory only**, so **every autosave was lost on reload with no error printed**.
4. **A cache keyed by id MUST be invalidated by every writer that can change that id's content.**
   The per-version blob cache rests on *content is immutable per id*. A wholesale array writer cannot
   distinguish changed from unchanged records and MUST therefore drop the project's cache rather than
   carry a stale blob forward — which silently discards the caller's edit and leaves the stored bytes
   describing the previous content permanently.
5. ⭐ **AN OPTIMISTIC-LOCK PRECONDITION MUST BE SERVER-SOURCED OR ABSENT — NEVER INVENTED.**
   `If-Match` asserts a version count. Deriving it from `prior + 1` is sound **only** when `prior`
   came from the server; coercing an unknown count to `0` asserts "the server holds zero" and
   guarantees a `412` against any project that is not brand new. The measured breach:
   *"expected 1, server has 746"*, on every session, each costing a **wasted POST of the entire
   snapshot body** before the reconcile retry. ⛔ **A guessed precondition detects no concurrent
   writer — it only manufactures conflicts with itself**, so absent authority the client MUST send
   no `If-Match` at all. ⚠ **The corollary is a server obligation**: a response that a client is
   expected to derive a precondition from MUST carry the count. `POST /api/projects/:id/versions`
   does not today (it returns a `project_versions` row; `version_count` lives on `projects`), which
   is why the lock is currently inert — see ISSUE-LOG **L-5831**.

6. ⭐ **A TRANSIENT UI STATE MUST NOT COST A WHOLE-CONTAINER WRITE.**
   *(Added 2026-08-23 · lane INTEG51 · ISSUE-LOG **L-8702**. File: `ProjectRepository`
   `§PERF-SYNCSTATUS-TRANSIENT-NOT-PERSISTED`.)*
   Requirement 1 made a `syncStatus` flip cheap **per write**; nothing bounded HOW MANY of them one
   autosave performs. MEASURED from the founder's console — three whole-container writes of the same
   twenty versions, **~110 MB of IndexedDB traffic to record one autosave of a 281-element model**:

   ```
   [VersionRepository] 20 version(s) persisted to IndexedDB … ~36.8 MB (38,630,482 chars) compressed
   [VersionRepository] 20 version(s) persisted to IndexedDB … ~36.8 MB (38,630,478 chars) compressed
   [VersionRepository] 20 version(s) persisted to IndexedDB … ~36.8 MB (38,630,470 chars) compressed
   ```

   Write 1 IS the save. Writes 2 and 3 exist only to advance the documented ladder
   `'local-only' → 'sync-pending' → 'synced'`. **A rung of that ladder may be persisted only if it is
   still TRUE after a reload.** `'sync-pending'` asserts *an upload is in flight right now*, which no
   reload can leave true; the value it would otherwise overwrite (`'local-only'` = "not on the
   server") is the **conservative** one and is exactly what an interrupted upload should read back
   as. It MUST therefore be held in memory and **overlaid onto every read** — wide and narrow, both
   container formats — so no surface loses the badge, and the overlay MUST be pruned to the stored
   ids by the same writer that bounds the blob cache.
   ⛔ **`'synced'` MUST still be written.** *"The server already has this"* is a durable claim about
   another system and may not live only in RAM (C48 §1).
   ⚠ **Naming the residual honestly: the floor with this container shape is TWO writes, not one**
   (the save, plus one terminal status write). Reaching one requires `syncStatus` to leave the
   container for a sidecar id→status map — named and costed in L-8702, not shipped blind.
   ⭐ **A test for this requirement MUST COUNT WRITES, not assert the stored history is correct**: a
   correctness-only assertion passes identically against the unbounded implementation.
   > ⭐ **SHIPPED 2026-08-26 (lane SUSTAIN109, ISSUE-LOG L-11545) — the floor is now ONE write.** The
   > sidecar id→status map this requirement named lives at key `syncstatus::<projectId>` in the SAME
   > IndexedDB object store as the containers (no schema bump; `warm()` loads it for free; this module
   > stays the store's single writer). `'synced'` is STILL written durably (C48 §1) — one record of a
   > few hundred bytes instead of a ~2 MB container put — and `_applyStatusOverlays` overlays
   > durable-then-transient onto every read. ⚠ The tab-close trap PERF104 named needs no beforeunload
   > flush: `unsyncedWorkGuard` counts from the queue's own persisted state, and a lost `'synced'` put
   > leaves the record reading `'local-only'`, the conservative badge — both arms are EXECUTED in
   > `apps/editor/__tests__/syncStatusSidecar.test.ts`, which counts container puts by key as this
   > requirement demands (full ladder = 1 container put + 1 sidecar put).

**Not decided by this section:** server-side version retention. The client keeps 20; the server keeps
everything (`versionLimitFor(plan)` returns `-1` for an uncapped plan — **746** rows for one project,
each holding a full snapshot). C05 has no retention rule and needs one; ⛔ **pruning a user's stored
history is a product decision, not a performance change** (ISSUE-LOG **L-5832**, ADR-0356 §7).

### §3.7 — The content-integrity digest: what it may cover, what it may claim, and what happens when it changes (binding)

> **Added**: 2026-08-23 · lane INTEG51, closes **L-8700** / **L-8701**; the third recurrence of
> **L-334** / **L-360**.
> Files: `packages/persistence-client/src/loader/SnapshotIntegrity.ts`, `ProjectSerializer`
> (the stamp), `ProjectLoader` + `PlatformVersionController` (the message).

A snapshot carries a stamped content digest so that corruption or truncation of the stored blob is
**detected** without any valid project ever being **refused** (C08 P8). Twice before, the digest
was computed at SAVE over a different representation than at LOAD, and the second occurrence
false-flagged and bricked a real 1009-element project. It happened a **third** time in production
on 2026-08-23, on two healthy projects at once.

Five requirements, each binding:

1. ⭐ **THE CANONICAL FORM MUST BE `JSON.stringify`-EQUIVALENT, NOT MERELY "STABLE".** The stored
   artefact is `JSON.stringify(snapshot)`; a digest computed over anything else is a digest of
   something that was never stored. Wherever `JSON.stringify` **omits** an object key, the
   canonicaliser MUST omit it; wherever it renders `null`, the canonicaliser MUST render `null`.
   The measured breach: a **function**-valued, **symbol**-valued, or `toJSON()`→`undefined` property
   rendered as `"key":null` at SAVE and vanished at LOAD, and an array **hole** collapsed to nothing
   instead of `null`. Diagnostic evidence — the digest folds in `canonical.length`, so
   `stored …5**0432**` vs `computed …5**041d**` reads directly as **328 242 → 328 221, the load
   side 21 characters shorter**.
2. ⭐ **A CHANGE TO THE CANONICAL FORM IS A CHANGE OF ALGORITHM AND MUST MOVE THE `algo` TAG.**
   `fnv1a32-canonical-v1` → `-v2`. A tag that keeps naming the superseded algorithm is a second
   false statement stacked on the first. The superseded canonicaliser MUST be **retained, not
   deleted**, so the historical digest stays reproducible and the asymmetry stays demonstrable.
3. **A DIGEST STAMPED BY A DIFFERENT ALGORITHM IS *NOT COMPARABLE*, WHICH IS NEITHER "CLEAN" NOR
   "CORRUPT".** Verification MUST report it as `comparable:false` and MUST NOT raise a user-facing
   warning from it — the same disposition already required for a snapshot MigrationEngine has
   rewritten in flight, and for the same reason: reporting the difference between two algorithms'
   outputs as corruption is a fabricated verdict. ⚠ The tolerance is **one save wide** per project;
   it is not a licence to leave two algorithms live.
4. ⛔ **THE EXCLUSION SET IS CLOSED AND MUST NOT BE WIDENED TO SILENCE A MISMATCH.** It holds
   exactly two members — `integrity` (cannot summarise itself) and `versionLabel` (volatile save
   metadata written after the stamp). **No MODEL member may be added.** Excluding a model member
   would delete the digest's reason to exist while leaving whatever produced the mismatch in place,
   and a digest that excludes the largest member of the snapshot is not a digest. Any such change
   MUST be argued here first, never slipped into the constant.
5. ⭐ **THE MESSAGE MUST NOT ATTRIBUTE A CAUSE IT HAS NOT ESTABLISHED.** The shipped text read
   *"The file may be corrupted or was modified outside PRYZM"* and the founder saw it on two healthy
   projects: the stamp and the bytes disagreed because PRYZM's own canonical form did not mirror
   `JSON.stringify`. A mismatch message MUST state **what differs** (including the canonical-length
   Δ), that **the project was loaded in full and nothing was dropped**, and that PRYZM **cannot tell
   from the stamp alone** whether the difference arose in its own save path or in the stored bytes.
   ⛔ It MUST NOT name the user's file, or any actor outside PRYZM, as the cause.
   *A false accusation of corruption is spent credibility: the next true one gets dismissed.*

**A corollary requirement on the TEST, not the code.** The determinism test for this digest was green
throughout all three occurrences because its fixture was pure JSON — it could not contain the defect,
so it could not fail on it, while being read as proof that the guarantee held. **The fixture set MUST
be adversarial by construction**: it MUST contain live-object shapes whose JSON representation differs
from a structural walk, and at least one assertion MUST *exhibit* the superseded behaviour rather than
assert its absence. ⛔ **A test whose fixture cannot express the defect is not evidence of its
absence.**

**Not decided by this section:** whether a snapshot should carry live members `JSON.stringify` cannot
persist at all. `§L-8701` now NAMES them at save time (`integrity.jsonInvisible` + a console line);
what to do about any that turn up is a separate finding, because such a member is content being
dropped on every save regardless of what the digest does with it.

### §3.8 — An append-only journal is stored ONCE PER PROJECT; a version holds a CURSOR (binding)

> **Added**: 2026-08-23 · lane PERF5, closes **L-8704** (and the (c) option of **L-5823**).
> Files: `packages/persistence-client/src/loader/JournalSidecar.ts` (the snapshot shape and the
> digest rule), `apps/editor/src/ui/platform/ProjectRepository.ts` (`§JOURNAL-SIDECAR` — the v3
> container), `SnapshotIntegrity.ts` (the NOT-COMPARABLE arm).
> Bench: `tools/perf/bench-journal-sidecar.mjs`.

§3.5 binds *"a snapshot describes STATE; an append-only journal MUST NOT live inside it"* and its
own closing box costs the remedy at **≈15×**. This section is that remedy, made binding, and it
adds nothing to §3.5's position — it says HOW.

**MEASURED** (`node --expose-gc tools/perf/bench-journal-sidecar.mjs`, 2026-08-23, at the founder's
exact shape: 281 elements, 30 432 mutations, 20 versions):

| | before (v2) | after (v3) | |
|---|---|---|---|
| stored container | **34.33 MB** (36 001 562 chars) | **2.32 MB** (2 434 764 chars) | **14.8×** |
| journal records retained | 30 432 | **30 432** | ⛔ **unchanged** |
| one version, raw | 7.29 MB | **0.15 MB** | the journal was 97.9 % of it |
| chars DEFLATEd per autosave | 7 641 400 | **269 556** | **28×** |
| append one version | 684 ms | **59 ms** | 11.6× |
| version-history panel (inflate 20) | 4476 ms | **467 ms** | 9.6× |
| ⚠ narrow open, COLD | 245 ms | **222 ms** | **≈ unchanged — see requirement 6** |
| narrow open, second in session | 245 ms | **36 ms** | 6.8× |

Six requirements, each binding:

1. ⭐ **THE JOURNAL IS STORED ONCE PER PROJECT AND EACH VERSION STORES A COUNT.**
   `temporalGraph.mutations` leaves the stored snapshot and is replaced by
   `temporalGraph.mutationsRef = { v, n }`, where `n` is how many leading records of the project's
   journal that version held when it was stamped. The container gains one shared, CHUNKED journal
   beside the per-version blobs. ⛔ **The record count MUST be identical before and after.** This is
   a change in the number of COPIES, never in the number of RECORDS; a test asserting only that the
   container got smaller would pass against a retention cap, which §3.5 and ISSUE-LOG **L-5823**
   rule out by name.
2. ⭐ **THE APPEND-ONLY PROPERTY MUST BE CHECKED AT WRITE TIME, NEVER ASSUMED.** A cursor is a
   faithful description of the past only while the shared journal really is append-only, and it is
   not guaranteed by the model: restoring an older version and saving from it produces a journal
   that is not an extension of the stored one. A writer MUST verify the incoming record list still
   begins with the stored one — in O(n) identity comparisons, with no re-serialisation of anything —
   and on divergence MUST store that version's journal INLINE and leave the shared journal
   **untouched** while any stored version still indexes it. ⛔ Replacing a journal that other
   cursors index silently changes what those versions mean, which is data loss with no error
   message.
3. ⛔ **ONLY A PROVABLY IMMUTABLE RECORD LIST MAY BE SHARED.** `NodeMutationRecord`s are pushed and
   never touched again, so a prefix of the list is a faithful past state. `TemporalEdge` is **not**:
   `expireEdge()` writes `validUntil` **in place** on a live object, so a shared edge store with a
   per-version cursor would hand an old version an edge written AFTER it was stamped — a different
   value at the same index, i.e. a manufactured digest mismatch. **Edges therefore stay inline**,
   and that is a measured property of the code, not a preference. Extending sharing to edges
   requires making `TemporalEdge` immutable first, and is out of scope here.
4. ⭐ **THE INTEGRITY DIGEST'S COVERAGE IS UNCHANGED, AND AN UNFAITHFUL REASSEMBLY IS *NOT
   COMPARABLE*.** This is §3.7 applied to a new ignition condition, and it is the requirement this
   section exists to constrain. The stamp is still taken at SAVE over the WHOLE snapshot with the
   journal inline, and verified at LOAD over a snapshot with the journal inline; detach and
   re-attach happen strictly BELOW both. ⛔ **`CHECKSUM_EXCLUDED_TOP_KEYS` MUST NOT be widened** —
   §3.7 req 4 forbids adding a MODEL member and `temporalGraph` is the largest one there is, so the
   journal remains inside the digest while moving outside the storage record. A faithful reassembly
   reproduces the stamp bit-for-bit and MUST be compared at FULL strength. A reassembly that could
   not supply the cursor's exact record count MUST be reported `comparable:false` with its reason,
   **never** as a mismatch, and the carrier for that fact MUST be invisible to `JSON.stringify`,
   `Object.keys` and the canonicaliser so the mechanism cannot itself perturb a checksum.
   *This would have been the FOURTH false accusation of corruption from this module's history
   (L-334 → L-360 → L-8700) and the worst of them: the file intact, the difference introduced by
   PRYZM's own read path.*
5. **A DAMAGED SHARED JOURNAL YIELDS THE VERIFIED PREFIX — never `null`, never the suspect bytes.**
   Each chunk carries a digest over its exact JSON text, recomputed at read over the text that had
   to be inflated anyway. Returning `null` would discard verified history to punish one bad chunk;
   returning the suspect chunk would hand the loader records whose bytes did not survive. The
   project MUST still open, carrying every record that verified, with the shortfall named.
6. ⚠ **THE COLD OPEN IS NOT THE WIN, AND MUST NOT BE CLAIMED AS ONE.** The bench above measures
   the narrow open's CPU legs at **245 → 222 ms**: the loader genuinely needs the journal, so it is
   still inflated and parsed once. What this change removes from an open is the **container the
   browser must read out of IndexedDB**, which falls 14.8× — a browser-only leg that
   `§PROBE-OPEN-PATH-STORAGE-LEG` reports as `mirror-read` and that no Node bench can measure.
   ⛔ Any claim about the founder's *"opens take minutes"* MUST cite that probe's line from his
   session, not this table. The probe now prints a fifth leg (`journal-attach`) so the fix cannot
   quietly cost an open a leg the instrument stopped naming.

**Not decided by this section:** the SERVER copy. `POST /api/projects/:id/versions` still receives
the whole snapshot with the journal inline, deliberately — detaching on the wire is a change to a
documented C05 §3 route shape and belongs with **L-5831**/**L-5832**, not to a client storage lane.
So the 50 MB POST cap and the 746-row server history are **not** improved by this section, and
saying otherwise would be an unmeasured claim.

---

### §3.9 — Journal retention follows the VERSION RING: a record no retained version references is released (binding)

> **Added**: 2026-08-26 · lane SUSTAIN109, closes **L-11542**; supersedes the "not decided" clauses of
> §3.5 and the "still not a retention cap" line of §3.8 — see the dated box under §3.5.
> **Authority**: the founder's directive of 2026-08-26 (*"this is not sustainable — all fixes need to
> occur"*), quoted in that box. Files: `apps/editor/src/ui/platform/ProjectRepository.ts`
> (`§JOURNAL-RETENTION` — `_releaseJournalHead`, the `rel`/`b0` envelope fields, the per-version
> attach window). Test: `apps/editor/__tests__/journalRetention.test.ts` (founder scale, 6 000 records).

§3.8 stores the journal ONCE and lets each version hold a cursor. It left the journal's LIFETIME
unbounded: the local store keeps `MAX_VERSIONS_STORED = 20` snapshots, but the journal they index kept
every record since the project's first save. The size of what the user can still restore was bounded;
the size of what every open had to inflate and verify was not.

**MEASURED** (`apps/editor/__tests__/journalRetention.test.ts`, real codec + real digests + real integrity
stamps, 30 autosaves growing 200 records each to **6 000** — the founder's console read 5 361):
one open released **2 000** records (one sealed chunk) → container **171 018 → 119 828 chars (30 %
smaller)**; the retained window attached to every one of the 20 restorable versions, tail-aligned at
each version's own stamp; the real `TemporalGraphManager` deserialized and queried the restored oldest
version; the next save reused BOTH surviving sealed chunks byte-for-byte and read back with an EXACT
digest. ⚠ The fixture compresses better than the founder's real records; the SHAPE is the claim, and in
steady state the journal is bounded to the ring's span plus one chunk of granularity (~2 300 records at
his ~13 records/save) instead of growing without bound.

Six requirements, each binding:

1. ⭐ **THE FLOOR IS THE RING, NOT A NUMBER.** A version's claim on its journal prefix ends when the
   ring evicts it. The largest cursor among EVICTED versions (`journal.rel`, recorded at eviction from
   the envelope — a free read inside a container write already happening) is the exact boundary below
   which no restorable version references anything. ⛔ A size cap, an age cap, or any release above
   that boundary remains forbidden — §3.5's "blind" survives; only its "never" is superseded.
2. ⭐ **RELEASE AT OPEN, NEVER MID-SESSION.** The release runs in `getLatestVersion`, BEFORE the
   journal is attached, so the live model of the session that follows begins AT the window. Every later
   save then extends the stored window exactly (cursor = window index = `mutationsRef.n`), the
   append-only check stays O(n) identity/id comparisons, sealed-chunk reuse survives, and every
   post-release save's integrity digest is EXACT. Releasing mid-session would leave a live model whose
   journal reaches below the stored window; every later save of that session would fail the extension
   check and fall back to inline-whole storage — the bloat §3.8 removed, resurrected by its own fix.
3. **WHOLE SEALED CHUNKS ONLY, AS BYTES.** No version blob is decoded, no chunk re-DEFLATEd, no digest
   recomputed: chunks below the boundary are dropped, the survivors keep their `k`-alignment (the drop
   is a multiple of `k`), envelope cursors shift down in the same write. Cost: one envelope stringify
   and one IndexedDB put of a SMALLER container, paid only when ≥ one full chunk has become
   unreferenced. ⛔ It MUST NOT run on a disabled store (L-5805's lesson): `putVersions` there reaches
   only the mirror while the legacy localStorage copy — the container's only durable home in that
   environment — would be removed.
4. ⭐ **A PRE-RELEASE STAMP IS *NOT COMPARABLE*, AND THAT IS A POLICY FACT, NOT AN ERROR.** Versions saved
   before a release were stamped over their full journal; after it, re-attachment supplies every
   retained record and reports the shortfall. That is the SAME disposition §3.7 req 3 and §3.8 req 4
   already assign to an algorithm change and to an in-flight migration: `comparable:false, ok:true`,
   never "corrupt". The read path attributes a shortfall ≤ `b0` (the released head) to this section
   and prints an INFO line naming it; a larger shortfall is still damage and still an error.
   ⛔ Re-stamping old versions in the storage layer to fake exactness is FORBIDDEN: a stamp minted over
   content the serializer never saw is the L-334 / L-360 / L-8700 ignition condition, built on purpose.
5. ⭐ **THE ATTACH WINDOW IS PER VERSION AND TAIL-BOUNDED BY THE ENVELOPE CURSOR.** After a release the
   envelope cursor is window-relative while `mutationsRef.n` inside an old record still counts the
   absolute lineage; passing the whole journal to the attach would let an older version take records
   NEWER than its stamp. Every reader MUST slice `journal[0, r)` by the envelope cursor. On a complete
   lineage (`b0 = 0` — every container written before this section) the slice is what the internal
   cursor took anyway, so the behaviour is byte-identical.
6. **BACKWARD-COMPATIBLE BY ABSENCE, REVERSIBLE BY SWITCH, AND NOT THE LAST COPY.** `b0`/`rel` are
   optional envelope fields; absent = 0 = a complete lineage, so no migration touches a stored container
   (C47). `globalThis.__pryzmJournalRetention = false` reverts the WRITE side (no `rel` bookkeeping, no
   release); the read side is never gated. ⚠ Rollback hazard, named: a build predating this section
   reading a RELEASED container restores its NEWEST version exactly but may attach up to `b0` too-new
   records to an OLDER version's history — bounded, non-crashing, and gone on roll-forward. And the
   released head is not deleted from the world: every synced version's SERVER snapshot still carries its
   journal inline (§3.8's "not decided" clause is unchanged), so pre-release history remains recoverable
   from server history.

**Not decided by this section:** the server copy's retention (still L-5831 / L-5832), and whether the
temporal-history surfaces (DesignHistoryPanel's timeline, `GhostOverlayRenderer.queryAt`,
`getMutationsForElement`) should be told the window's start so they can say "history before here was
released" rather than simply starting there. They degrade in DEPTH only — the retained window is present
bit-for-bit — but the honest label is a UI change and belongs to a UI lane.

---

## §4 — The `.pryzm-family` File Format (SPEC-26, ADR-0217)

`.pryzm-family` files define reusable parametric component families (the equivalent of Revit families). They:
- Are valid `.pryzm` files with `metadata.json.type = "family"`.
- Contain a `family-descriptor.json` (parameter table, geometry functions, label mappings).
- Are loaded by `packages/family-loader/` at runtime (lazy, not at boot).
- Are distributed via the marketplace (C07 §4).

---

## §5 — Render Gallery

The render gallery stores photorealistic render outputs (PNG, < 50 MB per image) and panorama outputs. Storage MUST use the configured object store (Supabase Storage in production, local filesystem in dev). Gallery reads are public per-project (no auth required for the PNG URL). Gallery writes require the project owner role.

---

## §6 — Database Schema Invariants

The canonical database schema is in `reference/DATABASE-SCHEMA.md` (informational). The following invariants are normative:

- ~~`projects.user_id`~~ → **`projects.owner_id`** MUST always be set; orphaned projects (no owner) are disallowed. ⛔ **CORRECTED 2026-08-18: the column is `owner_id`, and §1.3.1 of THIS CONTRACT already said so** (`"projects.owner_id MUST NOT carry a PostgreSQL foreign-key constraint"`, and *"the DDL in `server/dbMigrate.js` declares `owner_id TEXT NOT NULL`"*). Verify: `grep -n "owner_id" server/dbMigrate.js` → the index at `:65`, the hot-query index at `:70`, and the FK drop at `:516`; **`projects.user_id` does not exist**. A contract contradicting itself across two sections is the cheapest defect to catch and the most expensive to inherit — an engineer reading §6 alone writes a query that errors at runtime.
- `project_versions.snapshot` MUST be a valid `project.json` blob (Zod-validated on write).
- `project_command_log` rows MUST be purged after 24 hours (TTL enforced probabilistically server-side and deterministically by a nightly job).
- All timestamps are UTC ISO 8601 strings; no UNIX epoch integers in the schema.
