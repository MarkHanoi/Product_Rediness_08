# ADR-0374 — Wall attachment: the anchor that lets wall-placed elements live in the graph

> **Status**: ACCEPTED · **Date**: 2026-08-26 · **Lane**: GRAPH115 · **Founder ask (verbatim intent)**:
> *"all families — components — wall-faced, wall-hosted or wall-connected — must follow / move /
> propagate as LIVING GRAPH elements."* If he creates a toilet against a wall and then MOVES that
> wall, the toilet must move with it — exactly as walls↔slabs and floor finishes already adapt.
> The same must hold for CURTAIN WALLS as hosts, and ideally for furniture backed against a wall.
> **Governing contracts**: C72 §9 (adapt or refuse, never silent) · C78 §1.4/§3.2/§3.3/§14.3 ·
> C71 §1.2 (six edge semantics) / §2.6 · C15 §0.1.1 (the sibling rule) · C16 §8.6 (one gesture =
> one undo) · C84 EI-7/EI-9 · C79 §2.2/§2.3 (no proximity re-derivation) · C89
> §FINISH-FOLLOW-LATE-ATTRIBUTION (the pattern this generalises) · C47 (additive-optional) ·
> C74 (refusal carries both numbers) · C87 CW-Move-1 (follow the wall path, never fork a cascade).
> **Ledger**: `tools/rac-conformance/certification/gates/host-move-propagation-matrix.json`
> (gate `check-dependent-adapts-on-host-move`) — the cells this ADR exists to flip are
> `plumbing × wall` ("a wall-hung WC cannot record the wall it hangs on") and `furniture × wall`
> ("THE LARGEST GAP IN THIS MATRIX by user-visible impact").

---

## 1 — The measured gap (audit, 2026-08-26)

Everything that follows a wall move today follows through ONE shape: a **store-field host
reference** (door/window `wallId` + offset · slab/finish `sketch.outerLoop.edges[].hostId`) read
by a **bespoke tracker** subscribed to `wallStore` (§STEP7 `prevState` channel), which dispatches
a **command** with `{source: 'STRUCTURAL_CASCADE'}` so `CommandManagerImpl` composes it into the
spawning gesture's `structuralChildren` — one wall move, one Ctrl+Z (§L-874-ONE-UNDO).

The families the founder named have **no field to walk** (C72 §9.5 said this before we did):

| Family | Wall detection at placement | Wall identity persisted | Verdict (matrix) |
|---|---|---|---|
| plumbing (toilet/shower/sink/…) | YES — plan `_findWallSnap` @1.0 m, 3-D `getNearestWall` @1.5 m; §PLUMBFRAME (082d2225) seats origin ON the wall-contact edge and derives yaw from the wall's room-side normal | **NO — the wall object is found and its `id` is thrown away** (`PlumbingPlanToolHandler.ts:336,367`) | SILENT |
| furniture (sofa/bed/wardrobe/kitchen run) | none in the hand tools; the AI furnish solver computes `anchor: 'wall-longest'` and **`RoomWallSeg` has no `id` field** | NO — only `hostedSpaceId` (a ROOM) | SILENT |
| curtain wall as HOST | slab region tracer already attributes `hostType: 'curtain-wall'` edges (§FEAT-REGION-CURTAIN-WALL) | edges persist, **but no tracker subscribes to `CurtainWallStore`, and its `emit(event, cw)` carries NO `prevState`** | not even a matrix cell |

§PLUMBFRAME minted the geometric half of the anchor (origin = wall-contact edge midpoint, yaw =
`plumbingFixtureYawForWallNormal(nx, nz)`); this ADR mints the **identity half** and the follower
that reads it.

## 2 — The decision: a `WallAnchor` store-field, one authority, one follower

### 2.1 The record

An optional, additive field on the element record of point-placed families
(`PlumbingFixtureData`, `FurnitureData`):

```ts
interface WallAnchor {
  hostId: string;                       // the wall / curtain wall element id
  hostKind: 'wall' | 'curtainWall';     // which store resolves it
  t: number;        // metres along host baseline from baseLine[0] — C15 §1's offset convention
  d: number;        // signed perpendicular metres from the baseline (sign = face side)
  yawOffset: number;// element yaw MINUS host baseline yaw at anchor time
}
```

`position`/`rotation` **stay authoritative on the element**. This is deliberately NOT a C15
hosted element: C15 §0.1.1's own rule is that a surface unable to supply all four wall-host
requirements (an `openings[]` record, a scalar offset that *derives* the world position, a real
void, the `bim-wall-updated` rebuild path) **"gets a sibling mechanism, not an amendment to this
contract."** A toilet has no void and keeps its own world coordinate; this is that sibling.

The ONE implementation of the anchor math (mint + reseat + agreement — C84 EI-9) is
`packages/core-app-model/src/anchors/WallAnchor.ts`. Reseat is absolute, not delta-based:
`pos' = A' + t·dir' + d·perp'`, `yaw' = atan2(dir'.x, dir'.z) + yawOffset` — so a follower needs
no event history to be correct, and wall ROTATION carries the element's orientation too.

### 2.2 Why not a SemanticGraph edge, and why not the UBG

- C71 §1.1: *"topology written and never read is vocabulary pretending to be capability."* Four
  REQUIRED graph families are already write-only (`check-graph-write-coverage` RC=3, C71 §5.2
  correction: the gap is **typed readers**, shrink-only at 0). Minting `hostedBy` edges here
  would deepen exactly that defect; minting a NEW `RelationshipType` member would trip C78 §22.h
  unless it carried C71 §2.6's four elements — and the store-field + tracker shape already
  carries all four (writer = the create commands; typed reader = the tracker's index; rebuild
  disposition = persisted verbatim, additive-optional; delete behaviour = §2.5 below), without a
  second answer to the same question (EI-9).
- The UBG is a **read-only projection** (its own §GR-17); nothing may treat it as a store.

### 2.3 Minting — creation-time authoring, never later proximity

- The **placement tools already compute the wall** (they refuse or fall back without one); they
  now pass `wallAnchor` in the create payload and the create command stamps it. That is the
  user's own gesture recorded at the only moment it is cheap (C79 §2.3 — the origin is the
  authoring act, not an invention; the same moment doors record `wallId`).
- Furniture hand tools do no wall detection today; the plan tool now mints an anchor **only**
  when the element's wall-facing back edge lands within `WALL_ANCHOR_SNAP_M = 0.15 m` of a
  same-storey wall face at commit time — a placement-gesture fact, not a background sweep.
- ⛔ **No later re-derivation by proximity** (C79 §2.2, `check-region-host-attribution` ARM 1).
  A record without an anchor stays without one until a placement-shaped gesture (create, or a
  future explicit "attach" affordance) mints it. The C89 §F-LA singleton pattern (re-attribute
  against the ONE wall that moved, pre-move state) remains available as a later, separate lane.

### 2.4 The follower — `WallAnchorDependencyTracker`

`packages/core-app-model/src/anchors/WallAnchorDependencyTracker.ts`, wired in
`apps/editor/src/engine/initTools.ts` beside the finish trackers. Bespoke-tracker shape
(C72 §0.3 — the protected, working class of propagation; C72 §2.2 forbids building on the
generic cascade). Per host `update` (with §STEP7 `prevState`) it:

1. **Skips non-baseline updates** (baseline byte-equal ⇒ nothing this relationship depends on
   changed — a measured no-op, not silence).
2. **Verifies anchor agreement** against the PRE-move baseline: if the element is no longer
   where the anchor predicts (> 1 cm), the user moved it independently since minting — the
   anchor is STALE. The tracker **detaches it through the same undoable command** and says so
   (`STALE_ANCHOR — detached, element NOT moved`); it never teleports authored geometry
   (C78 §1.4; the founder's standing "never auto-edit" doctrine).
3. **Refuses with both numbers** when the reseat falls off the host (`t` outside
   `[0, len']` after a length change): element and anchor keep their state, the line names `t`
   and `len'` (C74).
4. **Reseats the agreeing dependents** in ONE `ReseatWallAnchoredElementsCommand` per host move,
   dispatched `cm.execute(cmd, { source: 'STRUCTURAL_CASCADE' })` **synchronously inside the
   host command's execution frame** — so it lands in `structuralChildren` and one wall move
   stays ONE Ctrl+Z (C16 §8.6 B-6 bought the legacy-stack way, §L-874).
5. Holds the guard set the working trackers hold: `isReverting()` (undo RESTORES, it never
   recomputes — C84 EI-7e, §L-943), own re-entrancy, and the `__wallDragInProgress` first-prev
   memo (§WALL30-DRAG-COALESCE). It does **not** suppress during
   `isCascadeWallBaselineApplying` — a fixture must follow its wall when the reweld cascade is
   what moved it; the tracker dispatches element writes, never wall writes, so no dispatch loop
   exists.
6. Every exit **prints or writes** — the C89 §F-LA.1 no-silent-exit rule, verbatim.

`ReseatWallAnchoredElementsCommand` (`packages/command-registry/src/attachments/`) is
`MovePlumbingCommand`'s shape generalised: per-item pre-mutation snapshot, verify-by-re-read
(C16 B-8: `success = landed === attempted`, both numbers on failure), instance-computed
`affectedStores` equal to the exact family set it writes (C84 EI-7), explicit `undo()` restoring
snapshots verbatim — it does not rely on `createSnapshot` (whose table has a measured `plumbing`
hole, C84 EI-7d).

### 2.5 Host delete — per-family policy (the L-11583 class, decided here)

| Family | On host delete | Why |
|---|---|---|
| plumbing fixture | **KEEP the element, DETACH the anchor** — through the cascade command, inside the delete gesture's undo unit, with a printed count | A toilet is authored, purchasable geometry visible on its own; a door is a hole that is meaningless without its wall. Deleting a wall must never silently delete a fixture; undo of the wall delete restores the anchor verbatim (the `3ee632f6` reference shape, C71 §5.6) |
| furniture | **KEEP + DETACH**, same mechanism | Same reasoning, weaker coupling |
| slab/finish edges naming a curtain wall | already governed by the finish/slab degrade paths (C79 §4.2) | not this ADR's to re-decide |

No dangling `hostId` survives a delete (C78 §3.3 wire-or-delete: a field naming a dead element
would make "detached" and "host gone" the same value). Elements are never invisible orphans —
they keep rendering exactly as before, minus the follow.

### 2.6 Curtain wall as host

`CurtainWallStore.emit(event, cw)` gains the optional §STEP7 third argument (`prevState`),
populated at its `update()`/`set()`/`changeLevel()` write sites — the C72 §3.2 forward rule: a
new diff consumer may not be introduced against a type that cannot carry its input. The anchor
tracker subscribes to it exactly as to `wallStore` (`hostKind: 'curtainWall'`); the plumbing plan
tool's snap search offers curtain walls as anchor hosts alongside walls. The real curtain-wall
move path is `wall.updateCurtainWall` → `UpdateCurtainWallCommand` → `store.update()` (C87
§13.10), so the follow rides the existing path — no second cascade is forked (C87 CW-Move-1).
**OPEN, stated rather than implied**: the slab/finish boundary follow on a curtain-wall move
(their sketches CAN name curtain-wall hosts, but `SlabDependencyTracker` and
`FinishHostDependencyTracker` subscribe to `wallStore` alone) is the remaining half of C87
CW-Move-2 and is logged, not shipped here.

### 2.7 Persistence

Additive-optional per C47's four-part discipline: `?`-optional field; serializers emit the key
only when present (an unanchored project's snapshot stays byte-identical — no
`SNAPSHOT_SCHEMA_VERSION` bump); the readers treat an absent key as "never anchored"; the field
joins **both** hand-synced serializer copies and the restore path that ships **in the same
commit** (C78 §14.3; C84 EI-6.1 — a field is persisted only if the shipping restore path reads
it). No new store ⇒ `check-snapshot-family-coverage` gains no row; the verdict for the new FIELD
is: persisted inside the existing `plumbing` / `furniture` snapshot arrays.

### 2.8 The six C71 §1.2 semantics, answered in one place

| # | Semantic | Answer |
|---|---|---|
| 1 | writer | the create commands (payload from the placement tools) |
| 2 | typed reader | `WallAnchorDependencyTracker`'s host→elements index (a per-family typed read, C71 §1.3) |
| 3 | persistence | serialized verbatim inside the family's snapshot entry, additive-optional |
| 4 | rebuild disposition | persist-only (nothing re-derives it — deliberately, per §2.3's no-proximity rule); named here as its ledger |
| 5 | invalidation on move | host move ⇒ reseat / refuse-with-numbers / detach-on-divergence (§2.4); element move outside the cascade ⇒ detected as divergence at the next host move and detached audibly |
| 6 | deletion | host delete ⇒ keep-and-detach inside the delete gesture (§2.5); element delete ⇒ the field dies with the record; undo restores either verbatim |

## 3 — What this ADR does NOT do

- No SemanticGraph writes, no new `RelationshipType` member (§2.2).
- No consequence-planner integration (`wall.move` preview does not yet enumerate anchored
  fixtures) — C78 §10.4's open interim state; the matrix cell records PROPAGATES, not
  plan-bound.
- No retro-attribution of existing placed fixtures (would need the C89 §F-LA singleton pass —
  a follow-up lane).
- No lighting/handrail arms (`hostId` on lighting has zero writers; `HandrailData.hostKind`
  cannot say 'wall' — both stay SILENT on the matrix, named).
