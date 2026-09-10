/**
 * ADR-0385 §4 — THE CONTENTS JOIN (lane BLOCK-CONTAINMENT, 2026-09-10).
 *
 * Before this, every element on a storey N blocks share resolved `unknown` — N
 * correct `IfcBuilding` containers with nothing inside them, the gap ADR-0385 §4
 * named before it was built. These arms measure the ONE resolver's new branch:
 * envelope geometry selects AMONG the buildings `hierarchyStore` already says
 * claim the storey, and anything it cannot place stays `unknown` with the reason
 * named (§CONTEXT-DATA-HONESTY, L-581 / L-616).
 *
 * ⛔ The seam is asserted against `resolveElementBuilding` with a substrate built
 * by the production `readBuildingSubstrate(store, envelopes)` — never by importing
 * a helper and calling it — so a scramble of the ring test reddens every routing
 * arm here (L-586). The exporter-side proof, on real STEP text, is
 * `packages/file-format/__tests__/` (see the lane's issue-log rows for status).
 */

import { describe, it, expect } from 'vitest';
import {
    readBuildingSubstrate,
    resolveLevelBuilding,
    resolveElementBuilding,
} from './BuildingResolver.js';
import { HierarchyStore } from './HierarchyStore.js';
import { projectedBuildingId } from './MassingGroupProjection.js';

const node = (over: Record<string, unknown>) => ({
    plannedData: { customProperties: {} },
    syncState: 'no-template',
    metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'spec', version: 1 },
    ...over,
}) as never;

/** A 6 × 6 m square at (x0, 0), OPEN, in the shape the envelope store holds. */
const square = (x0: number) => [
    { x: x0, y: 0, z: 0 }, { x: x0 + 6, y: 0, z: 0 }, { x: x0 + 6, y: 0, z: 6 }, { x: x0, y: 0, z: 6 },
];

describe('ADR-0385 §4 — on a FANNED storey, envelope geometry selects among the store\'s candidates', () => {
    const bA = projectedBuildingId('g-a');
    const bB = projectedBuildingId('g-b');
    const store = new HierarchyStore();
    store.add(node({ id: bA, type: 'building', name: 'Block A', siteId: 's' }));
    store.add(node({ id: bB, type: 'building', name: 'Block B', siteId: 's' }));
    // L1 is FANNED (both blocks); L2 has ONE owner (Block A only).
    store.add(node({ id: 'hA1', type: 'level', name: 'A/L1', buildingId: bA, bimLevelId: 'L1' }));
    store.add(node({ id: 'hB1', type: 'level', name: 'B/L1', buildingId: bB, bimLevelId: 'L1' }));
    store.add(node({ id: 'hA2', type: 'level', name: 'A/L2', buildingId: bA, bimLevelId: 'L2' }));

    const envelopes: unknown[] = [
        { id: 'eA', levelId: 'L1', role: 'level', group: { id: 'g-a', label: 'Block A' }, footprint: square(0) },
        { id: 'eB', levelId: 'L1', role: 'level', group: { id: 'g-b', label: 'Block B' }, footprint: square(20) },
        // An UNGROUPED level envelope: maps to the default building, selects nothing.
        { id: 'eU', levelId: 'L1', role: 'level', group: null, footprint: square(40) },
        // A ROOM envelope of Block A drawn over Block B's ground: a room is not a
        // storey and must NOT count as Block A's territory.
        { id: 'eR', levelId: 'L1', role: 'room', group: { id: 'g-a', label: 'Block A' }, footprint: square(20) },
        // Block B's envelope on L2, where the store says only Block A owns the storey.
        { id: 'eB2', levelId: 'L2', role: 'level', group: { id: 'g-b', label: 'Block B' }, footprint: square(20) },
    ];
    const sub = readBuildingSubstrate(store, envelopes);

    it('the substrate carries the grouped LEVEL envelopes only, keyed by the projected building id', () => {
        expect(sub.envelopes?.map((e) => e.id).sort()).toEqual(['eA', 'eB', 'eB2']);
        expect(sub.envelopes?.find((e) => e.id === 'eB')?.buildingId).toBe(bB);
        expect(sub.envelopeNote).toContain('3 grouped level envelope(s)');
    });

    it('the LEVEL alone is still unknown — the storey fans and the store cannot say', () => {
        expect(resolveLevelBuilding('L1', sub).kind).toBe('unknown');
    });

    it('⭐⭐ a wall standing in Block B\'s envelope is CARRIED into Block B, naming the envelope', () => {
        const r = resolveElementBuilding('wall_b', 'L1', sub, { x: 23, z: 3 });
        expect(r.kind).toBe('carried');
        expect(r.buildingId).toBe(bB);
        expect(r.name).toBe('Block B');
        expect(r.envelopeId).toBe('eB');
        expect(r.why).toContain('wall_b');
        expect(r.why).toContain('"eB"');
    });

    it('a wall ON Block A\'s far edge resolves to A — the tolerance band closes the half-open ring', () => {
        // pointInPolygonXZ is half-open: (3, 6) on the z = 6 edge reads OUTSIDE. A
        // perimeter wall whose centreline sits on the footprint must still be its
        // block's, so the band picks it up. The point touches ONE ring only.
        const r = resolveElementBuilding('wall_edge', 'L1', sub, { x: 3, z: 6 });
        expect(r.kind).toBe('carried');
        expect(r.buildingId).toBe(bA);
    });

    it('⛔ standing in NO grouped envelope is unknown, and says NONE', () => {
        const r = resolveElementBuilding('wall_street', 'L1', sub, { x: 12, z: 3 });
        expect(r.kind).toBe('unknown');
        expect(r.buildingId).toBeNull();
        expect(r.why).toContain('NONE');
        expect(r.candidateBuildingIds?.slice().sort()).toEqual([bA, bB].sort());
    });

    it('⛔ an UNGROUPED envelope selects nothing — the element inside it is unknown, not "default"', () => {
        const r = resolveElementBuilding('wall_u', 'L1', sub, { x: 43, z: 3 });
        expect(r.kind).toBe('unknown');
        expect(r.why).toContain('NONE');
    });

    it('⛔ no plan position ⇒ unknown, naming the missing position — never a guess', () => {
        for (const at of [undefined, null, { x: Number.NaN, z: 0 }]) {
            const r = resolveElementBuilding('wall_nowhere', 'L1', sub, at);
            expect(r.kind).toBe('unknown');
            expect(r.why).toContain('no plan position');
        }
    });

    it('⛔ envelope geometry NOT SUPPLIED ⇒ unknown naming that; UNREADABLE ⇒ unknown naming THAT', () => {
        // §CONTEXT-DATA-HONESTY: three different facts, three different reasons,
        // and none of them reads as "the element stands in no envelope".
        const none = resolveElementBuilding('w', 'L1', readBuildingSubstrate(store), { x: 23, z: 3 });
        expect(none.kind).toBe('unknown');
        expect(none.why).toContain('no envelope geometry was supplied');
        expect(none.why).not.toContain('NONE');

        const broken = resolveElementBuilding('w', 'L1', readBuildingSubstrate(store, null), { x: 23, z: 3 });
        expect(broken.kind).toBe('unknown');
        expect(broken.why).toContain('could not be read');
        expect(broken.why).not.toContain('NONE');
    });

    it('⛔ OVERLAPPING envelopes of two blocks ⇒ unknown naming both — a party wall belongs to neither alone', () => {
        const overlapping = readBuildingSubstrate(store, [
            { id: 'eA', levelId: 'L1', role: 'level', group: { id: 'g-a', label: 'Block A' }, footprint: square(0) },
            { id: 'eB', levelId: 'L1', role: 'level', group: { id: 'g-b', label: 'Block B' }, footprint: square(3) },
        ]);
        const r = resolveElementBuilding('party_wall', 'L1', overlapping, { x: 4.5, z: 3 });
        expect(r.kind).toBe('unknown');
        expect(r.why).toContain('overlapping');
        expect(r.why).toContain(bA);
        expect(r.why).toContain(bB);
    });

    it('⛔ a storey with ONE owner never consults geometry — the store is the authority', () => {
        // L2 is Block A's alone per hierarchyStore; Block B has an envelope drawn there.
        // The store answers, and the point is not evidence against the authority.
        const r = resolveElementBuilding('wall_l2', 'L2', sub, { x: 23, z: 3 });
        expect(r.kind).toBe('carried');
        expect(r.buildingId).toBe(bA);
        expect(r.envelopeId).toBeUndefined();
    });

    it('⛔ an envelope keyed to a building the store does NOT hold selects nothing', () => {
        // The projection minted no BuildingData for g-z; an envelope cannot add one.
        const ghost = readBuildingSubstrate(store, [
            { id: 'eZ', levelId: 'L1', role: 'level', group: { id: 'g-z', label: 'Ghost' }, footprint: square(20) },
        ]);
        const r = resolveElementBuilding('wall_ghost', 'L1', ghost, { x: 23, z: 3 });
        expect(r.kind).toBe('unknown');
        expect(r.why).toContain('NONE');
    });

    it('⛔ THE INVARIANT survives the new branches: buildingId is null iff kind is unknown', () => {
        const probes: [string, { x: number; z: number } | null][] = [
            ['L1', { x: 23, z: 3 }], ['L1', { x: 12, z: 3 }], ['L1', null], ['L2', { x: 23, z: 3 }],
        ];
        for (const [levelId, at] of probes) {
            const r = resolveElementBuilding('probe', levelId, sub, at);
            expect(r.buildingId === null).toBe(r.kind === 'unknown');
            expect(r.name === null).toBe(r.kind === 'unknown');
            expect(r.why.length).toBeGreaterThan(0);
        }
    });
});
