// probe-wj91-01 — lane WINJOINT91 (READ-ONLY diagnostic; untracked evidence).
//
// QUESTION: when the §DIAG-OPENING-VOID fallback re-runs the WHOLE-LEVEL
// `WallJoinResolver.resolveLevel` after a window edit (WallRebuildCoordinator
// `_flush`, line ~1891), it passes a ZOOM-DEPENDENT snapRadius
// (`getWorldToleranceForActiveCamera`, clamp [0.05 .. 1.0] m) instead of the
// DEFAULT_SNAP_RADIUS = 0.5 m the original resolve may have used. Does a
// junction that WAS mitred at 0.5 m stop being detected at the zoomed-in
// clamp floor 0.05 m — i.e. does the mitred joint measurably OPEN?
//
// The coordinator then square-caps every wall that HAD a join but got no fresh
// adjustment (§STALE-CACHE-FIX, WallRebuildCoordinator.ts:2417-2435) and drops
// its cached mitre from `_prevJoinMap` (line 2437). This probe measures the
// resolver half of that chain with the REAL resolver on real WallData records.
//
// Run: cd packages/geometry-wall && node ../../node_modules/tsx/dist/cli.mjs probes/probe-wj91-01-snapradius-mitre-loss.local.mts

import './_wj91-shim.local.mts'; // node has no `window`; resolver reads window.__pryzmDebugWalls
import * as THREE from '@pryzm/renderer-three/three';
import { WallJoinResolver, DEFAULT_SNAP_RADIUS } from '../src/WallJoinResolver';
import type { WallData } from '../src/WallTypes';

let seq = 0;
function wall(id: string, s: [number, number], e: [number, number], thickness = 0.3, layered = true): WallData {
    return {
        id, type: 'wall', levelId: 'L0', properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, thickness, baseOffset: 0, openings: [],
        ...(layered ? { layers: [
            { name: 'finish-ext', function: 'finish',    thickness: 0.02 },
            { name: 'core',       function: 'structure', thickness: 0.26 },
            { name: 'finish-int', function: 'finish',    thickness: 0.02 },
        ] } : {}),
        metadata: { createdAt: ++seq, modifiedAt: seq, createdBy: 'probe', version: 1 },
    } as unknown as WallData;
}

type JD = { baseLine: [THREE.Vector3, THREE.Vector3]; startMN: unknown; endMN: unknown; invalid?: boolean };

function cornerEnd(adj: JD | undefined, w: WallData, side: 'start' | 'end'): { x: number; z: number } {
    const bl = adj?.baseLine;
    if (bl) return side === 'start' ? { x: bl[0].x, z: bl[0].z } : { x: bl[1].x, z: bl[1].z };
    const raw = w.baseLine;
    return side === 'start' ? { x: raw[0].x, z: raw[0].z } : { x: raw[1].x, z: raw[1].z };
}

function gap(a: { x: number; z: number }, b: { x: number; z: number }): number {
    return Math.hypot(a.x - b.x, a.z - b.z);
}

function mnPresent(adj: JD | undefined, side: 'start' | 'end'): boolean {
    if (!adj) return false;
    return side === 'start' ? adj.startMN != null : adj.endMN != null;
}

interface Scenario {
    name: string;
    walls: WallData[];
    // the joint to measure: [wallId, side] pair
    joint: [[string, 'start' | 'end'], [string, 'start' | 'end']];
}

// S1 — control: exact-coincident L corner (a cleanly drawn rectangle corner).
const s1: Scenario = {
    name: 'S1 exact-coincident L corner (control)',
    walls: [wall('A1', [0, 0], [6, 0]), wall('B1', [6, 0], [6, 4])],
    joint: [['A1', 'end'], ['B1', 'start']],
};
// S2 — near corner: endpoints 0.20 m apart. Real sources of this state: a
// hand-drawn near-corner, a weld left within weldTol, or a store still holding
// a POST-TRIM baseline (§V2-PRETRIM-FIX names this as a real store state; the
// endpoints sit ~halfT from the junction centre — halfT here = 0.15 m each).
const s2: Scenario = {
    name: 'S2 near corner, 0.20 m endpoint gap (welded-band corner)',
    walls: [wall('A2', [0, 0], [5.80, 0]), wall('B2', [6.0, 0], [6.0, 4])],
    joint: [['A2', 'end'], ['B2', 'start']],
};
// S3 — T junction: guest abutting the host FACE (perp distance from host
// CENTRELINE = halfT = 0.15 m — the drawn-to-face partition every plan has).
const s3: Scenario = {
    name: 'S3 T-junction, guest endpoint on host face (0.15 m off centreline)',
    walls: [wall('H3', [0, 0], [8, 0]), wall('G3', [4, 0.15], [4, 3], 0.1)],
    joint: [['G3', 'start'], ['H3', 'start']], // gap not meaningful for T; MN/adjustment presence is the signal
};

const SNAP_APP_DEFAULT = DEFAULT_SNAP_RADIUS;      // 0.5 m — package default, most tests, legacy fallback
const SNAP_ZOOMED_IN   = 0.05;                     // MIN_WORLD_TOLERANCE_M — ortho camera zoomed in
const SNAP_MID         = 0.12;                     // an ordinary mid-zoom plan view

function run(s: Scenario): void {
    console.log(`\n=== ${s.name} ===`);
    const prevHadJoin = new Set<string>();
    let jointGapAtDefault = NaN;
    for (const snapRadius of [SNAP_APP_DEFAULT, SNAP_MID, SNAP_ZOOMED_IN]) {
        // fresh clones — resolveLevel may mutate nothing, but stay honest
        const walls = s.walls.map(w => JSON.parse(JSON.stringify(w)) as WallData);
        const adjustments = WallJoinResolver.resolveLevel(walls as never, { snapRadius }) as Map<string, JD>;
        const [[idA, sideA], [idB, sideB]] = s.joint;
        const wA = walls.find(w => w.id === idA)!;
        const wB = walls.find(w => w.id === idB)!;
        const adjA = adjustments.get(idA);
        const adjB = adjustments.get(idB);
        const g = gap(cornerEnd(adjA, wA, sideA), cornerEnd(adjB, wB, sideB));
        if (snapRadius === SNAP_APP_DEFAULT) {
            jointGapAtDefault = g;
            for (const id of adjustments.keys()) prevHadJoin.add(id);
        }
        // The coordinator's §STALE-CACHE-FIX condition: had a join before, none now → square-capped
        const squareCapped = [...prevHadJoin].filter(id => !adjustments.has(id));
        console.log(
            `snapRadius=${snapRadius.toFixed(2)}m  adjustments={${[...adjustments.keys()].join(',') || 'NONE'}}  ` +
            `MN(${idA}.${sideA})=${mnPresent(adjA, sideA)}  MN(${idB}.${sideB})=${mnPresent(adjB, sideB)}  ` +
            `jointGap=${g.toFixed(4)}m` +
            (snapRadius !== SNAP_APP_DEFAULT
                ? `  §STALE-CACHE-FIX would SQUARE-CAP: [${squareCapped.join(',') || 'none'}]  ` +
                  `gapDelta=${(g - jointGapAtDefault >= 0 ? '+' : '')}${(g - jointGapAtDefault).toFixed(4)}m`
                : '  (baseline reading)'),
        );
    }
}

console.log('probe-wj91-01 — whole-level re-resolve snapRadius sensitivity');
console.log(`DEFAULT_SNAP_RADIUS=${DEFAULT_SNAP_RADIUS} m; camera clamp band [0.05 .. 1.0] m (CameraToleranceService)`);
run(s1);
run(s2);
run(s3);
console.log('\nReading: a joint whose MN flips true→false / whose wall leaves `adjustments` between');
console.log('0.5 m and 0.05 m is exactly the §STALE-CACHE-FIX square-cap + _prevJoinMap eviction path');
console.log('the §DIAG-OPENING-VOID fallback walks on EVERY window edit of a layered wall.');
