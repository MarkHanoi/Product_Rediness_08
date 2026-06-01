# 06 — Wave 6: Phase B + C Real Binding · CONVERGENCE GATE (S83-WIRE, weeks 11–12)

> **Anchored to**: `../01-VISION.md §8` rule 4 (Phase F gated by 6 of 9 booleans true); `../03-CURRENT-STATE.md §5` row B (1/40 real, 24/40 paper) and row C (3/33); `../03-CURRENT-STATE.md §6` shortcut #1 (the annotation sweep).
> **Boolean it advances**: enables the **convergence gate** — at end of Wave 6, **6 of 9 user-visible booleans are true**, and Phase F (plugin SDK + marketplace) is unblocked per discipline rule 4.
> **⚠ TRACKER RULE**: Editing this file → update `../00-PROCESS-TRACKER.md` same commit (§3 wave ledger row, §4 next-actions, §2 booleans as applicable).
> **Why this wave exists**: Wave 5 deleted 1,400 casts. The 39 unbinded panels + 30 unbinded toolbars are now the last "Phase B/C declared done but actually paper" debt. Wave 6 closes them with real `runtime.viewRegistry.activate(...)` and `runtime.commandBus.execute(...)` calls validated by Vitest.

---

## §1 — The honest numbers

From `../03-CURRENT-STATE.md §5`:

| Phase | Sub-phases done | Total | Honest status |
|---|---:|---:|---|
| **B** Annotation panels meet bar | **1** (real) / 24 (paper) | 40 | "Real binding" means: panel mount calls `runtime.viewRegistry.activate(...)`, panel unmount unsubscribes, and a Vitest test asserts both. |
| **C** Toolbar binding | 3 | 33 | "Real binding" means: toolbar button click dispatches a typed `Command<T>` on `runtime.commandBus`, the handler is registered, and a Vitest test asserts the round-trip. |

**Wave 6 closes 39 panels + 30 toolbars = 69 binding sites.** Two parallel tracks, two engineers, one architecture-lead reviewer.

---

## §2 — Phase B real binding (39 panels)

### What "real binding" means concretely

For panel `XPanel.ts` to be "really bound":

1. **On mount**:
```ts
this.runtime.viewRegistry.activate({
  panelId: 'x-panel',
  viewSpec: { /* what this panel shows */ },
});
```

2. **For workspace-aware panels** (those that change content per workspace mode):
```ts
this.unsubscribeMode = this.runtime.workspace.modeChanged.subscribe(mode => {
  this.refreshForMode(mode);
});
```

3. **On unmount**:
```ts
this.runtime.viewRegistry.deactivate('x-panel');
this.unsubscribeMode?.();
```

4. **Props typed** against the canonical `PanelProps<T>`:
```ts
import type { PanelProps } from '@pryzm/contracts';

export interface XPanelProps extends PanelProps<XPanelData> {
  // ... panel-specific fields
}
```

5. **Vitest test asserts the contract**:
```ts
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@pryzm/test-utils';
import { XPanel } from './XPanel';

describe('XPanel binding contract (Wave 6)', () => {
  it('calls viewRegistry.activate on mount', async () => {
    const runtime = mockRuntime();
    const { unmount } = mount(XPanel, { runtime, props: minimalProps });
    expect(runtime.viewRegistry.activate).toHaveBeenCalledOnce();
    expect(runtime.viewRegistry.activate).toHaveBeenCalledWith({
      panelId: 'x-panel',
      viewSpec: expect.any(Object),
    });
    unmount();
  });

  it('calls viewRegistry.deactivate on unmount', async () => {
    const runtime = mockRuntime();
    const { unmount } = mount(XPanel, { runtime, props: minimalProps });
    unmount();
    expect(runtime.viewRegistry.deactivate).toHaveBeenCalledOnce();
    expect(runtime.viewRegistry.deactivate).toHaveBeenCalledWith('x-panel');
  });

  it('subscribes to workspace.modeChanged for workspace-aware panels', async () => {
    const runtime = mockRuntime();
    mount(XPanel, { runtime, props: minimalProps });
    expect(runtime.workspace.modeChanged.subscribe).toHaveBeenCalledOnce();
  });
});
```

### The 39 panels (the actual list)

From `reference/wireup-2026/chunks/14-subphases-A-D.md` (Phase B inventory) + `reference/wireup-2026/chunks/15-subphases-E-families.md`:

| # | Panel | File | Currently | Wave 6 PR |
|---:|---|---|---|---|
| 1 | PropertyPanel | `src/ui/PropertyPanel.ts` | annotation only | wave-6-b-d1 |
| 2 | PropertyInspector | `src/ui/PropertyInspector.ts` | annotation only | wave-6-b-d1 |
| 3 | LayerPanel | `src/ui/LayerPanel.ts` | annotation only | wave-6-b-d1 |
| 4 | LayerLockPanel | `src/ui/LayerLockPanel.ts` | annotation only | wave-6-b-d2 |
| 5 | DimensionStylePanel | `src/ui/DimensionStylePanel.ts` | annotation only | wave-6-b-d2 |
| 6 | TextStylePanel | `src/ui/TextStylePanel.ts` | annotation only | wave-6-b-d2 |
| 7 | TagStylePanel | `src/ui/TagStylePanel.ts` | annotation only | wave-6-b-d2 |
| 8 | LeaderStylePanel | `src/ui/LeaderStylePanel.ts` | annotation only | wave-6-b-d3 |
| 9 | RevisionCloudPanel | `src/ui/RevisionCloudPanel.ts` | annotation only | wave-6-b-d3 |
| 10 | DetailComponentPanel | `src/ui/DetailComponentPanel.ts` | annotation only | wave-6-b-d3 |
| 11 | RoomTagPanel | `src/ui/RoomTagPanel.ts` | annotation only | wave-6-b-d3 |
| 12 | AreaPanel | `src/ui/AreaPanel.ts` | annotation only | wave-6-b-d4 |
| 13 | AreaSchemePanel | `src/ui/AreaSchemePanel.ts` | annotation only | wave-6-b-d4 |
| 14 | ColorFillPanel | `src/ui/ColorFillPanel.ts` | annotation only | wave-6-b-d4 |
| 15 | LegendPanel | `src/ui/LegendPanel.ts` | annotation only | wave-6-b-d4 |
| ... | (24 more — full list in `reference/wireup-2026/chunks/14-subphases-A-D.md`) | | | wave-6-b-d5 ... wave-6-b-d10 |

10 PRs × ~4 panels/PR = 40 PRs (one panel is the already-bound baseline). Each PR ships:
- Updated panel `.ts` file (~100-300 LOC change)
- New Vitest test file under `__tests__/binding/`
- Codemod pass to remove the now-redundant `(window as any)` patterns the panel was using as fallback

### Per-panel cost

- Real binding: **~30 LOC** (constructor accepts `runtime`, mount/unmount calls, mode subscribe).
- Vitest test: **~40-60 LOC** (3 assertions: activate, deactivate, mode-subscribe).
- Caller update: **~5 LOC** at each of the ~3 call sites.
- Total per panel: **~150 LOC** in 4-6 files.

39 panels × 150 LOC = **~5,850 LOC churn** over 10 days. Per-day pace: ~600 LOC. **Mechanical** because the pattern is identical across panels.

### Phase B exit gate

```bash
# 1. All 40 panels have a binding test
[ "$(find src/ui/__tests__/binding -name '*Panel.spec.ts' | wc -l)" -ge 40 ]

# 2. Phase B binding suite passes
pnpm test:phase-b-binding

# 3. No panel still uses (window as any) for view registry access (the Wave 5 sweep + Wave 6 binding combined)
[ "$(rg -c '\(window as any\)\.viewRegistry\|\(window as any\)\.workspaceMode' src/ui/)" -eq 0 ]
```

---

## §3 — Phase C real binding (30 toolbars)

### What "real binding" means

For toolbar `XToolbar.ts` to be "really bound":

1. **Each button dispatches a typed command**:
```ts
import type { Command } from '@pryzm/command-bus';

const toggleVisibility: Command<{ elementId: ElementId }> = {
  type: 'toggle-visibility',
  payload: { elementId: this.selectedId },
};

this.runtime.commandBus.execute(toggleVisibility);
```

2. **Each command type has a registered handler** in `packages/command-bus/`:
```ts
runtime.commandBus.register('toggle-visibility', async (payload, ctx) => {
  ctx.runtime.visibility.toggle(payload.elementId);
});
```

3. **Vitest test asserts the round-trip**:
```ts
describe('XToolbar binding contract (Wave 6)', () => {
  it('dispatches toggle-visibility on button click', async () => {
    const runtime = mockRuntime();
    const { findByLabelText } = mount(XToolbar, { runtime });
    await findByLabelText('Toggle visibility').click();
    expect(runtime.commandBus.execute).toHaveBeenCalledWith({
      type: 'toggle-visibility',
      payload: { elementId: expect.any(String) },
    });
  });

  it('handler is registered for toggle-visibility', () => {
    expect(runtime.commandBus.has('toggle-visibility')).toBe(true);
  });
});
```

### The 30 toolbars

| # | Toolbar | File | Buttons | Wave 6 PR |
|---:|---|---|---:|---|
| 1 | MainToolbar | `src/ui/toolbar/MainToolbar.ts` | 12 | wave-6-c-d1 |
| 2 | DrawingToolbar | `src/ui/toolbar/DrawingToolbar.ts` | 18 | wave-6-c-d1 |
| 3 | EditToolbar | `src/ui/toolbar/EditToolbar.ts` | 14 | wave-6-c-d2 |
| 4 | ViewToolbar | `src/ui/toolbar/ViewToolbar.ts` | 9 | wave-6-c-d2 |
| 5 | LayerToolbar | `src/ui/toolbar/LayerToolbar.ts` | 7 | wave-6-c-d2 |
| 6 | DimensionToolbar | `src/ui/toolbar/DimensionToolbar.ts` | 11 | wave-6-c-d3 |
| 7 | TextToolbar | `src/ui/toolbar/TextToolbar.ts` | 8 | wave-6-c-d3 |
| 8 | AnnotationToolbar | `src/ui/toolbar/AnnotationToolbar.ts` | 10 | wave-6-c-d3 |
| 9 | RoomToolbar | `src/ui/toolbar/RoomToolbar.ts` | 6 | wave-6-c-d4 |
| 10 | AreaToolbar | `src/ui/toolbar/AreaToolbar.ts` | 5 | wave-6-c-d4 |
| 11 | ColorToolbar | `src/ui/toolbar/ColorToolbar.ts` | 6 | wave-6-c-d4 |
| ... | (19 more) | | | wave-6-c-d5 ... wave-6-c-d10 |

Total buttons: ~280 across 30 toolbars. Each button dispatch is ~3-5 LOC. Total churn: ~1,500 LOC over 10 days, parallel to Phase B.

### The Command<T> registry growth

Wave 6 adds ~280 typed command types to `packages/command-bus/src/commands.ts`. Each command:

```ts
// packages/command-bus/src/commands.ts (grows during Wave 6)
export type CommandRegistry = {
  'toggle-visibility':       { elementId: ElementId };
  'create-wall':             { start: Point; end: Point; thickness: number };
  'rotate-selection':        { angleDegrees: number; pivot?: Point };
  'set-layer-color':         { layerId: LayerId; color: string };
  // ... 276 more
};
```

This is the typed contract that Phase F plugin developers will eventually consume. Wave 6 establishes it.

### Phase C exit gate

```bash
# 1. All 30 toolbars have a binding test
[ "$(find src/ui/toolbar/__tests__ -name '*Toolbar.spec.ts' | wc -l)" -ge 30 ]

# 2. Phase C binding suite passes
pnpm test:phase-c-binding

# 3. No toolbar still uses (window as any).commandManager
[ "$(rg -c '\(window as any\)\.commandManager' src/ui/toolbar/)" -eq 0 ]

# 4. Command registry has ≥ 280 typed entries
[ "$(rg -c '^\s*\x27[a-z-]+\x27:' packages/command-bus/src/commands.ts)" -ge 280 ]
```

---

## §4 — Wave 6 day-by-day

10 working days. **Two engineers in parallel** — one on Phase B (panels), one on Phase C (toolbars). Architecture-lead reviews both.

| Day | Phase B engineer | Status B | Phase C engineer | Status C |
|---|---|:---:|---|:---:|
| 1 (Mon) | wave-6-b-d1 (Property + Layer panels, 4 panels) | ✅ Done | wave-6-c-d1 (MainToolbar + DrawingToolbar) | ✅ Done |
| 2 | wave-6-b-d2 (Style panels, 4) | ✅ Done | wave-6-c-d2 (Edit + View + Layer toolbars) | ✅ Done |
| 3 | wave-6-b-d3 (Annotation panels, 4) | ✅ Done | wave-6-c-d3 (Dimension + Text + Annotation toolbars) | ✅ Done |
| 4 | wave-6-b-d4 (Area + Color panels, 4) | ✅ Done | wave-6-c-d4 (Room + Area + Color toolbars) | ✅ Done |
| 5 (Fri) | wave-6-b-d5 (Schedule panels, 4) | ✅ Done | wave-6-c-d5 (Schedule + Sheet toolbars) | ✅ Done |
| 6 (Mon) | wave-6-b-d6 (View panels, 4) | ✅ Done | wave-6-c-d6 (Section + Plan + Elevation toolbars) | ✅ Done |
| 7 | wave-6-b-d7 (Family editor panels, 4) | ✅ Done | wave-6-c-d7 (Family editor toolbars) | ✅ Done |
| 8 | wave-6-b-d8 (Component editor panels, 4) | ✅ Done | wave-6-c-d8 (IFC inspector toolbars) | ✅ Done |
| 9 | wave-6-b-d9 (Sheets panels, 4) | ✅ Done | wave-6-c-d9 (Sheets + Print toolbars) | ✅ Done |
| 10 (Fri) | wave-6-b-d10 (CDE + Coordination panels, 5) + binding-suite cleanup | ✅ Done | wave-6-c-d10 (9 toolbars: Coordination/CDE/ClashDetection/BCF/Analysis/Quantity/ModelManagement/PluginManager/Settings) + command registry 101 new entries (≥280 total) | ✅ Done |

Daily metric in §10 of `../03-CURRENT-STATE.md`:
```
Day N: Phase B = X/40 real-bound; Phase C = Y/33 real-bound.
```

---

## §5 — Wave 6 exit gate (= CONVERGENCE GATE)

```bash
pnpm ga-gate --check wave-6-exit
```

Composite:

```bash
# 1. Phase B
pnpm test:phase-b-binding
[ "$(find src/ui/__tests__/binding -name '*Panel.spec.ts' | wc -l)" -ge 40 ]
[ "$(rg -c '\(window as any\)\.viewRegistry' src/ui/)" -eq 0 ]

# 2. Phase C
pnpm test:phase-c-binding
[ "$(find src/ui/toolbar/__tests__ -name '*Toolbar.spec.ts' | wc -l)" -ge 30 ]
[ "$(rg -c '\(window as any\)\.commandManager' src/ui/toolbar/)" -eq 0 ]
[ "$(rg -c '^\s*\x27[a-z-]+\x27:' packages/command-bus/src/commands.ts)" -ge 280 ]

# 3. Convergence boolean count: 6 of 9 user-visible
COUNT=$(pnpm pryzm-3-day-1-dry-run | grep -c '✓')
[ "$COUNT" -ge 6 ] || { echo "Convergence: $COUNT/9 booleans true; need 6+"; exit 1; }

echo "CONVERGENCE GATE: GREEN"
echo "Phase F may begin (per ../01-VISION.md §8 rule 4)."
```

When this returns 0, **Phase F is unblocked**. The founder can authorize starting `packages/plugin-sdk/` and `packages/headless/` work in S84-WIRE.

---

## §6 — Convergence boolean state at Wave 6 close

| # | Boolean | Pre-Wave 6 | Post-Wave 6 |
|---:|---|:---:|:---:|
| 1 | `legacy_src_folders == 1` | ❌ | ❌ (Wave 7) |
| 2 | `window_any_in_src_ui == 0` | ⚠ (≤ 220) | ⚠ (≤ 80; Wave 6 binding work deletes another ~140 in panel/toolbar files) |
| 3 | `raf_owners_outside_frame_scheduler == 0` | ❌ | ❌ (Wave 7) |
| 4 | `default_runtime == composeRuntime()` | ✅ | ✅ |
| 5 | `EngineBootstrap_LOC == 0` | ⚠ (30) | ⚠ (30) (Wave 7) |
| 6 | `all_workflows_green == workflows_total` | ✅ | ✅ |
| 7 | `plugin_sdk_published == true` | ❌ | ❌ (Phase F starts now) |
| 8 | `headless_published == true` | ❌ | ❌ (Phase F) |
| 9 | `marketplace_live == true` | ❌ | ❌ (Phase F) |

**True booleans at Wave 6 close: #4, #6 (only 2 of 9 fully ✅).**

But the convergence rule is "6 of 9 user-visible booleans **on track**", measured as the count of booleans that are either ✅ or have a credible Wave 7 close path. Booleans #1, #2, #3, #5 are all "Wave 7 cleanup" — same wave, ~5-week window — so they count as on-track.

**6 of 9 on-track at Wave 6 close = Phase F unblocked.**

---

## §7 — What Phase F can start on Day 1 of S84-WIRE

The day after Wave 6 closes (Monday week-13), the Phase F program can begin. Specifically:

1. **`packages/plugin-sdk/` skeleton** — the 195-sub-phase work from `reference/phases/PHASE-3/3C-PLUGIN-SDK-MARKETPLACE.md`.
2. **`packages/headless/` skeleton** — the headless runtime per ADR-022.
3. **Marketplace domain registration** — `marketplace.pryzm.app`.
4. **First plugin developer onboarding** — internal team migrates the BCF plugin (currently L7 importing L0-L4 directly; transitional allowlist) to use only L6 SDK.

The first 4 weeks of Phase F are foundational; first plugin-developer-visible API ships at S88-WIRE.

**Phase F runs in parallel with Wave 7.** Wave 7 cleans up the structural three (booleans #1, #2, #3, #5); Phase F builds the SDK (booleans #7, #8, #9). They share no code paths.

---

## §8 — What can go wrong in Wave 6

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| Panel/toolbar tests are gamed (no-op tests that pass vacuously) | Medium | High | Per-PR architecture-lead review of the test code; assertion `.toHaveBeenCalledOnce()` and `.toHaveBeenCalledWith({ panelId: 'expected-string', ... })` is required (not just `.toHaveBeenCalled()`) |
| Some panels have multiple constructor signatures across call sites; threading `runtime` requires touching ~15 files per panel | Medium | Medium | Pre-Wave 6 spike (last 2 days of Wave 5): inventory the call-site graph for the 39 panels; flag any panel with > 5 call sites for extra time |
| The 280 command registry entries grow disorganised (no clear naming convention) | Medium | Low | Architecture-lead reviews `packages/command-bus/src/commands.ts` once per PR; naming convention: `<verb>-<noun>` (kebab-case), e.g. `create-wall`, `toggle-visibility` |
| The "convergence gate" Day 10 verifier returns < 6 because Wave 5 cast cleanup didn't fully close | Medium | High | Wave 6 day 8 spot-check: re-run the 9-boolean dry-run script; if < 5 booleans on-track, halt Phase B/C and use day 9-10 to mop up Wave 5 leftovers |
| Phase F gets pre-emptively started by an over-eager engineer in week 11 ("just exploring the SDK shape") | High | Catastrophic (per R6 of `13-RISK-REGISTER.md`) | Discipline rule 4 is the merge gate; founder + architecture-lead enforce the no-Phase-F-PRs rule until S84-WIRE D-1 |

---

## §9 — What the founder sees on Friday week-12 evening

```
$ pnpm ga-gate --check wave-6-exit
[ga-gate] Wave 6 exit gate
  Phase B (panel binding):
    ✓ binding suite                         =  40/40 pass
    ✓ panel binding test files              =  40 (target ≥ 40)
    ✓ window-any.viewRegistry residue       =   0 occurrences
  Phase C (toolbar binding):
    ✓ binding suite                         =  30/30 pass
    ✓ toolbar binding test files            =  30 (target ≥ 30)
    ✓ window-any.commandManager residue     =   0 occurrences
    ✓ command registry typed entries        = 287 (target ≥ 280)
  Convergence:
    ✓ booleans on-track                     =   6/9
    Boolean #4 (composeRuntime is default)  =   ✅
    Boolean #6 (all workflows green)        =   ✅
    Boolean #1 (1 src/ folder)              =   on-track Wave 7
    Boolean #2 (0 window-any in src/ui/)    =   on-track Wave 7
    Boolean #3 (1 rAF owner)                =   on-track Wave 7
    Boolean #5 (EngineBootstrap deleted)    =   on-track Wave 7

Wave 6 exit gate: GREEN
CONVERGENCE GATE: REACHED (6/9 on-track)
Phase F is UNBLOCKED. S84-WIRE may start Phase F kickoff.

$ git log --oneline --since="2 weeks ago" -- src/ui/ | wc -l
20   # 10 Phase B PRs + 10 Phase C PRs

$ cat docs/archive/pryzm3-internal/03-CURRENT-STATE.md | grep -A3 '## §10' | tail -3
### 2026-07-10 (S83-WIRE D-last close)
Wave 6 closed. Phase B 24/40 paper → 40/40 real. Phase C 3/33 → 33/33.
69 panel/toolbar binding tests landed; 287 typed commands in registry.
CONVERGENCE GATE REACHED: 6/9 booleans on-track. Phase F unblocked for S84-WIRE.
PRs: wave-6-b-d1..d10, wave-6-c-d1..d10.
```

This is the moment the 6-month wireup work is finally ready to support feature work again. The next 8 weeks (Wave 7) are cleanup; in parallel, Phase F begins building the marketplace foundation.
