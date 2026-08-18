/**
 * L-960 — THE CHAT SETS A WALL'S INTERIOR FINISH, REPORTS SUCCESS, AND NOTHING RENDERS.
 *
 * Founder-reported on the live deploy, 2026-08-18. He typed *"make all inner finishes
 * walls on the ground floor to wood"*; the assistant answered *"Set the interior finish
 * of all 10 walls on Ground to Insulation · Wood Fibre Board. Done — undo with Ctrl+Z."*
 * **No wall changed.** The write genuinely happened — `WallData.sideFinishes` really
 * carries the value — which is precisely why the reply says "Done". What did not happen
 * is the DRAWING.
 *
 * ── WHAT IS MEASURED, AND WHY IT IS NOT THE STORE ────────────────────────────────
 *
 * The subject of every assertion below is **the colour that reaches the renderer** for
 * the founder's wall — the material `WallFragmentBuilder` hands to the instancing
 * bridge, or the material on the body mesh it builds when the wall does not instance.
 * That is the layer that DECIDES the wall's colour. Asserting that `sideFinishes`
 * round-trips through the store would have passed on the broken build.
 *
 * ── THE FOUNDER'S WALL, EXACTLY ─────────────────────────────────────────────────
 *
 * A "Plain Wall": ONE layer (`Layer 1 · Structure · 100 mm`), no openings, not curved,
 * not raked, and — the condition that decides everything — UNJOINED. `isSimpleWall`
 * (`WallFragmentBuilder`) routes exactly that wall to the GPU-INSTANCED arm, which had
 * no side-finish hook. `resolveLayerRenderFinishColor` is called only from inside the
 * per-layer band loops, on arms this wall never takes.
 *
 * ── THE ORACLE IS INDEPENDENT OF THE SUBJECT (the L-955 lesson) ──────────────────
 *
 * Lane J1 measured that its first control was worthless: it broke a function feeding
 * BOTH the builder and the expected value, so `expected 0, measured 0` passed and
 * measured nothing. Here the expectation is a HEX LITERAL AUTHORED IN THIS FILE
 * (`WOOD_OAK` / `WALNUT`), pushed into the wall's `sideFinishes` by the test itself.
 * Breaking any resolver in `WallSideFinishResolver` cannot move it. Two DIFFERENT
 * colours are used so a hard-coded return cannot satisfy both, and the no-finish
 * control pins the untouched default so "it changed" is distinguishable from
 * "everything is that colour now".
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

import { WallFragmentBuilder } from '../src/WallFragmentBuilder';
import { WallJoinResolver } from '../src/WallJoinResolver';
import { WALL_DEFAULT_BODY_COLOUR } from '../src/WallDefaultBodyColour';
import type { LevelWallSpec } from '../src/WallPipelineV2';
import type { WallData } from '../src/WallTypes';

// ─── The oracle: two hexes authored HERE, never read back from the subject ──────
// They are the master catalogue's own values for `wood-oak` and `wood-walnut`
// (`packages/schemas/src/materials/materialCatalog.ts`), transcribed deliberately:
// `@pryzm/schemas` is not a dependency of this package, and adding one to satisfy a
// test would change `package.json` and desynchronise the lockfile. What matters for
// non-vacuity is that these are constants of the TEST, not values the builder or the
// resolver can move.
const WOOD_OAK = '#c8a96e';
const WALNUT = '#5a3a28';

const H = 3;
const T = 0.1;

let _seq = 0;

interface SideFinish { materialId: string; materialColor: string; materialName: string }

/** The founder's wall: ONE layer, no openings, straight, vertical. */
function plainWall(
    s: [number, number],
    e: [number, number],
    sideFinishes?: { interior?: SideFinish; exterior?: SideFinish },
): WallData {
    return {
        id: `l960-${_seq++}`,
        type: 'wall',
        levelId: 'L',
        properties: {},
        childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: H,
        thickness: T,
        baseOffset: 0,
        openings: [],
        // "Layer 1 · Structure · 100 mm" — the founder's screenshot, exactly.
        layers: [{ name: 'Layer 1', function: 'structure', thickness: T }],
        ...(sideFinishes ? { sideFinishes } : {}),
        metadata: { createdAt: _seq, modifiedAt: _seq, createdBy: 't', version: 1 },
    } as unknown as WallData;
}

const specOf = (w: WallData): LevelWallSpec => ({
    id: w.id,
    startXZ: { x: w.baseLine[0].x, z: w.baseLine[0].z },
    endXZ: { x: w.baseLine[1].x, z: w.baseLine[1].z },
    thickness: w.thickness,
    layered: ((w as unknown as { layers?: unknown[] }).layers?.length ?? 0) > 1,
});

function levelProvider() {
    const level = { id: 'L', name: 'Ground', elevation: 0, height: H, childrenIds: [] };
    return {
        getLevelById: (id: string) => (id === 'L' ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

interface Painted {
    /** '#rrggbb' actually handed to the renderer for this wall's body. */
    colour: string;
    /** How many times the instancing bridge accepted this wall. */
    instanced: number;
    /** How many body meshes the fragment path produced. */
    bodyMeshes: number;
}

/** Every body-mesh colour under `root`, in '#rrggbb'. */
function bodyColours(root: THREE.Object3D): string[] {
    const out: string[] = [];
    root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!(m as unknown as { isMesh?: boolean }).isMesh) return;
        const ud = m.userData as { role?: string; elementType?: string };
        if (ud?.role !== 'geometry') return;
        if (ud.elementType !== undefined && ud.elementType !== 'WallLayer' && ud.elementType !== 'WallPart') return;
        const mat = m.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[];
        for (const mm of Array.isArray(mat) ? mat : [mat]) {
            if (mm && (mm as { color?: THREE.Color }).color) out.push(`#${mm.color.getHexString()}`);
        }
    });
    return out;
}

/**
 * Build `wall` through the REAL builder and read back the colour the renderer gets.
 *
 * ARM-AGNOSTIC BY CONSTRUCTION. The instancing bridge is a real spy — the material it
 * is handed IS the colour an instanced wall renders — and the fragment path is read
 * off the meshes in the group. So this measures "what colour is this wall painted",
 * not "which code path ran", and it keeps working whichever way the defect is fixed.
 *
 * @param neighbour when supplied, a second wall meeting `wall` at the origin, which
 *        gives it miter join data and therefore takes it OFF the instanced arm.
 */
function paint(wall: WallData, neighbour?: WallData): Painted {
    (globalThis as { __pryzmWallPipelineV2?: boolean }).__pryzmWallPipelineV2 = false;
    const scene = new THREE.Scene();
    const builder = new WallFragmentBuilder(scene, levelProvider() as never);

    let instanced = 0;
    let instanceColour: string | null = null;
    (builder as unknown as { _instanceBridge: unknown })._instanceBridge = {
        register: (_w: WallData, _y: number, _j: unknown, mat?: THREE.MeshStandardMaterial) => {
            instanced++;
            if (mat?.color) instanceColour = `#${mat.color.getHexString()}`;
        },
        isInstanced: () => false,
        unregister: () => { /* no-op */ },
    };

    const walls = neighbour ? [wall, neighbour] : [wall];
    builder.refreshV2Cache(walls.map(specOf));
    const joins = neighbour
        ? WallJoinResolver.resolveLevel(walls.map((w) => ({ ...w })), { snapRadius: 0.5 })
        : new Map();
    for (const w of walls) builder.buildWall(w, (joins.get(w.id) ?? null) as never, undefined, 0);

    const root = builder.getWallRoot(wall.id) as unknown as THREE.Object3D;
    expect(root, 'the builder produced a group for the wall').toBeTruthy();
    const meshColours = bodyColours(root);

    // The instanced arm has no body mesh — the instance slot IS the record — so the
    // captured material is the answer there, and the mesh material is the answer on
    // the fragment path. Exactly one of the two exists for any given wall.
    const colour = instanceColour ?? meshColours[0] ?? '';
    return { colour, instanced, bodyMeshes: meshColours.length };
}

const norm = (hex: string): string => `#${new THREE.Color(hex).getHexString()}`;

// ─── THE CONTROL ───────────────────────────────────────────────────────────────

describe("L-960 §L960-FINISH-MUST-RENDER — the founder's 1-layer Plain Wall paints its interior finish", () => {
    it('CONTROL — the SAME wall without a finish paints the untouched default', () => {
        const r = paint(plainWall([0, 0], [5, 0]));
        // eslint-disable-next-line no-console
        console.log(`[L-960] no finish: colour=${r.colour} instanced=${r.instanced} bodyMeshes=${r.bodyMeshes}`);
        expect(r.colour, 'an unfinished wall is the default body colour').toBe(norm(WALL_DEFAULT_BODY_COLOUR));
    });

    it("the founder's exact case — interior finish set — paints the FINISH, not the default", () => {
        const r = paint(plainWall([0, 0], [5, 0], {
            interior: { materialId: 'wood-oak', materialColor: WOOD_OAK, materialName: 'Wood · Oak (Light)' },
        }));
        // eslint-disable-next-line no-console
        console.log(`[L-960] interior=${WOOD_OAK}: colour=${r.colour} instanced=${r.instanced} bodyMeshes=${r.bodyMeshes}`);
        expect(r.colour, 'the wall the founder has renders the finish he asked for').toBe(norm(WOOD_OAK));
        expect(r.colour).not.toBe(norm(WALL_DEFAULT_BODY_COLOUR));
    });

    it('a SECOND, different finish paints that one — so the pass is not a constant', () => {
        const r = paint(plainWall([0, 0], [5, 0], {
            interior: { materialId: 'wood-walnut', materialColor: WALNUT, materialName: 'Wood · Walnut (Dark)' },
        }));
        // eslint-disable-next-line no-console
        console.log(`[L-960] interior=${WALNUT}: colour=${r.colour}`);
        expect(r.colour).toBe(norm(WALNUT));
    });

    it('an EXTERIOR-only finish paints too — the arm must not be interior-only', () => {
        const r = paint(plainWall([0, 0], [5, 0], {
            exterior: { materialId: 'wood-oak', materialColor: WOOD_OAK, materialName: 'Wood · Oak (Light)' },
        }));
        // eslint-disable-next-line no-console
        console.log(`[L-960] exterior=${WOOD_OAK}: colour=${r.colour}`);
        expect(r.colour).toBe(norm(WOOD_OAK));
    });

    it('THE PERF PROPERTY SURVIVES — a finished wall STILL instances', () => {
        // The L-955 fix for rake left the instanced arm because a shear is not
        // expressible in T·R·S. A COLOUR is not a shear: `InstancedElementRenderer`
        // keys its groups on (geometry × material × level) and `dedupInstanceMaterial`
        // canonicalises by visual signature, so a distinct finish colour is just a
        // distinct bucket — one extra draw call per distinct finish, not one per wall.
        // Excluding finished walls instead would have pushed the founder's whole ground
        // floor out of instancing to reach the identical pixels.
        const r = paint(plainWall([0, 0], [5, 0], {
            interior: { materialId: 'wood-oak', materialColor: WOOD_OAK, materialName: 'Wood · Oak (Light)' },
        }));
        expect(r.instanced, 'a finished simple wall is still GPU-instanced').toBe(1);
        expect(r.bodyMeshes, 'and therefore builds no per-wall body mesh').toBe(0);
    });

    it('§L934-ONE-WALL-ONE-COLOUR — the JOINED twin of the same wall paints the SAME colour', () => {
        // The same wall, differing only in whether a neighbour mitres it, must not
        // change colour. This is the cross-arm invariant L-934 established, applied to
        // the finish: the instanced arm and the layered-band arm must agree.
        const finishes = {
            interior: { materialId: 'wood-oak', materialColor: WOOD_OAK, materialName: 'Wood · Oak (Light)' },
        };
        const joined = paint(plainWall([0, 0], [5, 0], finishes), plainWall([0, 0], [0, 5], finishes));
        // eslint-disable-next-line no-console
        console.log(`[L-960] joined (fragment arm): colour=${joined.colour} instanced=${joined.instanced} bodyMeshes=${joined.bodyMeshes}`);
        expect(joined.instanced, 'a mitred wall is declined by the instanced arm').toBe(0);
        expect(joined.bodyMeshes, 'so it has a real body mesh').toBeGreaterThan(0);
        expect(joined.colour, 'and it is the same colour as its unjoined twin').toBe(norm(WOOD_OAK));
    });
});

// ─── THE SECOND HOLE, MEASURED RATHER THAN ASSUMED ─────────────────────────────
//
// `resolveLayerRenderFinishColor` returns `null` for `layerCount <= 0`, and the plain
// (non-layered) fragment arms take their colour from `createWallMaterial(wall)`, which
// reads `materialId`/`materialColor` and nothing else. So a wall with NO `layers` array
// at all — the shape `RoomFinishResolver` describes as *"plain (single-volume, not
// layered)"* — has a THIRD arm that could drop the finish, on top of the instanced one.
//
// Whether that arm is reachable is a question, not a reading, so it is measured here.
// Both the unjoined (instanced) and joined (fragment) spellings are built, because
// only measuring both tells you which router you fixed.

/** A wall with NO layers array at all — not one empty layer, absent. */
function layerlessWall(s: [number, number], e: [number, number], sideFinishes?: { interior?: SideFinish; exterior?: SideFinish }): WallData {
    const w = plainWall(s, e, sideFinishes) as unknown as { layers?: unknown };
    delete w.layers;
    return w as unknown as WallData;
}

describe('L-960 §L960-PLAIN-ARM — a wall with NO layer stack must paint its finish too', () => {
    it('UNJOINED (instanced arm)', () => {
        const r = paint(layerlessWall([0, 0], [5, 0], {
            interior: { materialId: 'wood-oak', materialColor: WOOD_OAK, materialName: 'Wood · Oak (Light)' },
        }));
        // eslint-disable-next-line no-console
        console.log(`[L-960] layerless UNJOINED: colour=${r.colour} instanced=${r.instanced} bodyMeshes=${r.bodyMeshes}`);
        expect(r.colour).toBe(norm(WOOD_OAK));
    });

    it('JOINED (plain fragment arm — createWallMaterial)', () => {
        const finishes = {
            interior: { materialId: 'wood-oak', materialColor: WOOD_OAK, materialName: 'Wood · Oak (Light)' },
        };
        const r = paint(layerlessWall([0, 0], [5, 0], finishes), layerlessWall([0, 0], [0, 5], finishes));
        // eslint-disable-next-line no-console
        console.log(`[L-960] layerless JOINED: colour=${r.colour} instanced=${r.instanced} bodyMeshes=${r.bodyMeshes}`);
        expect(r.instanced, 'the mitred wall left the instanced arm').toBe(0);
        expect(r.colour).toBe(norm(WOOD_OAK));
    });

    it('CONTROL — the same layerless walls with NO finish stay the default', () => {
        const u = paint(layerlessWall([0, 0], [5, 0]));
        const j = paint(layerlessWall([0, 0], [5, 0]), layerlessWall([0, 0], [0, 5]));
        // eslint-disable-next-line no-console
        console.log(`[L-960] layerless no-finish: unjoined=${u.colour} joined=${j.colour}`);
        expect(u.colour).toBe(norm(WALL_DEFAULT_BODY_COLOUR));
        expect(j.colour).toBe(norm(WALL_DEFAULT_BODY_COLOUR));
    });
});
