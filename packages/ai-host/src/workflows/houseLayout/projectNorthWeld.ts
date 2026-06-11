// §PROJECT-NORTH (ADR-0070 Model B, SPEC-PROJECT-NORTH-AUTHORING-FRAME) —
// RIGID-TRANSFORM-LAST weld.
//
// THE BUG (confirmed): the D-TGL engine tiles interior partitions in the
// principal-axis (Project-North) frame, then rotates the emitted geometry to WORLD
// (true-north). The shell ring it welds those partitions against is the WORLD
// footprint (NOT round-tripped through the same rotate/grid). On a rotated plate the
// two frames don't agree rigidly, so perimeter-terminating partition endpoints land
// OFF the world ring by a RESIDUAL that exceeds the room-detector corner-snap → open
// seam → room-detection floods across the gap → adjacent rooms MERGE (the rotated-plate
// "Room NN-xxx" generic-name blobs). Today this is patched by ever-widening weld
// tolerances (a fragile band-aid).
//
// HONEST SCOPE (verified at θ=0, ADR-0070 corrected): this dissolves the GEOMETRIC SEAM
// RESIDUAL only — the rotated-plate ROOM-MERGE. The sealed-room (no door) +
// §TOPO-HARD-REJECT [circulation] verdicts reproduce IDENTICALLY on an axis-aligned
// plate of the same program — they are pre-weld ENGINE layout-quality decisions (door
// placement / hard-topology gate), NOT downstream of the residual; a weld cannot change
// them. They stay on the subdivider/door-placement work.
//
// THE FIX (RIGID-TRANSFORM-LAST): construct + weld + seal in the axis-aligned
// Project-North frame (residual = 0), then apply the project→true-north rotation as
// ONE rigid transform LAST. A rigid transform preserves coincidence ⇒ closed seams
// stay closed at any θ.
//
// Concretely, this module:
//   1. De-rotates the WORLD partitions + WORLD shell by −θ about the pivot →
//      Project-North.
//   2. RECTIFIES the de-rotated shell ring (snap near-axis edges to EXACT axis,
//      merge collinear/short edges) — the load-bearing step (SPEC §3.3): the ground
//      reuses the user's drawn shell, a MODEL mismatch a de-rotation alone preserves;
//      rectification makes the shell the engine tiles against and the shell the
//      partitions weld to the SAME clean polygon → zero residual.
//   3. Welds partitions onto the RECTIFIED shell at the EXISTING weld's ORIGINAL
//      TIGHT tolerance (residual is now ~0, so no widening is needed).
//   4. Rotates the welded partitions + the rectified shell back by +θ about the
//      pivot → WORLD geometry.
//
// θ = 0 ⇒ identity ⇒ BYTE-IDENTICAL to today (the whole module short-circuits to a
// pass-through). The flag is owned by the editor executor; this pure core is only
// reached when the executor decides θ ≠ 0 and the flag is ON.
//
// PURE + DETERMINISTIC L2 — no stores, no DOM, no THREE. (ADR-0061 I2: no Date.now /
// Math.random.)

import { rotatePt, principalAxisAngle } from '../apartmentLayout/tgl/rectDecomposition.js';
import { weldPartitionsToShell, type WeldWall, type XZ } from './weldPartitionsToShell.js';

/** The Project-North authoring frame derived from a drawn boundary (SPEC §2). */
export interface ProjectNorthFrame {
    /** project→true-north angle (rad). The principal axis of the drawn boundary. */
    readonly thetaRad: number;
    /** Project Base Point — the boundary centroid the rotation pivots about (world m). */
    readonly pivot: XZ;
}

/**
 * Derive the Project-North frame from a world footprint ring (SPEC §2). θ = the
 * boundary's principal axis (the dominant-edge orientation reduced to (−π/4, π/4]);
 * pivot = the ring centroid. A near-axis-aligned plate (|θ| < ~0.6°) collapses to
 * θ = 0 (identity) — matching the executor's existing §DIAG-EXEC-ROTATION threshold
 * (`Math.abs(rawAngle) >= 0.01`).
 */
export function deriveProjectNorthFrame(footprintWorld: ReadonlyArray<XZ>): ProjectNorthFrame {
    const raw = principalAxisAngle(footprintWorld as ReadonlyArray<{ x: number; z: number }>);
    const thetaRad = Math.abs(raw) >= 0.01 ? raw : 0;
    let cx = 0, cz = 0;
    for (const p of footprintWorld) { cx += p.x; cz += p.z; }
    const n = footprintWorld.length || 1;
    return { thetaRad, pivot: { x: cx / n, z: cz / n } };
}

/**
 * RECTIFY a (de-rotated, near-axis) shell ring into a CLEAN axis-aligned rectilinear
 * polygon (SPEC §3.3). For every vertex, snap whichever of its two incident edges is
 * "near-axis" so that edge becomes exactly horizontal or vertical: an edge whose run
 * is dominantly along X is forced to constant Z (its two endpoints share the mean Z);
 * an edge dominantly along Z is forced to constant X. This is done as a global pass
 * that resolves each vertex to the axis values of its incident edges, so a rectangle
 * collapses to its 4 exact corner coordinates and the residual model-mismatch is
 * removed. Returns the rectified vertices in input order.
 *
 * `snapTolM` — only edges whose off-axis deviation is within this band are rectified;
 * a genuinely diagonal edge (a chamfer the user really drew) is left untouched so we
 * never corrupt intentional geometry. Default 0.50 m (covers post-miter drift +
 * de-rotation float dust; well below any real diagonal feature).
 */
export function rectifyShellRing(ring: ReadonlyArray<XZ>, snapTolM = 0.50): XZ[] {
    const n = ring.length;
    if (n < 3) return ring.map(p => ({ x: p.x, z: p.z }));

    // Classify each edge i = (ring[i] → ring[i+1]) as 'x' (horizontal, constant Z),
    // 'z' (vertical, constant X), or 'd' (diagonal — leave alone).
    type Axis = 'x' | 'z' | 'd';
    const edgeAxis: Axis[] = [];
    const edgeConst: number[] = [];   // the axis value the edge should collapse to
    for (let i = 0; i < n; i++) {
        const a = ring[i]!, b = ring[(i + 1) % n]!;
        const dx = Math.abs(b.x - a.x), dz = Math.abs(b.z - a.z);
        if (dx >= dz) {
            // dominantly horizontal → constant Z, IF the Z-deviation is small enough.
            if (dz <= snapTolM) { edgeAxis.push('x'); edgeConst.push((a.z + b.z) / 2); }
            else { edgeAxis.push('d'); edgeConst.push(0); }
        } else {
            if (dx <= snapTolM) { edgeAxis.push('z'); edgeConst.push((a.x + b.x) / 2); }
            else { edgeAxis.push('d'); edgeConst.push(0); }
        }
    }

    // Each vertex i is shared by edge (i-1) and edge i. Resolve its X from whichever
    // incident edge is vertical ('z' → constant X) and its Z from whichever is
    // horizontal ('x' → constant Z). A vertex flanked by one horizontal + one vertical
    // edge (the rectilinear corner case) gets BOTH coordinates rectified exactly.
    const out: XZ[] = [];
    for (let i = 0; i < n; i++) {
        const prev = (i - 1 + n) % n;
        const orig = ring[i]!;
        let x = orig.x, z = orig.z;
        for (const e of [prev, i]) {
            if (edgeAxis[e] === 'z') x = edgeConst[e]!;
            else if (edgeAxis[e] === 'x') z = edgeConst[e]!;
        }
        out.push({ x, z });
    }
    return out;
}

/** Closed ring (world m) → one WeldWall per edge (axis-aligned id ordering preserved). */
function ringToWalls(ring: ReadonlyArray<XZ>, ids?: ReadonlyArray<string>): WeldWall[] {
    const out: WeldWall[] = [];
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
        out.push({ id: ids?.[i] ?? `pn-shell-${i}`, start: { x: a.x, z: a.z }, end: { x: b.x, z: b.z } });
    }
    return out;
}

export interface ProjectNorthWeldResult {
    /** Welded partitions in WORLD coords (same ids; dropped degenerates excluded). */
    readonly partitions: WeldWall[];
    /** The rectified shell ring rotated back to WORLD (the seal/window reference). */
    readonly shellRingWorld: XZ[];
    /** The rectified shell walls (id-aligned with the input `shellWalls`) in WORLD. */
    readonly shellWallsWorld: WeldWall[];
    /** θ actually applied (0 ⇒ identity pass-through was taken). */
    readonly thetaRad: number;
}

/**
 * §PROJECT-NORTH core. Weld the WORLD partitions to the WORLD shell using the
 * RIGID-TRANSFORM-LAST rule. The shell is expressed as one WeldWall per ring edge
 * (the executor passes its drawn/minted shell walls, id-aligned with the perimeter).
 *
 *   - `frame.thetaRad === 0` ⇒ identity: weld in world at the SAME tolerances the
 *     legacy path used (pass `weldOptions` through) → byte-identical to today.
 *   - `frame.thetaRad !== 0` ⇒ de-rotate → rectify → weld TIGHT → re-rotate.
 *
 * The shell-wall id order MUST match the ring edge order so the returned
 * `shellWallsWorld` carry the original ids (windows/entrance resolve against them).
 */
export function projectNorthWeld(
    partitionsWorld: ReadonlyArray<WeldWall>,
    shellWallsWorld: ReadonlyArray<WeldWall>,
    frame: ProjectNorthFrame,
    /** Tolerances for the IN-FRAME weld. Default = `weldPartitionsToShell`'s own
     *  defaults (the EXISTING weld) — applied here in the AXIS-ALIGNED Project-North
     *  frame, where the snap runs strictly ALONG an axis (no §WJ-SKEW diagonal drag)
     *  so the same tolerance closes the seam SAFELY. Pass an override only to probe. */
    tightWeld?: { shellSnapTolM?: number; partitionWeldTolM?: number },
): ProjectNorthWeldResult {
    const { thetaRad, pivot } = frame;

    // Build the shell ring (ordered vertices) from the ordered shell walls.
    const shellRingWorld: XZ[] = shellWallsWorld.map(w => ({ x: w.start.x, z: w.start.z }));
    const shellIds = shellWallsWorld.map(w => w.id);

    if (thetaRad === 0 || shellRingWorld.length < 3) {
        // Identity — weld in world, no de-rotate/rectify. Byte-identical to legacy.
        const welded = weldPartitionsToShell(partitionsWorld, shellWallsWorld);
        return {
            partitions: welded,
            shellRingWorld,
            shellWallsWorld: shellWallsWorld.map(w => ({ ...w })),
            thetaRad: 0,
        };
    }

    // (1) De-rotate partitions + shell into Project-North (axis-aligned authoring frame).
    const deRot = (p: XZ): XZ => rotatePt(p, -thetaRad, pivot);
    const partsPN: WeldWall[] = partitionsWorld.map(w => ({ id: w.id, start: deRot(w.start), end: deRot(w.end) }));
    const shellRingPN: XZ[] = shellRingWorld.map(deRot);

    // (2) RECTIFY the de-rotated shell so it is a clean axis-aligned rectilinear polygon
    //     (SPEC §3.3 — breaks the model mismatch the ground's drawn shell carries).
    const rectifiedPN = rectifyShellRing(shellRingPN);
    const shellWallsPN = ringToWalls(rectifiedPN, shellIds);

    // (3) Weld in Project-North. The snap now runs strictly ALONG an axis (the frame
    //     is axis-aligned) so the existing weld's own defaults close the seam without
    //     the §WJ-SKEW diagonal-drag hazard that forced the world-frame band-aids.
    const weldedPN = weldPartitionsToShell(
        partsPN,
        shellWallsPN,
        tightWeld
            ? {
                ...(tightWeld.shellSnapTolM !== undefined ? { shellSnapTolM: tightWeld.shellSnapTolM } : {}),
                ...(tightWeld.partitionWeldTolM !== undefined ? { partitionWeldTolM: tightWeld.partitionWeldTolM } : {}),
            }
            : {},
    );

    // (4) Rotate the welded assembly (partitions + rectified shell) back to WORLD by
    //     +θ about the SAME pivot — ONE rigid transform. Coincidence preserved.
    const reRot = (p: XZ): XZ => rotatePt(p, thetaRad, pivot);
    const partitions: WeldWall[] = weldedPN.map(w => ({ id: w.id, start: reRot(w.start), end: reRot(w.end) }));
    const rectifiedWorld = rectifiedPN.map(reRot);
    const shellWallsWorldOut = shellWallsPN.map(w => ({ id: w.id, start: reRot(w.start), end: reRot(w.end) }));

    return {
        partitions,
        shellRingWorld: rectifiedWorld,
        shellWallsWorld: shellWallsWorldOut,
        thetaRad,
    };
}

/**
 * Convenience: weld a SINGLE wall (e.g. an open-plan boundary line) onto the shell
 * in Project-North. Shell-snap only (no self-weld). Returns the welded wall in WORLD,
 * or null if it collapsed.
 */
export function projectNorthWeldBoundary(
    boundaryWorld: WeldWall,
    shellWallsWorld: ReadonlyArray<WeldWall>,
    frame: ProjectNorthFrame,
    shellSnapTolM?: number,
): WeldWall | null {
    // A lone boundary: shell-snap only, no self-weld (partitionWeldTolM: 0) — matches
    // the legacy `_weldGroundPartitions` boundary handling.
    const res = projectNorthWeld([boundaryWorld], shellWallsWorld, frame, {
        ...(shellSnapTolM !== undefined ? { shellSnapTolM } : {}),
        partitionWeldTolM: 0,
    });
    return res.partitions[0] ?? null;
}

/**
 * Thin re-export shape the editor adapter (`HouseLayoutExecutor`) consumes: it maps a
 * `LayoutCommandSet`'s wall payload + boundary lines through `projectNorthWeld` /
 * `projectNorthWeldBoundary`, reconciling dropped openings exactly as the legacy
 * `_weldGroundPartitions` did. Kept here only as the documented entry point; the
 * executor owns the LayoutCommandSet plumbing (it lives in apps/editor, not L2).
 */
export type { WeldWall, XZ } from './weldPartitionsToShell.js';

/**
 * Full set-level weld used by the headless probe + (mirrored) by the executor. Takes
 * the raw partition baselines + boundary baselines + shell walls and returns the
 * welded partitions + welded boundaries + the rectified shell, all in WORLD. The
 * executor re-implements the LayoutCommandSet mapping (it owns opening reconciliation);
 * this helper exists so the PURE geometry is testable in ai-host.
 */
export function projectNorthWeldSet(
    partitionsWorld: ReadonlyArray<WeldWall>,
    boundariesWorld: ReadonlyArray<WeldWall>,
    shellWallsWorld: ReadonlyArray<WeldWall>,
    frame: ProjectNorthFrame,
    tightWeld?: { shellSnapTolM?: number; partitionWeldTolM?: number },
): { partitions: WeldWall[]; boundaries: WeldWall[]; shellRingWorld: XZ[]; shellWallsWorld: WeldWall[]; thetaRad: number } {
    const core = projectNorthWeld(partitionsWorld, shellWallsWorld, frame, tightWeld);
    const boundaries = boundariesWorld
        .map(b => projectNorthWeldBoundary(b, shellWallsWorld, frame, tightWeld?.shellSnapTolM) ?? b);
    return {
        partitions: core.partitions,
        boundaries,
        shellRingWorld: core.shellRingWorld,
        shellWallsWorld: core.shellWallsWorld,
        thetaRad: core.thetaRad,
    };
}
