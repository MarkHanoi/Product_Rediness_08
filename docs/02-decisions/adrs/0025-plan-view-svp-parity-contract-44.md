# ADR-0025 — Plan-View + SVP Parity (Contract 44, Sprint S33)

- **Status**: Accepted
- **Date**: 2026-04-27
- **Sprint**: S33 (Phase 2B / M16–M18)
- **Subordinate to**: ADR-0023 (`plan-view-canvas2d-renderer`), ADR-0024 (`plan-view-annotation-pipeline`)
- **Owners**: Plan-View squad
- **Related**: `docs/03_PRYZM3/reference/phases/PHASE-2/2B-Q2-M16-M18-PLAN-VIEW.md` §S33 (lines 609–798)

## 1. Context

PRYZM 1's Plan View and Structural View Port (SVP) historically diverged on
ten user-facing behaviours catalogued as *Contract 44 — Plan/SVP Parity Gaps*
(G1–G10):

| Gap | Description |
|-----|-------------|
| G1  | Plan view elements MUST be scoped to the active level. |
| G2  | Cross-level structural elements (doors, columns, beams) MUST NOT bleed through. |
| G3  | Linked levels (stacked buildings) MUST isolate by `levelId` prefix. |
| G4  | Style overrides MUST be per-view (not global). |
| G5  | Visibility flags MUST persist per-view. |
| G6  | Override graphics (material) MUST apply per-view. |
| G7  | Poche pattern MUST honour per-view override material. |
| G8  | Poche pattern MUST apply to linked-model elements. |
| G9  | Selection in plan view MUST update the SelectionStore via the CommandBus. |
| G10 | Drag in plan view MUST create persisted `element.move` commands (with ephemeral previews). |

PRYZM 2 closes each gap **once, in the new architecture**, and pins the
closure with one regression test per gap at `tests/contract-44/G{N}.test.ts`.
The full PRYZM-1 → PRYZM-2 customer migration depends on Contract 44 being
green; without it, plan-view drawings produced by the new platform are not
visually identical to the legacy SVP outputs.

## 2. Decision

We close Contract 44 with **six new pure modules + two thin host-wired
controllers**, all in `plugins/plan-view`:

```
plugins/plan-view/src/
├── style-resolver.ts          ← G4, G6, G7, G8 — per-view style precedence
├── level-scoped-renderers.ts  ← G1, G2, G3     — pure scope helpers
├── view-element-visibility.ts ← G5             — per-view visibility table
├── hit-test.ts                ← G9, G10        — pixel → elementId
├── selection.ts               ← G9             — click → CommandBus
└── drag.ts                    ← G10            — pointer drag → CommandBus
```

### 2.1. Module charter

#### `style-resolver.ts` (G4, G6, G7, G8)

`StyleResolver` is constructed with `(overrides, activeViewId)` and exposes
two pure methods:

```ts
resolve(elementId: string, defaultStyle: ElementStyle): ElementStyle
resolveVisibility(elementId: string): boolean
```

**Precedence** (most-specific wins):

1. per-view + per-element override
2. per-view + all-elements override (i.e. `elementId` omitted)
3. defaults

Overrides for any *other* view are silently ignored — this is the core
mechanism that prevents the PRYZM-1 "global override leak" bug
([G4](../../../tests/contract-44/G4.test.ts),
[G6](../../../tests/contract-44/G6.test.ts)).

#### `level-scoped-renderers.ts` (G1, G2, G3)

Three pure functions:

| Function                       | Closes |
|--------------------------------|--------|
| `scopeToLevel(items, level, keyOf)`                 | G1, G2 |
| `scopeToActiveLevels(items, level, linkedSet, …)`   | G3     |
| `scopeToLinkedModel(items, prefix, keyOf)`          | G3     |

Plus `levelOfDoor(wallId, wallIdx)` — resolves a hosted element (door,
window) to its host wall's `levelId` so we never assume an element carries
its own level.  Orphan-door defence-in-depth is built in.

#### `view-element-visibility.ts` (G5)

Two-layer Map keyed `(viewId → elementId → boolean)` with **default-true**
semantics, `clearView(viewId)`, and a JSON wire format
(`toJSON / fromJSON`) so per-view visibility persists across reload.

#### `hit-test.ts` (G9, G10)

`buildPlanHitTest({ walls, doors, slabs })` returns a closure
`(worldX, worldZ) → elementId | null`.  Lookup order:

1. **Doors** — rotated AABB along the host wall axis (most-specific wins).
2. **Walls** — segment distance ≤ `thickness/2` with AABB pre-filter.
3. **Slabs** — point-in-polygon (Shoelace ray cast).

Doors take priority over walls because doors render **on top of** their
host wall in plan, so a click in the door footprint MUST select the door.

#### `selection.ts` (G9)

`PlanViewSelection` listens for `click` and `pointermove`, calls
`hitTest(worldX, worldZ)`, and dispatches:

| Event           | Command                          | Payload                                        |
|-----------------|----------------------------------|------------------------------------------------|
| Click on element            | `selection.select` | `{ targets: [{id, kind}], mode: 'replace' }`   |
| Shift+Click on element      | `selection.select` | `{ targets: [{id, kind}], mode: 'add' }`       |
| Click on empty space        | `selection.clear`  | `{}`                                           |

#### `drag.ts` (G10)

`PlanViewDrag` listens for `pointerdown / move / up / cancel` and dispatches:

| Event                                             | Command                  | Persisted? |
|---------------------------------------------------|--------------------------|------------|
| `pointermove` past 3 px threshold (during drag)   | `element.move.preview`   | NO (`ephemeral: true`) |
| `pointerup` after a drag                          | `element.move`           | YES (`{fromX/Y/Z, toX/Y/Z}`) |
| `pointerup` without crossing threshold (a click)  | (none)                   | —          |

The persisted command carries both `from*` and `to*` so the eventual move
handler (S34+) can build a correct inverse patch for the undo stack.
Y is preserved from the source position — drag in plan view is XZ-only.

### 2.2. Layer discipline

* `plan-view` modules import only from `@pryzm/schemas`, `@pryzm/types-builtin`,
  `@pryzm/geometry-kernel`.
* Kernel `poche.ts` stays L0-pure — it MUST NOT import `style-resolver`.
  Style override is applied at draw time, in the host, by routing each
  `PocheFill.elementId` through `StyleResolver` ([G7](../../../tests/contract-44/G7.test.ts),
  [G8](../../../tests/contract-44/G8.test.ts)).
* `selection.ts` and `drag.ts` use `type-only` cross-imports (no runtime
  cycle): `selection.ts` `import type { PlanFrameScheduler } from './drag.js'`,
  `drag.ts` `import type { PlanCommandBus } from './selection.js'`.

### 2.3. Host wiring (T011)

`PlanViewCanvasHost` accepts three optional construction options:

```ts
new PlanViewCanvasHost({
  …,
  commandBus?: PlanCommandBus,
  selectionStore?: SelectionStore,
  viewId?: string,
  hitTestSource?: () => PlanHitTestInput,
  elementKindLookup?: (id: string) => string | undefined,
  elementPositionLookup?: (id: string) => Vec3 | undefined,
})
```

When `commandBus` AND a hit-test source are supplied, the host instantiates
`PlanViewSelection` and `PlanViewDrag` on `mount()` and disposes them on
`dispose()`.  Omitting any of the three is **fully backward compatible** —
existing tests pass unchanged.

### 2.4. Kill-switch

`featureFlags.plan_view_v2` (introduced in S31) remains the master kill-
switch.  When `false`, the host falls back to the pre-S31 SVP renderer and
none of the S33 modules are constructed.  Default: `false` until S36
(2B demo) flips it to `true` for opt-in, and S48 (2D BETA) flips it to
`true` by default.

This is also recorded as **kill-switch K2B-2** in the platform kill-switch
register — toggleable at runtime without redeploy.

## 3. Consequences

### 3.1. Positive

* Each Contract 44 gap has a dedicated, documented, regression-pinned closure.
* `tests/contract-44/G{N}.test.ts` are vendor-readable tests that double as
  the parity acceptance grid for the migration sales motion.
* The 6 new modules are pure, < 300 LOC each, and individually unit-tested
  (107 tests in `plugins/plan-view`, all green at S33 close).
* Visual diff vs S31 baseline is now under 2 px (S32 was 5 px).

### 3.2. Negative

* `element.move` and `element.move.preview` are dispatched by `PlanViewDrag`
  but have **no backing command handler yet** — that's a deliberate
  follow-up in S34 (Move/Rotate command handlers).  Until then, the
  CommandBus will reject these commands with an "unknown command" error;
  callers must wrap the drag controller's `onError` to suppress that noise
  during the S33→S34 window.
* `StyleResolver` is constructed per-frame from the override list — this
  is O(overrides) per `resolve` call.  Acceptable for typical view sizes
  (< 100 overrides); will need an index if a single view ever exceeds
  ~10k overrides.

### 3.3. Migration impact

None — all modules are additive.  No public API surface in `@pryzm/plugin-
plan-view` was renamed or removed.  The host wiring (T011) is opt-in via
new optional constructor options.

## 4. Alternatives considered

* **Render styles inside the kernel** — rejected to keep `poche.ts` L0-pure.
  Style is a view concern; the kernel produces geometry, the host paints it.
* **Hard-code Contract 44 closure inside `PlanViewCanvasHost`** — rejected
  to preserve unit testability.  The 6 pure modules can be tested without
  a DOM, a canvas, or a `requestAnimationFrame`.
* **One mega "PlanViewInteraction" controller** — rejected.  Selection
  and drag have different lifetimes (selection lives across frames, drag
  is bracketed by pointerdown/up) and different kill-switch needs.
* **Reuse `plugins/selection`** — investigated; that package is the
  *output* (SelectionStore + selection.select handler).  S33 owns the
  *input* edge (canvas events → selection commands).

## 5. References

* Spec: `docs/03_PRYZM3/reference/phases/PHASE-2/2B-Q2-M16-M18-PLAN-VIEW.md` §S33 (609–798)
* Tracker: `docs/03_PRYZM3/reference/status-detail/01-PROCESS-TRACKER.md` line 717 (S33 [x])
* Predecessor ADRs: 0023, 0024 (plan-view canvas + annotation)
* Successor (planned): ADR-0026 (S34 — Move/Rotate command handlers)
