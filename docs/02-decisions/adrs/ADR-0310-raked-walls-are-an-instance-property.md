# ADR-0310 — A raked wall is an INSTANCE PROPERTY, and every case it cannot serve is REFUSED

**Status:** ACCEPTED · **Date:** 2026-08-09 · **Context tag:** `§WALL-RAKE`
**Implements:** founder request 2026-08-09 — *"I want to add another element — angled walls"*
**Amends:** [C03](../contracts/C03-SCHEMAS-COMMANDS-AND-STATE.md) §3 · [C15](../contracts/C15-HOSTED-ELEMENT-CONTRACT.md) §2 · [C47](../contracts/C47-FILE-FORMAT-VERSIONING.md)
**Related:** [C65](../contracts/C65-ELEMENT-TYPE-SYSTEM.md) §3.6, §3.9 · [ADR-0055](./ADR-0055-pascal-wall-pipeline.md)

---

## 1. Context

The founder asked for angled (raked) walls — walls that lean rather than stand vertical — and
asked whether it should be a new element or a property of the existing one.

The question is not cosmetic. A wall in PRYZM is not a box: it participates in
`JunctionResolverV2` mitring, `WallOccupancyStore` reservations, room detection, layered
construction, and hosted openings (C15). Whatever answer is chosen, those five systems either
keep working or silently produce something wrong.

## 2. The decision

### 2.1 — A PROPERTY (`rakeAngleDeg?: number`), not a new element

The precedent is `wall.curve`, but the reason the precedent *worked* is the load-bearing part:
`JunctionResolverV2` was deliberately kept **shape-agnostic** — `§FIX-WALL-ARC-LINEAR-MITRE`
gives it unit *headings*, so it never learns what a curve is. Curve branching is therefore
concentrated in the builders, not smeared through the solver: 285 `curve` references across 76
files, but the solver holds **one**. A rake threads the same seam.

A new element type would have had to rebuild `WallOccupancyStore`, arc-length parameterisation
and the radial-band carve — and hosting is where the risk lives.

### 2.2 — An INSTANCE property, not a TYPE property

C65 §3.6 is explicit that a type edit propagates to every instance referencing it (Revit
semantics). A single leaning feature wall must not tilt every wall of its type. Rake is a
decision about *this wall in this building*, not about a construction assembly.

### 2.3 — Thickness stays HORIZONTAL; the wall pivots about its base centreline

This is the entire safety argument, and it is why the five systems above are provably untouched:
**the base footprint is identical at every angle.** Junctions, room detection (which consumes
*centrelines*, not footprints), occupancy and every opening offset are properties of the base
footprint. True perpendicular thickness is the derived `t · sin θ`.

Consequence, stated so nobody re-derives it: **rooms bound at floor level.**

### 2.4 — Sign convention, declared ONCE

Angle from the **floor plane**, measured on the wall's **LEFT** — `leftPerp(d) = (-d.z, d.x)`,
the same "left" `WallFootprint2D` and `JunctionResolverV2` already use.

**90 = vertical = the default.** `<90` leans the top LEFT; `>90` leans it RIGHT.
`topOffset = height · cot(rake) · leftPerp(dir)`. Pinned by worked example: 80° on a 3 m +X wall
⇒ **+0.52898 m in +Z**. Bounds `RAKE_MIN_DEG = 15`, `RAKE_MAX_DEG = 165`.

⚠ Read these from the exported constants in `WallRake.ts`. Never re-type the numbers — that is
how one policy becomes N drifting copies (C65 §3.5).

### 2.5 — Three cases are REFUSED, not approximated

Enforced at all three `WallStore` doors, including `update()` against the **merged** wall, which
closes the two-call bypass:

| Case | Why refused |
|---|---|
| **Curve × rake** | The shear direction is the wall's plan normal, which **varies along an arc**. One shear vector is wrong everywhere but a single station. |
| **Layered walls** | Layers are authored *perpendicular*; honouring that needs `t/sin θ` threaded consistently into resolver + footprint + occupancy. Getting it wrong silently re-thickens every layered wall. |
| **Hosted openings (C15)** | The horizontal axis is generalised (`arcFrameAt` is a real station frame). **The vertical axis is not modelled at all**: sill is a bare world-Y translate at four independent sites, and `hostedElementFrame` returns a scalar `rotationY`. |

⭐ **A refusal is a correct answer; a silently-wrong wall is not.** These are schema- and
store-level rejections, so they cannot be bypassed by a UI that forgets to check.

## 3. Consequences

- **C15 §2 must widen from a 1-parameter line to a 2-parameter surface** before hosted openings
  can sit in a raked wall. Estimated 3–4 weeks; it needs an up-vector → quaternion, not a
  `rotationY` scalar. Until then C15 records the refusal.
- **C47:** `rakeAngleDeg` is an ADDITIVE OPTIONAL field — no MAJOR bump. An older client reading
  a newer snapshot loses the lean and keeps a valid vertical wall, which is honest degradation.
- **The junction mitre is exact at the FLOOR, and only there.** The correct mitre for two raked
  walls is the intersection of two *slanted* planes — not a vertical line, and unrepresentable
  in 2D footprint space. The clean generalisation is to **solve V2 twice, at floor and at top,
  and loft**, preserving Pascal's shared-corner-by-construction property at both rings (~2–3
  weeks, not yet scheduled).
- ⚠ **The legacy escape hatch renders raked walls VERTICAL.** With
  `__pryzmWallPipelineV2 = false`, `MiterPrismBuilder` has no rake support. Named here because a
  fallback that silently discards a user's geometry is exactly the honesty defect above —
  currently unfixed.
- `§V2-SPIKE-GUARD` was widened by the computed shear. Without that it demoted raked walls to
  the legacy prism and **rendered them vertical while reporting success**.

## 4. Alternatives rejected

| Option | Why rejected |
|---|---|
| A new `RakedWall` element type | Rebuilds occupancy, arc-length parameterisation and the radial-band carve; hosting risk unchanged. |
| A type-level property | Violates C65 §3.6 — one leaning feature wall would tilt every wall of its type. |
| Rotate the whole wall solid (thickness follows the lean) | Changes the base footprint, so junctions, occupancy, room detection and every opening offset move. The safety argument in §2.3 disappears. |
| Approximate curve × rake with a single shear vector | Correct at one station, wrong along the rest of the arc. Silently wrong geometry on a legal drawing. |
| Ship the UI control before the refusals were wired | C65 §3.9. An affordance that produces nothing reads as done; this repo has shipped that repeatedly (a 23-gate suite invoked by nothing, 424 spans with no provider, `requirePlan()` with zero call sites). |

## 5. What is NOT decided here

- The **authoring surface**. The property shipped with no UI control precisely because §3.9
  forbids an affordance whose refusals are not yet visible. The control must render DISABLED,
  with the reason stated, for each case in §2.5 — a field that accepts a value the store then
  rejects makes a refusal and a success the same outcome to the user.
- Whether the floor-only mitre is acceptable for GA, or whether the two-elevation loft is a
  launch blocker.
- Nothing here is **browser-verified**: no deploy carried it, and localhost dev is unusable in
  this environment. The behaviour is proven at the data, geometry and command layers only
  (35/35 rake tests), which is strong but is not the same as a rendered wall on screen.
