# SPEC — Lift Compound System (LOD 300)

**Lane:** LIFT22 · `§FEAT-LIFT-COMPOUND-SYSTEM` · L-5700..L-5713
**Contract:** [C104](../../02-decisions/contracts/C104-ELEMENT-LIFT-COMPOUND-SYSTEM.md)
**ADR:** [ADR-0354](../../02-decisions/adrs/ADR-0354-a-lift-cabin-part-is-not-a-slab-and-a-landing-door-is-a-door.md)
**Status:** §1–§6 BUILT and tested · §7 PARTIAL · §8 NOT BUILT (named, with reasons)

---

## §0 — The founder's request, and what each clause became

| # | Founder's words | Where it lives | State |
|---|---|---|---|
| 1 | "a lift compound system … lod 300 … with types" | `plugins/lift`, `LiftAssembly.ts`, C104 §5 | ✅ BUILT |
| 2 | "clicking tab allow the user to select sub systems … like the kitchen element" | `SelectionManager.cycleLiftMember()` | ✅ BUILT (browser-unverified — §9) |
| 3 | "wall hosted lift … preview where the door of the lift will be" | `enclosureType: 'wall-hosted'`, `hostWallId` | ⚠ record + validation BUILT; **the PREVIEW is NOT** (§8.1) |
| 4 | "will create the door, lift and the cabine + shaft" | `lift.create` | ✅ BUILT |
| 5 | "asked how many stories … based on the existing levels … create the relevant doors instances … cover the relevant space with the shaft" | `servedLevels` payload; assembly | ⚠ the MODEL is BUILT and tested; **the ASKING UI is NOT** (§8.2) |
| 6 | "cabinet composed by structure, finishes wall, floor ceiling etc.. all sub elements querible and selectable" | `liftPart` family, 5 parts | ✅ BUILT |
| 7 | "standalone lift, no wall hosted, glass curtain wall lift placed on a floor" | `enclosureType: 'standalone-glass'` | ✅ BUILT (model); placement UI shares §8.1's gap |

---

## §1 — Package layout

```
packages/geometry-lift/            (L2, pure — no THREE, no DOM, no store)
  LiftDimensions.ts       the ONE resolution chain + the only dimensional literals
  LiftPartTypes.ts        the 5 cabin-part kinds, labels, and the Tab cycle ORDER
  LiftCompoundTypes.ts    the compound parent record (Zod)
  LiftAssembly.ts         buildLiftAssembly() — the pure decomposition
  [pre-existing, untouched] LiftTypes / LiftStore / LiftTypeStore /
                            LiftMeshBuilder / LiftTool / LiftToolPlacement

plugins/lift/                      (L6)
  store.ts                LiftCompoundStore, LiftPartStore
  errors.ts               5 typed domain errors
  handlers/CreateLift.ts  lift.create  — 6 stores, ONE patch pair
  handlers/DeleteLift.ts  lift.delete  — removes all, heals every void
```

---

## §2 — Geometry model

**Coordinate space: WORLD, everywhere.** `baseLine`s and hole loops are world XZ with
`y` carrying an elevation — the same convention `Slab.boundary` and `Wall.baseLine`
use, so no consumer converts and there is no local space to get wrong. (`PoolAssembly`
records why: the stair's local conversion only works because slab position happens to
be zero.)

**Footprint.** A rectangle centred on `origin`, `shaftWidth` across local X,
`shaftDepth` along local Z, rotated `rotation` about world Y. **Local −Z is the
LANDING side** — so `rotation` aims the doors.

**Vertical.**

```
shaft top  = max(served elevations) + overrunHeight     <- headroom above the car
   ...
level k    = a LANDING DOOR at sillHeight = elev(k) − shaftBase
   ...
level 0    = min(served elevations)
shaft base = min(served elevations) − pitDepth          <- the buffer pit
```

⭐ **One tall wall carrying N doors at N sill heights is the whole trick** — and it is
what lets the landing doors be real `Door` records (ADR-0354 §2).

**Car-local space** (cabin parts only): origin = centre of the car floor's **top**
face, +Y up, +X across the door, +Z into the car. The floor build-up has a **negative**
`offsetY`; the ceiling raft hangs at `carHeight − ceilingThickness`.

---

## §3 — The two types

| | `wall-hosted` (A) | `standalone-glass` (B) |
|---|---|---|
| Enclosure | 4 × `Wall` | 3 × `CurtainWall` + 1 × `Wall` |
| Landing side | `Wall` | `Wall` — **must** be, `Door.wallId` hosts in a wall |
| `hostWallId` | **required** (schema refuses without it) | absent |
| Placed on | a wall | a floor |

`LiftEnclosureType` is **orthogonal** to `LiftKind` (passenger/accessible/goods): the
first describes the **shaft**, the second the **car**. A goods lift can be
standalone-glass. Collapsing them into one enum would make most real combinations
unrepresentable.

---

## §4 — System types

| id | car | shaft | door | default of |
|---|---|---|---|---|
| `passenger-6` | 6 persons | 1.5 × 1.6 | 0.8 | **`lift.create`** (NEW, L-5701) |
| `passenger-8` | 8 persons | 1.8 × 1.8 | 0.9 | the legacy massing path (unchanged) |
| `accessible` | EN 81-70 type 2 | 1.8 × 2.0 | 1.0 | — (regulatory, unchanged) |
| `goods` | 13 persons | 2.0 × 2.4 | 1.2 | — |

See C104 §6 for the three measured reasons `passenger-6` was **added** rather than
substituted.

---

## §5 — Command surface

| verb | stores | notes |
|---|---|---|
| `lift.create` | `lift`, `liftPart`, `wall`, `curtainwall`, `door`, `slab` | ONE `produceMultiStoreCommand` patch pair. All ids **pre-minted** by the caller (CA-2) |
| `lift.delete` | same six | Removes all members; heals every void; **leaves the host wall standing** |

There is deliberately **no `liftPart.*` verb** — see the `STORE_ONLY_PLUGIN_IDS` entry.

**Refusals** (all before any mutation): duplicate id · empty served-level set ·
duplicate served level · non-finite elevation · a served level naming a slab that does
not exist · `wall-hosted` with a missing or unknown host wall · wrong pre-minted id
counts · schema failure.

---

## §6 — Tab drill-in

`whole lift → enclosure sides → landing doors → cabin parts (declared order) → whole lift`

Order is **outside-in** and editorial: an architect drilling into a lift is nearly
always heading for a finish.

⛔ **The member list is built from the lift RECORD, never from `traverse()`** — C104
§2.2. The scene is consulted only to find a mesh for a known id, and the sub-selection
is published by **id** even when no mesh exists.

---

## §7 — Reachability (four axes — C104 §10)

| Axis | State |
|---|---|
| 1 store constructed | ✅ |
| 2 descriptor + `storeKey` | ✅ proven by `liftReachableThroughComposedRuntime.test.ts` (12 cases) |
| 3 something dispatches | ⚠ **PARTIAL** — palette button + activator exist but drive the LEGACY massing command (L-5709) |
| 4 AI chat | ⛔ class B refusal (L-5710) |

---

## §8 — NOT BUILT, named rather than implied

### §8.1 — The placement PREVIEW (L-5708)

The founder asked for *"a preview where the door of the lift will be"*, like a door or
the balcony. **There is no `LiftPlanToolHandler`**
(`grep -n "Lift" planToolHandlerRegistry.ts` → 0), so the lift tool is inert in plan
and there is no ghost of the landing door snapping to a wall.

The three rows a plan handler needs (`PLAN_TOOL_KEYS` string, the
`createPlanToolHandlers()` entry, the `elementCreationMatrix` row) belong to files
another lane owns this session, and **the matrix `tool` and the registry key must be
the SAME STRING** — the exact mismatch that made the railing tool arm nothing while
reporting success.

### §8.2 — The "how many storeys?" MODAL (L-5709)

The **model** answers this question completely: `servedLevels` is a set of level ids,
one landing door per entry, a void per slab, tested at both the pure and composed
layers. **The UI that ASKS is not built.** Until it is, the storey set arrives only
from a programmatic caller.

⚠ **This is the gap between "the founder's request is modelled" and "the founder can
do it".** Stated plainly because a green reachability suite would otherwise imply
otherwise.

### §8.3 — Rendering (L-5712)

There is **no mesh builder for the LOD-300 compound**. Its shaft walls, glass sides and
landing doors render through the existing wall / curtain-wall / door builders — which
is a real benefit of composing from existing families — but the **cabin parts have no
builder**, so the car is not drawn. The Tab drill-in handles this (selection by id,
highlight only where a mesh exists), but a lift placed today shows a shaft and doors
and **no car**.

### §8.4 — Not done, and deliberately

Machine room · counterweight · guide rails · door operator · ropes · buffers as
objects · fire-rating certification data · lift traffic analysis. All LOD 350+, all
named in C104 §5.

---

## §9 — Verification

| Claim | Evidence |
|---|---|
| pure assembly is correct | `packages/geometry-lift/__tests__/liftAssembly.test.ts` — **30 passed** |
| compound is dispatchable at the composition root | `apps/editor/__tests__/liftReachableThroughComposedRuntime.test.ts` — **12 passed** |
| no regression in sibling suites | `bootstrap.everything` + balcony reachability — **33 passed** total |
| tree compiles | `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck` → **RC=0, 0 errors** |

**⚠ NOT VERIFIABLE WITHOUT A BROWSER, and therefore NOT claimed:**
that pressing Tab in a live viewport highlights a member; that the amber box lands in
the right place; that a placed lift looks correct in 3-D. The mechanism is wired and
unit-tested, and it mirrors a mechanism in daily use — but the keystroke path itself
has been exercised by no test and no human.
