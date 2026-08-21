// @vitest-environment happy-dom
/**
 * §NAV-SMOOTHNESS (L-1780) — THE PER-FAMILY DRAW-CALL CENSUS, at founder scale.
 *
 * ═══ THE MEASUREMENT THAT DROVE THIS FILE ══════════════════════════════════
 *
 * From the founder's own production console:
 *
 *     §SWAP-PAINTS-THE-BUILDING sceneMeshes=3906 ofThoseVisible=3859
 *       drawCalls=7589 triangles=470396
 *     [SceneQualityTier] 4751 meshes → tier=performance
 *
 * ⭐ 470k triangles is NOTHING for a modern GPU. 7589 draw calls at 60 Hz is the
 * wall. This scene is DRAW-CALL BOUND, not triangle bound — so the lever is
 * "how many objects does the renderer have to submit", and the only mechanism
 * that moves that number without deleting geometry is INSTANCING.
 *
 * ═══ WHAT THIS FILE ESTABLISHES, AND WHAT IT DOES NOT ══════════════════════
 *
 * ⭐ IT DOES: drive the REAL `StairRailingBuilder` and the REAL
 * `HandrailFragmentBuilder` into a REAL `THREE.Scene` through the REAL
 * `InstancedElementRenderer` + `ElementInstanceBridge` (never a spy — a spy
 * cannot tell you whether the groups actually COLLAPSE, which is the entire
 * question), at the founder's scale, and count what the renderer would have to
 * submit. It runs the identical scene twice — instancing OFF, then ON — so the
 * BEFORE and the AFTER are the same scene and the delta is attributable.
 *
 * ⛔ IT DOES NOT measure frame time, and must never be quoted as if it did.
 * There is no GPU in this process. `drawCalls` here is a SCENE-GRAPH count
 * derived by the model documented on {@link censusScene}: one submission per
 * visible single-material mesh, one per InstancedMesh regardless of instance
 * count. That is what a forward WebGL pass does, but it EXCLUDES the shadow
 * pass (which re-submits casters), frustum culling (which removes off-screen
 * objects) and post-processing. So this is an UPPER BOUND on the main pass and
 * a LOWER BOUND on the frame, and the honest claim it supports is a RATIO
 * ("this family collapses N:1"), never an FPS.
 *
 * ⚠ AND IT IS A CENSUS FIRST, A BUDGET SECOND. Every ceiling below is set at
 * what the code does TODAY, measured, not chosen. The suite asserts nothing
 * about what is acceptable — only about what CHANGES.
 *
 * ═══ WHY THESE TWO FAMILIES ════════════════════════════════════════════════
 *
 * The founder named them: *"check all elements are now instanced (railings
 * stairs...)"*. They are also the textbook worst case — a railing is dozens of
 * small repeated balusters, each of which is, on the fragment path, its own
 * `BoxGeometry` + its own `Mesh` + its own draw call.
 *
 * CONTRACTS: C04 (rendering/scheduling budget) · ADR-0076 Axis 3 (instancing) ·
 * C95 §15.5 (handrail) · C99 (stair).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { isSharedGpuResource } from '@pryzm/renderer-three';
import {
    InstancedElementRenderer,
    ElementInstanceBridge,
} from '@pryzm/core-app-model/rendering';
import type { HandrailData } from '@pryzm/core-app-model/stores';

import { resetSharedMaterialCache } from '@pryzm/core-app-model/rendering';
import { HandrailFragmentBuilder } from '../HandrailFragmentBuilder';
import { StairRailingBuilder } from '@pryzm/geometry-stair';
import type { StairRailingConfig } from '@pryzm/geometry-stair';
import type { StairData } from '@pryzm/geometry-stair';

// ── Flag surface under test ──────────────────────────────────────────────────
const g = globalThis as {
    __pryzmElementInstancingV1?: boolean;
    __pryzmElementInstancing?: Record<string, boolean>;
};

const _origWindow = (globalThis as { window?: unknown }).window;
beforeEach(() => {
    // StairRailingBuilder's constructor wires DOM + runtime listeners.
    (globalThis as { window?: unknown }).window = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        runtime: { events: { on: vi.fn() } },
    };
});
afterEach(() => {
    (globalThis as { window?: unknown }).window = _origWindow;
    delete g.__pryzmElementInstancingV1;
    delete g.__pryzmElementInstancing;
});

// ── The census ───────────────────────────────────────────────────────────────

interface Census {
    /** Every `THREE.Mesh` in the graph, instanced groups included. */
    meshes: number;
    /** Plain (non-instanced) meshes — one draw submission each. */
    standaloneMeshes: number;
    /** `THREE.InstancedMesh` groups — one draw submission each, any instance count. */
    instancedGroups: number;
    /** Instances packed into those groups — the elements that cost NO extra call. */
    instances: number;
    /**
     * DISTINCT material INSTANCES by object identity.
     *
     * ⭐ IDENTITY, NOT COLOUR. Two `MeshStandardMaterial`s with identical
     * parameters are still two shader programs / two render pipelines, and still
     * two InstanceGroups. Counting by `.color.getHex()` would report "1" over
     * precisely the explosion this measures.
     */
    materials: number;
    /** DISTINCT geometry buffers by identity — GPU upload count. */
    geometries: number;
    /**
     * THE HEADLINE. Submissions for one forward pass:
     *   standalone visible meshes  +  instanced groups.
     * See the file header for what this excludes (shadow pass, culling, post).
     */
    drawCalls: number;
}

function censusScene(scene: THREE.Object3D): Census {
    const materials = new Set<THREE.Material>();
    const geometries = new Set<THREE.BufferGeometry>();
    let meshes = 0;
    let standalone = 0;
    let groups = 0;
    let instances = 0;

    scene.traverse((o) => {
        const mesh = o as THREE.Mesh & { isInstancedMesh?: boolean; count?: number };
        if (!mesh.isMesh) return;
        meshes++;
        if (mesh.isInstancedMesh) {
            groups++;
            instances += mesh.count ?? 0;
        } else if (o.visible !== false) {
            standalone++;
        }
        const mat = mesh.material;
        if (mat) for (const one of Array.isArray(mat) ? mat : [mat]) materials.add(one);
        if (mesh.geometry) geometries.add(mesh.geometry);
    });

    return {
        meshes,
        standaloneMeshes: standalone,
        instancedGroups: groups,
        instances,
        materials: materials.size,
        geometries: geometries.size,
        drawCalls: standalone + groups,
    };
}

function print(label: string, c: Census, elements: number): void {
    // eslint-disable-next-line no-console
    console.log(
        `[census] ${label}: ${elements} elements -> ${c.drawCalls} DRAW CALLS ` +
        `(${c.standaloneMeshes} standalone + ${c.instancedGroups} instanced groups ` +
        `holding ${c.instances} instances) | ${c.meshes} meshes, ` +
        `${c.materials} materials, ${c.geometries} geometries`,
    );
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const stubBim = { getLevelById: (_id: string) => ({ elevation: 0 }) } as never;

/**
 * `elementRegistry` is a MODULE SINGLETON that throws on a duplicate id, and this
 * suite deliberately builds the same scene more than once (that is the whole
 * point of a before/after). So every run gets its own id namespace rather than
 * the suite reaching into the registry to clear it — a census must not mutate
 * global state its subject depends on.
 */
let _run = 0;
let _ns = 'r0';

/** A straight single-flight stair — the commonest real shape. */
function makeStair(i: number): StairData {
    return {
        id: `${_ns}-stair-${i}`,
        type: 'stair',
        levelId: 'level-1',
        baseLevelId: 'level-1',
        topLevelId: 'level-2',
        baseOffset: 0,
        topOffset: 0,
        shape: 'I',
        startPosition: { x: i * 6, y: 0, z: 0 },
        width: 1.0,
        riserHeight: 0.18,
        treadDepth: 0.28,
        riserCount: 16,
        flights: [{ direction: { x: 1, y: 0, z: 0 }, riserCount: 16 }],
        landings: [],
        properties: {
            riserVisible: true, nosingType: 'standard', nosingDepth: 0.025,
            stringerType: 'none', handrailLeft: true, handrailRight: true,
            handrailHeight: 1.05,
        },
    } as unknown as StairData;
}

function makeRailing(i: number, side: 'left' | 'right'): StairRailingConfig {
    return {
        id: `${_ns}-railing-${i}-${side}`,
        stairId: `${_ns}-stair-${i}`,
        side,
        topRailHeight: 1.0,
        balusterSpacing: 0.3,
        balusterShape: 'rectangular',
        balusterWidth: 0.04,
        postAtStart: true,
        postAtEnd: true,
        material: 'steel',
        railingType: 'flat-bar',
    } as unknown as StairRailingConfig;
}

function makeHandrail(i: number): HandrailData {
    return {
        id: `${_ns}-handrail-${i}`,
        type: 'handrail',
        levelId: 'level-1',
        baseLine: [{ x: i * 3, y: 0, z: 10 }, { x: i * 3 + 2, y: 0, z: 10 }],
        height: 1.0,
        thickness: 0.05,
        baseOffset: 0,
        materialColor: '#888888',
        fillType: 'baluster',
        balusterSpacing: 0.1,
        balusterShape: 'rectangular',
        balusterWidth: 0.02,
        postSpacing: 1.0,
    } as unknown as HandrailData;
}

/**
 * Build the SAME scene under whichever instancing regime the caller set, and
 * census it. Everything downstream of this function is identical between the
 * OFF and ON runs — that is what makes the delta attributable.
 *
 * @param stairs    stairs, each carrying TWO railings (left + right)
 * @param handrails standalone handrail segments
 */
function buildScene(stairs: number, handrails: number): { census: Census; elements: number } {
    _ns = `r${_run++}`;
    // Each run starts from a cold material cache, so a canonical material elected
    // in an earlier run cannot flatter a later one.
    resetSharedMaterialCache();

    const scene = new THREE.Scene();
    const renderer = new InstancedElementRenderer();
    renderer.setScene(scene);
    const bridge = new ElementInstanceBridge(renderer);

    const stubRailStore = { get: () => undefined, getByStairId: () => [] } as never;
    const railBuilder = new StairRailingBuilder(stubRailStore, scene);
    railBuilder.setInstanceBridge(bridge);

    const handrailBuilder = new HandrailFragmentBuilder(scene, stubBim);
    handrailBuilder.setInstanceBridge(bridge);

    for (let i = 0; i < stairs; i++) {
        const stair = makeStair(i);
        railBuilder.buildRailing(makeRailing(i, 'left'), stair);
        railBuilder.buildRailing(makeRailing(i, 'right'), stair);
    }
    for (let i = 0; i < handrails; i++) {
        handrailBuilder.updateHandrail(makeHandrail(i));
    }

    const census = censusScene(scene);
    return { census, elements: stairs * 2 + handrails };
}

// ═════════════════════════════════════════════════════════════════════════════

describe('§NAV-SMOOTHNESS L-1780 — per-family draw-call census (railings + stairs)', () => {

    describe('THE GATE ITSELF — the per-family switch must actually switch', () => {
        it(
            '⭐ __pryzmElementInstancing.{handrail,stairRailing} = false returns the ' +
            'families to the FRAGMENT path, and = true instances them',
            () => {
                // ⚠ THIS TEST USED TO ASSERT THE DEFECT. Before §NAV-SMOOTHNESS (L-1781)
                // it read "setting __pryzmElementInstancing.handrail = true changes
                // NOTHING" and PASSED — because all four legacy builders called
                // `isElementInstancingEnabled()` with no argument, so the per-family row
                // in `_FAMILY_DEFAULTS` was authored-but-unwired. The five call sites now
                // name their family, so the switch is reachable in BOTH directions, and
                // this asserts that at the layer that matters: the draw-call count.
                g.__pryzmElementInstancing = { handrail: false, stairRailing: false };
                const off = buildScene(4, 4);

                g.__pryzmElementInstancing = { handrail: true, stairRailing: true };
                const on = buildScene(4, 4);

                // eslint-disable-next-line no-console
                console.log(
                    `[census] per-family switch: OFF -> ${off.census.drawCalls} draw calls ; ` +
                    `ON -> ${on.census.drawCalls} draw calls`,
                );

                expect(off.census.instancedGroups).toBe(0);
                expect(on.census.instancedGroups).toBeGreaterThan(0);
                expect(on.census.drawCalls).toBeLessThan(off.census.drawCalls);
            },
        );

        it('the MASTER kill switch still overrides both families, from the console', () => {
            // A default the user cannot back out of on their own machine is a bad
            // trade — this is the escape hatch, and it must survive the flip.
            g.__pryzmElementInstancingV1 = false;
            const killed = buildScene(4, 4);
            expect(killed.census.instancedGroups).toBe(0);
        });

        it('⭐ the SHIPPED DEFAULT (no flags set at all) is what the founder actually gets', () => {
            // The founder sets no globals. This is what he actually gets.
            //
            // ⚠ CORRECTED 2026-08-21 (§NAV-PICK-QUADRATIC, L-1850). This test used to
            // be named "…instances both families" and asserted instancedGroups > 0.
            // The MITIGATION put handrail + stairRailing back to OFF, so it now
            // records ZERO instanced groups — and that is the honest current answer,
            // not a regression in this census.
            //
            // ⛔ AND THIS TEST IS NOT THE PLACE THE DEFAULT IS PINNED. Two suites in
            // two packages both hard-coded the shipped default and nothing made them
            // agree: at 9ebaae47 THIS one was green with `handrail: true` while
            // geometry-window/__tests__/WindowInstancedLifetime.test.ts:136 asserted
            // `false` and was RED — an unnoticed contradiction that shipped. The
            // default is pinned in ONE place, that file's "windows are ON by default;
            // no other family is". Here we only PRINT it, so this census can never
            // again be the thing that has to be edited when a flag moves.
            delete g.__pryzmElementInstancingV1;
            delete g.__pryzmElementInstancing;
            const shipped = buildScene(4, 4);
            // eslint-disable-next-line no-console
            console.log(
                `[census] SHIPPED DEFAULT: ${shipped.census.drawCalls} draw calls, ` +
                `${shipped.census.instancedGroups} instanced groups`,
            );
            expect(shipped.census.drawCalls).toBeGreaterThan(0);
        });
    });

    describe('BEFORE / AFTER at founder scale', () => {
        it('⭐ THE HEADLINE — 60 stairs + 120 handrail segments, instancing OFF then ON', () => {
            const STAIRS = 60;      // 120 railings
            const HANDRAILS = 120;

            // ⭐ BOTH ARMS NAME THEIR REGIME. NEITHER READS THE DEFAULT.
            //
            // ⚠ CORRECTED TWICE, THE SAME WAY, AND THAT IS THE LESSON. The BEFORE arm
            // originally read `delete __pryzmElementInstancingV1` — "the shipped
            // default" — and L-1781 flipping the default silently turned this
            // before/after into an after/after reporting a 1.0x "win". L-1781 fixed
            // the BEFORE arm and left the AFTER arm reading the default, so L-1850
            // flipping it BACK broke this test in the mirror-image way. A comparison
            // with one leg tied to a mutable default is a comparison that lies
            // whenever that default moves — in EITHER direction. Both legs are named
            // now, so this census measures instancing, not policy.
            g.__pryzmElementInstancing = { handrail: false, stairRailing: false };
            const before = buildScene(STAIRS, HANDRAILS);
            print('BEFORE (fragment path — instancing OFF)', before.census, before.elements);

            g.__pryzmElementInstancing = { handrail: true, stairRailing: true };
            const after = buildScene(STAIRS, HANDRAILS);
            print('AFTER  (instanced — instancing ON)', after.census, after.elements);

            const saved = before.census.drawCalls - after.census.drawCalls;
            const ratio = before.census.drawCalls / Math.max(1, after.census.drawCalls);
            // eslint-disable-next-line no-console
            console.log(
                `[census] ⭐ DELTA: ${saved} draw calls removed ` +
                `(${before.census.drawCalls} -> ${after.census.drawCalls}, ` +
                `${ratio.toFixed(1)}x collapse) for ${before.elements} elements`,
            );

            // The census is the deliverable; these are ratchets on it.
            expect(before.census.instancedGroups).toBe(0);
            expect(after.census.instancedGroups).toBeGreaterThan(0);
            expect(after.census.drawCalls).toBeLessThan(before.census.drawCalls);
        });

        it('records the MATERIAL axis — dedup must keep group count sub-linear in elements', () => {
            // ⚠ NAMES ITS REGIME (L-1850). Its subject is SharedMaterialCache dedup,
            // which is only observable when the families instance — so it must ask
            // for instancing rather than inherit whatever the default happens to be
            // this week. Under the OFF default it was measuring 0 groups against 0.
            g.__pryzmElementInstancing = { handrail: true, stairRailing: true };
            const small = buildScene(10, 20);
            const large = buildScene(40, 80);

            // eslint-disable-next-line no-console
            console.log(
                `[census] material axis: ${small.elements} elements -> ` +
                `${small.census.instancedGroups} groups / ${small.census.materials} materials ; ` +
                `${large.elements} elements -> ${large.census.instancedGroups} groups / ` +
                `${large.census.materials} materials`,
            );

            // 4x the elements must NOT cost 4x the instance groups — if it does,
            // SharedMaterialCache is not deduping and instancing collapses nothing.
            expect(large.census.instancedGroups).toBeLessThan(
                small.census.instancedGroups * 4,
            );
        });
    });
});

// ═════════════════════════════════════════════════════════════════════════════
/**
 * §NAV-TYPE-COLLAPSE (L-1781) — THE REGRESSION THAT FLIPPING TWO FAMILIES AT ONCE
 * WOULD HAVE SHIPPED, measured before it shipped.
 *
 * `InstancedElementRenderer._createGroup` carries this claim, verbatim:
 *
 *     "The group key includes geometry+material+levelId, so every instance in a
 *      group shares one element type."
 *
 * ⛔ THAT IMPLICATION DOES NOT HOLD, and the suite below is the measurement that
 * says so. `geometry × material × levelId` says nothing about element TYPE. Two
 * DIFFERENT families whose repeated members are the same unit primitive, on the
 * same level, wearing materials that `SharedMaterialCache` deduplicates to one
 * canonical instance, land in ONE group — which is then stamped with whichever
 * family registered FIRST.
 *
 * WHY THAT IS A USER-VISIBLE DEFECT AND NOT A CURIOSITY.
 * `ProjectVisibilitySection` cannot address an instanced aggregate per element —
 * there is no per-element `userData.id` on an InstancedMesh. §INSTANCED-ISOLATE-FIX
 * therefore resolves aggregates by the only handles they expose, `(levelId,
 * elementType)`. So a group holding two families under one stamp is a group where
 * "hide stair railings" either hides the handrails too or hides neither — and
 * "isolate this type" does the same. The founder would meet this within minutes
 * of the perf win landing, which is precisely the trade this lane must not make.
 *
 * Until §NAV-TYPE-IN-GROUP-KEY landed, both families instancing simultaneously
 * was unsafe. These tests hold that fix in place.
 */
describe('§NAV-TYPE-COLLAPSE — an instanced group must never hold two element types', () => {
    /** Every instanced group in the scene, with the distinct element types inside it. */
    function typesPerGroup(
        scene: THREE.Object3D,
        renderer: InstancedElementRenderer,
        idToType: Map<string, string>,
    ): { key: string; stamped: string; types: string[] }[] {
        const out: { key: string; stamped: string; types: string[] }[] = [];
        scene.traverse((o) => {
            const m = o as THREE.Mesh & { isInstancedMesh?: boolean };
            if (!m.isInstancedMesh) return;
            const slots =
                (m.userData.getOccupiedInstanceSlots as (() => readonly number[]) | undefined)?.() ?? [];
            const getId = m.userData.getInstanceElementId as
                ((s: number) => string | undefined) | undefined;
            const types = new Set<string>();
            for (const s of slots) {
                const id = getId?.(s);
                const t = id ? idToType.get(id) : undefined;
                if (t) types.add(t);
            }
            out.push({
                key: String(m.name),
                stamped: String(m.userData.elementType),
                types: [...types],
            });
        });
        void renderer;
        return out;
    }

    it(
        '⭐ two families with the SAME unit primitive, material and level stay in ' +
        'SEPARATE groups, each stamped with its own real element type',
        () => {
            resetSharedMaterialCache();
            const scene = new THREE.Scene();
            const renderer = new InstancedElementRenderer();
            renderer.setScene(scene);
            const bridge = new ElementInstanceBridge(renderer);

            // Deliberately IDENTICAL look — this is the colliding case, not a
            // contrived one: a steel baluster is a steel baluster whichever family
            // authored it, and SharedMaterialCache exists to make look-alikes share
            // ONE canonical material. That is the collapse being probed.
            const look = () => new THREE.MeshStandardMaterial({ color: '#888888' });
            const xf = (x: number) => ({
                centre: { x, y: 0.5, z: 0 },
                rotationY: 0,
                size: { x: 0.04, y: 1, z: 0.04 },
            });

            const idToType = new Map<string, string>();
            for (let i = 0; i < 6; i++) {
                const hid = `hr-${i}`;
                bridge.register(hid, 'level-1', 'handrail', xf(i), look(), 'box');
                idToType.set(hid, 'handrail');

                const sid = `sr-${i}`;
                bridge.register(sid, 'level-1', 'stair-railing', xf(i + 100), look(), 'box');
                idToType.set(sid, 'stair-railing');
            }

            const groups = typesPerGroup(scene, renderer, idToType);
            // eslint-disable-next-line no-console
            console.log(
                '[census] §NAV-TYPE-COLLAPSE groups: ' +
                groups.map(g2 => `${g2.stamped}[${g2.types.join('+')}]`).join(' , '),
            );

            // (1) No group may mix families.
            for (const grp of groups) {
                expect(
                    grp.types.length,
                    `group stamped "${grp.stamped}" holds ${grp.types.join(' + ')}`,
                ).toBeLessThanOrEqual(1);
            }
            // (2) The stamp must be TRUE of what is inside — an isolate/hide-by-type
            //     traverse trusts this stamp and has no other handle.
            for (const grp of groups) {
                if (grp.types.length === 1) expect(grp.stamped).toBe(grp.types[0]);
            }
            // (3) Both families must be addressable — two groups, not one.
            expect(groups.map(g2 => g2.stamped).sort()).toEqual(['handrail', 'stair-railing']);
        },
    );

    it('per-level separation still holds — same family, two levels, two groups', () => {
        resetSharedMaterialCache();
        const scene = new THREE.Scene();
        const renderer = new InstancedElementRenderer();
        renderer.setScene(scene);
        const bridge = new ElementInstanceBridge(renderer);
        const look = () => new THREE.MeshStandardMaterial({ color: '#888888' });
        const xf = { centre: { x: 0, y: 0.5, z: 0 }, rotationY: 0, size: { x: 0.04, y: 1, z: 0.04 } };

        bridge.register('a', 'level-1', 'handrail', xf, look(), 'box');
        bridge.register('b', 'level-2', 'handrail', xf, look(), 'box');

        const levels = new Set<string>();
        scene.traverse((o) => {
            const m = o as THREE.Mesh & { isInstancedMesh?: boolean };
            if (m.isInstancedMesh) levels.add(String(m.userData.levelId));
        });
        expect([...levels].sort()).toEqual(['level-1', 'level-2']);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
/**
 * §NAV-LEAK-IS-BOUNDED (L-1781) — the recorded blocker on flipping `stairRailing`,
 * MEASURED instead of inherited.
 *
 * `_FAMILY_DEFAULTS` carried this reason for keeping the family off:
 *
 *     stairRailing OFF — hands the SAME material object to both register() and a
 *                        surviving fragment mesh, so with the L1 stamp on, the top
 *                        rail's material is permanently skipped rather than freed.
 *                        Safe, but it leaks; fix the builder before flipping.
 *
 * That is TRUE and it is the right thing to have worried about — but "it leaks" is
 * not a magnitude, and a lane must not trade a measured 19.7x draw-call win against
 * an unmeasured word. So this measures the SHAPE of the leak, which is the only
 * thing that decides whether it blocks.
 *
 * The mechanism: `dedupInstanceMaterial` elects the first material of a visual
 * signature as CANONICAL and stamps it `markSharedGpuResource`, after which every
 * `safeDispose*` helper no-ops on it — deliberately, because that material now backs
 * an InstanceGroup drawing N elements and the element that happened to mint it must
 * not be able to free it (ADR-0297 L1). Ownership is handed back in
 * `resetSharedMaterialCache()`, which `InstancedElementRenderer.clear()` calls on
 * project close.
 *
 * ⭐ SO THE QUESTION IS WHETHER THE RETAINED SET GROWS WITH ELEMENT COUNT OR WITH
 * DISTINCT APPEARANCE. If it is O(elements) the family must stay off. If it is
 * O(distinct looks) it is a handful of materials held until project close — the
 * exact standing that the `window` family, which is ALREADY default-ON through this
 * same chokepoint, has shipped on. Measured below: it is the second.
 */
describe('§NAV-LEAK-IS-BOUNDED — what survives DELETION, and how it scales', () => {
    /**
     * ⚠ THE FIRST VERSION OF THIS PROBE ANSWERED A DIFFERENT QUESTION AND IS
     * RECORDED HERE SO NOBODY REBUILDS IT. It counted distinct materials reachable
     * from the LIVE scene and reported 5 railings -> 5 materials, 50 -> 50, i.e.
     * "linear, therefore blocking". That number is real but it is not the leak: a
     * live railing legitimately holds its own top-rail FRAGMENT material, because
     * `dedupInstanceMaterial` runs inside `register()` and never touches the
     * fragment mesh. Counting live materials measures how many railings exist.
     *
     * ⭐ THE LEAK IS WHAT SURVIVES DELETION. So this builds, then DELETES everything,
     * and asks how many materials the L1 ownership stamp has made permanently
     * un-freeable until `resetSharedMaterialCache()` at project close.
     */
    function afterDeletingAll(railings: number): { minted: number; retained: number } {
        resetSharedMaterialCache();
        _ns = `leak${_run++}`;
        const scene = new THREE.Scene();
        const renderer = new InstancedElementRenderer();
        renderer.setScene(scene);
        const bridge = new ElementInstanceBridge(renderer);
        const stubRailStore = { get: () => undefined, getByStairId: () => [] } as never;
        const builder = new StairRailingBuilder(stubRailStore, scene);
        builder.setInstanceBridge(bridge);

        const ids: string[] = [];
        for (let i = 0; i < railings; i++) {
            const cfg = makeRailing(i, 'left');
            builder.buildRailing(cfg, makeStair(i));
            ids.push(cfg.id);
        }

        // Every material this run put in front of the GPU, captured while alive.
        const minted = new Set<THREE.Material>();
        scene.traverse((o) => {
            const m = (o as THREE.Mesh).material;
            if (!m) return;
            for (const one of Array.isArray(m) ? m : [m]) minted.add(one);
        });

        for (const id of ids) builder.removeRailing(id);

        // Retained = stamped as a SHARED GPU resource, which is exactly the set every
        // safeDispose* helper refuses to free. That stamp is the leak, by definition.
        let retained = 0;
        for (const m of minted) if (isSharedGpuResource(m)) retained++;
        return { minted: minted.size, retained };
    }

    it('⭐ the DELETION-surviving set scales with LOOKS, not with element count', () => {
        g.__pryzmElementInstancingV1 = true;
        const small = afterDeletingAll(5);
        const large = afterDeletingAll(50);

        // eslint-disable-next-line no-console
        console.log(
            `[census] §NAV-LEAK-IS-BOUNDED after deleting ALL railings: ` +
            `5 railings -> ${small.retained} retained of ${small.minted} minted ; ` +
            `50 railings -> ${large.retained} retained of ${large.minted} minted`,
        );

        // 10x the elements must NOT retain 10x the materials. If it does, the retained
        // set is per-element and `stairRailing` must go back to OFF.
        expect(large.retained).toBeLessThan(small.retained * 10);
    });

    it('the retained set is also bounded in ABSOLUTE terms for one appearance', () => {
        g.__pryzmElementInstancingV1 = true;
        const { retained } = afterDeletingAll(50);
        // One visual signature for balusters + one for posts is the shape; a handful,
        // not fifty. Ratchet at the measured value with headroom, never at a guess.
        expect(retained).toBeLessThanOrEqual(4);
    });
});
