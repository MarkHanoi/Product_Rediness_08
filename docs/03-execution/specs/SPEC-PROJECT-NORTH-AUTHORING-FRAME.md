# SPEC — Project North authoring frame (RIGID-TRANSFORM-LAST)

- **Status:** Draft → implementing (2026-06-11)
- **Owner:** generative layout (D-TGL house + apartment)
- **Governs:** the §PROJECT-NORTH fix from [ADR-0070](../../02-decisions/adrs/0070-project-north-vs-true-north-authoring-frame.md)
- **Contracts:** [C12-GEOSPATIAL](../../02-decisions/contracts/C12-GEOSPATIAL.md) · [C19-SITE-MODEL-AND-PARCEL](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md)

## 1. Problem (one sentence)

Generated geometry is constructed in the **principal-axis (Project-North) frame** but welded to a
shell ring already mapped to **world (True-North)** — a non-rigid frame mismatch whose per-endpoint
**residual** opens partition seams on rotated plates and cascades into sealed rooms, generic
"Room NN-xxx" names, `§TOPO-HARD-REJECT [circulation]`, and 1-door-upstairs.

## 2. The rule — RIGID-TRANSFORM-LAST

> Construct, weld, and seal **everything** in the axis-aligned Project-North frame (residual = 0),
> then apply the project→true-north rotation as **one rigid transform** to the closed assembly as
> the **final** step. A rigid transform preserves coincidence ⇒ closed seams stay closed at any θ.

- **θ (project→true-north angle)** = the principal axis of the drawn boundary, already computed as
  `principalAxisDeg`. Derivation = "first significant boundary edge → canvas X-axis" (the founder's
  "automatically picks the first line drawn and uses it as axis X").
- **Project Base Point** = the boundary centroid (or first vertex) the rotation pivots about.
- **θ = 0 ⇒ identity transform ⇒ byte-identical to today** (ADR-0061 I2).

## 3. Model B (Phase 1 — chosen): bake-once at generation

The change is an **ordering inversion**, contained to `packages/ai-host/src/workflows/houseLayout/`
+ `apartmentLayout/tgl/` + the editor executor. **No** renderer / room-detection / persistence /
IFC change.

### 3.1 Required ordering

1. Compute θ + base point from the drawn boundary.
2. **De-rotate + RECTIFY** the shell ring into Project-North: apply −θ, then **snap near-axis edges
   to exact axis** (and merge collinear/short edges) so the shell is a *clean* axis-aligned
   rectilinear polygon — the SAME idealized frame the partitions tile in. **Rectification is the
   load-bearing step**, see §3.3.
3. Tile partitions, carve the stair keep-out, place openings — all in Project-North against the
   rectified shell (today's principal-axis tiling, now against a Project-North shell it agrees with).
4. **Weld** partitions to the rectified shell ring in Project-North → exact, zero residual.
5. Seal/verify rooms in Project-North (closed polygons by construction).
6. **Apply +θ once** to the whole welded assembly (shell + partitions + rooms + stair + openings)
   → world geometry the executor emits as commands.

### 3.3 Why RECTIFY, not just de-rotate (the ground-shell subtlety)

The GROUND floor reuses the user's **pre-drawn** shell (drawn edge-by-edge, then mitred by the
editor's WallJoinResolver), while the engine tiles partitions against an **idealized principal-axis
rectangle**. The residual is therefore partly a **model mismatch**, not only a rotation artifact:
a rigid −θ de-rotation of *both* the drawn shell and the engine partitions preserves their relative
distances, so the residual would survive. **Rectification breaks the mismatch**: after de-rotating,
the drawn shell's near-axis edges are snapped to exact axis, so the shell the engine tiles against
and the shell the partitions weld to are the SAME clean polygon → zero residual → re-rotate. The
user's walls move by the (sub-cm to few-cm) rectification delta — which is exactly the founder's
intent ("work with orthogonal walls"). UPPER floors already build their shell from the footprint
ring with the partition emitter, so they are already residual-free; rectification makes the GROUND
behave the same.

### 3.4 Risk control — flag-gated rollout

Introduce behind `window.__pryzmProjectNorth` (mirrors ADR-0055 P3b `__pryzmWallPipelineV2`):
default OFF preserves today's path byte-for-byte; flip to ON for prod testing on rotated plates;
make ON the default only once the §3.2 gate is green on prod. The flag de-risks the change during
active testing.

### 3.2 Invariant + gate

- **INV-PN-1:** for any boundary rotation θ, the welded assembly's seams are identical (up to the
  rigid +θ) to the θ=0 assembly's seams. No residual term anywhere downstream of the weld.
- **GATE:** `packages/ai-host/__tests__/houseLayoutInvariants.test.ts` already runs a **45°-rotated
  plate**. Extend it: the rotated run must reach `roomsWithDoor = N/N` (no sealed room),
  emit **no** `§TOPO-HARD-REJECT`, and produce **no** compound `/` or generic name. The existing
  I1/I3/I4 + §HALL-SINGLETON must still hold. Axis-aligned runs stay byte-identical.

## 4. Model A (Phase 2+ — future, not now)

Store elements in Project-North; a Project Base Point + angle (a Site/Building property under
C12/C19) maps to true north for display, site placement, and a faithful IFC `TrueNorth` /
`IfcProjectedCRS`. Enables orthogonal editing everywhere. Deferred until Model B is proven and the
site stack owns the base point.

## 5. Out of scope (tracked separately, not claimed solved here)

Kitchen NO-FRONTAGE windowless + entrance-hall-not-perimeter are **layout-quality** concerns on
tight plates (subdivider placement), improved by cleaner geometry but not guaranteed by §PROJECT-
NORTH. They keep their own tracker lines.
