/**
 * §WALL-Y-DATUM-AGREEMENT — the wall vertical-datum ledger.
 *
 * WHAT THIS PINS, AND WHY IT EXISTS
 * ---------------------------------
 * C84 §9 carries a NOT-MEASURED register entry: ten sites compute a wall-related
 * world-Y and only two of them had ever been measured against each other. The
 * declared authority is
 *
 *     WallFragmentBuilder.ts:745   worldY = level.elevation + (slabBaseOffset ?? 0) + (wall.baseOffset ?? 0)
 *
 * restated verbatim by the LIVE caller at `WallRebuildCoordinator.ts:546`. That
 * value becomes `wallGroup.position.y` (`WallFragmentBuilder.ts:1114`), so it is
 * the GROUP ORIGIN — not the wall body's base. Every body arm then adds
 * `wall.baseOffset` a SECOND time in group-local space. The rendered wall base is
 * therefore
 *
 *     level.elevation + slabBaseOffset + 2 × wall.baseOffset
 *
 * and C84 §9's leaf-vs-hole delta of `slabBaseOffset + 2 × wall.baseOffset` is
 * arithmetically right precisely BECAUSE of that doubling — which had never been
 * named as its own term.
 *
 * ⚠ THIS IS A CHARACTERISATION LEDGER, NOT AN APPROVAL. The doubling and the
 * junction-infill divergence are recorded here as the measured TRUTH so that:
 *   1. the body arms cannot silently drift apart from EACH OTHER (they agree today
 *      — that mutual agreement is the invariant worth keeping), and
 *   2. a deliberate fix to the doubling must come here and change these numbers on
 *      purpose, rather than discovering the delta a third time.
 *
 * Every assertion is paired: the positive pin on the value the code produces, and
 * a negative on the SAME expression against the rival datum it is NOT using. With
 * `baseOffset === 0` the two collapse and prove nothing, so the fixture uses a
 * NON-ZERO baseOffset and a NON-ZERO slabBaseOffset throughout.
 *
 * ⭐ THE OFFSETS ARE LIVE, NOT LATENT. C84 §9 recorded the delta as LATENT on the
 * ground that "nothing authors either offset non-zero". Measured otherwise — see
 * `§LIVE-AUTHORING` below and the lane report. Both offsets are authorable to any
 * finite value from two shipped user surfaces.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

import { WallInstanceBridge } from '../src/WallInstanceBridge';
import type { IInstancedRenderer } from '../src/IInstancedRenderer';
import { buildLayeredWallSegmentsAroundOpenings, clusterOpenings } from '../src/LayeredWallOpeningBuilder';
import { buildMiterPrism } from '../src/MiterPrismBuilder';
import { computeJunctionInfills } from '../src/WallJunctionInfill';
import type { WallData } from '../src/WallTypes';

// ── The fixture datum ────────────────────────────────────────────────────────
// Deliberately all distinct and all non-zero, so that no two rival expressions
// can coincide by accident and pass a test they should fail.
const ELEVATION   = 3.0;    // level.elevation           — storey 1
const SLAB_OFF    = 0.10;   // slabBaseOffset            — a 100 mm raised podium slab
const BASE_OFF    = 0.15;   // wall.baseOffset           — a 150 mm plinth
const HEIGHT      = 2.8;
const THICKNESS   = 0.20;
const SILL        = 0.90;
const OP_H        = 1.20;
const LENGTH      = 4.0;

/**
 * THE DECLARED AUTHORITY — `WallFragmentBuilder.ts:745`, restated at
 * `WallRebuildCoordinator.ts:546`. This is the wall GROUP ORIGIN.
 */
function canonicalGroupY(elevation: number, slabBaseOffset: number, baseOffset: number): number {
    return elevation + slabBaseOffset + baseOffset;
}

const GROUP_Y = canonicalGroupY(ELEVATION, SLAB_OFF, BASE_OFF);

/**
 * The MEASURED wall-body base in world space, as every body arm actually places
 * it: group origin + a second application of `wall.baseOffset` in local space.
 */
const MEASURED_BODY_BASE_Y = GROUP_Y + BASE_OFF;

/**
 * The datum the hosted LEAF uses — `DoorBuilder.ts:600` / `WindowBuilder.ts:927`,
 * both `elevation + sillHeight + height / 2`, and `slabBaseOffset` occurs ZERO
 * times in `geometry-door/src` + `geometry-window/src` (C84 §9, C86, re-confirmed
 * by this lane).
 */
function hostedLeafCentreY(elevation: number, sillHeight: number, leafHeight: number): number {
    return elevation + sillHeight + leafHeight / 2;
}

const EPS = 1e-9;

// ── Fixtures ─────────────────────────────────────────────────────────────────

function plainWall(baseOffset: number): WallData {
    return {
        id: 'w-datum-plain',
        levelId: 'L1',
        // §BASELINE-Y — `CreateWallCommand.ts:341-342` stamps the baseline Y as
        // `level.elevation + wall.baseOffset` (NOT 0, and NOT including
        // slabBaseOffset). The body builders discard it; the junction-infill path
        // is the ONE consumer that reads it. Reproduced faithfully here.
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
    return distinctYs(geo)[0];
}

// ─────────────────────────────────────────────────────────────────────────────

describe('§WALL-Y-DATUM-AGREEMENT — the body arms must agree with EACH OTHER', () => {
    /**
     * SITE 1+2 — `WallInstanceBridge.ts:105` (register) and `:147`
     * (updateTransform). Both read `worldY + wall.height / 2 + (wall.baseOffset ?? 0)`
     * where the `worldY` handed in ALREADY contains `wall.baseOffset`
     * (`WallFragmentBuilder.ts:1269` passes `resolvedY`, which is the group origin).
     */
    it('SITE 1/2 — WallInstanceBridge register and updateTransform place the body centre at the SAME Y', () => {
        const wall = plainWall(BASE_OFF);

        const yRegister = captureBridgeY(
            (b, w, y) => b.register(w, y, null),
            wall,
            GROUP_Y,
        );
        const yUpdate = captureBridgeY(
            (b, w, y) => b.updateTransform(w, y),
            wall,
            GROUP_Y,
        );

        // AGREEMENT — the two bridge arms are one datum, not two.
        expect(yRegister).toBeCloseTo(yUpdate, 9);

        // POSITIVE — the value the code produces: group origin + a SECOND baseOffset.
        expect(yRegister).toBeCloseTo(MEASURED_BODY_BASE_Y + HEIGHT / 2, 9);

        // NEGATIVE, same expression — it is NOT the single-count reading of
        // `WallFragmentBuilder.ts:745`. If a future fix removes the doubling this
        // flips, and it must flip DELIBERATELY.
        expect(Math.abs(yRegister - (GROUP_Y + HEIGHT / 2))).toBeGreaterThan(EPS);
        expect(yRegister - (GROUP_Y + HEIGHT / 2)).toBeCloseTo(BASE_OFF, 9);
    });

    /**
     * SITE 3 — `LayeredWallOpeningBuilder.ts:206` (`wallBaseOffset + y`), reading
     * `wall.baseOffset` at `:390`. Geometry is emitted in GROUP-LOCAL space, so
     * its local base is `wall.baseOffset` and its world base is
     * `GROUP_Y + wall.baseOffset`.
     */
    it('SITE 3 — the layered arm bases the body at wall.baseOffset in group-local space', () => {
        const wall = layeredWallWithOpening(BASE_OFF);
        const group = new THREE.Group();
        const totalThickness = (wall.layers as { thickness: number }[]).reduce((s, l) => s + l.thickness, 0);
        const clusters = clusterOpenings([...(wall.openings ?? [])] as never);
        const meshes = buildLayeredWallSegmentsAroundOpenings(wall, group, clusters, totalThickness);

        expect(meshes.length).toBeGreaterThan(0);

        for (const m of meshes) {
            const local = minY(m.geometry as THREE.BufferGeometry);
            // POSITIVE — local base IS the baseOffset.
            expect(local).toBeCloseTo(BASE_OFF, 6);
            // NEGATIVE, same expression — it is NOT zero, i.e. the offset really is
            // applied a second time inside a group already raised by it.
            expect(Math.abs(local - 0)).toBeGreaterThan(EPS);
            // World agreement with the instanced arm.
            expect(GROUP_Y + local).toBeCloseTo(MEASURED_BODY_BASE_Y, 9);
        }
    });

    /**
     * SITE 4 — `MiterPrismBuilder.buildMiterPrism`, the geometry
     * `WallFragmentBuilder` emits for every mitred / opening-bearing segment
     * (`:2398`, `:2519`, `:2565`, `:1441`). Same group-local convention.
     */
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
        expect(GROUP_Y + local).toBeCloseTo(MEASURED_BODY_BASE_Y, 9);
    });

    /**
     * The hole cut in the wall body sits at `baseOffset + sillHeight` in group-local
     * space — measured, not asserted from the formula: a real y-break must EXIST in
     * the built geometry at that height.
     */
    it('SITE 3b — the opening hole bottom is a real y-break at baseOffset + sillHeight', () => {
        const wall = layeredWallWithOpening(BASE_OFF);
        const group = new THREE.Group();
        const totalThickness = (wall.layers as { thickness: number }[]).reduce((s, l) => s + l.thickness, 0);
        const clusters = clusterOpenings([...(wall.openings ?? [])] as never);
        const meshes = buildLayeredWallSegmentsAroundOpenings(wall, group, clusters, totalThickness);

        const ys = distinctYs(meshes[0].geometry as THREE.BufferGeometry);
        const near = (v: number) => ys.some(y => Math.abs(y - v) < 1e-5);

        // POSITIVE — the hole bottom edge is where the offset-shifted band puts it.
        expect(near(BASE_OFF + SILL)).toBe(true);
        expect(near(BASE_OFF + SILL + OP_H)).toBe(true);
        // NEGATIVE, same expression — it is NOT at the un-offset sill.
        expect(near(SILL)).toBe(false);
    });
});

describe('§WALL-Y-DATUM-AGREEMENT — the sites that DIVERGE', () => {
    /**
     * SITE 5 — `WallJunctionInfillManager.ts:122-123`:
     *     yBot = infill.elevation ; yTop = infill.elevation + height
     * and `infill.elevation` is `consensusPoint.y` (`WallJunctionInfill.ts:182, :359`),
     * i.e. the wall BASELINE Y. The mesh is added to the scene UNTRANSFORMED
     * (`WallJunctionInfillManager.ts:~84` `scene.add(mesh)`), so that value is world Y.
     *
     * The baseline Y is `level.elevation + wall.baseOffset` (`CreateWallCommand.ts:341`)
     * — it never saw `slabBaseOffset`, and it carries only ONE `baseOffset`.
     *
     * ⇒ divergence from the measured wall-body base = `slabBaseOffset + wall.baseOffset`.
     */
    it('SITE 5 — junction infill is built on the BASELINE datum, short by slabBaseOffset + wall.baseOffset', () => {
        // Three walls meeting at the origin — the minimum for a junction cluster.
        const mk = (id: string, ex: number, ez: number): WallData => ({
            id,
            levelId: 'L1',
            baseLine: [
                { x: 0, y: ELEVATION + BASE_OFF, z: 0 },
                { x: ex, y: ELEVATION + BASE_OFF, z: ez },
            ],
            height: HEIGHT,
            thickness: THICKNESS,
            baseOffset: BASE_OFF,
            openings: [],
        }) as unknown as WallData;

        const infills = computeJunctionInfills([
            mk('w-a', 4, 0),
            mk('w-b', 0, 4),
            mk('w-c', -4, 0),
        ]);

        expect(infills.length).toBeGreaterThan(0);
        const yBot = infills[0].elevation;   // WallJunctionInfillManager.ts:122

        // POSITIVE — it is the baseline datum.
        expect(yBot).toBeCloseTo(ELEVATION + BASE_OFF, 9);

        // NEGATIVE, same expression — it is NOT the wall body base the infill is
        // supposed to patch flush against.
        expect(Math.abs(yBot - MEASURED_BODY_BASE_Y)).toBeGreaterThan(EPS);

        // THE DELTA, as an expression.
        expect(MEASURED_BODY_BASE_Y - yBot).toBeCloseTo(SLAB_OFF + BASE_OFF, 9);
    });

    /**
     * THE C84 §9 DELTA — hosted leaf vs the hole cut for it.
     *
     * Wall-side half is MEASURED above (the hole bottom is a real y-break at
     * `GROUP_Y + baseOffset + sillHeight`). Leaf half is the expression at
     * `DoorBuilder.ts:600` / `WindowBuilder.ts:927`, which reads neither
     * `slabBaseOffset` (0 occurrences in either package) nor `wall.baseOffset`.
     */
    it('C84 §9 — leaf-vs-hole delta is exactly slabBaseOffset + 2 × wall.baseOffset', () => {
        const holeBottomWorld = MEASURED_BODY_BASE_Y + SILL;
        const leafBottomWorld = hostedLeafCentreY(ELEVATION, SILL, OP_H) - OP_H / 2;

        // POSITIVE — the recorded delta, reproduced.
        expect(holeBottomWorld - leafBottomWorld).toBeCloseTo(SLAB_OFF + 2 * BASE_OFF, 9);

        // NEGATIVE, same expression — it is NOT the single-baseOffset reading that
        // C84 §9's prose ("wall body Y = elevation + slabBaseOffset + baseOffset")
        // would imply if that were the BODY BASE rather than the GROUP ORIGIN.
        expect(Math.abs((holeBottomWorld - leafBottomWorld) - (SLAB_OFF + BASE_OFF))).toBeGreaterThan(EPS);
    });

    /**
     * THE COLLAPSE CONTROL. Every divergence above vanishes at zero offsets — which
     * is exactly why the defect went unmeasured for so long, and exactly why no
     * assertion in this file may be written with `baseOffset === 0`.
     */
    it('CONTROL — at zero offsets every datum collapses to one value (why this went unseen)', () => {
        const wall = plainWall(0);
        const groupY0 = canonicalGroupY(ELEVATION, 0, 0);

        const yBridge = captureBridgeY((b, w, y) => b.register(w, y, null), wall, groupY0);
        expect(yBridge).toBeCloseTo(groupY0 + HEIGHT / 2, 9);

        const holeBottom0 = groupY0 + 0 + SILL;
        const leafBottom0 = hostedLeafCentreY(ELEVATION, SILL, OP_H) - OP_H / 2;
        expect(holeBottom0 - leafBottom0).toBeCloseTo(0, 9);
    });
});

/**
 * §LIVE-AUTHORING — the register entry says LATENT. It is LIVE.
 *
 * This is not a geometry assertion, so it is stated here rather than asserted: the
 * evidence is a reachability chain, and the lane report carries it in full. In
 * short, both offsets are authorable to ANY finite value from shipped surfaces:
 *
 *   wall.baseOffset  — `PropertyDescriptorGenerator.ts:64` declares
 *                      `baseOffset: NUMBER('Base Offset', 'instance', 'instance', true)`
 *                      i.e. an EDITABLE panel row for `wall`; and the chat capability
 *                      `set-base-offset` (`ChatCapabilityRegistry.ts:1096-1136`,
 *                      targets include 'wall' and 'slab') dispatches
 *                      `element.updateParameters`.
 *   slab.baseOffset  — same panel row at `PropertyDescriptorGenerator.ts:89`, same
 *                      chat capability; plus `slab.create` / `slab.batch.create`
 *                      carry `baseOffset` through `CommandEventBridge.ts:366, :405`
 *                      into the legacy geometry store at `initTools.ts:1731`.
 *
 * Both land in the GEOMETRY stores — `UpdateElementParameterCommand.ts:113-114`
 * routes `wall → context.stores.wallStore` and `slab → context.stores.slabStore` —
 * and `triggerGeometryRebuild` then calls `buildWall` / the slab builder. The wall
 * side then reads `slab.baseOffset` back out through
 * `SlabWallCoupling.resolveSlabBaseOffsetForWall:121`, which is what
 * `WallRebuildCoordinator.ts:544` feeds in as `slabBaseOffset`.
 */
