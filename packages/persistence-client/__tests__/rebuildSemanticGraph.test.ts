// GR-06 / GR-08 — proof for the single-owner SemanticGraph pre-graph rebuild.
//
// Closes the exact defect EV-04 §3 names: a project loaded from a pre-graph
// snapshot "permanently loses all `sitsOn` level-hosting topology". The rebuild
// reconstructs `sitsOn` (and `connectedTo` / `supports` / `connectedByStair`)
// FROM AUTHORITATIVE ELEMENT STATE — never from a persisted graph slice — and
// names the families it cannot reconstruct (C70 I-INV-3), instead of dropping
// them silently.

import { beforeEach, describe, expect, it } from 'vitest';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { rebuildSemanticGraphFromSnapshot } from '../src/loader/rebuildSemanticGraph';

// A minimal "pre-graph" snapshot: element arrays carry their authoritative
// fields (levelId, support refs, base/top level, door openings) but there is
// NO semanticGraph slice — exactly the shape that used to lose topology.
function makePreGraphSnapshot() {
    return {
        // Two rooms sharing wall W1, which carries a DOOR opening.
        walls: [
            {
                id: 'W1',
                levelId: 'L1',
                openings: [{ id: 'O1', elementId: 'D1', type: 'door' }],
            },
            { id: 'W2', levelId: 'L1', openings: [] },
        ],
        rooms: [
            { id: 'R1', boundary: { boundingWallIds: ['W1', 'W2'] }, unitId: 'U1' },
            { id: 'R2', boundary: { boundingWallIds: ['W1'] } },
        ],
        // Level-sited elements — each must gain a sitsOn edge to its level.
        slabs: [{ id: 'S1', levelId: 'L1' }],
        columns: [{ id: 'C1', levelId: 'L1' }],
        roofs: [{ id: 'RF1', levelId: 'L2' }],
        furniture: [{ id: 'F1', levelId: 'L1' }],
        handrails: [{ id: 'H1', levelId: 'L2' }],
        plumbing: [{ id: 'P1', levelId: 'L1' }],
        lighting: [{ id: 'LT1', levelId: 'L1' }],
        // Beam supported by column C1 at its start end.
        beams: [{ id: 'B1', levelId: 'L1', startSupportId: 'C1' }],
        // Stair from L1 (base) to L2 (top).
        stairs: [{ id: 'ST1', baseLevelId: 'L1', topLevelId: 'L2' }],
    };
}

describe('rebuildSemanticGraphFromSnapshot (GR-06 / GR-08)', () => {
    beforeEach(() => {
        semanticGraphManager.clear();
    });

    it('reconstructs sitsOn for EVERY element carrying a levelId (the EV-04 §3 defect, closed)', () => {
        const snapshot = makePreGraphSnapshot();
        expect(semanticGraphManager.size).toBe(0); // pre-graph: no edges yet

        rebuildSemanticGraphFromSnapshot(snapshot);

        // Every level-sited element now sits on its authoritative level.
        expect(semanticGraphManager.getTargets('S1', 'sitsOn')).toContain('L1');
        expect(semanticGraphManager.getTargets('C1', 'sitsOn')).toContain('L1');
        expect(semanticGraphManager.getTargets('RF1', 'sitsOn')).toContain('L2');
        expect(semanticGraphManager.getTargets('F1', 'sitsOn')).toContain('L1');
        expect(semanticGraphManager.getTargets('H1', 'sitsOn')).toContain('L2');
        expect(semanticGraphManager.getTargets('P1', 'sitsOn')).toContain('L1');
        expect(semanticGraphManager.getTargets('LT1', 'sitsOn')).toContain('L1');
        // Stair sits on its BASE level (mirrors CreateStairCommand).
        expect(semanticGraphManager.getTargets('ST1', 'sitsOn')).toContain('L1');
    });

    it('does NOT invent sitsOn for walls or hosted openings (only authoritative sitsOn kinds)', () => {
        rebuildSemanticGraphFromSnapshot(makePreGraphSnapshot());
        // No creation writer emits sitsOn for walls / doors → the rebuild must not either.
        expect(semanticGraphManager.getTargets('W1', 'sitsOn')).toEqual([]);
        expect(semanticGraphManager.getTargets('D1', 'sitsOn')).toEqual([]);
    });

    it('reconstructs connectedTo only across a shared DOOR wall', () => {
        rebuildSemanticGraphFromSnapshot(makePreGraphSnapshot());
        // R1 & R2 share W1 which carries a door → connectedTo, both directions.
        expect(semanticGraphManager.getTargets('R1', 'connectedTo')).toContain('R2');
        expect(semanticGraphManager.getTargets('R2', 'connectedTo')).toContain('R1');
        // They are also adjacentTo (shared wall).
        expect(semanticGraphManager.getTargets('R1', 'adjacentTo')).toContain('R2');
    });

    it('reconstructs supports from beam support refs, and connectedByStair from base/top levels', () => {
        rebuildSemanticGraphFromSnapshot(makePreGraphSnapshot());
        // Column C1 supports beam B1.
        expect(semanticGraphManager.getTargets('C1', 'supports')).toContain('B1');
        // Stair links L1 ↔ L2, both directions.
        expect(semanticGraphManager.getTargets('L1', 'connectedByStair')).toContain('L2');
        expect(semanticGraphManager.getTargets('L2', 'connectedByStair')).toContain('L1');
    });

    it('reconstructs hosts/hostedBy/boundedBy/partOf (the original 5-type slice is preserved)', () => {
        rebuildSemanticGraphFromSnapshot(makePreGraphSnapshot());
        expect(semanticGraphManager.getTargets('W1', 'hosts')).toContain('D1');
        expect(semanticGraphManager.getTargets('D1', 'hostedBy')).toContain('W1');
        expect(semanticGraphManager.getTargets('R1', 'boundedBy')).toContain('W1');
        expect(semanticGraphManager.getTargets('R1', 'partOf')).toContain('U1');
    });

    it('names the families it CANNOT reconstruct instead of dropping them silently (C70 I-INV-3)', () => {
        const { unreconstructable } = rebuildSemanticGraphFromSnapshot(makePreGraphSnapshot());
        // lifts are not serialized at all → connectedByLift cannot be rebuilt.
        expect(unreconstructable).toContain('connectedByLift');
        // contains has no first-party writer (IFC-only; a separate named gap).
        expect(unreconstructable).toContain('contains');
    });

    it('is deterministic: two runs over the same snapshot yield the same edge count', () => {
        const first = rebuildSemanticGraphFromSnapshot(makePreGraphSnapshot());
        semanticGraphManager.clear();
        const second = rebuildSemanticGraphFromSnapshot(makePreGraphSnapshot());
        expect(second.added).toBe(first.added);
    });
});
