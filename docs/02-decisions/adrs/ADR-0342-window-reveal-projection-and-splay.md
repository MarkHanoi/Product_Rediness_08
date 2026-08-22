# ADR-0342 — A window's REVEAL is one model with two parameters: a signed projection and four per-side splay angles

- **Status:** Accepted
- **Date:** 2026-08-21
- **Lane:** WIN1
- **Supersedes:** nothing. **Amends in place:** `packages/schemas/src/elements/Window.ts` (+5 fields),
  `WindowTypes.WindowOpeningSchema` (+5 fields), `WindowBuilder`, `WindowPlanSymbolBuilder`,
  `WindowSection`, `UpdateWindowParameterCommand`. **Adds:** `packages/geometry-window/src/WindowReveal.ts`.
- **Commit:** `12d2b8be`
- **Contracts:** C86 (wall opening — the governing per-element contract), C85 (host wall),
  C84 (element integrity, EI-2 byte-identity / EI-3 vocabulary), C83 (spatial validity —
  IMPOSSIBLE / INADVISABLE / FINE), C67 + C68 (a new user-visible attribute), C16 (command
  authoring), C73 (determinism and tolerance), P2/P6/P8.
- **Issue-log:** L-1920 … L-1929.

---

## 1 · Context — the founder asked for two things, minutes apart

> "I want for all window types to have the possibility to **extrude outside the façade** — a new
> attribute in the Properties panel, like frame width but **offset wide** or something like that —
> for modern façades. For **all wall types** I want to be able to do something like this."

> "Also I want to have another window type where the frame basically has **angles inwards** — the
> user, by a property in the Properties panel and by RAC, should be able to control **the angle,
> which will define the size of the glass**; and **the side of the windows (top / bottom / left /
> right / all / multiple)**."

His first reference is a projecting window box: a deep frame cantilevering past a brick façade,
glazing near the outer face, solid head/sill/jamb returns forming the box sides. His second is a
white façade of openings whose reveals **splay inward**, large at the façade and narrowing to a
smaller glazing plane behind — and several of them splay on only SOME sides.

## 2 · Decision — ONE model, because two would mint two glazing planes

Both asks answer the same question: **where does the reveal run between the wall face and the
glazing plane?** Modelled independently, each would need to place the glass, and the two answers
would drift. That is the defect shape this repo keeps paying for — `WallArcParam.hostedElementFrame`
states it in its own header (*"a fourth copy of this rule is the mistake that produced the defect
in the first place"*), and L-813 records three cache keys in series for the same reason.

So `packages/geometry-window/src/WindowReveal.ts` is **the** model. Five authored scalars in; one
outer plane, one glazing plane, four insets and a derived glazing rectangle out. Four consumers —
the 3-D leaf, the plan symbol, the command's validation, the panel's readout — and **none of them
re-derives any of it.**

With `t` = host wall thickness, `p` = `revealProjection`, local `z` across the wall:

```
outer plane     zOuter = −t/2 − p          the box's outer lip
reveal run      R      = t/2               exterior face → wall centre-plane
glazing plane   zGlaz  = zOuter + R = −p
side inset      i_s    = R · tan(θ_s)
glazing size    wG = w − (i_left + i_right)      hG = h − (i_head + i_sill)
```

### 2.1 · Why `R = t/2` and not `p + t/2`

Holding the run fixed is what makes the two parameters **compose instead of interfere**. The
projection slides the whole assembly outward rigidly — lip, reveal and glazing together — and the
splay shapes the reveal within it. Had the run grown with `p`, a user who deepened the box would
have watched the glass shrink without touching an angle: one attribute silently redefining another.
Pinned by test (*"THE PROJECTION DOES NOT TOUCH THE GLASS SIZE"*).

It also makes both photos fall out of one rule: photo 1 is `p > 0, θ = 0` (lip proud of the façade,
pane riding out with it); photo 2 is `p = 0, θ > 0` (reveal raking from the façade to the wall
centre, where the pane has always sat).

## 3 · The named decisions

### 3.1 · The attribute name — `revealProjection`, not "offset wide" and not `projectionDepth`

He offered "offset wide" knowing it was approximate. The coordinator suggested `projectionDepth`.
Chosen: **`revealProjection`**, with the splay fields as `revealSplayHead` / `revealSplaySill` /
`revealSplayJambLeft` / `revealSplayJambRight`. The `reveal*` prefix is doing real work: it says at
the point of use that these five fields are ONE model, which is precisely the fact a future editor
must not lose. `projectionDepth` would have named the first ask well and orphaned the second.

> ⛔ **§3.2 IS AMENDED — 2026-08-22, lane WIN5 (L-3410 … L-3413). Read this box before the section
> below it; the section's CONCLUSION is inverted and its METHOD is the finding.**
>
> The founder, looking at the built model: *"the reveal projection and splay are applied to the
> WRONG SIDE — both currently modify the INDOOR face."* **`EXTERIOR_LOCAL_Z` is now `+1`.**
>
> **Two things were measured before the literal was touched, and the FIRST matters more than the
> second:**
>
> 1. ⭐ **The constant was UNREACHABLE.**
>    `grep -rn EXTERIOR_LOCAL_Z packages/ apps/ src/ plugins/` → **7 hits: the declaration, a
>    barrel re-export, three prose comments, and one test asserting its own value. ZERO production
>    consumers.** The geometry hard-coded its sign as a literal `-` in
>    `zOuterFace = -run - projection`. So everything §3.2 establishes was **documentation the
>    geometry was never bound to** — and the test suite asserted that the model AGREED WITH ITSELF
>    (the constant said −1, the arithmetic used −1, the test asserted −1). **Three self-consistent
>    statements of one fact are not three pieces of evidence.** The constant is CONSUMED now, via
>    `revealOutwardSign()`, which is the only place a direction becomes a sign.
>
> 2. **§3.2's own recorded contradiction was the tell, and it was written down rather than
>    resolved.** This ADR logged L-1926: `_addSillBoard` places the sill at `+z` commented
>    *"toward exterior"*, directly against the constant, *"one of the two is wrong and it is the
>    sill comment"* — and left the board alone. **It was not the sill comment.** The founder's
>    observation of the running app resolves the contradiction in the SILL's favour, and the two
>    agree for the first time. Per [[probe-can-be-wrong-three-ways]], an observation at the layer
>    the user experiences outranks a derivation from three module headers, which is what §3.2 was.
>
> **What §3.2 still gets RIGHT, and must not be lost in the correction:** that there must be exactly
> ONE statement of which side is outside, that it must be a persisted authored fact and never a
> render-time heuristic, and that no consumer may re-derive it. Those hold; only the value moved.
>
> ⭐ **AND THE FACE IS NOW A USER CHOICE — `revealDirection: 'outdoor' | 'indoor'`** (Properties
> panel + RAC, modelled on the door's `Swing: Inward | Outward`). It resolves to a **sign** that
> every z-expression in `WindowReveal` multiplies by, so §2's ONE-model rule is kept **by
> construction**: the projecting box and the splay cannot land on different faces. `'indoor'`
> reproduces the pre-amendment geometry exactly.
>
> **Why the direction is AUTHORED and not resolved from topology — measured, not preferred.**
> `WallData.frontSide`/`backSide` (`interior | exterior | unknown`) is declared in THREE schemas
> and `grep -rnE "(frontSide|backSide)[[:space:]]*[:=]"` over `packages/ plugins/ apps/ src/
> server/` returns **ZERO writers**. That is UNREACHABLE, not MISSING (C01 §6 rule 6), and
> `WallSideFinishResolver` already refuses to guess it. The door's `swingDirection` is likewise
> purely authored — `DoorSwingVocabulary` is a MAPPER, not a resolver, so there was no prior-art
> resolver to reuse. The panel says the side is the user's choice, not a detected value.
>
> 🔴 **NOT VERIFIED IN A BROWSER by the amending lane.** The flip rests on the founder's report. If
> it is wrong, the fix is ONE literal — never a second code path.
>
> **C84 EI-2 survives:** an unauthored window short-circuits before any sign is read;
> `StraightHostLeafByteIdentical` passes unchanged. A window that DID author a reveal moves to the
> other face, which is the correction requested.

### 3.2 · Which face is "outside" — MEASURED, and there is now exactly one answer

A wall has two faces, and `WallSideFinishResolver`'s header explicitly **refuses** to supply the
geometric mapping (*"Nothing in this module infers a side from winding order, vertex normals or
camera direction … Where a request genuinely needs the geometric mapping, this module REFUSES"*).
So the mapping had to be established, and it was established by measurement, not preference:

- `WallLayerFootprint2D.buildWallLayerBands` — *"`layerThicknesses` is the authored stack,
  **exterior→interior** … Band *i* occupies the lateral interval `[−total/2 + Σ_{j<i} t_j, …]`
  measured along **`leftPerp(footprint.direction)`**"*. Band 0 — the exterior — is at the most
  NEGATIVE lateral coordinate.
- `WallSideFinishResolver.resolveLayerRenderFinishColor` — *"Exterior-first: index 0 is the exterior
  face, index n−1 the interior face."*
- `WallArcParam.stationFrame` returns `n = (−tz, tx)` = `leftPerp`, and `hostedElementFrame` rotates
  a hosted group by `−angleY`, which maps that group's local **+Z** onto the same `leftPerp`.

**Therefore the exterior is local `−Z`.** Stated once, as `WindowReveal.EXTERIOR_LOCAL_Z`, and
imported everywhere else. **No second notion of "the outside face" was introduced.**

### 3.3 · Signed, not exterior-only

`revealProjection` is signed: positive extrudes past the exterior face (the box window), negative
recesses (the deep-set window). The negative half costs nothing once the axis is signed and is a
real detail, so it ships rather than being refused. It has its own IMPOSSIBLE boundary (§3.6).

### 3.4 · Four named scalars, never a scalar plus a mode enum

He asked for *"all / multiple"*. "Multiple" means **two of the four sides**, and a mode enum cannot
express "head and left jamb only" — which is visibly what his photo shows. So the STORAGE is four
independent per-side numbers and "all"/"multiple" is a SELECTION that the panel and RAC expand over.
The panel offers four inputs plus an "all sides" row that writes all four **in one dispatch**, so
one gesture is one undo step.

Stored names are head / sill / jambLeft / jambRight — construction vocabulary, which is what the
drawings, schedules and any future RAC grammar speak. The UI labels them Top / Bottom / Left /
Right, which is what he asked for. `REVEAL_SIDE_LABEL` owns that mapping, once.

**Left and right are STATED, not inferred from a viewpoint.** `jambLeft` is local `−X`, `jambRight`
local `+X` — the same left/right `WindowBuilder` already uses to name its own jamb members. It is
deliberately NOT "left as seen from outside", because that flips with which face the reader is
standing on, and an attribute whose meaning depends on where you stand is not an attribute.

### 3.5 · The angle is authored; the glass size is DERIVED and shown read-only

His own words: *"the angle … which will define the size of the glass."* So glass size is the
consequence. It is displayed in the panel, read-only, recomputed from the store after every
dispatch. Two fields each claiming to set the same quantity drift apart at their first rounding.

### 3.6 · C83 — IMPOSSIBLE is refused naming BOTH numbers; INADVISABLE is said, never enforced

- **IMPOSSIBLE (refused):** the two jamb splays meet (glazing has no width); head and sill meet (no
  height); a sliver below C73's 1 mm floor; a recess deeper than the wall's outer half. Each refusal
  names **the angle or depth asked for AND the dimension that makes it degenerate**, because a
  refusal that says only "too big" leaves the user guessing which of the two to change.
- ⛔ **It refuses; it does not clamp.** A silently-clamped reveal produces a window whose glazing is
  invisible and whose Properties panel reports success — from the user's side, indistinguishable
  from one that worked.
- **`width` and `height` are in the refusal's trigger set.** SHRINKING a window can make an
  already-authored splay degenerate; a gate keyed only on the reveal fields would let that edit
  through and produce the zero-glass window by the back door.
- **INADVISABLE (said, not enforced):** a projection ≥ 0.6 m is a structural cantilever; a splay
  leaving under half the opening as glass changes what every daylight and glazing-ratio calculation
  reads. Carried on the successful result's `info`.

### 3.7 · Default 0, and the byte-identity is enforced by an existing SHA-256 pin

All five defaults are 0; `isRevealAuthored()` is the single predicate; `resolveWindowReveal` returns
`active: false` and every consumer short-circuits to **literally its previous code path** — a
parameterisation whose identity case is the old expression, not a reconstruction that agrees.

The proof is not new: `StraightHostLeafByteIdentical.test.ts` already hashes every vertex and every
world matrix of the straight-host leaf to SHA-256, and it **passes unchanged**.

### 3.8 · Three exclusions, each a refusal rather than an oversight

- **Curved hosts.** `addSeatedBox` / `addSweptBox` re-seat members onto the host arc from their
  group-local `(x, z)`; the reveal displaces members in `z`, so a curved host would re-seat them
  onto the wrong station and render a box leaning out of its own hole *while reporting success*.
  Same answer `openingOutlineLocal` gives one screen above. **L-1928.**
- **Non-rectangular openings** (`round-arch`, `segmental-arch`, `circular`) take
  `_buildProfiledVisuals`, which returns before the reveal code. **L-1929.**
- **GPU instancing.** A splay plate is a hand-built `BufferGeometry` with no `.parameters`, so
  `_convertGroupToInstances` would hit its `?? 1` guards and render every splayed reveal as a 1 m
  cube — the **third** instance of the mechanism already recorded for curved and profiled windows,
  and windows are the one family whose instancing is default-ON. Projection-only windows would in
  fact convert correctly and are excluded anyway, because splitting `isRevealAuthored` into "the
  half that instances" would mint a second definition of "has a reveal".

## 4 · What is drawn, per view — MEASURED, not assumed

| view | mechanism | reveal shows? |
|---|---|---|
| **3D** | `WindowBuilder` meshes | ✅ box + up to four splay plates + relocated glazing |
| **Section** | raw mesh edge projection (`EdgeProjectorService`); no window symbol producer exists | ✅ **free** — new solids are edge-projected automatically |
| **Plan** | symbol-only (`skipInPlan: true` on every window mesh) | ✅ **built this lane** — box lip + returns, splayed jamb diagonals, glazing moved to the glazing plane. A splayed head/sill is invisible in plan **by construction** (it rakes in the vertical plane) — correct draughting, not a gap |
| **Elevation** | symbol-only, from `wall.openings[]` | 🔴 **GAP — L-1925** |

**The elevation gap is structural, and is named rather than papered over.**
`OpeningElevationSymbolBuilder` reads `wallStore.getAll() → wall.openings[]`, a generic `Opening`
record carrying exactly `{id, type, offset, width, height, sillHeight, elementId, doorType,
windowType, openingProfile}` — the window store is never consulted, so a new field on
`WindowOpening` **cannot reach it**. And `OpeningElevationSymbol.toWorld` sets every point out on
ONE flat plane (`perp = face + k·y`), so the producer has no depth concept for a projecting box or
a splayed reveal to live in. Closing it needs three coordinated changes (the `Opening` record, the
`ElevationSymbolOpening` type, and `toWorld`), which is its own lane. The same file already concedes
a related shortfall: its frame inset is a hard-wired 60 mm literal because the real `frameWidth` is
not passed either.

## 5 · RAC — NOT WIRED, and refused honestly rather than half-built

He asked for RAC explicitly on the second request. **It is not wired**, and this is a deliberate
refusal, not an omission:

- The obvious cheap seam, `element.updateParameters` (what `set-sill-height` uses), routes through
  `WallStore.updateWindow`, which copies **exactly four fields** onto `wall.openings[]` — width,
  height, sillHeight, offset. Reveal fields would be **dropped in silence while the call still
  succeeds**: precisely the L-995 whitelist trap that L-1670 exists to prevent, and it would have
  reported "done" over a model nothing had touched.
- Doing it properly means a dedicated batch verb (`window.setRevealBatch`) with an executed
  read-back that counts RECORDS (C67 rule 12 / C16 CA-21), which spans a plugin handler, the
  handlers barrel, `syncDisposition`, the chat bridge's report topic, a command, a pure grammar
  module, two resolver registrations, a `CapabilityExecutionSpec` row and a `ChatCapability` entry
  with probe + commandProof + examples.

Per C67, a capability that cannot prove V3 does not ship. The full checklist is recorded at
**L-1923** so the next lane starts from a plan, not from a rediscovery.

## 6 · Consequences

- Every window in every saved project is unchanged, enforced by an existing SHA-256 pin.
- The Properties panel gains six rows and one derived readout; the model gains five persisted fields.
- Reveal-bearing windows leave GPU instancing (one draw call each). Nothing else does.
- **Not established:** browser verification; elevation (L-1925); RAC (L-1923); curved and
  non-rectangular hosts (L-1928/L-1929); boundary and neighbour validity (L-1927); the sill board's
  side, which contradicts the measured exterior axis and is left untouched (L-1926).
