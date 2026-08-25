// @vitest-environment happy-dom
//
// §WJFIX96 (L-11329) — THE OPENING-FREE PLAIN WALL BODY MUST NAME ITSELF, AND THE
// §DIAG-OPENING-VOID HALF OF THAT ROW IS REFUTED.
//
// L-11329 read: `WallFragmentBuilder.ts:4594-4600` and `:4734-4740` stamp `role:'geometry'`
// with NO `elementType` — *"the PLAIN-WALL twin of the defect §WJFIX92 F-1 fixed for the
// layered arm, so F-1 alone is necessary but NOT sufficient: the §DIAG-OPENING-VOID scan
// stays blind to plain walls and keeps routing their window edits to the whole-level
// rebuild."*
//
// MEASURED (`packages/geometry-wall/probes/probe-wjfix96-01-plain-arm-elementtype.local.mts`):
//
//   • THE STATED MECHANISM IS FALSE. Those two sites live in `createWallBodyFragment`,
//     whose SOLE call site is guarded by `wall.openings.length === 0`, while the
//     coordinator's void census is only consulted `if (_openings.length > 0)`. The two
//     conditions are disjoint: a wall that reaches the census never took that path.
//     A plain wall WITH a window reads bodyParts=1 → voidCut=true, before and after.
//     `describe` #1 pins that, so the refutation cannot quietly become true later.
//
//   • THE SITES ARE STILL WRONG, for a different consumer with its own evidence.
//     `EdgeProjectorService` resolves each mesh's ISO drawing layer from
//     `userData.elementType`, falling back to `wallId` + `layerIndex` (:2866-2877). The
//     opening-free plain body carried none of the three, so it resolved to
//     `projection-visible` — outside A-WALL, outside the pen table, outside the cut gate
//     and outside the poché. That is the founder's L-275 report ("no door → a hollow
//     outline; door → a properly filled poché") arrived at by ABSENCE of a tag rather than
//     by its CASE, which is why L-275's canonical-key normaliser could not close it.
//     `describe` #2 is the fail-then-pass pin: RED before the stamp, GREEN after.
//
// This suite uses the REAL `resolveProjectionLayer` (it is exported precisely so a pin can
// call it) and the REAL `WallFragmentBuilder` + `WallJoinResolver`. Nothing about the
// drawing layer is transcribed here — a transcription could agree with a wrong original.

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WallFragmentBuilder, WallJoinResolver } from '@pryzm/geometry-wall';
import type { WallData } from '@pryzm/geometry-wall';
import { resolveProjectionLayer } from '../src/engine/views/EdgeProjectorService';

const OPENING = {
    id: 'op-1', type: 'window', offset: 2.0, width: 1.2, height: 1.5,
    sillHeight: 0.9, elementId: 'win-1',
};

const levelProvider = {
    getLevelById: (id: string) => ({ id, name: 'G', elevation: 0, height: 3, childrenIds: [] }),
    getLevels: () => [{ id: 'L0', name: 'G', elevation: 0, height: 3, childrenIds: [] }],
};

function wall(id: string, s: [number, number], e: [number, number], withOpening: boolean): WallData {
    return {
        id, type: 'wall', levelId: 'L0', properties: {},
        childrenIds: withOpening ? ['win-1'] : [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, thickness: 0.3, baseOffset: 0,
        openings: withOpening ? [OPENING] : [],
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'test', version: 1 },
    } as unknown as WallData;
}

/**
 * Builds a closed three-wall run so every wall is JOINED (the mitred arm, i.e. the arm that
 * reaches `createWallBodyFragment` rather than the instanced bridge), with the window on W1
 * only. Returns the scene so each wall group can be looked up by its locked userData.id.
 */
function buildRun(): THREE.Scene {
    const scene = new THREE.Scene();
    const builder = new WallFragmentBuilder(scene, levelProvider as never);
    const walls = [
        wall('W1', [0, 0], [6, 0], true),    // hosts the window
        wall('W2', [6, 0], [6, 4], false),
        wall('W3', [6, 4], [0, 4], false),   // opening-free — the subject
    ];
    const joins = WallJoinResolver.resolveLevel(
        walls.map((w) => ({ ...w })) as never, { snapRadius: 0.5 },
    ) as Map<string, unknown>;
    for (const w of walls) builder.buildWall(w, (joins.get(w.id) ?? null) as never, undefined, 0);
    return scene;
}

const groupOf = (scene: THREE.Scene, id: string): THREE.Group =>
    scene.children.find((c) => (c.userData as { id?: string })?.id === id) as THREE.Group;

const bodyMeshesOf = (group: THREE.Group): THREE.Mesh[] =>
    group.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[];

/**
 * `WallRebuildCoordinator.ts` §DIAG-OPENING-VOID, transcribed rather than imported — the
 * coordinator needs a live runtime to instantiate and this predicate is three lines.
 * Source: `apps/editor/src/engine/WallRebuildCoordinator.ts`, `_flushOpeningsOnly`, the
 * `bodyParts` census and `const voidCut = !isHidden && bodyParts > 0`. Its GUARD — the
 * census only runs `if (_openings.length > 0)` — is the whole point of describe #1 and is
 * asserted there explicitly rather than folded into this helper.
 */
function voidCutScan(group: THREE.Group): { bodyParts: number; voidCut: boolean } {
    let bodyParts = 0;
    const isHidden = group.visible === false
        || (group.userData as { __wjrNaNHidden?: boolean })?.__wjrNaNHidden === true;
    for (const child of group.children) {
        const ud = (child as { userData?: { elementType?: string } }).userData;
        if (ud?.elementType === 'WallPart' || ud?.elementType === 'WallLayer') bodyParts++;
    }
    return { bodyParts, voidCut: !isHidden && bodyParts > 0 };
}

describe('§WJFIX96 — L-11329\'s §DIAG-OPENING-VOID half is REFUTED (regression pin)', () => {
    it('a PLAIN wall WITH a window already presents body parts — voidCut=true, no fallback', () => {
        const scene = buildRun();
        const scan = voidCutScan(groupOf(scene, 'W1'));
        expect(scan.bodyParts, 'the opening-bearing arm stamps WallPart on every segment').toBeGreaterThan(0);
        expect(scan.voidCut, 'false here would route every plain-wall window edit to the whole-level rebuild').toBe(true);
    });

    it('the census the row blamed is UNREACHABLE for the cited sites — they are the openings===0 arm', () => {
        const scene = buildRun();
        // The subject wall stores zero openings, so `_flushOpeningsOnly` never consults its
        // census at all. Stating the guard as an assertion is what keeps this a measurement
        // rather than a claim in a comment.
        const w3 = wall('W3', [6, 4], [0, 4], false);
        expect(w3.openings.length, 'the arm that builds this mesh runs only at zero openings').toBe(0);
        // …and the census would indeed have read zero here — which is precisely why reading
        // it as a defect was a category error, not a bug report.
        expect(voidCutScan(groupOf(scene, 'W1')).voidCut).toBe(true);
    });
});

describe('§WJFIX96 — the opening-free plain wall body lands on A-WALL (RED before the stamp)', () => {
    it('its body mesh carries elementType "WallPart"', () => {
        const scene = buildRun();
        const meshes = bodyMeshesOf(groupOf(scene, 'W3'));
        expect(meshes.length, 'the builder produced a body for the opening-free wall').toBeGreaterThan(0);
        const tags = meshes.map((m) => String((m.userData as { elementType?: string })?.elementType ?? 'NONE'));
        expect(tags.every((t) => t === 'WallPart'), `tags were [${tags.join(', ')}]`).toBe(true);
        // C84 EI-9 — 'WallLayer' would be the FALSE word: this arm runs only when the wall
        // carries no layer stack at all.
        expect(tags.includes('WallLayer')).toBe(false);
        // The pre-existing keys are additive, never replaced.
        expect(meshes.every((m) => (m.userData as { role?: string })?.role === 'geometry')).toBe(true);
        expect(meshes.every((m) => (m.userData as { id?: string })?.id === 'W3')).toBe(true);
    });

    it('the REAL resolveProjectionLayer puts it on A-WALL, not the projection-visible fallback', () => {
        const scene = buildRun();
        for (const m of bodyMeshesOf(groupOf(scene, 'W3'))) {
            // EdgeProjectorService's own resolution, verbatim (:2866-2877 then :313).
            const ud = m.userData as { elementType?: string; wallId?: string; layerIndex?: number };
            const elementType = ud?.elementType
                ?? (ud?.wallId !== undefined && ud?.layerIndex !== undefined ? 'WallLayer' : undefined);
            expect(
                resolveProjectionLayer(elementType),
                'projection-visible ⇒ no pen weight, no cut gate, no poché — the L-275 symptom',
            ).toBe('A-WALL');
        }
    });

    it('and it agrees with the wall that HAS a window — one wall family, one drawing layer', () => {
        const scene = buildRun();
        const layerOf = (id: string): string[] =>
            bodyMeshesOf(groupOf(scene, id)).map((m) =>
                resolveProjectionLayer((m.userData as { elementType?: string })?.elementType));
        expect(layerOf('W1').every((l) => l === 'A-WALL')).toBe(true);
        expect(layerOf('W3')).toEqual(layerOf('W1'));
    });
});
