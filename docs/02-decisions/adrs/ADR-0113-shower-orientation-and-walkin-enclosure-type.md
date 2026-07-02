# ADR-0113 — Shower wall-hosted orientation fix + composite walk-in enclosure type

- Status: Accepted
- Date: 2026-07-02
- Tags: `§FIX-SHOWER-ORIENTATION`, `§FEAT-SHOWER-ENCLOSURE-TYPE`
- Scope: `packages/geometry-plumbing/src/ShowerGeometry.ts`,
  `packages/geometry-plumbing/src/PlumbingTool.ts`,
  `packages/geometry-plumbing/src/PlumbingSystemTypeStore.ts`,
  `apps/editor/src/engine/views/plantools/PlumbingPlanToolHandler.ts` (plan
  symbol), plus regression tests in
  `packages/geometry-plumbing/__tests__/ShowerEnclosure.test.ts`.
- Governs: C11 (element-creation pipeline — placement/orientation), C15 (hosted
  elements — seating a fixture against its host wall via the wall normal), C18
  (catalogue/representation — variant-as-data, 3D + plan symbol). Reuses the
  existing plumbing **type-as-data** pattern (Contract 39 §7 — the same
  mechanism `toiletVariant` / `showerVariant` already use).
- Consistent with: ADR-0110 (unified plan-symbol vocabulary). Does not supersede
  any prior ADR.

## Context (founder issues L-36 + L-37)

**L-36 — the shower faces the wrong direction.** When a shower is wall-hosted in
the 3D editor its rain-head/arm projected *into* the wall while the riser faced
the room — the fixture read as reversed.

**L-37 — only a bare shower head/riser exists.** The catalogue lacked a
professional walk-in enclosure (rain head + hand-shower + mixer + a base/tray or
gutter drain + a side glass panel with a user-chosen opening direction).

## Root cause — L-36

`PlumbingTool.onPointerMove` seats a wall-hosted fixture with
`previewMesh.lookAt(point + outwardNormal)` and then, for toilet/sink/**shower**,
applied `rotateY(Math.PI)`.

For a non-camera `Object3D`, `lookAt(target)` aims the object's local **+Z toward
the target** (three `Object3D.lookAt` → `Matrix4.lookAt(target, position, up)`;
`z = (eye − target)` with eye=target ⇒ +Z points at the target). So after
`lookAt(point + normal)` the fixture's local **+Z already points along the
outward room normal** (into the room).

- **Toilet & sink** are authored with their FRONT at local **−Z** (the D-shape
  bowl is extruded then `rotateX(-π/2)`, landing the front at −Z; the wall plate
  / basin backsplash sit at +Z). The 180° flip is therefore *correct* for them.
- **Shower** is authored with its FRONT (riser → rain-arm → head, tray, glass) at
  local **+Z** (see `ShowerGeometry` header; `buildRiserPipe` at z=+0.025, tray
  spanning z∈[0,length]). The shared flip drove the shower's +Z front **into the
  wall** — the reversed appearance.

The plan tool (`PlumbingPlanToolHandler`) uses `yaw = atan2(normal.x, normal.z)`
with **no flip**, which already seats the shower's +Z front along the normal —
so only the 3D path was wrong, and the fix restores parity between the two.

## Decision

### 1. `§FIX-SHOWER-ORIENTATION` — do not flip the shower

Remove `'shower'` from the `rotateY(Math.PI)` condition in
`PlumbingTool.onPointerMove`. `lookAt(point + normal)` alone seats the shower's
+Z front along the outward normal (riser against the wall, head into the room),
matching the plan tool and Contract 15 hosted-element semantics. Toilet/sink
keep the flip (their front is at −Z). The committed rotation is captured from the
preview in `onPointerDown`, so fixing the preview fixes the placed mesh. The
stale `getNearestWall` docstring and the inline comment are corrected.

### 2. `§FEAT-SHOWER-ENCLOSURE-TYPE` — walk-in enclosure as three variants

Add a composite walk-in shower built from the existing sub-assembly builders:
rain head on a riser + hand-shower on its rail + round thermostatic mixer + a
recessed wall niche + a **linear gutter channel drain** (metal trough + brushed
grate + slot ribs) recessed into a low ceramic tray + a **frameless glass**
panel. Materials reuse the existing helpers (glass = transparent `makeGlass`,
gutter/metal = `makeMetal`, tray = `makeCeramic`).

The user-chosen **glass DIRECTION** is encoded as the variant slug — the same
type-as-data mechanism that already distinguishes `shower_cabinet_sliding` vs
`shower_cabinet_open`:

| Variant slug            | Direction | Glass                                   |
|-------------------------|-----------|-----------------------------------------|
| `shower_walkin_left`    | left      | frameless panel on −X (opens right)     |
| `shower_walkin_right`   | right     | frameless panel on +X (opens left)      |
| `shower_walkin_corner`  | corner    | L-shaped: side (+X) + partial front return |

Rationale for slug-encoded direction rather than a new per-instance field:

- No schema change — `showerVariant` already lives on the DTO and round-trips
  through `UpdatePlumbingParametersCommand` (reversible/undoable, P6).
- `PlumbingSystemTypeStore` auto-registers every entry of `SHOWER_VARIANTS`, so
  the three walk-in types appear in the catalogue, the placement type-picker,
  and the `PlumbingTypeSelectorWidget` with no extra wiring (Contract 39 §4).
- Geometry parity (Contracts 36 §5 / 39 §5): preview, committed mesh, and
  carousel all call the one `createShowerGeometry` factory.

The plan symbol (`PlumbingPlanToolHandler._drawSymbol`) is made shower-variant
aware: a walk-in draws tray outline + a linear-gutter double line near the front
edge + a heavier glass line on the chosen side (with the corner L-return) + a
rain-head glyph on the wall side — reusing the AEC plan-symbol vocabulary
(ADR-0110). Footprints for the walk-in variants (`SHOWER_FOOTPRINTS`) are read by
`_footprint()` so plan and 3D stay in sync.

The geometry builders (`buildWalkInShower`, `buildLinearGutter`,
`buildWallNiche`) stay module-internal. The only new **exports** are two pure,
synchronous slug helpers (`isWalkInShower`, `walkInGlassSide`) and the
`SHOWER_WALKIN_VARIANTS` list — consistent with this package's span-free pure
geometry API (`createShowerGeometry` and its siblings carry no spans; P8's
span-per-export rule targets runtime command handlers, not pure geometry
predicates). P2/P3 unaffected (pure geometry via the single THREE owner). 8-layer
respected — all changes live in the plumbing subsystem (L2 geometry) and its
editor plan tool (L5).

## Consequences

- Wall-hosted showers now face out of their host wall by default in both 3D and
  plan; existing placed showers rebuild deterministically from the DTO on load,
  so they self-correct.
- Three new selectable walk-in shower types with a user-chosen glass direction.
- Pre-existing tech debt (out of scope, noted): a stale duplicate
  `packages/core-app-model/src/stores/ShowerGeometry.ts` exists but no live path
  imports `createShowerGeometry` from it — every consumer uses
  `@pryzm/geometry-plumbing`. It should be deleted in a later cleanup.

## Tests

`packages/geometry-plumbing/__tests__/ShowerEnclosure.test.ts` (7 cases):

- (a) the shower front is authored at +Z; after `lookAt` (no flip) the front
  aligns with the outward normal for four wall orientations; the removed flip
  would have driven it into the wall (documents the bug).
- (b) the walk-in builds head + gutter + glass; the glass sits on −X for `left`
  and +X for `right`; the direction decodes from the slug.
- (c) all three walk-in variants register under the shower family in the
  catalogue and each builds a non-empty group without throwing.
