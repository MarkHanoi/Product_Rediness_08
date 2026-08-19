# C15 — Hosted Element / Host-Wall Contract

> **Stamp**: 2026-05-17 · **Status**: CANONICAL  
> **Scope**: All BIM elements that reside _inside_ a wall (doors, windows, wall-based structural openings).  
> ⛔ **NOT curtain-wall doors** — see §0.1 (decided 2026-08-19).  
> **Authority**: Governs the parametric offset model, the opening-void geometry lifecycle, drag constraints, and all wall-baseline mutation paths that carry hosted elements.  
> **Related contracts**: C02 §3.3 (wall baseline update dual-write), C03 §4 (command bus), C11 (element creation pipeline).


---

## §0.0 — ⛔ CORRECTION 2026-08-18: §6 NAMES AN ERROR TYPE THAT DOES NOT EXIST, SO A `catch` ON IT IS DEAD CODE

```
grep -rn "OpeningsChildrenMismatchError" --include=*.ts --exclude-dir=node_modules packages apps plugins | wc -l
# -> 0
```

**Zero occurrences repo-wide.** §6 specifies it as the typed failure for an openings/children
mismatch. **Any handler written to `catch (e) { if (e instanceof OpeningsChildrenMismatchError) … }`
against this clause is a branch that can never be entered** — and, worse, a mismatch that C15 says
must be *surfaced* is currently surfaced as nothing, or as an untyped throw indistinguishable from
any other. **§6 is NOT-YET-TRUE.** Mint the error type, or restate §6 against the failure signal
that actually ships — but **do not write the `catch` first**.

### ⚠ UNVERIFIED in this pass — stated so a blank is not read as "fine"

Two further defects were reported against this contract and **could not be settled here**:

- **§13 certifies a hardening fix that was reportedly REMOVED.** Not re-derived — the report named
  no commit and no deriving command, so there is nothing to re-run. **Treat §13's certification as
  UNPROVEN, not as confirmed and not as refuted.** Settling it needs the fix named, then
  `git log -S'<symbol>' -- <path>`.
- **§9's four mandated span attributes reportedly have zero occurrences.** The four attribute
  literals are **not enumerated in §9 in a form this pass could extract**, so no grep was run.
  **UNMEASURED.** Whoever states this must paste the four literals and the
  `grep -rn "<literal>" --include=*.ts --exclude-dir=node_modules` that settles each.

**An unverified row left blank reads as "fine" and is indistinguishable from "nobody looked."** Both
rows above are the latter.

---

## §0.1 — SCOPE BOUNDARY: A CURTAIN-WALL DOOR IS **NOT** A HOSTED ELEMENT UNDER THIS CONTRACT

> **DECIDED 2026-08-19 (lane CW1) · owner: [C87 §13.5 CW-Door-1](C87-ELEMENT-CURTAIN-WALL.md) ·
> logged as [L-1072](../../04-reference/ISSUE-LOG.md).** C87 §13.5 asked whether C15's host
> semantics generalise to a door in a curtain-wall panel. **They do not, and C15 is NOT amended to
> make them.** The full reasoning lives in C87 §13.5 and is deliberately **not restated here** — a
> decision written in two places is a decision that will diverge (C84 EI-9). This clause exists so
> the question is not re-opened from the C15 side by someone who never reads C87.

**The boundary, in the terms §1 and §2 already use:**

| C15 requires | A curtain-wall door has |
|---|---|
| a **host wall**: the `Wall` entity in `WallStore` carrying the element in `openings[]` | a **panel** in `CurtainPanelStore`, which is not a `Wall` and has no `openings[]` |
| a scalar **`offset`** along `baseLine`, from which the world position is derived (§2) | a **`cellIndex`**, whose durable identity is the bounding grid-line pair `(uLineId, vLineId)` (C87 CW-P-B) |
| a **void geometry** cut into the host mesh by `WallFragmentBuilder` | **no void** — the cell is already a hole in the mullion grid, and the door *is* the infill |
| rebuild via **`WallRebuildCoordinator`** on `bim-wall-updated` from `WallStore` | rebuild via `CurtainPanelSyncHandler` + the §MI-02 panel-store subscriber |

⛔ **AND THE REASON THIS IS A SCOPE CLAUSE RATHER THAN A GENERALISATION.** Widening §1's *"host"* to
*"the entity whose record contains the hosted element"* would have changed **every word** of §1 and
§2 and **none** of the machinery in `WallFragmentBuilder` or `WallRebuildCoordinator`. That is the
same defect shape as L-809 and L-812 — a document asserting an enforcement that does not exist —
and §0.0 above is this contract's own instance of it. **A contract amendment no code would implement
is worse than no amendment.**

**Consequence, stated so it is not discovered later:** a curtain-wall door is **not** a `door` for
the purposes of C86, `DoorStore`, the door property panel, door schedules or IFC. The single
enumerator that surfaces them —
`collectCurtainWallDoors` in `packages/geometry-curtain-wall/src/curtainWallDoors.ts` — is named in
C87 §13.5, and the consumers that do **not** yet call it are enumerated there as a declared absence,
not as a clearance.


### §0.1.1 — THE POSITIVE SIDE: WHICH HOST SURFACES ACCEPT WHICH OPENINGS

> §0.1 says what a curtain wall is **not**. This clause says what the contract **is** scoped to,
> because a boundary stated only in the negative invites the next family to assume it is inside.
> **Completed 2026-08-19 (lane CW2)** — lane CW1 was writing §0.1 when it stopped, and the clause
> it left states the exclusion without ever enumerating the inclusion.

**MEASURED 2026-08-19, not asserted.** `grep -rn "openings" packages/schemas/src` → the only element
schema declaring an `openings[]` array is **`packages/schemas/src/elements/Wall.ts:105`**
(`openings: z.array(Opening).default([])`), and `Opening.type` at **`:37`** is
`z.enum(['window', 'door'])` — **exactly two kinds, on exactly one host.**

| Host surface | Accepts C15 openings? | Kinds | Mechanism |
|---|---|---|---|
| **`Wall`** (`WallStore`) | ✅ **YES — the only one** | `door`, `window` (`Wall.ts:37`) | `wall.openings[]` + void cut by `WallFragmentBuilder`, rebuilt by `WallRebuildCoordinator` |
| **Curtain wall** (`CurtainWallStore`) | ⛔ **NO** | — | Not an opening at all: a **panel kind** on the cell, `hostedDoor` on `CurtainPanelData`. See §0.1. |
| **Slab / floor** | ⛔ **NO — and there is no rival mechanism either** | — | **No opening model exists.** A slab penetration / shaft is **UNBUILT**, not routed elsewhere. |
| **Roof** | ⛔ **NO — same** | — | Rooflights / dormers have **no opening model**. UNBUILT. |
| **Lift shaft wall** (`VerticalCirculation`) | ✅ **YES — via its wall** | `door` (landing doors) | `VerticalCirculation.ts:12` points at §12: the landing door is hosted on the **shaft wall**, so it is the `Wall` row, not a fifth host. |

⛔ **THE SLAB AND ROOF ROWS ARE DECLARED ABSENCES, NOT CLEARANCES (C84 EI-6).** They are written
here because the alternative is that the next lane reads a table containing only `Wall` and concludes
the others were **considered and routed**. They were not. `grep -rn "penetration\|shaftOpening\|slabOpening"
packages/schemas/src` → **zero hits**. If a slab penetration is ever built, this table is where the
decision — generalise C15, or mint a sibling the way the curtain wall did — must be recorded.

⭐ **THE RULE THIS TABLE ENCODES, so it survives the next host surface:** a new host surface joins
the `Wall` row **only** if it can supply all four of §0.1's requirements — a record with `openings[]`,
a **scalar offset along a baseline**, a **real void** cut into a host mesh, and participation in the
`bim-wall-updated` rebuild path. **A surface missing any one of the four gets a sibling mechanism,
not an amendment to this contract.** The curtain wall missed all four, which is why it got one.

---

## §1 — Definitions

| Term | Meaning |
|---|---|
| **Hosted element** | A door or window that is fully owned by a single wall ("the host wall"). Its position is defined by a scalar `offset` along the wall direction, not by an absolute world coordinate. |
| **Host wall** | The `Wall` entity (in `WallStore`) that contains the hosted element in its `openings[]` array. |
| **Opening** | The entry in `wall.openings[]` describing a void cut: `{ elementId, offset, width, height }`. |
| **Offset** | Signed distance from `baseLine[0]` along the wall direction (`wallDir = normalise(baseLine[1] − baseLine[0])`) to the **left edge / start** of the opening span `[offset, offset + width]`. The element **centre** therefore sits at `offset + width/2` (see §2 `worldCentre`/`voidStart`). *(§OPENING-OFFSET-LEFTEDGE-UNIFY 2026-06-24 — corrected from "centre", which contradicted the §2 `voidStart = baseLine[0] + offset × wallDir` formula and every producer/occupancy check.)* |
| **Void geometry** | The mesh geometry gap ("cut") baked into the wall mesh by `WallFragmentBuilder` at build time. |
| **Opening frame** | The door/window mesh (frame + leaf) managed as a Three.js scene group separate from the wall mesh. |
| **WallRebuildCoordinator** | The service that subscribes to `bim-wall-updated` from `WallStore` and re-invokes `WallFragmentBuilder` for that wall. |

---

## §2 — Coordinate Model

A hosted element's world position is fully derived from its host wall. It has no independent world-space coordinate in the store:

```
worldCentre = baseLine[0] + offset × wallDir + (width/2) × wallDir
voidStart   = baseLine[0] + offset × wallDir
voidEnd     = baseLine[0] + (offset + width) × wallDir
```

where `wallDir = normalise(baseLine[1] − baseLine[0])`.

These expressions are evaluated at **build time** by `WallFragmentBuilder` and baked into the wall mesh geometry vertex buffer. They are re-evaluated only when `WallRebuildCoordinator` triggers a rebuild.

**Corollary**: Moving the host wall without triggering a rebuild leaves the void geometry at the world position computed from the _old_ `baseLine`. Any other rebuild (level switch, new element added, undo/redo of an unrelated command) will re-evaluate the void using whichever `baseLine` the legacy WallStore currently holds — causing a visible snap if the store was not updated.

### §2.1 — ⭐ THE FRAME IS THE HOST'S FRAME, **INCLUDING THE RAKE** (added 2026-08-19, lane JOIN1, L-1271)

The `worldCentre` expression above is the **plumb** special case. It is written for
`wallDir` alone and has **no vertical axis at all** — which is exactly what ADR-0310 §2.5 named
when it first refused a hosted opening on a raked wall: *"the vertical axis is not modelled …
`hostedElementFrame` returns a scalar `rotationY`."* That refusal is lifted (§RAKE-HOSTED-OPENING),
and the general rule is stated **once, here**, so nobody re-derives it:

> **A hosted element's frame IS its host's frame. Every transform the host carries, the hosted
> element carries — the arc tangent, the base datum, and the RAKE. There is no hosted-element
> frame that is a plumb approximation of a leaning host.**

Concretely, for a host raked to θ, with `k = cot θ` and the element's centre at plumb rise `y`
above the **wall base plane** (not the level elevation — see `§WALL-Y-DATUM`, L-968):

```
worldCentre = ⟨the plumb expression above⟩  +  k · y · leftPerp(localTangent)
leaf frame  = the same SHEAR, z ↦ z + k·y, written into the element's matrix
```

Four consequences that are **normative, not implementation notes**:

1. **`sillHeight` and `height` stay PLUMB** — they are vertical rises above the wall base at every
   rake angle, and the void's sill and head faces stay HORIZONTAL. The derived companion (the
   distance measured *along* the raked face, `height / sin θ`) is shown, never stored.
2. **The leaf is SHEARED, not rigidly ROTATED.** A rotation changes the element's PLAN thickness,
   and a raked wall's plan footprint is fixed at its base (ADR-0310 §2.3), so a rotated leaf would
   no longer match the reveal it sits in. Under the shear its faces stay parallel to the wall's,
   its head and sill stay horizontal, and its jambs incline with the wall.
3. ⚠ **The direction is the LOCAL STATION TANGENT, never the baseline chord.** On a curved raked
   host the two differ and the leaf drifts out of its own hole by the angle between them — L-1068,
   which was **the fifth copy** of a rule `hostedElementFrame`'s own header already forbade.
4. ⭐ **A change to the host's rake is a change to the hosted element's INPUTS, so it must
   invalidate the hosted element** — C85 §10.5's clause, *invalidation keyed on the computation's
   inputs and not on the event*. ⛔ Satisfying this by adding "also rebuild windows" to a list is
   the weak form; it must follow from the host relationship. Measured sound at the geometry layer
   by `L1271WindowFollowsHostRakeChange.test.ts` (rake change, reversal, straighten, no cached
   matrix, no group leak). ⚠ **The REACH half — that the editor's
   `UPDATE_ELEMENT_PARAMETER → WallRebuildCoordinator._flush → rebuildForWall` chain actually
   fires for a rake-only edit — is NOT MEASURED by that file and is NOT claimed here.**

---

## §3 — Void Geometry Lifecycle

> **§3.0 — Wall builder pipeline (ADR-0055 P3b default-ON).** Since `bb54a63` (2026-05-27) the non-layered wall path uses **V2** (`JunctionResolverV2` + `WallFootprint2D` + `WallPolygonExtruder`) as the production builder. The legacy `MiterPrismBuilder` + `WallJunctionInfill` chain is retained only for **layered walls** and **walls with openings** — phases **P4a** (layered) and **P4b** (openings) of ADR-0055 remain backlogged; P4c (retire infill) follows. C15's void-geometry lifecycle below describes the void shape, not the builder choice — both V1 and V2 honour the same `wall.openings[i].offset` authority. See ADR-0055 + ADR-0055A for the algorithm. *Side-effect of the V2 promotion: the apartment-layout generator's plain-partition production case is V2-built end-to-end.*

```
User action
    │
    ▼
Wall baseline mutation call site
(registerTransformDragHandler / MovePlanToolHandler / AlignPlanToolHandler / AI / CRDT)
    │
    ├─► [F-1.2 dual-write] getCommandManagerBridge().execute(
    │       new UpdateWallBaselineCommand({ wallId, newBaseLine, prevBaseLine }),
    │       window.commandContext
    │   )                              ──── SYNCHRONOUS ────
    │       │
    │       ▼
    │   WallStore.update({ id: wallId, baseLine: newBaseLine })
    │       │  emits `bim-wall-updated`
    │       ▼
    │   WallRebuildCoordinator.onWallUpdated(wallId)
    │       │  schedules rebuild on next frame tick
    │       ▼
    │   WallFragmentBuilder.build(wall)
    │       │  bakes void at: baseLine[0] + opening.offset × wallDir
    │       ▼
    │   Three.js wall mesh geometry updated ← opening void is NOW at correct world pos ✓
    │   Three.js door/window frame mesh repositioned ← frame matches void ✓
    │
    └─► window.runtime?.bus?.executeCommand('wall.updateBaseline', {
            wallId, newBaseLine, prevBaseLine, _skipBridge: true
        })                              ──── ASYNC, fire-and-forget ────
            │
            ▼
        UpdateWallBaselineHandler: sees _skipBridge → early return (no cm.execute)
        PRYZM3 plugin Immer store updated ✓
```

---

## §3.1 — THE VOID HAS A **SHAPE** AXIS, AND THIS CONTRACT NEVER HAD ONE (added 2026-08-19, lane ROUND1, L-1200)

§3 describes **where** the void sits (`baseLine[0] + opening.offset × wallDir`) and **when** it is
rebuilt. It has never described **what shape it is**, because until now there was only one shape: the
void is `width × height`, implicitly rectangular, in every declaration
(`WallTypes.ts:34-44` · `WallDataSchema.ts:79-86`).

The founder's ask for **circular windows** and **round-arched doors** adds a shape axis to the void.
**The ruling on whether this repo's wall bodies can carry a non-rectangular void — measured
per-arm, with the refusal surface it creates — is
[C86 §10.1](C86-ELEMENT-WALL-OPENING.md).** It is normative and C15 defers to it.

Three consequences bind **this** contract:

- **The shape belongs to the VOID, hence to the HOST record, hence to `Opening`** — not to the door
  or window record. §1's split (the wall owns the void; the builder owns the frame) is what makes
  door and window share one profile vocabulary instead of minting two.
- **§5's drag constraint and §6's void invariant reason in `offset` and `width`.** C86 §10.1 PR-8
  keeps the bounding box `width × height` for **every** profile precisely so those two sections, and
  `WallOccupancyStore.canPlace`, continue to hold without learning a second dimension vocabulary.
- **The existing raked-host refusal is the PATTERN, not the exception.** A host that cannot carry a
  requested profile refuses by name, with the live alternative
  ([C16 CA-18](C16-COMMAND-AUTHORING-PROTOCOL.md)). ⛔ A silent fall-back to a rectangle is
  forbidden — it is the *"silently-wrong wall"* `WallRake.ts:102` names.

---

## §4 — Visual Tracking During Live Drag

`WallTransformController` (§2.10 BUG-A visual fix) handles the _live drag frame_ — before the drag-end store commit:

- During drag: translates the wallGroup and all door/window scene groups by the same XZ delta as the proxy handle. This is a **purely visual** update with no store mutations.
- The void geometry appears to follow because it is embedded in the wallGroup mesh (same Three.js transform). Floating-point parity with the frame mesh is not guaranteed during drag — only after the rebuild.
- On drag end: dual-write fires → rebuild runs → void is re-baked at the authoritative store position → all Three.js positions are snapped to the store-derived world position.

**Invariant**: The visual drag update (§2.10) and the store commit (§3 above) are complementary, not alternatives. Both MUST run on every wall drag.

---

## §5 — Hosted Element Drag Constraint

When the user selects a hosted element (door or window) and drags it:

1. `HostedElementDragController.activateFor(obj)` is called from the `bim-selection-changed` subscription in `registerTransformDragHandler.ts`.
2. TransformControls is configured to expose **only the local-X handle** (aligned with `wallDir`). The user can only translate along the wall axis.
3. `dragStartOffset` is read from `wall.openings.find(o => o.elementId === id).offset` (legacy store).
4. On drag end, `handleDragEnd()` computes:
   ```ts
   const projected = dot(worldPos − baseLine[0], wallDir);
   const newOffset = clamp(projected − width/2, 0, wallLength − width);
   ```
5. Fires `SetDoorOffsetCommand` / `SetWindowOffsetCommand` through `commandManager` (these commands are already fully legacy-store–authoritative; no F-1.2 dual-write needed).

**Clamping**: offset MUST satisfy `0 ≤ offset` and `offset + width ≤ wallLength`. `HostedElementDragController` enforces this clamp before committing.

---

## §6 — Opening Void Invariant (`_assertOpeningsChildrenInvariant`)

`WallStore.update()` calls `_assertOpeningsChildrenInvariant(wall)` before every mutation. This assertion verifies:

```
wall.openings.map(o => o.elementId).sort() ===  wall.childrenIds.sort()
```

**Consequence**: `UpdateWallBaselineCommand.execute()` will throw `OpeningsChildrenMismatchError` if these arrays diverge. This can happen if a hosted element was added/removed from `openings[]` but `childrenIds` was not updated in the same store transaction (or vice versa).

**Rule**: Any command that adds or removes a hosted element MUST update **both** `wall.openings` and `wall.childrenIds` in a single atomic `wallStore.update()` call. See `AddDoorCommand` and `RemoveWindowCommand` for the canonical pattern.

---

## §7 — Baseline Reversal Guard

`WallStore.update()` also calls `_assertNoBaselineReversal(prev, next)`:

```ts
if (dot(nextDir, prevDir) < 0) throw new BaselineReversalError(...);
```

where `prevDir = normalise(prev[1] − prev[0])` and `nextDir = normalise(next[1] − next[0])`.

**Consequence**: Pure translations (both endpoints shifted by the same delta) always produce `dot = 1.0` — the guard never fires. Rotations that cross 90° fire the guard. `UpdateWallBaselineCommand.canExecute()` enforces this check before adding the command to the undo stack.

---

## §8 — Commands That Mutate Hosted Element Positions

| Scenario | Command | Undo supported? | F-1.2 dual-write? |
|---|---|---|---|
| Wall moved (3D gizmo) | `UpdateWallBaselineCommand` | ✅ | ✅ (Fix R2, 2026-05-17) |
| Wall moved (plan-view move tool) | `UpdateWallBaselineCommand` | ✅ | ✅ (Fix R2-B, 2026-05-17) |
| Wall moved carrying neighbours | `CascadeWallBaselineCommand` | ✅ (single undo entry) | ✅ (Fix R2-B, 2026-05-17) |
| Wall moved (align tool) | `UpdateWallBaselineCommand` | ✅ | ✅ (Fix R2-B, 2026-05-17) |
| Hosted element dragged along wall | `SetDoorOffsetCommand` / `SetWindowOffsetCommand` | ✅ | ✅ See **§8.1 Dual-Store Rule** |
| Door/window added | `AddDoorCommand` / `AddWindowCommand` | ✅ | ✅ (C11 pattern) |
| Door/window removed | `RemoveDoorCommand` / `RemoveWindowCommand` | ✅ | — |
| Wall baseline set by AI command | `UpdateWallBaselineCommand` (bridged from bus handler) | ✅ | Bridge runs (no `_skipBridge`) |
| Wall baseline set by CRDT sync | `UpdateWallBaselineCommand` (bridged from bus handler) | ✅ (remote op is not undoable locally) | Bridge runs (no `_skipBridge`) |

### §8.1 — Dual-Store Rule for Offset Mutations (Fix DW-14, 2026-05-17)

Every command that mutates a hosted element's `offset` MUST write to **both**:

1. `wallStore.updateDoor()` / `wallStore.updateWindow()` — keeps `wall.openings[i].offset` authoritative for void geometry (consumed by `WallFragmentBuilder`).
2. `doorStore.update()` / `windowStore.update()` — keeps the standalone geometry store in sync so that `DoorBuilder.rebuildForWall()` / `WindowBuilder.rebuildForWall()` call `positionGroup()` with the **current** offset, not a stale value.

**Root cause of bug DW-14**: `SetWindowOffsetCommand` was written without the `windowStore.update()` call. When a user dragged a window to a new wall position, the opening void moved (wall mesh rebuilt from `wall.openings`) but the 3D window frame mesh stayed at the old offset (WindowBuilder read the stale `windowStore` value). The fix adds the missing `windowStore.update()` calls in both `execute()` and `undo()`, matching the existing pattern in `SetDoorOffsetCommand`.

**Enforcement rule**: Any new command or handler that calls `wallStore.updateWindow(id, { offset })` MUST also call `windowStore.update(id, { offset })` (guarded by `windowStore.has(id)`). Likewise for doors. A code-review checklist item must verify this pairing.

---

## §9 — Observability

Every `UpdateWallBaselineCommand.execute()` call (and `CascadeWallBaselineCommand`) MUST emit an OpenTelemetry span:

```ts
span.setAttribute('pryzm.wall.id', wallId);
span.setAttribute('pryzm.wall.openings.count', wall.openings.length);
span.setAttribute('pryzm.wall.rebuild.triggered', true);
```

`WallRebuildCoordinator` MUST emit a child span with:
```ts
span.setAttribute('pryzm.wall.rebuild.durationMs', elapsed);
span.setAttribute('pryzm.wall.rebuild.fragmentCount', fragments.length);
```

---

## §11 — Selection-Controller Ordering Invariant (R3-FIX, 2026-05-17)

**Rule**: In the `bim-selection-changed` event handler (`registerTransformDragHandler.ts`), `HostedElementDragController.activateFor()` MUST be called **last** among all controllers that share the same `TransformControls` instance.

**Why**: `WallTransformController.activateFor()` for a non-wall object calls `this.deactivate()`. When a wall was previously selected (`isActive = true`), `WallTransformController.deactivate()` calls:
- `transformControls.detach()` — removes TC from its prior object
- `transformControls.setSpace('world')` — resets the local-space constraint

If `hostedDragController.activateFor()` ran **before** wall/endpoint controllers, these calls would destroy the single-axis configuration that `hostedDragController` just applied. Running it last ensures it always wins.

**`HostedElementDragController.activateFor()` MUST call `transformControls.attach(obj)` explicitly** before `setSpace('local')` / `setGizmoAxes(true, false, false)`. This re-attaches TC to the hosted element after any prior `detach()` by other controllers.

**Canonical order in `registerTransformDragHandler.ts`**:
```ts
wallTransformController.activateFor(detail.object);     // may detach + reset TC
wallEndpointController.activateFor(detail.object);      // may modify TC state
hostedDragController.activateFor(detail.object);        // LAST — re-attaches + applies constraint
```

**LevelPlaneConstraint interaction**: `SelectionManager.applyHighlight()` skips `levelPlaneConstraint.attach()` for hosted elements (`isHostedHL` guard, lines 1187–1191). `LevelPlaneConstraint.onTransformChange` only activates when `lockedObj !== null`. Therefore the LPC will NOT re-enable the Y axis handle after `hostedDragController.activateFor()` sets `showY = false`.

**Violation consequence**: If the ordering is violated, the window/door gizmo will display in world-space with all three axes visible, and the user can drag the hosted element off its host wall baseline.

---

## §12 — Scene-Graph userData Contract for Hosted Element Frames

`DoorBuilder` and `WindowBuilder` MUST stamp the root `THREE.Group` with:

| Field | Value | Consumer |
|---|---|---|
| `userData.id` | `opening.elementId` (frozen, non-writable) | `SelectionManager.findSelectableRoot()`, `HostedElementDragController.handleDragEnd()` |
| `userData.elementType` | `'Door'` or `'Window'` (PascalCase, frozen) | `HostedElementDragController.isHostedElement()` normalises via `.toLowerCase()` |
| `userData.wallId` | `wall.id` | `HostedElementDragController.handleDragEnd()`, `WallTransformController` co-movement |
| `userData.levelId` | wall's `levelId` | Level-filtering, void-geometry rebuild |
| `userData.selectable` | `true` | `SelectionManager` fallback path |
| `userData.version` | `Date.now()` at build time | Stale-detection for rebuild skipping |

**Casing note (§WINDOW-AUDIT-2026 W10 / §DOOR-AUDIT-2026):** The canonical `elementType` is PascalCase (`'Door'`, `'Window'`). All consumers that perform equality checks MUST normalise via `.toLowerCase()` before comparing. `HostedElementDragController.isHostedElement()` already does this. Any new consumer MUST do the same. Do NOT change the stored casing — it is frozen.

Child meshes within the frame group MUST carry:
- `userData.elementType = 'Door'` / `'Window'` (mirrors root, PascalCase)
- `userData.role = 'geometry'`
- `userData.parentId = opening.elementId`
- `userData.selectable = false`

The `role: 'geometry'` + `parentId` combination triggers `SelectionManager.findSelectableRoot()` to jump directly to the parent frame group (via `PARENT_RESOLVED_ROLES` walk-up), bypassing the per-child raycasting problem.

**Plugin-path committers** (`WindowCommitter`, `DoorCommitter`) MUST set `userData.id`, `userData.elementType`, and `userData.wallId` in addition to `userData.elementId` and `userData.primitiveType` if their scene objects are to be selectable and constrainable via the hosted-drag pipeline.

---

## §13 — Plan-Tool Dispatch Resilience (Fix §DPT-HARDEN-2026 / §WPT-HARDEN-2026, 2026-05-17)

**Rule**: Every plan-tool handler that creates a hosted element MUST implement a dual-dispatch pattern: primary via `runtime.bus.executeCommand('wall.opening.create', ...)` with a fallback to `getCommandManagerBridge().execute(new CreateWallOpeningCommand(...))` when the bus is unavailable.

**Root cause of bug DPT-01 / WPT-01**: `DoorPlanToolHandler` and `WindowPlanToolHandler` previously dispatched creation exclusively via `runtime.bus.executeCommand()` using an optional-chain (`?.`). If `window.runtime?.bus` was `undefined` at click time (e.g. partial initialisation, WebSocket reconnect race), the optional-chain resolved to `undefined` and the creation silently no-op'd with no error or warning.

**Fix applied to**:
- `apps/editor/src/engine/views/plantools/DoorPlanToolHandler.ts` — §DPT-HARDEN-2026
- `apps/editor/src/engine/views/plantools/WindowPlanToolHandler.ts` — §WPT-HARDEN-2026

**Pattern**:
```ts
const _hasBus = !!(_runtime?.bus);
if (_hasBus) {
    _runtime.bus.executeCommand('wall.opening.create', { wallId, openingData })?.catch(...);
} else {
    const cm = getCommandManagerBridge();
    if (cm) cm.execute(new CreateWallOpeningCommand({ wallId, openingData }));
    else console.error('[...] FATAL: neither bus nor commandManager available');
}
```

Both paths produce identical results because the `wall.opening.create` E.5.6 bridge in `initBusHandlers.ts` is itself a thin wrapper over the same `commandManager.execute(new CreateWallOpeningCommand(...))` call.

**Audit reference**: `docs/archive/pryzm3-internal/ELEMENT-OPERATIONS-AUDIT-2026-05-17.md` §2, §3.3, §12.

---

## §10 — What is NOT in this contract

- How `WallFragmentBuilder` triangulates the wall mesh around openings → `SPEC-12-WALL-GEOMETRY.md`.
- The parametric profile (thickness, finish, structural vs non-structural) → C03 §3 (BIM schema).
- Level-dependent wall height resolution → `WallStore.resolveHeight()` and C05 §2.
- `IFC4X3` export of doors and windows embedded in walls → C05 §4.
- Plugin-contributed hosted element types (custom openings via plugin SDK) → C07 §3.
