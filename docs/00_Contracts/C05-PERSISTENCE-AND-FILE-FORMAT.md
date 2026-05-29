# C05 — Persistence & File Format

> **Stamp**: 2026-05-03 · **Status**: CANONICAL  
> **Scope**: `packages/persistence-client/` (L4), `packages/file-format/` (L5), project lifecycle, project isolation, render gallery storage, and server-side PostgreSQL routing.  
> **References**: [ADR-003] object storage, [ADR-004] wire format, [SPEC-26] `.pryzm` file format, [ADR-017] `.pryzm-family` format.  
> **Changelog**: 2026-05-03 — added §1.3 server-side pgClient routing invariant (`DATABASE_URL` before `SUPABASE_DB_URL`); added §1.3.1 FK-removal invariant (`projects_owner_id_fkey` dropped in mixed-auth deployments); §1.4 renumbered from §1.3.

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

`.pryzm` is a ZIP container. It holds:

```
project.json          — Zod-validated project schema (ElementStore snapshot)
metadata.json         — version, app version, creation/update timestamps
assets/               — binary assets (images, GLBs) referenced by elements
ifc/                  — optional embedded IFC file (for round-trip fidelity)
```

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

### §3.3 — Project creation

New projects MUST be created server-side (POST `/api/projects`) before the client opens them. The client MUST NOT create a project by directly inserting into the database.

---

## §4 — The `.pryzm-family` File Format (SPEC-26, ADR-017)

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

- `projects.user_id` MUST always be set; orphaned projects (no owner) are disallowed.
- `project_versions.snapshot` MUST be a valid `project.json` blob (Zod-validated on write).
- `project_command_log` rows MUST be purged after 24 hours (TTL enforced probabilistically server-side and deterministically by a nightly job).
- All timestamps are UTC ISO 8601 strings; no UNIX epoch integers in the schema.
