# WINJOINT91 — measured fix plan: RAC window batch update corrupts the host wall's mitred joint (2026-08-25)

**Founder report (production, today):** *"I updated all windows via RAC — some windows on update
CORRUPTED the wall they were hosted on and the mitred joint went out."* Console family:
`§DIAG-OPENING-VOID ⚠ … body-only rebuild did NOT cut the void (path=layered-grid)` on EVERY
MOVE_WINDOW, and `[TopologyLayer] … ⚠ 2 LOST [window↔wall, …]`.

**Evidence:** three untracked probes under `packages/geometry-wall/probes/`
(`probe-wj91-01-snapradius-mitre-loss.local.mts`, `probe-wj91-02-batch-window-update-seam.local.mts`,
`probe-wj91-03-layered-voidcut-false-positive.local.mts`, plus `_wj91-shim.local.mts`), run with
`node ../../node_modules/tsx/dist/cli.mjs probes/<name>.mts` from `packages/geometry-wall`. All
numbers below are from those runs on this tree (HEAD family of `596fdcd1`). ⛔ Not verified in a
browser; the coordinator legs are transcribed from `WallRebuildCoordinator.ts` and corroborated by
the founder's own console lines, and the probes execute the REAL resolver, stores and command.

## The measured chain (one sentence)

A window batch child writes an **opening-only** wall update (probe 2: 0 baseline-moving events) →
the coordinator's openings-only fast path would preserve the mitre via cached JoinData, but its
§DIAG-OPENING-VOID check is a **structural false positive on every layered wall with openings**
(probe 3) → it routes to the whole-level rebuild, which re-runs `WallJoinResolver.resolveLevel`
with a **zoom-dependent snapRadius** (0.05–1.0 m vs the 0.5 m default) → junctions that exist at
0.5 m but not at the current zoom drop out of `adjustments` → **§STALE-CACHE-FIX rebuilds them
SQUARE-CAPPED and evicts the good mitre from `_prevJoinMap`** (probe 1: joint gap 0.0000 m →
0.2000 m, miter normals true → false).

## H1 — batch rebuild skips the join resolver: REFUTED (the truth is worse — it re-runs it under different thresholds)

Probe 2, real `WallStore` + real `windowStore` + real `UpdateWindowParameterCommand`, batch of 2:
`Total wall events: 2; baseline-moving events: 0`; both wall baselines byte-identical pre/post;
dual write consistent (windowStore width 1.4 == wall opening width 1.4, C15 §8.1). The command is
innocent. The fast path (`_flushOpeningsOnly`, `WallRebuildCoordinator.ts:1337-1346`) explicitly
passes the cached `_prevJoinMap` JoinData — "preserves the wall's mitered end caps exactly". The
mitre is not lost by *skipping* the resolver; it is lost by the fallback *re-running* it (H2).

## H2 — the §DIAG-OPENING-VOID whole-level fallback is the corruption vector: CONFIRMED, mechanism refined

Two stacked defects:

**RC-1 (the trigger — a structural false positive).** The void check
(`apps/editor/src/engine/WallRebuildCoordinator.ts:1407-1411`) counts direct children with
`userData.elementType === 'WallPart' | 'WallLayer'`. The layered-with-openings arm
(`packages/geometry-wall/src/LayeredWallOpeningBuilder.ts:620-630` `emitMesh`, and the merged-arm
emissions at :647-650) stamps `{ role: 'geometry', … }` — **no `elementType` at all**. Probe 3:
3 meshes emitted, census `3 × elementType=NONE role=geometry`, coordinator scan `bodyParts=0 →
voidCut=false` **while the void is genuinely cut** (material-free band x∈[2.05..3.15] at
mid-opening height, matching the 1.2 m opening at offset 2.0). So EVERY window edit on EVERY
layered wall warns and takes `_rebuildWalls(_voidNotCut)` (:1464-1466) — exactly the founder's
per-MOVE_WINDOW console line. (The no-openings layered arm DOES stamp `'WallLayer'`,
`WallFragmentBuilder.ts:2187` — the vocabulary exists; this arm just never adopted it.)

**RC-2 (the corruption).** The whole-level `_flush` resolves with
`snapR = getWorldToleranceForActiveCamera(DEFAULT_SNAP_PIXEL_RADIUS, cam, canvas)`
(`WallRebuildCoordinator.ts:1885`, clamp band [0.05..1.0] m, `CameraToleranceService.ts:46-52`),
not the `DEFAULT_SNAP_RADIUS = 0.5` m the junctions were solved with. Probe 1 (real
`resolveLevel`):

| scenario | 0.50 m | 0.12 m | 0.05 m |
|---|---|---|---|
| S1 exact-coincident L corner (control) | mitred, gap 0.0000 | mitred, gap 0.0000 | mitred, gap 0.0000 |
| S2 corner with 0.20 m endpoint gap (welded band) | **mitred, gap 0.0000** | **NO adjustments, MN false, gap 0.2000** | same |
| S3 T-stem on host FACE (0.15 m off centreline) | T-trimmed, MN true | **NO adjustments, MN false** | same |

The consequence in the coordinator is not "no change": a wall with `prevHadJoin` and no fresh
adjustment is rebuilt with `joinData = null` — **square caps** — by §STALE-CACHE-FIX
(`WallRebuildCoordinator.ts:2417-2435`), and `_prevJoinMap` is wiped for the level and re-seeded
only from the fresh adjustments (:2437-2438), so the good mitre is **unrecoverable** by the next
fast path. S1 explains "SOME windows": only junctions in the snapRadius-sensitive band corrupt
(welded-band corners, face-abutting T-stems — both routine states; §V2-PRETRIM-FIX at :1913-1922
names post-trim stores as a third source). Baselines are protected
(§FIX-WALL-JOIN-BASELINE-IMMUTABLE :2110-2138) — which is why the wall *body* stays put and only
the JOINT opens, matching the report precisely.

## H3 — intermediate self-heal writes a stale opening: REFUTED at this seam

Probe 2's matched-path dual write is consistent. The L-3421 self-heal profile-drop was fixed
today in `0cb6f367` (updateWindow self-heal now carries openingProfile + customOutline). If
production ran pre-`0cb6f367` code, a self-healed opening lost its PROFILE — a shape defect, not a
joint defect; it cannot open a mitre. No baseline write exists anywhere on the window path.

## H4 — adjacency-LOST = unwired computeMoveReweld on the window path: REFUTED as stated

The reweld service correctly never runs here: opening-only updates fail its displacement gate
(`WallMoveReweldService.ts:233` `MIN_MOVE_M`, :638-642 — "the L-871 door lesson, applied from
birth"). The LOST edges are **window↔wallId** pairs — TopologyLayer's bbox adjacency
(`TopologyLayer.ts:494-513`), a hosted-element relationship `computeMoveReweld` does not handle by
design. They are the *symptom* of the fallback rebuild (rebuilt/square-capped groups re-scan with
changed bounds). Defect worth logging: the §WALL30-ADJ-DELTA console line tells the reader to
"check §MOVE-REWELD-DISPATCH for these ids" even when the pair is window↔wall — it sent this
investigation, and the founder, toward the wrong subsystem (the L-10830 shape).

## H5 — undo makes it worse: MECHANISM CONFIRMED (not executed — coordinator is DOM-bound)

`UpdateWindowParameterCommand.undo` (:147-154) writes the same stores back → the same opening-only
wall event → the same false-positive fallback → another whole-level re-resolve at the CURRENT
zoom. Nothing restores `_prevJoinMap` (no store holds it). So the corruption **survives undo**,
and every undo/redo of the batch is a fresh roll of the same dice. This is the L-874 treadmill
shape one layer down: the store reverts, the derived join cache cannot.

## Fixes (minimal, per root)

**F-1 (RC-1) — stamp the layered-grid arm into the existing vocabulary.** In
`LayeredWallOpeningBuilder.ts` add `elementType: 'WallLayer'` to every `emitMesh` userData (both
the merged and per-layer emissions). One-line-per-site; aligns with the no-openings arm
(`WallFragmentBuilder.ts:2187`) and with `EdgeProjectorService.ts:2856`'s stated assumption.
The fast path then keeps its cached mitre and the fallback stops firing per window edit.
Alternative (wider blast radius, not preferred): widen the coordinator scan to `role==='geometry'`.
Governing contracts: C85 (wall family), C86 §11 #1 (frame/void consistency stays on the fast path),
C84 EI-9 (one vocabulary, not a second copy).
**Test:** unit — `buildLayeredWallSegmentsAroundOpenings` emits ≥1 direct child satisfying the
coordinator's exact predicate (share/transcribe the predicate; probe 3 is the fixture).

**F-2 (RC-2) — a structural rebuild must not solve joins at viewport tolerance.** In
`WallRebuildCoordinator._flush` (:1885), resolve at `DEFAULT_SNAP_RADIUS` (or the radius the level
was last solved at) whenever the flush is NOT an interactive draw gesture — at minimum for the
openings-only/§DIAG-OPENING-VOID fallback and load-time resolves. Zoom is UI state; a junction's
existence must not depend on it (P7's spirit; C85 join semantics; the §SHORT-WALL-SAFETY comment
at `WallJoinResolver.ts:3122-3134` already names camera-derived MAX_CORNER_OFFSET as hazard-bearing).
**Test:** geometry-wall — probe 1's S2/S3 as a pinned pair: resolve at 0.5, re-resolve on an
openings-only cause, assert MN retained and gap stays 0.0000.

**F-3 (defence in depth) — §STALE-CACHE-FIX must not silently discard a retained mitre.** At
:2417-2435, when `prevHadJoin.has(w.id)` and the wall's baseline is unchanged since that join was
solved, rebuild with the CACHED `_prevJoinMap` JoinData (exactly as `_flushOpeningsOnly` does)
instead of `null`, and keep the map entry; log the disagreement. With F-3 in place, a re-resolve
at ANY tolerance cannot unmitre a standing joint. Governing: C86 §7's trapdoor doctrine applied to
derived state — an undo/replay must land on the same rendered joint.
**Test:** seam — window batch of N over 2 mitred walls leaves `_prevJoinMap` keys intact and no
`_nullJoinRebuilds` increment (extend `wallMoveReweldSeam.test.ts`'s world or a coordinator seam
harness).

**F-4 (diagnostic honesty, one line) — `TopologyLayer.ts:537-538`:** only point at
§MOVE-REWELD-DISPATCH when BOTH ids are walls; for a hosted-element pair say "hosted-element
adjacency — check the host's rebuild, not the weld engine".

## Sequencing / collision notes

- **Lands AFTER OUTLINE81.** No fix above touches `UpdateWindowParameterCommand.ts` (probe 2
  imports it read-only). F-1 touches `LayeredWallOpeningBuilder.ts` — same package as OUTLINE81's
  geometry work; verify no overlap at merge time. F-2/F-3 touch `apps/editor` WallRebuildCoordinator
  only; F-4 touches room-topology only.
- F-1 alone removes the founder's per-MOVE_WINDOW trigger; F-2 alone removes the corruption even
  when a genuine void-not-cut fallback fires (they are independent and both real: F-1 without F-2
  leaves every legitimate whole-level resolve zoom-sensitive — the same corruption via wall
  create/delete/undo at the wrong zoom).
- Risk in F-1: something downstream may DEPEND on layered-grid children being elementType-less
  (selection filters, instancing sweeps). Grep `elementType === 'WallLayer'` consumers before
  landing; EdgeProjectorService already assumes the stamp is present.
- Risk in F-2: generators/tests that rely on the LOOSER 1.0 m ceiling at far zoom-out to close
  sloppy junctions would lose that accident; DEFAULT_SNAP_RADIUS 0.5 is the package default every
  test already runs at.

## ISSUE-LOG rows to add (numbers reserved by the brief; coordinator appends)

- **L-11300** — §DIAG-OPENING-VOID voidCut is a structural FALSE POSITIVE for layered walls with
  openings (layered-grid meshes carry no elementType): every window edit takes the whole-level
  fallback. Probe 3 numbers.
- **L-11301** — the whole-level re-resolve runs at camera-derived snapRadius and §STALE-CACHE-FIX
  square-caps + evicts `_prevJoinMap` for every junction the new tolerance no longer sees: THE
  mitre-goes-out root. Probe 1 numbers (gap 0.0000 → 0.2000 m; MN true → false at 0.12/0.05 m).
- **L-11302** — §WALL30-ADJ-DELTA's hint text misdirects hosted-element (window↔wall) losses to
  §MOVE-REWELD-DISPATCH, which cannot handle them by design (MIN_MOVE_M gate + wall-only arms).
- **L-11303** — the joint corruption SURVIVES undo: `_prevJoinMap` is derived state no command
  restores, and each undo re-fires the same fallback at the current zoom (C86 §7 shape).
