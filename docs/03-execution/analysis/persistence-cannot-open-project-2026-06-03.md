# Root-cause analysis — "cannot open previously-created projects"

**Date:** 2026-06-03
**Author:** analysis pass (read-only; no feature code changed)
**Severity:** P0 daily-use blocker, with **data-recoverability implications** (see §7)
**Status:** root-caused; fixes ranked in §6 (none applied — this is an analysis doc)

---

## §1. Evidence (the log facts)

Signed in as owner, opening projects from the hub (console, 2026-06-03):

1. **Older projects HARD-FAIL.**
   `PlatformRouter.ts:596 Opening project: "Test" (proj-1779618401170-ea40b3e7812e)`
   → `runtime.persistence.openProject failed: [persistence.openProject] project not found: proj-1779618401170-ea40b3e7812e`
   The throw originates at **`packages/runtime-composer/src/buildPersistence.ts:220`** (the message string is built there; the console attributed it to `:105` in the deployed bundle), surfaced through `PlatformRouter._openProjectViaRuntime` (`PlatformRouter.ts:443/691`). Same for `"lhhh" (proj-1779262598382-…)`.

2. **A NEWER project opens — but only via a LOCAL fallback.**
   `Opening project: "njk,n" (proj-1780458882549-…)`
   → `GET /api/projects/proj-1780458882549…/latest-version 404 (Not Found)` (fetched at `buildPersistence.ts:145`)
   → `[persistence.tier.streamLoad] Server 404 …` (`buildPersistence.ts:150`)
   → `PlatformShell.ts:173 Auto-restoring latest local version: Auto-save`
   → `ProjectLoader Loading "njk,n" (12 elements)` — **loaded from LOCAL storage, not the server.**

3. **Secondary error during the local restore:**
   `RoomBoundingLineBuilder.ts:68 Uncaught` — thrown while loading 1 room-bounding-line from the snapshot
   (chain: `CreateRoomBoundingLineCommand.ts:96` → `RoomBoundingLineStore.ts:75` → `initBuilders.ts:850`).

4. **Id timestamps:** failing ids are `proj-1779…` (earlier); the locally-restorable one is `proj-1780458882549` (more recent). Owner is authenticated (no 401 on any of these).

---

## §2. The open-vs-list source divergence (the primary root cause)

The hub LIST and the project OPEN read from **two different sources** that are allowed to disagree.

### 2a. What the hub LISTS from — localStorage
`ProjectHub` renders its grid and all per-card actions from `projectRepository.listProjects()`, a **localStorage**-backed repo (`apps/editor/src/ui/platform/ProjectRepository.ts:205`, keyed by `bim-projects-index`). Every grid/sidebar read goes through it (`ProjectHub.ts:283, 810, 874, 913, 1156, 1222, 1261`).

`syncFromServer()` (`ProjectHub.ts:118`) reconciles that localStorage cache against the server list (`client.list()` → `GET /api/projects`). Its purge rule (`ProjectHub.ts:168-182`) is **conservative**:

> remove a local entry **only if** the server doesn't list it (`!serverIds.has(lp.id)`) **AND** it has no local version data (`bim-project-<id>-versions` empty).

So a project that the server has forgotten but that still has **local versions is deliberately KEPT in the grid** (`ProjectHub.ts:174-176`). These are exactly the `proj-1779…` cards the user clicks.

### 2b. What OPEN resolves from — the runtime's server-backed list store
`openProject(projectId)` (`buildPersistence.ts:205`) resolves the project from `projectListStore` (`buildPersistence.ts:214`), which is populated by `controller.refresh()` → `client.list()` → `GET /api/projects` (the **server** list). If the id is absent it refreshes once and **throws** (`buildPersistence.ts:218-221`):

```ts
summary = projectListStore.list().find(p => p.id === projectId);
if (!summary) throw new Error(`[persistence.openProject] project not found: ${projectId}`);
```

The throw happens at **step 1 of 5** — *before* `tier.streamLoad()` (step 3, `:239`) and *before* `attachedSurface.setProjectContext()` (step 4, `:260`), which is the leg that would have triggered the local auto-restore.

### 2c. Why older = hard-fail, newer = local-fallback
The **only** difference is whether the id is in the server list at open time:

| | in localStorage grid? | in server `client.list()`? | open outcome |
|---|---|---|---|
| `proj-1779…` (older) | yes (kept: has local versions) | **no** (server forgot it) | **throws at `:220` — never reaches local restore** |
| `proj-1780458882549` (newer) | yes | **yes** (still in volatile memory this session) | resolves summary → `streamLoad` 404 → `setProjectContext` → **local restore (`PlatformShell.ts:173`)** |

The newer project's server list entry lets `openProject` past the resolution gate; `streamLoad` then 404s on the *version* (no durable version row), `streamLoad` returns `null` (`buildPersistence.ts:150`, a soft fallback), and `setProjectContext` finds local versions and restores them. The older projects never get that far. **Same underlying cause (no durable server record), two different failure modes because the list-resolution gate is stricter than the version-fetch gate.**

---

## §3. Server durability — the records are VOLATILE, not Postgres

### 3a. Two stores, one of them in-memory
The server resolves `/api/projects` reads/writes in priority order Supabase → direct PG pool (`getPgPool()`) → **in-memory fallback** (`server.js:2558-2593`, `:2636-2644`, `:3081-3105`). The in-memory store is a plain JS `Map`:

```js
// server/projectStore.js:44
const _inMemoryProjects = new Map(); // id → { id, name, owner_id, ... }
```

`imGetProject/imListProjects/imUpsertProject` (`projectStore.js:110-139`) read/write **this Map unconditionally**. A `Map` does not survive a process restart — every `npm run dev` / `tsx server.js` restart starts it empty (`server.js:5587` explicitly warns about the "OLD in-memory process"; `:5658` "in-memory fallback (DEV-only — data resets on restart)").

### 3b. The list/version endpoints fall through to it
- `GET /api/projects` (list): if no Supabase and `getPgPool()` is null → `pgProjectStore.imListProjects(userId)` (`server.js:2589-2592`, logged as `'in-memory'`).
- `GET /api/projects/:id/latest-version`: in-memory branch (`server.js:3089-3105`). For an **unknown id** it intentionally does **not** 404 — it falls through to `{ version: null }` (the `§PROJECT-OPEN-FAIL-FRESH` comment at `:3090`). The observed **404** for "njk,n" therefore came from the **Supabase ownership pre-check** (`server.js:3064-3066`, `if (!proj) return 404`) or the PG path — i.e. a backend IS partially configured, but the project **record/version row is not durably present**, so the version lookup misses.

### 3c. Does `DATABASE_URL` gate it? Yes — but *presence ≠ reachability*
- `getPgPool()` returns a pool only if `DATABASE_URL` **or** `SUPABASE_DB_URL` resolves (`server/pgClient.js:39-50`); otherwise `null` → in-memory path.
- This repo's `.env` **does** contain `DATABASE_URL` (confirmed it exists; value not read — it is a secret). **But a present URL is not a reachable DB.** If `runMigrations()` fails against a stale/unreachable URL, the boot path **marks migrations "settled" WITHOUT schema-ready and deliberately opens the gate to the in-memory degrade path** (`server.js:5681-5697`, `§SERVER-503-MIGRATION-GATE-DEADLOCK`). In that state created projects live only in `_inMemoryProjects` and vanish on restart — which is exactly what the evidence shows (server has no durable record for the `proj-1779…` ids the client still lists).
- **Net:** whether the user's local server is durably persisting depends on the boot banner (`server.js:5645-5660`, `§SERVER-BOOT-CONFIG-DIAGNOSTIC v1 backend: …`). The behaviour in the evidence is consistent with the in-memory degrade path being active for these records (server forgot projects created in a prior session).

**Finding: the project RECORD on the server is not durably persisted in the failing scenario.** The hub lists from durable localStorage; the server "forgot" the records on restart (volatile Map, or unreachable PG → in-memory degrade). The list source (durable, client-side) outlives the open source (volatile, server-side) → divergence.

---

## §4. Why the local fallback works for some, not all

Local persistence is robust and keyed per project; it is **not** the limiting factor — the open-path gate is.

- Versions are stored in localStorage at `bim-project-<projectId>-versions` (`ProjectRepository.ts:328-341`, possibly compressed), read by `versionRepository.getVersions(id)`.
- `PlatformShell.setProjectContext` checks local versions **first** (`PlatformShell.ts:170-174`): if `localVersions.length > 0` it auto-restores the latest **without any server call**. This is the leg that loaded "njk,n".
- Therefore *any* project that (a) has local versions **and** (b) reaches `setProjectContext` will restore from local — including the older ones. The older projects fail **only** because `openProject` throws at the list-resolution gate (§2b) and never reaches `setProjectContext`.

So "works for njk,n, not for Test/lhhh" is **not** because Test/lhhh lack local data — they almost certainly have it (the purge rule §2a kept them *because* they have local versions). It is because their id is missing from the **server** list and the open path treats a missing server list entry as fatal.

---

## §5. The secondary bug — `RoomBoundingLineBuilder.ts:68 Uncaught`

This is an independent **wiring** defect (wrong payload shape), not a persistence bug.

- The store emits a DOM event carrying **only the id**: `_bus.emit('bim-room-bounding-line-added', { id: frozen.id })` (`RoomBoundingLineStore.ts:75`; `_bus` is a `DOMEventBus` that `dispatchEvent`s a `CustomEvent` whose `detail` is the payload — `packages/event-bus/src/DOMEventBus.ts:50-51`).
- The listener passes that thin payload straight into the builder: `roomBoundingLineBuilder.build(data)` where `data = { id }` (`initBuilders.ts:848-850`).
- `build()` immediately dereferences fields that don't exist on `{ id }`: `data.placement.start` (`RoomBoundingLineBuilder.ts:71`) and `data.properties.isActive` (`RoomBoundingLineBuilder.ts:68`) → **`Cannot read properties of undefined`**.

Is it swallowed? **Partially.** The `CreateRoomBoundingLineCommand.execute()` is wrapped in try/catch by `ProjectLoader.ts:957-971`, but the store's `add()` emits the DOM event **synchronously inside** `roomBoundingLineStore.add()` (`RoomBoundingLineStore.ts:69-76`), and the failing code runs inside the `window.addEventListener` handler (`initBuilders.ts:848`). Exceptions thrown from a DOM event listener are reported to `window.onerror` as **"Uncaught"** (matching the log) and do **not** propagate back into the command's try/catch. Practical impact: **the project load continues** (the command returns `success`, the element is in the store), but the bounding line **never renders** and the console shows a scary uncaught error on every open of any project containing a room-bounding-line. Low functional severity, high noise/confusion.

Note the payload-shape mismatch is the real bug: the builder expects full `RoomBoundingLineData`, the event ships `{ id }`. Either the listener should look the full record up from the store before building, or the event should carry the full data (other builders in `initBuilders` follow one of these patterns).

---

## §6. Ranked fixes

### Q1 (quick, highest leverage) — make `openProject` degrade to local when the server has no record
Mirror the existing version-404 tolerance (§4) at the **list-resolution** gate. In `buildPersistence.ts:218-221`, instead of throwing when the summary is absent, fall through with a minimal summary `{ id: projectId, name: hint?.name ?? projectId }` so steps 2-4 still run and `PlatformShell.setProjectContext` reaches the **local auto-restore** path (`PlatformShell.ts:170-174`). This single change makes the older projects open exactly the way "njk,n" already does. Low risk, unblocks the user immediately, and **recovers the older projects from local** (see §7). *(Guard: only soft-fall-through when the caller is opening a project the hub listed — the deep-link "truly unknown id" case may still warrant a user-facing "not found".)*

### Q2 (quick) — fix the RoomBoundingLine load error (§5)
In `initBuilders.ts:848-850`, look the full record up from `roomBoundingLineStore` by `data.id` before calling `build()`, OR emit the full `RoomBoundingLineData` from `RoomBoundingLineStore.add()` instead of `{ id }`. Add a defensive guard in `RoomBoundingLineBuilder.build()` for missing `placement`/`properties`. Removes the uncaught error and actually renders the line.

### S1 (structural) — durable server persistence
Ensure `DATABASE_URL`/`SUPABASE_DB_URL` points at a **reachable** PG in the dev env, and surface the boot banner (`server.js:5645-5660`) state to the operator/UI. While the server is on the in-memory degrade path, **no project record survives a restart** — that is the underlying cause. Consider failing loud (or a persistent on-disk dev store) instead of silently degrading to a volatile Map.

### S2 (structural) — reconcile the list source with the open source
Today the hub lists from localStorage and open resolves from the server list. Either (a) drive both from one store (`runtime.persistence.projectListStore`, which `syncFromServer` already feeds), or (b) seed `projectListStore` from the localStorage cache on boot so `openProject`'s resolution can't be stricter than the grid. This removes the class of bug, not just this instance.

### S3 (structural) — don't list unopenable projects (last resort)
If S1/S2 aren't taken, at minimum the grid should visually mark "local-only / server-forgotten" projects and route them through a local-only open path, so the user never clicks a card that hard-fails. (Less desirable than Q1 — it hides recoverable data instead of recovering it.)

**Recommended order:** Q1 + Q2 now (unblock + de-noise), then S2 (reconcile sources), then S1 (durable server). S3 only if S1/S2 slip.

---

## §7. User-facing severity & recoverability

**Severity: P0 daily-use blocker.** The user cannot open their older projects at all — the open hard-fails before doing anything.

**Are the older projects RECOVERABLE? — YES, almost certainly, from the local browser.** Reasoning:
1. The hub still **lists** `Test`/`lhhh`, and the purge rule keeps a server-forgotten project **only if it has local version data** (`ProjectHub.ts:168-182`). Their continued presence in the grid is itself evidence that `bim-project-<id>-versions` is populated in localStorage.
2. Local versions live at `bim-project-<projectId>-versions` (`ProjectRepository.ts:328`) and are read by the auto-restore path (`PlatformShell.ts:170-174`) — the exact path that already restored "njk,n" from local.
3. The data is **not lost; it is unreachable** purely because `openProject` throws before reaching that path. Fix **Q1** makes the older projects open and restore from local immediately — no data migration needed.

**Caveats / data-loss risk to call out:**
- Recovery depends on the data still being in **this browser profile's localStorage** (same machine, same browser, not cleared). It is **not** recoverable from another device, and a localStorage clear / quota-eviction would lose it. The free-plan / offline projects were never durably on the server.
- Until Q1 ships, advise the user **not** to clear browser data and to keep using the same browser — the only surviving copy of `Test`/`lhhh` is local.
- Anything created on the **in-memory server path and never auto-saved locally** would be gone (volatile Map lost on restart). But the auto-save → localStorage path (the "Auto-save" label seen for "njk,n") means typical use does have a local copy.

**Bottom line:** the older projects are recoverable from local storage; the bug is that the open path refuses to reach the local-restore leg. The highest-leverage single fix is **Q1** (soft-fall-through in `buildPersistence.openProject`), which mirrors the version-404 tolerance the newer project already benefits from.
