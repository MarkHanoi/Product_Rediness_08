// §KITCHEN-WORKTOP-OVER-UNDERCOUNTER (2026-06-15) — worktop continuity test.
//
// Founder defect: in a generated kitchen run the countertop BROKE at the washing
// machine — the sink and hob bays had a worktop but the washing-machine bay had
// NO worktop over it (a gap in the run). A washing machine (like a dishwasher /
// under-counter oven) is an UNDER-COUNTER unit the worktop runs ACROSS the top of;
// only a SINK (basin cutout) or a TALL / free-standing unit (full-height fridge)
// interrupts the slab.
//
// These tests pin the fix by inspecting the world-space X-coverage of the
// 'KitchenCountertop' meshes along a straight (main-arm) run: the worktop must be
// continuous over a washing-machine bay, must keep a basin gap over a sink bay,
// and must still be ABSENT over a tall fridge bay.

import * as THREE from '@pryzm/renderer-three/three';
import { describe, expect, it } from 'vitest';
import { KitchenCabinetEngine } from '../src/engines/KitchenCabinetEngine';
import type { KitchenApplianceType, KitchenCabinetConfig } from '../src/KitchenTypes';

const UNIT_W = 0.60;
const NUM_UNITS = 4;
const RUN_LEN = UNIT_W * NUM_UNITS;

/** Build a straight 4-unit run where unit `i` carries `appliance`. */
function buildRun(applianceAt: Record<number, KitchenApplianceType>): THREE.Group {
    const config: KitchenCabinetConfig = {
        layoutType: 'kitchen_straight',
        depth: 0.60,
        length: RUN_LEN,
        height: 0.90,
        numUnits: NUM_UNITS,
        units: Array.from({ length: NUM_UNITS }, (_, i) => ({
            index: i,
            arm: 'main' as const,
            front: 'door' as const,
            ...(applianceAt[i] ? { appliance: applianceAt[i]! } : {}),
        })),
    };
    const g = new KitchenCabinetEngine().create(config);
    g.updateMatrixWorld(true);
    return g;
}

/** World-space AABBs of the countertop meshes. */
function countertopBoxes(group: THREE.Group): THREE.Box3[] {
    const boxes: THREE.Box3[] = [];
    group.traverse(o => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        if (!m.userData.isKitchenCountertop) return;
        m.geometry.computeBoundingBox();
        const b = m.geometry.boundingBox!.clone();
        b.applyMatrix4(m.matrixWorld);
        boxes.push(b);
    });
    return boxes;
}

/** Is the run X-interval [x0,x1] fully covered (within `eps`) by the union of the
 *  countertop boxes? Samples the interval densely. */
function intervalCovered(boxes: THREE.Box3[], x0: number, x1: number, eps = 0.01): boolean {
    const STEP = 0.02;
    for (let x = x0 + eps; x <= x1 - eps; x += STEP) {
        const hit = boxes.some(b => x >= b.min.x - 1e-6 && x <= b.max.x + 1e-6);
        if (!hit) return false;
    }
    return true;
}

/** The run is centred on the origin (engine offsets the group by -length/2 in X),
 *  so world-X of unit `i` spans [i*UNIT_W - RUN_LEN/2, (i+1)*UNIT_W - RUN_LEN/2]. */
function unitSpanX(i: number): [number, number] {
    return [i * UNIT_W - RUN_LEN / 2, (i + 1) * UNIT_W - RUN_LEN / 2];
}

describe('§KITCHEN-WORKTOP-OVER-UNDERCOUNTER — worktop runs continuously over under-counter appliances', () => {
    it('washing machine: worktop spans CONTINUOUSLY over the washing-machine bay (no gap in the run)', () => {
        // sink @0, hob @1, washing machine @2, plain @3.
        const boxes = countertopBoxes(buildRun({
            0: 'sink_inox', 1: 'hob', 2: 'washing_machine_white',
        }));
        const [wx0, wx1] = unitSpanX(2);
        expect(intervalCovered(boxes, wx0, wx1)).toBe(true);
    });

    it('hob bay keeps its worktop (regression guard — hob is cut INTO the slab, not omitted)', () => {
        const boxes = countertopBoxes(buildRun({
            0: 'sink_inox', 1: 'hob', 2: 'washing_machine_white',
        }));
        const [hx0, hx1] = unitSpanX(1);
        expect(intervalCovered(boxes, hx0, hx1)).toBe(true);
    });

    it('tall fridge bay stays worktop-FREE (a full-height unit gets no counter top)', () => {
        // fridge @3 is a tall/free-standing unit → no worktop over it.
        const boxes = countertopBoxes(buildRun({
            0: 'sink_inox', 1: 'hob', 2: 'washing_machine_white', 3: 'fridge_combi_silver',
        }));
        const [fx0, fx1] = unitSpanX(3);
        // Sample the central 80% of the fridge bay; it must NOT be covered.
        const mid = (fx0 + fx1) / 2;
        const hit = boxes.some(b => mid >= b.min.x - 1e-6 && mid <= b.max.x + 1e-6);
        expect(hit).toBe(false);
    });

    it('sink bay keeps a basin opening but worktop covers the cabinet edges (not a full gap)', () => {
        const boxes = countertopBoxes(buildRun({
            0: 'sink_inox', 1: 'hob', 2: 'washing_machine_white',
        }));
        const [sx0, sx1] = unitSpanX(0);
        // The sink's left/right side strips are covered; the basin centre is open.
        const leftEdge = sx0 + 0.02;
        const coveredAtEdge = boxes.some(b => leftEdge >= b.min.x - 1e-6 && leftEdge <= b.max.x + 1e-6);
        expect(coveredAtEdge).toBe(true);
    });
});
