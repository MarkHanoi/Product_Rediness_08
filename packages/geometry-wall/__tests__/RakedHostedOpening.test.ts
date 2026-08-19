/**
 * §RAKE-HOSTED-OPENING — WINDOWS (AND DOORS) MAY BE HOSTED ON A RAKED WALL.
 *
 * Founder, 2026-08-18: *"I want to have windows placed on raked walls — raked walls
 * are working perfectly — now I need windows to be possible hosted on those walls."*
 *
 * ADR-0310 §2.5 refused this case with two named reasons, and this suite is the
 * measurement that each has actually been answered rather than waived:
 *
 *   1. *"the opening carve is a vertical band"* — on a raked wall the void must
 *      follow the SHEARED solid. If it does not, a horizontal ray at the opening's
 *      own height still strikes wall material (the solid moved, the hole did not) —
 *      the wedge. `voidIsClearThroughTheRakedFace` is exactly that measurement.
 *   2. *"the door/window transform assumes a vertical host face"* — the leaf must
 *      sit in the INCLINED plane. Measured here for the legacy in-wall frame and, at
 *      the element layer, in `geometry-window/__tests__/RakedHostWindowLeaf.test.ts`.
 *
 * ── THE ARCHITECTURAL DECISION THESE TESTS PIN ───────────────────────────────
 * THE RAKE IS A PURE SHEAR ABOUT THE WALL'S BASE, AND EVERYTHING THE WALL HOSTS IS
 * CARRIED BY THE SAME SHEAR. Consequences, each asserted below:
 *   · `sillHeight` / `height` stay PLUMB — a shear preserves Y, so the void's sill
 *     and head sit at exactly the authored elevations at every rake angle.
 *   · the leaf is IN-PLANE — it is the shear of the vertical leaf, so it fills the
 *     shear of the vertical void exactly.
 * The full justification lives beside the removed arm in `WallRake.ts`.
 *
 * ⚠ NON-VACUITY. A 90° wall must still build BYTE-IDENTICAL geometry. The digest in
 * `VERTICAL_DIGEST_PREFIX` was captured from this same harness on the commit BEFORE
 * the rake-hosting change (RED run) and is asserted unchanged after it.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

import { WallStore } from '../src/WallStore';
import { WallOccupancyStore } from '../src/WallOccupancyStore';
import { WallFragmentBuilder } from '../src/WallFragmentBuilder';
import { rakeAuthorability, rakeShearPerMetre } from '../src/WallRake';
import { WallDataAddSchema } from '../src/WallDataSchema';
import type { WallData } from '../src/WallTypes';
import { ProjectContext } from '@pryzm/core-app-model';

const LEVEL_ID = 'level-0';
const RAKE_DEG = 75;                            // leans the top toward the wall's LEFT (+Z here)
const K = rakeShearPerMetre(RAKE_DEG);          // cot(75°) ≈ 0.267949 — the canonical predicate

function makeLevelProvider() {
    const level = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
    return {
        getLevelById: (id: string) => (id === LEVEL_ID ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

/** Opening span x ∈ [2.0, 3.2], plumb band y ∈ [0.9, 2.3]. */
const OP_OFFSET = 2.0;
const OP_WIDTH = 1.2;
const OP_HEIGHT = 1.4;
const OP_SILL = 0.9;
const OP_CENTRE_X = OP_OFFSET + OP_WIDTH / 2;   // 2.6
const THICK = 0.2;

/**
 * A plain 6 m straight wall along +X. `leftPerp((1,0)) = (0,1)` ⇒ the rake shear
 * displaces upward points toward +Z, by `K · y` metres at plumb height y.
 */
function mkWall(opts: { rake?: number; withOpening: boolean; elementId?: string }): WallData {
    const openings = opts.withOpening
        ? [{
            id: 'op-1',
            type: 'window',
            ...(opts.elementId ? { elementId: opts.elementId } : {}),
            offset: OP_OFFSET, width: OP_WIDTH, height: OP_HEIGHT, sillHeight: OP_SILL,
        }]
        : [];
    return {
        id: 'w-1',
        type: 'wall',
        levelId: LEVEL_ID,
        properties: {},
        childrenIds: opts.elementId ? [opts.elementId] : [],
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
        height: 3,
        thickness: THICK,
        baseOffset: 0,
        openings,
        ...(opts.rake === undefined ? {} : { rakeAngleDeg: opts.rake }),
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 't', version: 1 },
    } as unknown as WallData;
}

function build(wall: WallData): { builder: WallFragmentBuilder; root: THREE.Group } {
    const builder = new WallFragmentBuilder(new THREE.Scene(), makeLevelProvider());
    builder.buildWall(wall, null as never, undefined, 0);
    const root = builder.getWallRoot(wall.id) as unknown as THREE.Group;
    expect(root).toBeTruthy();
    root.updateMatrixWorld(true);
    return { builder, root };
}

/**
 * Fire a horizontal ray ACROSS the wall (along +Z, the wall's left normal) at station
 * `x` along the wall and plumb height `y`, and return the z of the first solid hit —
 * or `null` when the ray passes clean through (a void).
 *
 * This is the measurement the refusal named: a raked wall's material at height y sits
 * at `z ∈ [-t/2 + K·y, +t/2 + K·y]`, so where the solid is tells us whether the body
 * followed the rake, and where the solid ISN'T tells us whether the carve did.
 */
function firstSolidZ(root: THREE.Group, x: number, y: number): number | null {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, y, -50), new THREE.Vector3(0, 0, 1));
    ray.params.Line = { threshold: 0 };
    ray.params.Points = { threshold: 0 };
    const hits = ray
        .intersectObject(root, true)
        .filter(h => (h.object as THREE.Mesh).isMesh === true);
    return hits.length === 0 ? null : hits[0]!.point.z;
}

/** Byte-level digest of the built geometry — the non-regression instrument. */
function meshDigest(root: THREE.Group): string {
    const parts: string[] = [
        `pos:${root.position.x.toFixed(6)},${root.position.y.toFixed(6)},${root.position.z.toFixed(6)}`,
    ];
    root.traverse((o: THREE.Object3D) => {
        const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
        const p = g?.attributes?.position as THREE.BufferAttribute | undefined;
        if (!p) return;
        const arr = p.array as ArrayLike<number>;
        let sum = 0;
        for (let i = 0; i < arr.length; i++) sum += arr[i]! * (i + 1);
        // The child's own matrix is part of what the user sees — a shear lives THERE,
        // not in the vertex buffer, so a digest that ignored it could not detect one.
        const m = o.matrix.elements.map(v => v.toFixed(6)).join(',');
        parts.push(`n=${arr.length}|s=${sum.toFixed(6)}|m=${m}`);
    });
    return parts.join('\n');
}

// ─── (1) THE GATE ITSELF ─────────────────────────────────────────────────────

describe('§RAKE-HOSTED-OPENING (1) — the authorability gate admits the case it used to refuse', () => {
    it('a raked PLAIN wall that hosts openings is AUTHORABLE', () => {
        const a = rakeAuthorability({ rakeAngleDeg: RAKE_DEG, openings: [{ id: 'o1' }] });
        expect(a.ok).toBe(true);
        expect(a.code).toBeUndefined();
    });

    // §FEAT-RAKE-CURVED (founder mandate 2026-08-19) — BOTH of these asserted the curved
    // refusal and both are inverted. The old justification, "a single shear vector cannot
    // follow an arc", is still TRUE and is exactly why a raked curved wall is NOT built
    // from a single shear vector: it is a cone, each station displaced along its own
    // normal. Measured in `RK1CurvedRakedConicalSweep.test.ts`.
    it('a CURVED wall may hold a rake — the conical sweep is built', () => {
        const a = rakeAuthorability({ rakeAngleDeg: RAKE_DEG, curve: { radius: 4 } });
        expect(a.ok).toBe(true);
        expect(a.code).toBeUndefined();
    });

    it('a curved wall that ALSO hosts openings is allowed — the founder asked for this one', () => {
        const a = rakeAuthorability({ rakeAngleDeg: RAKE_DEG, curve: { radius: 4 }, openings: [{}] });
        expect(a.ok).toBe(true);
    });

    it('but a curved rake that would COLLAPSE the top arc is refused, with both numbers', () => {
        const a = rakeAuthorability({
            rakeAngleDeg: 20, curve: { radius: 4 }, height: 3, curveMinRadiusM: 0.5,
        });
        expect(a.ok).toBe(false);
        expect(a.code).toBe('curved-collapse');
        expect(a.reason).toContain('8.242');
        expect(a.reason).toContain('0.500');
    });

    /**
     * ⚠ THIS TEST WAS RED ON `main` AND THE TEST WAS THE STALE HALF, not the gate.
     *
     * It read `rakeAuthorability({ rakeAngleDeg, layers: [{}, {}] }).code` and expected
     * `'layered'`. That assertion was written when the `layered` arm refused a raked wall
     * for BEING layered at all. §FEAT-RAKE-LAYERED then SHIPPED the layered raked wall —
     * the founder confirmed it, and C85 §12 **R-9** now binds it: *"DO NOT re-refuse
     * layered-raked … the bodies are correct and founder-confirmed."* The arm was
     * correspondingly narrowed to `layers.length > 1 AND openings.length > 0`, and this
     * assertion kept demanding the wider refusal.
     *
     * `002db1c2`'s message names it as one of two pre-existing failures; it was left RED
     * rather than repaired because it belonged to another lane's subject. It is repaired
     * HERE because RK1's subject is exactly this gate, and a RED that asserts a refusal
     * R-9 forbids is worse than no test: the obvious way to make it pass is to re-add the
     * refusal, which is the one thing that must not happen.
     *
     * ⚠ AND IT HAS NOW MOVED AGAIN, ONE DAY LATER — L-1064 / §FEAT-RAKE-LAYERED-OPENINGS.
     * The surviving `layers × openings` arm was itself lifted: its stated reason ("no
     * shear") was measured false once that path was given one, and the arm was ALSO off by
     * one — it tested `layers.length > 1` while the body path it guarded is entered on
     * `> 0`, so the ONE-layer case, which is the founder's own wall, leaked through
     * unsheared the whole time. Removing the boundary rather than moving it is the only
     * fix that cannot be off by one again.
     *
     * THE POINT THIS TEST NOW EXISTS TO MAKE is the one that keeps surviving every
     * inversion: **the whole family must agree**, because they are one body path.
     */
    it('every layer count × openings combination is admitted — they are ONE body path (R-9)', () => {
        for (const layers of [undefined, [{}], [{}, {}], [{}, {}, {}]]) {
            for (const openings of [undefined, [], [{ id: 'o1' }]]) {
                const a = rakeAuthorability({ rakeAngleDeg: RAKE_DEG, layers, openings } as never);
                expect(a.ok, `layers=${layers?.length ?? 'none'} openings=${openings?.length ?? 'none'}`)
                    .toBe(true);
                expect(a.code).toBeUndefined();
            }
        }
    });

    it('the OUT-OF-RANGE refusal still fires', () => {
        expect(rakeAuthorability({ rakeAngleDeg: 5, openings: [{}] }).code).toBe('out-of-range');
    });
});

// ─── (2) THE REAL PLACEMENT PATH — canPlace → store ──────────────────────────

describe('§RAKE-HOSTED-OPENING (2) — the placement path a user actually travels', () => {
    const occ = new WallOccupancyStore();

    it('canPlace() ACCEPTS a window on a raked wall', () => {
        const res = occ.canPlace(mkWall({ rake: RAKE_DEG, withOpening: false }), 2.0, 1.2);
        expect(res.valid).toBe(true);
        expect(res.reason).toBeFalsy();
    });

    it('canPlace() accepts a rake leaning EITHER way', () => {
        expect(occ.canPlace(mkWall({ rake: 30, withOpening: false }), 2, 1.2).valid).toBe(true);
        expect(occ.canPlace(mkWall({ rake: 150, withOpening: false }), 2, 1.2).valid).toBe(true);
    });

    it('WallStore.addOpening() SUCCEEDS on a raked wall — it no longer throws', () => {
        const store = new WallStore(
            new ProjectContext(),
            makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
        );
        store.add(mkWall({ rake: RAKE_DEG, withOpening: false }));
        expect(() => store.addOpening('w-1', {
            id: 'op-1', type: 'window', elementId: 'win-1', offset: OP_OFFSET, width: OP_WIDTH,
            height: OP_HEIGHT, sillHeight: OP_SILL,
        } as never)).not.toThrow();
        expect(store.getById('w-1')!.openings.length).toBe(1);
    });

    it('the SCHEMA accepts a raked wall carrying openings', () => {
        const parsed = WallDataAddSchema.safeParse(mkWall({ rake: RAKE_DEG, withOpening: true, elementId: 'win-1' }));
        expect(parsed.success, JSON.stringify((parsed as { error?: { issues?: unknown } }).error?.issues)).toBe(true);
    });

    // §FEAT-RAKE-CURVED (founder mandate 2026-08-19) — INVERTED. This asserted that
    // `WallStore.update()` THROWS when raking a curved wall, "the guard survives". The
    // guard is gone because the geometry is built: the conical sweep. What the store must
    // now do is ACCEPT the edit and persist it, because a store that refuses what the
    // builder can draw makes the feature unreachable — the §AUTHORED-BUT-UNWIRED shape.
    it('WallStore.update() ACCEPTS a rake on a CURVED wall, and persists it', () => {
        const store = new WallStore(
            new ProjectContext(),
            makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
        );
        const curved = {
            ...mkWall({ withOpening: false }),
            curve: { control: { x: 3, y: 0, z: 1.2 }, segments: 12 },
        } as unknown as WallData;
        store.add(curved);
        expect(() => store.update('w-1', { rakeAngleDeg: RAKE_DEG } as never)).not.toThrow();
        // "Did not throw" is not "took effect" — read it back. A store that silently
        // dropped the field would pass the line above and ship a dead control.
        expect((store.getById('w-1') as unknown as { rakeAngleDeg?: number })?.rakeAngleDeg)
            .toBe(RAKE_DEG);
    });
});

// ─── (3) THE CARVE — MEASURED GEOMETRICALLY, NOT "IT DID NOT THROW" ─────────

describe('§RAKE-HOSTED-OPENING (3) — the carve follows the RAKED face', () => {
    it('the wall SOLID is sheared: material at height y sits at z ≈ -t/2 + K·y', () => {
        const { root } = build(mkWall({ rake: RAKE_DEG, withOpening: true }));
        for (const y of [0.4, 1.6, 2.7]) {
            const z = firstSolidZ(root, 1.0, y);                 // x = 1.0 — solid, left of the opening
            expect(z).not.toBeNull();
            expect(z!).toBeCloseTo(-THICK / 2 + K * y, 4);
        }
    });

    it('a VERTICAL wall is unmoved — the same probe reads -t/2 at every height', () => {
        const { root } = build(mkWall({ withOpening: true }));
        for (const y of [0.4, 1.6, 2.7]) {
            expect(firstSolidZ(root, 1.0, y)!).toBeCloseTo(-THICK / 2, 4);
        }
    });

    it('THE WEDGE TEST — at the opening station and height, the ray passes CLEAN THROUGH', () => {
        // This is the whole refusal. A vertical-band carve in a sheared solid leaves
        // material at z ≈ [-0.1 + K·y, 0.1 + K·y] while the hole sits at [-0.1, 0.1]:
        // the ray would strike the wedge. Clean passage ⇒ the void moved with the face.
        const { root } = build(mkWall({ rake: RAKE_DEG, withOpening: true }));
        for (const y of [1.0, 1.6, 2.2]) {
            // The CONJUNCTION is the proof: at this height the wall HAS material (it is
            // sheared to z ≈ -t/2 + K·y over there), and at the opening station it has
            // none. Either half alone is satisfiable by an un-raked wall.
            expect(firstSolidZ(root, 1.0, y)!).toBeCloseTo(-THICK / 2 + K * y, 4);
            expect(firstSolidZ(root, OP_CENTRE_X, y)).toBeNull();
        }
    });

    it('the void spans the full authored WIDTH, and the jambs bound it', () => {
        const { root } = build(mkWall({ rake: RAKE_DEG, withOpening: true }));
        expect(firstSolidZ(root, OP_OFFSET + 0.02, 1.6)).toBeNull();               // just inside
        expect(firstSolidZ(root, OP_OFFSET + OP_WIDTH - 0.02, 1.6)).toBeNull();    // just inside
        expect(firstSolidZ(root, OP_OFFSET - 0.05, 1.6)).not.toBeNull();           // just outside
        expect(firstSolidZ(root, OP_OFFSET + OP_WIDTH + 0.05, 1.6)).not.toBeNull();
    });

    it('SILL AND HEAD ARE PLUMB — the decision, measured', () => {
        // The shear preserves Y, so the authored sill (0.9) and head (2.3) are the
        // elevations the void actually has. A face-normal reading would have put the
        // head at 0.9 + 1.4·sin(75°) = 2.252 — which this test would fail.
        const { root } = build(mkWall({ rake: RAKE_DEG, withOpening: true }));
        expect(firstSolidZ(root, OP_CENTRE_X, OP_SILL - 0.03)).not.toBeNull();               // below sill: solid
        expect(firstSolidZ(root, OP_CENTRE_X, OP_SILL + 0.03)).toBeNull();                   // above sill: void
        expect(firstSolidZ(root, OP_CENTRE_X, OP_SILL + OP_HEIGHT - 0.03)).toBeNull();       // below head: void
        expect(firstSolidZ(root, OP_CENTRE_X, OP_SILL + OP_HEIGHT + 0.03)).not.toBeNull();   // above head: solid
    });

    it('the material BELOW the sill and ABOVE the head is itself sheared', () => {
        // i.e. the carve did not merely move — the whole body carries the rake, so the
        // reveal it leaves is in the raked face rather than standing proud of it.
        const { root } = build(mkWall({ rake: RAKE_DEG, withOpening: true }));
        const below = OP_SILL - 0.1, above = OP_SILL + OP_HEIGHT + 0.1;
        expect(firstSolidZ(root, OP_CENTRE_X, below)!).toBeCloseTo(-THICK / 2 + K * below, 4);
        expect(firstSolidZ(root, OP_CENTRE_X, above)!).toBeCloseTo(-THICK / 2 + K * above, 4);
    });
});

// ─── (4) THE LEAF — the in-wall frame rides the same shear ───────────────────

describe('§RAKE-HOSTED-OPENING (4) — the hosted leaf sits in the INCLINED plane', () => {
    /**
     * World-space centroid of every in-wall frame member of the hosted opening.
     * `createWindowFrame` tags its members `legacyWindowFrame`, but `buildWall`
     * re-stamps every frame child as `{role:'geometry', elementType:'window-part'}`
     * before the group is done — so THAT is what a scene reader actually sees.
     */
    function frameCentroid(root: THREE.Group): THREE.Vector3 {
        const c = new THREE.Vector3();
        let n = 0;
        root.traverse((o: THREE.Object3D) => {
            if ((o as THREE.Mesh).isMesh !== true) return;
            if (o.userData?.elementType !== 'window-part') return;
            c.add(o.getWorldPosition(new THREE.Vector3()));
            n++;
        });
        expect(n).toBeGreaterThan(0);
        return c.multiplyScalar(1 / n);
    }

    it('the frame CENTRE is displaced by the shear at its own plumb height', () => {
        const { root } = build(mkWall({ rake: RAKE_DEG, withOpening: true, elementId: 'win-1' }));
        const c = frameCentroid(root);
        const yc = OP_SILL + OP_HEIGHT / 2;                  // 1.6 — plumb, unchanged by the shear
        expect(c.y).toBeCloseTo(yc, 4);
        expect(c.x).toBeCloseTo(OP_CENTRE_X, 4);
        expect(c.z).toBeCloseTo(K * yc, 4);                  // rides the raked face
    });

    it('the frame is IN-PLANE, not plumb: its head is offset from its sill by K·h in z', () => {
        const { root } = build(mkWall({ rake: RAKE_DEG, withOpening: true, elementId: 'win-1' }));
        let headZ = -Infinity, headY = -Infinity, sillZ = Infinity, sillY = Infinity;
        root.traverse((o: THREE.Object3D) => {
            if ((o as THREE.Mesh).isMesh !== true) return;
            if (o.userData?.elementType !== 'window-part') return;
            const p = o.getWorldPosition(new THREE.Vector3());
            if (p.y > headY) { headY = p.y; headZ = p.z; }
            if (p.y < sillY) { sillY = p.y; sillZ = p.z; }
        });
        // A PLUMB leaf would give headZ === sillZ. An in-plane leaf tilts with the wall.
        expect(headZ - sillZ).toBeCloseTo(K * (headY - sillY), 4);
        expect(headZ - sillZ).toBeGreaterThan(0.1);          // and it is a real tilt, not noise
    });

    it('on a VERTICAL wall the frame is plumb and un-displaced (non-regression)', () => {
        const { root } = build(mkWall({ withOpening: true, elementId: 'win-1' }));
        const c = frameCentroid(root);
        expect(c.z).toBeCloseTo(0, 6);
        expect(c.x).toBeCloseTo(OP_CENTRE_X, 4);
    });
});

// ─── (5) NON-VACUITY — the 90° path must not move at all ─────────────────────

describe('§RAKE-HOSTED-OPENING (5) — the VERTICAL wall is byte-identical', () => {
    it('an absent rake and an explicit 90 build the SAME geometry', () => {
        const a = build(mkWall({ withOpening: true, elementId: 'win-1' }));
        const b = build(mkWall({ rake: 90, withOpening: true, elementId: 'win-1' }));
        expect(meshDigest(b.root)).toBe(meshDigest(a.root));
    });

    it('the vertical wall + window digest is UNCHANGED from before rake-hosting', () => {
        // VERTICAL_DIGEST_SHA was captured from THIS harness on the RED run — i.e. on
        // the tree before any rake-hosting code existed. If the feature moved a single
        // vertex or a single matrix element of the 90° path, this fails. That is the
        // only way to know the change was additive rather than a rewrite that happens
        // to still pass the vertical tests.
        const { root } = build(mkWall({ withOpening: true, elementId: 'win-1' }));
        expect(digestSha(meshDigest(root))).toBe(VERTICAL_DIGEST_SHA);
    });
});

/** FNV-1a over the digest — a short, stable stand-in for the whole buffer dump. */
function digestSha(s: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return `fnv1a:${h.toString(16)}:${s.length}`;
}

/** Measured on the PRE-change tree (RED run). Never "update to make it pass". */
const VERTICAL_DIGEST_SHA = 'fnv1a:235892ea:1183';
