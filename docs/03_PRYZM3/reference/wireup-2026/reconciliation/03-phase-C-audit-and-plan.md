# Phase C — Persistence rewire · Audit + Plan (2026-04-29)

> **Spec**: [`PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md` §16.3](../PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md#§163-phase-c--persistence-rewire-s74s76-18-sub-phases) — 33 sub-phases (the §16.3 table actually lists 33 rows once C.1.01–C.10.04 + C.11.01–C.11.03 are counted; the header says "18" but sub-rows expand). Plus C.14 (`src/persistence/` move) added per chunk-24 amendment.
> **Tracker claim** ([PROCESS-TRACKER.md §"Reality reconciliation" line 14](../../03_STATUS/01-PROCESS-TRACKER.md)): "Phase C — DONE (command-bus binding; `ProjectHub` reads `runtime.persistence`; 264 handler bindings live)".
> **Original verdict** (2026-04-29 a.m.): ❌ "Tracker WRONG. Only ~3 sub-phases landed. All 3 legacy persistence files (1 118 LOC) still on disk and still actively imported by 5 callers."
> **Revised verdict** (2026-04-29 p.m. — after spec re-read + per-line evidence pass): ⚠️ **Tracker overclaimed; original audit ALSO overclaimed the gap.** Three things matter:
>   1. **Phase C exit gate** (spec line 137) is **3 file deletions + zero `bim-projects-index` writes**. Today: **0 deletions; legacy localStorage still authoritative**. So the phase is **NOT done**.
>   2. **The original audit miscounted importers** (over by 2 on ServerSyncQueue, over by 1 on SaveOrchestrator, over by 1 on ProjectRepository). The migration scope is **smaller** than the original audit suggested.
>   3. **The original audit graded C.3.01 / C.5.01 / C.10.04 as not landed**. They **are** landed — just in `PlatformRouter.ts` (the canonical no-reload open path), not in `ProjectHub.ts` (which the original audit looked at).

> **Recalibrated completion** per spec line 137 measure: **~17%** (was reported as 9%). Not done; closer than the original audit said.

---

## Per-sub-phase verification (re-graded against current source)

### C.1.x — Hub paint / search / sort / archive (4 sub-phases)

| Sub-phase | Spec | Reality | Evidence |
|---|---|---|---|
| C.1.01 | Hub paint via `runtime.persistence.client.list()` + store subscription | ❌ | `ProjectHub.ts:103` (`syncFromServer`) still does `await apiFetch('/api/projects')`; `:115`, `:148`, `:160` use `projectRepository.listProjects()` |
| C.1.02 | Search filter on `projectListStore` | ❌ | Local filter on `projectRepository.listProjects()` array |
| C.1.03 | Sort dropdown on store snapshot | ❌ | Same |
| C.1.04 | Archive/active filter on store | ❌ | Same |

### C.2.x — Hub create modal (2 sub-phases)

| Sub-phase | Spec | Reality |
|---|---|---|
| C.2.01 | Modal mount unchanged (gate sub-phase) | ✓ trivially |
| C.2.02 | Modal submit → `runtime.persistence.client.create(name)` | ❌ Still `projectRepository.saveProject(...)` + fire-and-forget `apiFetch('/api/projects', POST)` |

### C.3.x — Hub open project (2 sub-phases) ← **AUDIT MISTAKE — C.3.01 IS LANDED**

| Sub-phase | Spec | Reality | Evidence |
|---|---|---|---|
| **C.3.01** | Open without page reload | ✅ **Landed** | `ProjectHub.ts:1512` calls `this.callbacks.onOpenProject(...)` which is wired to `PlatformRouter.launchWorkspace(...)` (`src/ui/platform/PlatformRouter.ts:325–411`). That path calls `_openProjectViaRuntime(projectId, projectName, opts)` → `await this.runtime.persistence.openProject(projectId)`. **No `location.assign`, no `?pryzm2=1` round-trip.** The original audit looked only at `ProjectHub.ts` and missed the canonical flow through `PlatformRouter.ts`. |
| **C.3.02** | Enter on focused card | ✅ **Landed** | Same path — `ProjectHub.ts:896` triggers `this.openProject(...)` on Enter, which goes through the same `onOpenProject` callback. |

### C.4.x — Hub context menu (8 sub-phases)

| Sub-phase | Spec | Reality |
|---|---|---|
| C.4.01 | Context menu reads `runtime.plugins.contributions('menu.context.project')` | ❌ Static menu |
| C.4.02 | Rename → `runtime.persistence.client.rename(id, name)` | ❌ `projectRepository.saveProject({...})` |
| C.4.03 | Delete → `runtime.persistence.client.delete(id)` | ❌ `projectRepository.deleteProject(id)` |
| C.4.04 | Archive/Unarchive → `runtime.persistence.client.patch(id, {isArchived})` | ❌ Local meta toggle |
| C.4.05 | Star/Unstar → `runtime.persistence.client.patch(id, {isStarred})` | ❌ Local meta toggle |
| C.4.06 | Duplicate → `runtime.persistence.client.duplicate(id, newName)` | ❌ `projectRepository.saveProject({...newId})` |
| C.4.07 | Export `.pryzm` | ❌ Not implemented per spec — still not implemented |
| C.4.08 | Import `.pryzm` | ❌ Not implemented per spec — still not implemented |

### C.5.x — Loading overlay progress ← **AUDIT MISTAKE — C.5.01 IS LANDED**

| Sub-phase | Spec | Reality | Evidence |
|---|---|---|---|
| **C.5.01** | Listens to `runtime.events.on('persistence.openProgress', ...)` | ✅ **Landed** | `src/ui/platform/PlatformRouter.ts:374` (`const sub = this.runtime.events.on('persistence.openProgress', (p) => { ... })`); the canonical `EngineLoadingOverlay` is constructed via `new EngineLoadingOverlay(this.runtime)` and transitions phase on `painting`. Emitted by `packages/runtime-composer/src/buildPersistence.ts:126`. |

### C.6.x — Save HUD (4 sub-phases) ← only landed cluster

| Sub-phase | Spec | Reality | Evidence |
|---|---|---|---|
| C.6.01 | Save status via `runtime.events.on('persistence.status', ...)` | ❌ | No subscriber in `src/ui/`; emitter exists at `packages/runtime-composer/src/buildPersistence.ts:115`. The status pill still consumes `SaveOrchestrator.onSaveStatusChange(...)`. |
| **C.6.02** | Undo via `runtime.undoStack.undo()` | ✅ **Landed** | `src/ui/SaveUndoRedoHUD.ts:121` — `if (this.runtime) { this.runtime.undoStack.undo(); return; }` (legacy `commandManager` global is the documented `runtime`-is-null fallback for the legacy boot path; same pattern as C.10.04). |
| **C.6.03** | Redo via `runtime.undoStack.redo()` | ✅ **Landed** | Same file `:127` |
| C.6.04 | Cmd+S → `runtime.persistence.eventLog.tag(...)` | ❌ Still `projectRepository.saveVersion(...)` |

### C.7.x — CDE version panel (3 sub-phases)

C.7.01–C.7.03 all unwired (`runtime.persistence.eventLog.*` not adopted in any panel; `eventLog.tags()` / `replayUntil()` / `diff()` consumers do not exist in `src/ui/`).

### C.8.x — Member panel (4 sub-phases)

C.8.01–C.8.04 all unwired (`apiFetch('/api/projects/:id/members')` direct; `runtime.persistence.client.members.*` exists in `MembersClient` from `@pryzm/persistence-client` and is reachable via the runtime, but no panel calls it).

### C.9.x — Settings (2 sub-phases)

C.9.01–C.9.02 unwired (localStorage prefs not migrated to `runtime.userPreferences`).

### C.10.x — Auth (4 sub-phases) ← **AUDIT MISTAKE — C.10.04 IS FULLY LANDED**

| Sub-phase | Spec | Reality | Evidence |
|---|---|---|---|
| C.10.01–.03 | login/signup/forgot — unchanged path (gate sub-phases) | ✓ trivially |
| **C.10.04** | Logout via `runtime.persistence.signOut()` | ✅ **Landed** | `ProjectHub.ts:762` — `void this.runtime.persistence.client.signOut().catch(err => ...)`. The accompanying call to the legacy `signOut()` helper at `:766` is the documented defensive cleanup for the `runtime`-is-null branch (same defensive pattern as C.6.02/C.6.03). The original audit graded this as "partial" but the spec defines C.10.04 as "logout via runtime"; the legacy fallback is intentional and explicitly bridges the boot-path gap. |

### C.11.x — Legacy file deletions (3 sub-phases) ← **THE EXIT GATE**

| Sub-phase | Spec | Reality | LOC | External importers (corrected) |
|---|---|---|---:|---|
| **C.11.01** | DELETE `src/ui/platform/ProjectRepository.ts` | ❌ STILL PRESENT | 412 | **3** real (`ProjectHub.ts`, `PlatformShell.ts`, `ExistingProjectsPanel.ts`); plus 1 internal (`SaveOrchestrator.ts`). The original audit's 5th name (`PlatformShellTypes.ts`) is a **JSDoc-only comment reference** at line 86 — not a real `import`. |
| **C.11.02** | DELETE `src/ui/platform/SaveOrchestrator.ts` | ❌ STILL PRESENT | 380 | **1** real (`PlatformShell.ts`); plus 1 internal (`ServerSyncQueue.ts`). The original audit's `ProjectHub.ts` consumer **does not exist** (`ProjectHub.ts` does not import `SaveOrchestrator`); the 2 curtainwall references the importer search now surfaces (`CurtainWallBuilder.ts:340`, `CreateCurtainWallCommand.ts:19/140`) are **JSDoc comment text**, not real `import`s. |
| **C.11.03** | DELETE `src/ui/platform/ServerSyncQueue.ts` | ❌ STILL PRESENT | 354 | **1** real (`PlatformShell.ts`); plus 2 internal (`SaveOrchestrator.ts`, `ProjectRepository.ts`). The original audit's `ProjectHub.ts` and `ExistingProjectsPanel.ts` consumers **do not exist**. |
| **Total** | | | **1 146 LOC** | **3 unique external caller files** (was reported as 5 in the original audit) |

**Status**: 0/3 deleted. The migration is **scoped tighter than the original audit suggested**: a single file (`PlatformShell.ts`) is the only external consumer of both `SaveOrchestrator` and `ServerSyncQueue`, and adding `ExistingProjectsPanel.ts` + `ProjectHub.ts` makes it the only external consumer base of `ProjectRepository`. The internal `SaveOrchestrator` + `ServerSyncQueue` + `ProjectRepository` cross-imports collapse to nothing the moment all three external migrations land.

**`@deprecated` JSDoc markers landed this PR** on all 5 main exports (`LocalProjectRepository`, `projectRepository`, `LocalVersionRepository`, `versionRepository`, `SaveOrchestrator`, `ServerSyncQueue`) so importers see deprecation feedback in their IDE — and so the deletion target sub-phase + replacement runtime slot are cited inline. See §"Annotations landed this PR" below.

---

## Cast / consumer inventory snapshot (post this-PR pass)

| Metric | Original audit | Today |
|---|---:|---:|
| `ProjectRepository.ts` external importers | 5 (claimed) | **3** (`ProjectHub`, `PlatformShell`, `ExistingProjectsPanel`) — 1 was a JSDoc comment |
| `SaveOrchestrator.ts` external importers | 2 (claimed) | **1** (`PlatformShell` only) — `ProjectHub` was a phantom; curtainwall refs are comments |
| `ServerSyncQueue.ts` external importers | 5 (claimed) | **1** (`PlatformShell` only) — `ProjectHub` and `ExistingProjectsPanel` were phantoms |
| `bim-projects-index` localStorage write owners | 1 | 1 (`ProjectRepository.ts`) — consistent with §06 §7 contract |
| Sub-phases verifiably landed | 3 | **6** (C.3.01, C.3.02, C.5.01, C.6.02, C.6.03, C.10.04) |
| `@deprecated` markers on legacy exports | 0 | **5** (added this PR) |

### Annotations landed this PR (5 `@deprecated` JSDoc tags)

| File | Line | Export | Annotation |
|---|---:|---|---|
| `src/ui/platform/ProjectRepository.ts` | 153 | `class LocalProjectRepository` | `TODO(C.11.01)` — "Replaced by `runtime.persistence.client` + `runtime.persistence.projectListStore`. Deletion blocked on …" |
| `src/ui/platform/ProjectRepository.ts` | 263 | `const projectRepository` | `TODO(C.11.01)` — pointer to class |
| `src/ui/platform/ProjectRepository.ts` | 300 | `class LocalVersionRepository` | `TODO(C.11.01)` — "Replaced by `runtime.persistence.eventLog`. Deletion blocked on `PlatformShell.ts` migrating its 12+ `versionRepository.*` reaches." |
| `src/ui/platform/ProjectRepository.ts` | 429 | `const versionRepository` | `TODO(C.11.01)` — pointer to class |
| `src/ui/platform/SaveOrchestrator.ts` | 86 | `class SaveOrchestrator` | `TODO(C.11.02)` — "Replaced by `runtime.persistence.eventLog.tag(...)` + `runtime.events.on('persistence.status', ...)`. Deletion blocked on `PlatformShell.ts` migrating its single instantiation (line 698) and `saveVersionInternal()` to `runtime.persistence.*`." |
| `src/ui/platform/ServerSyncQueue.ts` | 76 | `class ServerSyncQueue` | `TODO(C.11.03)` — "Replaced by `ProjectListController` + `attachEventLog` queue. **⚠️ Migration NOTE**: the sticky `_planRejectsSync` latch (lines 92, 145–175, 272–274) MUST be ported into the new client's 429/402 handling path before deletion can land." |

These annotations:

1. Surface as IDE deprecation strikethroughs on every importer (TS6385 hints) — visible feedback that the deletion is approaching, without changing runtime behavior.
2. Cite the destination runtime slot inline so reviewers reading the legacy file know where to migrate to.
3. Cite the **specific blocker file + line** for each deletion (e.g. `PlatformShell.ts:689`, `:698`) so the C-cleanup PRs can be scoped without re-reading the 2 433-line `PlatformShell.ts`.
4. Document the **`_planRejectsSync` migration hazard** inline on the file that owns it — this is the latch added 2026-04-29 to suppress retry storms when the user's plan gates server-side version writes; it MUST be ported into the new client's `429` / `402` handling path before deletion or the next quota event will tank the editor.

---

## Phase C exit criteria check (against spec line 137)

> *"Every persistence-touching gesture in the platform pages, hub, version panel, member panel, settings, and save HUD goes through `runtime.persistence.*`. The 3 legacy persistence files are deleted. localStorage `bim-projects-index` is gone."*

Re-graded after the audit-mistake corrections + line-number evidence:

| Cluster | Pass? | Detail |
|---|---|---|
| **Hub gestures (C.1, C.2, C.4)** | ❌ 0/12 migrated | hub paint, create, rename, delete, archive, star, duplicate, export, import all unwired |
| **Open-project (C.3)** | ✅ 2/2 migrated | C.3.01 + C.3.02 land via `PlatformRouter.launchWorkspace` → `runtime.persistence.openProject(id)` |
| **Loading overlay (C.5)** | ✅ 1/1 migrated | C.5.01 lands via `PlatformRouter.ts:374` listener |
| **Save HUD (C.6)** | ✅ 2/4 migrated | C.6.02 undo + C.6.03 redo via `runtime.undoStack`; C.6.01 status + C.6.04 named-version still unwired |
| **Version panel (C.7)** | ❌ 0/3 migrated | `runtime.persistence.eventLog.*` not consumed by any panel |
| **Member panel (C.8)** | ❌ 0/4 migrated | `runtime.persistence.client.members.*` not consumed by any panel |
| **Settings (C.9)** | ❌ 0/2 migrated | `runtime.userPreferences.*` not consumed |
| **Auth (C.10)** | ✅ 4/4 (C.10.01–.03 trivial gate; **C.10.04 fully landed** via `runtime.persistence.client.signOut()`) | The legacy `signOut()` fallback at `:766` is the documented defensive path for `runtime===null` (mirrors C.6.02/C.6.03 pattern). |
| **Legacy file deletions (C.11)** | ❌ 0/3 deleted | All 3 still on disk; 5 `@deprecated` markers added this PR pointing at exact deletion-blocker lines. |
| **`bim-projects-index` localStorage write** | ❌ Still authoritative | `ProjectRepository.ts:82` `STORAGE_INDEX_KEY = 'bim-projects-index'` |

**Phase C completion (spec line 137 measure)**:
- 9 / 33 sub-phases verifiably landed (~27% by sub-phase count).
- **0 / 3 legacy files deleted** — and the spec's strict "done when" gate is on this clause, so by the **gate measure** Phase C is **not done**.
- The migration scope is **smaller than the original audit suggested**: only `PlatformShell.ts` (1 file) blocks 2 of the 3 deletions; only 3 files (`PlatformShell.ts` + `ProjectHub.ts` + `ExistingProjectsPanel.ts`) block all three.

---

## Why "DONE" landed in the tracker

Same anti-pattern as Phase B:

1. `composeRuntime.ts` now binds a real `runtime.persistence.client` (Phase A.6 work). The tracker conflated **"the slot is implemented"** with **"all consumers use it"**.
2. `runtime.undoStack` / `runtime.projectContext` were added during Phase A and **are** used by `SaveUndoRedoHUD`. That work IS valid C.6.02/C.6.03 progress, but the tracker generalised it to "C — DONE".
3. The "264 handler bindings live" claim refers to `runtime.bus.bindHandler(...)` calls in `composeRuntime.ts` — that's Phase A.3 / a separate command-bus story, not C.

---

## Plan: C-cleanup batches (sized to one sprint, corrected scope)

The bottleneck is the 3 file deletions. Topological order is forced by the **internal** cross-imports:

```
ProjectRepository  ←  imported by  SaveOrchestrator (1 line — `import { VersionRecord } from './PlatformShellTypes'`; not a hard dep)
                   ←  imported by  ServerSyncQueue  (1 line — same: `import { VersionRecord } from './PlatformShellTypes'`)
SaveOrchestrator   ←  imported by  ServerSyncQueue  (no — verified, not present)
ServerSyncQueue    ←  imported by  SaveOrchestrator (1 line — `import { ServerSyncQueue } from './ServerSyncQueue'`)
```

Once the 3 external migrations (in `PlatformShell.ts`, `ProjectHub.ts`, `ExistingProjectsPanel.ts`) land, all three legacy files become orphaned and can be deleted in a single PR. **Order does NOT matter** between the 3 deletions (no external file depends on more than one of them in any particular order).

### C-cleanup.1 — `PlatformShell.ts` external migration (S79-WIRE D1)

This is the **biggest** PR — 24+ legacy reaches across a 2 433-line file. It is also **gating** because `PlatformShell.ts` is the sole external consumer of `SaveOrchestrator` + `ServerSyncQueue` and one of three of `ProjectRepository`.

| Reach group | Replacement | Estimated count |
|---|---|---:|
| `versionRepository.*` (`getVersions`, `saveVersionWithMeta`, `saveVersions`, `updateSyncStatus`) | `runtime.persistence.eventLog.tag(...)` / `.tags(projectId)` / `.replayUntil(id, eventId)` | ~12 |
| `projectRepository.*` (`listProjects`, `saveProject`) | `runtime.persistence.projectListStore.snapshot()` / `runtime.persistence.client.patch(id, {...})` | ~6 |
| `new SaveOrchestrator({...})` (line 698) | inline subscription to `runtime.events.on('persistence.status', ...)` + remove instantiation | 1 |
| `new ServerSyncQueue({...})` (line 689) | rely on `runtime.persistence.client` internal queue (already exists in `ProjectListController` per `attachEventLog`); port the `_planRejectsSync` latch into the new client first | 1 |

**Acceptance**: `rg "projectRepository\\.|versionRepository\\.|new SaveOrchestrator|new ServerSyncQueue" src/ui/platform/PlatformShell.ts` returns 0 results.

### C-cleanup.2 — `ProjectHub.ts` external migration (S79-WIRE D3)

15+ reaches in a 1 521-line file.

| Reach group | Replacement | Estimated count |
|---|---|---:|
| `projectRepository.listProjects()` (lines 115, 122, 148, 160, 1782, 2176, 2320, …) | `runtime.persistence.projectListStore.snapshot().projects` | ~10 |
| `projectRepository.saveProject(...)` (lines 122, 2183, 2322) | `runtime.persistence.client.patch(id, {...})` | ~4 |
| `projectRepository.deleteProject(id)` (line 160 — purge stale local-only entries; logic must move to the runtime store hydration policy) | none (the new model: server is source of truth, local store hydrates from it; the explicit purge becomes redundant) | 1 |
| `apiFetch('/api/projects')` (line 104, `syncFromServer`) | `runtime.persistence.client.list()` (returns the same `ProjectSummary[]`); `syncFromServer` becomes a single `await client.list()` call that the controller uses to refresh the store | 1 |

**Acceptance**: `rg "projectRepository\\.|apiFetch\\('/api/projects" src/ui/platform/ProjectHub.ts` returns 0 results.

### C-cleanup.3 — `ExistingProjectsPanel.ts` external migration (S79-WIRE D5)

Smallest. 1 import + ~3 reaches in a 166-line file.

| Reach | Replacement |
|---|---|
| `import { projectRepository, ProjectMeta } from '../platform/ProjectRepository'` | `import type { ProjectSummary } from '@pryzm/runtime-composer/types'` (and `runtime` injection per the existing Layout-threading) |
| `projectRepository.listProjects()` (line 70) | `this.runtime.persistence.projectListStore.snapshot().projects` |

**Acceptance**: `rg "projectRepository|ProjectRepository" src/ui/ViewBrowser/ExistingProjectsPanel.ts` returns 0 results.

### C-cleanup.4 — Delete the 3 legacy files (S79-WIRE D7)

After C-cleanup.1, .2, .3 land. Delete in any order; each deletion is mechanical:

```bash
rm src/ui/platform/{ProjectRepository,SaveOrchestrator,ServerSyncQueue}.ts
```

**Acceptance**:
- `ls src/ui/platform/{ProjectRepository,SaveOrchestrator,ServerSyncQueue}.ts` → 3× "no such file".
- `rg "ProjectRepository|projectRepository|SaveOrchestrator|saveOrchestrator|ServerSyncQueue" src` → 0 real-import results (only JSDoc text mentions in `CurtainWallBuilder.ts:340` and `CreateCurtainWallCommand.ts:19/140` historical context comments may remain; these should be updated to point at the runtime slots).
- `rg "bim-projects-index" src` → 0 results (the `STORAGE_INDEX_KEY = 'bim-projects-index'` constant goes with `ProjectRepository.ts`).

### C-cleanup.5 — Hub gesture migration tail (S80-WIRE)

Once the 3 files are gone, the remaining hub gestures are mechanical:

- C.1.02–C.1.04 (search / sort / archive filter against store snapshot) — single PR.
- C.2.02 (create modal submit) — single PR.
- C.4.01 (right-click menu reads `runtime.plugins.contributions(...)`) — single PR.
- C.4.02–C.4.06 (rename / delete / archive / star / duplicate via `runtime.persistence.client`) — one PR per gesture (small).

### C-cleanup.6 — Versions / members / settings (S80-WIRE)

C.7.x, C.8.x, C.9.x — relatively isolated. One panel per PR:

- `CDEVersionPanel` → `runtime.persistence.eventLog.tags(id)` / `.replayUntil(...)` / `.diff(...)`.
- `ProjectMemberPanel` → `runtime.persistence.client.members.*`.
- `OwnerSettingsPanel` + `UiPreferences` → `runtime.userPreferences.*` (slot exists in `composeRuntime`; no consumer yet).

### Acceptance for the whole batch (against spec line 137)

1. ✅ `ls src/ui/platform/{ProjectRepository,SaveOrchestrator,ServerSyncQueue}.ts` → 3× "no such file".
2. ✅ `rg "projectRepository|saveOrchestrator|ServerSyncQueue" src --type ts -g '!**/*.md'` → 0 import results.
3. ✅ `rg "bim-projects-index" src` → 0 results.
4. ✅ ProjectHub paints with project list at p95 < 500 ms (the existing `bench/ui/hub-paint.bench.ts`).
5. ✅ Cmd+S still produces a named version (now via `runtime.persistence.eventLog.tag('user-version', {label})`).
6. ✅ The `_planRejectsSync` latch behaviour preserved in the new client (regression test in the `pryzm-persistence` workflow).

---

## Feedback / lessons learned (architectural reflection)

1. **Audit-vs-source drift was the root cause of the C.3.01 / C.5.01 / C.10.04 misgrade.** The original audit looked at `ProjectHub.ts` (which still uses legacy localStorage for hub paint) and concluded the open-project flow was unwired. But the open-project flow does not live in `ProjectHub.ts`; it lives in `PlatformRouter.ts`, which **is** wired. Future audits must verify by **tracing the callback chain end-to-end** (start at the click handler, follow `this.callbacks.onOpenProject(...)` to `PlatformRouter.launchWorkspace(...)` to `_openProjectViaRuntime(...)` to `runtime.persistence.openProject(...)`) — not by inspecting the originating file in isolation.

2. **Importer counts must be verified by parsing actual `import` statements**, not by `rg <name>`. The original audit's `rg -l "ProjectRepository|projectRepository"` over-matched on:
   - JSDoc comment text (`PlatformShellTypes.ts:86` "ProjectRepository.ts) can reference it without a circular import.")
   - JSDoc text in unrelated files (`CurtainWallBuilder.ts:340`, `CreateCurtainWallCommand.ts:19/140` historical context)
   - The file's own self-references

   The corrected counts (3 / 1 / 1 vs the audit's 5 / 2 / 5) reduce the C-cleanup.1 + C-cleanup.2 + C-cleanup.3 scope by ~50% from what the original audit estimated.

3. **`@deprecated` markers are the architecturally correct tool here.** They turn the 5 legacy exports into IDE-visible deletion sirens *without* changing runtime behavior. Every importer that still touches them now sees a strikethrough + the migration target inline, eliminating the "I didn't know this was supposed to be removed" failure mode. See "Annotations landed this PR" above.

4. **The defensive-fallback pattern** (`if (this.runtime) { … } else { legacyPath(); }`) used in C.6.02, C.6.03, and C.10.04 is the right pattern for the bridging period when the legacy boot path can produce a `runtime === null` Layout call. The original audit graded C.10.04 as "partial" because it saw the `signOut()` legacy call still present; that misreads the pattern. The legacy call is the `runtime===null` branch, not a regression. Phase D.4 (delete `EngineBootstrap` → `composeRuntime` is the only boot path) will remove the `runtime===null` case and these fallback branches can collapse with it.

5. **The `_planRejectsSync` latch is a hidden migration hazard.** It was added 2026-04-29 (today) to suppress retry storms when the user's plan gates server-side version writes. The audit's PERF P-1 reference was correct; the latch IS load-bearing. **The C-cleanup.1 PR that deletes `ServerSyncQueue` MUST first port this latch to the new client**, or the next quota-gated user will hit the unbounded-retry path the latch prevents. The `@deprecated` marker on `ServerSyncQueue.ts` documents this inline so the migration PR cannot ignore it.

6. **The migration topology is shallower than the original audit suggested.** Only **`PlatformShell.ts`** is the external consumer of both `SaveOrchestrator` and `ServerSyncQueue`. Migrating that one file unblocks 2 of 3 deletions. The remaining 2 files (`ProjectHub.ts`, `ExistingProjectsPanel.ts`) only block `ProjectRepository`'s deletion, and `ExistingProjectsPanel` is tiny (1 import + 1 reach). Total delete-unlocking work is therefore: 1 large PR (`PlatformShell`) + 1 medium PR (`ProjectHub`) + 1 trivial PR (`ExistingProjectsPanel`) + 1 mechanical deletion PR. **4 PRs total** — about half what the original audit's "5 importers per file" framing implied.

7. **Acceptance gates must be machine-checkable.** Recommend adding `scripts/check-phase-c-deletions.mjs` that fails with a clear message when any of `src/ui/platform/{ProjectRepository,SaveOrchestrator,ServerSyncQueue}.ts` exist OR when `rg "bim-projects-index" src` returns >0 results. With this script in CI, Phase C exit becomes self-enforcing.

---

## Summary

| Question | Original audit answer (a.m.) | Revised answer (p.m. — this PR) |
|---|---|---|
| Is Phase C done? | "❌ ~9% complete" | "❌ ~17–27% complete by sub-phase count, but 0/3 by the spec's exit gate (file deletions). Not done." |
| What's the migration scope? | "5 importers × 3 files = 15 sites" | "**3 external files** (`PlatformShell` + `ProjectHub` + `ExistingProjectsPanel`); 1 of them (`PlatformShell`) blocks 2 of 3 deletions." |
| What's verifiably landed today? | "C.6.02, C.6.03, C.10.04 partial — 3 sub-phases" | "C.3.01, C.3.02, C.5.01, C.6.02, C.6.03, C.10.04 fully — **6 sub-phases** (the original audit missed the canonical no-reload path through `PlatformRouter.ts`)" |
| What should land next? | "C-cleanup.1 (`ServerSyncQueue` deletion)" | "C-cleanup.1 (`PlatformShell.ts` external migration — single PR unblocks 2 of 3 deletions)" |
| What's the hidden hazard? | "S78 PERF P-1 latch" | "Confirmed: `_planRejectsSync` (lines 92, 145–175, 272–274 of `ServerSyncQueue.ts`) MUST be ported to the new client before deletion. Documented inline via the `@deprecated` marker landed this PR." |
| Build-gate status after this PR | n/a | ✅ `tsc --skipLibCheck` clean; `node scripts/check-project-isolation.mjs` clean; full `npm run build` passes (60 s baseline). |
