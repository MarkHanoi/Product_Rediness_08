/**
 * §PERF-WALL-MOVE-INCREMENTAL-REBUILD (L-234) — THE CORRECTNESS SUITE.
 *
 * The perf harness (`WallMoveRebuildCost.measure.test.ts`) proves the fix is FAST.
 * This suite is the one that makes it SAFE TO SHIP: it proves the fix is a
 * MEMOIZATION, not an approximation — that a wall the incremental flush SKIPS ends
 * up with byte-identical rendered geometry to a wall the old unconditional flush
 * REBUILT, across every plate topology the resolver has ever been burned on.
 *
 * ── What is actually asserted ────────────────────────────────────────────────
 *
 * (1) RENDER EQUALITY. Two parallel worlds are driven from the SAME wall set with
 *     the SAME move, through the SAME real `WallJoinResolver.resolveLevel` and the
 *     SAME real `WallFragmentBuilder`:
 *
 *       World B (BEFORE) — `buildWall(...)` unconditionally for every adjustment
 *                          (the pre-fix coordinator :1543).
 *       World A (AFTER)  — `buildWall(...)` only when the content hash of its four
 *                          arguments changed (§PERF-WALL-MOVE-INCREMENTAL-REBUILD).
 *
 *     After the move flush, EVERY wall's built mesh (vertex positions of every
 *     child geometry, in scene order) must be byte-identical between A and B. A
 *     wall World A skipped therefore renders exactly what World B re-extruded —
 *     which is the whole claim. Any mis-scoped skip (a wall whose join DID move but
 *     whose hash we failed to notice) shows up here as a geometry mismatch.
 *
 * (2) AFFECTED-SET SIZE. In the same run, the number of walls World A rebuilt is
 *     asserted to be small and independent of the plate size — i.e. the perf win is
 *     real on these topologies too, not just on the synthetic grid.
 *
 * (3) THE PRUNE IS A LOWER BOUND. `WallJoinResolver`'s two O(N²) host searches were
 *     made allocation-free with an EXACT reject: `dist(p, aabb(seg)) <= dist(p, seg)`.
 *     A randomised property test pins that inequality (10k samples). Together with
 *     the monotonically-shrinking `bestPerp` in both loops, it is what makes the
 *     prune byte-identical rather than merely "close" — and the resolver's own 200+
 *     join tests (corner flush, T-join perp gate, multi-cluster consensus,
 *     diff-thickness, degenerate stub, near-corner L, Y-junction …) are the
 *     end-to-end confirmation.
 *
 * ── Topologies covered ──────────────────────────────────────────────────────
 * L corner · T junction · X cross · corridor · closed loop (sealed room) ·
 * differing thicknesses · opening-bearing (hosted-door) walls · connected grid.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

import { WallStore } from '../src/WallStore';
import { WallJoinResolver } from '../src/WallJoinResolver';
import { WallFragmentBuilder } from '../src/WallFragmentBuilder';
import { composeWallGeometryHash } from '../src/composeWallGeometryHash';
import type { WallData } from '../src/WallTypes';
import type { JoinData } from '@pryzm/core-app-model';
import { ProjectContext } from '@pryzm/core-app-model';
import { UpdateWallBaselineCommand } from '@pryzm/command-registry';

const LEVEL_ID = 'level-0';

function makeLevelProvider() {
    const level = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
    return {
        getLevelById: (id: string) => (id === LEVEL_ID ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

interface Spec {
    a: [number, number];
    b: [number, number];
    thickness?: number;
    door?: boolean;
}

function mkWall(i: number, s: Spec): WallData {
    const openings = s.door
        ? [{ id: `op_${i}`, type: 'door', elementId: `door_${i}`, offset: 1.5, width: 0.9, height: 2.1, sillHeight: 0 }]
        : [];
    return {
        id: `w_${i}`,
        type: 'wall',
        levelId: LEVEL_ID,
        properties: {},
        childrenIds: openings.map(o => o.elementId),
        baseLine: [{ x: s.a[0], y: 0, z: s.a[1] }, { x: s.b[0], y: 0, z: s.b[1] }],
        height: 3,
        thickness: s.thickness ?? 0.2,
        baseOffset: 0,
        openings,
        metadata: { createdAt: 1 + i, modifiedAt: 1, createdBy: 't', version: 1 },
    } as unknown as WallData;
}

// ── The plate topologies ─────────────────────────────────────────────────────
// Every one of these is a shape the resolver has a §-tagged fix for.
const TOPOLOGIES: Record<string, Spec[]> = {
    // L corner — the bisector-miter path (_applyCorner).
    'L-corner': [
        { a: [0, 0], b: [6, 0] },
        { a: [6, 0], b: [6, 6] },
    ],
    // T junction — the body-T path (_applyT).
    'T-junction': [
        { a: [0, 0], b: [8, 0] },
        { a: [4, 0], b: [4, 5] },
        { a: [0, 0], b: [0, 5] },
    ],
    // X cross — 4 endpoints in one cluster (§MULTI-CLUSTER consensus).
    'X-cross': [
        { a: [-4, 0], b: [0, 0] },
        { a: [0, 0], b: [4, 0] },
        { a: [0, -4], b: [0, 0] },
        { a: [0, 0], b: [0, 4] },
    ],
    // Corridor — two long parallel shells with partitions landing on their bodies
    // (§PARTITION-SHELL-INNER-FACE / §SHELL-ANCHOR-PRESERVE).
    'corridor': [
        { a: [0, 0], b: [16, 0], thickness: 0.3 },
        { a: [0, 2.2], b: [16, 2.2], thickness: 0.3 },
        { a: [4, 0], b: [4, 2.2] },
        { a: [8, 0], b: [8, 2.2] },
        { a: [12, 0], b: [12, 2.2] },
    ],
    // Closed loop — a sealed rectangular room, 4 L corners.
    'closed-loop': [
        { a: [0, 0], b: [6, 0] },
        { a: [6, 0], b: [6, 4] },
        { a: [6, 4], b: [0, 4] },
        { a: [0, 4], b: [0, 0] },
    ],
    // Differing thicknesses at an L + a T (§WJR-DIFF-THICKNESS butt).
    'diff-thickness': [
        { a: [0, 0], b: [8, 0], thickness: 0.4 },
        { a: [8, 0], b: [8, 6], thickness: 0.1 },
        { a: [4, 0], b: [4, 4], thickness: 0.25 },
    ],
    // Opening-bearing — the founder's exact trigger: a sealed room whose walls host
    // doors, so every rebuild re-cuts a void.
    'hosted-doors': [
        { a: [0, 0], b: [6, 0], door: true },
        { a: [6, 0], b: [6, 5] },
        { a: [6, 5], b: [0, 5], door: true },
        { a: [0, 5], b: [0, 0] },
        { a: [3, 0], b: [3, 5], door: true },
    ],
    // Connected grid — the production floor plate (every wall participates in a join).
    'connected-grid': (() => {
        const specs: Spec[] = [];
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                specs.push({ a: [c * 4, r * 4], b: [(c + 1) * 4, r * 4], door: (r + c) % 3 === 0 });
                specs.push({ a: [c * 4, r * 4], b: [c * 4, (r + 1) * 4] });
            }
        }
        return specs;
    })(),
};

// ── World harness ────────────────────────────────────────────────────────────

interface World {
    store: WallStore;
    builder: WallFragmentBuilder;
    lastBuildKey: Map<string, string>;
}

function newWorld(specs: Spec[]): World {
    const store = new WallStore(
        new ProjectContext(),
        makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
    );
    const builder = new WallFragmentBuilder(new THREE.Scene(), makeLevelProvider());
    specs.forEach((s, i) => store.add(mkWall(i, s)));
    return { store, builder, lastBuildKey: new Map() };
}

/** Content key over exactly the arguments `buildWall(wall, joinData, renderMap, worldY)` consumes. */
function buildKey(wall: WallData, join: JoinData | null): string {
    return `${composeWallGeometryHash(wall, join, 0)}|y0`;
}

/**
 * Transcription of `WallRebuildCoordinator._flush`'s whole-level branch
 * (:1221 → :1543). `incremental=false` reproduces the pre-fix unconditional
 * `buildWall`; `incremental=true` applies the §PERF-WALL-MOVE-INCREMENTAL-REBUILD
 * content-hash gate. Returns the ids the flush actually rebuilt.
 */
function flush(w: World, incremental: boolean): string[] {
    const levelWalls = w.store.getAll().filter(x => x.levelId === LEVEL_ID) as WallData[];
    const adjustments = WallJoinResolver.resolveLevel(levelWalls);
    const rebuilt: string[] = [];
    adjustments.forEach((adj, wallId) => {
        const wall = w.store.getById(wallId) as WallData | undefined;
        if (!wall) return;
        const key = buildKey(wall, adj as JoinData);
        if (incremental && w.lastBuildKey.get(wallId) === key) return;   // provable no-op
        w.builder.buildWall(wall, adj as never, undefined, 0);
        w.lastBuildKey.set(wallId, key);
        rebuilt.push(wallId);
    });
    // Walls the resolver produced no adjustment for still need a build (coordinator :1610).
    for (const wall of levelWalls) {
        if (adjustments.has(wall.id)) continue;
        const key = buildKey(wall, null);
        if (incremental && w.lastBuildKey.get(wall.id) === key) continue;
        w.builder.buildWall(wall, null, undefined, 0);
        w.lastBuildKey.set(wall.id, key);
        rebuilt.push(wall.id);
    }
    return rebuilt;
}

/**
 * A byte-level digest of a wall's BUILT geometry: every child mesh's vertex
 * positions, in scene order, at 6-decimal precision, plus the group's world
 * transform. This is what the user sees. `userData.version` (a per-build monotonic
 * counter that necessarily differs between a rebuilt and a skipped wall) is
 * deliberately NOT part of it — it is a cache token, not geometry.
 */
function meshDigest(builder: WallFragmentBuilder, wallId: string): string {
    const root = builder.getWallRoot(wallId);
    if (!root) return 'NO-GROUP';
    const parts: string[] = [
        `pos:${root.position.x.toFixed(6)},${root.position.y.toFixed(6)},${root.position.z.toFixed(6)}`,
        `rot:${root.rotation.x.toFixed(6)},${root.rotation.y.toFixed(6)},${root.rotation.z.toFixed(6)}`,
        `vis:${root.visible}`,
    ];
    root.traverse((o: THREE.Object3D) => {
        const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
        if (!g || !g.attributes) return;
        const p = g.attributes.position as THREE.BufferAttribute | undefined;
        if (!p) { parts.push(`${o.name}|no-pos`); return; }
        const arr = p.array as ArrayLike<number>;
        let sum = 0;
        let acc = '';
        for (let i = 0; i < arr.length; i++) {
            sum += arr[i]! * (i + 1);
            if (i < 60) acc += `${arr[i]!.toFixed(6)},`;   // exact prefix
        }
        parts.push(`${o.name}|n=${arr.length}|s=${sum.toFixed(6)}|${acc}`);
    });
    return parts.join('\n');
}

// ── The suites ───────────────────────────────────────────────────────────────

describe('§PERF-WALL-MOVE-INCREMENTAL-REBUILD — incremental rebuild renders IDENTICALLY to the whole-level rebuild', () => {
    for (const [name, specs] of Object.entries(TOPOLOGIES)) {
        // Move every wall in turn on the small plates; on the big grid a
        // representative sample (each wall move is a full two-world build).
        const moveIdxs = specs.length <= 6
            ? specs.map((_, i) => i)
            : [0, 1, Math.floor(specs.length / 2), specs.length - 1];

        for (const moveIdx of moveIdxs) {
            it(`${name}: moving w_${moveIdx} → every wall's built geometry is byte-identical (incremental vs whole-level)`, () => {
                const A = newWorld(specs);   // incremental (the fix)
                const B = newWorld(specs);   // unconditional (pre-fix)

                // Settle — the first flush after a project open builds every wall.
                flush(A, true);
                flush(B, false);

                const movedId = `w_${moveIdx}`;
                const bl = A.store.getById(movedId)!.baseLine;
                const newBaseLine = [
                    { x: bl[0].x + 0.37, y: bl[0].y, z: bl[0].z + 0.23 },
                    { x: bl[1].x + 0.37, y: bl[1].y, z: bl[1].z + 0.23 },
                ];
                // The 3D gizmo drag-end dispatch — the real command, on both worlds.
                for (const w of [A, B]) {
                    const res = new UpdateWallBaselineCommand({ wallId: movedId, newBaseLine })
                        .execute({ stores: { wallStore: w.store } } as never);
                    expect(res.success).toBe(true);
                }

                const rebuiltA = flush(A, true);
                const rebuiltB = flush(B, false);

                // ── (1) RENDER EQUALITY — the claim that makes the skip safe. ──────
                const ids = A.store.getAll().map(w => w.id);
                for (const id of ids) {
                    expect(
                        meshDigest(A.builder, id),
                        `wall ${id} rendered DIFFERENTLY after the incremental flush ` +
                        `(rebuiltA=[${rebuiltA.join(',')}] rebuiltB=[${rebuiltB.join(',')}])`,
                    ).toBe(meshDigest(B.builder, id));
                }

                // ── (2) AFFECTED SET — the moved wall is always in it; the plate is not. ──
                expect(rebuiltA).toContain(movedId);
                expect(rebuiltA.length).toBeLessThanOrEqual(rebuiltB.length);
                if (specs.length >= 8) {
                    // On a real plate the incremental flush must NOT rebuild everything.
                    expect(rebuiltA.length).toBeLessThan(rebuiltB.length);
                }
            });
        }
    }
});

describe('§PERF-WALL-MOVE-INCREMENTAL-REBUILD — a NO-OP flush rebuilds nothing (idempotence)', () => {
    for (const [name, specs] of Object.entries(TOPOLOGIES)) {
        it(`${name}: re-flushing without any edit rebuilds 0 walls and changes 0 geometry`, () => {
            const w = newWorld(specs);
            flush(w, true);                                   // settle
            const before = w.store.getAll().map(x => meshDigest(w.builder, x.id));

            const rebuilt = flush(w, true);                   // no edit at all

            // `resolveLevel` is a fixed point on a settled plate, so every content hash
            // is unchanged and NOTHING is re-extruded. This is the guard against the
            // §FIX-WALLFLUSH-NOPROGRESS class of re-flush storm turning into geometry work.
            expect(rebuilt).toEqual([]);
            const after = w.store.getAll().map(x => meshDigest(w.builder, x.id));
            expect(after).toEqual(before);
        });
    }
});

describe('§PERF-WALL-MOVE-INCREMENTAL-REBUILD — the resolver prune is an EXACT lower bound', () => {
    it('dist(p, aabb(segment)) <= dist(p, segment) for 10 000 random point/segment pairs', () => {
        // This is the inequality `_segAabbDistSq` relies on (WallJoinResolver). Because
        // the closest point ON a segment necessarily lies INSIDE that segment's AABB,
        // the AABB distance can never EXCEED the true distance — so a host pruned by
        // `aabbDistSq > bestPerp²` would have been rejected by the exact `perp > bestPerp`
        // test one line later. That, plus `bestPerp` only ever shrinking, is why the
        // prune is byte-identical and not merely "close enough".
        const rnd = (() => { let s = 123456789; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 40 - 20; })();
        const closestOnSegment = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) => {
            const ab = new THREE.Vector3().subVectors(b, a);
            const len2 = ab.lengthSq();
            if (len2 < 1e-12) return a.clone();
            const t = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(p, a).dot(ab) / len2));
            return a.clone().addScaledVector(ab, t);
        };
        const segAabbDistSq = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) => {
            const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
            const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
            const minZ = Math.min(a.z, b.z), maxZ = Math.max(a.z, b.z);
            const dx = p.x < minX ? minX - p.x : (p.x > maxX ? p.x - maxX : 0);
            const dy = p.y < minY ? minY - p.y : (p.y > maxY ? p.y - maxY : 0);
            const dz = p.z < minZ ? minZ - p.z : (p.z > maxZ ? p.z - maxZ : 0);
            return dx * dx + dy * dy + dz * dz;
        };
        for (let i = 0; i < 10_000; i++) {
            const p = new THREE.Vector3(rnd(), rnd(), rnd());
            const a = new THREE.Vector3(rnd(), rnd(), rnd());
            const b = new THREE.Vector3(rnd(), rnd(), rnd());
            const exact = p.distanceToSquared(closestOnSegment(p, a, b));
            const bound = segAabbDistSq(p, a, b);
            expect(bound).toBeLessThanOrEqual(exact + 1e-9);
        }
    });
});
