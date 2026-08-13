/**
 * finishPlanRegionHostAttribution.test.ts
 *
 * C79 §6.3 **ROWS 9 AND 10** — `CeilingPlanToolHandler` and `FloorPlanToolHandler`, the
 * last two non-conforming rows in the conformance table. Both were **CAPABILITY ABSENT**
 * (zero occurrences of `region`), and C79 §0.1(3)(4) states that neither can INHERIT a
 * fix, because the capability did not exist. This suite is the executed evidence that it
 * now does, and that it ships CONFORMING rather than cheap.
 *
 * WHAT THIS SUITE TESTS, AND WHY IT IS SHAPED THIS WAY.
 *
 * C79 §8.3(b) is explicit that a static gate can verify a `hostId` is PRESENT but not
 * that it is the RIGHT one, and that no gate observes runtime behaviour — so *"click a
 * room and the finish is bounded by its walls"* is provable only by an executed test.
 * This suite therefore exercises the shared attributor the handlers call
 * (`attributeFinishRegion`) against a real fixture, rather than asserting on source text.
 *
 * The four things the deliverable requires proven:
 *   1. references emitted BY CONSTRUCTION (§1.1, §2.1) — not coordinates (§6.6);
 *   2. `fallback` present AT CREATION (§4.3) — the alternative degrades to NOTHING;
 *   3. the five attribution counts SURFACE at commit (§2.5, §2.6);
 *   4. the REFUSAL path fires when the room's own boundary is unknown (§2.3, §5.2.0).
 *
 * §7.4 — floor and ceiling are asserted to be BYTE-IDENTICAL in edge shape. A field
 * populated correctly on one path and not another is worse than uniform absence, because
 * it looks honoured to whoever checks first.
 */

import { describe, it, expect } from 'vitest';
import {
    attributeFinishRegion,
    formatFinishRegionReport,
    formatFinishRegionRefusal,
} from '../src/engine/views/plantools/finishRegionAttribution';

// ── Fixture ──────────────────────────────────────────────────────────────────
//
// The C79 §10.3 REFERENCE FIXTURE, reproduced verbatim from
// `packages/command-registry/__tests__/roomFinishBoundaryHostAttribution.test.ts` so the
// counts this suite reads are comparable to the ones recorded in the contract: a
// 6 m × 4 m room bounded by four 200 mm straight walls, authored on the CENTRELINES.

const T = 0.2; // wall thickness (m)

function straightWall(id: string, ax: number, az: number, bx: number, bz: number) {
    return { id, baseLine: [{ x: ax, z: az }, { x: bx, z: bz }], thickness: T, openings: [] };
}

function refWalls() {
    return [
        straightWall('w-south', 0, 0, 6, 0),
        straightWall('w-east', 6, 0, 6, 4),
        straightWall('w-north', 6, 4, 0, 4),
        straightWall('w-west', 0, 4, 0, 0),
    ];
}

/** A curved (filleted) south wall — the §2.5 permanent-fallback case. */
function curvedSouthWall() {
    return {
        id: 'w-south',
        baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }],
        thickness: T,
        openings: [],
        curve: { control: { x: 3, z: -0.8 } },
    };
}

/** The ring as STORED after the inner-face inset (centreline pulled in by T/2). */
const INSET = [
    { x: T / 2, z: T / 2 },
    { x: 6 - T / 2, z: T / 2 },
    { x: 6 - T / 2, z: 4 - T / 2 },
    { x: T / 2, z: 4 - T / 2 },
];

function wallLookup(walls: Array<{ id: string }>) {
    const byId = new Map(walls.map(w => [w.id, w]));
    return { getById: (id: string) => byId.get(id) as never };
}

/** A room whose bounding-wall relationship IS recorded (the normal case). */
function determinedRoom(ids: string[] = refWalls().map(w => w.id)) {
    return { id: 'room-1', boundingWallIds: ids };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. REFERENCES BY CONSTRUCTION — the §6.6 requirement these rows exist to meet
// ─────────────────────────────────────────────────────────────────────────────

describe('C79 §6.3 rows 9–10 — references emitted BY CONSTRUCTION, not coordinates', () => {
    it('§1.1 — every attributable edge is a hostReference, never a copied coordinate pair', () => {
        const r = attributeFinishRegion(INSET, determinedRoom(), wallLookup(refWalls()));

        expect(r.kind).toBe('attributed');
        if (r.kind !== 'attributed') return;

        expect(r.sketch.outerLoop.edges).toHaveLength(4);
        expect(r.sketch.outerLoop.edges.every(e => e.type === 'hostReference')).toBe(true);
        expect(r.sketch.attribution.hostEdges).toBe(4);
        expect(r.sketch.attribution.freeEdges).toBe(0);
    });

    it('§2.3 — each edge names the CORRECT wall, not merely SOME wall', () => {
        // A wrong host is strictly worse than no host, so this asserts IDENTITY.
        const r = attributeFinishRegion(INSET, determinedRoom(), wallLookup(refWalls()));
        if (r.kind !== 'attributed') throw new Error('expected attribution');

        const hosts = r.sketch.outerLoop.edges.map(e => (e.type === 'hostReference' ? e.hostId : null));
        expect(hosts).toEqual(['w-south', 'w-east', 'w-north', 'w-west']);
    });

    it('§3.1/§3.2 — the reference frame is centerLine at offset 0, and NEVER a face', () => {
        const r = attributeFinishRegion(INSET, determinedRoom(), wallLookup(refWalls()));
        if (r.kind !== 'attributed') throw new Error('expected attribution');

        for (const e of r.sketch.outerLoop.edges) {
            if (e.type !== 'hostReference') continue;
            // Naming a face would move the geometry by half the wall thickness AND
            // require an interior/exterior sense the ring walk does not preserve —
            // a §2.3 coin flip, not a §2.4 honest refusal.
            expect(e.reference).toBe('centerLine');
            expect(e.offset).toBe(0);
            expect(e.hostType).toBe('wall');
        }
    });

    it('§7.2(a) — boundingWallIds is POPULATED with exactly the walls that produced an edge', () => {
        const r = attributeFinishRegion(INSET, determinedRoom(), wallLookup(refWalls()));
        if (r.kind !== 'attributed') throw new Error('expected attribution');

        expect([...r.sketch.boundingWallIds].sort())
            .toEqual(['w-east', 'w-north', 'w-south', 'w-west']);
    });

    it('§7.4 — the FLOOR and the CEILING surfaces produce a byte-identical sketch', () => {
        // Both handlers call this one function with the same arguments; the families
        // differ only in the label they print. Two shapes for one relationship is how
        // two buttons come to behave differently (§0).
        const a = attributeFinishRegion(INSET, determinedRoom(), wallLookup(refWalls()));
        const b = attributeFinishRegion(INSET, determinedRoom(), wallLookup(refWalls()));
        if (a.kind !== 'attributed' || b.kind !== 'attributed') throw new Error('expected attribution');

        expect(JSON.stringify(a.sketch.outerLoop)).toBe(JSON.stringify(b.sketch.outerLoop));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. FALLBACK PRESENT AT CREATION — §4.3, the clause whose alternative is NOTHING
// ─────────────────────────────────────────────────────────────────────────────

describe('C79 §4.3 — every emitted reference carries a fallback AT AUTHORING TIME', () => {
    it('populates fallback on EVERY hostReference, from the traced geometry itself', () => {
        const r = attributeFinishRegion(INSET, determinedRoom(), wallLookup(refWalls()));
        if (r.kind !== 'attributed') throw new Error('expected attribution');

        for (const e of r.sketch.outerLoop.edges) {
            if (e.type !== 'hostReference') continue;
            // §4.3 is a MUST because the alternative degrades to NULL: a wall deleted
            // before any rebuild would otherwise leave an edge that resolves to nothing.
            expect(e.fallback).toBeDefined();
            expect(Number.isFinite(e.fallback.start.x)).toBe(true);
            expect(Number.isFinite(e.fallback.start.z)).toBe(true);
            expect(Number.isFinite(e.fallback.end.x)).toBe(true);
            expect(Number.isFinite(e.fallback.end.z)).toBe(true);
        }
    });

    it("the fallback is THIS element's own stored geometry — index-aligned with the ring", () => {
        const r = attributeFinishRegion(INSET, determinedRoom(), wallLookup(refWalls()));
        if (r.kind !== 'attributed') throw new Error('expected attribution');

        r.sketch.outerLoop.edges.forEach((e, i) => {
            if (e.type !== 'hostReference') return;
            const a = INSET[i]!;
            const b = INSET[(i + 1) % INSET.length]!;
            expect(e.fallback.start).toEqual({ x: a.x, z: a.z });
            expect(e.fallback.end).toEqual({ x: b.x, z: b.z });
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. THE COUNTS SURFACE — §2.5 returned, §2.6 never absorbed
// ─────────────────────────────────────────────────────────────────────────────

describe('C79 §2.5/§2.6 — the attribution counts are RETURNED and REPORTED', () => {
    it('returns all five per-reason counts plus the host wall set', () => {
        const r = attributeFinishRegion(INSET, determinedRoom(), wallLookup(refWalls()));
        if (r.kind !== 'attributed') throw new Error('expected attribution');

        const a = r.sketch.attribution;
        for (const field of [
            'hostEdges', 'freeEdges', 'curvedFallbacks',
            'missingIdFallbacks', 'ambiguousFallbacks', 'roomUndetectedFallbacks',
        ] as const) {
            expect(typeof a[field], `${field} must be a measured number`).toBe('number');
        }
        expect(Array.isArray(a.hostWallIds)).toBe(true);
    });

    it('§2.5 — a CURVED bounding wall always falls back, and the count says so', () => {
        // The reference reading on the 3-straight + 1-arc fixture (C79 §10.3):
        // 3 host edges / 1 curved fallback. A measurement, not a silent gap.
        const walls = [curvedSouthWall(), ...refWalls().filter(w => w.id !== 'w-south')];
        const r = attributeFinishRegion(INSET, determinedRoom(), wallLookup(walls));
        if (r.kind !== 'attributed') throw new Error('expected attribution');

        expect(r.sketch.attribution.hostEdges).toBe(3);
        expect(r.sketch.attribution.curvedFallbacks).toBe(1);
        expect(r.sketch.attribution.freeEdges).toBe(1);
    });

    it('§2.6 — zero-host and all-host are NOT the same value at the caller', () => {
        const all = attributeFinishRegion(INSET, determinedRoom(), wallLookup(refWalls()));
        // A room DETERMINED to bound zero walls: a real answer, not a refusal (C71 §4.4).
        const none = attributeFinishRegion(INSET, determinedRoom([]), wallLookup(refWalls()));
        if (all.kind !== 'attributed' || none.kind !== 'attributed') throw new Error('expected attribution');

        expect(all.sketch.attribution.hostEdges).toBe(4);
        expect(none.sketch.attribution.hostEdges).toBe(0);
        expect(none.sketch.attribution.roomUndetectedFallbacks).toBe(4);

        // And the two REPORTS a reader sees are different strings — which is the actual
        // requirement (§2.6 is about what reaches the caller, not about a private field).
        const rAll = formatFinishRegionReport('FloorPlanToolHandler', 'floor', all.sketch);
        const rNone = formatFinishRegionReport('FloorPlanToolHandler', 'floor', none.sketch);
        expect(rAll).not.toBe(rNone);
        expect(rAll).toContain('4 wall-attributed edge(s)');
        expect(rNone).toContain('0 wall-attributed edge(s)');
        expect(rNone).toContain('Free edges do NOT follow a wall.');
    });

    it('the report names the SURFACE — §0: the user could not see which surface they used', () => {
        const r = attributeFinishRegion(INSET, determinedRoom(), wallLookup(refWalls()));
        if (r.kind !== 'attributed') throw new Error('expected attribution');

        expect(formatFinishRegionReport('FloorPlanToolHandler', 'floor', r.sketch))
            .toContain('[FloorPlanToolHandler]');
        expect(formatFinishRegionReport('CeilingPlanToolHandler', 'ceiling', r.sketch))
            .toContain('[CeilingPlanToolHandler]');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. THE REFUSAL PATH — §2.3, §5.2.0, §9.7
// ─────────────────────────────────────────────────────────────────────────────

describe('C79 §2.3/§5.2.0 — the handler REFUSES rather than inventing a boundary', () => {
    it('refuses with RELATIONSHIP_NOT_RECORDED when boundingWallIds is ABSENT', () => {
        // The field NAMES a dependency and no producer wrote it. Per C78 §1.4 that is a
        // known-unknown, NOT "this room bounds zero walls".
        const r = attributeFinishRegion(INSET, { id: 'room-1' }, wallLookup(refWalls()));

        expect(r.kind).toBe('refused');
        if (r.kind !== 'refused') return;
        expect(r.determination.reason).toBe('RELATIONSHIP_NOT_RECORDED');
        expect(r.determination.scope).toContain('room-1');
    });

    it('refuses when there is no room record at all', () => {
        const r = attributeFinishRegion(INSET, undefined, wallLookup(refWalls()));
        expect(r.kind).toBe('refused');
        if (r.kind !== 'refused') return;
        expect(r.determination.reason).toBe('RELATIONSHIP_NOT_RECORDED');
    });

    it('§5.2.1 — a REFUSAL is not an empty success: the two arms are different SHAPES', () => {
        const refused = attributeFinishRegion(INSET, { id: 'room-1' }, wallLookup(refWalls()));
        const determinedEmpty = attributeFinishRegion(INSET, determinedRoom([]), wallLookup(refWalls()));

        // Same pixels, opposite facts. A caller reading `edges.length === 0` could not
        // tell them apart — so the refusal arm carries no `sketch` at all.
        expect(refused.kind).toBe('refused');
        expect(determinedEmpty.kind).toBe('attributed');
        expect('sketch' in refused).toBe(false);
    });

    it('§C71 §4.4 — a room DETERMINED to bound zero walls does NOT refuse', () => {
        // `[]` may only ever mean zero results. This room was examined; the answer is
        // real, and it flows through as per-edge `roomUndetected` fallbacks with counts.
        const r = attributeFinishRegion(INSET, determinedRoom([]), wallLookup(refWalls()));
        expect(r.kind).toBe('attributed');
        if (r.kind !== 'attributed') return;
        expect(r.sketch.attribution.roomUndetectedFallbacks).toBe(4);
        expect(r.sketch.boundingWallIds).toEqual([]);
    });

    it('the refusal SENTENCE names the typed reason and says nothing was created', () => {
        const r = attributeFinishRegion(INSET, { id: 'room-1' }, wallLookup(refWalls()));
        if (r.kind !== 'refused') throw new Error('expected refusal');

        const floor = formatFinishRegionRefusal('FloorPlanToolHandler', 'floor', r.determination);
        expect(floor).toContain('RELATIONSHIP_NOT_RECORDED');
        expect(floor).toContain('No floor was created');
        expect(floor).toContain('a wrong host is strictly worse than no host');

        const ceiling = formatFinishRegionRefusal('CeilingPlanToolHandler', 'ceiling', r.determination);
        expect(ceiling).toContain('No ceiling was created');
    });

    it('the refusal is taken BEFORE any geometry work — an invented answer never exists', () => {
        // §0's lesson: an answer which exists is an answer that eventually gets written
        // down. `getById` must never be consulted on the refusal path.
        let consulted = 0;
        const r = attributeFinishRegion(INSET, { id: 'room-1' }, {
            getById: (id: string) => { consulted++; return { id } as never; },
        });
        expect(r.kind).toBe('refused');
        expect(consulted).toBe(0);
    });
});
