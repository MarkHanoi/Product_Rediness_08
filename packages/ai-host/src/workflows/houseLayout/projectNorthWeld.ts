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

// §ONE-FRAME-MINT (PREVIEW↔EXECUTION PARITY, ADR-0073 §Decision-2 / ADR-0075 PC4,
// 2026-06-18) — the closing half of the rectify defect (spike §5.1 candidate 2).
//
// THE DEFECT: step (2) rectifies the de-rotated DRAWN shell (snap near-axis edges to an
// EXACT axis, up to 0.50 m/edge) and step (3) welds partitions onto that RECTIFIED shell.
// But the AUTHORITATIVE perimeter the executor BUILDS + hosts is the un-rectified DRAWN
// shell (`shellWallsWorld` is discarded at the call site). So a partition endpoint that
// welded onto the rectified edge lands, after re-rotation, ~0.50 m off the DRAWN edge — and
// the re-rotation lever arm amplifies that into the founder's ~1.5 m ground PIVOT off the
// previewed line (§DIAG-PARITY ground latMax=1504mm, upper latMax=0). The seam still CLOSES
// (partition meets rectified shell) but against a perimeter that is never built.
//
// THE FIX (parametric transfer, keeps the drawn shell authoritative): after the weld, take
// every partition endpoint that landed ON a RECTIFIED shell edge, read its fraction t along
// that edge, and relocate it to the SAME fraction t on the corresponding DRAWN shell edge.
// Rectified edge i ↔ drawn edge i (1:1 — `rectifyShellRing` preserves vertex order and
// `ringToWalls` preserves edge order). Net: the partition end now meets the DRAWN perimeter
// (what is built + previewed) at the same place, so it no longer pivots; the in-frame weld
// TOPOLOGY (which edge each end terminates on, and at what fraction) is preserved, so room
// detection still closes every seam. Only endpoints WITHIN `onEdgeTolM` of a rectified edge
// are transferred — a genuinely interior endpoint (metres from any shell edge) is untouched.
//
// On an axis-aligned plate this is unreachable (θ=0 short-circuits); when reached, a clean
// rectangle rectifies to ≈ no-op (rectified edge ≈ drawn edge) ⇒ the transfer moves nothing.
// Pure + deterministic.
function rebaseEndpointsToDrawnShell(
    welded: ReadonlyArray<WeldWall>,
    rectifiedRing: ReadonlyArray<XZ>,
    drawnRing: ReadonlyArray<XZ>,
    onEdgeTolM = 0.05,
): WeldWall[] {
    const n = rectifiedRing.length;
    if (n < 3 || drawnRing.length !== n) {
        return welded.map(w => ({ id: w.id, start: { ...w.start }, end: { ...w.end } }));
    }
    // For a point p, find the rectified edge it lies ON (perp ≤ onEdgeTolM and the foot is
    // strictly inside the span), then return the SAME-fraction point on the drawn edge. If no
    // rectified edge owns p (interior endpoint, or a corner shared by two edges), return p
    // unchanged — corners already coincide between rectified + drawn rings within the rectify
    // tolerance, and an interior endpoint must not be dragged to the shell.
    const CORNER_EPS_M = 0.30;   // §PERIM-CORNER-SNAP — covers the full rectify corner delta (≤0.5m/edge)
    const transfer = (p: XZ): XZ => {
        // §PERIM-CORNER-SNAP (founder 2026-06-18) — a welded partition end that TERMINATES
        // AT a perimeter corner is skipped by the strict-interior edge test below (t≈0/1).
        // On a tilted edge the rectified corner ≠ the drawn corner (rectify moves the vertex
        // ≤0.5m), so such an end would land off the BUILT perimeter (= the DRAWN shell) → the
        // open exterior-corner gap (§DIAG-PERIM-CORNER-WHOLE, ~134mm). Snap it to the nearest
        // DRAWN corner vertex (within ε) FIRST — the perimeter stays exactly on the drawn/
        // previewed line (NO parity break); only the partition END moves, onto the previewed
        // corner it should meet. Mid-edge ends (metres from any vertex) fall through to the
        // unchanged edge-fraction transfer. Must precede the edge loop: the loop can otherwise
        // slide a corner end to a wrong fraction on the drawn edge (measured 192mm vs 0mm).
        let bestV = -1, bestVD = CORNER_EPS_M;
        for (let i = 0; i < n; i++) {
            const d = Math.hypot(p.x - drawnRing[i]!.x, p.z - drawnRing[i]!.z);
            if (d < bestVD) { bestVD = d; bestV = i; }
        }
        if (bestV >= 0) return { x: drawnRing[bestV]!.x, z: drawnRing[bestV]!.z };
        let bestPerp = onEdgeTolM;
        let bestT = -1, bestEdge = -1;
        for (let i = 0; i < n; i++) {
            const a = rectifiedRing[i]!, b = rectifiedRing[(i + 1) % n]!;
            const dx = b.x - a.x, dz = b.z - a.z;
            const len2 = dx * dx + dz * dz;
            if (len2 < 1e-12) continue;
            let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2;
            // Require the foot strictly inside the span — corners (t≈0/1) are shared by two
            // edges and are left to coincide naturally (avoids ambiguous double-ownership).
            if (t <= 1e-6 || t >= 1 - 1e-6) continue;
            const fx = a.x + t * dx, fz = a.z + t * dz;
            const perp = Math.hypot(p.x - fx, p.z - fz);
            if (perp < bestPerp) { bestPerp = perp; bestT = t; bestEdge = i; }
        }
        if (bestEdge < 0) return { x: p.x, z: p.z };
        const da = drawnRing[bestEdge]!, db = drawnRing[(bestEdge + 1) % n]!;
        return { x: da.x + bestT * (db.x - da.x), z: da.z + bestT * (db.z - da.z) };
    };
    return welded.map(w => ({ id: w.id, start: transfer(w.start), end: transfer(w.end) }));
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
    // §ONE-FRAME-MINT — when true, welded partition endpoints that landed on a RECTIFIED
    // shell edge are transferred parametrically onto the corresponding DRAWN shell edge, so
    // the partition meets the perimeter the executor actually BUILDS (the un-rectified drawn
    // shell) → no ground pivot off the previewed line. Default OFF ⇒ byte-identical to the
    // prior behaviour (rectified-shell weld); the executor opts in for the ground plate.
    opts?: { rebaseToDrawnShell?: boolean },
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

    // (3.5) §ONE-FRAME-MINT — transfer welded partition endpoints from the RECTIFIED shell
    //       onto the DRAWN shell (same fraction along the corresponding edge) so the partition
    //       meets the perimeter the executor BUILDS, not the discarded rectified one. Done in
    //       PN frame BEFORE the re-rotate so the rigid +θ then carries it onto the drawn WORLD
    //       ring. Gated (default off) ⇒ no change to existing callers; the executor opts in for
    //       the ground plate. NOTE: drawn ring = `shellRingPN` (de-rotated DRAWN, NOT rectified).
    const weldedPNFinal = opts?.rebaseToDrawnShell
        ? rebaseEndpointsToDrawnShell(weldedPN, rectifiedPN, shellRingPN)
        : weldedPN;

    // (4) Rotate the welded assembly (partitions + rectified shell) back to WORLD by
    //     +θ about the SAME pivot — ONE rigid transform. Coincidence preserved.
    const reRot = (p: XZ): XZ => rotatePt(p, thetaRad, pivot);
    const partitions: WeldWall[] = weldedPNFinal.map(w => ({ id: w.id, start: reRot(w.start), end: reRot(w.end) }));
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
    // §ONE-FRAME-MINT — transfer the welded boundary ends onto the DRAWN shell too, so an
    // open-plan splitter meets the built perimeter the same as the partitions. Default off.
    rebaseToDrawnShell?: boolean,
): WeldWall | null {
    // A lone boundary: shell-snap only, no self-weld (partitionWeldTolM: 0) — matches
    // the legacy `_weldGroundPartitions` boundary handling.
    const res = projectNorthWeld([boundaryWorld], shellWallsWorld, frame, {
        ...(shellSnapTolM !== undefined ? { shellSnapTolM } : {}),
        partitionWeldTolM: 0,
    }, rebaseToDrawnShell ? { rebaseToDrawnShell: true } : undefined);
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
