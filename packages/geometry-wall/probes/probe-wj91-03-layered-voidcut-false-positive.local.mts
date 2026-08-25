// probe-wj91-03 — lane WINJOINT91 (READ-ONLY diagnostic; untracked evidence).
//
// QUESTION: the founder's console shows §DIAG-OPENING-VOID firing on EVERY
// MOVE_WINDOW with path=layered-grid. The coordinator's void check
// (WallRebuildCoordinator._flushOpeningsOnly, ~:1396-1440) counts DIRECT
// children of the wall group whose userData.elementType is 'WallPart' or
// 'WallLayer'; voidCut = bodyParts > 0. Does the layered-WITH-OPENINGS
// builder (`LayeredWallOpeningBuilder.buildLayeredWallSegmentsAroundOpenings`,
// the 'layered-grid' path) ever stamp those elementTypes? If not, voidCut is
// FALSE for every layered wall with openings even when the void IS cut — a
// structural false positive that routes every window edit to the whole-level
// re-resolve probe-wj91-01 measures.
//
// Run: cd packages/geometry-wall && node ../../node_modules/tsx/dist/cli.mjs probes/probe-wj91-03-layered-voidcut-false-positive.local.mts

import './_wj91-shim.local.mts';
import * as THREE from '@pryzm/renderer-three/three';
import { buildLayeredWallSegmentsAroundOpenings, clusterOpenings } from '../src/LayeredWallOpeningBuilder';
import type { WallData, Opening } from '../src/WallTypes';

const opening: Opening = {
    id: 'op-1', type: 'window', offset: 2.0, width: 1.2, height: 1.5,
    sillHeight: 0.9, elementId: 'win-1',
};
const wall = {
    id: 'wL', type: 'wall', levelId: 'L0', properties: {}, childrenIds: [],
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    height: 3, thickness: 0.3, baseOffset: 0,
    openings: [opening],
    layers: [
        { name: 'finish-ext', function: 'finish-exterior', thickness: 0.02 },
        { name: 'core',       function: 'structure',       thickness: 0.26 },
        { name: 'finish-int', function: 'finish-interior', thickness: 0.02 },
    ],
    metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'probe', version: 1 },
} as unknown as WallData;

const group = new THREE.Group();
const meshes = buildLayeredWallSegmentsAroundOpenings(
    wall, group, clusterOpenings([opening]), 0.3,
);

console.log(`layered-grid build: ${meshes.length} mesh(es) emitted; group.children=${group.children.length}`);

// ── the coordinator's EXACT §DIAG-OPENING-VOID scan, transcribed ─────────────
let bodyParts = 0;
let hasHitProxy = false;
const seenUserData = new Map<string, number>();
for (const child of group.children) {
    const ud = (child as { userData?: { elementType?: string; role?: string } }).userData;
    if (ud?.elementType === 'WallPart' || ud?.elementType === 'WallLayer') bodyParts++;
    if (ud?.role === 'hit-proxy') hasHitProxy = true;
    const key = `elementType=${ud?.elementType ?? 'NONE'} role=${ud?.role ?? 'NONE'}`;
    seenUserData.set(key, (seenUserData.get(key) ?? 0) + 1);
}
const isHidden = group.visible === false;
const voidCut = !isHidden && bodyParts > 0;

console.log('userData census of direct children:');
for (const [k, n] of seenUserData) console.log(`  ${n} × ${k}`);
console.log(`\ncoordinator scan → bodyParts=${bodyParts} hasHitProxy=${hasHitProxy} isHidden=${isHidden} → voidCut=${voidCut}`);

// Was the void ACTUALLY cut? Count distinct geometry segments — a wall with a
// window builds jamb/head/sill segments around the hole; the hole exists iff
// the union of the meshes' bboxes leaves the opening span empty at sill+h/2.
// Sample a vertical scanline every 10 cm along the wall at the opening's
// mid-height: x-bands with NO material are the hole. Robust to either offset
// convention (centre vs left-edge).
const cy = opening.sillHeight + opening.height / 2;
const hit = (x: number): boolean => {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, cy, -5), new THREE.Vector3(0, 0, 1), 0, 10);
    for (const m of meshes) {
        m.updateMatrixWorld(true);
        if (ray.intersectObject(m, false).length > 0) return true;
    }
    return false;
};
const emptyBands: string[] = [];
let runStart: number | null = null;
for (let x = 0.05; x <= 5.95 + 1e-9; x += 0.1) {
    const solid = hit(x);
    if (!solid && runStart === null) runStart = x;
    if ((solid || x > 5.9) && runStart !== null) {
        emptyBands.push(`[${runStart.toFixed(2)} .. ${(solid ? x - 0.1 : x).toFixed(2)}]`);
        runStart = null;
    }
}
console.log(`material-free x-bands at mid-opening height y=${cy.toFixed(2)}: ${emptyBands.join(' ') || 'NONE'}`);
const voidActuallyCut = emptyBands.length > 0;
console.log(
    `\nVERDICT: coordinator reads voidCut=${voidCut} while the void is ${voidActuallyCut ? 'genuinely CUT' : 'NOT cut'} — ` +
    (voidCut === false && voidActuallyCut
        ? 'FALSE POSITIVE CONFIRMED: every layered wall with openings takes the whole-level fallback on every window edit.'
        : 'no false positive on this fixture.'),
);
