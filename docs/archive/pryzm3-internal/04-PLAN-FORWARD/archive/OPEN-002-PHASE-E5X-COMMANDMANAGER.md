# OPEN-002 — Phase E.5.x: CommandManager Full Migration

> **Status**: 🔴 ACTIVE — Sprint E.5.1 not yet started
> **Anchor**: `54-COMPLETE-LEGACY-ELIMINATION-PLAN.md §Phase E.5.x`, `23-L2-COMMAND-EVENT-BUS-IMPLEMENTATION-PLAN.md`
> **Prerequisite**: GAP-001 CLOSED ✅ (OI-046 — aliasing loophole fixed 2026-05-16)
> **Gate**: `tools/ga-gate/check-no-commandmanager.ts` (ratchet baseline = 154 as of 2026-05-16)
> **Effort**: 6 sprints (~18 working days)
> **Outcome**: `runtime.commandBus.dispatch()` is the only mutation path. Ctrl-Z works. Yjs CRDT activates. `CommandManager.ts` and `global-bridge.ts` are deleted.

---

## §0 — Why This Is the Most Important Open Item

The PRYZM3 architecture has three features that are **structurally complete but operationally dormant**:

1. **Undo / Ctrl-Z** — `RingBufferUndoStack` is wired in `composeRuntime()`. `undoPatch()` is the keyboard handler. The ring buffer is always empty because no commands flow through the bus. Ctrl-Z does nothing.
2. **Yjs Collaboration** — `YjsDocAdapter.ts` (871 lines, real `Y.Doc`) is wired as the CommandBus CRDT applier. Because the bus receives 0 production commands, two users editing simultaneously see no real-time updates.
3. **OTel Command Spans** — Every handler has `withHandlerSpan()`. None fire in practice because the handler entry point is never reached from production code.

All three become operational automatically when Phase E.5.x completes. This is a single-axis migration — the payoff is enormous relative to the effort.

---

## §1 — Current State (2026-05-16 verified)

| Pattern | Count | Location |
|---|---:|---|
| `cmdMgr.execute()` aliased | **87** | `apps/editor/src/` |
| `window.commandManager` reads (alias-create lines) | **67** | `apps/editor/src/` |
| `commandManager.execute()` literal | **0** | ✅ Already eliminated |
| `runtime.commandBus.dispatch()` production calls | **0** | Target: 500+ |

Gate ratchet baseline: **154** (87 + 67). Ceiling trajectory set in `.ga-gate/baselines/no-commandmanager.json`.

---

## §2 — The Two Remaining Legacy Sites (IMMEDIATE — before E.5.1)

From `23-L2-COMMAND-EVENT-BUS-IMPLEMENTATION-PLAN.md §P0`, two sites were identified as the "last two" before the plan was superseded. These still exist:

1. `apps/editor/src/engine/engineLauncher.ts:1306` — cmdMgr passed into BatchCoordinator
2. `apps/editor/src/sync/RemoteCommandDispatcher.ts:84` — cmdMgr.execute in sync handler

**Fix both before starting E.5.1 sprints** to clear the baseline.

---

## §3 — Sprint Plan

### Sprint E.5.1 (3 days): Property Inspector — ~16 sites

**Target files:**
- `apps/editor/src/ui/property-inspector/PropertyInspectorApply.ts` (~16 cmdMgr sites)
- Related: `PropertyInspectorFloatInput.ts`, `PropertyInspectorIntInput.ts`

**Work:**
1. Identify the 6 element property-update command types dispatched from PropertyInspector
2. Register each in `packages/command-registry/src/commands.ts` (if not already registered)
3. Ensure corresponding handlers in `plugins/*/src/handlers/` have `produceCommand()` + `affectedStores:`
4. Replace each `cmdMgr.execute(new XxxCommand(...))` with `runtime.commandBus.dispatch({ type: 'xxx.yyy', ... })`
5. Verify: `rg "cmdMgr\.execute\b" apps/editor/src/ui/property-inspector --type ts | wc -l` → 0

**Gate**: Lower CMDMGR_CEILING to 139 in `.ga-gate/baselines/no-commandmanager.json`

**Verifier**:
```bash
rg "cmdMgr\.execute\b|window\.commandManager\b" apps/editor/src --type ts | grep -v "// " | wc -l
# Expected: ≤ 139
```

---

### Sprint E.5.2 (3 days): Plan View Move / Copy / Align — ~28 sites

**Target files:**
- `apps/editor/src/engine/views/plantools/MovePlanToolHandler.ts` (~13)
- `apps/editor/src/engine/views/plantools/AlignPlanToolHandler.ts` (~8)
- `apps/editor/src/engine/views/plantools/CopyPlanToolHandler.ts` (~7)

**Work:**
1. Migrate each plan tool handler to dispatch via `runtime.commandBus.dispatch()`
2. Ensure `MoveElementCommand`, `AlignElementsCommand`, `CopyElementCommand` have registered handlers with `produceCommand()` and `affectedStores:`
3. Wire `pryzm.element.moved`, `pryzm.element.aligned`, `pryzm.element.copied` spans in handlers

**Gate**: Lower CMDMGR_CEILING to 111

---

### Sprint E.5.3 (3 days): Property Panel + PlanViewInteraction — ~15 sites

**Target files:**
- `apps/editor/src/ui/property-panel/PropertyPanelTypeSelector.ts` (~10)
- `apps/editor/src/ui/property-panel/PropertyPanel.ts` (~5)
- `apps/editor/src/engine/views/PlanViewInteraction.ts` (alias-create lines only)

**Work:**
1. Migrate PropertyPanel command dispatches to bus
2. Clean up PlanViewInteraction alias-create patterns (5 const cmdMgr = window.commandManager occurrences)
3. Ensure property-update commands from panels reach handlers correctly

**Gate**: Lower CMDMGR_CEILING to 96

---

### Sprint E.5.4 (2 days): Gizmo Drag-End — ~8 sites (C06 §4.3)

**Target files:**
- `apps/editor/src/engine/registerTransformDragHandler.ts` (~8 sites)

**Work:**
1. Replace `cmdMgr.execute(new MoveElementCommand(...))` in gizmo drag-end with `runtime.commandBus.dispatch()`
2. Ensure the `pryzm.element.transform` OTel span is in the handler (C06 §4.3 contract)
3. Verify gizmo drag-end results appear in OTel traces

**Gate**: Lower CMDMGR_CEILING to 80

---

### Sprint E.5.5 (4 days): Remaining plantools + overlays — ~20 sites

**Target files** (all remaining `plantools/*.ts` not yet migrated):
- `ExtrudePlanToolHandler.ts`, `SplitWallPlanToolHandler.ts`, `DrawWallPlanToolHandler.ts`
- `SelectionPlanToolHandler.ts`, `DrawRoomPlanToolHandler.ts`
- Overlay handlers + context menu dispatches

**Work:**
1. Systematic migration of all remaining `apps/editor/src/engine/views/plantools/` files
2. Ensure all plan tool commands are registered in command-registry
3. Run gate: expect count ≤ 20

**Gate**: Lower CMDMGR_CEILING to 20

---

### Sprint E.5.6 (3 days): packages/ sweep + delete legacy globals

**Target files:**
- `packages/ai-host/src/` — AI command dispatches
- `packages/core-app-model/src/` — model mutation sites
- `packages/command-registry/src/` — self-referencing sites
- `plugins/annotations/src/` — annotation commands
- Remaining misc sites

**Work:**
1. Migrate all `cmdMgr.execute()` sites in packages/ and plugins/
2. Once ceiling = 0:
   - Delete `apps/editor/src/engine/global-bridge.ts`
   - Delete `apps/editor/src/engine/CommandManager.ts`
   - Remove `window.commandManager` from `global-window.d.ts`
   - Remove `CommandManager` import from `engineLauncher.ts`
3. Update `apps/editor/src/boot-shell.d.ts` to remove commandManager

**Gate**: CMDMGR_CEILING = 0 → gate becomes a hard-fail regression guard (no ratchet)

**Milestone verifier** (all three must return 0):
```bash
rg "cmdMgr\.execute\b" apps/editor/src --type ts | grep -v "// " | wc -l          # → 0
rg "window\.commandManager\b" apps/editor/src --type ts | grep -v "// " | wc -l  # → 0
ls apps/editor/src/engine/CommandManager.ts 2>/dev/null || echo "DELETED"         # → DELETED
```

---

## §4 — Structural Changes Each Sprint Must Make

For each migrated command site, the pattern is:

```typescript
// BEFORE (legacy)
const cmdMgr = window.commandManager;
cmdMgr.execute(new MoveElementCommand({ elementId, delta }));

// AFTER (PRYZM3)
runtime.commandBus.dispatch({
  type: 'element.move',
  payload: { elementId, delta },
  source: 'user',
});
```

Each migrated command type also requires:
1. **Entry in `packages/command-registry/src/commands.ts`** — type string registered
2. **Handler in `plugins/{family}/src/handlers/`** — `produceCommand()` called, `affectedStores:` populated
3. **OTel span** — `withHandlerSpan('pryzm.element.xxx', ...)` in handler
4. **`structuredClone`** in handler for undo payload (to be replaced with `immer` in Phase E.undo)

---

## §5 — What Becomes Functional After E.5.6 Close

| Feature | Before E.5.x | After E.5.6 |
|---|---|---|
| **Ctrl-Z / Undo** | Always empty, does nothing | Ring buffer fills → Ctrl-Z restores last N operations |
| **Yjs Collaboration** | Dormant, no real-time sync | Every mutation generates a Yjs op → collaborators see updates |
| **OTel Command Spans** | Never fire | Every command generates `pryzm.command.xxx` span |
| **CommandManager.ts** | Active (87 dispatch sites) | Deleted |
| **C03 contract** | FAILING | PASSING |
| **C11 contract** | PARTIAL | PASSING |
| **C06 gizmo contract** | PARTIAL | PASSING |

---

## §6 — Acceptance Criteria (Sprint E.5.6 Close)

```bash
# 1. No legacy command sites
rg "cmdMgr\.execute\b|window\.commandManager\b" apps/editor/src --type ts | grep -v "// " | wc -l
# Expected: 0

# 2. CommandManager.ts deleted
ls apps/editor/src/engine/CommandManager.ts 2>/dev/null || echo "DELETED"
# Expected: DELETED

# 3. global-bridge.ts deleted
ls apps/editor/src/engine/global-bridge.ts 2>/dev/null || echo "DELETED"
# Expected: DELETED

# 4. Production bus calls exist
rg "runtime\.commandBus\.dispatch" apps/editor/src --type ts | grep -v "// |__tests__" | wc -l
# Expected: ≥ 80

# 5. All 20 gates still passing
pnpm tsx tools/ga-gate/run-all.ts
# Expected: all exit 0
```

---

*Stamp: 2026-05-16. This plan supersedes §P12–§P13 of doc 23-L2-COMMAND-EVENT-BUS-IMPLEMENTATION-PLAN.md. Start with Sprint E.5.1 — unblocked.*
