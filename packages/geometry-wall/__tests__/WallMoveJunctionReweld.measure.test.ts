// ─── PHASE-C-3 PROBE — "junction re-weld after a move" is MEASURED, not read ───
//
// FOUNDER PROMISE UNDER TEST: move a wall, and the walls that were joined to it
// extend / re-mitre so the corner stays closed. L-859/L-861 measured the ONLY
// place this promise is kept today: walls in the OUTER LOOP of a pick-walls slab
// sketch, where `SlabWallConnectivityService` (packages/geometry-slab) welds
// neighbour endpoints via `CASCADE_WALL_BASELINE`. That service's dependency
// graph is keyed on SLAB-LOOP MEMBERSHIP (`registerSlab` walks
// `slab.sketch.outerLoop.edges` only) — a wall pair that belongs to no slab loop
// is invisible to it. This file measures what happens to exactly such a pair.
//
// WHAT IS MEASURED (two independent axes — verification ≠ dispatch ≠ rendering)
// ─────────────────────────────────────────────────────────────────────────────
//  (a) BASELINE EXTENSION — after the move, does ANY mechanism reachable from
//      this layer extend the stationary neighbour's baseline to the moved
//      wall's new line? (For non-slab walls: nothing subscribes. The join pass
//      itself is FORBIDDEN from doing it — §FIX-WALL-JOIN-BASELINE-IMMUTABLE,
//      commit fcede3ca: "a join never mutates a stored baseline", the lesson of
//      the reverted §CLAMP-COSHARE-WELD doubling.)
//  (b) RE-MITRE — does `WallJoinResolver.resolveLevel` (the render-time mitre
//      pass, re-run on every WallRebuildCoordinator flush — including the flush
//      the move itself triggers) re-form the joint? It cannot: junction
//      detection needs endpoints within `snapRadius` of each other (corner) or
//      of a wall body (T), and the move opened a gap larger than that.
//
// MEASURED NUMBERS (this file asserts them; recorded here for the report)
// ─────────────────────────────────────────────────────────────────────────────
//  L-corner  A(0,0)→(5,0), B(5,0)→(5,5), t=0.2, snapRadius=0.5 (editor default):
//    pre-move   : corner mitre PRESENT (A.endMN ≠ null, B.startMN ≠ null),
//                 resolved endpoints coincide at (5,0) — gap 0.000 m.
//    move B +1m x (B'=(6,0)→(6,5)):
//                 A.baseLine unchanged (no extension mechanism) →
//                 centreline gap = 1.000 m, face-to-face gap = 0.900 m,
//                 A.endMN = null, B'.startMN = null — mitre GONE, not re-formed.
//  T-junction H(0,0)→(10,0) host, S(5,0.1)→(5,4) stem, move H −1m z:
//                 stem start to host centreline = 1.100 m (was 0.100 = halfT),
//                 S.startMN = null — T-join GONE, not re-formed.
//
// THE CONTROL THAT MAKES THE VERDICT MEAN SOMETHING: the pre-move cases show the
// SAME resolver, same walls, same snapRadius DOES produce the mitre — so the
// post-move null is the distance opened by the move, not a harness artefact.
//
// THE MECHANISM (P2 — where the re-weld SHOULD happen, written up as the
// ADR-shaped note this harness carries):
// ─────────────────────────────────────────────────────────────────────────────
//  The `joinedTo` graph edge EXISTS at flush time with {junctionType,
//  junctionDegree} — `WallRebuildCoordinator._flush` writes it via
//  `writeJoinedToEdgesForLevel` (ADR-0321 §CONNECT-3, WallRebuildCoordinator.ts
//  ~1573) from the retained junction index the V2 cache refresh just populated.
//  So at wall.move commit time the coordinator KNOWS which walls were joined to
//  the moved wall BEFORE the move. The missing piece is pure geometry: given
//  (movedWall prev/new baseline, partners), compute the partner-endpoint welds —
//  exactly what `SlabWallConnectivityService._computeNearestEndpointEntry` does,
//  generalised off slab-loop membership onto the joinedTo graph. That pure
//  engine is `WallMoveReweld.computeMoveReweld` (P3, this package). Its output
//  is CascadeWallBaselineEntry-shaped (wallId, newBaseLine, prevBaseLine) so the
//  dispatch site reuses the EXISTING undoable CascadeWallBaselineCommand path
//  with cause 'move-reweld' and source STRUCTURAL_CASCADE — carrying prevState
//  (check-prevstate-contract) and sitting behind the same propagating latch /
//  isJoinResolving() suppression the slab service already models (§REENTRANT-SET:
//  the handler must not feed its own event path).
//  Guard-rails carried from the graveyard of prior attempts:
//   • only the WELDED endpoint of a partner moves — never the far endpoint,
//     never a lateral slide (§CLAMP-COSHARE-WELD revert: moving shared baselines
//     surfaced doubled walls);
//   • extension is CAPPED at the moved wall's displacement + weld tolerance
//     (§POST-RESOLVE-OVEREXTEND: ill-conditioned intersections spike metres out);
//   • a weld that would shrink a partner below DEGENERATE_STUB_LENGTH is
//     REFUSED (the multi-cluster degenerate-wall guard downstream skips the wall
//     but the mesh path has a known black-spike hole — never hand it a stub);
//   • near-parallel pairs (< MIN_ANGLE_RAD) are skipped, and the computed corner
//     must land on/near the moved wall's NEW segment (a wall slid away along its
//     own axis has no re-formable corner — out of scope, measured as such).
//
// WHAT THIS PROBE DOES **NOT** COVER — do not let it read wider than it is:
//   · it does not execute SlabWallConnectivityService (the slab-loop path is
//     L-859/L-861's measured ground, not re-measured here);
//   · it does not prove the coordinator DISPATCHES the re-weld — the engine is
//     pure and unwired until the apps/editor wiring lands (that wiring is
//     outside @pryzm/geometry-wall's territory); the PINNED-DEFECT cases below
//     stay true until it does;
//   · inner slab loops, FreeLineEdge neighbours and curved-wall moves are
//     unmeasured, exactly as the L-859 boundary left them.

import { describe, it, expect } from 'vitest';
import { WallJoinResolver } from '../src/WallJoinResolver';
import type { WallData } from '../src/WallTypes';

let _seq = 0;
/** Wall whose _sourceBaseLine equals baseLine — the post-user-move state
 *  (UpdateWallBaselineCommand refreshes the authored anchor, §R5-FIX). */
function mk(s: [number, number], e: [number, number], t: number): WallData {
  return {
    id: `w${_seq++}`, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
    baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
    _sourceBaseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
    height: 3, thickness: t, baseOffset: 0, openings: [], metadata: { createdAt: ++_seq },
  } as any;
}

const SNAP = 0.5; // editor default (DEFAULT_SNAP_RADIUS); zoom-aware in prod

/** Distance from point p to the infinite line through (a,b), in XZ. */
function distToLine(p: any, a: any, b: any): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const L = Math.hypot(dx, dz) || 1;
  return Math.abs((p.x - a.x) * (-dz / L) + (p.z - a.z) * (dx / L));
}

describe('§MOVE-REWELD-MEASURE — L-corner outside any slab loop', () => {
  // A horizontal into B vertical at (5,0). No slab exists; no cascade can fire.
  const A = () => mk([0, 0], [5, 0], 0.2);
  const B = () => mk([5, 0], [5, 5], 0.2);

  it('CONTROL — pre-move, the resolver mitres the corner (gap 0.000 m)', () => {
    _seq = 0;
    const a = A(), b = B();
    const res = WallJoinResolver.resolveLevel([a, b], { snapRadius: SNAP });
    const ja = res.get(a.id)!, jb = res.get(b.id)!;
    expect(ja).toBeTruthy();
    expect(jb).toBeTruthy();
    // Mitre normals present at the joined ends.
    expect(ja.endMN).not.toBeNull();
    expect(jb.startMN).not.toBeNull();
    // Resolved endpoints coincide at the corner — measured gap.
    const gap = Math.hypot(
      (ja.baseLine[1] as any).x - (jb.baseLine[0] as any).x,
      (ja.baseLine[1] as any).z - (jb.baseLine[0] as any).z,
    );
    expect(gap).toBeLessThan(1e-6);
  });

  // ── PINNED DEFECT (Phase C item 3) ────────────────────────────────────────
  // DESIRED: after B moves +1 m in x, A extends its end to (6,0) and the
  // resolver re-mitres — gap 0, endMN ≠ null. MEASURED: nothing extends A
  // (this pair is in no slab loop → SlabWallConnectivityService.graph has no
  // entry; the join pass may not write baselines) and the resolver cannot
  // cluster endpoints 1.0 m apart with snapRadius 0.5. These assertions pin
  // the DEFECT numbers; they flip when the coordinator wires
  // computeMoveReweld() into the wall.move commit path (see header).
  it('PINNED DEFECT — move B +1m x: neighbour baseline does NOT extend (centreline gap 1.000 m, face gap 0.900 m)', () => {
    _seq = 0;
    const a = A();
    const bMoved = mk([6, 0], [6, 5], 0.2); // B after the user move (source refreshed)

    // (a) Baseline extension: A is untouched by any mechanism at this layer.
    const aEnd = a.baseLine[1];
    const centrelineGap = distToLine(aEnd, bMoved.baseLine[0], bMoved.baseLine[1]);
    expect(centrelineGap).toBeCloseTo(1.0, 6);              // DESIRED: 0
    expect(centrelineGap - bMoved.thickness / 2).toBeCloseTo(0.9, 6); // visible face gap

    // (b) Re-mitre: the flush re-runs resolveLevel — measure its verdict.
    const res = WallJoinResolver.resolveLevel([a, bMoved], { snapRadius: SNAP });
    const ja = res.get(a.id);
    const jb = res.get(bMoved.id);
    // The moved pair is no longer detected as a junction at all.
    expect(ja?.endMN ?? null).toBeNull();                   // DESIRED: not null
    expect(jb?.startMN ?? null).toBeNull();                 // DESIRED: not null
    // And A's resolved end stays at the OLD corner — the gap survives the pass.
    const resolvedEnd = (ja?.baseLine?.[1] as any) ?? aEnd;
    const residualGap = distToLine(resolvedEnd, bMoved.baseLine[0], bMoved.baseLine[1]);
    expect(residualGap).toBeCloseTo(1.0, 6);                // DESIRED: ≈ 0
  });
});

describe('§MOVE-REWELD-MEASURE — T-junction outside any slab loop', () => {
  // Stem S butts the body of host H at (5, ~0.1) (inner face of t=0.2 host).
  const H = () => mk([0, 0], [10, 0], 0.2);
  const S = () => mk([5, 0.1], [5, 4], 0.1);

  it('CONTROL — pre-move, the resolver T-joins the stem to the host (start trimmed to host, startMN set)', () => {
    _seq = 0;
    const h = H(), s = S();
    const res = WallJoinResolver.resolveLevel([h, s], { snapRadius: SNAP });
    const js = res.get(s.id)!;
    expect(js).toBeTruthy();
    expect(js.startMN).not.toBeNull();
    // Stem start lands on/inside the host body (within halfT of centreline).
    const d = distToLine(js.baseLine[0], h.baseLine[0], h.baseLine[1]);
    expect(d).toBeLessThanOrEqual(0.1 + 1e-6);
  });

  // ── PINNED DEFECT (Phase C item 3, T-shape) ───────────────────────────────
  // DESIRED: after H moves −1 m in z, S extends its start to the new host
  // line (z=−1) and the T-join re-forms. MEASURED: stem start is 1.100 m off
  // the host centreline (was 0.100), beyond snapRadius — no T detected.
  it('PINNED DEFECT — move host −1m z: stem does NOT extend (stem→host centreline 1.100 m), T-join not re-formed', () => {
    _seq = 0;
    const hMoved = mk([0, -1], [10, -1], 0.2); // host after the user move
    const s = S();

    // (a) Baseline extension: nothing moved the stem.
    const gap = distToLine(s.baseLine[0], hMoved.baseLine[0], hMoved.baseLine[1]);
    expect(gap).toBeCloseTo(1.1, 6);                        // DESIRED: ≤ 0.1 (host face)

    // (b) Re-mitre: resolver pass finds no junction for the stem start.
    const res = WallJoinResolver.resolveLevel([hMoved, s], { snapRadius: SNAP });
    const js = res.get(s.id);
    expect(js?.startMN ?? null).toBeNull();                 // DESIRED: not null
    const resolvedStart = (js?.baseLine?.[0] as any) ?? s.baseLine[0];
    const residual = distToLine(resolvedStart, hMoved.baseLine[0], hMoved.baseLine[1]);
    expect(residual).toBeCloseTo(1.1, 6);                   // DESIRED: ≈ 0.1
  });
});
