/**
 * §BIM-FROM-THE-DESIGN — DELIVERABLE 2: the envelope → wall link, and the ONE property that
 * decides whether it is worth recording at all.
 *
 * Founder: *"THE ENVELOPE BEING EXTENDED ON PRYZM 3D VIEW SHOULD MEAN THE CONTEXT WALLS —
 * PERIMETER WALLS SHALL FOLLOW AND THE INTERIOR PARTITIONS TOO."*
 *
 * ⭐ THE TEST THAT CARRIES THIS FILE IS THE SAVE/RELOAD ROUND TRIP, and it is run against the REAL
 * `SemanticGraphManager` — not a fake — because the whole reason the link does not live on the
 * wall is that nothing on a wall survives a reload: `Wall.ts` has no `derivedFrom`, `provenance`
 * is not serialised for walls at all, and `metadata`/`properties` ARE serialised and NEVER
 * restored. A link that works only in the session that authored it is worse than no link: the
 * cascade would fire for the founder while he was drawing and go quiet the next morning, and
 * nothing in the model would say why.
 *
 * ⚠ The second load-bearing test is the INVALIDATION HAZARD. `boundedBy` is a region-derived
 * family that a future cascade could purge by calling
 * `invalidateRegionConclusionsForMovedElement(envelopeId)`. `contains` is id-keyed and survives.
 * The pair is written for that reason, and this file pins it — otherwise a later lane deletes the
 * "redundant" second edge and the link quietly stops surviving the very gesture it exists for.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SemanticGraphManager } from '@pryzm/core-app-model';
import {
    pairWallLinkRows,
    recordEnvelopeWallLinks,
    readWallsDerivedFromEnvelope,
    DESIGN_ENVELOPE_LINK_TAG,
    type EnvelopeWallLinkGraph,
    type WallLinkRow,
} from '../designEnvelopeWallLink';
import { planBuildFromDesign, type DesignEnvelopeDatum, type DesignVertex } from '../buildFromDesignPlan';

const rect = (x0: number, z0: number, x1: number, z1: number): DesignVertex[] =>
    [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];

const env = (over: Partial<DesignEnvelopeDatum> & { id: string }): DesignEnvelopeDatum => ({
    levelId: 'L0', name: null, role: 'room', withinId: null, baseOffset: 0, height: 3,
    footprint: [], footprintAreaM2: 0, occupancy: null, ...over,
});

const GROUND = env({
    id: 'E-ground', role: 'level', name: 'Ground envelope',
    footprint: rect(0, 0, 15, 12.682), footprintAreaM2: 190.23,
});
const KITCHEN = env({
    id: 'R-kitchen', role: 'room', name: 'Kitchen', withinId: 'E-ground',
    footprint: rect(1, 1, 5, 4.2), footprintAreaM2: 12.8,
});
const DINING = env({
    id: 'R-dining', role: 'room', name: 'Dining', withinId: 'E-ground',
    footprint: rect(5, 1, 9, 4.2), footprintAreaM2: 12.8,
});

/** The real plan, so the rows under test are the rows the executor actually pairs. */
function planned() {
    const out = planBuildFromDesign({
        envelopes: [GROUND, KITCHEN, DINING],
        activeLevelId: 'L0',
        authoredWallCountOnActiveLevel: 0,
    });
    if (!out.ok) throw new Error(`expected a plan, got ${out.refusal.code}`);
    return out.plan;
}

let graph: SemanticGraphManager;
const asLinkGraph = (g: SemanticGraphManager): EnvelopeWallLinkGraph =>
    g as unknown as EnvelopeWallLinkGraph;

beforeEach(() => { graph = new SemanticGraphManager(); });

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('pairWallLinkRows — index-for-index, and a mismatch is a REFUSAL', () => {
    it('pairs each minted id with the plan row that produced it', () => {
        const plan = planned();
        const ids = plan.walls.map((_, i) => `WA-${i}`);
        const out = pairWallLinkRows(plan.walls, ids);
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(out.rows).toHaveLength(plan.walls.length);
        expect(out.rows[0]!.wallId).toBe('WA-0');
        expect(out.rows[0]!.derivedFrom).toEqual(plan.walls[0]!.derivedFrom);
    });

    it('⛔ a length mismatch REFUSES rather than zipping the shorter array', () => {
        const plan = planned();
        const out = pairWallLinkRows(plan.walls, ['WA-0', 'WA-1']);
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toContain(`${plan.walls.length} walls`);
        expect(out.reason).toContain('2 ids were minted');
        expect(out.reason).toContain('move the wrong wall');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('recordEnvelopeWallLinks — TWO edges per claim, and the face index is on the edge', () => {
    it('⭐ writes wall —boundedBy→ envelope AND envelope —contains→ wall', () => {
        const plan = planned();
        const ids = plan.walls.map((_, i) => `WA-${i}`);
        const paired = pairWallLinkRows(plan.walls, ids);
        if (!paired.ok) throw new Error(paired.reason);

        const report = recordEnvelopeWallLinks(asLinkGraph(graph), paired.rows);
        expect(report.wallsLinked).toBe(plan.walls.length);
        expect(report.unlinked).toEqual([]);

        // The shell walls point at the plate; both directions resolve.
        expect(graph.getTargets('WA-0', 'boundedBy')).toContain('E-ground');
        expect(graph.getTargets('E-ground', 'contains')).toContain('WA-0');
    });

    it('⭐ FACE IDENTITY is carried in the edge payload — `metadata.edgeIndex`, an integer', () => {
        const plan = planned();
        const ids = plan.walls.map((_, i) => `WA-${i}`);
        const paired = pairWallLinkRows(plan.walls, ids);
        if (!paired.ok) throw new Error(paired.reason);
        recordEnvelopeWallLinks(asLinkGraph(graph), paired.rows);

        const shell = readWallsDerivedFromEnvelope(asLinkGraph(graph), 'E-ground')!;
        expect(shell.map((r) => r.edgeIndex)).toEqual([0, 1, 2, 3]);   // one per plate edge
        expect(shell.every((r) => r.envelopeRole === 'level')).toBe(true);
        expect(shell.every((r) => r.wallKind === 'shell')).toBe(true);
        expect(shell.every((r) => r.ringWelded === false)).toBe(true);
    });

    it('every edge is TAGGED, so a design link is never confused with a room-detection boundedBy', () => {
        const plan = planned();
        const paired = pairWallLinkRows(plan.walls, plan.walls.map((_, i) => `WA-${i}`));
        if (!paired.ok) throw new Error(paired.reason);
        recordEnvelopeWallLinks(asLinkGraph(graph), paired.rows);

        // A room-detection edge, written the ordinary way, with no tag.
        graph.addRelationship({ type: 'boundedBy', sourceId: 'ROOM-1', targetId: 'E-ground', createdBy: 'detection' });
        const rows = readWallsDerivedFromEnvelope(asLinkGraph(graph), 'E-ground')!;
        expect(rows.map((r) => r.wallId)).not.toContain('ROOM-1');
        expect(graph.getAll().filter((r) => r.metadata?.pryzmLink === DESIGN_ENVELOPE_LINK_TAG).length)
            .toBeGreaterThan(0);
    });

    it('a shared boundary records BOTH rooms\' claims on the ONE wall', () => {
        const plan = planned();
        const paired = pairWallLinkRows(plan.walls, plan.walls.map((_, i) => `WA-${i}`));
        if (!paired.ok) throw new Error(paired.reason);
        recordEnvelopeWallLinks(asLinkGraph(graph), paired.rows);

        const sharedIdx = plan.walls.findIndex((w) => w.kind === 'partition' && w.alsoBounds.length === 1);
        expect(sharedIdx, 'the fixture must contain the shared kitchen/dining boundary').toBeGreaterThanOrEqual(0);
        const wallId = `WA-${sharedIdx}`;
        // ONE wall, TWO envelopes — both rooms' claims on the same boundary are recorded.
        expect(graph.getTargets(wallId, 'boundedBy').sort()).toEqual(['R-dining', 'R-kitchen']);

        // ⭐ WHICH room owns the PRIMARY claim is deterministic — the rooms are walked by id, so
        // "R-dining" < "R-kitchen" and dining owns it. Pinned because a cascade reading the
        // primary claim must not get a different answer on a different store iteration order.
        const dining = readWallsDerivedFromEnvelope(asLinkGraph(graph), 'R-dining')!
            .find((r) => r.wallId === wallId)!;
        const kitchen = readWallsDerivedFromEnvelope(asLinkGraph(graph), 'R-kitchen')!
            .find((r) => r.wallId === wallId)!;
        expect(dining.claim).toBe('primary');
        expect(kitchen.claim).toBe('also');
    });

    it('⛔ a wall whose provenance could not be recovered is NAMED in `unlinked`, never counted away', () => {
        const rows: WallLinkRow[] = [{
            wallId: 'WA-ghost',
            kind: 'partition',
            derivedFrom: { envelopeId: '', envelopeRole: 'room', edgeIndex: -1, ringWelded: true },
            alsoBounds: [],
        }];
        const report = recordEnvelopeWallLinks(asLinkGraph(graph), rows);
        expect(report.wallsLinked).toBe(0);
        expect(report.unlinked).toHaveLength(1);
        expect(report.unlinked[0]!.wallId).toBe('WA-ghost');
        expect(report.unlinked[0]!.reason).toContain('will NOT follow the envelope');
    });

    it('never throws when the graph refuses an edge — the walls are real either way', () => {
        const hostile: EnvelopeWallLinkGraph = {
            addRelationship: () => { throw new Error('graph is closed'); },
            getSources: () => [], getTargets: () => [], getAll: () => [],
        };
        const rows: WallLinkRow[] = [{
            wallId: 'WA-1', kind: 'shell',
            derivedFrom: { envelopeId: 'E-ground', envelopeRole: 'level', edgeIndex: 0, ringWelded: false },
            alsoBounds: [],
        }];
        const report = recordEnvelopeWallLinks(hostile, rows);
        expect(report.wallsLinked).toBe(0);
        expect(report.unlinked[0]!.reason).toContain('graph is closed');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('⭐ THE LINK SURVIVES SAVE → RELOAD — the reason it is not on the wall', () => {
    it('serialize → JSON → a FRESH graph → deserialize returns the same walls and the same faces', () => {
        const plan = planned();
        const ids = plan.walls.map((_, i) => `WA-${i}`);
        const paired = pairWallLinkRows(plan.walls, ids);
        if (!paired.ok) throw new Error(paired.reason);
        recordEnvelopeWallLinks(asLinkGraph(graph), paired.rows);
        const before = readWallsDerivedFromEnvelope(asLinkGraph(graph), 'E-ground')!;
        expect(before.length).toBe(4);

        // Exactly what ProjectSerializer.ts:1868 writes and ProjectLoader.ts:2575 reads back,
        // through a real JSON round trip so a non-serialisable field could not survive by accident.
        const slice = JSON.parse(JSON.stringify(graph.serialize())) as ReturnType<typeof graph.serialize>;
        const reloaded = new SemanticGraphManager();
        const report = reloaded.deserialize(slice);
        expect(report.absent).toBeNull();
        expect(report.dropped).toEqual([]);
        expect(report.loaded).toBe(report.presented);

        const after = readWallsDerivedFromEnvelope(asLinkGraph(reloaded), 'E-ground')!;
        expect(after).toEqual(before);                       // ⭐ the face index included
        expect(reloaded.getTargets('E-ground', 'contains')).toEqual(
            expect.arrayContaining(graph.getTargets('E-ground', 'contains')));
    });

    it('the partition links survive too, so the INTERIOR walls can follow their room', () => {
        const plan = planned();
        const paired = pairWallLinkRows(plan.walls, plan.walls.map((_, i) => `WA-${i}`));
        if (!paired.ok) throw new Error(paired.reason);
        recordEnvelopeWallLinks(asLinkGraph(graph), paired.rows);
        const before = readWallsDerivedFromEnvelope(asLinkGraph(graph), 'R-kitchen')!;
        expect(before.length).toBeGreaterThan(0);

        const reloaded = new SemanticGraphManager();
        reloaded.deserialize(JSON.parse(JSON.stringify(graph.serialize())));
        expect(readWallsDerivedFromEnvelope(asLinkGraph(reloaded), 'R-kitchen')).toEqual(before);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('readWallsDerivedFromEnvelope — null is not empty, and a stale row is not a wall', () => {
    it('⛔ an unreadable graph is NULL — "0 walls follow this face" must not be said about a building full of them', () => {
        expect(readWallsDerivedFromEnvelope(null, 'E-ground')).toBeNull();
        expect(readWallsDerivedFromEnvelope(undefined, 'E-ground')).toBeNull();
        expect(readWallsDerivedFromEnvelope({ getAll: () => { throw new Error('boom'); } } as unknown as EnvelopeWallLinkGraph, 'E-ground')).toBeNull();
    });

    it('an envelope that produced no walls answers [] — a different value from "cannot read"', () => {
        expect(readWallsDerivedFromEnvelope(asLinkGraph(graph), 'E-never-drawn')).toEqual([]);
    });

    it('⚠ A ROW IS NOT PROOF OF A WALL — undoing the wall batch leaves the rows behind', () => {
        // `WallRebuildCoordinator` calls `invalidateRegionConclusionsForDeletedElement(wallId)` on
        // removal, which purges edges the dead wall is the boundedBy TARGET of. Ours has the wall
        // as its SOURCE, so it survives — pinned here so the consumer contract stays honest rather
        // than being discovered by a cascade moving a wall that no longer exists.
        const plan = planned();
        const paired = pairWallLinkRows(plan.walls, plan.walls.map((_, i) => `WA-${i}`));
        if (!paired.ok) throw new Error(paired.reason);
        recordEnvelopeWallLinks(asLinkGraph(graph), paired.rows);

        graph.invalidateRegionConclusionsForDeletedElement('WA-0');
        const rows = readWallsDerivedFromEnvelope(asLinkGraph(graph), 'E-ground')!;
        expect(rows.map((r) => r.wallId)).toContain('WA-0');   // still there — check the store, not this
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('⚠ THE INVALIDATION HAZARD — why BOTH legs are written', () => {
    it('⛔ invalidating the ENVELOPE purges the boundedBy leg — and `contains` still answers', () => {
        const plan = planned();
        const paired = pairWallLinkRows(plan.walls, plan.walls.map((_, i) => `WA-${i}`));
        if (!paired.ok) throw new Error(paired.reason);
        recordEnvelopeWallLinks(asLinkGraph(graph), paired.rows);
        expect(readWallsDerivedFromEnvelope(asLinkGraph(graph), 'E-ground')!.length).toBe(4);

        // Exactly what a face-drag cascade would call if it treated the envelope as "the moved
        // element" — the call is legal, live, and would silently strip the primary leg.
        graph.invalidateRegionConclusionsForMovedElement('E-ground');

        expect(readWallsDerivedFromEnvelope(asLinkGraph(graph), 'E-ground')).toEqual([]);
        // ⭐ …and the id-keyed inverse leg is untouched, so which walls came out of this envelope
        // is still answerable. THIS is what the second edge buys; do not delete it as redundant.
        expect(graph.getTargets('E-ground', 'contains')).toEqual(
            expect.arrayContaining(['WA-0', 'WA-1', 'WA-2', 'WA-3']));
    });
});
