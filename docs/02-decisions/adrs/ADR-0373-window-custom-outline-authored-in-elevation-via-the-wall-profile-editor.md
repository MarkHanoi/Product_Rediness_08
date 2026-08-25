# ADR-0373 — A window's void may take a free-form outline, authored in ELEVATION on the reused wall PROFILE editor — never a second geometry vocabulary

- **Status:** ACCEPTED (decisions D1–D12, ratified by the founder 2026-08-25) · **Implementation:
  PARTIAL** — see §7 for exactly which lane shipped what.
- **Date:** 2026-08-25
- **Lane:** OUTLINE80-MODEL (L0/L2 fields + derivations) · OUTLINE81-AUTHORING (L2/L7 editor +
  type/instance wiring) · OUTLINE82-DRAWINGS-DOCS (drawings + this ADR + the C86 amendments) ·
  **Issue:** [L-11200..L-11252](../../04-reference/ISSUE-LOG.md) (spec interruption + resume),
  [L-11270..](../../04-reference/ISSUE-LOG.md) (this pass)
- **Governed by:** [C86 §10.1](../contracts/C86-ELEMENT-WALL-OPENING.md#§10.1) (the profile axis this
  ADR extends with a new kind), [C86 §10.5.b](../contracts/C86-ELEMENT-WALL-OPENING.md#§10.5.b)
  (type-vs-instance authorship, amended here), **new** [C86
  §10.6](../contracts/C86-ELEMENT-WALL-OPENING.md#§10.6) (the authoring technology, minted by this
  ADR), [C15 §3.1](../contracts/C15-HOSTED-ELEMENT-CONTRACT.md#§3.1) (the void's shape axis defers to
  C86 §10.1), [C25 §1.9](../contracts/C25-IFC-EXPORT-PRODUCTION.md#§1.9) (a wrong number is worse
  than a missing one — governs the IFC declared-absence half), C84 (element integrity — EI-9 one
  vocabulary, EI-12 a registered trigger needs a proven dispatcher), C65 §3.5 (declared capabilities,
  not family branches), C67/C68 (command authoring, RAC), C73 (determinism), C83 (impossible vs
  inadvisable refusals)
- **Spec:** [SPEC-WINDOW-CUSTOM-OUTLINE](../../03-execution/specs/SPEC-WINDOW-CUSTOM-OUTLINE.md) —
  the working document this ADR seals; read it for the full finding-by-finding evidence (F1–F10) this
  ADR only summarises.
- **Supersedes:** nothing. **Amends in place:** C86 §10.1 (PR-7, PR-8, the arms table), C86 §10.5.b,
  C15 §3.1 (pointer only) — see §6 below for the exact amendment log.

---

## 1. Context — the founder's brief, and what it turned out to require

> *"In the window type editor we have an amazing 3D viewer. Add a projection ELEVATION (looking at
> the window from the front) and use the wall-editor technology to define the PERIMETER of the
> window — triangular windows, non-rectangular, non-circular, and further. The principle is always:
> a frame, a sill and glass; every other parameter stays part of any possible shape. Maximum
> flexibility with the shape."*

Three read-only maps of the repo (spec §1, findings F1–F10) established the shape of the problem
before any code was written:

- The window's void shape does not belong to the window record; it belongs to the host wall's
  `Opening` row (`openingProfile`, currently `'rectangular' | 'round-arch' | 'segmental-arch' |
  'circular'` — [C86 §10.1](../contracts/C86-ELEMENT-WALL-OPENING.md), PR-1..PR-8), and there is
  already exactly ONE outline producer, one frame/glass derivation pipeline
  (`insetOutlinePoints` → `profiledBandGeometry`/`profiledPlateGeometry`), and a wall-arm ruling (A
  consumes, B/C gasket, D refuses, E excluded) that a new profile *kind* can reuse without touching a
  single line of that machinery.
- Every rectangle assumption that survives on the profile axis today is a **pre-existing, named**
  gap, not something this ADR widens: the plan symbol, the glazing grid on profiled arms, reveal/
  splay on non-rectangular openings (ADR-0342), instancing, curved hosts, and IFC profile
  representation (F8).
- The "wall editor technology" the founder pointed at is a real, working piece of machinery —
  `packages/geometry-wall/src/WallProfileEditor.ts` (L2 model) +
  `apps/editor/src/ui/WallProfileEditor.ts` (L7 SVG surface) — already drawing in an abstract metric
  elevation frame (`{u, v}`), already gated on a documented reason for being an SVG modal and not a
  3-D handle editor: *"there is no camera in this repo guaranteed to be looking at that plane"*
  (`packages/geometry-wall/src/WallProfileEditor.ts:26-38`).

## 2. Decision — one shape axis gains one new kind, authored on the reused profile editor

**D1 — One shape axis, one new kind, one companion carrier.** `Opening.openingProfile` gains the
kind **`'custom'`**. The ring travels in a companion field on the SAME host record,
`customOutline: { vertices: { u: number; v: number }[] }`, present **iff**
`openingProfile === 'custom'` (Zod refine, on all three schemas that can carry an opening:
`WallDataSchema`, `WindowTypes`, `DoorTypes` — Zod strips undeclared keys, so a ring on only one of
the three is silently lost on the others, hence "all three or it dies on load"). This amends
[C86 §10.1 PR-7](../contracts/C86-ELEMENT-WALL-OPENING.md#§10.1) from *"one field"* to *"one AXIS:
the kind, plus its carrier, which no other kind may populate."*

**D2 — The ring is normalised to the unit bounding box, and that is a load-bearing consequence, not
an implementation detail.** `u, v ∈ [0, 1]`; `u` runs along the wall, `v` runs up from the sill line.
`width × height` therefore remain the **only** size vocabulary — the reason
[C86 §10.1 PR-8](../contracts/C86-ELEMENT-WALL-OPENING.md#§10.1) keeps a bounding box for every
profile in the first place: occupancy (`WallOccupancyStore`), drag, the `W×H` parametric/chat
grammar, plan extent, and IFC all keep working unchanged, with zero new fields to teach any of them.
**The stated rule, verbatim, because it is the one users will notice first:** *a custom shape is
defined relative to its opening's bounding box; resizing the opening stretches it.* There is no
"lock aspect ratio" escape hatch in this ADR — a triangle authored at 1:1 that is resized to a wide
opening becomes a wide, flat triangle, by design, because a second size vocabulary (real-metre
vertices independent of `width`/`height`) is exactly the EI-9 defect PR-8 already exists to prevent.

**D3 — Validity of a ring is ONE predicate, asked from three places.** `validateCustomOutline` (L2)
requires: ≥ 3 vertices; a simple polygon (no self-intersection, reusing `geometry-kernel`
`findSelfIntersection`); CCW winding (normalised on commit — a CW ring is never *refused*, only
re-wound); first vertex not repeated; a **tight** bounding box (some vertex touches each of `u=0`,
`u=1`, `v=0`, `v=1` within `1e-6`, or `width`/`height` would silently lie — C84 EI-9); area ≥
`PROFILE_MIN_AREA` as a fraction of the unit box (justified from `WallProfile.PROFILE_MIN_AREA_M2`
at the type's default size); and arcs are tessellated AT AUTHORING TIME (16 chords via
`arcSegmentThroughMidpoint`, recoverable later via `resolveBoundarySegments`) — no `curve` field, the
same convention `OpeningProfile.ts` and `BoundaryLine.ts` already share. The schema refine, the
editor's commit gate, and `openingProfileShapeRefusal` all call this one function; none re-derives
the rule. Every refusal names the failing rule and the numbers (C74, [C16
CA-18](../contracts/C16-COMMAND-AUTHORING-PROTOCOL.md)).

**D4 — Frame, sill and glass are DERIVED from the ring, never separately authored (C75).** Frame =
`insetOutlinePoints(ring·(w,h), frameThickness)` → `profiledBandGeometry`; an inset that returns
`null` (a corner too sharp for the requested frame thickness) refuses BY NAME at the type editor —
*"the frame inset of 60 mm fails at vertex 3 — reduce the frame thickness or open the angle"* — and
the commit gate holds. Glass = `profiledPlateGeometry` on the sash inset. **Sill = the lowest
horizontal straight run of the ring**: the edge(s) sitting at `v = 0` with non-zero length get a sill
board of that run's length plus `sillOverhang`; a ring whose bottom is a single vertex or an arc (an
apex-down triangle, a full circle) gets **no sill, reported by name** in the preview and the
properties panel — this is the founder's *"always a sill"* honoured everywhere a sill can physically
sit, and refused audibly everywhere it cannot, rather than either fabricating a sill on a point or
silently omitting one with no explanation. The glazing grid on the profiled arm stays **absent** and
stays **declared** (F8) — this ADR does not widen that gap.

**D5 — The wall arms need no new ruling, only a new kind flowing through the existing one.** Arm A
(plain wall) consumes the outline directly (PR-3) — a custom ring reaching the floor is a *notch* and
is refused for windows, with the door alternative named (a door is out of scope for `custom`, D12).
Arms B/C (fragmented / LAYERED) consume it as bounding-box + gasket (PR-4) — the gasket is
`bbox − outline`, and OUTLINE80 measured a concave ring (an L, a star) through
`OpeningProfileGasket`/`LayeredWallOpeningBuilder` and pinned it: every reveal face lies on the
outline, none on the bbox boundary inside the opening. Arm D (curved wall) refuses permanently,
by name (PR-5, unchanged — a curve set out in arc-length space cannot host a flat-frame ring any more
than it can host a circle). Arm E (instanced) stays excluded, pinned both ways (PR-6, unchanged).

**D6 — Type carries a TEMPLATE; the instance owns its ring; type change never reshapes.** This
reconciles the ADR's central tension with [C86
§10.5.b](../contracts/C86-ELEMENT-WALL-OPENING.md#§10.5.b) and its L-10948 ruling ("TYPE DOES NOT
CHANGE SHAPE, by design"). `WindowSystemType` gains an *optional* `customOutline` — a normalised ring
that is a **template**, not a live binding. A window CREATED while the active type carries a ring is
created with `openingProfile: 'custom'` and a **COPY** of that ring on its own `Opening`. Changing
the type of an EXISTING window does **not** reshape it — L-10948 stays literally true — and the
properties panel offers **"Apply shape from type"** as an explicit, undoable command instead.
Editing the type's outline later does **not** reach existing instances (the C65 §3.6 drift this
would otherwise create is avoided by construction, not by discipline) — that one-way binding is the
stated price of the L-10948 ruling, not an oversight. **Consequence worth stating plainly:** a
project with 40 triangular windows from one type, then an edit to that type's outline, leaves all 40
instances exactly as they were; only newly-created windows and explicit "Apply shape from type"
calls pick up the change.

**D7 — Authoring surface: four surfaces, or a recorded blocker, per [C86
§10.5.a](../contracts/C86-ELEMENT-WALL-OPENING.md#§10.5.a).** Type editor gains an "Elevation
outline" section (registry capability `finishEditor.outline`, a *declaration* per C65 §3.5, never a
family branch) mounting the generalised outline editor with **Rectangle** (reset) · **Polyline**
(click-to-place, Enter closes, ⛔ ortho absolute per the founder's 2026-08-24 ruling) · **Arc**
(3-click through midpoint) · **Presets** (triangle, trapezoid, gable/pentagon, gothic — rings only,
zero new code). The pre-draw type picker shows a read-only `custom (from type)` pill. The inspector's
Shape row lists `custom` only when the *instance* has a ring, alongside "Apply shape from type" /
"Edit outline…" (opens the same editor bound to the instance's ring at the instance's `width ×
height`). Data Workbench displays the kind; ring editing there is a **recorded omission**, not a
silent gap.

**D8 — The 3-D preview extrudes the same derivation, never a copy.** `PreviewSubject` gains a
THREE-free, L-free part kind `extrudedOutline { points; depth; center; holes? }`, and
`ElementPreviewRenderer` extrudes it on the already-P2-legal preview path
(`@pryzm/renderer-three/three`). Frame band, glass plate and sill on a custom-profile type render
from the SAME `geometry-window` derivations the real builder uses (D4) — never a second
implementation of "what does this ring's frame look like" (C84 EI-11).

**D9 — Drawings read the true outline, not the bounding box (this ADR's OUTLINE82 half).** Elevation
symbol: `insetOutlinePoints` for **every** profiled kind, not only `custom` — this closes a
pre-existing defect (F9: the old code rebuilt a fake record from `width − 2·frameThickness`, which
was already wrong for `round-arch`/`segmental-arch`/`circular` and would have been meaningless for a
free-form ring). Plan symbol: the cut width at the section plane is read from the outline at
`cutHeight − sillHeight`, so a circle cut above its centre draws the chord it actually is, not its
bounding box; a plane that misses the ring omits the symbol and says why ([C16
CA-18](../contracts/C16-COMMAND-AUTHORING-PROTOCOL.md)) rather than drawing a lie at the bbox. IFC: a
non-rectangular opening's export stays a bounding-box rectangle (a faithful
`IfcArbitraryClosedProfileDef` from the ring is real, separate work, recorded as a gap — [C25
§2](../contracts/C25-IFC-EXPORT-PRODUCTION.md#§2) row) but the silhouette is now a **named** absence
— the profile kind, and for `custom` the vertex count, is written into the entity's `Description`
per [C25 §1.9](../contracts/C25-IFC-EXPORT-PRODUCTION.md#§1.9) ("a wrong number is worse than a
missing one"), rather than the file silently asserting the box IS the shape.

**D10 — Chat / RAC.** `'custom'` is registered as NOT claimable by adjective — *"make the windows
custom"* refuses, naming the type editor as the real route (there is no ring for the resolver to
invent). The named presets (`triangular`, `trapezoid`, `gable`, `gothic`) ARE claimable by name
through the existing catalogue ladder and resolve to their preset ring — table rows added to
`OpeningShapeVocabulary`, zero new resolver arms. The RAC matrix gains a `window.customOutline` row:
askable (vertex count, bbox tightness), settable only via type or preset — never free-form through
chat.

**D11 — Persistence / undo stay additive, and L-3421 closes in the same lane.** `openingProfile` /
`customOutline` are additive-optional fields on `Opening` (three schemas), and `customOutline` is
additive-optional on `WindowSystemType`. Per C47 §1.2, additive-optional needs no `SCHEMA_VERSION`
bump. `CreateWallOpeningCommand` carries the ring through its existing dual write ([C15
§8.1](../contracts/C15-HOSTED-ELEMENT-CONTRACT.md) gate). **L-3421 closes here**:
`WallStore.updateWindow`'s self-heal previously re-created the opening WITHOUT `openingProfile` at
all (F10) — any new field on the profile axis would have fallen through that same hole, so the fix is
general, not `custom`-specific.

**D12 — Doors stay out of scope for `custom`, by name.** `openingProfilesFor('door')` does not offer
`'custom'` — a door is a floor notch, and `notchWalk` assumes two feet at `v = 0`, which a free-form
ring is not guaranteed to provide. `round-arch` and `segmental-arch` already apply to doors (PR-3);
only the free-form kind is withheld, with the reason stated rather than left to be inferred from
absence.

## 3. Alternatives considered and rejected

- **A `radius`/vertex-list field alongside `width`/`height`.** Rejected by [C86 §10.1
  PR-8](../contracts/C86-ELEMENT-WALL-OPENING.md#§10.1) before this ADR existed, and `custom`
  inherits the same reasoning: a second size vocabulary mints a state where the two can disagree, and
  every one of the many `width`/`height` consumers (occupancy, overflow cap, plan extent, `W×H`
  grammar, IFC) would need to learn to ask the question a second way.
- **Route non-rectangular openings through the parked single-volume CSG arm (arm F).** Rejected —
  [C86 §10.1](../contracts/C86-ELEMENT-WALL-OPENING.md#§10.1) already recorded this as
  **unavailable, not unconsidered**: the CSG arm sits behind a flag with an unmeasured datum blocker,
  and turning it on to serve a new feature would be exactly the inference [C85 §12
  R-8](../contracts/C85-ELEMENT-WALL.md) forbids.
- **A 3-D handle editor in the type viewer instead of the SVG elevation modal.** Rejected for the
  same reason the wall profile editor is already an SVG modal: *"there is no camera in this repo
  guaranteed to be looking at that plane"* (`packages/geometry-wall/src/WallProfileEditor.ts:26-38`).
  The 3-D viewer stays the PREVIEW (D8), never the authoring surface.
  See §7 in the spec / new C86 §10.6 for the full generalisation argument, including why the
  plan-tool overlay (`PlanViewToolOverlay.ts`) was also rejected as the authoring surface (no
  `PlanSurface` abstraction exists to extract, and its `WorldPoint` vocabulary would have to lie
  about a `(u, v)` frame).
- **Promoting the ring to a fully live type→instance binding (edits to the type reshape every
  instance).** Rejected — this is precisely the drift [C86
  §10.5.b](../contracts/C86-ELEMENT-WALL-OPENING.md#§10.5.b) already warns against: *"a promoted
  field makes every opening on the project move together at the next type edit, which is a worse
  defect than the parity gap it closes."* D6's copy-on-create + explicit "Apply shape from type" is
  the deliberate, weaker binding.

## 4. Consequences

- **Every downstream consumer of `width`/`height`/opening geometry keeps working unchanged** (D2) —
  no new size vocabulary was minted, so occupancy, drag, the parametric grammar, and IFC's box
  export are all untouched by this ADR at the field level.
- **Resizing a custom-shaped window stretches its shape non-uniformly** (D2) — this is a real,
  user-visible behaviour, stated here so it is never "discovered" as a bug: a triangle drawn at 1:1
  and later resized to 2:1 is a stretched, not a re-scaled, triangle.
  Anisotropic aspect-lock is explicitly out of scope for this ADR.
- **A type's outline is a one-way template** (D6) — editing it after windows have been created from
  it does not reach those windows. This is the direct, accepted cost of keeping L-10948 literally
  true rather than reopening it.
- **The glazing grid, reveal/splay, instancing, and curved-host support remain absent on the profiled
  arm** (D4, D5) — this ADR does not close any of those pre-existing gaps; it only adds one more
  profile kind that inherits them, same as `round-arch`/`segmental-arch`/`circular` already do.
- **IFC export of a custom (or any non-rectangular) opening is still geometrically a box** — D9 makes
  that fact loud (a named `Description`) rather than fixing the underlying representation gap, which
  stays a recorded item on [C25 §2](../contracts/C25-IFC-EXPORT-PRODUCTION.md#§2).
- **Doors never gain `custom`** (D12) — a future ask for a free-form door shape needs its own decision
  (`notchWalk`'s two-foot assumption would need to be revisited first), not an extension of this ADR.

## 5. Implementation status — read this before assuming any of D1–D12 is built

This ADR RATIFIES the design; it does not certify that every decision is shipped. Per the spec's
lane table (§4/§7):

| Decision(s) | Lane | Status as of this ADR |
|---|---|---|
| D1–D5, D10 (vocabulary rows), D11 | OUTLINE80-MODEL | Restarted from zero as of this pass (prior attempt did not begin) — see [L-11251](../../04-reference/ISSUE-LOG.md) |
| D6–D8 | OUTLINE81-AUTHORING | Blocked on OUTLINE80's types; not started as of this ADR |
| D9 (elevation + plan symbol) | OUTLINE82-DRAWINGS-DOCS | **Shipped and tested**, `a5238b8f` — `OpeningElevationSymbol.ts`/`.test.ts`, `WindowPlanSymbolBuilder.ts` (33/34 tests green; 1 pre-existing unrelated skip) |
| D9 (IFC declared absence) | OUTLINE82-DRAWINGS-DOCS | The declaration module (`opening-profile-declaration.ts`) shipped orphaned in `a5238b8f`; **wired into `window.ts`/`door.ts` and proven through the real exporter in this pass** |
| This ADR + C86/C15 amendments | OUTLINE82-DRAWINGS-DOCS | This document, and the amendments in §6 below |

**Why the split is recorded rather than smoothed over:** the first implementation pass hit the
account's weekly usage limit mid-work (spec header, 2026-08-25) and was resumed as a second pass.
The interruption is why D9's elevation/plan-symbol half and its IFC half shipped in two different
commits under two different sessions rather than one — `insetOutlinePoints`/`planCutSpanOf` landed
and were tested first; the IFC module was written but left with zero call sites (a C84 EI-12 "trigger
with no dispatcher" defect against its own future self) until this pass wired it in. Both halves are
independently correct and independently tested; the gap between them was a scheduling accident, not
a design one, and is named here so nobody mistakes the delay for a second decision.

## 6. Amendment log — what this ADR changed in the contracts, in place

Per C31 immutability, ADRs are never edited after acceptance; the CONTRACTS this ADR amends **are**
edited in place (that is how contracts work — see the C86 "dated correction box" convention), each
carrying a dated box naming what changed and why. This ADR is the rationale record for those boxes:

1. **[C86 §10.1](../contracts/C86-ELEMENT-WALL-OPENING.md#§10.1) PR-7** — "one field" → "one axis:
   the kind, plus its carrier" (D1).
2. **C86 §10.1 PR-8** — clarified that the ring is normalised so the bounding box stays the only size
   vocabulary; no second dimension vocabulary is introduced by `custom` (D2).
3. **C86 §10.1 arms table** — a `custom` row added, summarising D5: arm A consumes the ring directly;
   arms B/C cut bbox + gasket; arm D refuses permanently; arm E stays excluded.
4. **C86 §10.5.b** — amended to state the shape-template/instance-owner split explicitly (D6): a
   shape TEMPLATE may live on the type; the instance owns its ring; changing an instance's type never
   reshapes it; "Apply shape from type" is the one explicit, undoable route that does.
5. **New C86 §10.6 — "The authoring technology: the wall PROFILE editor, reused."** Transcribes spec
   §6 into the contract: the file:line facts for the L2 model and L7 surface, the "no camera
   guaranteed to be looking at that plane" rationale, why the plan-tool overlay was rejected, and the
   four generalisation rules with their layers (D7/§6 of the spec).
6. **[C15 §3.1](../contracts/C15-HOSTED-ELEMENT-CONTRACT.md#§3.1)** — one pointer sentence added
   naming C86 §10.1's `custom` kind explicitly (C15 §3.1 already deferred to C86 §10.1 in general;
   this names the new kind so a reader of C15 alone knows it exists).
7. **[C25 §1.9](../contracts/C25-IFC-EXPORT-PRODUCTION.md#§1.9) / §2** — a row recording the IFC
   declared-absence behaviour (D9's IFC half) as now wired, with the honest caveat that it runs on
   Pipeline B (`plugins/ifc-export/**`), not the pipeline the app's export button calls
   ([C25 §1.7](../contracts/C25-IFC-EXPORT-PRODUCTION.md#§1.7)).
