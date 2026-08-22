# C05 — Persistence & File Format

> **Stamp**: 2026-05-03 · **Status**: CANONICAL  
> **Scope**: `packages/persistence-client/` (L4), `packages/file-format/` (L5), project lifecycle, project isolation, render gallery storage, and server-side PostgreSQL routing.  
> **References**: [ADR-0203] object storage, [ADR-0204] wire format, [SPEC-26] `.pryzm` file format, [ADR-0217] `.pryzm-family` format.  
> **Changelog**: 2026-08-22 (lane LOAD30) — added **§3.5** (a snapshot describes state; an append-only journal MUST NOT live inside it) and **§3.6** (a version-history write MUST NOT decode the history it is not changing), per [ADR-0356](../adrs/ADR-0356-a-design-journal-is-not-snapshot-state.md); ISSUE-LOG L-5800 … L-5851. · 2026-05-03 — added §1.3 server-side pgClient routing invariant (`DATABASE_URL` before `SUPABASE_DB_URL`); added §1.3.1 FK-removal invariant (`projects_owner_id_fkey` dropped in mixed-auth deployments); §1.4 renumbered from §1.3.

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

**Not decided by this section:** server-side version retention. The client keeps 20; the server keeps
everything (`versionLimitFor(plan)` returns `-1` for an uncapped plan — **746** rows for one project,
each holding a full snapshot). C05 has no retention rule and needs one; ⛔ **pruning a user's stored
history is a product decision, not a performance change** (ISSUE-LOG **L-5832**, ADR-0356 §7).

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
