// GR-06 / GR-08 — proof for the single-owner SemanticGraph pre-graph rebuild.
//
// Closes the exact defect EV-04 §3 names: a project loaded from a pre-graph
// snapshot "permanently loses all `sitsOn` level-hosting topology". The rebuild
// reconstructs `sitsOn` (and `connectedTo` / `supports` / `connectedByStair`)
// FROM AUTHORITATIVE ELEMENT STATE — never from a persisted graph slice — and
// names the families it cannot reconstruct (C70 I-INV-3), instead of dropping
// them silently.
//
// ── G-1 (BIM30 Phase 0D): the fixture is SCHEMA-PARSED, not hand-shaped ──────
// The original fixture here hand-wrote rooms as
// `{ boundary: { boundingWallIds: [...] } }` — the WRONG nesting. The real room
// record carries `boundingWallIds` as a TOP-LEVEL sibling of `boundary`
// (RoomDataAddSchema / RoomTypes.RoomData, both since the initial commit), and
// both ProjectSerializers persist `roomStore.getAll()` verbatim. Because the
// rebuild code carried the SAME wrong nesting, test and code agreed with each
// other while both disagreed with every real snapshot: `boundedBy`,
// `adjacentTo` and `connectedTo` yielded ZERO edges on every load, unreported —
// the C70 I-INV-3 silent-loss defect — and this test certified itself green.
//
// The structural fix: room fixtures are now built through
// `RoomDataAddSchema.parse()` (the exact gate RoomStore.add() applies) and then
// JSON-round-tripped, so the fixture is byte-shaped like a persisted snapshot
// and CANNOT drift from the schema again.

import { beforeEach, describe, expect, it } from 'vitest';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { RoomDataAddSchema } from '@pryzm/room-topology';
import { rebuildSemanticGraphFromSnapshot } from '../src/loader/rebuildSemanticGraph';

// Room ids must be UUIDs to pass the add-gate (the schema demands it — another
// drift the old hand-shaped fixture hid).
const R1 = '11111111-1111-4111-8111-111111111111';
const R2 = '22222222-2222-4222-8222-222222222222';

/**
 * Build a room record through the REAL add-gate schema, then JSON-round-trip it
 * — the same serialize shape both ProjectSerializers emit (deepStrip preserves
 * keys 1:1; JSON is what lands in the snapshot). If this object ever stops
 * matching the canonical RoomData shape, `.parse()` throws and the suite fails
 * loudly instead of self-certifying.
 */
function makeRoom(id: string, boundingWallIds: string[], unitId?: string) {
    const parsed = RoomDataAddSchema.parse({
        id,
        type: 'room',
        levelId: 'L1',
        name: `Room ${id.slice(0, 4)}`,
        roomNumber: '001',
        ...(unitId ? { unitId } : {}),
        boundary: {
            polygon: [
                { x: 0, z: 0 },
                { x: 4, z: 0 },
                { x: 4, z: 4 },
                { x: 0, z: 4 },
            ],
            height: 2.7,
            baseOffset: 0,
            detectionMethod: 'auto-topology',
        },
        boundingWallIds,
        boundingSlabIds: [],
        boundingColumnIds: [],
        occupancyType: 'bedroom',
        finishes: {},
        computed: {
            area: 16,
            grossArea: 16,
            perimeter: 16,
            volume: 43.2,
            centroid: { x: 2, z: 2 },
            boundingBox: { minX: 0, minZ: 0, maxX: 4, maxZ: 4 },
        },
        properties: {},
        metadata: {
            createdAt: 1_700_000_000_000,
            modifiedAt: 1_700_000_000_000,
            createdBy: 'test',
            version: 1,
        },
    });
    return JSON.parse(JSON.stringify(parsed));
}

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
            makeRoom(R1, ['W1', 'W2'], 'U1'),
            makeRoom(R2, ['W1']),
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

    it('reconstructs boundedBy from TOP-LEVEL room.boundingWallIds with exact edge counts (G-1)', () => {
        rebuildSemanticGraphFromSnapshot(makePreGraphSnapshot());
        // R1 is bounded by W1 + W2; R2 by W1 — exactly three boundedBy edges.
        expect(semanticGraphManager.getTargets(R1, 'boundedBy').sort()).toEqual(['W1', 'W2']);
        expect(semanticGraphManager.getTargets(R2, 'boundedBy')).toEqual(['W1']);
    });

    it('reconstructs connectedTo only across a shared DOOR wall', () => {
        rebuildSemanticGraphFromSnapshot(makePreGraphSnapshot());
        // R1 & R2 share W1 which carries a door → connectedTo, both directions.
        expect(semanticGraphManager.getTargets(R1, 'connectedTo')).toEqual([R2]);
        expect(semanticGraphManager.getTargets(R2, 'connectedTo')).toEqual([R1]);
        // They are also adjacentTo (shared wall), both directions.
        expect(semanticGraphManager.getTargets(R1, 'adjacentTo')).toEqual([R2]);
        expect(semanticGraphManager.getTargets(R2, 'adjacentTo')).toEqual([R1]);
    });

    it('yields ZERO room edges for the historical-fiction nested shape (no fallback — it never persisted)', () => {
        // The OLD code and the OLD fixture both used `boundary.boundingWallIds`.
        // git history proves no serializer EVER wrote that nesting, so the
        // rebuild deliberately reads only the real top-level field. A snapshot
        // hand-shaped the old wrong way must produce no room edges — this pins
        // the no-fallback decision and makes the old self-certification
        // impossible to reintroduce silently.
        rebuildSemanticGraphFromSnapshot({
            walls: [{ id: 'W1', levelId: 'L1', openings: [{ id: 'O1', elementId: 'D1', type: 'door' }] }],
            rooms: [
                { id: R1, boundary: { boundingWallIds: ['W1'] } },
                { id: R2, boundary: { boundingWallIds: ['W1'] } },
            ],
        });
        expect(semanticGraphManager.getTargets(R1, 'boundedBy')).toEqual([]);
        expect(semanticGraphManager.getTargets(R1, 'adjacentTo')).toEqual([]);
        expect(semanticGraphManager.getTargets(R1, 'connectedTo')).toEqual([]);
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
        expect(semanticGraphManager.getTargets(R1, 'boundedBy')).toContain('W1');
        expect(semanticGraphManager.getTargets(R1, 'partOf')).toContain('U1');
    });

    it('names the families it CANNOT reconstruct instead of dropping them silently (C70 I-INV-3)', () => {
        const { unreconstructable } = rebuildSemanticGraphFromSnapshot(makePreGraphSnapshot());
        // lifts are not serialized at all → connectedByLift cannot be rebuilt.
        expect(unreconstructable).toContain('connectedByLift');
        // §CONTAINS-FIRST-PARTY-WRITER — `contains` USED to be named here, on the
        // accurate-at-the-time grounds that it had no first-party writer
        // (IFC-only, and even that arm was dead), so a pre-graph snapshot held
        // nothing to rebuild FROM. It now rebuilds from the persisted
        // `furniture.hostedSpaceId`, so keeping it on the loss list would be a
        // stale claim — the very thing C70 I-INV-3 exists to prevent in the
        // other direction. This assertion is the guard against it coming back.
        expect(unreconstructable).not.toContain('contains');
        // §GR07-MEASUREDAT-NAMED — the physics measurement lives in the edge's
        // own metadata against a node that is not an element and appears in NO
        // snapshot slice, so the rebuild genuinely cannot reconstruct it. Before
        // this it was neither regenerated NOR named: a snapshot lacking it loaded
        // silently, which is the exact C70 I-INV-3 breach.
        expect(unreconstructable).toContain('measuredAt');
        // §GR07-DECIDEDBY-REBUILD — the mirror-image assertion. `decidedBy` must
        // NOT be named, because the loss was never real: `decisionRecords` is
        // persisted and every record carries `elementId`. Naming a family lost
        // while its authoritative source rides in the same snapshot is the stale
        // claim in the direction that costs a user their audit trail.
        expect(unreconstructable).not.toContain('decidedBy');
    });

    it('§GR07-DECIDEDBY-REBUILD — rebuilds `decidedBy` from persisted decisionRecords, and invents no edge for a record with no elementId', () => {
        const snap = makePreGraphSnapshot() as any;
        // The exact slice `decisionRecordStore.serialize()` emits into
        // ProjectSnapshot v4 (SerializedDecisionRecords: { version, records }).
        snap.decisionRecords = {
            version: 1,
            records: [
                { id: 'DR1', elementId: 'W1', decisionType: 'override', dismissed: false },
                { id: 'DR2', elementId: R1, decisionType: 'deviation', dismissed: true },
                // Malformed — no elementId. Must contribute NOTHING rather than
                // hang the rationale off an invented endpoint.
                { id: 'DR3', decisionType: 'preference', dismissed: false },
            ],
        };
        rebuildSemanticGraphFromSnapshot(snap);

        // Direction MIRRORS the live writer (IntentPrompt): element → record.id.
        expect(semanticGraphManager.getTargets('W1', 'decidedBy')).toEqual(['DR1']);
        expect(semanticGraphManager.getTargets(R1, 'decidedBy')).toEqual(['DR2']);
        // A dismissed record still earns its edge — the record is kept for audit
        // and the graph must agree with the store, not editorialise about it.
        expect(semanticGraphManager.getRelationships('DR3', 'decidedBy')).toEqual([]);
    });

    it('§GR07-DECIDEDBY-REBUILD — a snapshot with NO decisionRecords slice writes no decidedBy edges and does not throw', () => {
        // Every pre-v4 snapshot, and every v4 project where nobody recorded a
        // rationale. Absence must read as "no edges", never as a crash and never
        // as an invented one.
        const { added } = rebuildSemanticGraphFromSnapshot(makePreGraphSnapshot());
        expect(added).toBe(22);
        expect(semanticGraphManager.getTargets('W1', 'decidedBy')).toEqual([]);
    });

    it('§CONTAINS-FIRST-PARTY-WRITER — rebuilds `contains` from the persisted hostedSpaceId, and writes NO edge for an item that has none', () => {
        const snap = makePreGraphSnapshot();
        // One item bound to a room (the D-FLE furnish engine stamps this), one
        // hand-placed item with no room resolved.
        (snap as any).furniture = [
            { id: 'F1', levelId: 'L1', hostedSpaceId: R1 },
            { id: 'F2', levelId: 'L1' },
        ];
        rebuildSemanticGraphFromSnapshot(snap);

        // Exactly the query HierarchyTreePanel and WorldModelAdapter run.
        expect(semanticGraphManager.getTargets(R1, 'contains')).toEqual(['F1']);
        // An item with no hostedSpaceId gets no invented containment.
        expect(semanticGraphManager.getRelationships('F2', 'contains')).toEqual([]);
        // Both still sit on their level — the two families are independent.
        expect(semanticGraphManager.getTargets('F1', 'sitsOn')).toContain('L1');
        expect(semanticGraphManager.getTargets('F2', 'sitsOn')).toContain('L1');
    });

    it('is deterministic: two runs over the same snapshot yield the same edge count', () => {
        const first = rebuildSemanticGraphFromSnapshot(makePreGraphSnapshot());
        semanticGraphManager.clear();
        const second = rebuildSemanticGraphFromSnapshot(makePreGraphSnapshot());
        expect(second.added).toBe(first.added);
        // Executed count: 2 hosts/hostedBy + 3 boundedBy + 2 adjacentTo +
        // 2 connectedTo + 1 partOf + 7 sitsOn (SITS_ON_KINDS incl. beam B1... )
        // — pinned exactly so a silent family loss moves this number.
        // hosts(1)+hostedBy(1)+boundedBy(3)+adjacentTo(2)+connectedTo(2)+partOf(1)
        // +sitsOn kinds(S1,C1,RF1,F1,H1,P1,LT1,B1 = 8)+stair sitsOn(1)+supports(1)
        // +connectedByStair(2) = 22
        expect(first.added).toBe(22);
    });
});
