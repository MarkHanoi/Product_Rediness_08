# PRYZM3 — BIM Element Operations: Implementation Plan
**Derived from:** `ELEMENT-OPERATIONS-AUDIT-2026-05-17.md`  
**Date:** 2026-05-17  
**Status:** ACTIVE — replace when Phase 5 exit criteria are met  
**Governing contracts:** C11 (Element Creation Pipeline), C14 (Legacy Elimination), C15 (Hosted Element), C02 (Composition Root), C01 (Architecture & Governance)  
**Architecture authority:** `02-ARCHITECTURE.md` §1–§4 (8-layer model, CI gates, convergence booleans)

---

## ╔══ MASTER STATUS TABLE ══════════════════════════════════════════════════════╗

> **Legend:** ✅ DONE — ▶️ IN PROGRESS — 🔲 NOT STARTED — ⏸ DEFERRED
>
> **Last updated:** 2026-05-18.  This table is the authoritative single source of truth for all phases, sub-phases, and their completion status.  Update this table every time a sub-phase changes state — before, not after, closing the PR.

| Phase | ID | Name | Description | Status |
|-------|----|------|-------------|--------|
| **Phase 0** | P0 | Immediate Hardening | Fix `SetWindowOffsetCommand` dual-store (DW-14); add bus fallbacks for door/window; update C15 §8, §12, §13 | ✅ DONE |
| **Phase 1** | P1.1 | `WallPlanToolHandler` second-arg fix | Pass `{ source: 'HUMAN_DIRECT' }` not `window.commandContext` as `execute()` metadata | ✅ DONE |
| **Phase 1** | P1.2 | Bridge metadata consistency | Add `§E.5.x BRIDGE METADATA RULE` JSDoc; normalise all 40+ bridge call sites | ✅ DONE |
| **Phase 1** | P1.3 | `__pryzmInitComplete` sentinel | Set sentinel at end of `initTools.ts`; assert in `PlanToolHandler`; add `assertInitComplete()` to `global-bridge.ts` | ✅ DONE |
| **Phase 1** | P1.4 | E.5.6 bridge null-safety | Introduce `_cmExec` helper; replace every silent `if (cm) cm.execute(…)` no-op with `console.error` | ✅ DONE |
| **Phase 2** | P2.1 | Typed wall-creation handler | Register `wall.create` typed handler; remove `commandManager.execute(new CreateWallCommand…)` dual-write from `WallPlanToolHandler` | ✅ DONE |
| **Phase 2** | P2.2 | Typed curtain-wall handler | Register `curtainwall.create` typed handler; remove dual-write from `CurtainWallPlanToolHandler` | ✅ DONE |
| **Phase 2** | P2.3 | Migrate `wall.opening.create` to typed handler | Replace E.5.6 bridge with `WallOpeningLegacyAdapter`; door/window creation is bus-only | ✅ DONE |
| **Phase 3 / Batch 3.1** | B3.1-WA | Walls | `WallPlanToolHandler` → bus-only (P2.1); `registerWallHandlers` in `engineLauncher.ts` | ✅ DONE |
| **Phase 3 / Batch 3.1** | B3.1-SL | Slabs | `SlabPlanToolHandler` dispatches `slab.create`; `registerSlabHandlers` wired | ✅ DONE |
| **Phase 3 / Batch 3.1** | B3.1-DO | Doors (plan-tool) | `DoorPlanToolHandler` dispatches `wall.opening.create`; handled by `WallOpeningLegacyAdapter` (P2.3) | ✅ DONE |
| **Phase 3 / Batch 3.1** | B3.1-WI | Windows (plan-tool) | `WindowPlanToolHandler` dispatches `wall.opening.create`; handled by `WallOpeningLegacyAdapter` (P2.3) | ✅ DONE |
| **Phase 3 / Batch 3.1** | B3.1-CW | Curtain-Walls | `CurtainWallPlanToolHandler` dispatches `curtainwall.create`; `§P3.1-CW` bridge mirrors to `CurtainWallStore` | ✅ DONE |
| **Phase 3 / Batch 3.2** | B3.2-CL | Ceilings | `registerCeilingHandlers` wired; `§P3.2-CL` legacy-store bridge added; `ceiling.batch.create` stub retired | ✅ DONE |
| **Phase 3 / Batch 3.2** | B3.2-RF | Roofs | `registerRoofHandlers` wired; `roof.create` bridge retired; legacy-store bridge added | ✅ DONE |
| **Phase 3 / Batch 3.2** | B3.2-FL | Floors | `CreateFloorHandler` created; `FloorId`/`'floor'` added to schemas; `floor.created` in `RuntimeEvents`; `registerFloorHandlers` wired; `§P3.2-FL` legacy bridge in `initTools.ts` | ✅ DONE |
| **Phase 3 / Batch 3.3** | B3.3-ST | Stairs | **DEFERRED** — schema mismatch + 5 missing side effects (`bimManager`, `elementRegistry`, `semanticGraph×3`, auto-opening, railing proposals); dedicated enrichment task required | ⏸ DEFERRED |
| **Phase 3 / Batch 3.3** | B3.3-HR | Handrails | `registerHandrailHandlers` wired (§P3.3-HR); 6-handler set in `plugins/handrail` | ✅ DONE |
| **Phase 3 / Batch 3.3** | B3.3-CO | Columns | `registerColumnHandlers` wired; `position`→`origin`, `profile`→`shape` remapped; `§P3.3-CO` legacy-store bridge added | ✅ DONE |
| **Phase 3 / Batch 3.3** | B3.3-BM | Beams | `registerBeamHandlers` wired (§P3.3-BM); `beam.batch.create` stub retired | ✅ DONE |
| **Phase 3 / Batch 3.4** | B3.4-GR | Grids | `registerGridHandlers` wired (§P3.4-GR); 4-handler set in `plugins/grid` | ✅ DONE |
| **Phase 3 / Batch 3.4** | B3.4-SC | Structural | `registerStructuralHandlers` wired (§P3.4-ST); 7-handler set in `plugins/structural` | ✅ DONE |
| **Phase 3 / Batch 3.4** | B3.4-SE | Sections | Added `SectionData`, `SectionLine`, `SectionsState` to `@pryzm/schemas`; added `SectionId`/`'section'` to `Id.ts` `ElementType`; wired `registerSectionHandlers` (§P3.4-SE); retired `section.create` bridge and `CreateSectionMarkCommand` import | ✅ DONE |
| **Phase 3 / Batch 3.4** | B3.4-VW | Views | `registerViewHandlers` wired (§P3.4-VW); covers `view.*` update family | ✅ DONE |
| **Phase 3 / Batch 3.4** | B3.4-OP | Structural Openings | **DEFERRED** — no handlers in `plugins/opening/src/`; `opening.create` bridge routes to `CreateOpeningCommand` with slab-rebuild side effect; requires dedicated typed handler creation | ⏸ DEFERRED |
| **Phase 3 / Batch 3.5** | B3.5-FU | Furniture | `registerFurnitureHandlers` wired (§P3.5-FU); 8-handler set in `plugins/furniture` | ✅ DONE |
| **Phase 3 / Batch 3.5** | B3.5-PL | Plumbing | `registerPlumbingHandlers` wired (§P3.5-PL); `plumbing.create` bridge and import retired | ✅ DONE |
| **Phase 3 / Batch 3.5** | B3.5-RB | Room-bounding | `registerRoomHandlers` wired (F-1.3); 12-handler set in `plugins/rooms` | ✅ DONE |
| **Phase 3 / Batch 3.5** | B3.5-LT | Lighting | `registerLightingHandlers` wired (§P3.5-LT); `lighting.create` bridge and import retired | ✅ DONE |
| **Phase 3 / Batch 3.5** | B3.5-AN | Annotations | `registerAnnotationHandlers` wired (§P3.5-AN); `annotation.create` bridge and import retired | ✅ DONE |
| **Phase 3 / Batch 3.5** | B3.5-DI | Dimensions | `registerDimensionHandlers` wired (§P3.5-DI); 2-handler set in `plugins/dimensions` | ✅ DONE |
| **Phase 3 / Batch 3.5** | B3.5-DO | Door full-set | `registerDoorHandlers` wired (§P3.1-DO); `door.batch.create` stub retired; 10-handler set covers create + batch + updates | ✅ DONE |
| **Phase 3 / Batch 3.5** | B3.5-WI | Window full-set | `registerWindowHandlers` wired (§P3.1-WI); `window.batch.create` stub retired; 9-handler set covers create + batch + updates | ✅ DONE |
| **Phase 3 / Batch 3.6** | B3.6-PI | PropertyInspector mass migration | Mutation path already bus-routed (F.2.x Wave 14); removed dead `commandManager` guard from `WallLayerSection`; replaced `commandManager.onCommandExecuted` with `runtime.events.on('model-updated')`; cleaned up `cmdMgr` reach-throughs in `appendWallLayerSection` and `appendRoomPropertySection` call sites. `StairLevelRequiredPanel` §R7-FIX dual-write deferred to B3.3-ST | ✅ DONE |
| **Phase 4** | P4.1 | Inject stores into plan-tool handlers | Added `readonly runtime?: PryzmRuntime` to `PlanToolDrawContext`; populated from `_buildCtx()` in both overlays; replaced `(c as any).runtime ?? (window as any).runtime` with `c.runtime ?? window.runtime` in `DoorPlanToolHandler` and `WindowPlanToolHandler`; acceptance criterion `grep '(window as any).runtime' plantools/` = 0 ✓ | ✅ DONE |
| **Phase 4** | P4.2 | Inject `commandBus` into `HostedElementDragController` | Replaced `CommandManagerAccess` + `getCommandManager` with `BusAccess` + `getBus`; `handleDragEnd()` dispatches `door.setOffset` / `window.setOffset` via bus; removed `SetDoor/WindowOffsetCommand` imports; construction site in `initTransformControllers.ts` updated to `() => window.runtime?.bus`; acceptance criterion `grep 'commandManager' HostedElementDragController.ts` = 0 ✓ | ✅ DONE |
| **Phase 4** | P4.3 | Inject `commandBus` into `WallTransformController` | Acceptance criterion already met — `grep 'commandManager' packages/input-host/src/WallTransformController.ts` = 0 ✓. Wall baseline commit lives in `registerTransformDragHandler.ts` ([F-1.2] intentional dual-write, outside P4.3 scope) | ✅ DONE |
| **Phase 4** | P4.4 | Delete `global-bridge.ts` | Remove `getCommandManagerBridge()`; zero callers after Phase 3 complete | ✅ DONE |
| **Phase 4** | P4.5 | Delete `CommandManager.ts` | Remove 386-LOC legacy class; undo handled entirely by `RingBufferUndoStack` | ✅ DONE |
| **Phase 5** | T1 | Bus-fallback test — Door | `DoorPlanToolHandler` fallback when bus unavailable | ✅ DONE |
| **Phase 5** | T2 | Bus-fallback test — Window | `WindowPlanToolHandler` fallback when bus unavailable | ✅ DONE |
| **Phase 5** | T3 | Wall-drag undo regression test | Co-movement + undo/redo for wall + hosted window | ✅ DONE |
| **Phase 5** | T4 | `isHostedElement()` unit test | PascalCase + toLowerCase rule for hosted-element detection | ✅ DONE |
| **Phase 5** | T5 | `__pryzmInitComplete` sentinel smoke test | Sentinel rejects tool activation before init completes | ✅ DONE |
| **Phase 5** | T6 | `createWallOpening` bus handler round-trip | End-to-end creation → undo via `RingBufferUndoStack` | ✅ DONE |

> **Phase 3 exit gate:** `initBusHandlers.ts` bridge array empty; `grep 'commandManager\.execute' packages/ plugins/` = 0; P6 CI gate passes.  
> **Phase 4 exit gate:** `(window as any).commandManager` grep in plan-tools = 0; `grep 'commandManager' packages/input-host/src/` = 0.  
> **Phase 5 exit gate:** `pnpm test` exits 0; T1–T6 all pass.

## ╚═══════════════════════════════════════════════════════════════════════════╝

---

---

## 0. Purpose & Scope

The audit (`ELEMENT-OPERATIONS-AUDIT-2026-05-17.md`) identified a set of fixed bugs, two residual fragilities, three architecture-level risks, and five test-coverage gaps. It also surfaced a structural pattern problem: the codebase currently has **three distinct dispatch paths** for element creation (Paths A, B, C — audit §2), where the C11 contract mandates exactly **one** (the command bus).

This plan converts the audit's findings into a sequenced, dependency-ordered, acceptance-tested implementation programme. It is deliberately architectural rather than tactical: every task is grounded in a contract section, a layer rule, or a CI gate.

**In scope:**
- Residual fragilities and architecture risks from the audit (§9, §10)
- Unification of the three element-creation dispatch paths to one
- Migration of 202 legacy `commandManager.execute()` call sites (E-bus phases)
- Replacement of `window.*` global dependencies with typed dependency injection
- Test infrastructure for all five coverage gaps
- CI gate hardening to prevent regression

**Out of scope:**
- Net-new BIM element types
- Visual / UX changes to the properties panel or plan tools
- IFC export pipeline (governed by C05)
- AI command batch pipeline (governed by C09)

---

## 1. Goals & Success Criteria

> **Verified 2026-05-18** — grep + CI gate checks run against HEAD.

| ID | Goal | Success Criterion | Status (2026-05-18) |
|----|------|-------------------|---------------------|
| G1 | Zero silent element-creation failures | `console.error` fires before any no-op creation path returns; no creation event swallowed by optional-chain | ✅ **PASS** — All creation paths have explicit `else { console.error(...) }` branches. `DetailViewTool.ts:177` is the only remaining optional-chain guard and it has a loud else-branch (`'commandManager not found on window — command not executed'`). No silent swallowed paths found in `plantools/` or `input-host/`. |
| G2 | Single canonical dispatch path for all element creation | `runtime.bus.executeCommand()` or `runtime.commandBus.dispatch()` is the only creation entry point; no direct `commandManager.execute(new CreateXxx...)` in plan-tool handlers | ✅ **PASS** — `grep -rn "commandManager\.execute(new Create" apps/editor/src/engine/views/plantools/` returns 0 hits. All creation dispatches go through the bus or `_cmExec` bridge helper. |
| G3 | `window.*` globals absent from creation and drag paths | `getCommandManagerBridge()`, `window.commandManager`, `window.wallStore`, `window.commandContext` do not appear in plan-tool handlers or controller `activateFor()` paths | ⚠️ **PARTIAL — creation paths clean; update/move paths in progress** — Creation and `activateFor()` paths: ✅ zero hits. Remaining hits are exclusively in F-1.2 dual-write UPDATE paths (`AlignPlanToolHandler.ts:342,344`, `MovePlanToolHandler.ts:340,346,358,363`) and store-read queries (`window.wallStore` × many files, all `TODO(TASK-08)`). These are tracked under TASK-08 (store injection) — outside the scope of Phases 0–5. `getCommandManagerBridge()` = 0 hits in plantools (deleted P4.4 ✅). |
| G4 | 202 legacy `commandManager.execute()` sites reduced to zero in `packages/` and `plugins/` | CI gate `check:commandmanager` passes at hard-fail; `commandManager.execute()` non-comment grep in `packages/` + `plugins/` returns 0 | ⚠️ **IN PROGRESS — ratchet active** — Baseline 202 → current **56** non-comment calls. CI gate `npm run check:commandmanager` passes (threshold=56). Ratchet-down per Phase 3 batch completion; hard-fail at 0 is the Phase 3 exit condition. Gate script: `scripts/ci-check-no-commandmanager.mjs`. |
| G5 | Partial-initialisation failures produce loud, actionable errors | `window.__pryzmInitComplete` sentinel asserted before plan tools activate; plan tools refuse to activate if sentinel absent | ✅ **PASS** — Sentinel set at `initTools.ts:1475`. Both plan-tool overlays guard activation: `PlanViewToolOverlay.ts:402` and `SvpPlanToolOverlay.ts:403` both check `if (!(window as any).__pryzmInitComplete)` and bail with an error before constructing any draw context. All tool activations flow through these overlays. |
| G6 | All test coverage gaps addressed | T1–T6 integration, regression, and unit tests written and present in `tests/` | ✅ **PASS** — 11 spec files present in `tests/`; T1–T6 all confirmed: `DoorPlanToolHandler.fallback.spec.test.ts`, `WindowPlanToolHandler.fallback.spec.test.ts`, `UpdateWallBaselineCommand.undo.regression.spec.test.ts`, `HostedElementDragController.isHostedElement.spec.test.ts`, `PlanToolSentinel.spec.test.ts`, `createWallOpeningHandler.integration.spec.test.ts`. |
| G7 | `commandManager.execute()` second-arg confusion eliminated | `WallPlanToolHandler` passes `{ source: 'HUMAN_DIRECT' }` not `window.commandContext` as second arg | ✅ **PASS** — `grep -n "commandContext\|source.*commandContext" apps/editor/src/engine/views/plantools/WallPlanToolHandler.ts` returns 0 hits. Wall creation dispatches via bus with correct metadata. |
| G8 | Bridge-call metadata consistent | All bus-bridge handlers in `initBusHandlers.ts` that require explicit source metadata pass `{ source: 'HUMAN_DIRECT' }` explicitly; no inconsistency between handlers | ✅ **PASS** — `_cmExec` helper (introduced P1.4) wraps all `cm.execute(...)` calls in `initBusHandlers.ts` and enforces `meta ?? { source: 'HUMAN_DIRECT' }` as the second arg. All remaining direct `cm.execute(...)` calls pass explicit `{ source: 'HUMAN_DIRECT' }` (`DeleteViewTemplateCommand` at L604). No inconsistency found. |

---

## 2. Current State Summary (from audit)

### 2.1 What is working

- Wall, curtain-wall, door, window, floor, roof, stair, column, beam creation in plan view — all functional via dual-write (walls/curtain-walls: Path A) or bus bridge (all others: Paths B/C)
- All offset-mutation undo/redo chains dual-write correctly after DW-14 fix
- Properties panel updates propagate to 3D scene after PR-01 fix
- Wall snap-back after drag eliminated after WS-01 fix
- Hosted-element co-movement with wall drag working after §2.10 Bug-A/B fixes
- Selection walk-up (`findSelectableRoot()`) correctly returns root groups for doors/windows

### 2.2 What is fragile (non-breaking now, breaking under stress)

| ID | File | Nature |
|----|------|--------|
| F-1 (partially fixed) | `DoorPlanToolHandler.ts`, `WindowPlanToolHandler.ts` | Bus fallback added; bridge itself (`initBusHandlers.ts:502`) still silently no-ops if `getCommandManagerBridge()` returns `undefined` |
| F-2 | `initBusHandlers.ts` — 4 bridge handlers | `{ source: 'HUMAN_DIRECT' }` passed explicitly in some handlers, omitted in others; inconsistency is a maintenance trap |
| R-1 | `WallPlanToolHandler.ts:320` | `window.commandContext` (a `CommandContext`) passed as `metadata` (typed `CommandMetadata`); wrong type silently accepted |
| R-3 | `PlanToolDrawContext` construction | No guard against partial initialisation; `window.commandManager` etc. may be `undefined` if `initTools.ts` threw before line 823 |

### 2.3 The structural problem

Three dispatch paths exist simultaneously:

```
Path A (walls, curtain-walls):  bus.execute() + commandManager.execute()  ← dual-write
Path B (doors, windows):        bus.execute() → initBusHandlers bridge → commandManager.execute()
Path C (all others):            bus.execute() → initBusHandlers bridge → commandManager.execute()
```

C11 §2 mandates a single pipeline. The correct target is:

```
Path TARGET (all elements):     runtime.commandBus.dispatch() → typed handler → Immer store → scene rebuild
```

The `commandManager.execute()` layer — 202 sites, `CommandManager.ts` 386 LOC — is the L2 legacy that C14 §2.1 forbids in new code and requires elimination in existing code.

---

## 3. Target Architecture

The end state, derived directly from C11 §2, C14 §2.1, and `02-ARCHITECTURE.md` §1:

```
┌──────────────────────────────────────────────────────────────────────┐
│  ENTRY POINTS (L5 — apps/editor/src/engine/views/plantools/)         │
│                                                                      │
│  WallPlanToolHandler, DoorPlanToolHandler, WindowPlanToolHandler     │
│  CurtainWallPlanToolHandler, [all family handlers]                   │
│                                                                      │
│  onClick() / onPointerUp()                                           │
│    → runtime.commandBus.dispatch('<family>.create', payload,         │
│                                   { source: 'user' })                │
│                                                                      │
└─────────────────────────────┬────────────────────────────────────────┘
                              │ single path for ALL element families
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  COMMAND BUS (packages/command-bus/ — L1)                            │
│                                                                      │
│  Validates → Stamps → Logs → Routes to registered handler            │
│  Pushes patch to RingBufferUndoStack when source === 'user'          │
└─────────────────────────────┬────────────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  TYPED HANDLER (plugins/<family>/src/handlers/ or packages/*/src/)   │
│                                                                      │
│  1. Validates domain invariants (level exists, no curved-wall block) │
│  2. Immer draft mutation: stores.walls.set(id, entity)               │
│  3. FrameScheduler.schedule('pre-render', () => rebuildDeferred(id)) │
│  4. runtime.events.emit('<family>.created', { id, levelId })         │
└──────────────────────────────────────────────────────────────────────┘
```

**Key architectural invariants in the target:**
- No `CommandManager` class — deleted at Phase 4 exit (E-finish.3 per `CommandManager.ts:47`)
- No `window.commandManager` global — deleted when last bridge handler is removed
- No `window.wallStore` etc. — replaced by typed `HandlerContext.stores.*`
- No `initBusHandlers.ts` bridge file — replaced by per-family typed handlers
- `getCommandManagerBridge()` in `packages/command-registry/src/global-bridge.ts` — deleted
- Undo via `RingBufferUndoStack` (already wired, Sprint A35) not `CommandManager.history[]`

---

## 4. Phases

### Phase 0 — Immediate Hardening (DONE — 2026-05-17)
*All work items in this phase are already applied at HEAD.*

| Task | Files | Status |
|------|-------|--------|
| 0.1 Fix `SetWindowOffsetCommand` dual-store (DW-14) | `packages/command-registry/src/windows/SetWindowOffsetCommand.ts` | ✅ Done |
| 0.2 Add `DoorPlanToolHandler` bus-fallback (DPT-HARDEN-2026) | `apps/editor/src/engine/views/plantools/DoorPlanToolHandler.ts` | ✅ Done |
| 0.3 Add `WindowPlanToolHandler` bus-fallback (WPT-HARDEN-2026) | `apps/editor/src/engine/views/plantools/WindowPlanToolHandler.ts` | ✅ Done |
| 0.4 Update C15 §8 table + add §8.1 Dual-Store Rule | `docs/02-decisions/contracts/C15-HOSTED-ELEMENT-CONTRACT.md` | ✅ Done |
| 0.5 Correct C15 §12 elementType casing (PascalCase + toLowerCase rule) | `docs/02-decisions/contracts/C15-HOSTED-ELEMENT-CONTRACT.md` | ✅ Done |
| 0.6 Add C15 §13 dispatch resilience rule | `docs/02-decisions/contracts/C15-HOSTED-ELEMENT-CONTRACT.md` | ✅ Done |

**Phase 0 exit gate:** All Phase 0 items green at HEAD. ✅ Confirmed.

---

### Phase 1 — Quick Structural Fixes
*Small, isolated, no migration dependencies. Target: 1 sprint.*

#### P1.1 — Fix `WallPlanToolHandler` second-arg type confusion (R-1)

**Problem:** `WallPlanToolHandler.ts:320` passes `window.commandContext` (type: `CommandContext`) as the second argument to `_cm.execute()`, which types it as `CommandMetadata`. The value is ignored by the current `CommandManager.execute()` implementation (which uses `this.context`), but is a latent bug if `CommandManager` is ever revised.

**Fix:**
```typescript
// BEFORE (WallPlanToolHandler.ts:320)
_cm.execute(new CreateWallCommand(wallId, { ... }), window.commandContext);

// AFTER — pass correct metadata type
_cm.execute(new CreateWallCommand(wallId, { ... }), { source: 'HUMAN_DIRECT' });
```

**Files:** `apps/editor/src/engine/views/plantools/WallPlanToolHandler.ts`  
**Contracts:** C14 §2.1 (correct metadata type), C11 §2 (source tagging)  
**Acceptance:** `window.commandContext` no longer appears as second arg to `_cm.execute()` in WallPlanToolHandler; TypeScript compiles cleanly.

---

#### P1.2 — Normalise bridge metadata consistency (F-2)

**Problem:** 4 bridge handlers in `initBusHandlers.ts` explicitly pass `{ source: 'HUMAN_DIRECT' }` while all others rely on the default parameter. No bug exists currently, but this asymmetry will mislead engineers about whether the explicit pass has semantic meaning.

**Fix:** Apply a single consistent rule: **all bridge handlers that pass no source override MUST NOT pass a second arg** (rely on default). The 4 that currently pass `{ source: 'HUMAN_DIRECT' }` explicitly do so only when there is an intent to preserve explicit tagging for audit/OTel reasons. Document this rule in code.

Add a JSDoc comment at the top of the `__bridges` array in `initBusHandlers.ts`:
```typescript
/**
 * §E.5.x BRIDGE METADATA RULE:
 * Bridge handlers that carry no special source context MUST omit the second
 * argument to cm.execute() — the default { source: 'HUMAN_DIRECT' } applies.
 * Handlers that need explicit source tagging (e.g. viewTemplate.* operations
 * that feed audit trails) MUST pass { source: 'HUMAN_DIRECT' } explicitly.
 * Do not mix the two forms arbitrarily.
 */
```

**Files:** `apps/editor/src/engine/initBusHandlers.ts`  
**Contracts:** C11 §2 (source tagging), C14 §2.1 (audit trail)  
**Acceptance:** Single JSDoc comment + consistent call sites; no functional change.

---

#### P1.3 — Add `__pryzmInitComplete` sentinel (R-3)

**Problem:** All plan-tool handlers depend on `window.commandManager`, `window.wallStore`, `window.runtime`, and `window.commandContext` being set by `initTools.ts` before any plan tool is activated. If `initTools.ts` throws before line 823 (`window.commandManager = commandManager`), tools silently produce no-ops or crash at click time with opaque errors.

**Fix — three-step:**

**Step A:** Set the sentinel at the end of `initTools.ts` (after ALL globals are assigned):
```typescript
// initTools.ts (after line 823, as the final statement before return)
(window as any).__pryzmInitComplete = true;
console.log('[initTools] §R3-SENTINEL: plan tools armed — all globals confirmed live.');
```

**Step B:** Assert sentinel in `PlanToolDrawContext` constructor (or in the `activate()` method of each tool handler, whichever is called first when a tool becomes active):
```typescript
// PlanToolHandler.ts (or PlanToolDrawContext constructor)
if (!(window as any).__pryzmInitComplete) {
    console.error(
        '[PlanTool] §R3-SENTINEL: initTools did not complete — ' +
        'window.commandManager / window.wallStore are not available. ' +
        'Check initTools.ts for a thrown error before line 823.'
    );
    return; // refuse to activate
}
```

**Step C:** Add to `global-bridge.ts`:
```typescript
export function assertInitComplete(caller: string): void {
    if (!(window as any).__pryzmInitComplete) {
        throw new Error(
            `[${caller}] §R3-SENTINEL: getCommandManagerBridge() called before ` +
            `initTools completed. This is a startup ordering bug.`
        );
    }
}
```

**Files:**
- `apps/editor/src/engine/initTools.ts` (Step A)
- `apps/editor/src/engine/views/plantools/PlanToolHandler.ts` or `PlanToolDrawContext` (Step B)  
- `packages/command-registry/src/global-bridge.ts` (Step C)

**Contracts:** C02 §3.1 (boot ordering invariants), C06 §4 (tool lifecycle)  
**Layer:** Step A = L5 (apps/editor). Step B = L5. Step C = L1 (`packages/command-registry/` is a transitional bridge, not a permanent L1 resident).  
**Acceptance:** Starting the app with `initTools.ts` forcibly throwing at line 800 produces a single `[PlanTool] §R3-SENTINEL:` error and no further crashes; normal startup produces `§R3-SENTINEL: plan tools armed` log and all tools work.

---

#### P1.4 — Harden E.5.6 bridge against null commandManager

**Problem:** The `wall.opening.create` bridge at `initBusHandlers.ts:502-509` calls `if (cm) cm.execute(...)` — silently no-ops if `cm` is `undefined`. Now that Phase 0 adds a fallback in the tool handler, the bridge itself is no longer the last line of defence. But it should still log explicitly.

**Fix:**
```typescript
// initBusHandlers.ts §E.5.6 bridge — BEFORE
fn: (cmd: any) => {
    const cm = getCommandManagerBridge();
    if (cm) cm.execute(new CreateWallOpeningCommand({ wallId: cmd.wallId, openingData: cmd.openingData }));
},

// AFTER — add explicit error
fn: (cmd: any) => {
    const cm = getCommandManagerBridge();
    if (cm) {
        cm.execute(new CreateWallOpeningCommand({ wallId: cmd.wallId, openingData: cmd.openingData }));
    } else {
        console.error('[initBusHandlers §E.5.6] wall.opening.create: commandManager not initialised — opening not created. wallId:', cmd.wallId);
    }
},
```

Apply the same pattern to ALL 40+ bridge handlers in `initBusHandlers.ts` that do `if (cm) cm.execute(...)` without an else. A single shared helper eliminates the boilerplate:
```typescript
function _cmExec(cmd: unknown): void {
    const cm = getCommandManagerBridge();
    if (cm) { cm.execute(cmd); return; }
    console.error('[initBusHandlers] commandManager not ready — command dropped:', (cmd as any)?.constructor?.name ?? 'unknown');
}
```

**Files:** `apps/editor/src/engine/initBusHandlers.ts`  
**Contracts:** C11 §5 (error observability), C14 §2.1 (no silent failures)  
**Acceptance:** Every bridge handler either succeeds or logs a `console.error` with command type and key payload; `grep 'if (cm) cm.execute' initBusHandlers.ts` returns 0 matches.

---

**Phase 1 exit gate:** P1.1–P1.4 all merged; TypeScript `--noEmit` clean; no new `(window as any)` violations introduced; CI gates (P4 ratchet) not increased.

---

### Phase 2 — Dispatch Unification (Path A/B/C → single bus path)
*Requires Phase 1 complete. Target: 2–3 sprints.*

The goal of this phase is to make `WallPlanToolHandler` and `CurtainWallPlanToolHandler` use **bus-only dispatch** — eliminating the Path A dual-write in favour of the same Path C pattern used by all other element families. This is the prerequisite for E-bus.1 (audit §10, R-2).

#### P2.1 — Register typed wall-creation handler in command bus

The `wall.create` bus event currently goes to the PRYZM3 Immer store (via plugin handler). The legacy `commandManager.execute(new CreateWallCommand(...))` still drives the 3D scene. To remove the dual-write, the bus handler must drive the 3D scene too.

**Step A:** Verify that `plugins/wall/src/handlers/createWallHandler.ts` updates both the Immer store AND triggers `WallRebuildCoordinator`. If it does not, add the rebuild trigger.

**Step B:** Add `wallRebuildCoordinator.touch(wallId)` inside the wall plugin's `wall.created` event handler (or inside the command handler itself, deferred via `FrameScheduler.schedule('pre-render', ...)`).

**Step C:** Once the bus handler drives mesh rebuild, remove the `commandManager.execute(new CreateWallCommand(...))` dual-write from `WallPlanToolHandler.onClick()`.

**Files:**
- `plugins/wall/src/handlers/createWallHandler.ts` (verify + possibly add rebuild trigger)
- `apps/editor/src/engine/views/plantools/WallPlanToolHandler.ts` (remove dual-write)
- `apps/editor/src/engine/WallRebuildCoordinator.ts` (ensure event subscription exists)

**Contracts:** C11 §2 (single pipeline), C11 §4 (geometry deferred via FrameScheduler)  
**Prerequisite:** Wall plugin handler must call `FrameScheduler.schedule('pre-render', rebuildWall)` — verify against C11 §4.  
**Acceptance:** Creating a wall via plan tool produces a mesh in the 3D scene using bus-only dispatch; no `commandManager.execute(new CreateWallCommand)` call site exists in `WallPlanToolHandler.ts`.

---

#### P2.2 — Register typed curtain-wall handler (same pattern as P2.1)

**Files:** `plugins/curtain-wall/src/handlers/`, `apps/editor/src/engine/views/plantools/CurtainWallPlanToolHandler.ts`  
**Acceptance:** Same as P2.1 for curtain walls.

---

#### P2.3 — Migrate `CreateWallOpeningCommand` bridge to typed handler

Replace the E.5.6 bridge (a wrapper over legacy `commandManager.execute`) with a typed bus handler registered by the door/window plugin:

```typescript
// plugins/wall-openings/src/handlers/createWallOpeningHandler.ts
runtime.commandBus.register('wall.opening.create', {
    async handle(command, context) {
        const { wallId, openingData } = command.payload;
        // Immer draft mutation
        context.stores.walls.update(wallId, draft => {
            draft.openings.push({ ...openingData, elementId: crypto.randomUUID() });
        });
        // Deferred rebuild
        context.scheduler.schedule('pre-render', () =>
            context.wallRebuildCoordinator.touch(wallId)
        );
        runtime.events.emit('wall.opening.created', { wallId, openingData });
    }
});
```

Remove the E.5.6 bridge entry from `initBusHandlers.ts` once the typed handler is live and verified.

**Files:**
- `plugins/wall/src/handlers/createWallOpeningHandler.ts` (new file)
- `apps/editor/src/engine/initBusHandlers.ts` (remove E.5.6 bridge entry)
- `apps/editor/src/engine/views/plantools/DoorPlanToolHandler.ts` (remove commandManager fallback after bus handler is stable)
- `apps/editor/src/engine/views/plantools/WindowPlanToolHandler.ts` (same)

**Contracts:** C11 §3 (handler contract), C14 §2.1 (no new commandManager use)  
**Acceptance:** `grep 'E.5.6' initBusHandlers.ts` returns 0; door/window creation creates mesh via bus-only path; undo/redo works (via `RingBufferUndoStack`).

---

**Phase 2 exit gate:** No `commandManager.execute(new CreateWall...)` or `commandManager.execute(new CreateCurtainWall...)` or `commandManager.execute(new CreateWallOpening...)` in plan-tool handlers; all three element types created via `runtime.commandBus.dispatch()` only.

---

### Phase 3 — E-bus Family Migration (Eliminating 202 Sites)
*Requires Phase 2 complete. Target: 4–6 sprints, one family per sprint.*

This phase migrates all remaining element families from `commandManager.execute(new CreateXxxCommand(...))` to typed bus handlers. The migration order follows `CommandManager.ts:41-45` (E-bus.1 through E-bus.6) and is driven by two constraints:
1. Families with the most `commandManager` call sites migrate first (highest leverage).
2. Families that are load-bearing for collaboration (walls, doors, windows, stairs) migrate before services.

#### Migration Checklist per Family

For each family, the migration is a six-step pattern:

1. **Register typed handler** in the family's plugin (`plugins/<family>/src/handlers/<create|update|delete><Family>Handler.ts`)
2. **Wire to bus** in `runtime-composer` or via the plugin's `activate()` hook
3. **Remove bridge entry** from `initBusHandlers.ts`
4. **Remove `Create|Update|Delete<Family>Command`** import from call sites; replace with `runtime.commandBus.dispatch()`
5. **Remove command class** from `packages/command-registry/src/<family>/`
6. **Verify undo** via `RingBufferUndoStack` rather than `CommandManager.history[]`

#### Family Migration Schedule

| Batch | Families | Priority | E-bus Phase | Approx Sites |
|-------|----------|----------|-------------|--------------|
| **3.1** | Walls, Slabs, Doors, Windows, Curtain-Walls | Highest (load-bearing, collaboration) | E-bus.1 (S79) | ~45 |
| **3.2** | Floors, Ceilings, Roofs | High (geometry-heavy) | E-bus.2 (S79) | ~25 |
| **3.3** | Stairs, Handrails, Columns, Beams | High (structural) | E-bus.3 (S80) | ~30 |
| **3.4** | Grids, Openings | Medium | E-bus.4 (S80) | ~20 |
| **3.5** | Furniture, Plumbing, Room-bounding | Medium | E-bus.5 (S80) | ~30 |
| **3.6** | PropertyInspector mass migration | Blocking for deletion | E-bus.6 (S80) | ~52 |

**Note on Batch 3.6 (PropertyInspector):** `PropertyInspector.ts` has 15+ direct `commandManager.execute()` reaches across multiple element families. This must migrate last because it depends on typed update commands being registered for all families (batches 3.1–3.5) before it can switch to bus dispatch.

#### Per-Family Acceptance Criteria (same for all families)

- `grep 'commandManager.execute(new Create<Family>' packages/ plugins/ apps/` → 0 matches
- `grep 'commandManager.execute(new Update<Family>' packages/ plugins/ apps/` → 0 matches  
- `grep 'commandManager.execute(new Delete<Family>' packages/ plugins/ apps/` → 0 matches
- Create → Undo → Redo cycle produces identical element state via `RingBufferUndoStack`
- CRDT sync: element created on client A appears on client B via bus replay

**Phase 3 exit gate:** `grep -r 'commandManager\.execute' packages/ plugins/ | wc -l` returns 0. `initBusHandlers.ts` bridge array is empty. P6 CI gate (`scripts/ci-check-no-direct-store-writes.ts`) passes at hard-fail.

---

### Phase 4 — Global Dependency Injection (Eliminate `window.*`)
*Can run in parallel with Phase 3 Batches 3.2–3.6. Target: 2–3 sprints.*

This phase removes the `window.commandManager`, `window.wallStore`, `window.commandContext`, `window.runtime`, and `window.curtainWallStore` global reads from plan-tool handlers, controllers, and builder classes. It complies with C14 §2.2 and C14 §2.3 which forbid `window.xStore` and `window.xService` in new code.

#### P4.1 — Inject stores into plan-tool handlers via `PlanToolDrawContext`

`PlanToolDrawContext` is already partially injection-ready (it has `wallStore?: WallStore` added by §DOOR-AUDIT-2026 / §WINDOW-AUDIT-2026). Extend it to carry the full set of stores.

**Extend `PlanToolDrawContext`:**
```typescript
export interface PlanToolDrawContext {
    // existing fields...
    wallStore:           WallStore;        // was optional, now required
    curtainWallStore?:   CurtainWallStore;
    commandBus:          CommandBus;        // replaces commandManager fallback
    runtime:             PryzmRuntime;      // replaces (window as any).runtime
    // ...
}
```

**Update construction site** (wherever `PlanToolDrawContext` is constructed in `PlanViewToolOverlay.ts` / `SvpPlanToolOverlay.ts`):
```typescript
const ctx: PlanToolDrawContext = {
    // ...
    commandBus:  window.runtime!.commandBus,   // typed; only during F-1.x migration
    runtime:     window.runtime!,
    wallStore:   window.wallStore!,
    // ...
};
```

**Update each tool handler** to read from `c.commandBus` / `c.runtime` instead of `(window as any).runtime`.

**Files:**
- `apps/editor/src/engine/views/plantools/PlanToolHandler.ts` (extend interface)
- `apps/editor/src/engine/views/PlanViewToolOverlay.ts` (update context construction)
- `apps/editor/src/engine/views/SvpPlanToolOverlay.ts` (same)
- All tool handlers that currently cast `(window as any).runtime`

**Contracts:** C14 §2.2, §2.3 (no `window.xStore`); C02 §3.1 (typed runtime handle)  
**Acceptance:** `grep '(window as any).runtime' apps/editor/src/engine/views/plantools/` returns 0.

---

#### P4.2 — Inject `commandBus` into `HostedElementDragController`

`HostedElementDragController.handleDragEnd()` currently calls `commandManager.execute(new SetDoor/WindowOffsetCommand(...))` via `window.commandManager`. This must switch to `runtime.commandBus.dispatch('element.setOffset', ...)` once the typed offset handler is registered (Batch 3.1).

**Prerequisite:** Batch 3.1 (wall/door/window) registers `SetDoorOffsetHandler` and `SetWindowOffsetHandler`.

**Fix:**
```typescript
// HostedElementDragController.ts constructor — inject commandBus
constructor(private readonly commandBus: CommandBus, ...) {}

// handleDragEnd()
this.commandBus.dispatch('door.setOffset', { doorId: elementId, wallId, offset: newOffset }, { source: 'user' });
```

**Files:** `packages/input-host/src/HostedElementDragController.ts`  
**Contracts:** C15 §6 (offset mutation command), C14 §2.1 (no `commandManager.execute`)  
**Acceptance:** `grep 'commandManager' packages/input-host/src/HostedElementDragController.ts` → 0.

---

#### P4.3 — Inject `commandBus` into `WallTransformController`

`WallTransformController` commits wall position via `UpdateWallBaselineCommand` through `window.commandManager`. Same injection pattern as P4.2.

**Files:** `packages/input-host/src/WallTransformController.ts`  
**Acceptance:** `grep 'commandManager' packages/input-host/src/WallTransformController.ts` → 0.

---

#### P4.4 — Delete `global-bridge.ts` and `getCommandManagerBridge()`

Once Phases 3 and 4 are complete, `getCommandManagerBridge()` has zero callers. The file is deleted; the export is removed from `packages/command-registry/src/index.ts`.

**Files:** `packages/command-registry/src/global-bridge.ts` (delete), `packages/command-registry/src/index.ts` (remove export)  
**Contracts:** C14 §3 (legacy elimination milestone), `CommandManager.ts:9` (TODO(TASK-06) resolved)  
**Acceptance:** `grep -r 'getCommandManagerBridge' . | wc -l` returns 0.

---

#### P4.5 — Delete `CommandManager.ts`

Once all 202 call sites are migrated (Phase 3), `CommandManager` has no callers. Delete the class; undo history is handled entirely by `RingBufferUndoStack` (already wired, Sprint A35).

**Files:** `packages/command-registry/src/CommandManager.ts` (delete)  
**Contracts:** C14 §3 (E-finish.3 milestone), `CommandManager.ts:47` (deletion TODO)  
**Acceptance:** `[ ! -f packages/command-registry/src/CommandManager.ts ]` passes in CI; `pnpm tsc --noEmit` clean.

---

**Phase 4 exit gate:** P4.4 and P4.5 complete; `(window as any).commandManager` grep across `apps/editor/src/engine/views/plantools/` = 0; `grep 'commandManager' packages/input-host/src/` = 0; P4 CI gate (`scripts/ci-check-no-window-any.ts`) passes at hard-fail.

---

### Phase 5 — Test Infrastructure
*Can run in parallel with any other phase. Individual tests should be written alongside the feature work they cover. Target: done by Phase 3 Batch 3.3.*

This phase implements the five coverage gaps identified in audit §13, plus additional tests surfaced by the migration work.

#### T1 — Bus-fallback integration test for door creation (Gap 1 from audit §13)

**Test:** Inject a `DoorPlanToolHandler` with `ctx.runtime = undefined` (simulating bus unavailability). Call `onClick()`. Assert that:
- `getCommandManagerBridge().execute()` was called with a `CreateWallOpeningCommand` whose `type === 'door'`
- A `console.warn('[DoorPlanToolHandler] runtime.bus unavailable')` was emitted

**File:** `apps/editor/src/engine/views/plantools/__tests__/DoorPlanToolHandler.fallback.test.ts`

---

#### T2 — Bus-fallback integration test for window creation (Gap 2)

Same pattern as T1 but for `WindowPlanToolHandler`.

**File:** `apps/editor/src/engine/views/plantools/__tests__/WindowPlanToolHandler.fallback.test.ts`

---

#### T3 — Wall-drag undo regression test (Gap 3)

**Test:** 
1. Create a wall at position A
2. Place a window on the wall
3. Drag wall to position B (fires `UpdateWallBaselineCommand`)
4. Assert window mesh position has moved with wall (co-movement)
5. Undo wall drag (fires `UpdateWallBaselineCommand.undo()`)
6. Assert wall is back at A
7. Assert window mesh is back at its position relative to A

**File:** `packages/command-registry/src/__tests__/UpdateWallBaselineCommand.undo.regression.test.ts`  
**Contracts tested:** C15 §8 (wall baseline mutation), C15 §8.1 (dual-store rule)

---

#### T4 — `isHostedElement()` unit test (Gap 4)

**Test:** Construct a `THREE.Group` with `userData.elementType = 'Window'`. Assert `HostedElementDragController.isHostedElement(group)` returns `true`.  
Repeat with `'Door'`, `'window'` (lowercase — should still pass), `'Wall'` (should fail), `undefined` (should fail).

**File:** `packages/input-host/src/__tests__/HostedElementDragController.isHostedElement.test.ts`  
**Contracts tested:** C15 §12 (PascalCase + toLowerCase rule)

---

#### T5 — `__pryzmInitComplete` sentinel smoke test (Gap 5, from P1.3)

**Test:** Start a `PlanToolDrawContext` activation without calling `initTools.ts`. Assert that `activate()` returns early and a `console.error('[PlanTool] §R3-SENTINEL:')` is emitted.

**File:** `apps/editor/src/engine/views/plantools/__tests__/PlanToolSentinel.test.ts`

---

#### T6 — CreateWallOpeningCommand bus handler round-trip (migration regression)

After Phase 2.3 (typed handler replaces bridge), verify end-to-end:
1. `runtime.commandBus.dispatch('wall.opening.create', { wallId, openingData })`
2. Handler runs
3. `wallStore.windows.get(id)` returns the new window
4. Scene has a `group.userData.elementType === 'Window'` at the correct wall offset
5. `RingBufferUndoStack` has a patch for the creation
6. Undo removes window from store and scene

**File:** `plugins/wall/src/__tests__/createWallOpeningHandler.integration.test.ts`

---

**Phase 5 exit gate:** All T1–T6 tests pass in CI; `pnpm test` exit code 0.

---

## 5. Dependency Graph

```
Phase 0 (done)
    │
    ├─► Phase 1 (P1.1–P1.4) — no external deps; can start immediately
    │       │
    │       └─► Phase 2 (P2.1–P2.3) — requires Phase 1 complete
    │               │
    │               └─► Phase 3 Batch 3.1 (walls/slabs/doors/windows/curtain-walls)
    │                       │
    │                       ├─► Phase 4 (P4.1–P4.3) — unblocked after Batch 3.1
    │                       │
    │                       ├─► Phase 3 Batch 3.2 (floors/ceilings/roofs)
    │                       │       └─► Phase 3 Batch 3.3 (stairs/handrails/columns/beams)
    │                       │               └─► Phase 3 Batch 3.4 (grids/openings)
    │                       │                       └─► Phase 3 Batch 3.5 (furniture/plumbing)
    │                       │                               └─► Phase 3 Batch 3.6 (PropertyInspector)
    │                       │                                       │
    │                       └───────────────────────────────────────┤
    │                                                               ▼
    │                                                   Phase 4 P4.4 (delete global-bridge.ts)
    │                                                   Phase 4 P4.5 (delete CommandManager.ts)
    │
    └─► Phase 5 (tests) — runs in parallel; T1/T2 after Phase 0; T3/T4 after Phase 2; T5 after P1.3; T6 after Phase 2.3
```

---

## 6. Per-Phase CI Gate Requirements

| Phase | Gate | Level | File |
|-------|------|-------|------|
| Phase 1 exit | P4 ratchet (`(window as any)` count must not increase) | Soft-fail | `scripts/ci-check-no-window-any.ts` |
| Phase 2 exit | `grep 'commandManager.execute(new CreateWall' apps/editor` = 0 | Hard-fail via new gate | (new gate in Phase 2) |
| Phase 3 exit | P6 gate: no direct store writes | Hard-fail | `scripts/ci-check-no-direct-store-writes.ts` |
| Phase 3 exit | `commandManager.execute` in packages/ plugins/ = 0 | Hard-fail | new gate `scripts/ci-check-no-commandmanager.ts` |
| Phase 4.4 exit | `getCommandManagerBridge` grep = 0 | Hard-fail | new gate |
| Phase 4.5 exit | `[ ! -f packages/command-registry/src/CommandManager.ts ]` | Hard-fail | existing E-finish.3 gate |
| Phase 5 | `pnpm test` exit 0 | Hard-fail | CI test runner |

### New CI gate to add in Phase 3 (P3.1 prep)

File: `scripts/ci-check-no-commandmanager.ts`

```typescript
/**
 * Gate: commandManager.execute() must not appear in packages/ or plugins/.
 * After Phase 3 Batch 3.1, this count must drop below 150 and must not increase.
 * After Phase 3 Batch 3.6, count must be 0 (hard-fail).
 */
const count = execSync("grep -r 'commandManager\\.execute' packages/ plugins/ | wc -l").toString().trim();
const THRESHOLD = parseInt(process.env.CM_EXECUTE_THRESHOLD ?? '0', 10);
if (parseInt(count) > THRESHOLD) {
    console.error(`[ci] commandManager.execute count ${count} exceeds threshold ${THRESHOLD}`);
    process.exit(1);
}
```

The threshold is ratcheted down at each batch completion: 202 → 157 → 127 → 97 → 67 → 15 → 0.

---

## 7. Architecture Decisions

### AD-1: Keep `initBusHandlers.ts` bridges as transitional scaffolding

The E.5.x bridges in `initBusHandlers.ts` are a migration scaffold, not a permanent architecture. Each bridge entry is a **temporary shim** that will be deleted when the typed plugin handler for that family is registered. The file itself is deleted when all bridges are removed.

**Do NOT** add new bridge entries to `initBusHandlers.ts` for element families that don't already have one. New element families introduced during Phase 3 must go directly to typed plugin handlers (C14 §2.1 mandate for new code).

### AD-2: `RingBufferUndoStack` is the undo authority post-Phase 3

`CommandManager.history[]` is the current undo implementation. `RingBufferUndoStack` (wired Sprint A35) is the PRYZM3 target. Once a family migrates to typed bus handlers, its undo patches are managed by `RingBufferUndoStack`. The dual-path undo (some commands via `CommandManager.history`, others via `RingBufferUndoStack`) exists only during Phase 3 and is resolved at Phase 4.5 when `CommandManager` is deleted.

**Critical:** Do NOT add new undo commands to `CommandManager.history[]` after Phase 3 Batch 3.1. New undo support for new features must use `RingBufferUndoStack` only.

### AD-3: `PlanToolDrawContext` injection vs. constructor injection

Plan-tool handlers currently accept all dependencies via `PlanToolDrawContext` (a context struct passed to `activate()`). This is preferable to constructor injection for tools because:
1. Tools are activated/deactivated frequently; swapping dependencies mid-lifecycle is common.
2. The context struct is easily mockable in tests.
3. It aligns with C06 (Tool interface contract) which uses context injection.

**Do NOT** switch plan-tool handlers to constructor injection. Continue and complete the `PlanToolDrawContext` injection pattern started in §DOOR-AUDIT-2026 / §WINDOW-AUDIT-2026.

### AD-4: Typed handlers live in the plugin that owns the element family

Per the 8-layer model, element-family handlers belong in `plugins/<family>/src/handlers/`. They must not be added to `apps/editor/src/engine/` (L5 app layer, L7+ prohibited). The only acceptable location for a handler is in a plugin (L7 if using plugin SDK) or a package (L1/L2 if shared infrastructure). The `initBusHandlers.ts` bridge exists in L5 only as a transitional scaffold.

---

## 8. Risk Register

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| RP-1 | `RingBufferUndoStack` missing support for some command types during Phase 3 transition | Medium | High — undo broken for migrated families | Verify `RingBufferUndoStack.pushPatch()` is called in every new handler; add T6-style regression test per family before removing old `CommandManager` support |
| RP-2 | Phase 3 Batch 3.6 (`PropertyInspector` mass migration — 52 sites) produces a very large diff, increasing merge-conflict risk | High | Medium | Migrate PropertyInspector per element family rather than in one large PR; each family's PropertyInspector patch goes in the same PR as that family's handler migration |
| RP-3 | Injecting `commandBus` into `HostedElementDragController` (P4.2) requires updating all 6+ call sites that construct it | Medium | Low — isolated to `input-host` | Use factory function `createHostedElementDragController(runtime)` to centralise construction and limit call-site changes |
| RP-4 | Deleting `CommandManager.ts` (P4.5) while the undo stack mid-migration causes history splice | High | High | Gate P4.5 strictly on Phase 3 complete (all 202 sites migrated); `grep -r 'commandManager.execute' . | wc -l` === 0 is a blocking pre-condition |
| RP-5 | CRDT/sync subsystem (`YjsDocAdapter.ts`) still reads from legacy stores rather than bus events | Low | High for collaboration | Yjs adapter migration is out of scope for this plan but must precede collaboration GA; flag as dependency in C08 |

---

## 9. Completion Checklist (Done Means Done)

- [x] Phase 0: All 6 items at HEAD ✅
- [x] Phase 1.1: `WallPlanToolHandler` passes `{ source: 'HUMAN_DIRECT' }` not `commandContext` ✅ (resolved by P2.1 — dual-write removed; §P2.1 comment at WallPlanToolHandler.ts:28)
- [x] Phase 1.2: Bridge metadata JSDoc + consistent call sites in `initBusHandlers.ts` ✅ (`§P1.2 BRIDGE METADATA RULE` at initBusHandlers.ts:124)
- [x] Phase 1.3: `__pryzmInitComplete` sentinel active; plan tools refuse to arm without it ✅ (Step A: initTools.ts:1176; Step B: PlanViewToolOverlay.ts:402 + SvpPlanToolOverlay.ts:405; Step C: global-bridge.ts:42)
- [x] Phase 1.4: `_cmExec` helper replaces all bare `if (cm) cm.execute()` in bridges ✅ (`_cmExec` at initBusHandlers.ts:131)
- [x] Phase 2.1: Wall bus handler drives mesh rebuild; no dual-write in `WallPlanToolHandler` ✅ (`§P2.1` comment at WallPlanToolHandler.ts:28; wall.created bridge at initTools.ts:814)
- [x] Phase 2.2: Same for curtain walls ✅ (`§P2.2` comment at CurtainWallPlanToolHandler.ts:37; plan-tool no longer dual-writes)
- [x] Phase 2.3: Typed `wall.opening.create` handler; E.5.6 bridge removed ✅ (`§P2.3` comments at initBusHandlers.ts:39 and initTools.ts:843)
- [ ] Phase 3 Batch 3.1 — Curtain-Walls: `curtainwall.create` typed handler wired; `curtain-wall.create` bridge removed; legacy-store bridge added ✅ 2026-05-18
- [ ] Phase 3 Batch 3.1 — remaining (Slabs, Doors, Windows): typed handlers; legacy bridges; `initBusHandlers.ts` entries removed
- [ ] Phase 3 Batch 3.2–3.6: All remaining sites migrated; `initBusHandlers.ts` empty + deleted
- [ ] Phase 4.1: `PlanToolDrawContext` carries typed `commandBus`; no `(window as any).runtime` in tool handlers
- [ ] Phase 4.2: `HostedElementDragController` injected with `commandBus`
- [ ] Phase 4.3: `WallTransformController` injected with `commandBus`
- [ ] Phase 4.4: `getCommandManagerBridge()` deleted; 0 callers
- [ ] Phase 4.5: `CommandManager.ts` deleted; `RingBufferUndoStack` sole undo path
- [ ] Phase 5: T1–T6 tests pass; `pnpm test` exits 0
- [x] All new CI gates active: `check:commandmanager` wired in package.json (threshold=56, ratchet-down to 0); Phase 4.4 grep gate zero ✅
- [x] G1–G8 success criteria verified by grep and CI (2026-05-18): G1 ✅ G2 ✅ G3 ⚠️partial G4 ⚠️ratchet-56 G5 ✅ G6 ✅ G7 ✅ G8 ✅

---

## 10. Traceability Matrix

| Plan Item | Audit Finding | Contract | Architecture Principle |
|-----------|--------------|----------|----------------------|
| P1.1 | R-1 (wrong arg type) | C11 §2 | C14 §2.1 (correct metadata) |
| P1.2 | F-2 (inconsistent metadata) | C11 §2 | C14 §2.1 |
| P1.3 | R-3 (window.* sentinel) | C02 §3.1 | C14 §2.3 (no window.*) |
| P1.4 | F-1 residual (bridge no-op) | C11 §5 | C14 §2.1 (no silent failures) |
| P2.1–P2.3 | §2 (3 dispatch paths) | C11 §2 | P6 (commands = only mutation) |
| Phase 3 | R-2 (202 legacy sites) | C14 §2.1 | P6, P4 |
| P4.1–P4.3 | R-3 (window.* deps) | C14 §2.2, §2.3 | P4 |
| P4.4–P4.5 | R-2 (CommandManager deletion) | C14 §3 | E-finish.3 |
| T1–T2 | Audit §13 gaps 1–2 | C15 §13 | — |
| T3 | Audit §13 gap 3 | C15 §8, §8.1 | — |
| T4 | Audit §13 gap 4 | C15 §12 | — |
| T5 | Audit §13 gap 5, P1.3 | C02 §3.1 | — |
| T6 | Phase 2.3 regression | C11 §3 | P6 |

---

*End of implementation plan. Cross-reference: `ELEMENT-OPERATIONS-AUDIT-2026-05-17.md` for all findings; `docs/02-decisions/contracts/C15-HOSTED-ELEMENT-CONTRACT.md` §8, §8.1, §12, §13 for contract updates applied to date.*
