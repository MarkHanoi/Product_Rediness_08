// §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) — the GENERIC tag engine, proved.
//
// What these tests assert is exactly what the ticket demanded and nothing softer:
//   1. the lifecycle is ONE engine — it behaves identically for room / door / window /
//      wall, because it is parameterised by category rather than copied per category;
//   2. running it twice is a NO-OP (idempotency), which is the property that makes an
//      "auto" button safe to press;
//   3. deleting a tagged element orphans its tag, and the engine removes it;
//   4. the mark comes from the element's REAL record — never a literal, never a
//      positional index;
//   5. ELEVATION is not plan with different numbers: the same door yields a DIFFERENT
//      anchor in a vertical view, in the view's own (H, V) frame.

import { describe, it, expect } from 'vitest';
import {
    reconcileTagSet,
    readTagTargetId,
    tagTargetKey,
    TAG_ANNOTATION_TYPE,
    type ExistingTagLike,
} from '../TagReconciler.js';
import { resolveInstanceMark, resolveTypeMark, resolveTagMarks } from '../elementMarks.js';
import { resolveAutoTagIntent } from '../AutoTagIntent.js';
import {
    planOpeningTagAnchor,
    planWallTagAnchor,
    elevationOpeningTagAnchor,
    elevationWallTagAnchor,
    openingCentreXZ,
    PLAN_OPENING_LEADER_M,
    ELEV_OPENING_LEADER_M,
} from '../tagAnchors.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

/** A 10 m wall along +X at z = 0, with one 1 m door whose LEFT EDGE is at 4 m. */
const WALL = {
    id: 'wall_1',
    levelId: 'L0',
    baseLine: [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
    ] as const,
    thickness: 0.2,
    height: 3,
    systemTypeId: 'wt_a',
    properties: { mark: 'WA-00-001' },
};

const DOOR = { elementId: 'door_1', type: 'door' as const, offset: 4, width: 1, height: 2.1, sillHeight: 0 };

const tag = (id: string, type: string, params: Record<string, unknown>): ExistingTagLike =>
    ({ id, type, parameters: params });

// ── 1. ONE engine, N categories ─────────────────────────────────────────────

describe('reconcileTagSet — one lifecycle, every category', () => {
    for (const category of ['room', 'door', 'window', 'wall'] as const) {
        it(`creates a missing tag for a live ${category}`, () => {
            const r = reconcileTagSet({
                category,
                existing: [],
                live: [{ targetId: 'e1' }, { targetId: 'e2' }],
            });
            expect(r.toCreate.map((t) => t.targetId)).toEqual(['e1', 'e2']);
            expect(r.duplicateTagIds).toEqual([]);
            expect(r.orphanTagIds).toEqual([]);
        });

        it(`removes a DUPLICATE ${category} tag and keeps the first`, () => {
            const type = TAG_ANNOTATION_TYPE[category];
            const key = tagTargetKey(category);
            const r = reconcileTagSet({
                category,
                existing: [
                    tag('t1', type, { [key]: 'e1' }),
                    tag('t2', type, { [key]: 'e1' }),
                    tag('t3', type, { [key]: 'e1' }),
                ],
                live: [{ targetId: 'e1' }],
            });
            expect(r.toCreate).toEqual([]);
            expect(r.duplicateTagIds).toEqual(['t2', 't3']);
        });

        it(`removes an ORPHAN ${category} tag when the element is deleted`, () => {
            const type = TAG_ANNOTATION_TYPE[category];
            const key = tagTargetKey(category);
            const r = reconcileTagSet({
                category,
                existing: [tag('t1', type, { [key]: 'gone' })],
                live: [],   // the element was deleted
            });
            expect(r.orphanTagIds).toEqual(['t1']);
            expect(r.toCreate).toEqual([]);
        });
    }

    it('IS IDEMPOTENT — a second run over a settled view creates, refreshes and removes NOTHING', () => {
        const key = tagTargetKey('door');
        const existing = [tag('t1', 'door-tag', { [key]: 'door_1', cachedLabel: 'D1' })];
        const live = [{ targetId: 'door_1' }];
        const r = reconcileTagSet({
            category: 'door',
            existing,
            live,
            needsRefresh: () => false,
        });
        expect(r.toCreate).toEqual([]);
        expect(r.toRefresh).toEqual([]);
        expect(r.duplicateTagIds).toEqual([]);
        expect(r.orphanTagIds).toEqual([]);
        expect(r.unchangedCount).toBe(1);
    });

    it('REFRESHES only the tag that has actually drifted', () => {
        const key = tagTargetKey('wall');
        const r = reconcileTagSet<{ targetId: string; mark: string }>({
            category: 'wall',
            existing: [
                tag('t1', 'wall-tag', { [key]: 'w1', cachedLabel: 'OLD' }),
                tag('t2', 'wall-tag', { [key]: 'w2', cachedLabel: 'FINE' }),
            ],
            live: [{ targetId: 'w1', mark: 'NEW' }, { targetId: 'w2', mark: 'FINE' }],
            needsRefresh: (p, t) => p?.cachedLabel !== t.mark,
        });
        expect(r.toRefresh.map((x) => x.tagId)).toEqual(['t1']);
        expect(r.unchangedCount).toBe(1);
    });

    it('ADOPTS a hand-placed tag (elementId key) instead of duplicating it', () => {
        // The manual DoorTagPlanToolHandler writes `elementId`; the schema documents
        // `targetElementId`. Both must be recognised or the auto-tagger doubles up.
        const viaElementId = reconcileTagSet({
            category: 'door',
            existing: [tag('t1', 'door-tag', { elementId: 'door_1' })],
            live: [{ targetId: 'door_1' }],
        });
        const viaTargetElementId = reconcileTagSet({
            category: 'door',
            existing: [tag('t1', 'door-tag', { targetElementId: 'door_1' })],
            live: [{ targetId: 'door_1' }],
        });
        expect(viaElementId.toCreate).toEqual([]);
        expect(viaTargetElementId.toCreate).toEqual([]);
    });

    it('never touches another category\'s tags in the same view', () => {
        const r = reconcileTagSet({
            category: 'door',
            existing: [
                tag('rt', 'room-tag', { roomId: 'r1' }),
                tag('dim', 'linear-dim', {}),
            ],
            live: [],
        });
        expect(r.orphanTagIds).toEqual([]);   // the room tag is NOT an orphaned door tag
    });

    it('readTagTargetId reads the category-correct key', () => {
        expect(readTagTargetId('room', { roomId: 'r1' })).toBe('r1');
        expect(readTagTargetId('wall', { elementId: 'w1' })).toBe('w1');
        expect(readTagTargetId('window', {})).toBeUndefined();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §FIX-ROOM-TAG-NOT-MOVABLE (L-309) — A RE-PROJECTION RECONCILES A ROOM TAG, NEVER REBUILDS IT.
//
// The founder drags a room tag; on the NEXT plan projection `RoomTagAutoPopulator.populate()`
// runs and finds the room's label/area drifted (e.g. a REDETECT_ROOMS renamed it). The whole
// point of reconcile-not-rebuild (L-286b) is that the tag is REFRESHED IN PLACE — it keeps its
// id, so its presentation record (the dragged `modelPoints[0]`) is left untouched and ONLY the
// reference-derived parameters change. A rebuild — delete the tag, mint a fresh one at the
// centroid — would pass "a room tag still exists after populate" and yet WIPE the drag.
//
// THE TOOTH, stated so it cannot be softened: id-STABILITY is what carries the drag. Asserting
// "a room tag exists afterwards" is vacuous — a rebuild satisfies it. The discriminator is that
// the SAME id is REFRESHED (never orphaned + recreated with a new id). That is the one thing a
// delete-and-recreate fails, and it is the property the populator's refresh (which patches only
// `parameters`, never `geometry2D`) relies on to preserve the founder's drag.
// ─────────────────────────────────────────────────────────────────────────────

describe('§FIX-ROOM-TAG-NOT-MOVABLE — a drifted room tag survives populate by being refreshed IN PLACE', () => {
    it('a renamed room REFRESHES its tag (same id) — it is NOT orphaned + recreated', () => {
        const dragged = tag('rt_dragged', 'room-tag', { roomId: 'r1', cachedLabel: 'Room' });
        const r = reconcileTagSet<{ targetId: string; name: string }>({
            category: 'room',
            existing: [dragged],
            live: [{ targetId: 'r1', name: 'Kitchen' }],          // REDETECT_ROOMS renamed it
            needsRefresh: (p, t) => p?.cachedLabel !== t.name,    // the label drifted
        });
        // Refreshed IN PLACE — the SAME id survives, and with it the tag's dragged presentation.
        expect(r.toRefresh.map((x) => x.tagId)).toEqual(['rt_dragged']);
        // THE TOOTH: a rebuild would surface it as an ORPHAN and a fresh CREATE (new id) — which
        // is exactly how the drag would be lost. reconcile does neither.
        expect(r.orphanTagIds).toEqual([]);
        expect(r.toCreate).toEqual([]);
        expect(r.duplicateTagIds).toEqual([]);
    });

    it('a settled room tag is a NO-OP — populate writes nothing, so a drag cannot even be churned', () => {
        const dragged = tag('rt_dragged', 'room-tag', { roomId: 'r1', cachedLabel: 'Kitchen' });
        const r = reconcileTagSet<{ targetId: string; name: string }>({
            category: 'room',
            existing: [dragged],
            live: [{ targetId: 'r1', name: 'Kitchen' }],          // unchanged
            needsRefresh: (p, t) => p?.cachedLabel !== t.name,
        });
        expect(r.toRefresh).toEqual([]);
        expect(r.unchangedCount).toBe(1);
        expect(r.toCreate).toEqual([]);
        expect(r.orphanTagIds).toEqual([]);
    });
});

// ── 2. The mark comes from the element's REAL record ─────────────────────────

describe('element marks — the tag is the schedule join (C28)', () => {
    const types = { getById: (id: string) => (id === 'wt_a' ? { name: 'WallA' } : undefined) };
    const codes = { getCode: (id: string) => (id === 'wall_9' ? { code: 'WA009' } : undefined) };

    it('resolves the INSTANCE mark from the record (MarkGenerator §03-1.7), not ElementCode', () => {
        expect(resolveInstanceMark(WALL, 'wall_1', codes)).toBe('WA-00-001');
        expect(resolveInstanceMark({ mark: 'DO-00-004' }, 'door_4', codes)).toBe('DO-00-004');
    });

    it('falls back to the ElementCode ONLY when the record carries no mark', () => {
        expect(resolveInstanceMark({}, 'wall_9', codes)).toBe('WA009');
        expect(resolveInstanceMark({}, 'unknown', codes)).toBeUndefined();
    });

    it('resolves the TYPE mark from the system type registry', () => {
        expect(resolveTypeMark(WALL, types)).toBe('WallA');
        expect(resolveTypeMark({ systemTypeId: 'nope' }, types)).toBeUndefined();
        expect(resolveTypeMark({}, types)).toBeUndefined();
    });

    it('DISPLAYS the type mark by default and still CARRIES the instance mark (join holds)', () => {
        const m = resolveTagMarks('wall', 'wall_1', WALL, 'type', { types, codes });
        expect(m.display).toBe('WallA');
        expect(m.instanceMark).toBe('WA-00-001');
        expect(m.typeMark).toBe('WallA');
    });

    it('falls back to the instance mark when a type-tagging view meets a typeless element', () => {
        const m = resolveTagMarks('wall', 'wall_1', { properties: { mark: 'WA-00-007' } }, 'type', { types, codes });
        expect(m.display).toBe('WA-00-007');
    });

    it('an instance-tagging view NEVER falls back to the type name', () => {
        const m = resolveTagMarks('wall', 'x', { systemTypeId: 'wt_a' }, 'instance', { types, codes });
        expect(m.display).toBeUndefined();   // no mark → no tag; never a type name in an instance bubble
    });
});

// ── 3. Intent is a property of the VIEW (P7 / C09) ───────────────────────────

describe('auto-tag intent', () => {
    it('defaults to doors + windows + walls in both projections', () => {
        expect(resolveAutoTagIntent('plan', undefined, undefined).categories).toEqual(['door', 'window', 'wall']);
        expect(resolveAutoTagIntent('elevation', undefined, undefined).categories).toEqual(['door', 'window', 'wall']);
    });

    it('defaults to the INSTANCE mark — the CODE, which is the schedule join (L-291c)', () => {
        // §FIX-TAG-CONTENT-MARK-ONLY — the default was 'type', so a window tag read "Timber
        // Casement" while the wall tag read "WA-00-005". The type name is what the SCHEDULE
        // says when you look the mark up (C28); printing it in the bubble duplicates the
        // schedule onto the drawing. The mark is what a tag IS.
        expect(resolveAutoTagIntent('plan', undefined, undefined).markSource).toBe('instance');
        // …and the type name remains available THROUGH INTENT (P7), for the view that wants it.
        expect(resolveAutoTagIntent('plan', undefined, 'type').markSource).toBe('type');
    });

    it('an explicit view switch removes a defaulted category and adds a non-defaulted one', () => {
        const i = resolveAutoTagIntent('plan', { wallTags: false, roomTags: true }, undefined);
        expect(i.categories).toEqual(['room', 'door', 'window']);
    });
});

// ── 4. Anchors: PLAN vs ELEVATION are genuinely different frames ─────────────

describe('tag anchors', () => {
    it('places a plan opening tag at the opening CENTRE (left-edge offset + width/2)', () => {
        expect(openingCentreXZ(WALL, DOOR)).toEqual({ x: 4.5, y: 0, z: 0 });
    });

    it('PLAN — the leader runs along the wall normal, in the horizontal plane', () => {
        const a = planOpeningTagAnchor(WALL, DOOR, 0)!;
        expect(a.anchor).toEqual({ x: 4.5, y: 0, z: 0 });
        // wall runs +X → left normal is (0,0,+1) → the bubble stands off in +Z, y stays 0.
        expect(a.tagPoint.x).toBeCloseTo(4.5, 6);
        expect(a.tagPoint.y).toBe(0);
        expect(a.tagPoint.z).toBeCloseTo(PLAN_OPENING_LEADER_M, 6);
    });

    it('PLAN — the wall diamond stands off on the OPPOSITE side from the opening bubbles', () => {
        const w = planWallTagAnchor(WALL, 0)!;
        expect(w.anchor).toEqual({ x: 5, y: 0, z: 0 });
        expect(w.tagPoint.z).toBeLessThan(0);   // −normal side
    });

    it('ELEVATION — the SAME door anchors in the VERTICAL plane (V = world Y), not in Z', () => {
        // Front elevation looking along −Z: H = world X, façade plane at z = 0.
        const frame = { hWorldAxis: 'x' as const, hSign: 1 as const };
        const a = elevationOpeningTagAnchor(WALL, DOOR, 0, frame, 0, 0)!;
        // anchor: H = 4.5 (the door centre), V = mid-height of the REAL sill..head span.
        expect(a.anchor.x).toBeCloseTo(4.5, 6);
        expect(a.anchor.y).toBeCloseTo(2.1 / 2, 6);
        expect(a.anchor.z).toBeCloseTo(0, 6);       // pinned to the façade
        // the bubble sits ABOVE the head — in world Y, which is the elevation's V axis.
        expect(a.tagPoint.y).toBeCloseTo(2.1 + ELEV_OPENING_LEADER_M, 6);
        expect(a.tagPoint.x).toBeCloseTo(4.5, 6);
        // and the PLAN anchor for the same door is a genuinely different point.
        expect(a.tagPoint.z).not.toBeCloseTo(planOpeningTagAnchor(WALL, DOOR, 0)!.tagPoint.z, 3);
    });

    it('ELEVATION — sill/head come from the LEVEL elevation + the real sillHeight (L-127)', () => {
        const frame = { hWorldAxis: 'x' as const, hSign: 1 as const };
        const window1 = { elementId: 'win_1', type: 'window' as const, offset: 1, width: 1.2, height: 1.4, sillHeight: 0.9 };
        const a = elevationOpeningTagAnchor(WALL, window1, 3.0 /* level L1 at +3 m */, frame, 0, 0)!;
        const sill = 3.0 + 0.9;
        const head = sill + 1.4;
        expect(a.anchor.y).toBeCloseTo((sill + head) / 2, 6);
        expect(a.tagPoint.y).toBeCloseTo(head + ELEV_OPENING_LEADER_M, 6);
    });

    it('ELEVATION — hSign is applied, so a mirrored elevation does not mirror its tags', () => {
        const a = elevationOpeningTagAnchor(WALL, DOOR, 0, { hWorldAxis: 'x', hSign: -1 }, 0, 0)!;
        // H = hSign·x = −4.5, and inverting it puts the tag back on the real world x.
        expect(a.anchor.x).toBeCloseTo(4.5, 6);
    });

    it('ELEVATION — the wall diamond sits INSIDE the façade, never above the wall top', () => {
        const frame = { hWorldAxis: 'x' as const, hSign: 1 as const };
        const a = elevationWallTagAnchor(WALL, 0, frame, 0, 0)!;
        expect(a.anchor.y).toBeCloseTo(1.5, 6);          // mid-height of a 3 m wall
        expect(a.tagPoint.y).toBeLessThanOrEqual(3 * 0.95 + 1e-9);
    });

    it('a degenerate wall yields NO anchor (and therefore no tag) rather than a NaN one', () => {
        const degenerate = { id: 'w', baseLine: [{ x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }] as const, height: 3 };
        expect(planWallTagAnchor(degenerate)).toBeNull();
        expect(planOpeningTagAnchor(degenerate, DOOR)).toBeNull();
        expect(elevationWallTagAnchor(degenerate, 0, { hWorldAxis: 'x', hSign: 1 }, 0)).toBeNull();
    });
});
