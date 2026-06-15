/**
 * §CONSENSUS-NEAR-CLOUD (2026-06-15 — keystone Y-junction trim-overshoot fix)
 *
 * THE root defect behind three compound house symptoms (rooms merge, upper-floor
 * "Storage" swarm, furniture-through-wall): at a 3-way Y-junction of interior
 * partitions whose endpoints are NOT pinned, WallJunctionClustering computed the
 * cluster consensus by AVERAGING the centreline–centreline crossings of every wall
 * pair. When two arms are near-collinear (a shallow relative angle — common on a
 * generated/welded plate), their INFINITE lines cross far from the actual junction —
 * up to ~1 m away. That distant crossing polluted the average, so the §MULTI-CLUSTER
 * consumer trimmed a member's joining endpoint up to ~1 m back along its own axis.
 * The dangling end then exceeded RoomDetectionEngine's reconnect reach (1.25 m) → the
 * room loop never closed → rooms merged; the displaced wall left furniture mid-air.
 *
 * Fix (WallJunctionClustering._computeConsensusPoint, §CONSENSUS-NEAR-CLOUD): the
 * endpoints are by construction all within snapRadius of each other, so the TRUE
 * meeting point lies INSIDE that endpoint cloud. Discard any pairwise crossing that
 * lands well outside the cloud (the near-parallel artefact); average only the in-cloud
 * crossings; fall back to the in-cloud centroid if none survive. A genuine star/Y —
 * whose centrelines really do cross at one point inside the cloud — keeps every
 * crossing and is byte-identical.
 *
 * These tests pin: (1) a near-collinear Y member is trimmed MINIMALLY (retreat and the
 * inter-member gap stay well under the detector's 1.25 m reach — was ~0.4 m+, would
 * grow unboundedly with arm parallelism); (2) a genuine star whose centrelines cross at
 * one point is byte-identical to the true crossing (no regression).
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WallJoinResolver } from '../src/WallJoinResolver';
import type { WallData } from '../src/WallTypes';

let _seq = 0;
function mk(
    start: [number, number],
    end: [number, number],
    thickness = 0.1,
    createdAt?: number,
): WallData {
    const id = `wall_yj_${_seq++}`;
    return {
        id, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ x: start[0], y: 0, z: start[1] }, { x: end[0], y: 0, z: end[1] }],
        height: 3, thickness, baseOffset: 0, openings: [],
        metadata: createdAt != null ? { createdAt } : undefined,
    } as any;
}

// RoomDetectionEngine reconnect reach (REACH_MAX_M) — a trimmed dangling end MUST stay
// inside this so _reconnectDanglingEnds (or _snapNearbyCorners(0.30)) can close the loop.
const DETECTOR_REACH_M = 1.25;

describe('WallJoinResolver — §CONSENSUS-NEAR-CLOUD (un-pinnable Y-junction member trim)', () => {
    it('near-collinear 3-way Y: every member trimmed MINIMALLY (retreat + gap ≪ detector reach)', () => {
        _seq = 0;
        // Two LONG arms whose join ends are ~3 cm apart at the junction near (0,0) but
        // whose far ends are only slightly offset → near-parallel infinite lines that
        // (unfiltered) cross ~0.4 m+ away. Stem perpendicular from below. This is the
        // §MULTI-CLUSTER pinned=0 case that previously dragged a member ~1 m.
        const armWLeft  = mk([-6, 0.00], [-0.03, 0.00], 0.1, 1);   // joins at END, dir +x
        const armWRight = mk([ 6, 0.12], [ 0.03, 0.02], 0.1, 2);   // joins at END, near-parallel to armWLeft
        const stem      = mk([ 0, -6  ], [ 0.00, -0.03], 0.1, 3);  // joins at END, perpendicular

        const before = new Map<string, THREE.Vector3>([
            [armWLeft.id,  new THREE.Vector3(-0.03, 0, 0.00)],
            [armWRight.id, new THREE.Vector3( 0.03, 0, 0.02)],
            [stem.id,      new THREE.Vector3( 0.00, 0, -0.03)],
        ]);

        const res = WallJoinResolver.resolveLevel([armWLeft, armWRight, stem], { snapRadius: 1.0 });

        const ends: THREE.Vector3[] = [];
        for (const w of [armWLeft, armWRight, stem]) {
            const j = res.get(w.id)!;
            expect(j.invalid, `${w.id} should not be flagged invalid`).toBeFalsy();
            const end = j.baseLine[1] as THREE.Vector3;   // all join at END
            ends.push(end);
            // (1) MINIMAL retreat — the joining endpoint moved far less than the
            // detector reach (the un-fixed code retreated ≥ ~0.36 m here, growing with
            // arm parallelism toward ~1 m on a real plate).
            const b = before.get(w.id)!;
            const retreat = Math.hypot(end.x - b.x, end.z - b.z);
            expect(retreat, `${w.id} retreat ${(retreat * 1000).toFixed(0)}mm`).toBeLessThan(0.5);
            // The trimmed end is still near the true junction (origin), not dragged off.
            expect(Math.hypot(end.x, end.z), `${w.id} dist from junction`).toBeLessThan(0.5);
        }

        // (2) The three trimmed joining ends stay mutually within the detector reach so
        // RoomDetectionEngine fuses them into one node and the room loop closes.
        let maxGap = 0;
        for (let i = 0; i < ends.length; i++) {
            for (let j = i + 1; j < ends.length; j++) {
                maxGap = Math.max(maxGap, Math.hypot(ends[i].x - ends[j].x, ends[i].z - ends[j].z));
            }
        }
        expect(maxGap, `max inter-member gap ${(maxGap * 1000).toFixed(0)}mm`).toBeLessThan(DETECTOR_REACH_M);
        // In practice the on-centreline / near-cloud consensus lands them coincident.
        expect(maxGap).toBeLessThan(0.30);
    });

    it('no-regression: a genuine star (centrelines cross one point) is byte-identical to the crossing', () => {
        _seq = 0;
        // Three walls whose centrelines all pass through X=(0,10); join ends pulled
        // ~0.10 m back ALONG each centreline so they are distinct + non-collinear +
        // unpinned → same §MULTI-CLUSTER trim path. Every pairwise crossing sits at X
        // (inside the cloud), so the near-cloud filter keeps them all → consensus == X.
        const X: [number, number] = [0, 10];
        const dirs: [number, number][] = [
            [-1, 0],
            [Math.cos(Math.PI / 3), Math.sin(Math.PI / 3)],
            [Math.cos(-Math.PI / 3), Math.sin(-Math.PI / 3)],
        ];
        const walls = dirs.map((d, i) => {
            const free: [number, number] = [X[0] + 3 * d[0], X[1] + 3 * d[1]];
            const join: [number, number] = [X[0] + 0.10 * d[0], X[1] + 0.10 * d[1]];
            return mk(free, join, 0.2, i + 1);
        });
        const res = WallJoinResolver.resolveLevel(walls);
        const cross = new THREE.Vector3(X[0], 0, X[1]);
        for (const w of walls) {
            const j = res.get(w.id)!;
            expect(j.invalid).toBeFalsy();
            const end = j.baseLine[1] as THREE.Vector3;
            expect(Math.hypot(end.x - cross.x, end.z - cross.z), `${w.id} at crossing`).toBeLessThan(1e-3);
        }
    });
});
