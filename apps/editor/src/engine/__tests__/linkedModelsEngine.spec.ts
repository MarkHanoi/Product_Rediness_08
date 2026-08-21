/**
 * §LINK-ENGINE-PROOF (L-3150) — the inherited LINK MODEL engine slice, RUN.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 *
 * Lane LINK1 wrote 2 347 lines of linked-model engine and died before running one
 * of them. ADR-0346 §11 is titled "UNPROVEN" and says so. [[committed-is-not-
 * reachable]] is the standing lesson: a committed engine that runs nowhere is not
 * a feature, and building a UI on an unrun engine stacks a second defect on the
 * first.
 *
 * So this suite runs the parts that can be run without a browser, and it does it
 * against fixtures COPIED FROM THE PRODUCER — `ProjectSerializer.ts`, cited by
 * `file:line` — never written to match the consumer. That is C13 §7.4 rule 1, and
 * it is the whole reason this file found two real defects rather than confirming
 * the code against itself ([[fake-more-capable-than-real]]: a fake built from the
 * header cannot falsify the header).
 *
 * ── WHAT THE PRODUCER ACTUALLY EMITS (measured 2026-08-21) ───────────────────
 *
 *   walls   `baseLine: stripBaseline(...)` → [Vec3, Vec3]   ProjectSerializer.ts:560-563
 *   slabs   `polygon: s.polygon.map(stripVec2)` → **Vec2 {x,y}**  :757  ⚠ NO `z`
 *           `position: stripVec3(s.position)`  → Vec3        :756
 *   columns `position: stripVec3(c.position)`  → Vec3        :780
 *   roofs   `footprint: { polygon, centroid }` → **NESTED**   :847-852  ⚠ no top-level
 *           `polygon: r.polygon` (only when set)             :874
 *
 * `stripVec2` is `{ x, y }` (`:555-558`) where **y IS THE PLAN Z** — the plan-space
 * 2D convention this codebase uses everywhere. A consumer that reads `p.z` off a
 * Vec2 gets `undefined` and silently drops the point. That is defect L-3151 below.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    deriveLinkMassing,
    linkMassingCost,
    type LinkMassingSource,
} from '../links/linkMassing';
import {
    resolveLinkAnchor,
    explicitAnchor,
    geoSeparationM,
    enuOffset,
    NEAR_SEPARATION_M,
    FAR_SEPARATION_M,
    createLinkedModelId,
    isLinkedModelId,
    LinkedModelRefSchema,
    type LinkGeoOrigin,
    type LinkedModelRef,
} from '@pryzm/schemas';
import { linkedModelStore } from '../links/LinkedModelStore';

// ── Fixtures, shaped like the PRODUCER ───────────────────────────────────────

/** Two levels, as `serializeLevel` emits them (id / name / elevation / height). */
const LEVELS = [
    { id: 'lvl-0', name: 'Ground', elevation: 0, height: 3.2 },
    { id: 'lvl-1', name: 'Level 1', elevation: 3.2, height: 3.0 },
];

/** A wall exactly as `ProjectSerializer.ts:600-611` emits it. Vec3 baseLine. */
function wall(levelId: string, x0: number, z0: number, x1: number, z1: number) {
    return {
        id: `w-${levelId}-${x0}-${z0}`,
        type: 'wall',
        levelId,
        baseLine: [
            { x: x0, y: 0, z: z0 },
            { x: x1, y: 0, z: z1 },
        ],
        height: 3.0,
        thickness: 0.2,
    };
}

/** A slab exactly as `serializeSlab` (:753-772) emits it — polygon of **Vec2**. */
function slab(levelId: string, halfX: number, halfZ: number) {
    return {
        id: `s-${levelId}`,
        type: 'slab',
        levelId,
        position: { x: 0, y: 0, z: 0 },
        // ⚠ Vec2 — `{ x, y }`, where y is the PLAN Z. This is what `stripVec2` emits.
        polygon: [
            { x: -halfX, y: -halfZ },
            { x: halfX, y: -halfZ },
            { x: halfX, y: halfZ },
            { x: -halfX, y: halfZ },
        ],
        thickness: 0.25,
    };
}

/** A roof exactly as `serializeRoof` (:846-876) emits it — footprint is NESTED. */
function roof(levelId: string, halfX: number, halfZ: number) {
    return {
        id: `r-${levelId}`,
        type: 'roof',
        levelId,
        footprint: {
            polygon: [
                { x: -halfX, y: -halfZ },
                { x: halfX, y: -halfZ },
                { x: halfX, y: halfZ },
                { x: -halfX, y: halfZ },
            ],
            centroid: { x: 0, y: 0 },
        },
        roofType: 'flat',
        thickness: 0.3,
        // NOTE: no top-level `position`, and no top-level `polygon` unless authored.
    };
}

/** A column exactly as `serializeColumn` (:778-789) emits it — Vec3 position. */
function column(levelId: string, x: number, z: number) {
    return { id: `c-${levelId}-${x}-${z}`, type: 'column', levelId, position: { x, y: 0, z }, height: 3 };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('§LINK-ENGINE-PROOF · deriveLinkMassing against PRODUCER-shaped snapshots', () => {
    it('builds one band per level from WALLS — the path that already worked', () => {
        const snap: LinkMassingSource = {
            levels: LEVELS,
            walls: [
                wall('lvl-0', -10, -6, 10, -6),
                wall('lvl-0', 10, -6, 10, 6),
                wall('lvl-1', -8, -5, 8, -5),
                wall('lvl-1', 8, -5, 8, 5),
            ],
        };
        const r = deriveLinkMassing(snap);
        expect(r.bands).toHaveLength(2);
        expect(r.skippedLevels).toEqual([]);

        const g = r.bands[0]!;
        expect(g.levelName).toBe('Ground');
        expect(g.minX).toBe(-10);
        expect(g.maxX).toBe(10);
        expect(g.minZ).toBe(-6);
        expect(g.maxZ).toBe(6);
        expect(g.baseY).toBe(0);
        expect(g.height).toBe(3.2);
        expect(g.contributingElements).toBe(2);
    });

    /**
     * §L-3151 — THE FIRST REAL DEFECT. A slab's polygon is Vec2 `{x,y}` and
     * `foldElement` read `p.z`, so every point was dropped. A level whose only
     * geometry is a slab produced NO band and was reported as "skipped" — i.e. a
     * podium, a roof terrace or a plinth vanished from the massing, silently, with
     * the linked building drawn smaller than it is.
     *
     * That is worse than a refusal: it is a plausible-looking wrong answer, which
     * is exactly what ADR-0346 D4 says never to ship.
     */
    it('§L-3151 · builds a band from a SLAB-ONLY level (Vec2 polygon, y IS plan z)', () => {
        const snap: LinkMassingSource = {
            levels: [LEVELS[0]!],
            slabs: [slab('lvl-0', 12, 7)],
        };
        const r = deriveLinkMassing(snap);
        expect(r.skippedLevels).toEqual([]);
        expect(r.bands).toHaveLength(1);
        const b = r.bands[0]!;
        expect(b.minX).toBe(-12);
        expect(b.maxX).toBe(12);
        // The Vec2 `y` must be read as the plan Z.
        expect(b.minZ).toBe(-7);
        expect(b.maxZ).toBe(7);
    });

    /**
     * §L-3152 — THE SECOND REAL DEFECT. `serializeRoof` nests the outline under
     * `footprint.polygon`; `foldElement` only ever looked at TOP-LEVEL `polygon` /
     * `points` / `boundary` / `outline`, and a roof carries no `position` either.
     * So a roof contributed nothing at all, and a top-level roof band was lost.
     */
    it('§L-3152 · builds a band from a ROOF-ONLY level (nested footprint.polygon)', () => {
        const snap: LinkMassingSource = {
            levels: [LEVELS[1]!],
            roofs: [roof('lvl-1', 9, 5)],
        };
        const r = deriveLinkMassing(snap);
        expect(r.skippedLevels).toEqual([]);
        expect(r.bands).toHaveLength(1);
        const b = r.bands[0]!;
        expect(b.minX).toBe(-9);
        expect(b.maxX).toBe(9);
        expect(b.minZ).toBe(-5);
        expect(b.maxZ).toBe(5);
    });

    it('mixes walls, slabs, roofs and columns into ONE extent per level', () => {
        const snap: LinkMassingSource = {
            levels: [LEVELS[0]!],
            walls: [wall('lvl-0', -4, -4, 4, -4)],
            slabs: [slab('lvl-0', 12, 7)],
            columns: [column('lvl-0', 15, 0)],
        };
        const r = deriveLinkMassing(snap);
        expect(r.bands).toHaveLength(1);
        const b = r.bands[0]!;
        // The column at x=15 widens the extent beyond the slab's ±12.
        expect(b.maxX).toBe(15);
        expect(b.minX).toBe(-12);
        expect(b.maxZ).toBe(7);
        expect(b.contributingElements).toBe(3);
    });

    /**
     * §L-3153 — `contributingElements` counted an element as contributing whenever
     * it merely HAD a geometry key, even when every point in it was rejected. A
     * count that says "8 elements shaped this band" about a band nothing shaped is
     * an unfalsifiable diagnostic — the [[probe-can-be-wrong-three-ways]] shape.
     */
    it('§L-3153 · counts an element as contributing only when a point was ACCEPTED', () => {
        const snap: LinkMassingSource = {
            levels: [LEVELS[0]!],
            walls: [
                wall('lvl-0', -3, -3, 3, 3),
                // Junk the serializer would never emit, but a hand-edited or
                // partially-migrated file can: no usable coordinates at all.
                { id: 'w-junk', type: 'wall', levelId: 'lvl-0', baseLine: [{ q: 1 }, { q: 2 }] },
            ],
        };
        const r = deriveLinkMassing(snap);
        expect(r.bands).toHaveLength(1);
        expect(r.bands[0]!.contributingElements).toBe(1);
    });

    it('reports a level that produced no band BY NAME rather than dropping it', () => {
        const snap: LinkMassingSource = {
            levels: LEVELS,
            walls: [wall('lvl-0', -5, -5, 5, 5)],
        };
        const r = deriveLinkMassing(snap);
        expect(r.bands).toHaveLength(1);
        // "3 of 5 levels" is answerable; "3 levels" is not.
        expect(r.skippedLevels).toEqual(['Level 1']);
    });

    it('treats a level with declared height 0 as the NAMED fallback, not zero bulk', () => {
        const snap: LinkMassingSource = {
            levels: [{ id: 'lvl-0', name: 'Ground', elevation: 0, height: 0 }],
            walls: [wall('lvl-0', -5, -5, 5, 5)],
        };
        expect(deriveLinkMassing(snap).bands[0]!.height).toBe(3.0);
    });

    it('returns a clean EMPTY result for a snapshot with no levels — not a throw', () => {
        expect(deriveLinkMassing({}).bands).toEqual([]);
        expect(deriveLinkMassing(null).bands).toEqual([]);
        expect(deriveLinkMassing(undefined).skippedLevels).toEqual([]);
    });
});

describe('§LINK-ENGINE-PROOF · linkMassingCost is the number the UI quotes', () => {
    it('is ONE draw call for any non-empty massing, N instances', () => {
        const snap: LinkMassingSource = {
            levels: LEVELS,
            walls: [wall('lvl-0', -5, -5, 5, 5), wall('lvl-1', -5, -5, 5, 5)],
        };
        const cost = linkMassingCost(deriveLinkMassing(snap));
        expect(cost.drawCalls).toBe(1);
        expect(cost.meshes).toBe(1);
        expect(cost.instances).toBe(2);
    });

    it('is ZERO for an empty massing — hidden really costs nothing', () => {
        expect(linkMassingCost({ bands: [], skippedLevels: [], elementsConsidered: 0 }))
            .toEqual({ drawCalls: 0, meshes: 0, instances: 0 });
    });
});

describe('§LINK-ENGINE-PROOF · resolveLinkAnchor is the C83 verdict the UI shows', () => {
    const BCN: LinkGeoOrigin = { latitude: 41.3874, longitude: 2.1686, elevationAsl: 12, trueNorth: 0 };

    it('FINE for two origins on the same parcel, and derives the ENU offset', () => {
        const near: LinkGeoOrigin = { ...BCN, longitude: BCN.longitude + 0.0005 };
        const d = resolveLinkAnchor(BCN, near, '2026-08-21T00:00:00.000Z');
        expect(d.verdict).toBe('FINE');
        expect(d.reason).toBeNull();
        expect(d.anchor).not.toBeNull();
        expect(d.separationM).toBeGreaterThan(0);
        expect(d.separationM!).toBeLessThan(NEAR_SEPARATION_M);
        expect(d.anchor!.mode).toBe('shared-geo-origin');
        // East of the host, so a positive east offset.
        expect(d.anchor!.transform.east).toBeGreaterThan(0);
        expect(Math.abs(d.anchor!.transform.north)).toBeLessThan(1);
    });

    it('INADVISABLE beyond the far limit, and the reason names BOTH numbers', () => {
        const far: LinkGeoOrigin = { ...BCN, latitude: BCN.latitude + 0.5 };
        const d = resolveLinkAnchor(BCN, far, '2026-08-21T00:00:00.000Z');
        expect(d.verdict).toBe('INADVISABLE');
        // The anchor is still offered — the refusal carries its escape hatch.
        expect(d.anchor).not.toBeNull();
        expect(d.reason).toBeTruthy();
        expect(d.reason!).toContain('km');
        expect(d.separationM!).toBeGreaterThan(FAR_SEPARATION_M);
    });

    it('IMPOSSIBLE with a null anchor when the SOURCE has no site — never a zero transform', () => {
        const d = resolveLinkAnchor(BCN, null, '2026-08-21T00:00:00.000Z');
        expect(d.verdict).toBe('IMPOSSIBLE');
        expect(d.anchor).toBeNull();
        // "I could not tell" must never share a value with "they are in the same place".
        expect(d.separationM).toBeNull();
        expect(d.reason).toBeTruthy();
    });

    it('IMPOSSIBLE when the HOST has no site', () => {
        const d = resolveLinkAnchor(null, BCN, '2026-08-21T00:00:00.000Z');
        expect(d.verdict).toBe('IMPOSSIBLE');
        expect(d.anchor).toBeNull();
    });

    it('records separation as NULL, never 0, on a hand-placed anchor with no source origin', () => {
        const a = explicitAnchor(
            { east: 5, north: -3, elevation: 0, rotationY: 0 }, BCN, null, '2026-08-21T00:00:00.000Z',
        );
        expect(a.mode).toBe('explicit');
        expect(a.separationM).toBeNull();
        expect(a.sourceOrigin).toBeNull();
        expect(a.transform.east).toBe(5);
    });

    it('enuOffset rotates by the DIFFERENCE of true norths, not either value', () => {
        const t = enuOffset({ ...BCN, trueNorth: 0.1 }, { ...BCN, trueNorth: 0.4 });
        expect(t.rotationY).toBeCloseTo(0.3, 10);
    });

    it('geoSeparationM is symmetric and zero for identical origins', () => {
        expect(geoSeparationM(BCN, BCN)).toBeCloseTo(0, 6);
        const other: LinkGeoOrigin = { ...BCN, latitude: 41.4 };
        expect(geoSeparationM(BCN, other)).toBeCloseTo(geoSeparationM(other, BCN), 6);
    });
});

describe('§LINK-ENGINE-PROOF · LinkedModelStore round-trips through the snapshot', () => {
    const HOST = 'proj-host';

    function ref(sourceProjectId: string, hostProjectId = HOST): LinkedModelRef {
        return LinkedModelRefSchema.parse({
            id: createLinkedModelId(),
            sourceProjectId,
            sourceProjectName: 'Podium',
            hostProjectId,
            pin: { mode: 'pinned', versionId: 'v-1', versionLabel: 'v1', pinnedAt: '2026-08-21T00:00:00.000Z' },
            anchor: {
                mode: 'shared-geo-origin',
                transform: { east: 10, north: 20, elevation: 0, rotationY: 0 },
                hostOrigin: null, sourceOrigin: null, separationM: null,
                resolvedAt: '2026-08-21T00:00:00.000Z',
            },
            display: 'massing',
            discipline: 'architectural',
            linkedAt: '2026-08-21T00:00:00.000Z',
        });
    }

    beforeEach(() => { linkedModelStore.clear(); });

    it('mints a valid branded id that the schema accepts', () => {
        const id = createLinkedModelId();
        expect(isLinkedModelId(id)).toBe(true);
        expect(id.startsWith('lnk_')).toBe(true);
        expect(isLinkedModelId('wall_123')).toBe(false);
        expect(isLinkedModelId(42)).toBe(false);
    });

    it('serialize → restore preserves every ref for the SAME host', () => {
        const a = ref('proj-a');
        const b = ref('proj-b');
        linkedModelStore.put(a);
        linkedModelStore.put(b);
        const snap = linkedModelStore.serialize();
        expect(snap.links).toHaveLength(2);

        linkedModelStore.clear();
        expect(linkedModelStore.size()).toBe(0);

        const dropped = linkedModelStore.restore(snap, HOST);
        expect(dropped).toBe(0);
        expect(linkedModelStore.size()).toBe(2);
        expect(linkedModelStore.get(a.id)?.sourceProjectId).toBe('proj-a');
        expect(linkedModelStore.get(a.id)?.anchor.transform.east).toBe(10);
    });

    /** C13 §3.13 rule 3 — a ref naming another host is DROPPED and COUNTED. */
    it('drops and COUNTS a ref whose hostProjectId is a different project', () => {
        const mine = ref('proj-a', HOST);
        const theirs = ref('proj-b', 'proj-someone-else');
        const dropped = linkedModelStore.restore(
            { version: 1, links: [mine, theirs] }, HOST,
        );
        expect(dropped).toBe(1);
        expect(linkedModelStore.size()).toBe(1);
        expect(linkedModelStore.get(mine.id)).toBeDefined();
        expect(linkedModelStore.get(theirs.id)).toBeUndefined();
    });

    it('keeps every ref when the host id is UNKNOWN — absent ≠ mismatched', () => {
        const a = ref('proj-a', HOST);
        const b = ref('proj-b', 'proj-other');
        expect(linkedModelStore.restore({ version: 1, links: [a, b] }, null)).toBe(0);
        expect(linkedModelStore.size()).toBe(2);
    });

    it('hasSource refuses a duplicate link by source project', () => {
        linkedModelStore.put(ref('proj-a'));
        expect(linkedModelStore.hasSource('proj-a')).toBe(true);
        expect(linkedModelStore.hasSource('proj-z')).toBe(false);
    });

    it('restore of null/undefined is a clean empty, not a throw', () => {
        expect(linkedModelStore.restore(null, HOST)).toBe(0);
        expect(linkedModelStore.restore(undefined, HOST)).toBe(0);
        expect(linkedModelStore.size()).toBe(0);
    });

    it('remove returns what it removed so the caller can report it', () => {
        const a = ref('proj-a');
        linkedModelStore.put(a);
        expect(linkedModelStore.remove(a.id)?.sourceProjectId).toBe('proj-a');
        expect(linkedModelStore.remove(a.id)).toBeUndefined();
    });
});
