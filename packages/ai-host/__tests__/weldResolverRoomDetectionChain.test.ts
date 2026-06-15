// @vitest-environment happy-dom
//
// §DIAG-SEAL / §WELD-RESOLVER-CHAIN — the MISSING integration link.
//
// The existing groundShellWeld.test.ts proves weld → RoomDetection seals rooms when
// detection reads the WELDED baselines directly. But in PRODUCTION the editor's
// WallJoinResolver runs BETWEEN the weld and detection (WallRebuildCoordinator._flush →
// WallJoinResolver.resolveLevel → store.update(baseLine) → RoomDetectionEngine reads the
// MUTATED baseLine). This is the unexamined link the founder flagged: the resolver can
// re-trim / consensus-move / drop the very partition endpoints the weld placed on the
// shell, re-opening the gap → RoomDetection floods → "1 merged room".
//
// This suite runs the EXACT production chain headlessly:
//   weldPartitionsToShell(parts, shell)            // command-build (executor)
//     → WallData[] (shell ∪ welded parts)
//     → WallJoinResolver.resolveLevel(walls, {snapRadius})   // render-time _flush
//     → apply trimmed baseLines back (store.update)
//     → RoomDetectionEngine.detectRoomsForLevel(...)         // final redetect
// and asserts the detected room count survives the resolver.
//
// happy-dom: RoomDetectionEngine + WallJoinResolver transitively touch `window`.

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { RoomDetectionEngine } from '@pryzm/room-topology';
import { WallJoinResolver } from '@pryzm/geometry-wall';
import type { WallData } from '@pryzm/geometry-wall';
import { weldPartitionsToShell, type WeldWall, type XZ } from '../src/workflows/houseLayout/weldPartitionsToShell.js';

// §UPPER-SHELL-WELD-COND (2026-06-15) — the open-seam predicate the executor's
// `_countOpenSeams` uses to decide whether the bit-exact upper plate actually sealed.
// This MIRRORS HouseLayoutExecutor._countOpenSeams exactly (perim ∪ partition-span,
// 0.30 m corner-snap) so this suite can assert the conditional-weld decision headlessly.
const SEAL_GRID_M = 0.30;
function distToSeg(px: number, pz: number, a: XZ, b: XZ): number {
    const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((px - a.x) * dx + (pz - a.z) * dz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a.x + t * dx), pz - (a.z + t * dz));
}
function countOpenSeams(parts: WeldWall[], shell: WeldWall[]): number {
    type Ep = { id: string; x: number; z: number };
    const eps: Ep[] = [];
    for (const p of parts) { eps.push({ id: p.id, x: p.start.x, z: p.start.z }, { id: p.id, x: p.end.x, z: p.end.z }); }
    let open = 0;
    for (const ep of eps) {
        let nearPerim = Infinity;
        for (const sw of shell) { const d = distToSeg(ep.x, ep.z, sw.start, sw.end); if (d < nearPerim) nearPerim = d; }
        let nearSpan = Infinity;
        for (const o of parts) { if (o.id === ep.id) continue; const d = distToSeg(ep.x, ep.z, o.start, o.end); if (d < nearSpan) nearSpan = d; }
        if (Math.min(nearPerim, nearSpan) > SEAL_GRID_M) open++;
    }
    return open;
}

// ── Production-chain helpers ──────────────────────────────────────────────────

let _seq = 0;
function toWall(w: WeldWall, createdAt = ++_seq, thickness = 0.2): WallData {
    return {
        id: w.id, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ x: w.start.x, y: 0, z: w.start.z }, { x: w.end.x, y: 0, z: w.end.z }],
        height: 3, thickness, baseOffset: 0, openings: [],
        metadata: { createdAt },
    } as unknown as WallData;
}

/**
 * Run WallJoinResolver.resolveLevel and APPLY the trimmed baselines back to the wall
 * records — exactly what WallRebuildCoordinator._flush does (store.update({baseLine})).
 * Returns the post-resolver wall list (the geometry RoomDetection actually reads).
 */
function resolveAndApply(walls: WallData[], snapRadius: number): WallData[] {
    const adjustments = WallJoinResolver.resolveLevel(walls, { snapRadius });
    return walls.map(w => {
        const adj = adjustments.get(w.id);
        if (!adj) return w;
        const [s, e] = adj.baseLine as [THREE.Vector3, THREE.Vector3];
        return { ...w, baseLine: [{ x: s.x, y: s.y, z: s.z }, { x: e.x, y: e.y, z: e.z }] } as WallData;
    });
}

function detect(walls: WallData[]): number {
    const store = { getByLevel: (_l: string) => walls } as unknown as ConstructorParameters<typeof RoomDetectionEngine>[0];
    return new RoomDetectionEngine(store).detectRoomsForLevel('L', 0, 2.7).length;
}

/**
 * §DIAG-SEAL (headless) — for every partition endpoint, the distance to the nearest
 * perimeter (shell) wall body and to the nearest OTHER partition endpoint, AFTER the
 * resolver. Mirrors the §DIAG-SEAL instrumentation added to the editor so a residual gap
 * shows numerically.
 */
function diagSeal(shellIds: Set<string>, walls: WallData[]): {
    maxPerimeterGap: number; maxPartitionGap: number; lines: string[];
} {
    const partEps: Array<{ id: string; side: string; x: number; z: number }> = [];
    for (const w of walls) {
        if (shellIds.has(w.id)) continue;
        partEps.push({ id: w.id, side: 'start', x: w.baseLine[0].x, z: w.baseLine[0].z });
        partEps.push({ id: w.id, side: 'end', x: w.baseLine[1].x, z: w.baseLine[1].z });
    }
    const distToSeg = (px: number, pz: number, a: { x: number; z: number }, b: { x: number; z: number }): number => {
        const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
        let t = len2 > 0 ? ((px - a.x) * dx + (pz - a.z) * dz) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (a.x + t * dx), pz - (a.z + t * dz));
    };
    let maxPerimeterGap = 0, maxPartitionGap = 0;
    const lines: string[] = [];
    for (const ep of partEps) {
        let nearestPerim = Infinity;
        for (const w of walls) {
            if (!shellIds.has(w.id)) continue;
            const d = distToSeg(ep.x, ep.z, { x: w.baseLine[0].x, z: w.baseLine[0].z }, { x: w.baseLine[1].x, z: w.baseLine[1].z });
            if (d < nearestPerim) nearestPerim = d;
        }
        let nearestPart = Infinity;
        for (const o of partEps) {
            if (o.id === ep.id && o.side === ep.side) continue;
            if (o.id === ep.id) continue;
            const d = Math.hypot(ep.x - o.x, ep.z - o.z);
            if (d < nearestPart) nearestPart = d;
        }
        // The endpoint "seals" if it is within the detector node grid (0.02 m) of EITHER
        // a perimeter wall OR another partition endpoint.
        const sealGap = Math.min(nearestPerim, nearestPart);
        if (nearestPerim !== Infinity) maxPerimeterGap = Math.max(maxPerimeterGap, nearestPerim);
        if (nearestPart !== Infinity) maxPartitionGap = Math.max(maxPartitionGap, Math.min(nearestPart, nearestPerim));
        lines.push(`${ep.id}(${ep.side}) perim=${nearestPerim.toFixed(4)}m part=${nearestPart.toFixed(4)}m seal=${sealGap.toFixed(4)}m`);
    }
    return { maxPerimeterGap, maxPartitionGap, lines };
}

// Build a closed axis-aligned rectangular perimeter as 4 shell walls, then rotate the
// WHOLE plate (shell + partitions) by `angleRad` about the origin — modelling the
// minted upper perimeter ring (storey.footprint, world frame) of a rotated plate.
function rot(p: { x: number; z: number }, a: number): { x: number; z: number } {
    const c = Math.cos(a), s = Math.sin(a);
    return { x: p.x * c - p.z * s, z: p.x * s + p.z * c };
}

describe('§WELD-RESOLVER-CHAIN — resolver must not re-open the welded seal', () => {
    // A simple but representative interior layout: a 10×8 rectangle subdivided into 4
    // rooms by a cross of partitions meeting at one interior junction (5,4):
    //   spine vertical x=5 (z 0→8), spine horizontal z=4 (x 0→10).
    // This is the canonical "engine emits partitions that should land on the perimeter +
    // meet at an interior junction" case. On the AXIS-ALIGNED plate the endpoints are
    // bit-exact; on the ROTATED plate they carry a principal-axis residual the weld must
    // close and the resolver must not re-open.
    const makePlate = (angleRad: number, residual: number) => {
        // Perimeter ring (minted, world frame) — exact rectangle, then rotated.
        const ringPts = [
            { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 8 },
        ].map(p => rot(p, angleRad));
        const shell: WeldWall[] = ringPts.map((a, i) => {
            const b = ringPts[(i + 1) % ringPts.length]!;
            return { id: `shell-${i}`, start: a, end: b };
        });
        // Interior partitions in the LAYOUT (axis-aligned) frame, with a `residual` drift
        // applied to the endpoints that SHOULD land on the perimeter / at the junction —
        // exactly the §WJ-SKEW residual the engine's rotate-back leaves. Then rotated to world.
        const r = residual;
        const partsLayout: WeldWall[] = [
            // vertical spine x=5, z 0→8 (both ends should hit the shell)
            { id: 'pv', start: { x: 5, z: 0 - r }, end: { x: 5 + r, z: 8 + r } },
            // horizontal-left z=4, x 0→5 (left end on shell, right end at junction)
            { id: 'phl', start: { x: 0 - r, z: 4 }, end: { x: 5 - r, z: 4 + r } },
            // horizontal-right z=4, x 5→10 (left end at junction, right end on shell)
            { id: 'phr', start: { x: 5 + r, z: 4 - r }, end: { x: 10 + r, z: 4 } },
        ];
        const parts: WeldWall[] = partsLayout.map(p => ({
            id: p.id, start: rot(p.start, angleRad), end: rot(p.end, angleRad),
        }));
        return { shell, parts };
    };

    const SNAP_RADII = [0.05, 0.2, 0.35, 0.5]; // span the camera-zoom band the editor uses

    it('AXIS-ALIGNED plate: weld → resolver → detection keeps all 4 rooms (baseline)', () => {
        const { shell, parts } = makePlate(0, 0);
        const welded = weldPartitionsToShell(parts, shell);
        const shellIds = new Set(shell.map(s => s.id));
        const walls = [...shell.map(s => toWall(s)), ...welded.map(p => toWall(p))];
        const before = detect(walls);
        for (const snap of SNAP_RADII) {
            const post = resolveAndApply(walls.map(w => ({ ...w, baseLine: [{ ...w.baseLine[0] }, { ...w.baseLine[1] }] } as WallData)), snap);
            const after = detect(post);
            const diag = diagSeal(shellIds, post);
            // eslint-disable-next-line no-console
            console.log(`[§DIAG-SEAL axis snap=${snap}] before=${before} after=${after} maxPerimGap=${diag.maxPerimeterGap.toFixed(4)} maxPartGap=${diag.maxPartitionGap.toFixed(4)}`);
            expect(after).toBe(before);
        }
        expect(before).toBe(4);
    });

    it('ROTATED plate (~-44deg): the FULL chain must keep the rooms the weld seals (the live defect)', () => {
        const angle = -44 * Math.PI / 180;
        const residual = 0.08; // 80 mm principal-axis residual (> 20 mm node grid)
        const { shell, parts } = makePlate(angle, residual);
        const shellIds = new Set(shell.map(s => s.id));

        // The weld is supposed to seal the rooms. Measure detection on the WELDED geometry
        // (what groundShellWeld.test.ts asserts) — the "should-be" baseline.
        const welded = weldPartitionsToShell(parts, shell);
        const weldedWalls = [...shell.map(s => toWall(s)), ...welded.map(p => toWall(p))];
        const weldedRooms = detect(weldedWalls.map(w => ({ ...w, baseLine: [{ ...w.baseLine[0] }, { ...w.baseLine[1] }] } as WallData)));
        // eslint-disable-next-line no-console
        console.log(`[§DIAG-SEAL rotated] WELD-ONLY detected=${weldedRooms} (pre-resolver, what the weld test sees)`);

        // Now run the resolver (the production render-time step) and re-detect.
        for (const snap of SNAP_RADII) {
            const fresh = weldedWalls.map(w => ({ ...w, baseLine: [{ ...w.baseLine[0] }, { ...w.baseLine[1] }] } as WallData));
            const post = resolveAndApply(fresh, snap);
            const after = detect(post);
            const diag = diagSeal(shellIds, post);
            // eslint-disable-next-line no-console
            console.log(
                `[§DIAG-SEAL rotated snap=${snap}] weldOnly=${weldedRooms} afterResolver=${after} ` +
                `maxPerimGap=${diag.maxPerimeterGap.toFixed(4)} maxPartGap=${diag.maxPartitionGap.toFixed(4)}\n  ` +
                diag.lines.join('\n  '),
            );
        }

        // ASSERTION: the resolver must not destroy the seal. At the camera-zoom snap radii
        // the editor actually uses, detection after the resolver must equal the welded count.
        const worstAfter = Math.min(
            ...SNAP_RADII.map(snap => detect(resolveAndApply(
                weldedWalls.map(w => ({ ...w, baseLine: [{ ...w.baseLine[0] }, { ...w.baseLine[1] }] } as WallData)), snap,
            ))),
        );
        expect(weldedRooms).toBeGreaterThanOrEqual(3);   // weld itself seals (sanity)
        expect(worstAfter).toBeGreaterThanOrEqual(weldedRooms);
    });

    // ── HYPOTHESIS (d): a residual LARGER than the weld snap tol (0.30 m) AND the detector
    // corner-snap (0.30 m). If the engine's principal-axis residual exceeds 0.30 m the weld
    // CANNOT reach the perimeter (shellSnapTolM=0.30), the endpoint stays >0.30 m off, the
    // detector's _snapNearbyCorners(0.30) cannot fuse it, and the resolver's
    // §CONSENSUS-PROXIMITY-GUARD (>0.45 m) defers it un-trimmed → the room never seals.
    it('LARGE residual (>0.30 m): exceeds BOTH weld tol AND detector snap → merge (the real failure mode)', () => {
        const angle = -44 * Math.PI / 180;
        const residual = 0.40; // 400 mm — beyond the 0.30 m weld AND detector snap
        const { shell, parts } = makePlate(angle, residual);
        const shellIds = new Set(shell.map(s => s.id));
        const welded = weldPartitionsToShell(parts, shell);
        const weldedWalls = [...shell.map(s => toWall(s)), ...welded.map(p => toWall(p))];
        const weldOnly = detect(weldedWalls.map(w => ({ ...w, baseLine: [{ ...w.baseLine[0] }, { ...w.baseLine[1] }] } as WallData)));
        for (const snap of SNAP_RADII) {
            const fresh = weldedWalls.map(w => ({ ...w, baseLine: [{ ...w.baseLine[0] }, { ...w.baseLine[1] }] } as WallData));
            const post = resolveAndApply(fresh, snap);
            const after = detect(post);
            const diag = diagSeal(shellIds, post);
            // eslint-disable-next-line no-console
            console.log(
                `[§DIAG-SEAL large-resid snap=${snap}] weldOnly=${weldOnly} afterResolver=${after} ` +
                `maxPerimGap=${diag.maxPerimeterGap.toFixed(4)} maxPartGap=${diag.maxPartitionGap.toFixed(4)}\n  ` +
                diag.lines.join('\n  '),
            );
        }
        // This documents the failure mode; not asserted as pass (it SHOWS the merge).
        // eslint-disable-next-line no-console
        console.log(`[§DIAG-SEAL large-resid] weldOnly(should-be-4)=${weldOnly}`);
    });

    // ── PASS-THROUGH raw-consensus trim — the founder's `reason=PASS-THROUGH … trimmed=3` ──
    // A near-collinear partition pair passing through a junction where a stem also attaches.
    // The §PASS-THROUGH-FLUSH branch (WallJoinResolver line ~679) trims EVERY cluster member
    // to the RAW consensusPoint (NOT projected onto the wall's own centreline, unlike the
    // non-pinned default branch). When the three crossings don't coincide, the consensus is
    // the triangle centroid → OFF every centreline → the stem rotates off the perimeter.
    it('PASS-THROUGH cluster: raw-consensus trim must not rotate a partition off its seal', () => {
        // Two near-collinear walls (a tiny ~6deg kink so |dot|>=0.985 → PASS-THROUGH) passing
        // x:0→10 near z=4, plus a vertical stem from the top shell down to the junction.
        const shell: WeldWall[] = [
            { id: 'shell-0', start: { x: 0, z: 0 }, end: { x: 10, z: 0 } },
            { id: 'shell-1', start: { x: 10, z: 0 }, end: { x: 10, z: 8 } },
            { id: 'shell-2', start: { x: 10, z: 8 }, end: { x: 0, z: 8 } },
            { id: 'shell-3', start: { x: 0, z: 8 }, end: { x: 0, z: 0 } },
        ];
        const parts: WeldWall[] = [
            { id: 'pa', start: { x: 0, z: 4.0 }, end: { x: 5, z: 4.0 } },    // left through-arm
            { id: 'pb', start: { x: 5, z: 4.0 }, end: { x: 10, z: 4.25 } },  // right through-arm (~3deg kink)
            { id: 'pstem', start: { x: 5, z: 8 }, end: { x: 5, z: 4.0 } },   // stem from top shell
        ];
        const shellIds = new Set(shell.map(s => s.id));
        const welded = weldPartitionsToShell(parts, shell);
        const weldedWalls = [...shell.map(s => toWall(s)), ...welded.map(p => toWall(p))];
        const weldOnly = detect(weldedWalls.map(w => ({ ...w, baseLine: [{ ...w.baseLine[0] }, { ...w.baseLine[1] }] } as WallData)));
        for (const snap of SNAP_RADII) {
            const fresh = weldedWalls.map(w => ({ ...w, baseLine: [{ ...w.baseLine[0] }, { ...w.baseLine[1] }] } as WallData));
            const post = resolveAndApply(fresh, snap);
            const after = detect(post);
            const diag = diagSeal(shellIds, post);
            // eslint-disable-next-line no-console
            console.log(
                `[§DIAG-SEAL passthrough snap=${snap}] weldOnly=${weldOnly} afterResolver=${after} ` +
                `maxPerimGap=${diag.maxPerimeterGap.toFixed(4)} maxPartGap=${diag.maxPartitionGap.toFixed(4)}\n  ` +
                diag.lines.join('\n  '),
            );
        }
        const worst = Math.min(...SNAP_RADII.map(snap => detect(resolveAndApply(
            weldedWalls.map(w => ({ ...w, baseLine: [{ ...w.baseLine[0] }, { ...w.baseLine[1] }] } as WallData)), snap,
        ))));
        // eslint-disable-next-line no-console
        console.log(`[§DIAG-SEAL passthrough] weldOnly=${weldOnly} worstAfterResolver=${worst}`);
        expect(worst).toBeGreaterThanOrEqual(weldOnly);
    });

    // ── SELF-CLUSTER drop — the founder's `selfCluster=2 … §WJR-INVALID skipped wall` ──
    // A SHORT partition sealing a small room: at a typical zoom snapRadius (~0.5 m) BOTH its
    // endpoints fall in ONE cluster → flagged invalid (mesh skipped). The wall's baseLine is
    // PRESERVED in the resolver result, so detection should still see it — UNLESS the other
    // cluster members are trimmed away from it. This proves whether a self-cluster drop opens
    // a detection gap.
    it('SELF-CLUSTER short partition: the small-room seal must survive the resolver', () => {
        // 10x8 plate. A small room in the corner sealed by a SHORT L of two partitions:
        //   ph: x 0->2.0 at z=2 ; pv: x=2.0 z 0->2  → a 2x2 corner room.
        // Both ends of each near (2,2) corner AND the shell corner (0,0). At snap 0.5 the
        // (2,2) junction + the two shell-touching ends can cluster.
        const shell: WeldWall[] = [
            { id: 'shell-0', start: { x: 0, z: 0 }, end: { x: 10, z: 0 } },
            { id: 'shell-1', start: { x: 10, z: 0 }, end: { x: 10, z: 8 } },
            { id: 'shell-2', start: { x: 10, z: 8 }, end: { x: 0, z: 8 } },
            { id: 'shell-3', start: { x: 0, z: 8 }, end: { x: 0, z: 0 } },
        ];
        const parts: WeldWall[] = [
            { id: 'ph', start: { x: 0, z: 2 }, end: { x: 1.0, z: 2 } },    // short — 1.0 m
            { id: 'pv', start: { x: 1.0, z: 2 }, end: { x: 1.0, z: 0 } },  // short — 2.0 m, meets ph at (1,2)
        ];
        const shellIds = new Set(shell.map(s => s.id));
        const welded = weldPartitionsToShell(parts, shell);
        const weldedWalls = [...shell.map(s => toWall(s)), ...welded.map(p => toWall(p))];
        const weldOnly = detect(weldedWalls.map(w => ({ ...w, baseLine: [{ ...w.baseLine[0] }, { ...w.baseLine[1] }] } as WallData)));
        for (const snap of SNAP_RADII) {
            const fresh = weldedWalls.map(w => ({ ...w, baseLine: [{ ...w.baseLine[0] }, { ...w.baseLine[1] }] } as WallData));
            const adj = WallJoinResolver.resolveLevel(fresh, { snapRadius: snap });
            const invalidIds = [...adj.entries()].filter(([, v]) => (v as { invalid?: boolean }).invalid).map(([k]) => k);
            const post = resolveAndApply(fresh, snap);
            const after = detect(post);
            // eslint-disable-next-line no-console
            console.log(`[§DIAG-SEAL self-cluster snap=${snap}] weldOnly=${weldOnly} afterResolver=${after} invalidFlagged=[${invalidIds.join(',')}]`);
        }
        const worst = Math.min(...SNAP_RADII.map(snap => detect(resolveAndApply(
            weldedWalls.map(w => ({ ...w, baseLine: [{ ...w.baseLine[0] }, { ...w.baseLine[1] }] } as WallData)), snap,
        ))));
        expect(worst).toBeGreaterThanOrEqual(weldOnly);
    });
});

// §UPPER-SHELL-WELD-COND — the conditional upper-floor weld decision (2026-06-15).
//
// The executor (HouseLayoutExecutor §UPPER-SHELL-WELD) used to SKIP the weld whenever
// the upper footprint was an axis-aligned rectangle, ASSUMING the engine-emitted
// partitions were already bit-exact on the minted perimeter. The founder-observed
// defect: that assumption fails when the engine emits a partition >0.30 m short of the
// shell (keystone/§PARTITION-REACH residual) — the open seam floods detection → the
// upper rooms merge + the surplus fragments go unnamed (generic "Room 01-NNN").
//
// The fix VERIFIES the seal (`_countOpenSeams`, mirrored here as `countOpenSeams`) on
// the bit-exact set; only when it finds an open seam does it fall back to the same weld
// the ground uses. These tests assert the decision: short partition ⇒ openSeams>0 ⇒ weld
// closes it (room count recovers); clean bit-exact ⇒ openSeams=0 ⇒ no weld, set unchanged.
describe('§UPPER-SHELL-WELD-COND — conditional weld on the axis-aligned upper plate', () => {
    // 10×8 axis-aligned rectangle subdivided into 4 rooms by a + of partitions at (5,4).
    const shell: WeldWall[] = [
        { id: 's0', start: { x: 0, z: 0 }, end: { x: 10, z: 0 } },
        { id: 's1', start: { x: 10, z: 0 }, end: { x: 10, z: 8 } },
        { id: 's2', start: { x: 10, z: 8 }, end: { x: 0, z: 8 } },
        { id: 's3', start: { x: 0, z: 8 }, end: { x: 0, z: 0 } },
    ];
    const cleanParts = (): WeldWall[] => [
        { id: 'pv', start: { x: 5, z: 0 }, end: { x: 5, z: 8 } },   // vertical spine, bit-exact on shell
        { id: 'phl', start: { x: 0, z: 4 }, end: { x: 5, z: 4 } },  // left arm, on shell + junction
        { id: 'phr', start: { x: 5, z: 4 }, end: { x: 10, z: 4 } }, // right arm, junction + shell
    ];

    it('CLEAN bit-exact plate: openSeams=0 → the conditional path leaves the set UNCHANGED (no weld)', () => {
        const parts = cleanParts();
        // The seal predicate the executor uses sees ZERO open seams …
        expect(countOpenSeams(parts, shell)).toBe(0);
        // … so the conditional path keeps the bit-exact set: a weld would be a no-op, but
        // the executor never even runs it. Prove the geometry is already sealed (4 rooms).
        const walls = [...shell.map(s => toWall(s)), ...parts.map(p => toWall(p))];
        expect(detect(walls)).toBe(4);
        // And the weld, if it HAD run, is a deterministic no-op (defence-in-depth).
        const welded = weldPartitionsToShell(parts, shell);
        expect(JSON.stringify(welded)).toBe(JSON.stringify(parts));
    });

    it('SHORT partition (open seam) on an axis-aligned plate: openSeams>0 → weld CLOSES the seam and the rooms seal', () => {
        // The vertical spine ends 0.50 m short of the top shell (z=7.50, not 8) — a residual
        // the §PARTITION-REACH reconnect did NOT bridge. It exceeds the detector's 0.30 m
        // corner-snap (so the top-left/top-right rooms FLOOD together → merge on the bit-exact
        // set) yet is within the weld's 0.60 m §SHELL-SNAP-WIDEN tol (so the weld CAN close
        // it). Both horizontal arms are clean.
        const parts: WeldWall[] = [
            { id: 'pv', start: { x: 5, z: 0 }, end: { x: 5, z: 7.50 } },  // 0.50 m short of top shell → open seam
            { id: 'phl', start: { x: 0, z: 4 }, end: { x: 5, z: 4 } },
            { id: 'phr', start: { x: 5, z: 4 }, end: { x: 10, z: 4 } },
        ];
        // (1) The bit-exact set has an OPEN SEAM (>0.30 m) — this is EXACTLY the signal the
        //     executor's `_countOpenSeams` returns, on which the conditional weld now fires
        //     instead of trusting the (axis-aligned ⇒ assumed-sealed) bit-exact path.
        const openBefore = countOpenSeams(parts, shell);
        expect(openBefore).toBeGreaterThan(0);
        // (2) Because openSeams>0, the conditional path runs the ground-proven weld …
        const welded = weldPartitionsToShell(parts, shell);
        // (3) … which closes the seam: NO open seams remain (the residual was within the
        //     weld's 0.60 m §SHELL-SNAP-WIDEN tol). This is the decisive contract — the
        //     conditional weld converts an open-seam upper plate into a sealed one.
        expect(countOpenSeams(welded, shell)).toBe(0);
        // (4) Detector room counts (informational — the editor-runtime seal is browser-validated;
        //     RoomDetectionEngine carries its own T-junction rescue so its count is not asserted
        //     here, but the welded set must never detect FEWER rooms than the bit-exact set).
        const bitExactRooms = detect([...shell.map(s => toWall(s)), ...parts.map(p => toWall(p))]);
        const weldedRooms = detect([...shell.map(s => toWall(s)), ...welded.map(p => toWall(p))]);
        // eslint-disable-next-line no-console
        console.log(`[§UPPER-SHELL-WELD-COND] openSeamsBefore=${openBefore} bitExactRooms=${bitExactRooms} weldedRooms=${weldedRooms}`);
        expect(weldedRooms).toBeGreaterThanOrEqual(bitExactRooms);
    });
});
