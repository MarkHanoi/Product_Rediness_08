/**
 * §WALL-Y-DATUM-AGREEMENT — the wall vertical-datum ledger.
 *
 * ── WHAT CHANGED, AND WHY THE NUMBERS IN THIS FILE MOVED ─────────────────────
 *
 * The first version of this file (`9c090971`) was a CHARACTERISATION LEDGER: it
 * recorded the datums as they were, deliberately, so that a real fix would have to
 * come here and change them on purpose rather than discover the divergence a third
 * time. That fix is L-968, and this is it coming here.
 *
 * The old file pinned three facts, of which TWO were defects:
 *
 *   1. `wall.baseOffset` was applied TWICE to the wall body — once by the group
 *      origin (`WallFragmentBuilder.ts:745` → the group transform) and once again by
 *      every body arm in group-local space. The rendered base was
 *      `elevation + slabBaseOffset + 2 × baseOffset`.   ⟵ FIXED
 *   2. hosted door/window leaves used `elevation + sillHeight + height/2`, reading
 *      NEITHER offset, so a leaf sat `slabBaseOffset + 2 × baseOffset` below the hole
 *      cut for it.                                       ⟵ FIXED
 *   3. junction infill was extruded from the wall BASELINE Y.  ⟵ FIXED
 *
 * The fix is a single named authority — `WallVerticalDatum.ts` — and TWO named
 * planes rather than six rival expressions:
 *
 *     SEAT plane = level.elevation + slabBaseOffset        ⟵ the WALL GROUP's origin
 *     BASE plane = SEAT + wall.baseOffset                  ⟵ the wall BODY's underside
 *
 * Group-local geometry is authored as `y ∈ [baseOffset, baseOffset + height]` in five
 * files, and that convention is UNCHANGED — what changed is that the group is no
 * longer ALSO raised by `baseOffset`. Everything that is not a child of the group
 * (the instanced body, the junction infill, the hosted leaves) reads the BASE plane
 * from the authority instead of re-deriving it.
 *
 * ── WHAT THIS FILE STILL IS ──────────────────────────────────────────────────
 *
 * A ledger, not an approval. Where datums now AGREE it asserts agreement with a
 * paired negative on the SAME expression against the pre-fix reading, so a
 * regression to the doubling fails loudly. Where a datum still DIVERGES it says so
 * by name, with the delta — see `§STILL-DIVERGENT` at the foot of the file.
 *
 * Every fixture offset is NON-ZERO and all are distinct, because at zero offsets
 * every one of these expressions collapses to a single value — which is exactly why
 * the defect survived unmeasured. The CONTROL case pins that collapse deliberately.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

import { WallFragmentBuilder } from '../src/WallFragmentBuilder';
import { WallInstanceBridge } from '../src/WallInstanceBridge';
import type { IInstancedRenderer } from '../src/IInstancedRenderer';
import { buildLayeredWallSegmentsAroundOpenings, clusterOpenings } from '../src/LayeredWallOpeningBuilder';
import { buildMiterPrism } from '../src/MiterPrismBuilder';
import { computeJunctionInfills } from '../src/WallJunctionInfill';
import {
    wallSeatY, wallBaseY, hostedLeafCentreY,
    resolveWallBaseY, resolveWallBaseYOrLevel, clearWallBaseY,
} from '../src/WallVerticalDatum';
import type { WallData } from '../src/WallTypes';

// ── The fixture datum ────────────────────────────────────────────────────────
// Deliberately all distinct and all non-zero, so that no two rival expressions can
// coincide by accident and pass a test they should fail.
const ELEVATION   = 3.0;    // level.elevation           — storey 1
const SLAB_OFF    = 0.10;   // slabBaseOffset            — a 100 mm raised podium slab
const BASE_OFF    = 0.15;   // wall.baseOffset           — a 150 mm plinth
const HEIGHT      = 2.8;
const THICKNESS   = 0.20;
const SILL        = 0.90;
const OP_H        = 1.20;
const LENGTH      = 4.0;
const LEVEL_ID    = 'L1';

/** THE SEAT plane — the wall GROUP's origin. */
const SEAT_Y = wallSeatY(ELEVATION, SLAB_OFF);            // 3.10

/** THE BASE plane — the wall BODY's underside in world space. */
const BASE_Y = wallBaseY(ELEVATION, SLAB_OFF, BASE_OFF);  // 3.25

/**
 * The PRE-FIX body base — `SEAT + 2 × baseOffset`. Every "it is NOT this" assertion
 * below names this value, so a re-introduction of the doubling cannot pass.
 */
const DOUBLED_BASE_Y = SEAT_Y + 2 * BASE_OFF;             // 3.40

/** The PRE-FIX hosted-leaf datum — `elevation + sill + height/2`, offsets ignored. */
const PRE_FIX_LEAF_CENTRE_Y = ELEVATION + SILL + OP_H / 2;

const EPS = 1e-9;

// ── Fixtures ─────────────────────────────────────────────────────────────────

function plainWall(baseOffset: number, id = 'w-datum-plain'): WallData {
    return {
        id,
        levelId: LEVEL_ID,
        // §BASELINE-Y — `CreateWallCommand.ts:341-342` stamps the baseline Y as
        // `level.elevation + wall.baseOffset` (NOT 0, and NOT including
        // slabBaseOffset), while the plugin bridge stamps `ev.baseLine[i].y ?? 0`.
        // Reproduced faithfully here BECAUSE that ambiguity is unresolved — and the
        // point of the fix is that no datum depends on it any more. See
        // §STILL-DIVERGENT at the foot of the file.
        baseLine: [
            { x: 0, y: ELEVATION + baseOffset, z: 0 },
            { x: LENGTH, y: ELEVATION + baseOffset, z: 0 },
        ],
        height: HEIGHT,
        thickness: THICKNESS,
        baseOffset,
        openings: [],
    } as unknown as WallData;
}

function layeredWallWithOpening(baseOffset: number): WallData {
    return {
        ...(plainWall(baseOffset) as unknown as Record<string, unknown>),
        id: 'w-datum-layered',
        layers: [
            { name: 'Façade', function: 'finish-exterior', thickness: 0.02, materialColor: '#e2c044' },
            { name: 'Structure', function: 'structure', thickness: 0.16, materialColor: '#d9d4cc' },
            { name: 'Paint', function: 'finish-interior', thickness: 0.02, materialColor: '#f4f1ec' },
        ],
        openings: [
            { id: 'op-1', offset: 2, width: 1.2, height: OP_H, sillHeight: SILL, type: 'window', elementId: 'win-1' },
        ],
    } as unknown as WallData;
}

function makeLevelProvider(elevation: number) {
    const level = { id: LEVEL_ID, name: 'Storey 1', elevation, height: 3.2, childrenIds: [] };
    return {
        getLevelById: (id: string) => (id === LEVEL_ID ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

/**
 * Drives the REAL builder and returns the wall's scene root, world matrices resolved.
 *
 * COMMITTED ≠ REACHABLE — the world-space half of this ledger reads built scene
 * geometry, never an arithmetic restatement of the formula under test. `worldY` is
 * passed exactly as `WallRebuildCoordinator` passes it: the BASE plane.
 */
function buildReal(wall: WallData, baseY: number): { builder: WallFragmentBuilder; root: THREE.Group } {
    const builder = new WallFragmentBuilder(new THREE.Scene(), makeLevelProvider(ELEVATION) as never);
    builder.buildWall(wall, null as never, undefined, baseY);
    const root = builder.getWallRoot(wall.id) as unknown as THREE.Group;
    expect(root).toBeTruthy();
    root.updateMatrixWorld(true);
    return { builder, root };
}

/** Distinct WORLD Y values across every mesh under `root`, ascending, de-duplicated. */
function worldYs(root: THREE.Object3D): number[] {
    const out = new Set<number>();
    const v = new THREE.Vector3();
    root.traverse((o: THREE.Object3D) => {
        const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
        const pos = g?.getAttribute?.('position') as THREE.BufferAttribute | undefined;
        if (!pos) return;
        for (let i = 0; i < pos.count; i++) {
            v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(o.matrixWorld);
            out.add(Number(v.y.toFixed(6)));
        }
    });
    return [...out].sort((a, b) => a - b);
}

/** Captures the instance matrix the bridge hands the renderer. */
function captureBridgeY(
    call: (bridge: WallInstanceBridge, wall: WallData, worldY: number) => void,
    wall: WallData,
    worldY: number,
): number {
    let captured: THREE.Matrix4 | null = null;
    const renderer: IInstancedRenderer = {
        register: (_id, _geo, _mat, matrix) => { captured = matrix.clone(); },
        updateTransform: (_id, matrix) => { captured = matrix.clone(); },
        unregister: () => { /* no-op */ },
        isRegistered: () => false,
    };
    call(new WallInstanceBridge(renderer), wall, worldY);
    if (captured === null) throw new Error('bridge produced no instance matrix');
    return new THREE.Vector3().setFromMatrixPosition(captured).y;
}

/** Distinct vertex Y values in a built geometry, ascending, de-duplicated. */
function distinctYs(geo: THREE.BufferGeometry): number[] {
    const pos = geo.getAttribute('position');
    const out = new Set<number>();
    for (let i = 0; i < pos.count; i++) out.add(Number(pos.getY(i).toFixed(6)));
    return [...out].sort((a, b) => a - b);
}

function minY(geo: THREE.BufferGeometry): number {
    return distinctYs(geo)[0]!;
}

beforeEach(() => { clearWallBaseY(); });

// ─────────────────────────────────────────────────────────────────────────────

describe('§WALL-Y-DATUM-AGREEMENT — the wall BODY, measured in world space', () => {
    /**
     * THE HEADLINE FIX (L-968 defect A). Measured on real built geometry, not on the
     * formula: the lowest world vertex of the wall the builder actually emitted.
     */
    it('the body base is elevation + slabBaseOffset + baseOffset — the offset applied ONCE', () => {
        const wall = plainWall(BASE_OFF);
        const { root } = buildReal(wall, BASE_Y);

        // The GROUP sits on the SEAT plane — its children carry the baseOffset.
        expect(root.position.y).toBeCloseTo(SEAT_Y, 9);
        // NEGATIVE, same expression — it is NOT seated on the base plane any more.
        // That seating, with children authored from the seat plane, WAS the doubling.
        expect(Math.abs(root.position.y - BASE_Y)).toBeGreaterThan(EPS);

        const ys = worldYs(root);
        // POSITIVE — the built body's underside is the BASE plane.
        expect(ys[0]!).toBeCloseTo(BASE_Y, 5);
        // …and its top is one wall height above it.
        expect(ys[ys.length - 1]!).toBeCloseTo(BASE_Y + HEIGHT, 5);

        // NEGATIVE, same expression — it is NOT the pre-fix doubled reading.
        expect(Math.abs(ys[0]! - DOUBLED_BASE_Y)).toBeGreaterThan(1e-4);
        expect(DOUBLED_BASE_Y - ys[0]!).toBeCloseTo(BASE_OFF, 5);
    });

    /**
     * SITE 1+2 — `WallInstanceBridge`. The instanced body is NOT a child of the wall
     * group, so it takes no group transform and must read the BASE plane once.
     */
    it('SITE 1/2 — the instanced arm agrees with the group arms, and no longer doubles', () => {
        const wall = plainWall(BASE_OFF);

        const yRegister = captureBridgeY((b, w, y) => b.register(w, y, null), wall, BASE_Y);
        const yUpdate   = captureBridgeY((b, w, y) => b.updateTransform(w, y), wall, BASE_Y);

        // AGREEMENT — the two bridge arms are one datum, not two.
        expect(yRegister).toBeCloseTo(yUpdate, 9);

        // POSITIVE — a body based at the BASE plane has its centre half a height above.
        expect(yRegister).toBeCloseTo(BASE_Y + HEIGHT / 2, 9);

        // NEGATIVE, same expression — it is NOT the pre-fix doubled reading. This is
        // the assertion that went RED first when the doubling was removed.
        expect(Math.abs(yRegister - (DOUBLED_BASE_Y + HEIGHT / 2))).toBeGreaterThan(EPS);
        expect((DOUBLED_BASE_Y + HEIGHT / 2) - yRegister).toBeCloseTo(BASE_OFF, 9);
    });

    /**
     * SITE 3 — `LayeredWallOpeningBuilder.ts:206` (`wallBaseOffset + y`). The
     * group-local convention is UNCHANGED by this fix; what changed is the plane the
     * group sits on. Both halves are asserted so a future "fix" that moves the local
     * convention instead cannot pass silently.
     */
    it('SITE 3 — the layered arm bases at baseOffset in GROUP-LOCAL space, at BASE_Y in world', () => {
        const wall = layeredWallWithOpening(BASE_OFF);
        const group = new THREE.Group();
        const totalThickness = (wall.layers as { thickness: number }[]).reduce((s, l) => s + l.thickness, 0);
        const clusters = clusterOpenings([...(wall.openings ?? [])] as never);
        const meshes = buildLayeredWallSegmentsAroundOpenings(wall, group, clusters, totalThickness);

        expect(meshes.length).toBeGreaterThan(0);

        for (const m of meshes) {
            const local = minY(m.geometry as THREE.BufferGeometry);
            // POSITIVE — local base IS the baseOffset (the documented local convention).
            expect(local).toBeCloseTo(BASE_OFF, 6);
            // NEGATIVE, same expression — the local convention was NOT flattened to 0.
            expect(Math.abs(local - 0)).toBeGreaterThan(EPS);
            // WORLD agreement — seated on the SEAT plane it lands on the BASE plane.
            expect(SEAT_Y + local).toBeCloseTo(BASE_Y, 9);
            // NEGATIVE, same expression — seated on the BASE plane it would double.
            expect(BASE_Y + local).toBeCloseTo(DOUBLED_BASE_Y, 9);
        }
    });

    /** SITE 4 — `MiterPrismBuilder`, same group-local convention, same world answer. */
    it('SITE 4 — the miter-prism segment arm agrees with the layered arm', () => {
        const geo = buildMiterPrism(
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(LENGTH, 0, 0),
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(LENGTH, 0, 0),
            THICKNESS / 2,
            HEIGHT,
            BASE_OFF,
            null, null, null, null,
        );

        const local = minY(geo);
        expect(local).toBeCloseTo(BASE_OFF, 6);
        expect(Math.abs(local - 0)).toBeGreaterThan(EPS);
        expect(SEAT_Y + local).toBeCloseTo(BASE_Y, 9);
    });
});

describe('§WALL-Y-DATUM-AGREEMENT — the HOLE and the LEAF that fills it', () => {
    /**
     * The hole is measured as a real y-BREAK in built geometry — a vertex plane that
     * actually exists — not asserted from the formula that produced it.
     */
    it('the opening hole is a real world y-break at BASE_Y + sillHeight', () => {
        const wall = layeredWallWithOpening(BASE_OFF);
        const group = new THREE.Group();
        group.position.y = SEAT_Y;                 // as `WallFragmentBuilder` now seats it
        const totalThickness = (wall.layers as { thickness: number }[]).reduce((s, l) => s + l.thickness, 0);
        const clusters = clusterOpenings([...(wall.openings ?? [])] as never);
        const meshes = buildLayeredWallSegmentsAroundOpenings(wall, group, clusters, totalThickness);
        for (const m of meshes) group.add(m);
        group.updateMatrixWorld(true);

        const ys = worldYs(group);
        const near = (v: number) => ys.some(y => Math.abs(y - v) < 1e-5);

        // POSITIVE — the hole's bottom and head edges, in WORLD space.
        expect(near(BASE_Y + SILL)).toBe(true);
        expect(near(BASE_Y + SILL + OP_H)).toBe(true);
        // NEGATIVE, same expression — NOT at the pre-fix doubled height, and NOT at
        // the bare level datum either.
        expect(near(DOUBLED_BASE_Y + SILL)).toBe(false);
        expect(near(ELEVATION + SILL)).toBe(false);
    });

    /**
     * ⭐ THE C84 §9 DELTA, CLOSED.
     *
     * `DoorBuilder` / `WindowBuilder` now seat the leaf through
     * `resolveWallBaseYOrLevel` + `hostedLeafCentreY` — the same two functions this
     * asserts. The leaf's own scene placement is measured at ITS OWN builder in
     * `geometry-window/__tests__/HostedLeafSitsInItsHole.test.ts` and
     * `geometry-door/__tests__/HostedLeafSitsInItsHole.test.ts`, which drive the real
     * `WallFragmentBuilder` and the real leaf builder together; this assertion pins
     * the arithmetic those two share so a drift shows up in one place.
     */
    it('C84 §9 — leaf-vs-hole delta is now ZERO at non-zero offsets (was slabBaseOffset + 2 × baseOffset)', () => {
        const wall = plainWall(BASE_OFF);
        buildReal(wall, BASE_Y);                    // the real build PUBLISHES the plane

        const published = resolveWallBaseY(wall.id);
        expect(published).toBeCloseTo(BASE_Y, 9);

        const leafCentre = hostedLeafCentreY(
            resolveWallBaseYOrLevel(wall.id, ELEVATION, BASE_OFF),
            SILL,
            OP_H,
        );
        const holeBottomWorld = BASE_Y + SILL;
        const leafBottomWorld = leafCentre - OP_H / 2;

        // POSITIVE — they are the same plane.
        expect(holeBottomWorld - leafBottomWorld).toBeCloseTo(0, 9);

        // NEGATIVE, same expression — it is NOT the recorded pre-fix delta. Both
        // halves of the PRE-FIX pair are reproduced (the doubled hole AND the
        // offset-blind leaf), because C84 §9's `slabBaseOffset + 2 × baseOffset` is
        // the gap between THOSE two, not between the fixed hole and the old leaf.
        const preFixHoleBottom = DOUBLED_BASE_Y + SILL;
        const preFixLeafBottom = PRE_FIX_LEAF_CENTRE_Y - OP_H / 2;
        const preFixDelta = preFixHoleBottom - preFixLeafBottom;
        expect(preFixDelta).toBeCloseTo(SLAB_OFF + 2 * BASE_OFF, 9);
        expect(Math.abs(holeBottomWorld - leafBottomWorld)).toBeLessThan(EPS);
        expect(Math.abs(preFixDelta)).toBeGreaterThan(EPS);
        // …and the fix moved BOTH halves toward each other, not just one: the leaf
        // rose by `slabBaseOffset + baseOffset` and the hole fell by `baseOffset`.
        expect(leafBottomWorld - preFixLeafBottom).toBeCloseTo(SLAB_OFF + BASE_OFF, 9);
        expect(preFixHoleBottom - holeBottomWorld).toBeCloseTo(BASE_OFF, 9);
    });

    /**
     * The publication is the LINK. Without it a hosted leaf falls back to a datum it
     * can see for itself — which omits `slabBaseOffset`, a value that lives on the
     * SLAB store and is unreachable from `@pryzm/geometry-door` / `-window`.
     * That residual is NAMED, not hidden.
     */
    it('an UNBUILT host falls back honestly — the residual is exactly slabBaseOffset', () => {
        expect(resolveWallBaseY('never-built')).toBeUndefined();

        const fallback = resolveWallBaseYOrLevel('never-built', ELEVATION, BASE_OFF);

        // POSITIVE — the fallback carries `wall.baseOffset`, which the pre-fix
        // expression did not carry at all.
        expect(fallback).toBeCloseTo(ELEVATION + BASE_OFF, 9);
        // NEGATIVE, same expression — it is NOT the published plane, and the gap is
        // the slab term and nothing else.
        expect(BASE_Y - fallback).toBeCloseTo(SLAB_OFF, 9);
        expect(Math.abs(fallback - PRE_FIX_LEAF_CENTRE_Y)).toBeGreaterThan(EPS);
    });
});

describe('§WALL-Y-DATUM-AGREEMENT — junction infill', () => {
    /**
     * SITE 5 (L-968 defect B). `WallJunctionInfillManager.ts:122-123` extrudes from
     * `infill.elevation` and adds the mesh UNTRANSFORMED, so that value is world Y.
     * It used to be the wall BASELINE Y — short of the body base by
     * `slabBaseOffset + wall.baseOffset`, and dependent on which route created the
     * wall. It is now the published BASE plane.
     */
    it('SITE 5 — infill is extruded from the published BASE plane, flush with the bodies', () => {
        const mk = (id: string, ex: number, ez: number): WallData => ({
            id,
            levelId: LEVEL_ID,
            baseLine: [
                { x: 0, y: ELEVATION + BASE_OFF, z: 0 },
                { x: ex, y: ELEVATION + BASE_OFF, z: ez },
            ],
            height: HEIGHT,
            thickness: THICKNESS,
            baseOffset: BASE_OFF,
            openings: [],
        }) as unknown as WallData;

        const walls = [mk('w-a', 4, 0), mk('w-b', 0, 4), mk('w-c', -4, 0)];
        // Build all three for real, so each PUBLISHES its own base plane.
        for (const w of walls) buildReal(w, BASE_Y);

        const infills = computeJunctionInfills(walls);
        expect(infills.length).toBeGreaterThan(0);
        const yBot = infills[0]!.elevation;         // WallJunctionInfillManager.ts:122

        // POSITIVE — flush with the wall bodies it patches.
        expect(yBot).toBeCloseTo(BASE_Y, 9);
        // NEGATIVE, same expression — it is NOT the baseline datum it used to read.
        const baselineY = ELEVATION + BASE_OFF;
        expect(Math.abs(yBot - baselineY)).toBeGreaterThan(EPS);
        expect(yBot - baselineY).toBeCloseTo(SLAB_OFF, 9);
    });

    /**
     * The fallback arm, kept honest: with NO wall built, the infill reproduces its
     * pre-L-968 behaviour exactly rather than inventing a plane. `undefined` from the
     * authority means NOT MEASURED and is never coerced to 0.
     */
    it('with no host built, the infill falls back to the baseline datum — pre-fix behaviour, unchanged', () => {
        const mk = (id: string, ex: number, ez: number): WallData => ({
            id,
            levelId: LEVEL_ID,
            baseLine: [
                { x: 0, y: ELEVATION + BASE_OFF, z: 0 },
                { x: ex, y: ELEVATION + BASE_OFF, z: ez },
            ],
            height: HEIGHT, thickness: THICKNESS, baseOffset: BASE_OFF, openings: [],
        }) as unknown as WallData;

        const infills = computeJunctionInfills([mk('u-a', 4, 0), mk('u-b', 0, 4), mk('u-c', -4, 0)]);
        expect(infills.length).toBeGreaterThan(0);
        expect(infills[0]!.elevation).toBeCloseTo(ELEVATION + BASE_OFF, 9);
        expect(Math.abs(infills[0]!.elevation - BASE_Y)).toBeGreaterThan(EPS);
    });
});

describe('§WALL-Y-DATUM-AGREEMENT — the collapse control', () => {
    /**
     * THE COLLAPSE CONTROL. Every divergence above vanishes at zero offsets — which
     * is exactly why the defect went unmeasured for so long, and exactly why no
     * assertion in this file may be written with `baseOffset === 0`.
     *
     * It is also the NON-VACUITY guard for the fix: a project with no plinth and no
     * raised slab must render byte-identically to before, and it does — at zero
     * offsets `SEAT === BASE` and the group transform is unchanged.
     */
    it('CONTROL — at zero offsets every datum collapses to one value (why this went unseen)', () => {
        const wall = plainWall(0, 'w-datum-zero');
        const zeroBase = wallBaseY(ELEVATION, 0, 0);

        expect(wallSeatY(ELEVATION, 0)).toBeCloseTo(zeroBase, 9);

        const { root } = buildReal(wall, zeroBase);
        expect(root.position.y).toBeCloseTo(zeroBase, 9);
        expect(worldYs(root)[0]!).toBeCloseTo(zeroBase, 5);

        const yBridge = captureBridgeY((b, w, y) => b.register(w, y, null), wall, zeroBase);
        expect(yBridge).toBeCloseTo(zeroBase + HEIGHT / 2, 9);

        const holeBottom0 = zeroBase + SILL;
        const leafBottom0 = hostedLeafCentreY(
            resolveWallBaseYOrLevel(wall.id, ELEVATION, 0), SILL, OP_H,
        ) - OP_H / 2;
        expect(holeBottom0 - leafBottom0).toBeCloseTo(0, 9);

        // …and the PRE-FIX leaf expression collapses onto it too. This is the whole
        // reason the defect was invisible, asserted rather than asserted-about.
        expect(PRE_FIX_LEAF_CENTRE_Y - OP_H / 2).toBeCloseTo(holeBottom0, 9);
    });
});

/**
 * §STILL-DIVERGENT — what this fix did NOT converge, named with its delta.
 *
 * 1. **`SpatialAuthority.resolveWorldTransform(wallId)`** returns
 *    `level.elevation + baseOffset + verticalPosition` (`SpatialAuthority.ts:159`) —
 *    it has never seen `slabBaseOffset`. `WallFragmentBuilder` uses it ONLY as the
 *    fallback when no `worldY` is supplied (`:1102`), which the live path
 *    (`WallRebuildCoordinator`) never takes; but a direct builder call still lands a
 *    wall `slabBaseOffset` low. Delta = `slabBaseOffset`. It lives in
 *    `@pryzm/core-app-model`, outside this lane's territory, and closing it means
 *    deciding whether the spatial authority may read the slab store at all.
 *
 * 2. **The wall BASELINE Y means two things.** `CreateWallCommand.ts:341` stamps
 *    `elevation + baseOffset`; the plugin bridge stamps `ev.baseLine[i].y ?? 0`. No
 *    RENDER datum depends on it any more — that was the point of routing the
 *    junction infill through the authority — but the field is still ambiguous and
 *    both writers are outside this package. Until it is decided, nothing new may
 *    read `baseLine[i].y` as an elevation.
 *
 * 3. **`WallLayerPlanSymbolBuilder.ts:143`** places the plan cut line at
 *    `baseLine[0].y + baseOffset + DEFAULT_CUT_ABOVE_FLOOR_M` — the BASELINE datum
 *    again, and so a FIFTH reading. It is a 2-D draughting elevation rather than a
 *    solid, and its sibling at `:134` (`cutRelToBase`) is correctly base-RELATIVE, so
 *    nothing a user sees in plan moves; it is named here because it still reads
 *    `baseLine[i].y` as an elevation and inherits item 2's ambiguity. Delta from the
 *    BASE plane = `slabBaseOffset`. Deliberately NOT changed by this lane: re-seating
 *    a plan cut plane is a draughting decision with its own baselines.
 *
 * 4. **`slab.setBaseOffset` is a dead verb** (C84 §9 / L-968): `CommandEventBridge`
 *    has no case for it, so that DTO write never reaches the geometry store. The
 *    LIVE authoring route for both offsets is the property panel and the
 *    `set-base-offset` chat capability, via `UpdateElementParameterCommand`.
 */
