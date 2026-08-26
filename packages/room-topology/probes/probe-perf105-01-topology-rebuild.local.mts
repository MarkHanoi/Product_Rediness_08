/**
 * §PERF105 probe 01 — WHAT DOES ONE `[TopologyLayer] Adjacency rebuilt` COST?
 *
 * The founder's console repeats, once per element created:
 *     [TopologySpatialIndex] Rebuilt — 156 element(s) indexed.
 *     [TopologyLayer] Adjacency rebuilt — 173 element(s), 673 adjacency edge(s).
 *
 * This probe builds a synthetic scene whose ELEMENT COUNT, MESH COUNT and
 * EDGE COUNT match those lines, then measures both rebuilds in isolation.
 *
 * Run:  npx tsx packages/room-topology/probes/probe-perf105-01-topology-rebuild.local.mts
 */
import * as THREE from '@pryzm/renderer-three/three';
import { topologySpatialIndex } from '../src/TopologySpatialIndex.js';
import { TopologyLayer } from '../src/TopologyLayer.js';

// ── Scene generator ──────────────────────────────────────────────────────────
// Mesh counts per family are taken from the builders: a wall group carries a
// body + edges + per-layer meshes; a door carries frame parts + leaf + handles;
// a curtain wall carries a mullion rack + panels.

interface FamilySpec { type: string; count: number; meshes: number; w: number; d: number; h: number; }

const FAMILIES: FamilySpec[] = [
    { type: 'wall',        count: 62, meshes: 4,  w: 4.0,  d: 0.25, h: 3.0 },
    { type: 'window',      count: 26, meshes: 7,  w: 1.2,  d: 0.25, h: 1.4 },
    { type: 'door',        count: 20, meshes: 6,  w: 0.9,  d: 0.25, h: 2.1 },
    { type: 'slab',        count: 3,  meshes: 3,  w: 20.0, d: 15.0, h: 0.3 },
    { type: 'stair',       count: 2,  meshes: 16, w: 3.0,  d: 1.2,  h: 3.0 },
    { type: 'curtainwall', count: 4,  meshes: 26, w: 6.0,  d: 0.2,  h: 3.0 },
    { type: 'furniture',   count: 32, meshes: 4,  w: 1.4,  d: 0.8,  h: 0.8 },
    { type: 'lighting',    count: 14, meshes: 2,  w: 0.3,  d: 0.3,  h: 0.2 },
    { type: 'column',      count: 6,  meshes: 2,  w: 0.4,  d: 0.4,  h: 3.0 },
    { type: 'tree',        count: 4,  meshes: 3,  w: 3.0,  d: 3.0,  h: 6.0 },
];

/** Deterministic PRNG so every run measures the same scene. */
let _seed = 20260826;
function rnd(): number { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }

const BOX = new THREE.BoxGeometry(1, 1, 1);

function makeElement(type: string, idx: number, meshes: number, w: number, d: number, h: number): THREE.Group {
    const g = new THREE.Group();
    g.userData.id = `${type}_${idx}`;
    g.userData.elementType = type;
    g.userData.levelId = idx % 2 === 0 ? 'L0' : 'L1';
    g.userData.version = 1;
    // Building footprint 20 × 15 m over 2 levels — walls land on a coarse grid so
    // neighbours genuinely touch (that is what produces the ~4 edges/element).
    const gx = (idx % 10) * 2.0;
    const gz = Math.floor(idx / 10) % 8 * 2.0;
    g.position.set(gx + rnd() * 0.02, (idx % 2) * 3.0, gz + rnd() * 0.02);
    for (let m = 0; m < meshes; m++) {
        const mesh = new THREE.Mesh(BOX);
        mesh.scale.set(w / meshes + 0.05, h, d);
        mesh.position.set((m - meshes / 2) * (w / meshes), h / 2, 0);
        mesh.userData.elementType = type;
        g.add(mesh);
    }
    return g;
}

function buildScene(fraction = 1): { scene: THREE.Scene; elements: number; meshes: number } {
    const scene = new THREE.Scene();
    let elements = 0, meshCount = 0, running = 0;
    for (const f of FAMILIES) {
        const n = Math.max(1, Math.round(f.count * fraction));
        for (let i = 0; i < n; i++) {
            scene.add(makeElement(f.type, running++, f.meshes, f.w, f.d, f.h));
            elements++; meshCount += f.meshes;
        }
    }
    scene.updateMatrixWorld(true);
    return { scene, elements, meshes: meshCount };
}

// ── Measurement helpers ──────────────────────────────────────────────────────

function median(xs: number[]): number { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }

/** Silence the two console.log lines the rebuilds print, so I/O is not measured. */
const _log = console.log; const _err = console.error;
function quiet<T>(fn: () => T): T { console.log = () => {}; console.error = () => {}; try { return fn(); } finally { console.log = _log; console.error = _err; } }

function measure(fraction: number, runs = 7) {
    const { scene, elements, meshes } = buildScene(fraction);

    // TopologyLayer talks to the module SINGLETON by import, so both halves must
    // be measured against that singleton or the adjacency scan queries an empty
    // index and reports 0 edges in 0 ms (the first draft of this probe did exactly
    // that — a benchmark that measures nothing looks identical to a fast one).
    topologySpatialIndex.setScene(scene as any);
    const spatialTimes: number[] = [];
    for (let r = 0; r < runs; r++) {
        topologySpatialIndex.invalidate();
        const t0 = performance.now();
        quiet(() => topologySpatialIndex.queryPoint([0, 0, 0]));  // forces _ensureFresh
        spatialTimes.push(performance.now() - t0);
    }

    // Cell-registration census — how many (element, cell) pairs the index holds.
    const cells = (topologySpatialIndex as any)._cells as Map<string, Set<string>>;
    let cellRegs = 0; for (const s of cells.values()) cellRegs += s.size;

    const layer = new TopologyLayer();
    layer.setScene(scene as any);
    // Warm both, then measure the STEADY-STATE cost of one create's invalidation.
    quiet(() => { layer.getAdjacentElements('wall_0'); });
    const adjTimes: number[] = [];
    for (let r = 0; r < runs; r++) {
        (layer as any)._dirty = true;
        topologySpatialIndex.invalidate();   // what a create's store event does
        const t0 = performance.now();
        quiet(() => { layer.getAdjacentElements('wall_0'); });
        adjTimes.push(performance.now() - t0);
    }
    const edges: number = ((layer as any)._adjacency.allEdgeKeys() as Set<string>).size;

    return {
        elements, meshes, cellRegs, edges,
        spatialMs: median(spatialTimes),
        adjMs: median(adjTimes),
        spatialAll: spatialTimes.map(x => x.toFixed(1)).join('/'),
        adjAll: adjTimes.map(x => x.toFixed(1)).join('/'),
    };
}

// ── Run ──────────────────────────────────────────────────────────────────────
_log('§PERF105 probe 01 — topology rebuild cost vs element count\n');
_log('frac  elements  meshes  cellRegs  edges   spatialRebuild  adjacencyRebuild');
for (const frac of [0.25, 0.5, 0.75, 1.0, 1.5, 2.0]) {
    const r = measure(frac);
    _log(
        `${frac.toFixed(2)}  ${String(r.elements).padStart(8)}  ${String(r.meshes).padStart(6)}  ` +
        `${String(r.cellRegs).padStart(8)}  ${String(r.edges).padStart(5)}   ` +
        `${r.spatialMs.toFixed(2).padStart(8)} ms      ${r.adjMs.toFixed(2).padStart(8)} ms`,
    );
}
_log('\n(adjacencyRebuild INCLUDES the spatial rebuild it triggers — that is the shipped path.)');
