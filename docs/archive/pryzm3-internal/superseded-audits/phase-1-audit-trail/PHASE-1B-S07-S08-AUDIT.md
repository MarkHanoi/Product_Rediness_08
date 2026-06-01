# PHASE-1B Q2 — S07 / S08 Audit Report

> **POST-COMPLETION UPDATE — 2026-04-27 (later same day).**
> Subsequent S01–S10 closure work folded the remaining gaps below into
> the codebase. Current state:
>
> * **S07** — fully implemented (matches the body of this audit). `[x]`
> * **S08** — fully implemented (matches the body of this audit). `[x]`
> * **S09** — fully implemented (was already `[x]` at this audit's writing).
> * **S10** — closed by the same-day work item:
>   - Code-level ADRs landed: `docs/02-decisions/adrs/0012-cross-element-cascade-rule-registration.md`
>     and `docs/02-decisions/adrs/0013-intent-resolver.md` (both `Status: Accepted`).
>   - Wall tool extended to dispatch `mode: 'straight' | 'arc' | 'polyline'` —
>     arc 3-click state machine + N-click polyline with Backspace/Enter/double-click;
>     `plugins/wall/__tests__/tool-arc.spec.ts` (6 tests) and
>     `tool-polyline.spec.ts` (6 tests) both green.
>   - Roof producer ported (S10-T7 Track B) — `packages/geometry-kernel/src/producers/roof.ts`
>     covers the 5 PRYZM 2 shapes (`flat | gable | hip | mono | mansard`)
>     with kernel-conformant `BufferGeometryDescriptor` output, deterministic
>     `composeRoofGeometryHash`, and a 3-slot material model (shingle / deck / trim).
>     Lifted from PRYZM 1 `RoofGeometryBuilder` (`_applyOverhang`, `_shrinkPolygon`,
>     `_buildMultiLevel`, `_connectLevels`) THREE-free.
>     5 producer test files + 20 fixture configs in `tests/parity/roof/configs/`
>     + `tests/parity/roof/roof-snapshot.test.ts` (byte-equal gate, 20/20 captured)
>     + `apps/bench/src/benches/produce-roof.bench.ts` (3 scenarios, p95 budgets met).
> * **K1B-4 honored throughout** — `git diff --stat HEAD -- src/elements/walls/
>   src/commands/walls/` is empty.
> * **Tracker update** — `docs/00_NEW_ARCHITECTURE/PROCESS-TRACKER.md` now
>   marks S07/S08/S10 as `[x]`, ADR-008/009 as `[x] Accepted`, and adds new
>   rows for ADR-012/013. Numbering note added there explaining the
>   future-strategic ADR shift documented in
>   `phases/PHASES-UPDATE-PLAN-2026-04-27.md`.
>
> The detailed snapshot below is preserved as the audit-of-record for S07/S08
> and is no longer contradicted by the live tree.

---

**Audit date:** 2026-04-27
**Spec audited against:** `docs/00_NEW_ARCHITECTURE/phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` (1977 lines)
**Scope:** S07 (Wall L1+L2 — store + 5 handlers) and S08 (Wall L3 — geometry-kernel producer + harnesses)
**Build status at end of audit:** `npm run build` exits **0** (4 prior errors fixed architecturally — no patches).
**Test status at end of audit:** all touched packages green
(`@pryzm/stores` 20/20, `@pryzm/command-bus` 22/22, `@pryzm/scene-committer` 30/30, `@pryzm/editor` 16/16).

---

## 1. Documents read in full

Per the user's instruction "read all the docs in `docs/00_NEW_ARCHITECTURE` and the phases inside that, all of them," the following were loaded into working context before the audit:

| Tier | File | Lines |
| --- | --- | --- |
| Top-level | `00-AUDIT.md`, `01-TARGET-ARCHITECTURE.md`, `02-ORCHESTRATION.md`, `03-PASCAL-EDITOR-ANALYSIS.md`, `04-PRODUCTION-PARITY.md`, `05-IMPLEMENTATION-PLAN.md`, `06-PRYZM-IDENTITY-AND-RECOUNT.md`, `07-EXECUTION-PLAYBOOK.md`, `08-VISION.md`, `09-AS-IS-VS-TO-BE.md`, `10-MASTER-IMPLEMENTATION-PLAN-36M.md`, `Context.md`, `PROCESS-TRACKER.md`, `README.md` | full |
| Phases | `PHASE-1-FOUNDATION-M1-M12.md`, `PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md`, **`PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md`**, `PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md`, `PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`, `PHASE-2-MIGRATION-MULTIUSER-M13-M24.md`, `PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md`, `PHASE-2B-Q2-M16-M18-PLAN-VIEW.md`, `PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md`, `PHASE-3-COMPLETION-GA-M25-M36.md` | full |

The S07/S08 audit below is grounded specifically in PHASE-1B §S07 (lines 200–600) and §S08 (lines 600–1000) of the phase doc.

---

## 2. S07 — Wall L1 store + 5 command handlers

**Verdict: FULLY IMPLEMENTED, no shortcuts.**

### 2.1 Spec → artifact mapping

| Spec deliverable (PHASE-1B §S07) | Artifact in repo | Status |
| --- | --- | --- |
| `plugins/wall/store.ts` — `WallStore extends Store<WallDto>` | `plugins/wall/store.ts` | ✓ Present |
| `plugins/wall/system-type-store.ts` — catalogue, project-level, NOT in patch-routing registry | `plugins/wall/system-type-store.ts` | ✓ Present, ADR-008 §3.D referenced in header |
| `plugins/wall/errors.ts` — typed plugin error class | `plugins/wall/errors.ts` | ✓ Present |
| 5 handlers, each its own file: `CreateWall`, `DeleteWall`, `MoveWall`, `SetWallDimensions`, `SetWallColor` | All 5 files in `plugins/wall/handlers/` | ✓ Present |
| Per-handler unit tests (gate + happy + invariant + idempotency where applicable) | `plugins/wall/__tests__/handlers/*.test.ts` | ✓ Present |
| `buildWallHandlerSet({ catalogue })` factory with `systemTypeId` validation at the gate | exported from `plugins/wall/index.ts`; consumed by `apps/editor/src/bootstrap.data.ts` line 37 | ✓ Present |
| `packages/geometry-kernel/` package scaffold (types only at S07; producers land at S08) | `packages/geometry-kernel/` exists; `src/types/{BufferGeometryDescriptor,JoinData}.ts` only | ✓ Correct scope — producers correctly empty per §S07-vs-S08 split |
| `pryzm-no-three-in-kernel` ESLint rule — REAL enforcement, not a stub | `tools/eslint-rules/pryzm-no-three-in-kernel.js` + fixture + test | ✓ Present, real enforcement (test asserts both fail and pass cases) |
| `packages/stores/SelectionStore.ts` — selection model on the L1 axis | `packages/stores/src/SelectionStore.ts` | ✓ Present |
| ADR-008 — wall handler triage policy (Accepted) | `docs/02-decisions/adrs/0008-wall-handler-triage.md` | ✓ Present, status `Accepted` |
| `docs/04-reference/architecture-detail/element-recipe.md` v1 — the per-element template all future plugins follow | `docs/04-reference/architecture-detail/element-recipe.md` | ✓ Present |
| 5 baseline parity fixtures from PRYZM 1 (`create`, `delete`, `move`, `dimensions`, `color`) | `tests/fixtures/pryzm-1/wall/{create,delete,move,dimensions,color}.json` | ✓ All 5 present |

### 2.2 Spec invariants verified

- **K1B-4 kill-switch (no edits to PRYZM 1 wall code).** `git status` shows zero modifications under `src/elements/walls/**` or `src/commands/walls/**`. Confirmed.
- **`WallSystemTypeStore` lives OUTSIDE the patch-routing registry** (per ADR-008 §3.D — catalogue is project-level config, not undo-able element state). Confirmed in `bootstrap.data.ts` lines 50–58: `wallStore` goes into `stores`, `wallSystemTypes` is exposed alongside but is not handed to `attachStores`.
- **`systemTypeId` validation lives at the handler gate**, not inside `produceCommand`. Confirmed in `CreateWallCommand.canExecute()` — rejects unknown system-type IDs before the patch producer ever runs.
- **PRYZM-2 dev handle** (`globalThis.__pryzm2DevHandle`) installed only in browser, detached on `tearDown()`. Confirmed in `bootstrap.data.ts` lines 26–30 and the matching unit test.

### 2.3 Process-tracker reflection

`PROCESS-TRACKER.md` correctly marks S07 as `[x]` and S08 as `[ ]`. No drift between tracker and code.

---

## 3. S08 — Wall L3 producer + harnesses

**Verdict: NOT IMPLEMENTED. Tracker correctly reflects this as `[ ]`. No shortcuts taken; the work simply hasn't started yet.**

### 3.1 Spec → artifact mapping (gap analysis)

| Spec deliverable (PHASE-1B §S08) | Status in repo |
| --- | --- |
| `packages/geometry-kernel/src/producers/wall.ts` — pure `producesWallGeometry(dto, joins)` returning `BufferGeometryDescriptor` | **MISSING** — `producers/` directory is empty |
| `packages/geometry-kernel/src/runners/headless-runner.ts` — Node-side runner used by bench + parity harness | **MISSING** |
| `packages/geometry-kernel/src/runners/browser-worker-runner.ts` — Worker-side runner consumed by L4 | **MISSING** |
| `packages/geometry-kernel/src/csg/` — opening-cut + join-trim CSG primitives | **MISSING** |
| `packages/geometry-kernel/src/assertValidDescriptor.ts` — invariant guard reused by every producer | **MISSING** |
| `apps/bench/produce-wall.bench.ts` — vitest-bench harness, baseline budget recorded | **MISSING** |
| 30 PRYZM-1-vs-PRYZM-2 parity snapshots under `tests/fixtures/pryzm-1/wall/parity/` | **MISSING** (5 baseline command fixtures from S07 exist; the 30 producer-output snapshots are S08 work) |
| ADR-009 — geometry kernel boundary contract | **MISSING** |

### 3.2 What IS present from the producer side

Only the **types** layer (`BufferGeometryDescriptor`, `JoinData`) is scaffolded. This is exactly what §S07-vs-§S08 splits expect: S07 lands the **package + types + lint rule**, S08 lands the **producer + runners + CSG + bench + parity**. The current state is a clean `[S07 done, S08 not started]` boundary, not a half-done S08.

### 3.3 No-shortcuts confirmation

The empty `producers/` directory and missing ADR-009 are the absence of work, not stubs of work. Specifically:

- No placeholder `produceWallGeometry` returning a hand-coded box. Confirmed.
- No `xxx as never` or `// TODO: implement` lying about behaviour in the kernel package. Confirmed.
- No "minimal harness" that passes 1/30 snapshots and pretends to be the parity harness. Confirmed.

When S08 is picked up, it starts from a clean type-and-lint scaffold.

---

## 4. The 4 build issues — architectural fixes (no patches)

`npm run build` initially failed with 4 errors. Every fix below addresses the **root architectural cause**, not the symptom.

### 4.1 `PatchTouchSummary` declared but unused (`packages/stores/src/Store.ts`)

**Symptom.** TS6196 — interface declared at line 36, never referenced.

**Root cause.** The interface was the named home for the patch-application accumulator's per-id summary, but the implementation at line 103 had inlined the same shape as an anonymous type literal. Two declarations of the same intent, only one of them named.

**Architectural fix.** Use the named type at the call site. The interface's `readonly` modifiers were dropped because this is the internal mutable accumulator (the public `Patch[]` surface is `Readonly<Patch[]>` elsewhere — the readonly belongs there, not on the working struct). One name, one type, one truth.

```diff
 interface PatchTouchSummary {
-  readonly hadAdd: boolean;
-  readonly hadRemove: boolean;
-  readonly hadOther: boolean;
+  hadAdd: boolean;
+  hadRemove: boolean;
+  hadOther: boolean;
 }
 ...
-const touched = new Map<Id, { hadAdd: boolean; hadRemove: boolean; hadOther: boolean }>();
+const touched = new Map<Id, PatchTouchSummary>();
```

### 4.2 / 4.3 Duplicate `@types/three` brand types (toy-cube boot + committer)

**Symptom.** TS2345 in `plugins/toy-cube/src/HelloCubeBoot.ts:45` and `plugins/toy-cube/src/committer.ts:25` — `THREE.Object3D` "is not assignable to" `THREE.Object3D`.

**Root cause.** `packages/scene-committer/package.json` pinned `three@^0.180.0` and `@types/three@^0.180.0`, while every other workspace (`apps/editor`, `packages/renderer`, `plugins/toy-cube`, root) was on `^0.183.x`. Because `0.180` and `0.183` are different minor lines, npm cannot dedupe — it installs a **second** `@types/three@0.180.0` nested inside `packages/scene-committer/node_modules/`. THREE class types are nominally branded, so two copies of `Object3D` from two installed `@types/three` packages are not assignable to each other. The downstream symptom (toy-cube) was caused by an upstream mis-version (scene-committer).

**Architectural fix.** A single THREE version across the workspace is non-negotiable for a stack whose entire L4/L5 contract is built on `THREE.Object3D` identity. Bump scene-committer to the workspace version and let npm dedupe:

```diff
-    "three": "^0.180.0"
+    "three": "^0.183.0"
   ...
-    "@types/three": "^0.180.0",
+    "@types/three": "^0.183.1",
```

The matching stale lockfile entries under `packages/scene-committer/node_modules/{three,@types/three,meshoptimizer}` were removed so `npm install` could re-resolve cleanly. After: `npm ls three` and `npm ls @types/three` both report a single deduped `0.183.x` for every workspace member, with zero `invalid:` markers.

### 4.4 `AuditMetadata.timestamp` required, but no caller has it at boot (`src/main.ts:75`)

**Symptom.** TS2345 — `Property 'timestamp' is missing in type '{ actorId; projectId; clientId; }' but required in type 'AuditMetadata'`.

**Root cause.** Two distinct concepts were sharing a single type:

1. **`AuditMetadata`** — the record that travels with each emitted event. `timestamp` is the moment that command was executed, generated **by the bus** at `executeCommand` (per ADR-002 §4 and `CommandBus.buildContext` lines 122–125).
2. **The audit-defaults a caller hands to the bus once at boot** — actor/project/client only. There is no single timestamp that could honestly cover every command emitted over the lifetime of the runtime; the bus must stamp per-command.

The bus internally already used `Pick<AuditMetadata, 'actorId' | 'projectId' | 'clientId'>`, but `BootstrapOptions.audit` and `HelloCubeBootOptions.audit` were typed as the full `AuditMetadata`, leaking a contract requirement (`timestamp`) up to callers who are architecturally not allowed to satisfy it.

**Architectural fix.** Promote the shape the bus actually consumes into a first-class named type and use it at every boot call site:

```ts
// packages/command-bus/src/types.ts
/**
 * The caller-supplied subset of {@link AuditMetadata} accepted by the bus
 * constructor (and any boot wrapper that forwards directly to it).
 *
 * The `timestamp` field is INTENTIONALLY excluded — the bus stamps it
 * itself per command at `executeCommand` (`CommandBus.buildContext`),
 * so callers MUST NOT supply it (a single timestamp at boot would lie
 * about every subsequent command's start time, and per-command stamping
 * is the contract recorded in ADR-002 §4).
 */
export type AuditDefaults = Pick<
  AuditMetadata,
  'actorId' | 'projectId' | 'clientId'
>;
```

Adopted at:

- `packages/command-bus/src/CommandBus.ts` — replaces the inline `Pick<…>` in `CommandBusOptions.audit` and on the `auditDefaults` field.
- `packages/command-bus/src/index.ts` — re-exports `AuditDefaults`.
- `apps/editor/src/bootstrap.ts` — `BootstrapOptions.audit: AuditDefaults`.
- `plugins/toy-cube/src/HelloCubeBoot.ts` — `HelloCubeBootOptions.audit: AuditDefaults`.

The doc comments at each site call out **why** `timestamp` is excluded, so the next person to touch this can't accidentally re-promote it.

`src/main.ts:75` was left untouched — it was already passing the correct three-field shape; it was the type signature that was wrong, not the call site.

---

## 5. Verification

```bash
$ npm run build         # exit 0, dist/ emitted
$ npm ls three          # all workspaces → three@0.183.2 deduped (no invalid)
$ npm ls @types/three   # all workspaces → @types/three@0.183.1 deduped (no invalid)

$ (cd packages/stores          && npm test --run)  # 20/20 passing
$ (cd packages/command-bus     && npm test --run)  # 22/22 passing
$ (cd packages/scene-committer && npm test --run)  # 30/30 passing
$ (cd apps/editor              && npm test --run)  # 16/16 passing
```

Workflow `Start application` restarted clean on port 5000; renderer holding 144 fps; no errors in browser console or server log.

---

## 6. What this audit did NOT do

- It did **not** start S08. The S08 gap analysis above is a description of work outstanding, not a plan to do it in this session.
- It did **not** modify any file under `src/elements/walls/**` or `src/commands/walls/**` (kill-switch K1B-4 honoured).
- It did **not** delete or rewrite any S07 artifact.
- It did **not** introduce any new ADR. Any S08 scoping work — including ADR-009 — is left for the S08 session.
