/**
 * §PERF105 probe 02 — WHAT DOES ONE PROJECTED GROUP COST, AND WHAT DOES THE YIELD COST?
 *
 * The founder's console, once per edit:
 *     [EdgeProjectorService] §PERF-EDGEPROJECTOR-CHUNK Native projection done —
 *       49 group(s), 30 frame yield(s), 369 edge geometries across 43 ISO layer(s)
 *
 * `GROUP_CHUNK_SIZE = 4` was calibrated in 2026-05 against "~12 ms per group".
 * A frame yield is ~16.7 ms of CALENDAR time whether or not the CPU is busy, so if
 * the real per-group cost is well under 4 × 16.7 ms the yield policy costs MORE
 * calendar time than the work it is relieving.
 *
 * This probe measures the CPU half of a group's projection — `updateWorldMatrix` +
 * `EdgesGeometry` + `mergeGeometries`, which is what the per-group loop does before
 * handing off to OBC `toDrawingSpace` — per element family, at realistic mesh counts.
 *
 * Run:  npx tsx packages/room-topology/probes/probe-perf105-02-projection-group-cost.local.mts
 */
import * as THREE from '@pryzm/renderer-three/three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { estimateFrameYields, GROUP_CHUNK_SIZE } from '../../../apps/editor/src/engine/views/projectionChunkPolicy.js';

const FRAME_MS = 1000 / 60;

interface Fam { type: string; meshes: number; segs: number; count: number; layers: number; }
// `segs` = tessellation of each mesh (a box is 1; a door leaf with hardware, a
// window frame, a stair tread stack and a CW cell rack are progressively denser).
const FAMILIES: Fam[] = [
    { type: 'wall',        meshes: 4,  segs: 1, count: 62, layers: 2 },
    { type: 'window',      meshes: 7,  segs: 2, count: 26, layers: 2 },
    { type: 'door',        meshes: 6,  segs: 2, count: 20, layers: 2 },
    { type: 'slab',        meshes: 3,  segs: 1, count: 3,  layers: 2 },
    { type: 'stair',       meshes: 16, segs: 2, count: 2,  layers: 2 },
    { type: 'curtainwall', meshes: 26, segs: 3, count: 4,  layers: 3 },
    { type: 'furniture',   meshes: 4,  segs: 4, count: 32, layers: 1 },
    { type: 'lighting',    meshes: 2,  segs: 2, count: 14, layers: 1 },
    { type: 'column',      meshes: 2,  segs: 1, count: 6,  layers: 2 },
];

function makeGroup(f: Fam): THREE.Group {
    const g = new THREE.Group();
    for (let m = 0; m < f.meshes; m++) {
        const geo = new THREE.BoxGeometry(1, 2, 0.3, f.segs, f.segs, f.segs);
        const mesh = new THREE.Mesh(geo);
        mesh.position.set(m * 0.4, 0, 0);
        g.add(mesh);
    }
    g.updateMatrixWorld(true);
    return g;
}

/** Exactly what the per-group loop does on the CPU side, minus OBC toDrawingSpace. */
function projectGroup(g: THREE.Group, layers: number): number {
    let edgeGeos = 0;
    for (let L = 0; L < layers; L++) {
        const parts: THREE.BufferGeometry[] = [];
        g.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (!mesh.isMesh) return;
            mesh.updateWorldMatrix(true, false);
            const eg = new THREE.EdgesGeometry(mesh.geometry, 30);
            eg.applyMatrix4(mesh.matrixWorld);
            parts.push(eg);
            edgeGeos++;
        });
        if (parts.length > 1) {
            const merged = mergeGeometries(parts, false);
            merged?.dispose();
        }
        for (const p of parts) p.dispose();
    }
    return edgeGeos;
}

function median(xs: number[]): number { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }

console.log('§PERF105 probe 02 — per-group projection CPU cost (EdgesGeometry + merge)\n');
console.log('family        meshes  layers   ms/group   count   Σ ms');
let totalMs = 0, totalGroups = 0, cwGroups = 0, otherGroups = 0, weightedLayers = 0;
const perFamily: Array<{ type: string; ms: number; count: number }> = [];
for (const f of FAMILIES) {
    const g = makeGroup(f);
    const runs: number[] = [];
    projectGroup(g, f.layers);                    // warm
    for (let r = 0; r < 9; r++) {
        const t0 = performance.now();
        projectGroup(g, f.layers);
        runs.push(performance.now() - t0);
    }
    const ms = median(runs);
    const sum = ms * f.count;
    totalMs += sum; totalGroups += f.count;
    weightedLayers += f.layers * f.count;
    if (f.type === 'curtainwall') cwGroups += f.count; else otherGroups += f.count;
    perFamily.push({ type: f.type, ms, count: f.count });
    console.log(
        `${f.type.padEnd(13)} ${String(f.meshes).padStart(5)}  ${String(f.layers).padStart(5)}   ` +
        `${ms.toFixed(3).padStart(7)}    ${String(f.count).padStart(4)}   ${sum.toFixed(1).padStart(6)}`,
    );
}
const meanLayers = weightedLayers / totalGroups;
console.log(`\nTOTAL: ${totalGroups} groups, ${totalMs.toFixed(1)} ms of CPU work, mean ${meanLayers.toFixed(2)} layers/group`);
console.log(`Mean per-group CPU cost: ${(totalMs / totalGroups).toFixed(3)} ms  ` +
    `(the GROUP_CHUNK_SIZE=${GROUP_CHUNK_SIZE} calibration assumes ~12 ms)`);

// ── The yield arithmetic, from the SHIPPED policy function ────────────────────
console.log('\n── Frame-yield calendar cost (shipped estimateFrameYields) ──');
for (const [label, cw, other] of [
    ['full pass, 0% cache (founder log: 49 groups)', 4, 45],
    ['full pass, 0% cache (200-element model)', cwGroups, otherGroups],
    ['full pass, 100% cache (hits do not advance the chunk counter)', 0, 0],
] as Array<[string, number, number]>) {
    const yields = estimateFrameYields(cw, other, meanLayers, false);
    console.log(
        `${label.padEnd(62)} yields=${String(yields).padStart(3)}  ` +
        `calendar=${(yields * FRAME_MS).toFixed(0).padStart(5)} ms`,
    );
}

const workMs = totalMs;
const yieldsNow = estimateFrameYields(cwGroups, otherGroups, meanLayers, false);
console.log(
    `\n⭐ At ${totalGroups} groups the pass does ${workMs.toFixed(0)} ms of CPU work and spends ` +
    `${(yieldsNow * FRAME_MS).toFixed(0)} ms waiting for frames — ` +
    `${((yieldsNow * FRAME_MS) / (workMs + yieldsNow * FRAME_MS) * 100).toFixed(0)}% of the ` +
    `elapsed pass is YIELD, not work.`,
);

// What a 50 ms time-sliced budget would cost instead.
const budgetMs = 50;
const yieldsBudget = Math.max(0, Math.ceil(workMs / budgetMs) - 1);
console.log(
    `A 50 ms TIME-SLICED budget over the same work: ${yieldsBudget} yield(s) = ` +
    `${(yieldsBudget * FRAME_MS).toFixed(0)} ms calendar, longest task ≤ ${budgetMs} ms.`,
);
