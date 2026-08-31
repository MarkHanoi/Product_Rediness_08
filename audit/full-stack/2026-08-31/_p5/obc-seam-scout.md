# OBC Seam Scout — Axis 7 Wave A (measured 2026-08-31)

Scout for the banned-3p arm (RED 124/113, `tools/ga-gate/check-layer-boundaries.ts`
`RESTRICTED_MODULES` = `@thatopen/components`, `@thatopen/components-front`, `express`;
allowed homes `plugins/ifc-import/` and the four backend apps; population = git-tracked
`packages|plugins|apps **/*.ts(x)` minus `__tests__`, `.d.ts`, `/dist/` — **`*.test.ts`
files OUTSIDE `__tests__` folders ARE counted**).

## Count reconciliation (recounted, not transcribed)

Static `from '@thatopen/components(-front)'` + express outside allowed homes = **117**.
Plus **7** `import('@thatopen/components').TechnicalDrawing` type-position dynamic imports
in `packages/core-app-model/src/drawing/*.test.ts` = **124 exactly**. Per area:

| area | count |
|---|---|
| apps/editor | 28 |
| packages/core-app-model | 25 static + 7 dynamic-in-tests = 32 |
| plugins/annotations | 24 |
| packages/geometry-* (13 pkgs) | **32** |
| packages/input-host | **5** |
| packages/file-format | 3 |

Scope of this wave = geometry-* (32) + input-host (5) = **37 import statements in 37 files**.
`new OBC.*` = 0 hits. `extends OBC.*` = 0. Named `import {..} from '@thatopen/*'` = 0.
Every import is `import * as OBC` (plus 2 `import * as BUI from '@thatopen/ui'` — see Risks:
`@thatopen/ui` is NOT in RESTRICTED_MODULES and does not count).

## TASK 1 — per-file usage table

RUNTIME symbols found in the population: **exactly the audit's three** —
`OBC.TechnicalDrawing.toDrawingSpace` (15 files / 19 sites), `OBC.RendererMode.MANUAL`
(4 files / 7 sites), `components.get(OBC.Raycasters)` (5 files / 5 sites). 24 RUNTIME files,
13 TYPE-ONLY files. All paths relative to repo root.

### geometry-* (32 files)

| file | OBC refs (line: symbol) | class |
|---|---|---|
| geometry-column/src/ColumnPlanSymbolBuilder.ts | 109,185,236,250: `OBC.TechnicalDrawing` (param type); **263: `OBC.TechnicalDrawing.toDrawingSpace`** | RUNTIME (toDrawingSpace) |
| geometry-column/src/ColumnTool.ts | 51,70: `OBC.World` (type); **249: `OBC.RendererMode.MANUAL`** | RUNTIME (RendererMode) |
| geometry-curtain-wall/src/CurtainWallTool.ts | 182,249: `OBC.World` (type) | TYPE-ONLY |
| geometry-door/src/DoorPlanSymbolBuilder.ts | 256: type; **304,317,332: toDrawingSpace** | RUNTIME |
| geometry-door/src/DoorTool.ts | 55,82: `OBC.World` (type) | TYPE-ONLY |
| geometry-furniture/src/builders/BedPlanSymbolBuilder.ts | 84: type; **132: toDrawingSpace** | RUNTIME |
| geometry-furniture/src/builders/ChairPlanSymbolBuilder.ts | 89: type; **139: toDrawingSpace** | RUNTIME |
| geometry-furniture/src/builders/KitchenPlanSymbolBuilder.ts | 105: type; **155: toDrawingSpace** | RUNTIME |
| geometry-furniture/src/builders/SofaPlanSymbolBuilder.ts | 84: type; **134: toDrawingSpace** | RUNTIME |
| geometry-furniture/src/builders/TreeElevationSymbolBuilder.ts | 78: type; **109: toDrawingSpace** | RUNTIME |
| geometry-furniture/src/builders/TreePlanSymbolBuilder.ts | 138: type; **202: toDrawingSpace** | RUNTIME |
| geometry-furniture/src/builders/WardrobePlanSymbolBuilder.ts | 98: type; **148: toDrawingSpace** | RUNTIME |
| geometry-furniture/src/FurnitureTool.ts | 44: `OBC.World` (type); **113,577,779: `OBC.RendererMode.MANUAL`** | RUNTIME |
| geometry-handrail/src/HandrailTool.ts | 68,83: `OBC.World` (type) | TYPE-ONLY |
| geometry-lift/src/LiftTool.ts | 82,95: `OBC.World` (type); **236: RendererMode.MANUAL** | RUNTIME |
| geometry-lighting/src/LightingTool.ts | 67: `OBC.World` (type) | TYPE-ONLY |
| geometry-plumbing/src/PlumbingElevationSymbolBuilder.ts | 47: type; **72: toDrawingSpace** | RUNTIME |
| geometry-plumbing/src/PlumbingPlanSymbolBuilder.ts | 48: type; **76: toDrawingSpace** | RUNTIME |
| geometry-plumbing/src/PlumbingTool.ts | 34: `OBC.World` (type); **372,471: RendererMode.MANUAL** | RUNTIME |
| geometry-roof/src/RoofSlopeSymbolBuilder.ts | 94: type; **182: toDrawingSpace** | RUNTIME |
| geometry-roof/src/RoofTool.ts | 74: `OBC.World`, 75: `OBC.Components` (types); **677: `components.get(OBC.Raycasters)`** | RUNTIME |
| geometry-slab/src/ceiling/CeilingTool.ts | 116,117,175,176: World/Components (types); **997: Raycasters** | RUNTIME |
| geometry-slab/src/floor/FloorTool.ts | 158,159,223,224: types; **1100: Raycasters** | RUNTIME |
| geometry-slab/src/SlabPickWallsController.ts | 61,88: `OBC.World` (type). ⚠ BUI RUNTIME at 425 (`BUI.Component.create`/`BUI.html`) — not gate-counted | TYPE-ONLY (OBC) |
| geometry-slab/src/SlabProfileEditor.ts | 123,124,172,173: types; **796: Raycasters** | RUNTIME |
| geometry-slab/src/SlabTool.ts | 163,164,282,283: types; **812: Raycasters**. ⚠ BUI RUNTIME 1491,1493,1963,1964 — not gate-counted | RUNTIME |
| geometry-stair/src/StairSymbolTechnicalDrawingBridge.ts | 45: type; **70,86: toDrawingSpace** | RUNTIME |
| geometry-wall/src/OpeningTool.ts | 72: `OBC.Components`, 73: `OBC.World` (types). ⛔ DEAD byte-duplicate of input-host/src/OpeningTool.ts — not in geometry-wall barrel, zero importers (only a comment in WallMoveReweldService.ts:322) | TYPE-ONLY, DEAD |
| geometry-wall/src/WallLayerPlanSymbolBuilder.ts | 99,155: types; **161: toDrawingSpace** | RUNTIME |
| geometry-wall/src/WallTool.ts | 132,263: `OBC.World` (type). (line 74 is a comment mentioning `@thatopen/ui` — not counted) | TYPE-ONLY |
| geometry-window/src/WindowPlanSymbolBuilder.ts | 211: type; **267,280: toDrawingSpace** | RUNTIME |
| geometry-window/src/WindowTool.ts | 40,79: `OBC.World` (type) | TYPE-ONLY |

### input-host (5 files — ALL TYPE-ONLY)

| file | OBC refs | class |
|---|---|---|
| input-host/src/BaseTool.ts | 13: `protected world: OBC.World` | TYPE-ONLY |
| input-host/src/BeamTool.ts | 28,49: `OBC.World` | TYPE-ONLY |
| input-host/src/OpeningTool.ts | 72: `OBC.Components`, 73: `OBC.World` (the LIVE copy — exported at index.ts:286-287, consumed by apps/editor/src/engine/initTools.ts:141) | TYPE-ONLY |
| input-host/src/SelectionManager.ts | 477: `OBC.World`, 478: `OBC.SimpleCamera` (only `.three` is used: 1805,1912,3993,4114) | TYPE-ONLY |
| input-host/src/types.ts | 64: `world: OBC.World`, 66: `camera: OBC.SimpleCamera` (in `ToolContext`) | TYPE-ONLY |

### Measured member surface (from call sites, not headers)

- `world.scene.three` ×126 · `world.camera.three` ×34 · `world.camera.controls` ×27
  (only `.enabled` is touched) · `world.renderer.three` ×3 · `renderer.mode` ×7
  (all `=== OBC.RendererMode.MANUAL`) · `renderer.needsUpdate` ×9 (always guarded
  `'needsUpdate' in renderer`). No other `world.*` first-level member.
- `drawing.layers` ×32 — only `.has(name)`, `.create(name)`, `.get(name)` (get once, for
  `layer.material.color.setHex`, TreePlanSymbolBuilder.ts:156-158); `drawing.addProjectionLines(lines, LAYER)` ×19.
- All 5 Raycasters sites are the identical recipe:
  `components.get(OBC.Raycasters).get(world)` → `(x as any).three as THREE.Raycaster` → `setFromCamera(...)`.
- `components.*`: ONLY `.get(OBC.Raycasters)`. Nothing else.

## TASK 2 — who owns the components instance

**`packages/core-app-model/src/BimWorld.ts:10`** — `const components = new OBC.Components();`
inside `createBimWorld(container)` (the ONLY `new OBC.Components` in the repo). Consumed at
`apps/editor/src/engine/initScene.ts:413` (`const { components, world, ... } = createBimWorld(container)`),
then handed to tools by `apps/editor/src/engine/initTools.ts`. apps/editor restricted count
recounted: **28 exactly** (matches audit). core-app-model already carries 25 static counted
imports — the seam implementation can live there **without adding a restricted import to any
package that has none**.

## TASK 3 — existing solver search (adopt, don't mint)

- **No existing seam wraps any of the three symbols.** `toDrawingSpace` appears in
  core-app-model only as direct `OBC.TechnicalDrawing.toDrawingSpace` (one non-test runtime
  site: `drawing/OpeningElevationSymbolBuilder.ts:659`) plus comments; no wrapper function
  anywhere in packages/.
- `packages/plugin-sdk` — ZERO @thatopen exposure, **deliberately** (index.ts:719: barrel keeps
  "no THREE/@thatopen module-graph weight"). Also L5 — L2 cannot import it. NOT the home.
- `packages/renderer/src/Renderer.ts:29` — `export type RendererMode = 'auto'|'webgpu'|'webgl2'`
  — a **name-rival, different concept** (WebGPU backend choice, not OBC's AUTO/MANUAL frame
  mode). It is re-exported by plugin-sdk (index.ts:648). ⛔ The seam must NOT reuse the name
  `RendererMode`.
- `packages/picking`, `packages/drawing-primitives` — no OBC references, no world facade.
- `packages/views` (L2) — type-only view contracts (IPlanViewManager etc.), no OBC; plausible
  but wrong home (view-manager contracts, not tool-runtime contracts; and geometry-* don't
  currently depend on it).
- Nearest structural-typing precedents: `packages/geometry-stair/src/stairPath/StairSketchCoordinateProvider.ts:29`
  (`interface WorldToScreenSource`), and the 7 core-app-model drawing tests that fake
  TechnicalDrawing via `as unknown as import('@thatopen/components').TechnicalDrawing`.
- **Conclusion: no seam exists; minting one in core-app-model is not a rival — it will be the first.**

## TASK 4 — seam design

Layers (eslint.config.js): geometry-* = L2 (lines 143-159), input-host = L2 (163),
core-app-model = L2 (165), renderer-three = L1 (125). L2→L2 edges are legal (the gate's own
comment at line 150 blesses geometry-handrail → core-app-model as "no upward edge"). Every one
of the 14 consumer packages ALREADY declares `@pryzm/core-app-model` in package.json —
**zero manifest edits, zero lockfile churn**.

**(a) Types** — new pure-types file `packages/core-app-model/src/obc/ObcSeamTypes.ts`
(imports ONLY `type` THREE from `@pryzm/renderer-three/three`; zero @thatopen imports),
re-exported from the core-app-model barrel:

```ts
import type * as THREE from '@pryzm/renderer-three/three';

/** Structural slice of OBC.World actually used by tools (measured 2026-08-31). LOOSE on
 *  renderer/controls: OBC's World.renderer is BaseRenderer|null and BaseRenderer does not
 *  declare mode/needsUpdate — demanding them would break assignability of the real World. */
export interface SeamWorld {
    scene:  { three: THREE.Scene };
    camera: { three: THREE.Camera; controls?: { enabled: boolean } | null };
    renderer?: { three?: THREE.WebGLRenderer } | null;
}
/** Structural slice of OBC.SimpleCamera (SelectionManager uses only .three). */
export interface SeamCamera { three: THREE.Camera; controls?: { enabled: boolean } | null }
/** Structural slice of OBC.TechnicalDrawing the symbol builders touch. */
export interface DrawingSurface {
    layers: {
        has(name: string): boolean;
        create(name: string): unknown;
        get(name: string): { material?: { color: { setHex(hex: number): void } } } | undefined;
    };
    addProjectionLines(lines: THREE.LineSegments, layer: string): void;
}
/** Opaque handle to the ONE OBC Components registry (BimWorld.ts:10). Never .get() it yourself. */
export type ComponentsHandle = object;
```

(Lanes MUST compile the loose slices against the real `@thatopen/components@3.4.3` d.ts —
exact member types above are derived from call sites and need the compiler's confirmation.)

**(b) Values** — one runtime module owning the three symbols. Two options:
- **RECOMMENDED:** new file `packages/core-app-model/src/obc/ObcSeam.ts` with the single
  `import * as OBC from '@thatopen/components'`. Net count: 124 − 37 + 1 = **88 ≤ 113 GREEN**
  (25 headroom). One greppable owner, §-taggable, importable without dragging BimWorld's
  DOM-touching module graph into headless builder tests.
- Zero-new-import variant: export the same functions from `BimWorld.ts` (already imports OBC):
  124 − 37 = **87**, but couples every symbol builder to a module that does
  `document.createElement` at call time and imports InfiniteGrid3D/SceneTheme — worse seam,
  1 count cheaper. The wave's call; both are GREEN.

```ts
export function projectToDrawingSpace(lines: THREE.LineSegments, drawing: DrawingSurface): THREE.LineSegments {
    return OBC.TechnicalDrawing.toDrawingSpace(lines, drawing as unknown as OBC.TechnicalDrawing);
}
/** All 7 MANUAL sites are one recipe: if (renderer && mode===MANUAL && 'needsUpdate' in renderer
 *  [&& !window.pryzmCanvas]) renderer.needsUpdate = true.  Collapse them: */
export function requestManualFrame(world: SeamWorld): void { /* recipe, cast internally */ }
/** For the 2 sites that only COMPARE (ColumnTool:249, LiftTool:236 read mode inside a larger
 *  condition): */
export function isManualRenderer(world: SeamWorld): boolean;
/** All 5 raycaster sites are one recipe — centralise the (as any).three cast: */
export function getSceneRaycaster(components: ComponentsHandle, world: SeamWorld): THREE.Raycaster {
    return ((components as OBC.Components).get(OBC.Raycasters).get(world as unknown as OBC.World) as { three: THREE.Raycaster }).three;
}
```

⛔ Do NOT name anything `RendererMode` (rival in packages/renderer + plugin-sdk). Avoid
exporting a bare MANUAL constant if `requestManualFrame`/`isManualRenderer` cover all 7 sites
— fewer members, derived from call sites only (fake-more-capable-than-real).

**(c) Binding** — the real OBC objects flow exactly as today: BimWorld.ts:10 constructs;
initScene.ts:413/initTools.ts (apps/editor, out of scope, keeps its 28) passes `world`/
`components` into tool constructors. The ONLY new binding code is ObcSeam.ts's internal casts.
The seam fronts the ONE instance — it constructs nothing, stores nothing (no second owner).

**(d) Type-only conversions** — mechanical, per file: delete `import * as OBC from
'@thatopen/components'`; add `import type { SeamWorld, ComponentsHandle, DrawingSurface } from
'@pryzm/core-app-model'`; replace `OBC.World`→`SeamWorld`, `OBC.Components`→`ComponentsHandle`,
`OBC.SimpleCamera`→`SeamCamera`, `OBC.TechnicalDrawing` (param positions)→`DrawingSurface`.
Providers pass the real OBC objects; structural typing accepts them (class privates don't
block width-subtyping in this direction). `input-host/src/types.ts` `ToolContext` changes type
only — apps/editor call sites still compile because the real World/SimpleCamera satisfy the
slices.

## TASK 5 — conversion groups (file-disjoint, package-sliced)

**Lane 0 (FIRST, blocking):** mint the seam — `packages/core-app-model/src/obc/ObcSeamTypes.ts`
+ `ObcSeam.ts` + barrel export + convert core-app-model's own
`drawing/OpeningElevationSymbolBuilder.ts:659` call site to it (optional but proves the seam
in-package). All other lanes depend on this landing.

**Lane 1 — furniture/plumbing/stair (12 files):** geometry-furniture (8: 7 builders +
FurnitureTool), geometry-plumbing (3), geometry-stair (1).
**Lane 2 — column/door/window/wall/roof (11 files):** geometry-column (2), geometry-door (2),
geometry-window (2), geometry-wall (3, incl. the DEAD OpeningTool.ts — convert mechanically or
delete under orchestrator sign-off; deletion is wave-B's dead-rival business), geometry-roof (2).
**Lane 3 — slab + small tools (9 files):** geometry-slab (5), geometry-curtain-wall (1),
geometry-handrail (1), geometry-lift (1), geometry-lighting (1).
**Lane 4 — input-host (5 files):** types.ts first (ToolContext), then BaseTool, BeamTool,
OpeningTool, SelectionManager.

No lane touches initTools.ts (Axis L), apps/editor, plugins/annotations, or the 7
core-app-model test files. Verify per lane: `npx tsx tools/ga-gate/check-layer-boundaries.ts`
banned-3p line MOVES; falsification: revert one file → count returns.

## RISKS

1. **BUI is a second @thatopen runtime surface the audit line didn't mention** —
   `SlabTool.ts:1491,1493,1963,1964` and `SlabPickWallsController.ts:425` use
   `BUI.Component.create`/`BUI.html` (HUDs). `@thatopen/ui` is NOT in RESTRICTED_MODULES, so
   this does not block the arm — but lanes must LEAVE the BUI imports alone (scope creep;
   removing them moves no counter and risks the HUD).
2. **Assignability trap:** OBC `World.renderer: BaseRenderer|null` and `World.camera:
   BaseCamera` likely lack `mode`/`needsUpdate`/`controls` in their declared types (call sites
   already guard with `'needsUpdate' in renderer` and casts). SeamWorld MUST stay loose
   (optional members) or the real World won't assign at the apps/editor boundary. Compile
   against the real d.ts before mass conversion.
3. **Name rival:** `RendererMode` already exported by packages/renderer + plugin-sdk with
   different semantics. Use `requestManualFrame`/`isManualRenderer`, never that name.
4. **geometry-wall/src/OpeningTool.ts is dead** (byte-duplicate of input-host's, zero
   importers). Converting it is safe make-work; deleting it is wave-B. Either removes 1 count.
5. **package.json:** no edits needed (all 14 consumers already depend on core-app-model).
   Do NOT prune the now-unused `@thatopen/components` deps (declared in 8 of 14 manifests) in
   wave A — frozen-lockfile landmine; separate follow-up.
6. **The 7 dynamic `import('@thatopen/components')` in core-app-model *.test.ts files ARE
   gate-counted** (not under `__tests__/`) and are OUT of this wave's scope — target math is
   124→88 (recommended) or 87 (BimWorld variant), both ≤ 113. Anyone promising "87" must use
   the zero-new-import variant.
7. **No runtime OBC use beyond the three symbols exists in the population** (`new OBC.*`=0,
   `extends OBC.*`=0, named imports=0) — recount CONFIRMS the audit. Every file is convertible.
8. `getSceneRaycaster` centralises an `as any`-equivalent cast that today exists at 5 sites —
   net cast count falls; do not add `(window as any)` anywhere (P4 arm is its own RED story).
