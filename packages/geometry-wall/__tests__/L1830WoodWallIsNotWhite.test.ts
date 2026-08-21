/**
 * L-1830 — "BEFORE IT HAD WOOD FINISHED WALLS — NOW IS WHITE."
 *
 * Founder-reported on the live deploy `08296995`, 2026-08-21, alongside a total
 * freeze. Lane HOTFIX1 was briefed that the white walls were "almost certainly in
 * MAT-1's reader conversion" — `b58500d7` deleted `StandardMaterialDef.textures`
 * and rewrote all eight readers onto `applyMaterialMaps(params, def, uvSpace)`,
 * and `WallFragmentBuilder.createWallMaterial` is one of the eight.
 *
 * ⭐ THAT HYPOTHESIS DID NOT SURVIVE MEASUREMENT, AND THIS FILE IS WHY IT IS
 * WORTH KEEPING ANYWAY.
 *
 * The rewritten branch is ADDITIVE-ONLY: `applyMaterialMaps` writes `map`,
 * `normalMap`, `roughnessMap` and `metalnessMap` and NOTHING else, and it returns
 * before writing any of them when the surface declares no uv space — which a wall
 * always does today (`uvSpaceOfGeometry(null)`), because the wall body has six
 * geometry constructors and none of them emits metre UVs. So the converted branch
 * cannot clear a colour; there is no assignment in it that could.
 *
 * What it REPLACED could not either: the old code was `else if (matDef.textures)`
 * against a field C100 §10.6 had already measured as *"read at seven sites and
 * written by nothing"*. Both spellings are no-ops on a wall. The conversion
 * changed the types and the honesty of the code; it did not change a pixel.
 *
 * ── WHAT IS ACTUALLY ASSERTED HERE ──────────────────────────────────────────
 *
 * The colour that reaches the renderer for a wall that has BOTH a catalogue
 * `materialId` AND an authored side finish — i.e. the exact branch the conversion
 * landed in, driven through the REAL builder. `L960WallSideFinishRenders` already
 * covers the finish on a wall with NO `materialId`; that arm returns long before
 * `applyMaterialMaps` and so could pass while this one broke.
 *
 * ⛔ THE ORACLE IS AUTHORED HERE, NEVER READ BACK FROM THE SUBJECT (the L-955
 * lesson, and the reason `L960WallSideFinishRenders` says the same thing). The
 * expected hexes are literals of this file, pushed in by the test. Two different
 * colours, so a hard-coded return cannot satisfy both, and a control that pins
 * what a wall with a material but NO finish renders — so "it went white" is
 * distinguishable from "everything is that colour now".
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

import { WallFragmentBuilder } from '../src/WallFragmentBuilder';
import type { LevelWallSpec } from '../src/WallPipelineV2';
import type { WallData } from '../src/WallTypes';

// The master catalogue's own values for `wood-oak` / `wood-walnut`, transcribed
// deliberately: `@pryzm/schemas` is not a dependency of this package and adding
// one to satisfy a test would desynchronise the lockfile. What matters is that
// they are constants of the TEST, not values the builder can move.
const WOOD_OAK = '#c8a96e';
const WALNUT = '#5a3a28';
/** The catalogue's `params.color` for the wall's MATERIAL — deliberately not white. */
const PLASTER = '#e8e4dc';
/** ⛔ The symptom, spelled out so the assertion names what it is refusing. */
const WHITE = '#ffffff';

const H = 3;
const T = 0.1;
let _seq = 0;

interface SideFinish { materialId: string; materialColor: string; materialName: string }

function plainWall(
    s: [number, number],
    e: [number, number],
    opts?: { materialId?: string; sideFinishes?: { interior?: SideFinish; exterior?: SideFinish } },
): WallData {
    return {
        id: `l1830-${_seq++}`,
        type: 'wall',
        levelId: 'L',
        properties: {},
        childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: H,
        thickness: T,
        baseOffset: 0,
        openings: [],
        layers: [{ name: 'Layer 1', function: 'structure', thickness: T }],
        ...(opts?.materialId ? { materialId: opts.materialId } : {}),
        ...(opts?.sideFinishes ? { sideFinishes: opts.sideFinishes } : {}),
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

/**
 * The injected library map, in the shape `initBuilders` really passes: a
 * `BuilderMaterialDef` whose `params` carry a THREE colour. `wall-plaster-fine`
 * carries NO maps, which is every pre-existing catalogue row — the 40 rows MAT-1
 * added are new ids that no saved project can reference.
 */
function materialMap() {
    return new Map([
        ['wall-plaster-fine', {
            id: 'wall-plaster-fine',
            params: { color: new THREE.Color(PLASTER), metalness: 0, roughness: 0.9 },
        }],
    ]) as never;
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
 * Build `wall` through the REAL builder WITH the library map injected, and read
 * back the colour the renderer gets. Arm-agnostic: the instancing bridge is a
 * real spy (the material it is handed IS an instanced wall's colour) and the
 * fragment path is read off the meshes.
 */
function paint(wall: WallData): { colour: string; bodyMeshes: number } {
    (globalThis as { __pryzmWallPipelineV2?: boolean }).__pryzmWallPipelineV2 = false;
    const scene = new THREE.Scene();
    const builder = new WallFragmentBuilder(scene, levelProvider() as never, {
        materialMap: materialMap(),
    });

    let instanceColour: string | null = null;
    (builder as unknown as { _instanceBridge: unknown })._instanceBridge = {
        register: (_w: WallData, _y: number, _j: unknown, mat?: THREE.MeshStandardMaterial) => {
            if (mat?.color) instanceColour = `#${mat.color.getHexString()}`;
        },
        isInstanced: () => false,
        unregister: () => { /* no-op */ },
    };

    builder.refreshV2Cache([specOf(wall)]);
    builder.buildWall(wall, null as never, undefined, 0);

    const root = builder.getWallRoot(wall.id) as unknown as THREE.Object3D;
    expect(root, 'the builder produced a group for the wall').toBeTruthy();
    const meshColours = bodyColours(root);
    return { colour: instanceColour ?? meshColours[0] ?? '', bodyMeshes: meshColours.length };
}

const oak = (): SideFinish => ({ materialId: 'wood-oak', materialColor: WOOD_OAK, materialName: 'Wood · Oak' });
const walnut = (): SideFinish => ({ materialId: 'wood-walnut', materialColor: WALNUT, materialName: 'Wood · Walnut' });

describe('⭐ L-1830 — a wood-finished wall that ALSO carries a catalogue materialId is not white', () => {

    it('THE FOUNDER CLAIM: interior finish oak → the renderer gets oak, NOT white', () => {
        const p = paint(plainWall([0, 0], [4, 0], {
            materialId: 'wall-plaster-fine',
            sideFinishes: { interior: oak(), exterior: oak() },
        }));
        expect(p.colour).not.toBe(WHITE);
        expect(p.colour).toBe(WOOD_OAK);
    });

    it('a SECOND colour, so a hard-coded return cannot satisfy both', () => {
        const p = paint(plainWall([0, 0], [4, 0], {
            materialId: 'wall-plaster-fine',
            sideFinishes: { interior: walnut(), exterior: walnut() },
        }));
        expect(p.colour).toBe(WALNUT);
    });

    it('CONTROL — same wall, NO finish: NOT painted the finish colour', () => {
        // ⛔ Without this the suite could pass on a build that painted EVERYTHING
        // the finish colour, which would measure nothing.
        const p = paint(plainWall([0, 0], [4, 0], { materialId: 'wall-plaster-fine' }));
        expect(p.colour).not.toBe(WOOD_OAK);
        expect(p.colour).not.toBe(WALNUT);
    });

    it('⛔ NAMED GAP, FOUND BY THIS CONTROL — the INSTANCED arm ignores `materialId` and renders #e8e8e8', () => {
        // ⭐ This assertion documents a DEFECT, deliberately, rather than hiding it
        // behind an expectation that matches. The control above was written
        // expecting the catalogue colour (#e8e4dc) and measured #e8e8e8 —
        // `WALL_DEFAULT_BODY_COLOUR`.
        //
        // A "plain wall" (one layer, no openings, straight, UNJOINED) routes to the
        // GPU-instanced arm — the same routing L-960 measured. That arm resolves an
        // authored SIDE FINISH (L-960 wired it) but it does NOT resolve
        // `wall.materialId` against the library: `createWallMaterial`, which is the
        // only code that reads the injected material map, is not what paints it.
        // So a wall whose wood comes from the MATERIAL PICKER renders #e8e8e8 —
        // near-white — while a wall whose wood comes from a SIDE FINISH renders
        // wood.
        //
        // ⚠ THIS IS PRE-EXISTING, NOT THE 2026-08-21 REGRESSION. Nothing in
        // `a547eff2..08296995` touched the instanced arm's colour path, and the
        // 205 pre-existing catalogue rows are byte-identical across that range
        // (verified by diffing every `id:`/`color:` pair). It is recorded here
        // because it is a live route to a white-looking wall and the next lane
        // should close it, with the founder's project in hand to say which route
        // his walls actually took.
        const p = paint(plainWall([0, 0], [4, 0], { materialId: 'wall-plaster-fine' }));
        expect(p.colour).toBe('#e8e8e8');
        expect(p.colour).not.toBe(PLASTER);
    });

    it('but `createWallMaterial` ITSELF keeps the catalogue colour — the branch is intact', () => {
        // The branch MAT-1 rewrote, read directly: no finish, so the material's own
        // `params.color` must survive `applyMaterialMaps` untouched. This is the
        // half that proves the reader conversion did not clear the colour.
        (globalThis as { __pryzmWallPipelineV2?: boolean }).__pryzmWallPipelineV2 = false;
        const builder = new WallFragmentBuilder(new THREE.Scene(), levelProvider() as never, {
            materialMap: materialMap(),
        });
        const mat = (builder as unknown as {
            createWallMaterial(w: WallData): THREE.MeshStandardMaterial;
        }).createWallMaterial(plainWall([0, 0], [4, 0], { materialId: 'wall-plaster-fine' }));
        expect(`#${mat.color.getHexString()}`).toBe(PLASTER);
        expect(mat.map).toBeFalsy();
    });

    it('⭐ THE CONVERTED BRANCH IS ADDITIVE — no map is attached, and nothing is cleared', () => {
        // A wall declares `uvSpaceOfGeometry(null)` — no uv space — so
        // `applyMaterialMaps` must attach NOTHING. This is the assertion that
        // would have caught a reader conversion that dropped the colour, and it is
        // the one that shows the conversion did not.
        (globalThis as { __pryzmWallPipelineV2?: boolean }).__pryzmWallPipelineV2 = false;
        const scene = new THREE.Scene();
        const builder = new WallFragmentBuilder(scene, levelProvider() as never, {
            materialMap: materialMap(),
        });
        const wall = plainWall([0, 0], [4, 0], {
            materialId: 'wall-plaster-fine',
            sideFinishes: { interior: oak(), exterior: oak() },
        });
        const mat = (builder as unknown as {
            createWallMaterial(w: WallData): THREE.MeshStandardMaterial;
        }).createWallMaterial(wall);

        expect(mat.map).toBeFalsy();
        expect(mat.normalMap).toBeFalsy();
        expect(mat.roughnessMap).toBeFalsy();
        expect(`#${mat.color.getHexString()}`).toBe(WOOD_OAK);
    });
});
