/**
 * §REGION-LEVEL-SCOPE (L-1192) — "IT ONLY RECOGNISES THE BELOW LEVELS' ONES."
 *
 * ── THE FOUNDER'S REPORT ─────────────────────────────────────────────────────
 * Drawing a region slab on Level 3 (+9.000 m) of a four-storey project:
 *
 *     region traced: 0 host-referenced edge(s) across 0 wall(s), 17 free edge(s)
 *     (curved=0, no-wall-id=17, ambiguous=0)
 *     searched=[18 wall(s), 99 slab edge(s), 0 curtain-wall edge(s),
 *               parcel boundary present (17 edge(s))]
 *
 * `18 wall(s)` was the WHOLE PROJECT's wall count across all four storeys, and the
 * traced ring was 17 anonymous edges — exactly the parcel ring. The region search
 * had never been level-scoped (`window.wallStore.getAll()` since the initial
 * commit); what turned that latent defect into a broken workflow was
 * §FIX-REGION-BOUNDARY-SOURCES (`410013b0`) adding two MORE project-wide sources —
 * every slab outline and the parcel ring — to an unscoped 2-D graph.
 *
 * ── WHAT THESE TESTS PIN ─────────────────────────────────────────────────────
 * The whole stack, unstubbed: the real `assembleRegionBoundary` feeding the real
 * `traceRegionSketchAtPoint`. Nothing here is a fake tracer.
 *
 * ⭐ The load-bearing assertion is NOT "a ring came back" — it is WHICH STOREY'S
 * WALLS the ring is made of, read off `attribution.hostWallIds`, the very field
 * the founder's log line prints. A ring of the right SHAPE built from the wrong
 * storey's chords IS the defect, so every fixture below is built so that a
 * plausible wrong ring exists and the assertion can tell the two apart.
 *
 * ⚠ AN EARLIER DRAFT OF THIS FILE DID NOT REPRODUCE THE DEFECT. Its fixture put
 * the storey-below shell OUTSIDE the active storey's room, so "smallest enclosing
 * loop" chose correctly even unscoped and the fix looked proven by a test that
 * was green before it. Both fixtures below are therefore checked in their
 * UNSCOPED form too, and those checks assert the WRONG storey wins — that is what
 * makes these red without the fix rather than merely green with it.
 */
import { describe, it, expect } from 'vitest';
import {
    assembleRegionBoundary,
    describeRegionBoundaryCounts,
    classifyRegionSourceLevel,
    regionSourceParticipates,
} from '../src/RegionBoundarySources';
import { traceRegionSketchAtPoint } from '../src/SlabRegionTracer';

const L2 = 'level-2';
const L3 = 'level-3';

/** Four walls forming an axis-aligned rectangle, all on one storey. */
function room(
    levelId: string,
    idPrefix: string,
    x0: number, z0: number, x1: number, z1: number,
) {
    const c = [
        { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
    ];
    return c.map((a, i) => ({
        id: `${idPrefix}-${i}`,
        levelId,
        baseLine: [a, c[(i + 1) % 4]!],
    }));
}

/**
 * FIXTURE A — the founder's sentence, minimally.
 *
 * Level 3 (the storey being drawn on) has a 10x10 room. Level 2 BELOW has a
 * smaller 6x6 room whose footprint sits inside it — an ordinary thing in a
 * building, where the storey below is more subdivided than the storey above.
 *
 * A click at (5,5) is inside BOTH. `findAttributedRegionWithHolesAtPoint` picks
 * the SMALLEST enclosing loop, so an unscoped graph hands back the Level-2 room:
 * *"it only recognises the below levels' ones."*
 */
function stackedStoreys() {
    return {
        walls: [
            ...room(L3, 'l3', 0, 0, 10, 10),
            ...room(L2, 'l2', 2, 2, 8, 8),
        ],
        /** The parcel encloses the lot on every storey — a DATUM, never scoped out. */
        parcelBoundary: [
            { x: -5, z: -5 }, { x: 30, z: -5 }, { x: 30, z: 30 }, { x: -5, z: 30 },
        ],
    };
}

/**
 * FIXTURE B — the WELD half of the defect, which no area comparison can see.
 *
 * A Level-3 wall standing directly above a Level-2 wall has the SAME world XZ, so
 * `buildAttributedClosedLoops` welds both chords onto the SAME node pair. Its own
 * rule then fires: two DIFFERENT walls claiming one ring edge is `ambiguous`, and
 * the attribution is dropped to `null`. The ring is geometrically perfect and its
 * host references are GONE — the founder's `0 host-referenced edge(s) across
 * 0 wall(s)`, and the reason a region slab built here would not follow its walls.
 */
function coincidentStoreys() {
    const l3 = room(L3, 'l3', 0, 0, 10, 10);
    // Every Level-2 wall is stacked exactly beneath its Level-3 twin.
    const l2 = room(L2, 'l2', 0, 0, 10, 10);
    return { walls: [...l3, ...l2] };
}

/** Trace at a point and report which storey the resulting ring's chords came from. */
function traceStoreys(
    inputs: Parameters<typeof assembleRegionBoundary>[0],
    x: number,
    z: number,
) {
    const { segments, counts } = assembleRegionBoundary(inputs);
    const traced = traceRegionSketchAtPoint(segments as never, x, z);
    // attribution.hostWallIds is the SAME field the founder's log line prints
    // ("N host-referenced edge(s) across M wall(s)"), so these assertions are read
    // off exactly the artefact that reported the defect.
    const hostIds = traced ? traced.attribution.hostWallIds : [];
    return {
        counts,
        traced,
        hostIds,
        attribution: traced?.attribution ?? null,
        /** Distinct storey prefixes among the ring's ATTRIBUTED chords. */
        storeys: [...new Set(hostIds.map(id => id.split('-')[0]!))].sort(),
        area: traced ? Math.abs(shoelace(traced.ring)) : 0,
    };
}

function shoelace(ring: ReadonlyArray<{ x: number; y: number }>): number {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        a += (ring[j]!.x + ring[i]!.x) * (ring[j]!.y - ring[i]!.y);
    }
    return a / 2;
}

describe('§REGION-LEVEL-SCOPE (L-1192) — the scope policy', () => {
    it('classifies active / other / unknown exactly as LevelScope.ts does', () => {
        expect(classifyRegionSourceLevel(L3, L3)).toBe('active');
        expect(classifyRegionSourceLevel(L2, L3)).toBe('other');
        // Either half missing ⇒ UNKNOWN. Guessing from elevation was the original
        // sin in the snapping pipeline; it is not repeated here.
        expect(classifyRegionSourceLevel(undefined, L3)).toBe('unknown');
        expect(classifyRegionSourceLevel(L2, null)).toBe('unknown');
    });

    it('excludes ONLY a proven other-storey record — unknown participates', () => {
        expect(regionSourceParticipates(L3, L3)).toBe(true);
        expect(regionSourceParticipates(L2, L3)).toBe(false);
        expect(regionSourceParticipates(undefined, L3)).toBe(true);
        expect(regionSourceParticipates(L2, undefined)).toBe(true);
    });
});

describe('§REGION-LEVEL-SCOPE (L-1192) — A · the storey below wins the region', () => {
    /**
     * ⛔ THE DEFECT, PINNED. This is what the founder saw, and it is RED against
     * the fixed assembler only because `activeLevelId` is withheld here.
     */
    it('UNSCOPED, the trace returns the LEVEL-2 room — the reported defect', () => {
        const { walls, parcelBoundary } = stackedStoreys();
        const r = traceStoreys({ walls, parcelBoundary }, 5, 5);

        expect(r.counts.walls).toBe(8);            // the whole project, all storeys
        expect(r.counts.activeLevelId).toBeNull();
        expect(r.storeys).toEqual(['l2']);         // ⛔ the storey BELOW
        expect(r.area).toBeCloseTo(36, 3);         // the 6x6, not the 10x10
        expect(describeRegionBoundaryCounts(r.counts)).toContain('across EVERY level');
    });

    /** ⭐ THE FIX. Same fixture, same click, scoped — the active storey wins. */
    it('SCOPED to level 3, the trace returns the LEVEL-3 room', () => {
        const { walls, parcelBoundary } = stackedStoreys();
        const r = traceStoreys({ walls, parcelBoundary, activeLevelId: L3 }, 5, 5);

        expect(r.traced).not.toBeNull();
        // Made of Level-3 chords and NOTHING else. Asserting the absence of 'l2'
        // is the half that catches a right-shaped ring built from the wrong storey.
        expect(r.storeys).toEqual(['l3']);
        expect(r.area).toBeCloseTo(100, 3);
    });

    it('searches only the active storey, and SAYS how much it left out', () => {
        const { walls, parcelBoundary } = stackedStoreys();
        const { counts } = assembleRegionBoundary({ walls, parcelBoundary, activeLevelId: L3 });

        expect(counts.walls).toBe(4);                       // not 8
        expect(counts.otherLevelExcluded.walls).toBe(4);
        expect(counts.activeLevelId).toBe(L3);

        // The `searched=` sentence is the artefact that named this defect in one
        // line, so it is asserted, not merely produced.
        const sentence = describeRegionBoundaryCounts(counts);
        expect(sentence).toContain('4 wall(s)');
        expect(sentence).toContain(`on level ${L3}`);
        expect(sentence).toContain('excluded as being on other levels: 4 wall(s)');
    });
});

describe('§REGION-LEVEL-SCOPE (L-1192) — B · stacked walls erase attribution', () => {
    /**
     * ⛔ The half an area check cannot see: the ring is the RIGHT shape and carries
     * NO host references, so the region slab silently stops following its walls.
     */
    it('UNSCOPED, coincident storeys collapse the ring to 0 host-referenced edges', () => {
        const { walls } = coincidentStoreys();
        const r = traceStoreys({ walls }, 5, 5);

        expect(r.traced).not.toBeNull();
        expect(r.area).toBeCloseTo(100, 3);          // geometrically perfect…
        expect(r.hostIds).toEqual([]);               // …and attributed to NOTHING
        expect(r.attribution!.hostEdges).toBe(0);
        expect(r.attribution!.ambiguousFallbacks).toBeGreaterThan(0);
    });

    it('SCOPED, the same ring is fully attributed to the level-3 walls', () => {
        const { walls } = coincidentStoreys();
        const r = traceStoreys({ walls, activeLevelId: L3 }, 5, 5);

        expect(r.area).toBeCloseTo(100, 3);
        expect(r.storeys).toEqual(['l3']);
        expect(r.attribution!.hostEdges).toBe(4);
        expect(r.attribution!.ambiguousFallbacks).toBe(0);
    });
});

describe('§REGION-LEVEL-SCOPE (L-1192) — the parcel boundary is a DATUM', () => {
    it('bounds a region on an UPPER storey that has no walls of its own', () => {
        const { walls, parcelBoundary } = stackedStoreys();
        // Level 4 has nothing of its own. The parcel must still enclose the point —
        // it is the property line, not the ground storey's edge.
        const r = traceStoreys(
            { walls, parcelBoundary, activeLevelId: 'level-4' },
            25, 25,   // outside both rooms, inside the parcel
        );

        expect(r.counts.walls).toBe(0);
        expect(r.counts.parcelPresent).toBe(true);
        expect(r.counts.parcelEdges).toBe(4);
        expect(r.traced).not.toBeNull();
        expect(r.area).toBeCloseTo(35 * 35, 3);
    });
});

describe('§REGION-LEVEL-SCOPE (L-1192) — slabs and curtain walls scope too', () => {
    it('leaves out the storey-below slab plate whose outline welds onto this storey', () => {
        // The founder's `99 slab edge(s)` — plates below, tracing the walls beneath.
        const belowPlate = {
            id: 'slab-l2',
            levelId: L2,
            position: { x: 0, y: 0, z: 0 },
            // polygon `.y` carries world Z (see RegionSlabLike).
            polygon: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }],
        };
        const { counts } = assembleRegionBoundary({
            walls: room(L3, 'l3', 0, 0, 10, 10),
            slabs: [belowPlate],
            activeLevelId: L3,
        });
        expect(counts.slabEdges).toBe(0);
        expect(counts.otherLevelExcluded.slabs).toBe(1);
    });

    it('keeps a slab plate on the ACTIVE storey', () => {
        const samePlate = {
            id: 'slab-l3',
            levelId: L3,
            position: { x: 0, y: 0, z: 0 },
            polygon: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }],
        };
        const { counts } = assembleRegionBoundary({ slabs: [samePlate], activeLevelId: L3 });
        expect(counts.slabEdges).toBe(4);
        expect(counts.otherLevelExcluded.slabs).toBe(0);
    });

    it('scopes curtain walls, and a level-less one still participates', () => {
        const cwBelow   = { id: 'cw-l2', levelId: L2, baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }] };
        const cwHere    = { id: 'cw-l3', levelId: L3, baseLine: [{ x: 0, z: 3 }, { x: 6, z: 3 }] };
        const cwUnknown = { id: 'cw-?',                baseLine: [{ x: 0, z: 6 }, { x: 6, z: 6 }] };
        const { counts } = assembleRegionBoundary({
            curtainWalls: [cwBelow, cwHere, cwUnknown],
            activeLevelId: L3,
        });
        expect(counts.curtainWallEdges).toBe(2);          // active + unknown
        expect(counts.otherLevelExcluded.curtainWalls).toBe(1);
    });
});

describe('§REGION-LEVEL-SCOPE (L-1192) — no behaviour change for level-less callers', () => {
    it('a bare { baseLine } edge set traces exactly as before', () => {
        // Every pre-existing caller and test hands shapes with no levelId and no
        // activeLevelId. Those must be bit-identical, which is what makes this an
        // opt-in rather than a silent policy change.
        const bare = room('ignored', 'l3', 0, 0, 10, 10).map(w => ({ baseLine: w.baseLine }));
        const { segments, counts } = assembleRegionBoundary({ walls: bare });
        expect(counts.walls).toBe(4);
        expect(counts.otherLevelExcluded).toEqual({ walls: 0, slabs: 0, curtainWalls: 0 });
        const traced = traceRegionSketchAtPoint(segments as never, 5, 5);
        expect(traced).not.toBeNull();
    });
});
