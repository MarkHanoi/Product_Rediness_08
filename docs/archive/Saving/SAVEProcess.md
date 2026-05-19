# PRYZM — Full Lifecycle Save System: Implementation Plan

> **Classification:** Architecture Design Document  
> **Status:** Pre-implementation (no code changes applied)  
> **Scope:** Complete save/load lifecycle from user action to Supabase and back  
> **References:** Pascal `use-auto-save.ts`, Pryzm `PlatformShell.ts`, `ProjectSerializer.ts`, `ProjectLoader.ts`, `ProjectRepository.ts`, `09-DATABASE-PERSISTENCE-ARCHITECTURE.md`

---

## 1. Executive Summary

Pryzm already has the most difficult parts of a persistence system in place: a typed `ProjectSerializer`, a command-based `ProjectLoader`, a `ProjectRepository` with version history, and a working server API. What it lacks is a **robust triggering layer** — the system that decides when to save, how to detect real changes, and how to protect the user's work at every moment.

Pascal (the next-gen editor) solves this elegantly with a reactive Zustand subscription, a 1-second debounce, and a set of lifecycle guards. Pryzm uses a 5-minute interval and a manually maintained list of DOM event names — a fragile, coarse approach that will silently miss saves as the codebase grows.

This document defines the ideal full lifecycle save system for Pryzm, synthesising the best of both architectures. It covers every phase of data life: **creation → dirty detection → serialisation → local persistence → server sync → load → replay**. It is written for implementation without ambiguity.

---

## 2. Current State Audit

### 2.1 What Exists and Works

| Component | File | Status | Quality |
|---|---|---|---|
| Typed snapshot schema | `ProjectSerializer.ts` | ✅ Complete | High — strictly typed per element, THREE.js stripping correct |
| Command-based loader | `ProjectLoader.ts` | ✅ Complete | High — 13-step ordered replay, cancellable |
| Local storage abstraction | `ProjectRepository.ts` | ✅ Complete | High — singletons, 20-version cap, clean interface |
| Platform-shell delegation | `PlatformShellTypes.ts` | ✅ Complete | High — clean interface boundary, no engine imports |
| Plan gating (client) | `EntitlementStore.ts` | ✅ Complete | Medium — advisory only, no reactive plan updates |
| Plan gating (server) | `server.js` lines 742–775 | ✅ Complete | High — authoritative, mirrors client limits |
| Server API | `server.js` lines 642–830 | ✅ Complete | High — CRUD for projects + versions, Supabase + in-memory fallback |
| Supabase client | `server/supabaseClient.js` | ✅ Complete | Good — service role key, lazy init |
| Schema versioning | `SNAPSHOT_SCHEMA_VERSION = 1` | ✅ Present | Minimal — warns but no migration path |

### 2.2 What Is Broken or Missing

| Gap | Current Approach | Problem | Severity |
|---|---|---|---|
| **Dirty detection** | 18 hardcoded DOM event names in `wireEvents()` | Any new element system added to Pryzm silently breaks dirty tracking. No diff — just a boolean flag. | **Critical** |
| **Autosave cadence** | `setInterval` every 5 minutes | User can lose up to 5 minutes of work. No configurable interval. | **High** |
| **`beforeunload` safety** | None | Tab close or browser crash loses all unsaved changes since last save | **High** |
| **Load guard** | None | Autosave can fire during `ProjectLoader.load()`, corrupting the save with a partially-loaded state | **High** |
| **Version preview guard** | None | No concept of pausing autosave while viewing a historical version | **Medium** |
| **Thumbnail capture** | Not integrated into save flow | Version history has no visual preview of the scene | **Medium** |
| **Binary assets** | No system | Textures and uploaded files cannot be stored alongside a snapshot | **Medium** |
| **Server as primary** | `trySaveToServer()` is fire-and-forget secondary | Server sync failure is silently ignored; localStorage may diverge from Supabase | **Medium** |
| **Offline detection** | None | No differentiation between "server down" and "no internet" | **Low** |
| **Schema migration** | `parse()` logs a warning only | Old snapshots from schema v1 will fail silently when fields change | **Low** |
| **Real-time collaboration** | Socket.io `version-saved` event broadcast exists but not consumed by UI | Collaborators don't see each other's saves | **Low** |

---

## 3. Target Architecture

The ideal system is a **four-layer pipeline** that runs from state mutation to durable storage with zero gaps.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  LAYER 0 — CHANGE DETECTION                                                  │
│  StoreSubscriber                                                              │
│  • Subscribes to every BIM store mutation via Zustand or event bus           │
│  • Produces a normalised "diff signal" — not a boolean, a structural diff    │
│  • Debounces at 1000ms                                                       │
└─────────────────────┬────────────────────────────────────────────────────────┘
                      │ Change signal
                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  LAYER 1 — SERIALISATION                                                     │
│  ProjectSerializer (already exists)                                          │
│  • Reads all stores → ProjectSnapshot (typed, THREE.js-stripped)             │
│  • Produces elementCount for version metadata                                │
│  • Schema version stamped on every snapshot                                  │
└─────────────────────┬────────────────────────────────────────────────────────┘
                      │ ProjectSnapshot (plain JSON)
                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  LAYER 2 — LOCAL PERSISTENCE (synchronous, always succeeds)                 │
│  ProjectRepository / VersionRepository (already exist)                       │
│  • localStorage write — immediate, no network                                │
│  • bim-project-{id}-versions capped at 20 entries                           │
│  • bim-projects-index updated atomically with the version write              │
└─────────────────────┬────────────────────────────────────────────────────────┘
                      │ Version record written
                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  LAYER 3 — REMOTE PERSISTENCE (async, best-effort with retry)               │
│  ServerSyncQueue (new)                                                       │
│  • POST /api/projects/:id/versions                                           │
│  • On failure: queues for retry with exponential backoff                    │
│  • Supabase: projects + project_versions tables                              │
│  • Broadcasts version-saved via Socket.io                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Layer-by-Layer Implementation Specification

---

### 4.1 Layer 0 — Change Detection (`SaveOrchestrator`)

This is the most important change. Replace the 18-event list and 5-minute interval with a single reactive orchestrator.

#### 4.1.1 Design Principle

The orchestrator must be **store-aware, not event-aware**. It should not maintain a list of events. Instead, it should observe the stores themselves. This means it remains correct when new element types (columns, MEP systems, site elements) are added to Pryzm — no list needs updating.

#### 4.1.2 Proposed `SaveOrchestrator` Class

**File:** `src/ui/platform/SaveOrchestrator.ts`

```
class SaveOrchestrator {
    private debounceTimer: ReturnType<typeof setTimeout> | null
    private isSaving: boolean = false
    private isLoading: boolean = false
    private isVersionPreviewMode: boolean = false
    private hasDirtyChanges: boolean = false
    private pendingSave: boolean = false
    private lastSnapshot: string = ''
    private executeSave: (() => Promise<void>) | null
    private onSaveCallback: (label: string) => Promise<void>
    private onSaveStatusChange: (status: SaveStatus) => void

    public readonly DEBOUNCE_MS = 1000
}
```

#### 4.1.3 Store Observation Strategy

Pryzm's BIM stores are not Zustand stores — they are custom class-based stores that emit DOM events. There are three valid observation strategies:

**Option A — DOM event subscription (current approach, improved)**  
Subscribe to a single synthetic event `bim-store-mutated` that every store emits on any write. This requires each store's write methods to dispatch this event. One event name replaces 18. Safe, decoupled.

**Option B — Polling with structural diff**  
Call `ProjectSerializer.serialize()` every N seconds and compare `JSON.stringify(snapshot)` against the last saved snapshot. Fire save only on actual diff. No store changes needed. Higher CPU cost but completely store-agnostic.

**Option C — Proxy-based interception**  
Wrap each store's write methods at bootstrap time via a Proxy. The proxy calls the original method then dispatches `bim-store-mutated`. Zero store changes needed. Most correct.

**Recommended: Option A** — clean, explicit, low overhead. Each store already emits granular events; a single `bim-store-mutated` aggregator event is a one-line addition to each store's write path (or a wrapper in `EngineBootstrap`).

#### 4.1.4 Diff Signal

The current approach uses a boolean `isDirty`. This is coarse. The improved system should track a **content hash**:

```
lastHash = stableHash(ProjectSerializer.serialize(stores, bimManager))
```

A save is triggered only when the current hash differs from `lastHash`. This means:
- Undo-to-previous-saved-state correctly suppresses the autosave (hash matches)
- Camera movements never trigger a save (camera state is not in the snapshot)
- The 1-second debounce fires a save only when the content actually changed

`stableHash` can be `JSON.stringify` of the full snapshot (already done in Pascal) or a lightweight FNV-1a hash of the stringified output to reduce comparison cost.

#### 4.1.5 Lifecycle Guards

The orchestrator must honour these guards — all currently missing in Pryzm:

**Loading guard:** When `ProjectLoader.load()` is running, the orchestrator must suppress all save attempts. Any dirty signal received during load is discarded (the loading state itself is not "user-created" dirty data). The orchestrator exposes `setLoading(true/false)` which `PlatformShell` calls around `loadDelegate.load()`.

**Version preview guard:** When a user loads an old version to preview it, the current scene is replaced with a historical snapshot. Any autosave at this point would overwrite the user's real working state with the old version. The orchestrator must expose `setVersionPreviewMode(true/false)`. In preview mode: no saves fire. When preview mode ends, if `hasDirtyChanges` was true before preview started, the pending save resumes immediately.

**In-progress save guard:** If a save is already executing (serialisation + localStorage + server POST), a new dirty signal sets `pendingSave = true`. When the current save completes, the pending save executes immediately (no debounce delay).

**`beforeunload` guard:** On `window.beforeunload`, if `hasDirtyChanges === true`, the orchestrator fires an immediate synchronous localStorage save (server sync is skipped — it's async and would be aborted by the browser). This closes the data loss gap on tab close.

#### 4.1.6 `SaveStatus` State Machine

```
         ┌──────────────────────────────────────────────────────────────┐
         │                                                              │
  'idle' ─── change detected ──► 'pending' ─── debounce fires ──► 'saving'
         ◄── no dirty changes ──             ◄── save completes ───────┤
                                                                        │
  'error' ◄──────────────────────── save throws ───────────────────────┘
  'paused' ◄─────── isVersionPreviewMode = true ────────────────────────
```

This status is surfaced to the UI via a callback (`onSaveStatusChange`) so the toolbar can show: `Saved`, `Unsaved changes`, `Saving...`, `Save failed`, `Preview mode (saves paused)`.

---

### 4.2 Layer 1 — Serialisation (Enhanced `ProjectSerializer`)

The existing `ProjectSerializer` is production-quality. Two enhancements are needed:

#### 4.2.1 Incremental Serialisation (Future)

For projects with thousands of elements, serialising the full snapshot on every autosave is expensive. A future optimisation is **incremental serialisation**: maintain a "last serialised snapshot" and only re-serialise element types whose stores emitted a mutation since the last save. This is implementable because the snapshot is decomposed by element type (`walls[]`, `slabs[]`, etc.) and each store is independent.

For the initial implementation, full serialisation on every debounce is correct and sufficient.

#### 4.2.2 Schema Migration (Required)

The current `ProjectSerializer.parse()` logs a warning when `schemaVersion` mismatches but returns the raw snapshot unchanged. This will cause silent data loss when fields are added or renamed in future snapshot versions.

A `MigrationEngine` must be added alongside the serialiser:

**File:** `src/core/persistence/MigrationEngine.ts`

```
interface SnapshotMigration {
    fromVersion: number
    toVersion: number
    migrate: (snapshot: any) => any
}

class MigrationEngine {
    private migrations: SnapshotMigration[] = []

    register(migration: SnapshotMigration): void

    migrateToLatest(snapshot: any): ProjectSnapshot
    // Applies each registered migration in order from snapshot.schemaVersion
    // to SNAPSHOT_SCHEMA_VERSION. Throws if no migration path exists.
}
```

`ProjectSerializer.parse()` is updated to call `MigrationEngine.migrateToLatest()` before returning. If the schema version already matches, the migration chain is a no-op.

#### 4.2.3 Thumbnail Capture Integration

A thumbnail (a small JPEG of the current viewport) should be captured at save time and stored alongside the version metadata. This requires:

1. A `ThumbnailCapture` utility that calls `renderer.domElement.toDataURL('image/jpeg', 0.5)` — available on the Three.js WebGLRenderer.
2. The thumbnail is stored as a base64 string on `ProjectMeta.thumbnail` (the field already exists in the schema).
3. It is **not** stored on `VersionRecord` — only the most recent thumbnail per project is meaningful for the project browser.
4. Thumbnail capture is triggered after a successful manual save (not on every autosave — it's expensive and the interval save is sufficient).

---

### 4.3 Layer 2 — Local Persistence (Enhanced `ProjectRepository`)

The existing `ProjectRepository` and `VersionRepository` are well-designed. Two enhancements are required:

#### 4.3.1 Atomic Write Pair

Currently, `saveVersion()` in `PlatformShell` makes two separate localStorage writes:
1. `versionRepository.saveVersions(projectId, versions)` — writes the version list
2. `projectRepository.saveProject(meta)` — writes the project index

These are not atomic. A crash between the two writes leaves the index inconsistent with the version list.

**Solution:** Add a combined `saveVersionWithMeta(projectId, version, meta)` method to a coordinating class (or a `StorageTransaction` helper) that writes both keys in sequence and catches quota errors uniformly. Since localStorage is synchronous, the window of inconsistency is microseconds — but the error handling must be unified.

#### 4.3.2 localStorage Quota Strategy

The current implementation swallows `QuotaExceededError` with a `console.warn`. In practice, a large BIM project snapshot can be 500KB–2MB of JSON. Storing 20 versions per project can easily exhaust the 5–10MB localStorage budget.

**Strategy:**
1. Before writing, estimate the payload size (`JSON.stringify(versions).length * 2` bytes for UTF-16).
2. If the estimated write would exceed 4MB for this project's versions key, trim aggressively (retain only the 5 most recent) before writing.
3. If the write fails despite trimming, fall back to retaining only the latest 1 version and logging a structured warning.
4. Add a storage budget indicator to the version history UI: `"N versions stored locally · ~X MB used"`.

This ensures the user never silently loses versions due to storage pressure.

#### 4.3.3 `beforeunload` Local Flush

The `beforeunload` flush (from Layer 0) writes a special version labelled `"Emergency save (tab closed)"` with a timestamp. This version is visually distinguished in the version history UI (e.g., an amber warning icon). It ensures that even if the browser crashes, the last state is recoverable from localStorage on the next session.

---

### 4.4 Layer 3 — Remote Persistence (`ServerSyncQueue`)

The current `trySaveToServer()` is a single `fetch` call inside a `.catch(() => {})`. This is the weakest link in the chain. A robust implementation requires:

#### 4.4.1 `ServerSyncQueue` Design

**File:** `src/ui/platform/ServerSyncQueue.ts`

```
interface SyncJob {
    id: string
    projectId: string
    version: VersionRecord
    attempts: number
    nextRetryAt: number
}

class ServerSyncQueue {
    private queue: SyncJob[] = []
    private isFlushing: boolean = false
    private isOnline: boolean = navigator.onLine

    enqueue(projectId: string, version: VersionRecord): void
    // Adds a sync job. If online, flushes immediately.

    private flush(): Promise<void>
    // Processes queue head-first. On success: removes job. On failure: 
    // increments attempts, sets nextRetryAt with exponential backoff.

    private backoffMs(attempts: number): number
    // attempts 1: 5s, 2: 15s, 3: 45s, 4: 2m, 5+: 5m (max)

    getQueueDepth(): number
    // Surfaced to UI as "N unsynchronised versions"

    private onOnline(): void
    // window 'online' event — immediately flushes the queue
    private onOffline(): void
    // window 'offline' event — suspends flushing, shows offline badge
}
```

**Behaviour on auth failure (401):** Drop the job — the user is not authenticated. Surface a toast. Do not retry.  
**Behaviour on plan limit (403):** Drop the job — the user's plan doesn't allow more versions. Surface the upgrade prompt.  
**Behaviour on server error (500):** Retry with exponential backoff up to 5 attempts, then drop and log.  
**Behaviour on network failure:** Suspend queue. Resume on `window.online`.

#### 4.4.2 Optimistic vs Confirmed Saves

The save status indicator should distinguish between:
- `'saved-local'` — written to localStorage, not yet confirmed by server
- `'saved-remote'` — confirmed by `POST /api/projects/:id/versions` returning 201
- `'sync-pending'` — in queue, waiting for server confirmation
- `'sync-failed'` — all retries exhausted, data is local-only

The toolbar status dot (currently a simple binary) should reflect these four states.

#### 4.4.3 Server-Side Deduplication

The current server generates `versionId = ver-{timestamp}-{random}`. If the client retries a failed save, a duplicate version may be created. The server should accept an idempotency key:

The client sends `X-Idempotency-Key: {versionId}` in the request header (the `versionId` is generated client-side before the POST). The server stores this key and returns the existing record if the same key is received twice, preventing duplicates on retry.

**Table change required:** `project_versions` gains a `UNIQUE` constraint on `(project_id, idempotency_key)`.

---

## 5. Load Lifecycle (Completing the Cycle)

Loading is the inverse of saving. The current `ProjectLoader` is correct but incomplete in its integration.

### 5.1 Load Flow — Complete

```
User selects version from history
       │
       ▼
SaveOrchestrator.setLoading(true)         ← suppress autosave
       │
       ▼
Attempt to fetch from server:
GET /api/projects/:id/versions/:vid
       │
       ├── 200 OK → use server snapshot (authoritative)
       │
       └── failure → fall back to localStorage version
              (versionRepository.getVersions(projectId).find(v => v.id === vid))
       │
       ▼
PlatformShell shows loading overlay
       │
       ▼
loadDelegate.load(snapshot)
  → ProjectLoader.load(snapshot, { isCancelled })
      1. ClearProjectCommand
      2. AddLevelCommand × N
      3. AddGridCommand × N
      4. CreateColumnCommand × N
      5. CreateWallCommand × N + CreateWallOpeningCommand
      6. CreateSlabCommand × N
      7. CreateStairCommand × N
      8. CreateFurnitureCommand × N
      9. CreateRoofCommand × N
      10. CreateHandrailCommand × N
      11. CreatePlumbingFixtureCommand × N
      12. CreateCurtainWallCommand × N
      13. CreateBeamCommand × N
      14. vgGovernanceStore.restore(snapshot.vgGovernance)
      15. semanticIndex.restore(snapshot.semanticTags)
      16. viewDefinitionStore.restore(snapshot.viewDefinitions)
      17. visibilityRuleEngine.restore(snapshot.visibilityRules)
       │
       ▼
ILoadResult { success, loaded, failed, errors, warnings }
       │
       ▼
If failed > 0 → surface structured error list to user
       │
       ▼
SaveOrchestrator.setLoading(false)
SaveOrchestrator.resetDirty()             ← loaded state is "clean"
SaveOrchestrator.lastHash = hash(snapshot) ← baseline for next diff
       │
       ▼
markClean(version.label)
```

### 5.2 Load from Server vs Local Precedence

The server is the canonical store when Supabase is configured. The load sequence should always prefer the server snapshot. Local storage is the fallback for:
- Offline sessions
- Versions saved by autosave that have not yet synced (sync-pending versions)
- Emergency saves (tab-closed versions)

The `VersionRecord` should gain a `syncStatus: 'local-only' | 'synced' | 'sync-pending'` field so the UI can indicate which versions are server-backed.

### 5.3 Partial Load Recovery

When `ProjectLoader.load()` reports `failed > 0`, the system must not silently continue. The required behaviour:

1. Load what succeeded (all commands that did not throw).
2. Present a structured recovery modal listing the failed elements by type and ID.
3. Offer the user a choice: "Continue with partial load" or "Abort and restore previous state".
4. If abort: the orchestrator replays the previous snapshot from the version before the failed one.

This requires the `SaveOrchestrator` to retain a reference to the last known-good snapshot in memory (not just in localStorage) for the abort path.

---

## 6. Version Preview Mode

Currently absent in Pryzm. Required for a production BIM platform.

### 6.1 Design

Version preview mode allows a user to load a historical snapshot **without committing to it**. The current working state is held in memory and can be restored.

```
User clicks "Preview" on version V3
       │
       ▼
SaveOrchestrator.setVersionPreviewMode(true)
  → hasDirtyChangesRef preserved
  → autosave paused
  → SaveStatus = 'paused'
       │
       ▼
currentWorkingSnapshot = ProjectSerializer.serialize(...)  ← stash working state
       │
       ▼
ProjectLoader.load(V3.snapshot)  ← load historical version
       │
       ▼
UI shows: "Previewing V3 — [Restore Working State] [Promote to Current]"
       │
  User clicks "Restore Working State"
       │
       ▼
ProjectLoader.load(currentWorkingSnapshot)
SaveOrchestrator.setVersionPreviewMode(false)
  → if hasDirtyChanges: resume debounce immediately
```

**Key constraint:** While in preview mode, the user cannot edit the scene (the tool panel should be disabled). Preview is read-only. This prevents the user from accidentally editing a historical version and treating it as their current work.

---

## 7. Binary Asset Storage

Textures, uploaded reference images, and custom material files are currently not part of the save system. They must be handled separately because:
1. Base64-encoded binaries in the JSON snapshot make it enormous (a 2MB texture in base64 is ~2.7MB of JSON).
2. localStorage has a 5–10MB budget — a single texture exceeds it.

### 7.1 Strategy: IndexedDB + Asset Reference Protocol

Following Pascal's approach (`asset-storage.ts`):

**File:** `src/core/persistence/AssetStorage.ts`

```
const ASSET_PREFIX = 'pryzm_asset:'

async function saveAsset(file: File | Blob, mimeType: string): Promise<string>
// Stores file in IndexedDB under `pryzm_asset:{uuid}`
// Returns a custom URL: `pryzm-asset://{uuid}`

async function resolveAsset(url: string): Promise<string | null>
// If url starts with 'pryzm-asset://', fetches from IndexedDB, returns object URL
// If url starts with 'https://', returns as-is (server-hosted asset)
// Caches object URLs in memory to prevent leaks
```

Element properties that reference materials or textures store a `pryzm-asset://uuid` URL. The snapshot JSON remains small — it contains only the reference string. On load, `ProjectLoader` calls `resolveAsset()` when building Three.js materials.

**Server sync of assets:** Binary assets are separately uploaded to Supabase Storage (the `project-assets` bucket) at save time. The `pryzm-asset://uuid` in the snapshot is resolved against Supabase Storage on server-backed sessions. This means assets survive localStorage clearing.

---

## 8. Real-Time Collaboration Integration

The server already broadcasts `version-saved` via Socket.io. Pryzm does not consume this event in the UI. The completion of the collaboration layer requires:

### 8.1 Client-Side Socket Consumer

In `PlatformShell` (or `SaveOrchestrator`), subscribe to the `version-saved` event after Socket.io joins `project:{projectId}`:

```javascript
socket.on('version-saved', ({ versionId, label, elementCount, savedBy }) => {
    if (savedBy === currentUserId) return // ignore own saves
    showToast(`${collaboratorName} saved: ${label} (${elementCount} elements)`, 'info')
    // Optionally: refresh the version list panel
})
```

### 8.2 Conflict Resolution

When two collaborators save simultaneously, the server accepts both (last-write-wins by timestamp). True conflict resolution (CRDT or OT) is out of scope for the current persistence layer but the data model supports it: each `project_versions` row is immutable once written, so a merge-based resolution system can be layered on top without schema changes.

---

## 9. Monetisation Gating — Hardened

### 9.1 Current State

Client-side gating (`EntitlementStore`) is advisory. Server-side gating in `POST /api/projects/:id/versions` is authoritative. Both exist. The gap: `EntitlementStore` reads from `localStorage` synchronously — it does not validate the user's current plan against the server.

### 9.2 Required Change (No Code Yet)

Add `GET /api/me/plan` — returns `{ plan, maxVersionsPerProject, canSave }` based on the server-side `getUserPlan(userId)`. `EntitlementStore` fetches this on app init and caches it (with a 5-minute TTL). This closes the gap where a user on `free` plan could manually edit their `bim-platform-user` localStorage key to spoof an `architect` plan.

---

## 10. Full Data Flow Diagram — Annotated

```
┌────────────────────────────────────────────────────────────────────────┐
│  USER ACTION (draw wall, move furniture, add level, undo, redo)       │
└─────────────────────┬──────────────────────────────────────────────────┘
                      │ BIM store mutation
                      │ (store emits 'bim-store-mutated' OR subscription fires)
                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│  SaveOrchestrator                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Guards:                                                         │   │
│  │  isLoading? → discard                                          │   │
│  │  isVersionPreviewMode? → set pendingSave, return               │   │
│  │  isSaving? → set pendingSave, return                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  Debounce: 1000ms                                                      │
│  Hash diff: stableHash(snapshot) === lastHash? → skip                  │
│  status → 'pending'                                                    │
└─────────────────────┬──────────────────────────────────────────────────┘
                      │ debounce fires
                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│  EntitlementStore                                                      │
│  hasVersionHistory() === false? → skip (free plan, no local save)     │
│  canSaveVersion(existingCount) === false? → skip (limit reached)      │
└─────────────────────┬──────────────────────────────────────────────────┘
                      │ plan allows save
                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│  ProjectSerializer.serialize(stores, bimManager, opts)                │
│  → ProjectSnapshot {                                                   │
│       schemaVersion: 1,                                                │
│       timestamp, projectName, projectId, versionLabel,                 │
│       levels[], grids[], walls[], windows[], doors[],                  │
│       slabs[], columns[], stairs[], beams[], curtainWalls[],           │
│       roofs[], furniture[], handrails[], plumbing[], openings[],       │
│       elementCount,                                                    │
│       vgGovernance, semanticTags, viewDefinitions, visibilityRules    │
│    }                                                                   │
└─────────────────────┬──────────────────────────────────────────────────┘
                      │ snapshot
                      ▼
┌──────────────────────────────────────┐   ┌───────────────────────────────────┐
│  LAYER 2: localStorage               │   │  LAYER 3: ServerSyncQueue         │
│                                      │   │                                   │
│  versionRepository.saveVersions()    │   │  enqueue({ projectId, version })  │
│  → 'bim-project-{id}-versions'       │   │                                   │
│  (capped at 20, quota-aware)         │   │  flush() → POST /api/projects/    │
│                                      │   │    :id/versions                   │
│  projectRepository.saveProject()     │   │    { label, snapshot,             │
│  → 'bim-projects-index'              │   │      elementCount,                │
│  (atomic with version write)         │   │      X-Idempotency-Key: versionId │
│                                      │   │    }                              │
│  status → 'saved-local'              │   │                                   │
└──────────────────────────────────────┘   │  On 201: status → 'saved-remote' │
                                           │  On 4xx: drop + toast             │
                                           │  On 5xx: exponential retry        │
                                           │  On offline: suspend queue        │
                                           └───────────────────────────────────┘
                                                         │
                                                         ▼
                                           ┌───────────────────────────────────┐
                                           │  Supabase PostgreSQL              │
                                           │                                   │
                                           │  UPSERT projects                  │
                                           │  → { id, name, owner_id,          │
                                           │       updated_at }                │
                                           │                                   │
                                           │  INSERT project_versions          │
                                           │  → { id, project_id, label,       │
                                           │       snapshot (JSONB),           │
                                           │       element_count, created_by,  │
                                           │       created_at }                │
                                           │                                   │
                                           │  Socket.io broadcast:             │
                                           │  → 'version-saved' to             │
                                           │    room 'project:{id}'           │
                                           └───────────────────────────────────┘
```

---

## 11. File Map — What Changes and What is New

| Action | File | Change Type |
|---|---|---|
| **New** | `src/ui/platform/SaveOrchestrator.ts` | Replaces `wireEvents()` + `startAutoSave()` in `PlatformShell` |
| **New** | `src/ui/platform/ServerSyncQueue.ts` | Replaces `trySaveToServer()` in `PlatformShell` |
| **New** | `src/core/persistence/MigrationEngine.ts` | Schema versioning + migration chain |
| **New** | `src/core/persistence/AssetStorage.ts` | IndexedDB-backed binary asset storage |
| **Modified** | `src/ui/platform/PlatformShell.ts` | Remove `wireEvents()`, `startAutoSave()`, `trySaveToServer()`. Integrate `SaveOrchestrator` and `ServerSyncQueue`. Add `setLoading()` calls around `loadDelegate.load()`. |
| **Modified** | `src/ui/platform/ProjectRepository.ts` | Add `saveVersionWithMeta()` coordinated write. Add storage quota estimation. |
| **Modified** | `src/ui/platform/PlatformShellTypes.ts` | Add `syncStatus` to `VersionRecord`. Add `SaveStatus` type. |
| **Modified** | `src/core/persistence/ProjectSerializer.ts` | Hook `MigrationEngine.migrateToLatest()` into `parse()`. Add `thumbnail` capture option. |
| **Modified** | `src/engine/EngineBootstrap.ts` | Wire `SaveOrchestrator` with store subscription. Inject `setLoading` callback. |
| **Modified** | `server.js` | Add `X-Idempotency-Key` deduplication on `POST /api/projects/:id/versions`. Add `GET /api/me/plan`. |
| **Modified** | Supabase schema | Add `UNIQUE(project_id, idempotency_key)` to `project_versions`. |

---

## 12. Implementation Phases

### Phase 1 — Foundation (High Priority, No Breaking Changes)
1. Create `SaveOrchestrator` with single-event subscription and 1-second debounce
2. Wire `setLoading(true/false)` around `ProjectLoader.load()` in `PlatformShell`
3. Add `beforeunload` flush to `SaveOrchestrator`
4. Replace `trySaveToServer()` with `ServerSyncQueue` (basic retry, no backoff yet)
5. Add content-hash dirty detection (replacing boolean flag)

**Outcome:** Autosave fires within 1 second of changes. No data loss on tab close. Load guard prevents corrupt saves.

### Phase 2 — Robustness
1. Add exponential backoff to `ServerSyncQueue`
2. Add offline/online detection and queue suspension
3. Add `idempotency_key` to server POST and Supabase schema
4. Add `syncStatus` field to `VersionRecord` and surface in version history UI
5. Add storage quota estimation and aggressive trimming fallback

**Outcome:** Server sync is reliable. User can see which versions are server-backed.

### Phase 3 — Completeness
1. Implement `MigrationEngine` with the v1→v2 migration path (even if empty — establishes the pattern)
2. Add `GET /api/me/plan` and update `EntitlementStore` to validate against server
3. Implement version preview mode (`setVersionPreviewMode`, working state stash, restore/promote UI)
4. Add thumbnail capture on manual save

**Outcome:** Full version lifecycle. Plan gating is server-authoritative. Users can safely explore version history.

### Phase 4 — Advanced
1. Implement `AssetStorage` (IndexedDB + Supabase Storage bucket)
2. Implement partial load recovery modal (show failed elements, offer abort path)
3. Implement `version-saved` Socket.io consumer in the UI for collaboration awareness
4. Add `GET /api/me/plan` TTL cache and plan-change event propagation

**Outcome:** Binary assets survive sessions. Collaboration is visible. Full recovery from corrupt snapshots.

---

## 13. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Content hash computation too slow for large projects | Medium | Medium | Use async hash (requestIdleCallback). Cap at 2MB snapshot before hashing. |
| localStorage quota exceeded silently | High | High | Add quota estimator in Phase 1. Aggressive trim fallback. |
| Server sync retry storms on reconnect | Low | Medium | Exponential backoff + jitter in `ServerSyncQueue` |
| `MigrationEngine` applied incorrectly corrupts old snapshots | Low | Critical | Migration functions must be pure (no side effects). Test against snapshotted fixtures. |
| `beforeunload` flush blocked by browser (mobile) | Medium | Low | `beforeunload` is unreliable on mobile browsers. Accept limitation; document it. |
| Race between autosave and manual save | Low | Medium | `isSaving` guard in `SaveOrchestrator` handles this. |
| Version preview mode: user edits in preview | Medium | High | Disable all tools while `isVersionPreviewMode === true`. |
| Supabase `project_versions` snapshot JSONB column exceeds 1GB limit | Very Low | Critical | Practical limit is ~50MB per row; a BIM snapshot is <5MB. Non-issue in practice. |

---

## 14. Testing Strategy (Non-Code — Acceptance Criteria)

Each phase must satisfy the following acceptance criteria before the next phase begins:

**Phase 1:**
- Adding a wall triggers a save within 1.5 seconds (1000ms debounce + serialisation time)
- Closing the tab with unsaved changes → reopening → version labelled "Emergency save" appears in history
- Loading a version does not trigger an autosave during load
- Undo to the exact previously-saved state does not trigger a save (hash matches)

**Phase 2:**
- Toggling offline (DevTools → Network → Offline) mid-save → queue holds → reconnect → sync completes
- Saving the same version twice (simulated retry) → server returns existing record, no duplicate in Supabase
- Version history UI shows amber "local only" badge on unsynced versions

**Phase 3:**
- Loading a v1 snapshot with a field renamed in v2 → `MigrationEngine` silently upgrades it; no console error
- Plan-spoofing (manually editing localStorage plan key to "architect") → server rejects version save with 403
- Clicking "Preview v3" → scene changes → clicking "Restore working state" → working changes are back

**Phase 4:**
- Uploading a custom texture → saving → clearing localStorage → reloading → texture still present (from Supabase Storage)
- Collaborator saves → toast appears within 2 seconds for connected peers
- ProjectLoader reports 3 failed walls → recovery modal shows wall IDs → "Abort" → previous clean state restored

---

## 15. Relationship to Existing Contract Documents

| Contract | Relevant Clauses | How This Plan Honours Them |
|---|---|---|
| `01-BIM-ENGINE-CORE-CONTRACT.md` | §1.2 No direct store mutation from platform | `SaveOrchestrator` reads via `ProjectSerializer` only. No store writes. |
| `05-BIM-UI-ARCHITECTURE-CONTRACT.md` | §6.1 No BIM engine imports in platform UI | `SaveOrchestrator` and `ServerSyncQueue` import only interfaces from `PlatformShellTypes`. |
| `05-BIM-UI-ARCHITECTURE-CONTRACT.md` | §6.7 Single write owner per localStorage key | `ProjectRepository` and `VersionRepository` singletons remain the only writers. |
| `07-BIM-SECURITY-CONTRACT.md` | §1.4 All AI/server calls through Express middleware | `ServerSyncQueue` calls `/api/projects/:id/versions` — goes through `authMiddleware` and `rateLimiter`. |
| `09-DATABASE-PERSISTENCE-ARCHITECTURE.md` | localStorage-first, server-secondary | This plan promotes server to co-primary with queue-based sync, not replacing localStorage. |
| `18-VERSIONING-STATE-MACHINE-CONTRACT.md` | Version state machine | `SaveStatus` state machine in this document extends the existing versioning state contract. |

---

*Document authored: March 2026. No code changes applied. Implementation follows the phased plan above.*
