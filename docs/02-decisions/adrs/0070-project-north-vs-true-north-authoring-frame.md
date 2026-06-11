# ADR-0070 — Project North vs True North: an orthogonal authoring frame for generative geometry

- **Status:** Accepted (2026-06-11)
- **Deciders:** Founder + Claude
- **Related:** [C12-GEOSPATIAL](../contracts/C12-GEOSPATIAL.md) · [C19-SITE-MODEL-AND-PARCEL](../contracts/C19-SITE-MODEL-AND-PARCEL.md) · [ADR-0055 Pascal wall pipeline] · [ADR-0063 house generative doctrine](0063-house-generative-layout-doctrine.md) · supersedes the weld-tolerance band-aid proposed in the 2026-06-11 root-cause analysis

## Context

A user-drawn plot boundary rotated **43.2°** off world axes produced a cascade of defects in
the generated house: a **sealed bedroom** (`roomsWithDoor=3/5`), `§TOPO-HARD-REJECT-ALL
[circulation]`, generic **"Room 00-003"** merge-blob names, only **1 door upstairs**, and a
stair flagged "1/4 corners in shell".

A root-cause analysis traced **all of these to ONE bug**: the D-TGL engine tiles interior
partitions in the **principal-axis (layout) frame** aligned to `principalAxisRad`, but welds
those partitions against a shell ring that has already been mapped to **world (true-north)
coordinates** (`weldPartitionsToShell.ts`). On a rotated plate the two frames don't agree
rigidly, so perimeter-terminating partition endpoints land OFF the world ring by a **residual
drift** that exceeds the room-detector's 0.30 m corner-snap → the seam stays OPEN → room
detection floods across the gap → adjacent rooms merge → no closed polygon → no wall to host a
door → the room is sealed → circulation hard-rejects. Every listed defect is **downstream of
this residual.**

The proposed band-aid was to loosen a weld tolerance (`SHELL_SNAP_SPAN_MARGIN_M 0.10 → 0.05`).
That treats the symptom (snap harder) and is fragile — a different rotation angle re-opens it.

The founder proposed the architecturally-correct fix, mirroring **Revit's Project North vs True
North**: let the user author in an **orthogonal frame** whose X-axis is the building's principal
axis (derived automatically from the first significant boundary edge), and carry the real-world
rotation separately. PRYZM already computes that angle (`principalAxisDeg`, 43.2° here) — it has
simply not been treated as a first-class, end-to-end authoring frame.

## Decision

Adopt **Project North / True North** as a first-class coordinate concept.

- **True North** — the real-world / site / globe orientation. The plot boundary sits at some
  true-north angle θ. This is where C12/C19/IFC `IfcProjectedCRS` + `TrueNorth` live.
- **Project North** — an **axis-aligned authoring frame** whose X-axis = the building's
  **principal axis** (θ derived from the first significant drawn boundary edge; already computed
  as `principalAxisDeg`). The user edits orthogonally; walls are axis-aligned here.
- The two frames differ by **one rotation angle θ about a Project Base Point.**

**Core invariant (RIGID-TRANSFORM-LAST):** all generative geometry construction — shell ring,
interior partitions, **the weld**, room sealing, stair keep-out, openings — happens entirely in
the **Project-North (axis-aligned) frame**, where snapping is exact and the residual is zero. The
project→true-north rotation is applied as **a single rigid transform to the already-closed,
already-welded assembly, as the final step** before emitting world-space geometry. Because a
rigid transform preserves distances, endpoints coincident in Project-North stay coincident in
world → seams that closed stay closed → **the residual defect class is dissolved by
construction**, at any rotation angle.

### Two implementation models

- **Model B — Bake-once at generation (Phase 1, chosen first).** The house/apartment generator
  + executor do 100 % of construction + weld + seal in the Project-North frame, then rotate the
  whole assembly to world once. Stored geometry is world coords (rotated), but with **no
  residual** because the rotation follows all snapping. Contained to `houseLayout/` +
  `apartmentLayout/tgl/` + the editor executor; **no renderer / room-detection / persistence /
  IFC change**. This is the targeted fix that solves the reported defects. The concrete change is
  an **ordering inversion**: weld + seal BEFORE the world rotation, not after.

- **Model A — Full project transform (Phase 2+, future Revit parity).** Elements are stored in
  Project-North coords; a **Project Base Point + angle** maps to true north for display, site
  placement, and IFC. Enables genuinely orthogonal editing everywhere (drag a wall → it stays
  axis-aligned on screen) and a faithful IFC `TrueNorth` / `IfcProjectedCRS` round-trip. Large:
  the renderer, snapping, room detection, every element, persistence and IFC must respect the
  project transform. Deferred — pursued only once Model B is proven and the geospatial/site stack
  (C12/C19) is ready to own the Project Base Point.

## Consequences

**Dissolved (residual class — the reported cascade):** sealed rooms / open seams, generic
"Room NN-xxx" names, `§TOPO-HARD-REJECT [circulation]`, 1-door-upstairs, the stair "1/4 corners"
false positive. These are all downstream of the residual and go away in Model B.

**Improved but not guaranteed (separate layout-quality concerns on tight plates):** kitchen
NO-FRONTAGE windowless, entrance-hall-not-perimeter. Cleaner geometry helps the subdivider place
them, but these can still need the dedicated subdivider/frontage work — we will not over-claim.

**Supersedes** the `SHELL_SNAP_SPAN_MARGIN_M` band-aid: with RIGID-TRANSFORM-LAST the weld runs
in the exact (zero-residual) frame, so the loosened tolerance is unnecessary (and the weld
fallback becomes a true safety net, not the primary path).

**Byte-identity:** an axis-aligned plate has θ = 0 → the final rigid transform is the identity →
**byte-identical** to today (ADR-0061 I2 discipline). Only rotated plates change — for the better.

**Alignment:** Project North is the editor-side complement to the C12/C19 true-north/site work;
when Model A lands, the Project Base Point + angle become a Site/Building property, and the IFC
exporter emits a faithful `TrueNorth`.

## Implementation note (Model B, Phase 1)

The pipeline already has the angle (`principalAxisDeg`) and already tiles partitions in the
principal-axis frame. The work is to guarantee the **shell ring is expressed in that same frame**
for the weld + room-seal, and to make the world rotation the **single last rigid step**. Track as
**§PROJECT-NORTH** with the `houseLayoutInvariants` test (rotated-plate plate) as the live gate:
the rotated-plate run must reach `roomsWithDoor = N/N`, no `§TOPO-HARD-REJECT`, and no generic
"Room NN-xxx" names. Spec: `docs/03-execution/specs/SPEC-PROJECT-NORTH-AUTHORING-FRAME.md`.
