# Session handoff — 2026-08-14 evening fleet (RAW LANE REPORTS)

> ⚠ **What this is.** Six lanes drafted ISSUE-LOG rows and handoffs into a session
> scratchpad because `docs/04-reference/ISSUE-LOG.md` was contended at the time. A
> scratchpad does NOT survive a session, so this file preserves them verbatim before
> they are lost. A doc lane was landing them properly as L-886+ when the session
> closed; **if those rows exist in ISSUE-LOG.md, THAT is canonical and this file is
> the raw source.** If they do not, this file is the only record.
>
> ⚠ **Numbers here are as-measured by each lane at its own commit** — re-run the gate
> before trusting any of them (C70 §0.2: the gate is right, the document is stale).


---

## SOURCE: `lane-s1-HANDOFF.md`

# LANE S1 — HANDOFF (C83 slice S1: a wall may not occupy a door/window)

**State: CLOSED for both gestures. Tree clean, root tsc 0 errors repo-wide, nothing pushed.**

Commits: `5b33c439` · `ffa5ffa1` · `80e72a75` · `46232e2d` · `5b0fcea0` · **`1e80e3a2`** (the MOVE slice).

---

## 1. Which gesture the founder hit

**A MOVE, not a create.** Their console for the reported sequence:
`[PlanDrag] wall drag started` → `EXECUTE: UPDATE_WALL_BASELINE` → `EXECUTE: CASCADE_WALL_BASELINE`
→ `[WallMoveReweldService] §MOVE-REWELD-DISPATCH` → `§GR12-BOUNDARY-INVALIDATION`.

That is L-885 — the gap the create slice deliberately named rather than half-wired. Now closed.

---

## 2. The chokepoint (this is the load-bearing finding — do not re-derive it)

All four `wall.updateBaseline` dispatch sites — `registerTransformDragHandler:202`,
`elementMove.ts:103`, `AlignPlanToolHandler:342`, `MovePlanToolHandler:538` — funnel into **one**
command. `plugins/wall/src/handlers/UpdateWallBaseline.ts` is documented as *"Maps bus type
wall.updateBaseline to the legacy UpdateWallBaselineCommand"* and bridges at `:122`.

So enforcement lives in **`UpdateWallBaselineCommand.canExecute`** (+ `CascadeWallBaselineCommand`
for carried neighbours, atomic), not at four tool sites. Both hold `ctx.stores.wallStore` — the
authoritative store carrying openings from BOTH the 3D and plan placement paths.

**Refuse vs warn — settled as REFUSE, on evidence:** the `OPENING_DOES_NOT_FIT` arm three lines
above the new one has refused moves at this exact seam for months. And at drag-end the store still
holds the PRE-drag baseline (`oldStart` is read from it), so declining costs a mesh snap-back and
nothing else — no half-applied move, no missing undo entry.

---

## 3. Coverage

| Path | Enforced | Surfaced |
|---|---|---|
| Plan drag (`MovePlanToolHandler`) | ✅ command + pre-commit gate | ✅ card + toast |
| 3D gizmo (`registerTransformDragHandler`) | ✅ command + pre-commit gate | ✅ card + toast, **mesh snapped back** |
| `elementMove.ts:103`, `AlignPlanToolHandler:342` | ✅ via the command | ⚠ console only |
| Carried neighbours (cascade) | ✅ atomic | ⚠ via the dragged wall's message |
| AI / CRDT-sync callers | ✅ via the command | n/a |

The two ⚠ rows are enforced but not card-surfaced. They are secondary gestures (align, generic
element move); adding `gateWallMove(...)` at each is a one-line change if wanted.

---

## 4. ⚠ TWO CORPUS REFUTATIONS — read these before touching the geometry

C83 §5.1(4) demands running a new rule over existing corpora. It fired twice on **known-good**
fixtures. Both were real defects in my geometry, fixed at the MODEL, not tuned:

1. **`§CORNER-JOIN-IS-NOT-A-CROSSING`** — `hostedOpeningHostMoveSeam` §Z-5 refused an ordinary move
   because the door and the moving wall overlapped by 0.100 m. That overlap is real and is **the
   mitre zone**: two walls meeting at a corner necessarily overlap by a half-thickness. Without the
   guard, every corner of every rectangular room is a latent violation. Fix restores what C83 §8
   Slice 4 originally specified (*"merely touching an endpoint → zero"*), which my footprint clip
   had traded away for thickness-awareness. **Narrow: shared ENDPOINT only**, so a T-junction into
   the middle of a host — the founder's actual case — is still refused.
2. **`§PRE-WELD-TRANSIENT`** — subtler. A move commits in TWO commands: Update moves the wall,
   Cascade then RE-WELDS neighbours. Validation runs at `canExecute` on the FIRST, so neighbours
   are still at their old, about-to-be-corrected length. §Z-5 was refused for crossing a door on a
   `w-west` that was momentarily still 6 m long; after the cascade it is 4 m and the walls are
   joined. **The refused state never persists.** `CandidateWall.currentBaseLine` now excludes hosts
   joined at the subject's present pose.

Both have named regression controls in `packages/geometry-wall/__tests__/WallCrossesOpening.test.ts`.

---

## 5. ⚠ OPEN — CREATE paths that bypass the three create seams (NEW, from a 26-tool audit)

The create fix is **not** universal. Measured, user-reachable, ungated:

- **`CopyElementCommand` / `MirrorElementCommand` / `OffsetElementCommand`** — direct
  `wallStore.add()` writes, wired live via `DockingLayout.ts:155-158,168-171` and
  `ContextualEditBar.ts:29-42`. **Offset a wall 0.1 m across a door and it lands.** Highest-value gap.
- `CopyPlanToolHandler.ts:268` (paste), `PreviewManager.ts:311` (AI accept),
  `OpenedRegionProposal.ts:225` (AI offer) — all dispatch bus `wall.create`, which is **not** a
  chokepoint: `plugins/wall/src/handlers/CreateWall.ts` `canExecute` has no spatial gate.
- `wall.batch.create` — **zero seams**.
- `CreateWallBetweenMarksCommand` — direct store write, separate class, seam 3 does not apply.
- `wall.createFromSlab` — `WallTool.ts:1681` returns at `:1693` before `createWall()`, bypassing seam 2.
- `plugins/wall/src/tool.ts:329,348,373` — a third interactive tool, ungated, currently **not
  registered in production** — latent, becomes live the moment anyone registers it.

**ONE NEXT STEP (highest value): put the spatial gate in `plugins/wall/src/handlers/CreateWall.ts`
`canExecute` and `CreateWallBatch.ts`** — that collapses most rows at once. ⚠ Blocked by L-883:
`plugins/wall` has no `@pryzm/geometry-wall` dependency, so this needs a package.json + lockfile
change (frozen-lockfile CI risk) OR a re-export through `@pryzm/command-registry`, which
`plugins/wall` already depends on. The re-export is the cheaper route and avoids the lockfile.

Then separately gate Copy/Mirror/Offset, which never touch either verb.

---

## 6. ⚠ NOT MINE, but blocking: root tsc was RED at HEAD earlier today

`packages/geometry-slab/src/SlabDependencyTracker.ts(309,32) TS2367` — a **committed** error from
another lane (clean in my tree). It is gone from the final run, so either they fixed it or it was
transient. **Re-run root tsc before deploying** — memory records that a red root tsc hard-fails Fly.

Also: `packages/command-registry/__tests__/hostedOpeningHostMoveSeam.test.ts` is **untracked**
(another lane's in-flight file). It is currently 9/9 green with my changes.

---

## 7. What the founder will see now

Drag a wall onto a door, plan or 3D: **the wall does not move.** A panel appears headed
**THIS WALL CANNOT GO HERE**, naming the door element id, its host wall, both intervals and the
overlap, then *"positions that ARE clear"* with two concrete distances — Dismiss only, no Confirm.
A red toast reads *"Wall not placed — it would cut through a door."* In 3D the mesh snaps back to
where the model still says it is.

Moving a wall anywhere legal is completely silent.


---

## SOURCE: `lane-s1-issue-log-rows.md`

# LANE S1 — proposed ISSUE-LOG rows (NOT written directly; docs/04-reference/ISSUE-LOG.md is contended)

Orchestrator: please append. Four rows — one CLOSED, three NEW findings.

---

## L-NNN — CLOSED — a new wall could be drawn straight through an existing door or window

**Reported:** founder, live production build `a75e8e1e`, 2026-08-14, with screenshot.
Verbatim: *"also the wall can be placed in front of a door still: which it should not"*.
Earlier statement of intent: *"a interior wall can not be in the same place where a window is —
this should be flagged — in the AI chat RAC again — and ask the user do you want to move the wall
upwards or backwards? the wall should never be in this position - same with a door"*.

**Root cause (measured, not inferred).** `WallOccupancyStore.canPlace(wall, offsetM, widthM)` takes
ONE wall and compares a span against THAT wall's own `openings[]`. All ~12 production call sites are
opening-side (create an opening, move a door, set an offset). A NEW WALL arriving at a wall that
already holds a door is **not expressible in that signature**, so no arm could fire. Two executed
controls pin the prior state (`§PRIOR-ART-SILENCE` in
`packages/geometry-wall/__tests__/WallCrossesOpening.test.ts`): the only pre-existing wall-side
instrument, `planOpeningRefit`, returns `ok:true` / 0 refusals for the offending candidate (a
correct answer to "do MY openings still fit?", and no answer at all to "am I driving through
SOMEONE ELSE'S door?"), and `canPlace` on the new wall returns `valid` because the new wall's
opening list is empty.

**Fix.** C83 slice S1. New pure L2 predicate `packages/geometry-wall/src/WallCrossesOpening.ts`;
`CanPlaceRefusalCode` extended 6 → 7 with `OCC_CROSSES_HOSTED_OPENING` (C83 §1.4 — extends the
existing union, mints no rival); enforced at three seams; surfaced on the ConfirmationCard + toast
(plan) and the tool instruction bar (3D). Second ENFORCEMENT row added to the C74 §2 protected
table in the same change.

**Commits:** `5b33c439`, `ffa5ffa1`, `80e72a75`, `46232e2d`.
**Tests:** 31 predicate + 9 surfacing, executed, including six silence controls.

---

## L-NNN — NEW — C83 §8's Slice S0 is NOT "two lines"; its mandated import does not exist

C83 §8 Slice 0 says to call `canPlace` + `canPlaceRefusalText` in
`CreateWallOpeningLegacyAdapter.canExecute`, *"exactly as the sibling handler
`plugins/wall/src/handlers/CreateWallOpening.ts:128` already does one file away"*, and warns
**"⚠ Import from `@pryzm/geometry-wall` — NOT the drifted plugin copy at
`plugins/wall/src/occupancy.ts`"**. Three measured facts contradict the estimate:

1. **`plugins/wall` has no `@pryzm/geometry-wall` dependency.** Its full set is
   `immer`, `three`, `ulid`, `@pryzm/plugin-sdk`, `@pryzm/command-registry`. **No plugin in the
   repo depends on `geometry-wall`** (`grep -l geometry-wall plugins/*/package.json` → empty), and
   `@pryzm/plugin-sdk` re-exports none of it. The mandated import therefore requires a
   `package.json` + `pnpm-lock.yaml` change — a known frozen-lockfile CI breaker.
2. **The cited precedent is the thing being forbidden.** `CreateWallOpening.ts:128` imports
   `wallOccupancyStore, canPlaceRefusalText, CanPlaceRefusalCode` from **`../occupancy.js`** — the
   drifted plugin-local copy the very next sentence warns against. So "do it like the sibling
   handler" and "do not use the local copy" are mutually exclusive as written.
3. It would move a governed number: `check-layer-boundaries` counts `plugin → geometry-wall` as an
   **sdk-bypass**, currently `171/182`. Headroom exists (it would pass at 172), but the ratchet is
   shrink-only and this would push it the wrong way.

**Left untouched deliberately** — it is not the founder's reported defect, and a lockfile change
immediately before an urgent deploy is the wrong risk. C83 §8 Slice 0 should be re-costed.

---

## L-NNN — NEW — `CommandManagerImpl:213`'s comment claims a surface that does not exist

The comment reads: *"The tools render `result.info[0]` straight into the operation overlay, so the
token was what the founder saw."* **Measured: no tool does.** Every consumer of `result.info`
outside the AI panels sends it to the console — `ColumnTool.ts:236`, `LiftTool.ts:219`,
`OpeningTool.ts:473`, `DoorSection.ts:61` are all `console.error` / `console.warn`.

Consequence: the L-813 fix (prefer `blockingIssues[0]`, a human sentence, over `reason`, a machine
token) improved a string that, for these tools, still reaches only devtools. Any future work that
assumes a `canExecute` refusal is user-visible on the legacy command path is assuming a surface
that is not there. This lane gave both wall-creation gestures a real surface of their own rather
than relying on it.

---

## L-NNN — NEW — wall MOVE into an opening is uncovered, and is NOT reachable through the same chokepoint

The predicate already supports it — `CandidateWall.id` excludes the subject from its own host list,
and the self-move silence case is executed
(`"a wall does not violate ITSELF when its own baseline is re-proposed"`). Only the wiring is
missing, and it was left rather than half-wired because the move path is structurally different:

- `wall.updateBaseline` is dispatched from at least four places (`registerTransformDragHandler:202`,
  `elementMove.ts:103`, `AlignPlanToolHandler:342`, `MovePlanToolHandler:538`);
- the bus handler lives in `plugins/wall`, which has the same missing-dependency and
  Immer-draft-blindness problems as `CreateWall` (see the S0 row above);
- `MovePlanToolHandler` already routes through `ConfirmationFlow` with plan-hash binding, so
  injecting a refusal means teaching `WallMoveConsequencePlanner` to emit it — which touches an
  approval-bound path governed by `check-approval-binding` and `check-plan-determinism`.

That is a follow-up slice with its own tests, not a line in this one.


---

## SOURCE: `laneF-C83-S5-handoff.md`

# LANE F HANDOFF — §C83-S5, floor-finish spatial validity

**Commits (NOT pushed):** `af430f34` (predicate + command seam) · `72d24912` (the user-facing surface + wiring)
**Root tsc:** `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck` → **exit 0, zero output**, run after both commits.
**Tree:** clean of Lane F. Every remaining `M` belongs to another lane.

---

## 1 — SHIPPED: slice (A), the refusal, end to end

The founder's wrong workflow is stopped. Drawing a second floor finish over an
area that already has one is now **refused**, and the refusal **reaches a person**
— proven by DOM assertions, not by a return value.

| Layer | File | What |
|---|---|---|
| L2 predicate (pure) | `packages/command-registry/src/floors/FloorRegionOverlap.ts` **NEW** | `evaluateFloorFinishPlacement` · `floorRegionRefusalText` · closed `FloorRegionRefusalCode` (`FIN_REGION_ALREADY_FINISHED`) + roster + `Exclude<>` completeness assert + `Record<>` sentences + `FIN_UNIDENTIFIED` · typed `FloorRegionUndeterminedReason` · `MIN_REPORTABLE_FLOOR_OVERLAP_M2 = 0.01` |
| L2 chokepoint | `packages/command-registry/src/floors/CreateFloorCommand.ts` | `canExecute` backstop arm, evaluating the **resolved** (post-L-240 inset) ring. Suppressed on restore + generation |
| L7 surface | `apps/editor/src/engine/consequence/floorFinishGate.ts` **NEW** | `gateFloorFinishPlacement` → `ConfirmationCard.showSpatialRefusal` + `showToast`; `surfaced` returned as data; failure counter |
| L7 card | `apps/editor/src/ui/consequence/ConfirmationCard.ts` | `SpatialRefusalWording` — per-rule sentences, defaulting to the wall wording so §C83-S1 is untouched |
| L2 tool | `packages/geometry-slab/src/floor/FloorTool.ts` | injected `FloorPlacementGatePort` (L2 must not import L7) |
| L7 wiring | `apps/editor/src/engine/initTools.ts:~533` | `gateFloorPlacement: (c) => gateFloorFinishPlacement(c)` |
| L7 plan parity | `apps/editor/src/engine/views/plantools/FloorPlanToolHandler.ts` | same gate, asked **before** the modal opens |

### What was built ON (nothing authored from scratch)
- **`intersectPolygons2D`** (`@pryzm/geometry-kernel/pure/polygonBoolean`, GE-05) — the repo's only oracle-pinned 2-D boolean. It *refuses* on self-intersecting input (→ C83 §5.3 silence-on-undetermined comes free) and treats sub-`COINCIDENT_M` overlap as **no** overlap by declaration (→ two edge-sharing finishes are silent, free).
- **`CanPlaceRefusalCode`'s structure**, adopted wholesale per C83 §1.4.
- **`wallPlacementGate.ts`** (§C83-S1, landed earlier today) — copied as a *pattern*, and its two channels reused rather than a fifth surface minted.
- **`CreateFloorCommand._resolveBoundary`** — so the command checks the ring the model would actually hold.

### Executed results
| Suite | Result |
|---|---|
| `packages/command-registry/__tests__/floorRegionOverlap.test.ts` | **22/22** |
| `apps/editor/__tests__/FloorFinishGateSurfacing.test.ts` (happy-dom) | **15/15** |
| `apps/editor/__tests__/WallPlacementGateSurfacing.test.ts` (regression, §C83-S1) | **16/16** |
| `consequenceUiXssEscaping` + `curvedRoomFloorCeilingParity` + `floorFinishInnerFaceAllPaths` + `floorTypeSwap` | **25/25** |
| `floorDeleteLeavesGraphEdges` + `roomFinishBoundaryHostAttribution` | **36/36** |

**SILENCE tests (C83 §5.1(2)) — 15 across the two suites, six of them at the SURFACE:**
room with no finish → nothing · adjacent finish sharing an edge → nothing ·
separated by a partition thickness → nothing · another level → nothing · far away
→ nothing · **a finish's OWN boundary re-proposed → nothing** (without this, the
§C79-5.2 follow-the-wall re-projection would break the day this shipped) ·
one tolerance below the declared floor → nothing · self-intersecting existing
finish → **undetermined, silent, not a refusal**.

### What the founder will see
Drawing a second finish where one exists: a red panel headed
**"THIS FLOOR AREA ALREADY HAS A FINISH"**, naming `"Oak plank"` and its element
id, stating **both numbers** ("already covers 10.000 m² of the 10.000 m² you are
drawing (100 %)"), carrying `[FIN_REGION_ALREADY_FINISHED]`, explaining that two
finishes cannot cover one area — and offering, **in words, never as a button**
(C83 §4.3), their own alternative: *change the finish that is already there*.
Plus an error toast. **No Confirm control**, because an IMPOSSIBLE finding has
nothing to approve (C83 §5.4). Drawing in a room with no finish: completely silent.

---

## 2 — NOT SHIPPED: slices (B) the split, (C) the clash. Here is exactly where to start.

### The measurement that matters (from a full-repo survey this session)

> **A floor finish follows WALLS, not ROOMS.** `FloorHostDependencyTracker`
> (`packages/finish-host-tracker/src/`) subscribes to wall updates and writes
> `UpdateFloorBoundaryCommand`; the "§C79-5.2 resized … 88.353 m² → 61.363 m²"
> log the founder saw comes from `FinishHostDependencyTracker.reportAndWrite:289`.
> **Nothing anywhere re-derives `FloorData.boundary.polygon` when the ROOM SET
> changes.** That is the whole of the founder's bug: rooms went 3 → 4, correctly,
> and the finish was never asked about it.

The split signal **already exists and is already published**:
- `RoomTopologyObserver` (`packages/room-topology/src/RoomTopologyObserver.ts`) debounces wall edits and dispatches `ReDetectRoomsCommand`; it captures `before` and computes a diff at `_reportOpenedRegions(levelId, before)`.
- `OpenedRegionDetector` → `openedRegionNotifier` (`:721`) is the **existing, live** "the room set changed → tell someone" channel.
- Its only consumer, `apps/editor/src/ui/ai/OpenedRegionProposal.ts` (installed at `initTools.ts:2263`), is a **proven propose→consent surface** that speaks through `chatConfirm` and dispatches ONE bus command.

**So slice (B) is a sibling of a shipped mechanism, not new machinery.** ⚠ But the
first thing to verify is whether that notifier fires on a *split* (one room → two)
or only on a *merge/opening*. That is one executed probe and it decides the design.

### The two decisions I owe an argument on, argued

**(i) Is SPLIT a sixth C79 §5.2 outcome, or a form of `regenerated`?**
**It is its own outcome.** All five existing states (`preserved` / `resized` /
`regenerated` / `conflicted` / `undetermined`) preserve element identity **1 : 1** —
one finish in, one finish out. A split changes **cardinality**: one element
becomes N. Folding it into `regenerated` would make "regenerated" mean two
different things (same element, new geometry) vs (one element, N elements), and
every consumer that today assumes a verdict describes *one* record would silently
mis-handle it. Name it `split` and give it `{ survivorId, newIds[] }`.
⚠ **Coordinate, do not collide:** `packages/geometry-slab/src/slabRecomputeVerdict.ts`
and `packages/geometry-slab/__tests__/c79RecomputeStates.test.ts` landed this
session (`445e7650`) and are that channel's owner.

**(ii) Does the original finish survive, or do both fragments get new ids?**
**The original MUST survive as one of the fragments** — the one with the largest
resulting area, deterministically tie-broken. Three reasons in order of force:
1. **C70 C-INV-3 / references.** `hostRoomId`, `coveredRoomIds`, `hostSlabId`, the
   sketch's `boundingWallIds`, IFC GUID, any annotation or schedule row pointing at
   the finish — deleting the id invalidates all of them at once, and there is no
   reader that would refuse rather than silently read `[]`.
2. **Undo.** If the original is destroyed and two new ones minted, Ctrl+Z is a
   *re-creation*, not a restoration: the IFC GUID changes and the provenance chain
   breaks. If it survives, undo is a boundary restore plus one delete — the shape
   `UpdateFloorBoundaryCommand` already has an inverse for.
3. **Honesty.** The user drew ONE finish. Reporting "your finish was replaced by
   two new ones" is a different, larger claim than "your finish now stops at the
   new wall, and the other side got a matching one".

**Automatic or proposed?** I argue **automatic, and it is defensible**: the founder
was explicit that both fragments carry *the same finish* ("both with the same
finish"), so the operation is **information-preserving and non-destructive** — no
user choice is being guessed at. That is materially unlike C83's INADVISABLE
offers, where the system would be substituting its judgement for the architect's.
⚠ **But it must obey C83 §4.1.1 / ADR-0314:** `runBatch` is undo-NEUTRAL, so a
split that fans out to N commands makes N history entries. Either coalesce it into
one gesture (`§L-874-ONE-UNDO`) or state N. Claiming "one undo" for a fan-out is
named as an anti-pattern in C68 §7.f.

### THE ONE NEXT STEP
**Probe whether `openedRegionNotifier` (or `RoomTopologyObserver`'s room diff)
fires on a room SPLIT, and what it carries.** One executed probe. If it carries
the before/after room sets, slice (B) is a `FloorSplitOnRoomSubdivision` reactor
sitting beside `FloorHostDependencyTracker` — same package, same command
(`UpdateFloorBoundaryCommand` for the survivor + one `CreateFloorCommand` per new
fragment, inheriting `systemTypeId` + `layers` + `finishSpec` verbatim). If it
does not, the signal has to be added at `RoomTopologyObserver`, and that is a
larger and different piece of work.

### Slice (C), the clash
Once (B) lands, (C) largely follows: a finish that stops at the new partitions no
longer runs through them. **Do NOT ship a standalone "finish crosses a wall"
detector first** — I considered it and rejected it: a structural floor
legitimately runs under every wall, and only a *finish* is inset to inner faces
(L-240). A rule that cannot tell those apart would fire on correct models, which
is C83 §5's disqualifying failure. Pre-existing finishes authored before this
change still clash; they are healed by (B) plus a one-shot migration, not by a
new refusal.

---

## 3 — PROPOSED ISSUE-LOG ROWS
`docs/04-reference/ISSUE-LOG.md` is contended; highest row was **L-885**. These are
proposed, not written. Numbers may need bumping.

**L-886 — A FLOOR FINISH FOLLOWS WALLS BUT NOT ROOMS; SUBDIVIDING A ROOM LEAVES THE FINISH SPANNING THE NEW PARTITIONS.** *(open · C79 §5.2 · C83)*
Founder, build `46232e2d`: *"in an area with a floor finish already in place the
user creates two internal partitions - this is fine - in this moment - we have
created a new room and therefore - the floor finish should have been 'divided'
from a big room floor finish to two independent floor finish elements - both with
the same finish … current wrong workflow: the user creates the two internal
partitions - fine - the floor runs through them (meaning clashes - this is not
correct and in BIM 3.0 there should be consciousness to avoid this)"*.
**Measured:** `FloorHostDependencyTracker` subscribes to WALL updates and
re-projects via `UpdateFloorBoundaryCommand` (their log shows it working:
`88.353 m² → 61.363 m²`). **No subscriber anywhere re-derives
`FloorData.boundary.polygon` from a change in the ROOM SET.** Their log shows
`[RoomDetectionEngine] Detected 4 room(s)` — the information existed and nothing
consumed it. **Not fixed.** Design + the identity/undo argument: this handoff §2.

**L-887 — TWO FLOOR FINISHES COULD BE CREATED OVER ONE FLOOR AREA, SILENTLY.** *(FIXED `af430f34`+`72d24912` · C83 §1.1 IMPOSSIBLE)*
Same report: *"then the user tries to create a different floor finish in the room -
and creates an overlapping one - wrong!"* Their log: `EXECUTE: CREATE_FLOOR →
[FloorTool] Floor created: 885eadf8-… with 4 vertices` — a rival finish over an
area that already had one, with no check and no message. **Root cause:** no
creation path asked the question. **Fix:** `FloorRegionOverlap.ts` (pure predicate
on the GE-05 boolean) + a `CreateFloorCommand.canExecute` backstop + `floorFinishGate.ts`
carrying the refusal to the `ConfirmationCard` and a toast, wired into BOTH the 3D
tool and the plan handler. 37 executed assertions, 15 of them silence controls.
⚠ **Pre-existing overlapping finishes in saved projects are NOT healed** — the gate
is suppressed during restore by design (a rule introduced today may not
retroactively refuse yesterday's documents).

**L-888 — `CommandResult.info[0]` STILL REACHES NOBODY; EACH NEW REFUSAL PAYS FOR ITS OWN SURFACE.** *(open · L-884's sibling)*
`CommandManagerImpl:217` carefully prefers `blockingIssues[0]` over `reason`
(L-813) so a human sentence survives — and **no tool renders `result.info[0]`**.
Both §C83-S1 and §C83-S5 therefore had to build their own carrying module. That is
two copies of the same seam, and the third will be a third. The structural fix is a
tool-side renderer for `CommandResult.info[0]`; until then every ENFORCEMENT rule
costs a gate module, and **a rule that skips it ships as a dead click** (C11 §7.6).

---

## 4 — PROPOSED C83 AMENDMENTS (report only; C83 is fenced / its author may be mid-edit)

**§1.4, new clause 1a** — after clause 1 (wall-side codes join `CanPlaceRefusalCode`):
> **1a.** Codes for an IMPOSSIBLE conflict that is **not** a wall-span question get
> their **own closed union**, structurally identical to `CanPlaceRefusalCode`
> (closed union · value roster · `Exclude<>` completeness assertion · `Record<>`
> default sentences · one renderer carrying the code · an `*_UNIDENTIFIED` name for
> a refusal that arrives without one). Clause 1's argument — *"the same question
> about the same volume asked from the other side"* — does not transfer: every
> `OCC_*` member is a 1-D span on ONE wall and `canPlace(wall, offsetM, widthM)`
> cannot express a 2-D region. The first instance is `FloorRegionRefusalCode`
> (`FIN_REGION_ALREADY_FINISHED`). This is not a rival vocabulary; it is the same
> pattern applied to a different question, which is what §1.4 asks for.

**§8, new Slice 5 (SHIPPED)** — `FIN_REGION_ALREADY_FINISHED`, ENFORCEMENT.
Independent of Slices 0/1/C/3/4. **Cheaper than Slice 4 was**, and the reason is
worth recording: it needed **no new geometry** (GE-05's boolean), **no new offer
computation** (the alternative is "change the one that is there" — defensible
without search), and **no missing trigger** (the tools call the gate directly,
so `wireToolForConsequencePreview`'s zero callers never mattered). ⚠ It DOES
carry the §1.1.1 cost: **a third row in C74 §2's protected ENFORCEMENT table**
(`canPlace`, `evaluateWallPlacement`, `evaluateFloorFinishPlacement`) — C74 is
fenced this session and was **not** edited. **That row is owed.**

**§9, gate coverage** — `check-design-logic-silence` (still UNBUILT) would now have
two families to walk. Both ship their negative controls in-repo
(`floorRegionOverlap.test.ts`, `FloorFinishGateSurfacing.test.ts`); the gate that
asserts *every registered rule has one* does not exist, so per C70 §7.1 that
property is **UNPROVEN by gate**, held only by convention.

---

## 5 — DEBTS AND CAVEATS, stated rather than buried
1. **C74 §2 row is OWED** (above). C74 was fenced; this must not be forgotten.
2. **C67/C68 not triggered, checked deliberately.** No bus verb was minted, no
   chat capability registered, no user-visible *attribute* added — this is a
   refusal on an existing verb (`floor.create` / `CREATE_FLOOR`). C69's
   `API-VERB-REGISTER.md` therefore needs no row. **If a later slice adds a
   "split the finish" verb, C68 §5's a–j checklist applies in full.**
3. **The 3D tool's gate is very slightly EAGER, never lax.** `FloorTool` passes the
   pre-inset centreline ring for `AUTO_FROM_ROOM`; `CreateFloorCommand` checks the
   resolved ring. This cannot produce a false refusal between adjacent rooms (the
   neighbour's stored finish already stops half a wall thickness short of the
   shared centreline — covered by an executed silence test), but the two arms are
   not byte-identical and that is recorded rather than hidden.
4. **No whole-project baseline run** (C83 §5.1(4)). The rule was not executed over
   the generated-building corpus. It is suppressed during generation, so
   generators cannot trip it — but the corpus run is the evidence §5.1(4) asks
   for and **it was not done**.
5. **Not covered:** the split (B) · the pre-existing clash (C) · finishes vs
   *ceilings* (`CreateCeilingCommand` has the identical shape and no such gate —
   an obvious, cheap follow-up: the predicate is element-agnostic) · overlap
   across levels (correctly out of scope) · healing already-saved overlaps.


---

## SOURCE: `lanez-issue-log-rows.md`

# LANE Z — rows for docs/04-reference/ISSUE-LOG.md (FENCED file; orchestrator to append)

## L-8xx — CascadeWallBaselineCommand had NO hosted-opening gate (CLOSED this session)

**Status:** CLOSED — fix committed with the seam test that proved it.
**Contract:** C15 §2 / §5 / §6, C11 §5.4, C70 C-INV-3.
**Proof:** `packages/command-registry/__tests__/hostedOpeningHostMoveSeam.test.ts`
(9/9 green; was 5 pass / 4 fail).

`packages/command-registry/src/walls/CascadeWallBaselineCommand.ts` — the ONE
chokepoint every structural wall cascade passes through (its own class doc,
C11 §5.4 shape) — wrote `baseLine` on walls and asked **nothing** about the
openings hosted on them. `UpdateWallBaselineCommand` has asked
`planOpeningRefit` since §FIX-WALL-SHRINK-REFIT (W2-1). The cascade never did.
L-871/L-872 made this reachable in production this week: joined neighbours now
re-weld, so a host wall can change LENGTH from a gesture aimed at a different
wall.

Four measured defects, all EXECUTED:

| Probe | Gesture | Measured before fix |
|---|---|---|
| §Z-3a | drag north wall outward 2 m; west wall extends 4→6 m **at baseLine[0]** | door world position (0, 2.55) → (0, **4.55**) — slid 2.00 m across the room |
| §Z-3b | same gesture, doors on both east and west walls | east door moved **0 m**, west door moved **2 m** — outcome decided by stored endpoint ORDER, which the user cannot see |
| §Z-4a | drag north wall inward 2 m; east wall 4→2 m | 0.9 m door recorded spanning [3.000, 3.900] on a **2.000 m** wall (C15 §5) |
| §Z-4c | drag north wall inward 3.5 m; east wall 4→0.5 m | 0.9 m door recorded on a **0.500 m** wall — no clamp, no refusal, no event |

**Fix:** `WallOccupancyStore.planOpeningRebase` (new, PURE, geometry-wall L2)
adds the ANCHOR SHIFT the refit gate cannot know (it never sees the previous
baseline), then delegates to the unchanged `planOpeningRefit` policy.
`CascadeWallBaselineCommand` asks it in `canExecute` (the channel
`WallMoveReweldService` already logs) and re-asks in `execute`; relocations go
through `updateOpening` inside the §L-871 latch; `relocated` records the
PRE-EDIT opening so undo restores the AUTHORED offset.

---

## OPEN — NOT fixed, out of Lane Z's window (needs its own row)

### Z-OPEN-1 — the DIRECT endpoint drag has the same baseLine[0] slide

`UpdateWallBaselineCommand` (`packages/command-registry/src/walls/UpdateWallBaselineCommand.ts:247`)
asks `planOpeningRefit`, **not** `planOpeningRebase`. So the identical §Z-3
defect is still reachable through the DIRECT gesture: drag a wall's
`baseLine[0]` endpoint along the wall's own axis (WallEndpointController) and
every opening on that wall slides by the drag distance, because `offset` is
measured from the endpoint that moved (C15 §2).

The seam test does not cover it — every §Z row reaches the wall through the
cascade — so this is UNMEASURED, not proven. It is a one-line swap
(`planOpeningRefit` → `planOpeningRebase`, same return type, same policy), but
it was deliberately left out of this commit because it changes the behaviour of
a command with an existing suite (`wallShrinkOpeningRefit.test.ts`) that Lane Z
had no window to re-run and reason about. **Do not ship the swap without a
probe row for the direct endpoint drag first.**

file:line — `packages/command-registry/src/walls/UpdateWallBaselineCommand.ts:156`
(canExecute gate) and `:247` (execute gate).

### Z-OPEN-2 — an atomic cascade refusal leaves the topology unwelded

When one entry's opening cannot survive, the whole cascade is refused (correct
per the class's all-or-nothing contract and per `planOpeningRefit`'s "refuse the
WALL edit, never damage the opening" policy). But the DIRECT move that triggered
the cascade has already committed. Net effect for the founder: drag the north
wall hard inward past a door's survivable limit and the north wall moves while
its neighbours stay put — a visibly open loop, with a `console.warn` and no
toast.

`UpdateWallBaselineCommand` toasts on its equivalent refusal
(`window.showAppToast`, :260). The cascade does not, because it is dispatched by
a service reacting to a store event, not by a user gesture — there is no obvious
owner for the message. **Open question for the founder / next lane:** should the
originating move be refused too (one gesture, one verdict), or should the
cascade refusal surface its own toast?


---

## SOURCE: `lane3d-issuelog-rows.md`

# LANE 3D — proposed ISSUE-LOG rows (fenced file; orchestrator to merge)

## Row 1 — the founder defect (OPEN, narrowed, NOT fixed)

| L-NN | 3D viewport stale after a wall move; an unrelated later edit (window create) makes it snap to the correct place | **OPEN — root cause NARROWED, not closed** | 2026-08-14 |

Founder, live build `46232e2d`: *"user moves a wall in 3d — in plan view renders correctly,
but seems like the 3d environment did not catch up with the change"*, then the differential:
*"once the user creates a window on the wall — in plan view — the wall in 3d comes to the
updated place — correct"*.

**REFUTED (with a test, commit `3bc832b1`):** the `ViewDependencyTracker`
"+4 deferred inactive" lead. `_getAffectedViews()` skips `viewType === '3d'`
unconditionally (`packages/core-app-model/src/views/ViewDependencyTracker.ts:850-851`;
repeated defensively at `apps/editor/src/engine/initScene.ts:1110`). A 3D view is never
dirtied, never deferred, never force-projected. The four deferred views are the L-110
default elevations. The split-view secondary pane is Canvas2D-only
(`apps/editor/src/engine/views/SplitViewManager.ts:1-23`) and registers no 3D pane with the
tracker. Pinned by `packages/core-app-model/src/views/__tests__/threeDViewIsNeverTracked.test.ts`.

**Where the fix must live — and the open question.** The 3D viewport draws the live THREE
scene. The plan projection is built by `nativeElementMeshExporter.exportForView()`
(`apps/editor/src/engine/initScene.ts:1219`), which proxies **the live scene meshes**
(`packages/core-app-model/src/geometry/NativeElementMeshExporter.ts:45-56`). The plan was
CORRECT after the move ⇒ at plan-projection time the moved wall's scene mesh was already at
the new position ⇒ this is **not** simply "the mesh rebuild never fired". The unresolved
question is why the 3D canvas nonetheless shows the OLD wall. Two candidates, neither
excluded, both cheap to discriminate with one live probe:
  (a) a stale/orphaned previous wall group left in the scene alongside the rebuilt one
      (`WallFragmentBuilder._disposeWallGroupChildren`,
      `packages/geometry-wall/src/WallFragmentBuilder.ts:894-897`, `:805`);
  (b) the founder's 3D surface is the SVP **mirror** pane (`_svpMode === '3d'`,
      `SplitViewManager.ts:1282, :1331-1374` — a `drawImage` copy of the main renderer,
      pinned alive via `MAIN_RENDERER_PIN_SVP_3D_MIRROR`, `:1062-1065`), in which case the
      staleness is in what the MAIN renderer drew, not in the wall mesh.

**Next probe (ask the founder, one line):** was the 3D they were watching the MAIN viewport
or the SECOND (split) pane? That single answer eliminates one branch outright.

## Row 2 — incidental, from the same log (routed by orchestrator, NOT lane 3D)

| L-NN | `[YjsDocAdapter] W5-3: command type 'wall.opening.create' has NO sync disposition` | OPEN | 2026-08-14 |
Same class as the `room.redetect` gap closed today in `6bfb50a8`.

## Row 3 — incidental, from the same log (routed by orchestrator, NOT lane 3D)

| L-NN | `[captureThumbnail] Read a blank/transparent frame — keeping the last good thumbnail` | OPEN (handled honestly; non-fatal) | 2026-08-14 |
WebGPU swapchain texture not readable that turn. The recovery refuses rather than writing a
blank thumbnail, so this is a logged known-limitation rather than a defect — worth a row so
it is not rediscovered.


---

## SOURCE: `R2-ISSUE-LOG-ROWS.md`

# LANE R2 — proposed ISSUE-LOG rows (ISSUE-LOG.md contended; highest row seen L-885)

Append these after the current highest row. Renumber if a sibling lane landed rows first.

---

**L-886 · Room occupancy was authored, live and unreachable — blocked by a reason that was
false for that verb.** Founder: *"the rooms are called Room 001 … the occupancy is
unclassified … if i want to go to the RAC and say i want a bathroom in the room 001 … can
that be done?"* Measured: `room.setOccupancy` has been a LIVE registered bus verb
(`plugins/rooms/src/handlers/SetRoomOccupancy.ts` → `SetRoomOccupancyCommand`, undoable, with
a row in API-VERB-REGISTER) and `RoomOccupancyType` has carried `bathroom` / `bedroom` /
`living-room` / `kitchen` among **51** members all along. Nothing about the model was missing.
The chat could not reach it because `ChatCommandClassification` filed the verb under
`B_CATALOGUE` — *"the value is a project-catalogue reference … those catalogues are not
injected into the resolver context yet"*. **That reason was false for this verb**: occupancy
is a closed compile-time enum (`RoomOccupancyTypeSchema`), identical in every project, with no
catalogue to inject. The capability was blocked on a dependency it never had, so the blocker
could never "arrive". FIXED — `set-room-occupancy` capability registered; the verb left
`B_CATALOGUE`. **Generalisation: when a deferral names a dependency, verify the dependency is
real FOR THAT VERB before inheriting the family's reason.** Cf. [[unsatisfiable-gate-decomposition-is-the-fix]],
[[authored-but-unwired-is-the-bottleneck]].

---

**L-887 · Duplicate room NAMES make name-based chat resolution unsafe; the NUMBER column is
the only unique handle.** CONFIRMED from the founder's Room Schedule: rows `00-001` (85.73 m²)
and `00-004` (61.32 m²) are different rooms **both named "Room 00-001"**. `RoomStore.findByName`
is a case-insensitive **substring** match, so a name-first lookup for "room 001" matches BOTH
and would silently have edited whichever came first — the worst outcome for an edit the user
cannot see happening. MITIGATED in the chat path only: `ZeroTokenChatBridge`'s room scope arm
now matches the unique `roomNumber` FIRST (tiered exact → trailing segment → digits), refuses
an ambiguous number by listing the candidates, and names rooms by NUMBER in every refusal.
**NOT FIXED at the source** — hand-created rooms still bypass the generator's §DUP-NAME-UNIQUE
minting pass (which exists only in `workflows/apartmentLayout/tgl/emitGeometry.ts`, i.e. the
GENERATIVE path). Open: give `CreateRoomCommand` / the room-numbering path the same uniqueness
guard, or accept names as non-unique repo-wide and make every name-based lookup refuse on
ambiguity. Owner: rooms.

---

**L-888 · `room.setOccupancy` is singular, so a multi-room chat instruction is N undo steps,
not one.** Every other spec-driven chat capability dispatches a single `*Batch` verb, which is
the only thing that buys "one gesture = one undo entry" (`BatchCoordinator`: `runBatch` is
undo-NEUTRAL). There is no `room.setOccupancyBatch`, so "make rooms 002 and 003 bedrooms" fans
out to two `room.setOccupancy` dispatches — **disclosed**, not hidden: `dispatchCommands`
already prints *"undo with Ctrl+Z (N steps)"*. Minting the batch verb was deliberately NOT done
in the same change: a new bus verb requires a row in `docs/04-reference/API-VERB-REGISTER.md`
or `check-verb-register.ts` V1 hard-fails, and that register was being edited by another lane.
FOLLOW-UP: mint `room.setOccupancyBatch` + register row; the chat side then changes only
`fanOutPerId` and the table entry in `CapabilityExecutionSpec.ts`.

---

**L-889 · `CapabilityValueSource` has no member for a closed domain enum, so occupancy is
declared as `user-text`.** The room-use parameter is a 51-member closed vocabulary, but the
nearest available `CapabilityValueSource` is `'user-text'`. A truer `'room-occupancy'` source
could not be added because `CapabilityValueSource` members must also appear in
`KNOWN_VALUE_SOURCES` inside `tools/ga-gate/check-chat-capability-coverage.ts`, which was owned
by another lane. Consequence today: cosmetic only — the spec still refuses unknown words by
listing real options, and the vocabulary is read off the Zod enum so chat and store can never
disagree. FOLLOW-UP: add `'room-occupancy'` to both the enum and the gate's known set.

---

**L-890 · The generic spec arm honoured spatial scopes its capabilities never declared
(C68 §6.3-G3, 24 → 26 on one new capability).** `applyExecutionSpec`'s scope stage handles the
level/room/orientation SUPERSET with one implementation, so every new spec silently "honours"
scope kinds its grammar never produces. Harmless breadth for walls; WRONG for rooms — the
editor's orientation arm answers "facing south" with the WALLS that face south, so an
orientation-scoped `set-room-occupancy` would have fanned room commands out over wall ids.
FIXED by adding `spatialKinds` to `CapabilityExecutionSpec` (absent ⇒ all, as before) and
setting `['room']` on the new capability, which returned the ratchet to its 24 baseline **by
making the capability smaller and truer rather than by raising the number**. Open: the other
25 entries are still arm-reach the declarations do not claim, and each should be audited the
same way rather than left to the baseline.

---

**L-891 · (REPORTED, NOT BUILT) "How can I make the corridor 30 cms wider?" — needs a RELATIVE
dimensional change, which no chat capability supports.** Founder typed this and got *"I'm not
sure how to help with that yet."* Half of it is now solved and half is not:
· SOLVED — resolving "the corridor" to a room. The U3 room scope resolves by name/occupancy,
  and `corridor` is a canonical `RoomOccupancyType`, so `findByOccupancy(['corridor'])` finds it.
· NOT SOLVED (two gaps): **(a) every dimensional capability is ABSOLUTE** — `matchProperty` /
  `set-width` parse "to 3m", never "by 30cm" or "wider"; there is no relative-delta grammar and
  no intent field for a signed delta. **(b) a room has no editable width.** A room is a detected
  boundary polygon; widening it means MOVING ITS BOUNDING WALLS, and `wall.updateBaseline` is
  classified B ("sub-entity reference resolution"). So the ask is really "move the two walls
  bounding this corridor 30 cm apart, preserving joins" — a wall-geometry capability, not a room
  one. Estimate: relative-delta grammar is small and reusable; the room-widening semantics are a
  real design step (which wall moves? both? joins, openings, adjacent rooms).


---

## SOURCE: `PROPOSED-ISSUE-LOG-ROWS.md`

# Proposed ISSUE-LOG rows — LANE X (C79 §5.2 five-state region reporting)

The lane is fenced out of `docs/04-reference/ISSUE-LOG.md`; these are written here
for the orchestrator to land.

---

## PROPOSED — `C79 §5.2 has no USER-facing surface (the refusal is a console line)`

**Status:** OPEN · **Owner:** C79 §10.6 (the contract already names it) · **Severity:** the
row above it is not closed without this.

`SlabDependencyTracker.reprojectStoredPolygon` now returns one of C79 §5.2's five
states, and `conflicted` / `undetermined` are announced with `console.warn`
(`[SlabDependencyTracker] §C79-5.2 conflicted: slab "sb" — the re-derived boundary
INVERTED its winding (24.000 m² → 24.000 m², on the far side of the walls it was
drawn between) — the region enclosed at authoring time no longer exists.`).

**A console.warn is a developer trace, not a message a user sees.** A user who drives
a wall through another wall still watches the slab flip to the far side with no
refusal, no dialogue, and no both-numbers report. C79 §8.3(c) and the gate's own
"what this gate cannot see (d)" both already say this axis is unmeasured; it is now
also the last half of §9.4.

The verdict object carries everything a surface needs (`state`, `reason`,
`subReason`, `numbers.{oldAreaM2,newAreaM2}`, `edgeOutcomes`). What is missing is a
consumer above L2 — geometry-slab cannot import a renderer. The shape of the fix is
the one the C83-S1 lane used for the wall-through-a-door refusal (shared refusal
renderer, four sites, DOM-proven).

---

## PROPOSED — `C79 §5.2 regenerated is unreachable from the move path`

**Status:** NAMED GAP (C70 §7.1), not a defect · **Owner:** whoever wires
`DegradeSlabSketchCommand` into the classifier.

Four of the five states are driven end-to-end on the slab move path
(`preserved · resized · conflicted · undetermined`). `regenerated` is classified and
unit-driven, but a wall MOVE cannot produce it: `SketchLoopIntersector.computePolygon`
returns exactly one vertex per segment (parallel corners fall back to a raw endpoint
rather than collapsing), and a move changes neither the sketch's edge count nor its
host set — so the re-derived ring is always topologically identical to the sketch.

The reachable producer is a sketch EDIT. `DegradeSlabSketchCommand` converts a
`hostReference` edge to a `freeLine` on a wall delete, which changes the HOST SET —
C79 §5.2's own words for `regenerated`. That path does not call
`classifySlabRecompute` yet.

Recorded so the count is not re-read as five-of-five.

---

## PROPOSED — `the live wall-store subscription DISCARDS the verdict`

**Status:** OPEN, low severity · **Owner:** @pryzm/geometry-slab.

`SlabDependencyTracker`'s `wallStore.subscribe` callback calls `onWallUpdated(wall.id)`
and drops its return value. The verdict is still READ inside that call (it decides the
write-back and drives the refusal trace), and `recomputeForWall()` returns it to any
caller that asks — so nothing here is an unread field. But on the LIVE path the
verdict reaches no subscriber, which is the same shape C70 F-INV-1 warns about, and it
is why a user-facing surface (row 1 above) cannot simply "read the return value".

Surfaced by a test failure worth recording: the first run of
`c79RecomputeStates.test.ts` reported `expected 'preserved' to be 'resized'`, because
the live subscription had already re-derived and persisted before the explicit call.
That is C79 §5.1 determinism, and it is now an assertion of its own.


---

## SOURCE: `laneV-ISSUE-LOG-rows.md`

# Lane V — rows for docs/04-reference/ISSUE-LOG.md (file is fenced; orchestrator to append)

## L-880 — A WALL MOVE LEFT A REGION UNENCLOSED AND PRYZM SAID NOTHING — *CLOSED (detect + ask + execute), 2026-08-14*

**Evidence class: OBSERVED (founder, browser, build `9ee11d2a`) + source-verified at HEAD.**

### Observed
Founder moved perimeter wall `wall_01KZZYWAVGR2H6SRBY0TM4ZF4F`. Every mechanism that
landed that morning behaved — `§C79-5.2 resized: 195.510 m² → 134.192 m²`,
`§GR12-BOUNDARY-INVALIDATION` marked the affected rooms undetermined,
`WallMoveReweldService §MOVE-REWELD-DISPATCH` re-welded the junctions. The move left a
region that used to be a room standing open on one side. Log read
`Detected 2 room(s) … unresolvedLoopBreaks=0` and
`RoomBoundaryBuilder Compliance overlay: 1 error room(s) tracked (overlay OFF)`.
The user was told nothing.

### The measurement that decided where the fix belongs
Three candidate signals existed. **None of them is this signal**, and saying which is
the load-bearing part of this row:

1. **`unresolvedLoopBreaks=0` was CORRECT, not a miss.** `RoomDetectionEngine._diagRoomLoop`
   (`packages/room-topology/src/RoomDetectionEngine.ts:569-624`) counts a guest endpoint
   projecting onto another wall's MID-SPAN (`0.01 < t < 0.99`) at a centreline distance
   BOTH beyond that host's snap radius AND **`< 1.0` m**. It is a thick-shell T-junction
   *clamp* diagnostic with a one-metre ceiling. A perimeter wall that sheds 61 m² of
   floor leaves the partition endpoints projecting onto nothing — `t` falls outside the
   body span, or the distance clears the ceiling. **The region simply stopped being a
   room**; it was not a loop break in this detector's sense, and detection therefore
   could not live inside that diagnostic.
2. **The compliance overlay is the ConstraintEngine channel** (`_complianceStatus`,
   `RoomBoundaryBuilder.ts:40/376`), fed only from `pryzm-constraints-updated`
   (`ROOM_MIN_AREA`, `ROOM_NEEDS_DOOR`, `HABITABLE_NEEDS_WINDOW` …). A downstream
   symptom channel (**L-862**) that cannot name a missing edge.
3. **The §GR12 `boundedBy` undetermined mark** (Lane K, `02157ebb`/`9fa40ae2`) is the
   right *state* and the wrong *shape*: a room that never returns from the detection
   pass never gets the fresh `boundedBy` write that clears its mark, so the graph does
   know it does not know — but it holds a MARK, not a GEOMETRY, and the founder asked
   for a wall "in the expected space".

### Fixed by
- `499360c6` — `packages/room-topology/src/OpenedRegionDetector.ts`: pure
  before/after room-set comparison (`merged` / `vanished`), proposal computed from the
  lost region's OWN former perimeter (longest contiguous unwalled run). Four named
  refusals rather than a guess: `no-unwalled-edge`, `gap-dominates-perimeter`,
  `multiple-disjoint-gaps`, `gap-turns-corner`. 16/16 executed.
- `a75e8e1e` — the offer on the **C83 §4.1.3 canonical chat prompt**
  (`ZeroTokenUiHooks.confirm`), Confirm → `runtime.bus.executeCommand('wall.create', …)`,
  one command / one Ctrl+Z. 13/13 executed.

### Still open (NOT claimed closed by this)
- The detector fires **only after a wall move settles** (armed exclusively by
  `RoomTopologyObserver._onWallMutationCommitted`). A region opened by a wall
  **delete**, a slab edit or a generator pass is NOT covered.
- The offer proposes **one straight wall**. A gap that turns a corner refuses
  (`gap-turns-corner`) rather than proposing two walls.
- Nothing here is **gate-enforced**; it is covered by tests only.

---

## Note for the C83 lane — a live surface-binding data point

`chatPromptHost.ts` (new, `a75e8e1e`) is the accessor for `AIPanel`'s own
`ZeroTokenUiHooks` pair. Both halves (`addMessage`, `showZeroTokenConfirm`) were
closures inside `createAIPanel`, handed to `tryHandleZeroToken` by argument and
reachable from nowhere else — so **the only cross-boundary channel into the transcript
was `ai-proposal-added`, i.e. the `CommandProposal` type C83 §4.1 forbids new work from
building on.** Any future C83 slice that needs to speak between user turns should use
this accessor rather than minting another route.

---

## Note — `RoomContentsService` caveat did not apply here

The coordinator flagged that `RoomContentsService.contained` collapses three situations
into `[]`. **Lane V does not call `RoomContentsService` at any point** — the detector
reads room polygons from `RoomStore.getByLevel` and wall baselines from
`WallStore.getByLevel`, and refuses explicitly when either store cannot answer
(`_snapshotRooms` returns `undefined`, which disables the comparison rather than
comparing against an unknown "before"). No empty list is treated as evidence anywhere
in this change.

---

## L-881 — THE QUESTION WAS ASKED TO THE CONSOLE: a detected offer never reached a human

**Evidence class: OBSERVED (founder, production, build `a75e8e1e`) + source-verified at HEAD.**

### Observed
The §OPENED-REGION detector fired correctly on a real founder wall move — console:
`Room 00-001 (249.9 m²) is no longer its own room … (gap 2.81 m, anchored 2/2, rooms 2 → 1)`
— and the silence suite held (earlier `UPDATE_WALL_BASELINE` + `REDETECT_ROOMS` cycles in
the same session produced no §OPENED-REGION line). **The founder saw nothing.** Verdict:
*"the request of internal partition for keep the room when a wall is moved (perimeter)
is not working"*.

### Root cause — what is PROVEN and what is NOT
**NOT proven:** the handed hypothesis "the hook is null unless the AI panel was opened
at least once". `createAIPanel` runs at BOOT (`Layout.ts:96` → `mountAIArea` →
`AIAreaLayout.ts:377`), gated only on `OwnerFeatureFlags.showAIPanel` which **defaults
`true`** (`OwnerFeatureFlags.ts:27`), and there is no early return before the
registration at `AIPanel.ts:1741`. The hypothesis was NOT adopted.

**Proven — two silent-degradation paths, both closed:**
1. `chatConfirm` at `a75e8e1e` was verbatim `if (!host) return undefined;` — no DOM
   access of any kind; the caller's whole recourse was a `console.warn`.
2. `AIPanel.showZeroTokenConfirm` resolves a **fabricated `false`** when `transcriptEl`
   is falsy (`:1180`; `let transcriptEl: HTMLElement;` at `:819` is declared
   UNINITIALISED). A prompt posed before the transcript exists returns "the user
   cancelled" when no human saw anything.

### Fixed by
- `fa261daf` — `openChatSurface()` / `ensureChatSurface()` (open the panel, wait for a
  renderable host), `ChatPromptHost.isReady?()` (AIPanel answers `!!transcriptEl`), and
  a visible last-resort fallback prompt that `console.error`s and counts itself.
  `chatConfirm` returns `undefined` only with no `document` at all. 17/17 executed,
  including four arms reproducing the founder's exact starting state — three of which
  fail on `a75e8e1e`.
- `7bca7f89` — `listeners=N` printed with every finding, `console.error` at N=0.

### THE RULE this row exists to record
**A console line is not a user-facing message.** "We told the user" and "we wrote a
line nobody reads" must never print as the same outcome. This is the same
§CONTEXT-DATA-HONESTY class as L-862 (121 compliance errors detected, never announced),
one layer further along: the announcement channel existed, was called, and dropped it.

### Still open
- The originating log could not distinguish "the offer ran and found no surface" from
  "no offer was ever subscribed". `7bca7f89` makes the next occurrence self-naming, but
  the ORIGINAL cause remains unproven and may recur.
- The fallback prompt is a failure rendering. Any non-zero
  `getSurfaceDiagnostics().fallbackPrompts` in production is a defect to chase, not a
  supported path. Nothing gates it.

