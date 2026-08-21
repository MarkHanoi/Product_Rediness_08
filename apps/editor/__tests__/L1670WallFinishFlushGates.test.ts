// @vitest-environment happy-dom
//
// L-1670 §WALL-FINISH-RENDERS — "Make all interior finish wall white paint" said
// "Set … on 59 of 59 walls" AND NOTHING CHANGED IN 3-D.
// ═══════════════════════════════════════════════════════════════════════════════
//
// The THIRD sighting of this sentence, and each prior fix was real but sat below
// a gate that never let it run:
//
//   · L-960 made the builder PAINT `sideFinishes` (proven at mesh-material level,
//     `L960WallSideFinishRenders.test.ts`).
//   · L-995 made the STORE accept the field (proven against the real store,
//     `L995SideFinishReachesAuthority.test.ts`).
//   · L-1670 (this file): the REBUILD NEVER RAN. `WallRebuildCoordinator._flush`
//     opens with the §FIX-WALLFLUSH-NOPROGRESS-GUARD: if `_levelWallSig` is
//     byte-identical to the last flush, the whole flush returns — and that
//     signature hashed only geometry + materialId/materialColor, never
//     `sideFinishes`. A finish-only batch was "no progress" by construction. Had
//     that gate passed, the whole-level `_buildKey` memo (same omission) would
//     have skipped all 59 walls as "clean". Console evidence matched exactly:
//     command 1.4 ms, slab collateral rebuilt, zero wall meshes touched.
//
// This is the recorded L-813 shape — invalidation gates in series — so the fix
// folds ONE composer (`composeWallPaintSignature`) into BOTH gates, and this file
// pins the chain at the layers that actually decided the founder's pixels:
//
//   real command → real WallStore → BOTH REAL GATES MOVE → real builder →
//   the material handed to the renderer is Matte White → undo reverts all three.
//
// The gate functions exercised here are the coordinator's OWN (`_levelWallSig`
// via prototype, `_buildKey` via the class static) — not re-implementations — so
// a future gate edit that drops the fold fails HERE, not on prod.

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

import { WallStore, WallFragmentBuilder, composeWallPaintSignature } from '@pryzm/geometry-wall';
import type { WallData } from '@pryzm/geometry-wall';
import { ProjectContext } from '@pryzm/core-app-model';
import { SetWallSideFinishBatchCommand } from '@pryzm/command-registry';
import { WallRebuildCoordinator } from '../src/engine/WallRebuildCoordinator';

// ─── The founder's ask, resolved exactly as the chat resolver dispatches it ────
// `paint-matte-white` / '#f7f5ef' — materialCatalog.ts row, transcribed as a TEST
// constant so no resolver under test can move the oracle (the L-955 lesson).
const MATTE_WHITE = {
    materialId: 'paint-matte-white',
    materialColor: '#f7f5ef',
    materialName: 'Paint · Matte White',
};

const LEVEL_ID = 'L0';
const H = 3;
const T = 0.1;

function levelProvider() {
    const level = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: H, childrenIds: [] };
    return {
        getLevelById: (id: string) => (id === LEVEL_ID ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

function newStore(): WallStore {
    return new WallStore(
        new ProjectContext(),
        levelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
    );
}

let _seq = 0;
/** The founder's wall: "Plain Wall", ONE structure layer, no openings, unjoined. */
function plainWall(id: string, z: number): WallData {
    const now = 1_700_000_000_000 + (++_seq);
    return {
        id, type: 'wall', levelId: LEVEL_ID, properties: {}, childrenIds: [],
        baseLine: [{ x: 0, y: 0, z }, { x: 5, y: 0, z }],
        height: H, thickness: T, baseOffset: 0, openings: [],
        layers: [{ name: 'Layer 1', thickness: T, function: 'structure' }],
        metadata: { createdAt: now, modifiedAt: now, createdBy: 'test', version: 1 },
    } as unknown as WallData;
}

// ─── The coordinator's OWN gate functions, not re-spellings ────────────────────

/** Gate 1 — the §FIX-WALLFLUSH-NOPROGRESS-GUARD level signature. Reads only its
 *  `store` argument, so it is callable off the prototype without a coordinator. */
function levelSig(store: WallStore): string {
    return (WallRebuildCoordinator.prototype as unknown as {
        _levelWallSig(levelId: string, s: { getAll(): unknown[] }): string;
    })._levelWallSig.call(Object.create(WallRebuildCoordinator.prototype), LEVEL_ID, store);
}

/** Gate 2 — the §PERF-WALL-MOVE-INCREMENTAL-REBUILD per-wall rebuild memo key. */
function buildKey(wall: WallData): string {
    return (WallRebuildCoordinator as unknown as {
        _buildKey(w: WallData, j: null, r: undefined, s: number, y: number, rj: string): string;
    })._buildKey(wall, null, undefined, 0, 0, '');
}

// ─── The colour the renderer is HANDED for a wall (the L-960 harness, compact) ─
function paintedColour(wall: WallData): string {
    (globalThis as { __pryzmWallPipelineV2?: boolean }).__pryzmWallPipelineV2 = false;
    const scene = new THREE.Scene();
    const builder = new WallFragmentBuilder(scene, levelProvider() as never);
    let instanceColour: string | null = null;
    (builder as unknown as { _instanceBridge: unknown })._instanceBridge = {
        register: (_w: WallData, _y: number, _j: unknown, mat?: THREE.MeshStandardMaterial) => {
            if (mat?.color) instanceColour = `#${mat.color.getHexString()}`;
        },
        isInstanced: () => false,
        unregister: () => { /* no-op */ },
    };
    builder.refreshV2Cache([{
        id: wall.id,
        startXZ: { x: wall.baseLine[0].x, z: wall.baseLine[0].z },
        endXZ: { x: wall.baseLine[1].x, z: wall.baseLine[1].z },
        thickness: wall.thickness,
        layered: false,
    }]);
    builder.buildWall(wall, null, undefined, 0);
    if (instanceColour) return instanceColour;
    const root = builder.getWallRoot(wall.id) as unknown as THREE.Object3D | undefined;
    let meshColour = '';
    root?.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!(m as unknown as { isMesh?: boolean }).isMesh) return;
        if ((m.userData as { role?: string })?.role !== 'geometry') return;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat?.color && !meshColour) meshColour = `#${mat.color.getHexString()}`;
    });
    return meshColour;
}

const norm = (hex: string): string => `#${new THREE.Color(hex).getHexString()}`;

describe("L-1670 — the founder's finish edit must MOVE both flush gates and reach the mesh material", () => {
    it('the full chain: command → store → gate 1 → gate 2 → mesh material → undo reverts all three', () => {
        const store = newStore();
        store.add(plainWall('w0', 0));
        store.add(plainWall('w1', 2));
        const ctx = { stores: { wallStore: store } } as never;

        // ── BEFORE: the gates' readings for the untouched level. ──────────────
        const sigBefore = levelSig(store);
        const keyBefore = buildKey(store.getById('w0') as WallData);

        // ── THE FOUNDER'S SENTENCE, as the chat dispatches it. ────────────────
        const cmd = new SetWallSideFinishBatchCommand({
            wallIds: 'all', side: 'interior', finish: MATTE_WHITE,
        });
        expect(cmd.canExecute(ctx).ok).toBe(true);
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        expect(r.affectedElementIds.sort()).toEqual(['w0', 'w1']);

        // ── AXIS 1 (store): the authority carries the finish. ─────────────────
        const w0 = store.getById('w0') as WallData & { sideFinishes?: { interior?: { materialColor?: string } } };
        expect(w0.sideFinishes?.interior?.materialColor).toBe(MATTE_WHITE.materialColor);

        // ── AXIS 2a (gate 1): the no-progress guard sees PROGRESS. ────────────
        // On the broken build this equality held and `_flush` returned at the
        // top — no classify, no resolveLevel, no buildWall, no pixels.
        const sigAfter = levelSig(store);
        expect(sigAfter, 'the level signature must move on a finish-only edit').not.toBe(sigBefore);

        // ── AXIS 2b (gate 2): the per-wall rebuild memo re-keys. ──────────────
        const keyAfter = buildKey(store.getById('w0') as WallData);
        expect(keyAfter, 'the rebuild memo key must move on a finish-only edit').not.toBe(keyBefore);

        // ── AXIS 2c (mesh): the material handed to the renderer IS Matte White.
        expect(paintedColour(store.getById('w0') as WallData)).toBe(norm(MATTE_WHITE.materialColor));

        // ── UNDO: store, both gates, and the mesh material ALL revert. ────────
        const u = cmd.undo(ctx);
        expect(u.success).toBe(true);
        const w0u = store.getById('w0') as WallData & { sideFinishes?: unknown };
        expect(w0u.sideFinishes ?? undefined).toBeUndefined();
        expect(levelSig(store), 'undo must move the signature BACK so the revert repaints too').toBe(sigBefore);
        expect(buildKey(store.getById('w0') as WallData)).toBe(keyBefore);
        expect(paintedColour(store.getById('w0') as WallData)).not.toBe(norm(MATTE_WHITE.materialColor));
    });

    it('the shared composer is what both gates read — a finish change is visible to it', () => {
        // Belt-and-braces: if someone reverts a gate to a hand-rolled field list,
        // the chain test above catches it; this pins the composer half so the
        // failure names the right file.
        const bare = plainWall('w2', 4);
        const finished = {
            ...bare,
            sideFinishes: { interior: { ...MATTE_WHITE } },
        } as unknown as WallData;
        expect(composeWallPaintSignature(finished as never)).not.toBe(composeWallPaintSignature(bare as never));
    });
});
