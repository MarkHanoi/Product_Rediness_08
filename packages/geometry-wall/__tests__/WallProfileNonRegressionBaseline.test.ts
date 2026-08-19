// §WALL-PROFILE — SLICE 0. THE NON-REGRESSION BASELINE, PINNED BEFORE ANY PROFILE
// CODE EXISTS.
//
// ─── WHY THIS FILE EXISTS, AND WHY IT EXISTS *FIRST* ─────────────────────────
//
// The wall in-place PROFILE EDITING feature (Revit "Edit Profile" — a gable top, a
// stepped top, a raked top, a shaped notch) deletes the single deepest structural
// assumption in this subsystem: **a wall is a plan-XZ polygon extruded between two
// HORIZONTAL Y planes.** `WallPolygonExtruder.ts:107` states it in one line —
// `const yTop = yBot + opts.height` — and every body path below reaches the same
// conclusion by its own route.
//
// The empty-profile case (`profile` absent — i.e. EVERY wall that exists today, in
// every customer's project file) is therefore the non-regression baseline for the
// entire feature, and it is pinned HERE, before a line of profile code is written.
//
// ⚠ THE ORDERING IS THE POINT. A baseline captured AFTER the change proves nothing:
// it pins whatever the change did. C84 §5 — *"Each must be watched failing before it
// is believed — a control that cannot fail is not a control."* The RED proof for this
// file is recorded in §(D) below: `rakeShearPerMetre` was deliberately broken and the
// raked rows moved while the vertical rows did not. Re-run that experiment before
// trusting a green run here.
//
// ─── WHAT IS PINNED ──────────────────────────────────────────────────────────
//
//   §(A) GEOMETRY — one digest per reachable wall BODY PATH. There are seven, not
//        the three L-955 names; L-955's three are only the three RAKE-capable ones.
//        Each row cites the branch that selects it so a future reader can confirm
//        the case still reaches the path it claims to.
//   §(B) THE WHITELISTS — `WallStore.restoreSnapshot` and `ProjectSerializer.
//        serializeWall` are HAND-WRITTEN FIELD LISTS. A new field that nobody adds
//        to them round-trips as `undefined`, silently. Both are read FROM SOURCE
//        here rather than mirrored, because a mirrored copy is C84 §8.d ("a comment
//        as the synchronisation mechanism") and EI-8a records that mechanism having
//        already failed twice in this repo.
//
// ─── WHAT IS **NOT** PINNED, DELIBERATELY ────────────────────────────────────
//
// The three invalidation gates (`composeWallGeometryHash`, `WallDeltaClassifier`,
// `WallRebuildCoordinator`) belong to Slice 1, where the field they must react to
// actually exists. Pinning them here would pin their CURRENT contents, which is not
// the property that matters — the property that matters is "the new field is in all
// three", and it is unstatable until the field exists.
//
// ─── TWO LIVE DEFECTS THIS FILE MEASURES BUT DOES **NOT** FIX ────────────────
//
// Both are pre-existing, both are reported to the coordinator separately, and both
// are pinned below AS THEY ARE so that fixing them is a deliberate, visible act
// rather than a silent side-effect of the profile feature:
//
//   1. `WallStore.restoreSnapshot()` omits `rakeAngleDeg` from its whitelist
//      (`WallStore.ts:962-989`). Every L2 wall command undoes through this function,
//      so a command that changed both height and rake does not restore the rake.
//   2. `serializeWall`'s allow-list is the only thing standing between an authored
//      field and its destruction on save. `ProjectSerializer.ts:570-574` records
//      that this exact omission already destroyed `joinIntent` once.
//
// A test that "fixed" either by asserting the desired list would be asserting a
// fiction. Both assertions below state TODAY'S truth and name the gap.

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '@pryzm/renderer-three/three';

import { WallFragmentBuilder } from '../src/WallFragmentBuilder';
import { WallInstanceBridge } from '../src/WallInstanceBridge';
import { WallJoinResolver } from '../src/WallJoinResolver';
import type { LevelWallSpec } from '../src/WallPipelineV2';
import type { WallData } from '../src/WallTypes';

// ─── repo root (the idiom already used by WallCreateJoinIntentCensus.measure) ──
function repoRoot(): string {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 12; i++) {
        if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('repo root not found (no pnpm-workspace.yaml above this test)');
}
const REPO = repoRoot();

const LEVEL_ID = 'L0';
const HEIGHT = 3;
const THICK = 0.2;
/** Leans the top toward the wall's LEFT. cot(75°) ≈ 0.267949. */
const RAKE_DEG = 75;

function makeLevelProvider() {
    const level = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
    return {
        getLevelById: (id: string) => (id === LEVEL_ID ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

interface MkOpts {
    readonly id?: string;
    readonly start?: [number, number];
    readonly end?: [number, number];
    readonly rake?: number;
    readonly layers?: number[];
    readonly openings?: boolean;
    readonly curve?: boolean;
}

/**
 * A canonical wall. Every dimension is a round number so a digest that moves is
 * traceable by hand rather than only by diff.
 */
function mk(o: MkOpts = {}): WallData {
    const start = o.start ?? [0, 0];
    const end = o.end ?? [6, 0];
    const layers = o.layers;
    return {
        id: o.id ?? 'w-1',
        type: 'wall',
        levelId: LEVEL_ID,
        properties: {},
        childrenIds: [],
        baseLine: [{ x: start[0], y: 0, z: start[1] }, { x: end[0], y: 0, z: end[1] }],
        height: HEIGHT,
        thickness: layers ? layers.reduce((a, b) => a + b, 0) : THICK,
        baseOffset: 0,
        openings: o.openings
            ? [{
                id: 'op-1', type: 'window', elementId: 'win-1',
                offset: 2.0, width: 1.2, height: 1.4, sillHeight: 0.9,
            }]
            : [],
        ...(layers ? { layers: layers.map((t, i) => ({ name: `l${i}`, thickness: t })) } : {}),
        ...(o.curve ? { curve: { control: { x: 3, y: 0, z: 1.2 }, segments: 12 } } : {}),
        ...(o.rake === undefined ? {} : { rakeAngleDeg: o.rake }),
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 't', version: 1 },
    } as unknown as WallData;
}

const specOf = (w: WallData): LevelWallSpec => ({
    id: w.id,
    startXZ: { x: w.baseLine[0].x, z: w.baseLine[0].z },
    endXZ: { x: w.baseLine[1].x, z: w.baseLine[1].z },
    thickness: w.thickness,
    systemTypeId: (w as unknown as { systemTypeId?: string }).systemTypeId,
    curveControlXZ: (w as unknown as { curve?: { control: { x: number; z: number } } }).curve?.control,
    rakeAngleDeg: (w as unknown as { rakeAngleDeg?: number }).rakeAngleDeg,
    layered: ((w as unknown as { layers?: unknown[] }).layers?.length ?? 0) > 1,
} as LevelWallSpec);

const f6 = (n: number): string => (Object.is(n, -0) ? 0 : n).toFixed(6);

/**
 * The instrument. A weighted checksum alone makes a failure unreadable, so each mesh
 * also contributes its vertex COUNT and its world-frame BOUNDING BOX — and the bbox
 * is what makes this pin SEMANTIC rather than merely tight: a profile that lowers a
 * wall's top over part of its span moves `maxY`, and a reader sees immediately which
 * property changed.
 *
 * `matrixWorld` (not the local matrix) is used deliberately: a shear can live in a
 * child's transform rather than in its vertex buffer, and a digest blind to the
 * transform could not see one.
 */
function digest(root: THREE.Object3D): string {
    root.updateMatrixWorld(true);
    const rows: string[] = [];
    root.traverse((o: THREE.Object3D) => {
        const mesh = o as THREE.Mesh;
        if ((mesh as unknown as { isMesh?: boolean }).isMesh !== true) return;
        const pos = mesh.geometry?.getAttribute?.('position') as THREE.BufferAttribute | undefined;
        if (!pos) return;
        const v = new THREE.Vector3();
        let sum = 0;
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
            sum += v.x * (3 * i + 1) + v.y * (3 * i + 2) + v.z * (3 * i + 3);
            if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
            if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
            if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
        }
        const tag = String(mesh.userData?.elementType ?? '_');
        rows.push(
            `${tag} n=${pos.count} s=${f6(sum)} ` +
            `bb=[${f6(minX)},${f6(minY)},${f6(minZ)}..${f6(maxX)},${f6(maxY)},${f6(maxZ)}]`,
        );
    });
    // Mesh ORDER is part of what is pinned; a reordering is a real change.
    return rows.length === 0 ? '<no-meshes>' : rows.join('\n');
}

/** A fake InstancedElementRenderer that records the matrix rather than drawing it. */
function recordingRenderer() {
    const seen: Array<{ id: string; matrix: number[] }> = [];
    return {
        seen,
        register: (id: string, _g: unknown, _m: unknown, matrix: THREE.Matrix4): void => {
            seen.push({ id, matrix: Array.from(matrix.elements) });
        },
        unregister: (_id: string): void => {},
        // `WallInstanceBridge.isInstanced` delegates to the RENDERER's `isRegistered`
        // (`WallInstanceBridge.ts:177`), not to any state of its own.
        isRegistered: (id: string): boolean => seen.some(s => s.id === id),
    };
}

interface BuildOpts { readonly instanced?: boolean; readonly v2?: boolean }

/** Build `walls` through the REAL builder with REAL join data, and return the scene. */
function build(walls: WallData[], opts: BuildOpts = {}) {
    const scene = new THREE.Scene();
    const builder = new WallFragmentBuilder(scene, makeLevelProvider());
    const rec = recordingRenderer();
    if (opts.instanced) {
        builder.setInstanceBridge(new WallInstanceBridge(rec as never));
    }
    if (opts.v2 !== false) {
        builder.refreshV2Cache(walls.map(specOf));
    }
    const joins = WallJoinResolver.resolveLevel(walls.map(w => ({ ...w })), { snapRadius: 0.5 });
    for (const w of walls) {
        builder.buildWall(w, (joins.get(w.id) ?? null) as never, undefined, 0);
    }
    return { scene, builder, rec };
}

function digestOf(walls: WallData[], target: string, opts: BuildOpts = {}): string {
    const { scene } = build(walls, opts);
    const root = scene.children.find(c => c.userData?.id === target);
    expect(root, `the builder produced a group for wall "${target}"`).toBeTruthy();
    return digest(root!);
}

// ─────────────────────────────────────────────────────────────────────────────
// §(A) THE SEVEN BODY PATHS
// ─────────────────────────────────────────────────────────────────────────────
//
// Every row names the branch in `WallFragmentBuilder.buildWall` that routes to it.
// A case that stops reaching its stated path is itself a regression, so §(A2) below
// asserts the ROUTING independently of the digests — otherwise a routing change
// could silently move a case onto a different path and the digest would simply be
// re-baselined by the next person to see it fail.

interface Case {
    readonly key: string;
    readonly branch: string;
    readonly walls: () => WallData[];
    readonly target: string;
    readonly opts?: BuildOpts;
    /** Meshes this path is expected to emit, by `userData.elementType`. */
    readonly expectTags: readonly string[];
}

const CASES: readonly Case[] = [
    {
        key: 'P1a-plain-vertical',
        branch: 'WallFragmentBuilder.ts:2077 → createWallBodyFragment:3713',
        walls: () => [mk()],
        target: 'w-1',
        expectTags: ['wall'],
    },
    {
        key: 'P1a-plain-raked',
        branch: 'WallFragmentBuilder.ts:2077 (uniform shear, WallPolygonExtruder topOffset)',
        walls: () => [mk({ rake: RAKE_DEG })],
        target: 'w-1',
        expectTags: ['wall'],
    },
    {
        key: 'P1a-plain-raked-JOINED',
        branch: 'WallPipelineV2.ts:622-626 — the per-vertex twin-solve loft (ADR-0312)',
        walls: () => [
            mk({ id: 'w-1', start: [0, 0], end: [6, 0], rake: RAKE_DEG }),
            mk({ id: 'w-2', start: [6, 0], end: [6, 5], rake: RAKE_DEG }),
        ],
        target: 'w-1',
        expectTags: ['wall'],
    },
    {
        key: 'P1b-v2-layered-vertical',
        branch: 'WallFragmentBuilder.ts:1464 (V2 band slicer)',
        walls: () => [mk({ layers: [0.1, 0.05, 0.1] })],
        target: 'w-1',
        expectTags: ['WallLayer'],
    },
    {
        key: 'P1b-v2-layered-raked',
        branch: 'WallFragmentBuilder.ts:1464 — deliberately NOT the loft (:1489-1494)',
        walls: () => [mk({ layers: [0.1, 0.05, 0.1], rake: RAKE_DEG })],
        target: 'w-1',
        expectTags: ['WallLayer'],
    },
    {
        key: 'P1c-opening-vertical',
        branch: 'WallFragmentBuilder.ts:2103-2479 (opening-bearing body)',
        walls: () => [mk({ openings: true })],
        target: 'w-1',
        expectTags: ['wall'],
    },
    {
        key: 'P1c-opening-raked',
        branch: 'WallFragmentBuilder.ts:2206 — _capDrift only when _ownShearK === 0',
        walls: () => [mk({ openings: true, rake: RAKE_DEG })],
        target: 'w-1',
        expectTags: ['wall'],
    },
    {
        key: 'P2-layered-openings',
        branch: 'WallFragmentBuilder.ts:1278 → buildLayeredWallSegmentsAroundOpenings',
        walls: () => [mk({ layers: [0.1, 0.05, 0.1], openings: true })],
        target: 'w-1',
        expectTags: ['WallLayer'],
    },
    {
        key: 'P3-curved-plain',
        branch: 'WallFragmentBuilder.ts:1711 / :1961 (curved arm)',
        walls: () => [mk({ curve: true })],
        target: 'w-1',
        expectTags: ['wall'],
    },
    {
        key: 'P3-curved-layered',
        branch: 'WallFragmentBuilder.ts:1724 — the INLINE duplicate at :1786-1959 (EI-9)',
        walls: () => [mk({ curve: true, layers: [0.1, 0.05, 0.1] })],
        target: 'w-1',
        expectTags: ['WallLayer'],
    },
    {
        key: 'LEGACY-miter-plain',
        branch: '__pryzmWallPipelineV2=false ⇒ buildMiterPrism (MiterPrismBuilder.ts:53)',
        walls: () => [mk()],
        target: 'w-1',
        opts: { v2: false },
        expectTags: ['wall'],
    },
    {
        key: 'LEGACY-miter-raked',
        branch: 'buildMiterPrism — the arm LANE J1 IS FIXING for L-955',
        walls: () => [mk({ rake: RAKE_DEG })],
        target: 'w-1',
        opts: { v2: false },
        expectTags: ['wall'],
    },
];

/**
 * THE BASELINE. Captured on `w1-profileedit` at the commit that introduced this file,
 * against a tree with NO profile code in it.
 *
 * ⛔ DO NOT RE-BASELINE A ROW TO MAKE A RUN GREEN. A moved row means the profile work
 * perturbed the profile-ABSENT case, which is the exact regression this file exists
 * to prevent. `WallRake.ts:50-62` — *"A refusal is a correct answer; a silently-wrong
 * wall is not."* The same applies to a silently-rebaselined pin.
 */
const L = (...rows: string[]): string => rows.join('\n');

const BASELINE: Readonly<Record<string, string>> = Object.freeze({
    'P1a-plain-vertical': L(
        '_ n=36 s=8026.200000 bb=[0.000000,0.000000,-0.100000..6.000000,3.000000,0.100000]',
    ),
    'P1a-plain-raked': L(
        '_ n=36 s=8809.951391 bb=[0.000000,0.000000,-0.100000..6.000000,3.000000,0.903848]',
    ),
    'P1a-plain-raked-JOINED': L(
        '_ n=48 s=16869.431875 bb=[0.000000,0.000000,-0.100000..6.100000,3.000000,0.903848]',
    ),
    'P1b-v2-layered-vertical': L(
        'WallLayer n=36 s=7863.750000 bb=[0.000000,0.000000,-0.125000..6.000000,3.000000,-0.025000]',
        'WallLayer n=36 s=7887.600000 bb=[0.000000,0.000000,-0.025000..6.000000,3.000000,0.025000]',
        'WallLayer n=36 s=8032.050000 bb=[0.000000,0.000000,0.025000..6.000000,3.000000,0.125000]',
    ),
    'P1b-v2-layered-raked': L(
        'WallLayer n=36 s=8642.659730 bb=[0.000000,0.000000,-0.129410..6.000000,3.000000,0.777966]',
        'WallLayer n=36 s=8671.160899 bb=[0.000000,0.000000,-0.025882..6.000000,3.000000,0.829729]',
        'WallLayer n=36 s=8820.706551 bb=[0.000000,0.000000,0.025882..6.000000,3.000000,0.933257]',
    ),
    'P1c-opening-vertical': L(
        'window-part n=24 s=3053.520001 bb=[2.000000,0.900000,-0.110000..2.050000,2.300000,0.110000]',
        'window-part n=24 s=4033.320001 bb=[3.150000,0.900000,-0.110000..3.200000,2.300000,0.110000]',
        'window-part n=24 s=4178.819999 bb=[2.000000,2.250000,-0.110000..3.200000,2.300000,0.110000]',
        'window-part n=24 s=2996.219999 bb=[2.000000,0.900000,-0.110000..3.200000,0.950000,0.110000]',
        'window-part n=24 s=3534.120002 bb=[2.050000,0.950000,-0.010000..3.150000,2.250000,0.010000]',
        'WallPart n=96 s=61075.999917 bb=[0.000000,0.000000,-0.100000..6.000000,3.000000,0.100000]',
    ),
    'P1c-opening-raked': L(
        'window-part n=24 s=3421.360653 bb=[2.000000,0.900000,0.131154..2.050000,2.300000,0.726283]',
        'window-part n=24 s=4401.160653 bb=[3.150000,0.900000,0.131154..3.200000,2.300000,0.726283]',
        'window-part n=24 s=4726.802893 bb=[2.000000,2.250000,0.492886..3.200000,2.300000,0.726283]',
        'window-part n=24 s=3218.644624 bb=[2.000000,0.900000,0.131154..3.200000,0.950000,0.364552]',
        'window-part n=24 s=3903.246810 bb=[2.050000,0.950000,0.244552..3.150000,2.250000,0.612886]',
        'WallPart n=96 s=66991.674932 bb=[0.000000,0.000000,-0.100000..6.000000,3.000000,0.903848]',
    ),
    'P2-layered-openings': L(
        '_ n=144 s=154565.999823 bb=[0.000000,0.000000,-0.125000..6.000000,3.000000,-0.025000]',
        '_ n=144 s=156928.199828 bb=[0.000000,0.000000,-0.025000..6.000000,3.000000,0.025000]',
        '_ n=144 s=159263.999834 bb=[0.000000,0.000000,0.025000..6.000000,3.000000,0.125000]',
        'window-part n=24 s=3052.320001 bb=[2.000000,0.900000,-0.135000..2.050000,2.300000,0.135000]',
        'window-part n=24 s=4032.120001 bb=[3.150000,0.900000,-0.135000..3.200000,2.300000,0.135000]',
        'window-part n=24 s=4177.619999 bb=[2.000000,2.250000,-0.135000..3.200000,2.300000,0.135000]',
        'window-part n=24 s=2995.019999 bb=[2.000000,0.900000,-0.135000..3.200000,0.950000,0.135000]',
        'window-part n=24 s=3534.120002 bb=[2.050000,0.950000,-0.010000..3.150000,2.250000,0.010000]',
    ),
    'P3-curved-plain': L(
        'WallPart n=300 s=663488.655823 bb=[-0.034425,0.000000,-0.093888..6.034425,3.000000,0.699944]',
    ),
    'P3-curved-layered': L(
        'WallLayer n=300 s=653794.969336 bb=[0.008606,0.000000,-0.117360..5.991394,3.000000,0.575014]',
        'WallLayer n=300 s=664597.715047 bb=[-0.008606,0.000000,-0.023472..6.008606,3.000000,0.624986]',
        'WallLayer n=300 s=674661.086714 bb=[-0.043032,0.000000,0.023472..6.043032,3.000000,0.724931]',
    ),
    // ⚠ These two rows are BYTE-IDENTICAL, and that is a DEFECT, not a coincidence.
    // See §(A3) below, which asserts the equality explicitly so it cannot be read as
    // an accident of the digest.
    'LEGACY-miter-plain': L(
        '_ n=36 s=8960.400000 bb=[0.000000,0.000000,-0.100000..6.000000,3.000000,0.100000]',
    ),
    'LEGACY-miter-raked': L(
        '_ n=36 s=8960.400000 bb=[0.000000,0.000000,-0.100000..6.000000,3.000000,0.100000]',
    ),
});

describe('§WALL-PROFILE §(A) — the profile-ABSENT geometry baseline, all body paths', () => {
    afterEach(() => {
        delete (globalThis as { __pryzmWallPipelineV2?: boolean }).__pryzmWallPipelineV2;
    });

    for (const c of CASES) {
        it(`${c.key} — geometry is unchanged  [${c.branch}]`, () => {
            if (c.opts?.v2 === false) {
                (globalThis as { __pryzmWallPipelineV2?: boolean }).__pryzmWallPipelineV2 = false;
            }
            const actual = digestOf(c.walls(), c.target, c.opts);
            const expected = BASELINE[c.key];
            if (expected === undefined) {
                throw new Error(
                    `NO BASELINE for "${c.key}". Capture it into BASELINE verbatim:\n` +
                    `----8<---- ${c.key}\n${actual}\n---->8----`,
                );
            }
            expect(actual, `${c.key} moved — see this file's header before re-baselining`).toBe(expected);
        });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// §(A3) WHAT THE BASELINE ITSELF REVEALED — the legacy miter arm ignores the rake
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠ FOUND BY CAPTURING THE BASELINE, NOT BY LOOKING FOR IT, AND NOT CAUSED BY THIS
// FEATURE. Two rows of `BASELINE` came back byte-identical:
//
//   LEGACY-miter-plain  _ n=36 s=8960.400000 bb=[…,-0.100000..…,3.000000,0.100000]
//   LEGACY-miter-raked  _ n=36 s=8960.400000 bb=[…,-0.100000..…,3.000000,0.100000]
//
// A 3 m wall raked to 75° must displace its top by `3·cot(75°) ≈ 0.8038 m` along
// `leftPerp`, which is exactly what the V2 arm does — `P1a-plain-raked` reaches
// `z = 0.903848` (= 0.1 + 0.803848). On the legacy `buildMiterPrism` arm the z-extent
// is `[-0.1, +0.1]`: the wall's own thickness, unmoved. **The rake is not applied at
// all.** The model says 75°; the geometry is a vertical box.
//
// This is the same failure `rakeAuthorability` refuses the layered×openings case to
// prevent — `WallRake.ts:400-401`, *"the wall would render VERTICAL while the model
// said 80."*
//
// REACHABILITY, stated honestly rather than inflated (C84 §8.g). The legacy arm is
// NOT the default: `isWallPipelineV2Enabled()` (`WallPipelineV2.ts:72-74`) returns
// true unless `globalThis.__pryzmWallPipelineV2 === false`, so this is a kill-switch
// path. BUT it is not only a kill switch — `WallFragmentBuilder.ts:1545` falls back
// to it in production when a layer band trips the spike guard, in its own words
// *"falling back to legacy MiterPrism for the whole stack"*. A raked layered wall
// that trips that guard therefore renders vertical on a live build, and "spike" is
// precisely what L-955's founder screenshots show.
//
// ⛔ NOT FIXED HERE — `MiterPrismBuilder` is LANE J1's file for L-955 and this lane
// is sequenced behind it. Reported to the coordinator to carry to J1.

describe('§WALL-PROFILE §(A3) — the legacy miter arm drops the rake (KNOWN DEFECT, reported)', () => {
    afterEach(() => {
        delete (globalThis as { __pryzmWallPipelineV2?: boolean }).__pryzmWallPipelineV2;
    });

    it('A3a — V2 applies the rake: the top displaces by h·cot(75°)', () => {
        const d = digestOf([mk({ rake: RAKE_DEG })], 'w-1');
        const zMax = Number(/\.\.[^,]+,[^,]+,([-\d.]+)\]/.exec(d)![1]!);
        // 0.1 (half-thickness) + 3·cot(75°).
        expect(zMax).toBeCloseTo(0.1 + 3 * Math.tan((15 * Math.PI) / 180), 6);
    });

    it('A3b — the LEGACY arm does not: raked and vertical are byte-identical', () => {
        (globalThis as { __pryzmWallPipelineV2?: boolean }).__pryzmWallPipelineV2 = false;
        const vertical = digestOf([mk()], 'w-1', { v2: false });
        const raked = digestOf([mk({ rake: RAKE_DEG })], 'w-1', { v2: false });
        expect(
            raked,
            'If these now DIFFER the defect was fixed — good. Update this test to assert ' +
            'the shear rather than deleting it, and re-capture both LEGACY baselines.',
        ).toBe(vertical);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §(A2) THE SEVENTH PATH — GPU INSTANCING, WHICH CANNOT CARRY A SHEAR AT ALL
// ─────────────────────────────────────────────────────────────────────────────
//
// The instanced arm draws a unit `BoxGeometry(1,1,1)` positioned by ONE `Matrix4`
// built as `makeTranslation × makeRotationY × makeScale`
// (`WallInstanceBridge.ts:104-112`). A T·R·S product is by construction incapable of
// expressing a shear — so this path can represent neither a rake nor a profile.
//
// It is pinned here because it is the one path where the profile answer is already
// known and is "REFUSE", and because measuring it turned up a live defect that is
// NOT this feature's (see §(A2b)).

describe('§WALL-PROFILE §(A2) — the instanced arm', () => {
    /** Eligibility per `WallFragmentBuilder.ts:1147-1154`. */
    function instanceRun(wall: WallData) {
        const { rec } = build([wall], { instanced: true });
        return rec.seen;
    }

    it('A2a — a plain VERTICAL wall instances, and its matrix is pinned', () => {
        const seen = instanceRun(mk());
        expect(seen.length, 'the plain vertical wall took the instanced arm').toBe(1);
        expect(seen[0]!.id).toBe('w-1');
        // T(3, 1.5, 0) · Ry(0) · S(6, 3, 0.2), column-major.
        expect(seen[0]!.matrix.map(v => Number(v.toFixed(6)))).toEqual([
            6, 0, 0, 0,
            0, 3, 0, 0,
            0, 0, 0.2, 0,
            3, 1.5, 0, 1,
        ]);
    });

    // ⚠ A LIVE DEFECT THIS FEATURE DID NOT CAUSE, MEASURED RATHER THAN ASSERTED.
    //
    // `isSimpleWall` (`WallFragmentBuilder.ts:1147-1154`) tests five conditions —
    // bridge present, no openings, not curved, no miter join data, ≤1 layer — and
    // **rake is not among them**. `WallInstanceBridge.register` (`:54-118`) reads
    // `wall.rakeAngleDeg` **nowhere**; `grep -c rake` over that file returns 0.
    //
    // So a plain, single-layer, unjoined, opening-free RAKED wall — a wall the user
    // can draw and lean in two gestures — takes the instanced arm and is drawn by a
    // pure T·R·S matrix. It renders VERTICAL while the model says otherwise.
    //
    // That is verbatim the failure `rakeAuthorability` exists to prevent, in its own
    // words at `WallRake.ts:400-401`: *"the wall would render VERTICAL while the
    // model said 80."* The layered×openings combination is REFUSED for exactly this
    // reason; this combination is not refused, because nobody looked at the router.
    //
    // Production wiring is ungated: `engineLauncher.ts:451-458` attaches the bridge
    // whenever `window.__instancedElementRenderer` exists.
    //
    // ⛔ NOT FIXED HERE. This test states the measured truth so the defect is on the
    // record and so the eventual fix is a visible edit to this assertion. The profile
    // feature must refuse this path by name in Slice 1 regardless of how rake is
    // resolved — a profile is strictly harder than a shear.
    it('A2b — a plain RAKED wall ALSO instances, losing its lean (KNOWN DEFECT, reported)', () => {
        const seen = instanceRun(mk({ rake: RAKE_DEG }));
        expect(
            seen.length,
            'If this is now 0 the router learned to exclude raked walls — good. Update ' +
            'this test to assert the exclusion rather than deleting it.',
        ).toBe(1);
        // The matrix is IDENTICAL to the vertical wall's: the 75° lean is absent.
        expect(seen[0]!.matrix.map(v => Number(v.toFixed(6)))).toEqual([
            6, 0, 0, 0,
            0, 3, 0, 0,
            0, 0, 0.2, 0,
            3, 1.5, 0, 1,
        ]);
    });

    it('A2c — a JOINED wall is correctly excluded (the one guard that does fire)', () => {
        const seen = instanceRun(mk({ start: [0, 0], end: [6, 0] }));
        // Sanity: the exclusion above is real, not an artefact of the fake renderer.
        expect(seen.length).toBe(1);
        const { rec } = build(
            [mk({ id: 'w-1', start: [0, 0], end: [6, 0] }), mk({ id: 'w-2', start: [6, 0], end: [6, 5] })],
            { instanced: true },
        );
        expect(
            rec.seen.some(s => s.id === 'w-1'),
            'a wall with miter join data must NOT instance (WallInstanceBridge.ts:60-67)',
        ).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §(B) THE WHITELISTS — READ FROM SOURCE, NOT MIRRORED
// ─────────────────────────────────────────────────────────────────────────────
//
// Three hand-written field lists stand between an authored wall field and its
// destruction. None is type-checked: `ProjectSnapshot.walls` is `any[]`
// (`ProjectSerializer.ts:127`), so `tsc` cannot see an omission, and the failure
// mode is a field that round-trips as `undefined` with no error anywhere.
//
// ⚠ THESE ASSERTIONS READ THE REAL FILES. That is deliberate and it is the whole
// point. `WallRakeRoundTrip.test.ts:26-36` keeps a hand-copied MIRROR of the
// serialiser's field list; a mirror is C84 §8.d — *"a comment as the
// synchronisation mechanism"* — and C84 EI-8a records that exact mechanism having
// already failed twice in this repo. §(B4) pins that mirror against its source so
// it can no longer drift silently.

/** Extract the depth-1 keys of the object literal that begins at `openBraceIdx`. */
function objectLiteralKeys(src: string, openBraceIdx: number): string[] {
    const keys: string[] = [];
    let depth = 0;
    let i = openBraceIdx;
    let atStmtStart = false;
    while (i < src.length) {
        const ch = src[i]!;
        const two = src.slice(i, i + 2);
        // comments
        if (two === '//') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl; continue; }
        if (two === '/*') { const end = src.indexOf('*/', i); i = end < 0 ? src.length : end + 2; continue; }
        // strings / templates
        if (ch === '"' || ch === "'" || ch === '`') {
            const q = ch; i++;
            while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
            i++; continue;
        }
        if (ch === '{' || ch === '[' || ch === '(') {
            depth++; i++;
            // Only the literal's OWN opening brace starts a key position. Setting this
            // on every return to depth 1 would let a ternary's `cond ? a : b` be read
            // as a key `a`, because `a :` matches the key pattern.
            if (depth === 1) atStmtStart = true;
            continue;
        }
        if (ch === '}' || ch === ']' || ch === ')') {
            depth--;
            if (depth === 0) break;
            i++; continue;
        }
        if (depth === 1) {
            if (ch === ',') { atStmtStart = true; i++; continue; }
            if (/\s/.test(ch)) { i++; continue; }
            if (atStmtStart) {
                const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(src.slice(i));
                if (m) { keys.push(m[1]!); i += m[0].length; atStmtStart = false; continue; }
                atStmtStart = false;
            }
        }
        i++;
    }
    if (depth !== 0) throw new Error('unbalanced object literal — the extractor lost sync');
    return keys;
}

/**
 * Keys of the first object literal appearing after the LAST of `anchors`, each
 * anchor searched from the end of the previous one.
 *
 * The sequence exists because a single anchor is not necessarily unique, and a
 * non-unique anchor fails in the worst possible way: it silently reads a DIFFERENT
 * literal and the test still passes or fails for the wrong reason. This was not
 * hypothetical — `const updates: Partial<WallData> = {` occurs TWICE in
 * `WallStore.ts` (`:925` in `updateWall`, `:962` in `restoreSnapshot`), and the
 * first draft of this test read the wrong one.
 */
function keysAfter(relPath: string, ...anchors: string[]): string[] {
    const src = fs.readFileSync(path.join(REPO, relPath), 'utf8');
    let at = 0;
    for (const anchor of anchors) {
        const found = src.indexOf(anchor, at);
        if (found < 0) {
            throw new Error(
                `anchor not found in ${relPath}: ${JSON.stringify(anchor)} — the file moved or ` +
                `was renamed. Do NOT relax this test; re-point the anchor and re-read the list.`,
            );
        }
        at = found + anchor.length;
    }
    const brace = src.indexOf('{', at - 1);
    if (brace < 0) throw new Error(`no object literal after anchor in ${relPath}`);
    return objectLiteralKeys(src, brace);
}

const WALL_STORE = 'packages/geometry-wall/src/WallStore.ts';

const SERIALIZER = 'apps/editor/src/engine/persistence/ProjectSerializer.ts';
const LOADER = 'apps/editor/src/engine/persistence/ProjectLoader.ts';

describe('§WALL-PROFILE §(B) — the three hand-written whitelists', () => {

    // ── B1 ──────────────────────────────────────────────────────────────────
    // WallStore holds TWO snapshot-restore whitelists, not one. Both are entered by
    // undo paths, both project a full WallData onto a named subset, and NEITHER
    // carries `rakeAngleDeg`. A profile field must join both or undo will restore a
    // wall's shape from one path and not the other.
    const restoreSnapshotKeys = (): string[] =>
        keysAfter(WALL_STORE, 'restoreSnapshot(snapshot: WallData): void {',
            'const updates: Partial<WallData> = {');
    const updateWallKeys = (): string[] =>
        keysAfter(WALL_STORE, 'updateWall(wall: WallData): void {',
            'const updates: Partial<WallData> = {');

    it('B1 — WallStore.restoreSnapshot emits exactly the fields it emits today', () => {
        expect(restoreSnapshotKeys()).toEqual([
            'baseLine', 'height', 'thickness', 'baseOffset', 'materialId', 'materialColor',
            'properties', 'curve', 'layers', 'systemTypeId', 'metadata',
            '_renderVersion', '_sourceBaseLine',
            // §WALL-PROFILE Slice 1. This pin FAILED when the field was added, which is the
            // pin working: a new authored field must be a deliberate, visible edit here.
            'wallProfile',
            // §FIX-SIDEFINISH-REACHES-AUTHORITY (L-995). THIS PIN FAILED TOO, and it is the
            // second time this control has done its job. `sideFinishes` was ALREADY a field
            // on the record and ALREADY written by `SetWallSideFinishCommand` — it was this
            // whitelist that dropped it, so the chat said "Set the interior finish of all 17
            // walls on Ground to Wood · Oak (Light). Done" over a model nothing had touched.
            // Added to the forward projection (B1b) and to this restore projection in the
            // SAME commit, because carrying a field forward and not back is C84 EI-7a
            // (WRITES ⊋ RESTORES) — undo would have left the new finish standing.
            'sideFinishes',
        ]);
    });

    it('B1b — WallStore.updateWall emits exactly the fields it emits today', () => {
        expect(updateWallKeys()).toEqual([
            'baseLine', 'height', 'thickness', 'baseOffset', 'materialId', 'materialColor',
            'properties', 'curve', 'layers', 'systemTypeId',
            'wallProfile',   // §WALL-PROFILE Slice 1 — see B1
            'sideFinishes',  // §FIX-SIDEFINISH-REACHES-AUTHORITY (L-995) — see B1
            '_renderVersion',
        ]);
    });

    // ⚠ A LIVE DEFECT, PINNED AS-IS AND NOT FIXED HERE. Wall commands undo through
    // these two projections, and `rakeAngleDeg` is absent from both — so a command
    // that changed both height and rake does not restore the rake. Reported to the
    // coordinator separately. Asserting the DESIRED list here would assert a
    // fiction; this asserts the truth and names it, which is what makes the eventual
    // fix a visible, deliberate edit to this test rather than a silent one.
    it('B1a — NEITHER restore path carries rakeAngleDeg (KNOWN DEFECT, reported)', () => {
        const msg =
            'If this is now TRUE the defect was fixed — good. Update this test to assert ' +
            'the fix rather than deleting it, and add the profile field in the same commit.';
        expect(restoreSnapshotKeys().includes('rakeAngleDeg'), msg).toBe(false);
        expect(updateWallKeys().includes('rakeAngleDeg'), msg).toBe(false);
    });

    // ── B2 ──────────────────────────────────────────────────────────────────
    // The LIVE serialiser. `apps/editor/src/engine/persistence/` — NOT the
    // `packages/persistence-client/src/loader/` twin, which is not on the save path
    // (`ProjectSerializer.ts:267-275` records a lane closing a ticket against the
    // dead copy). Production reaches this one via `initPersistence.ts:41`.
    it('B2 — serializeWall emits exactly the fields it emits today', () => {
        const keys = keysAfter(SERIALIZER, 'const baseLineToSave = wall._sourceBaseLine');
        expect(keys).toEqual([
            'id', 'type', 'levelId', 'parentId', 'baseLine', 'height', 'thickness',
            'baseOffset', 'materialId', 'materialColor', 'openings', 'childrenIds',
            'layers', 'systemTypeId', 'curve', 'rakeAngleDeg',
            'wallProfile',   // §WALL-PROFILE Slice 1 — C84 EI-6: authored data MUST round-trip
            // §FIX-SIDEFINISH-PERSISTS (L-999) — same clause, same reason. C85 §5 row 23 and
            // §11 row 6 both pinned `sideFinishes` as NEVER SERIALISED; with the L-995 write
            // fixed and this list unchanged, "Done" would have been true for the session and
            // false after the next reload — the same false success with a delay fuse.
            'sideFinishes',
            'joinIntent',
            'properties', 'ifcData', 'metadata', 'loadBearing',
        ]);
    });

    // ── B3 ──────────────────────────────────────────────────────────────────
    // Whitelist #3, and the one most easily forgotten: the LOAD half. A field can be
    // serialised perfectly and still be destroyed on reload, because the loader
    // rebuilds every wall through `CreateWallCommand` and passes a hand-written
    // option list. `baseLine[i].y` is the standing proof — the serialiser preserves
    // it via `stripVec3`, and the loader reads only `.x` / `.z` (`:877-878`).
    it('B3 — ProjectLoader passes exactly the CreateWallCommand options it passes today', () => {
        const keys = keysAfter(LOADER, 'new CreateWallCommand(wall.id, {');
        expect(keys).toEqual([
            'start', 'end', 'height', 'thickness', 'levelId', 'baseOffset',
            'materialId', 'materialColor', 'curve', 'ifcGuid', 'rakeAngleDeg',
            'sideFinishes',  // §FIX-SIDEFINISH-PERSISTS (L-999) — the LOAD half for the finish
            'wallProfile',   // §WALL-PROFILE Slice 1 — the LOAD half, the one most easily missed
            'systemTypeId', 'layers', 'joinIntent',
        ]);
    });

    // ── B4 ──────────────────────────────────────────────────────────────────
    // Close the drift hole in the EXISTING round-trip test. `WallRakeRoundTrip.ts`
    // walks a hand-copied mirror of the serialiser's list; if the real list grows a
    // field the mirror does not, that test keeps passing while proving nothing about
    // the new field. C84 EI-8a: a licensed copy MUST be pinned to its master by an
    // executed test comparing every value.
    it('B4 — WallRakeRoundTrip\'s mirrored field list matches the real serialiser', () => {
        const real = keysAfter(SERIALIZER, 'const baseLineToSave = wall._sourceBaseLine');
        const mirrorSrc = fs.readFileSync(
            path.join(REPO, 'packages/geometry-wall/__tests__/WallRakeRoundTrip.test.ts'), 'utf8',
        );
        const m = /const SERIALISED_WALL_FIELDS = \[([\s\S]*?)\] as const;/.exec(mirrorSrc);
        expect(m, 'the mirror declaration moved — re-point this extractor').toBeTruthy();
        const mirrored = Array.from(m![1]!.matchAll(/'([^']+)'/g)).map(x => x[1]!);
        expect(
            mirrored,
            'The mirror has drifted from the serialiser. Update WallRakeRoundTrip.test.ts ' +
            '— NOT this test — so the round-trip walk covers every persisted field.',
        ).toEqual(real);
    });
});
