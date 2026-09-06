/**
 * §SUBJECT-IS-A-PROFILE-ON-A-DECLARED-PLANE — the surface's subject really is a `Profile` on a
 * `ReferencePlane`, and the constraint-glyph layer really tells the two constraint vocabularies
 * apart.
 *
 * ⛔ **EVERY ARM READS BACK FROM THE DOM** — the layer the user experiences (audit **R14**;
 * C16 CA-21's shape applied to a UI lane). Not one arm asserts on the return value of the
 * function that produced the thing under test, and no arm asserts `ok: true`.
 *
 * ⛔ **THE FIXTURES ARE SCHEMA-PARSED, NOT HAND-TYPED.** Each profile goes through the real
 * `ProfileSchema.parse`, so a fixture that the persisted format would reject cannot certify
 * this surface. [[fake-more-capable-than-real]]: a fake built from the header cannot falsify
 * the header.
 */

import { describe, it, expect } from 'vitest';
import { ProfileSchema, ReferencePlaneSchema, type Profile, type ReferencePlane } from '@pryzm/file-format';
import { ElevationOutlineSurface } from '../../ElevationOutlineSurface';
import {
    authorableConstraintKinds,
    commitRingToProfile,
    constraintAuthoringDisposition,
    constraintStatus,
    createComponentProfilePanel,
    EVALUABLE_CONSTRAINT_KINDS,
    PERSISTED_CONSTRAINT_KINDS,
    profileToSurfaceRing,
    profileWriteBackDisposition,
} from '../index';

/* ── fixtures ─────────────────────────────────────────────────────────────── */

const U = (n: number): string => `${'0'.repeat(25)}${'0123456789ABCDEFGHJKMNPQRSTVWXYZ'[n]!}`;

const PLANE: ReferencePlane = ReferencePlaneSchema.parse({
    id: `plane_${U(1)}`,
    name: 'Front elevation',
    origin: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 1, z: 0 },
});

/** A 1.2 × 1.5 m rectangle authored as four `point` entities — the writable shape. */
function rectangleProfile(constraints: unknown[] = []): Profile {
    return ProfileSchema.parse({
        id: `prof_${U(2)}`,
        name: 'Opening',
        planeId: PLANE.id,
        entities: [
            { id: U(3), kind: 'point', data: { x: 0, z: 0 } },
            { id: U(4), kind: 'point', data: { x: 1.2, z: 0 } },
            { id: U(5), kind: 'point', data: { x: 1.2, z: 1.5 } },
            { id: U(6), kind: 'point', data: { x: 0, z: 1.5 } },
        ],
        constraints,
    });
}

/** The same rectangle with a quarter-circle head — an ARC, so NOT writable. */
function archedProfile(): Profile {
    return ProfileSchema.parse({
        id: `prof_${U(7)}`,
        name: 'Arched opening',
        planeId: PLANE.id,
        entities: [
            { id: U(3), kind: 'point', data: { x: 0, z: 0 } },
            { id: U(4), kind: 'point', data: { x: 1.2, z: 0 } },
            { id: U(5), kind: 'point', data: { x: 0.6, z: 1.5 } },
            { id: U(8), kind: 'arc', data: { center: U(5), radius: 0.6, startAngle: 0, endAngle: Math.PI } },
        ],
        constraints: [],
    });
}

/* ── ARM A — the subject ──────────────────────────────────────────────────── */

describe('§SUBJECT-IS-A-PROFILE-ON-A-DECLARED-PLANE · ARM A — a document Profile becomes the drawing', () => {
    it('⭐ the panel draws the profile, and the DOM names the PLANE it is on', () => {
        const panel = createComponentProfilePanel({ profile: rectangleProfile(), plane: PLANE });
        const svg = panel.root.querySelector('svg');
        expect(svg).not.toBeNull();
        // The plane is DECLARED and readable — the whole point of the generalisation
        // (C86 §10.6.1c: never inferred from a camera, a selection or the nearest face).
        expect(svg!.getAttribute('data-cpp-plane')).toBe(PLANE.id);
        expect(svg!.getAttribute('data-cpp-plane-name')).toBe('Front elevation');
        expect(svg!.querySelector('title')?.textContent).toContain('Front elevation');
    });

    it('⭐ the drawn polygon has one point per document point, at the document’s own coordinates', () => {
        const panel = createComponentProfilePanel({ profile: rectangleProfile(), plane: PLANE });
        const pts = panel.root.querySelector('polygon')!.getAttribute('points')!.trim().split(/\s+/);
        expect(pts).toHaveLength(4);
        // Four DISTINCT pixel positions — a collapsed drawing would still have four points.
        expect(new Set(pts).size).toBe(4);
        // And the ring is the profile's bounds, in the ONE size vocabulary (PR-8).
        const ring = profileToSurfaceRing(rectangleProfile(), PLANE);
        expect(ring.ok && ring.value.extents).toEqual({ length: 1.2, height: 1.5 });
    });

    it('⛔ NON-VACUITY — the three wall/opening callers declare NO plane, and get no plane attribute', () => {
        // If the attribute appeared unconditionally, ARM A above would pass for a surface
        // that had learned nothing.
        const s = new ElevationOutlineSurface({
            extents: { length: 4.2, height: 2.7 }, snap: (v: number) => v, minVertices: 4,
            onChanged: () => {}, onDeleteRefused: () => {}, attrPrefix: 'wpe',
        });
        expect(s.svg.hasAttribute('data-wpe-plane')).toBe(false);
        expect(s.plane).toBeNull();
    });

    it('⛔ a profile that does not evaluate REFUSES BY NAME — the panel never opens empty over it', () => {
        const collinear = ProfileSchema.parse({
            id: `prof_${U(9)}`, name: 'Flat', planeId: PLANE.id,
            entities: [
                { id: U(3), kind: 'point', data: { x: 0, z: 0 } },
                { id: U(4), kind: 'point', data: { x: 1, z: 0 } },
                { id: U(5), kind: 'point', data: { x: 2, z: 0 } },
            ],
            constraints: [],
        });
        const panel = createComponentProfilePanel({ profile: collinear, plane: PLANE });
        expect(panel.root.querySelector('svg')).toBeNull();
        expect(panel.root.getAttribute('data-cpp-refused')).toBe('profile-degenerate-extent');
        const status = panel.root.querySelector('[data-cpp-status]')!;
        expect(status.getAttribute('data-cpp-status-kind')).toBe('refusal');
        expect(status.textContent).toContain('collinear');
        expect(status.textContent).toContain('Try:');   // the live alternative (C16 CA-18)
    });
});

/* ── ARM B — the constraint-glyph layer ───────────────────────────────────── */

describe('§GLYPH-STATUS-IS-THE-C74-RECORD · ARM B — the two vocabularies are drawn differently', () => {
    it('⭐ an EVALUATED constraint and a DECLARED-ONLY one are two visibly different glyphs', () => {
        const profile = rectangleProfile([
            { id: U(10), kind: 'parallel', entityIds: [U(3), U(4)], parameterRef: null, value: null },
            { id: U(11), kind: 'tangent', entityIds: [U(5), U(6)], parameterRef: null, value: null },
        ]);
        const panel = createComponentProfilePanel({ profile, plane: PLANE });
        const evaluated = panel.root.querySelector('[data-cpp-constraint="parallel"]')!;
        const declared = panel.root.querySelector('[data-cpp-constraint="tangent"]')!;
        expect(evaluated.getAttribute('data-cpp-constraint-status')).toBe('evaluated');
        expect(declared.getAttribute('data-cpp-constraint-status')).toBe('declared-only');
        // ⭐ And the difference is VISIBLE, not merely an attribute: filled vs hollow+dashed.
        const evRect = evaluated.querySelector('rect')!;
        const dcRect = declared.querySelector('rect')!;
        expect(evRect.getAttribute('fill')).toBe('#6600FF');
        expect(dcRect.getAttribute('fill')).toBe('#fff');
        expect(dcRect.getAttribute('stroke-dasharray')).toBe('3 2');
        expect(evRect.hasAttribute('stroke-dasharray')).toBe(false);
        // ⭐ And the tooltip SAYS which it is — a tooltip identical for both would make
        // "this holds" and "this is recorded and nothing enforces it" one value.
        expect(declared.querySelector('title')!.textContent).toContain('PERSISTED ONLY');
        expect(evaluated.querySelector('title')!.textContent).not.toContain('PERSISTED ONLY');
    });

    it('⭐ a glyph that cannot be anchored EXACTLY is not drawn — and the panel SAYS so', () => {
        // The constraint names an entity that is not a vertex of the flattened ring. Nothing
        // may pick the nearest vertex (C15 §2.2.2 axis 3: containment, never proximity).
        const profile = rectangleProfile([
            { id: U(12), kind: 'coincident', entityIds: [U(3), U(13)], parameterRef: null, value: null },
        ]);
        const panel = createComponentProfilePanel({ profile, plane: PLANE });
        expect(panel.root.querySelector('[data-cpp-constraint="coincident"]')).toBeNull();
        const note = panel.root.querySelector('[data-cpp-unanchored]')!;
        expect(note.textContent).toContain("Constraint 'coincident' is not drawn");
        expect(note.textContent).toContain('not in this profile');
    });

    it('⛔ NON-VACUITY — the same coincident constraint on two real vertices IS drawn', () => {
        const profile = rectangleProfile([
            { id: U(12), kind: 'coincident', entityIds: [U(3), U(4)], parameterRef: null, value: null },
        ]);
        const panel = createComponentProfilePanel({ profile, plane: PLANE });
        expect(panel.root.querySelector('[data-cpp-constraint="coincident"]')).not.toBeNull();
        expect(panel.root.querySelector('[data-cpp-unanchored]')).toBeNull();
    });

    it('⭐ the SURFACE refuses to place a glyph on a vertex index it does not have, and COUNTS it', () => {
        // The adapter filters unplaceable constraints out before the surface sees them, so
        // this arm drives the surface DIRECTLY — otherwise `unanchoredGlyphCount` would be a
        // path nothing exercises, which is how an honest counter quietly becomes decorative.
        const s = new ElevationOutlineSurface({
            extents: { length: 1, height: 1 }, snap: (v: number) => v, minVertices: 3,
            onChanged: () => {}, onDeleteRefused: () => {}, attrPrefix: 'cpp',
        });
        s.setRing([{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }]);
        s.setConstraintGlyphs([
            { id: 'ok', kind: 'parallel', status: 'evaluated', vertexIndices: [0, 1], label: '∥' },
            { id: 'bad', kind: 'parallel', status: 'evaluated', vertexIndices: [0, 9], label: '∥' },
        ]);
        expect(s.unanchoredGlyphCount).toBe(1);
        expect(s.svg.querySelectorAll('[data-cpp-constraint-id]')).toHaveLength(1);
        expect(s.svg.querySelector('[data-cpp-constraint-id="bad"]')).toBeNull();
    });

    it('⭐ the C74 §4.6.0 arithmetic is 4 of 12 — asserted, so a silent widening fails here', () => {
        expect(PERSISTED_CONSTRAINT_KINDS).toHaveLength(12);
        expect(Object.keys(EVALUABLE_CONSTRAINT_KINDS).sort())
            .toEqual(['coincident', 'distance', 'parallel', 'perpendicular']);
        // The two that cross a NEAR-MISS spelling gap are recorded as crossing it.
        expect(EVALUABLE_CONSTRAINT_KINDS['coincident']).toBe('coincident-pp');
        expect(EVALUABLE_CONSTRAINT_KINDS['parallel']).toBe('parallel');
        const declaredOnly = PERSISTED_CONSTRAINT_KINDS.filter((k) => constraintStatus(k) === 'declared-only');
        expect(declaredOnly).toEqual([
            'horizontal', 'vertical', 'tangent', 'radius', 'angle', 'diameter',
            'equalLength', 'distancePointLine',
        ]);
    });
});

/* ── ARM C — authoring refusals (C74 §4.6.3) ──────────────────────────────── */

describe('§GLYPH-STATUS-IS-THE-C74-RECORD · ARM C — the editor REFUSES to author what nothing evaluates', () => {
    it('⭐ asking for a declared-only kind is refused, and the refusal REACHES THE SCREEN', () => {
        const panel = createComponentProfilePanel({ profile: rectangleProfile(), plane: PLANE });
        expect(panel.requestConstraint('tangent')).toBe(false);
        expect(panel.root.getAttribute('data-cpp-constraint-refused')).toBe('tangent');
        const text = panel.root.querySelector('[data-cpp-status]')!.textContent!;
        expect(text).toContain("'tangent'");                    // names the KIND
        expect(text).toContain('no evaluator exists');          // names the REASON
        expect(text).toContain('coincident');                   // names the ALTERNATIVE
    });

    it('⭐ `fixed` is refused for the OTHER reason — executable, but nowhere to persist it', () => {
        const panel = createComponentProfilePanel({ profile: rectangleProfile(), plane: PLANE });
        expect(panel.requestConstraint('fixed')).toBe(false);
        expect(panel.root.querySelector('[data-cpp-status]')!.textContent)
            .toContain('nowhere in the document to write it');
    });

    it('⛔ NON-VACUITY — an evaluable kind is ACCEPTED, so the refusal is a real restriction', () => {
        const panel = createComponentProfilePanel({ profile: rectangleProfile(), plane: PLANE });
        expect(panel.requestConstraint('perpendicular')).toBe(true);
        expect(panel.root.hasAttribute('data-cpp-constraint-refused')).toBe(false);
        expect(authorableConstraintKinds()).toEqual(['coincident', 'parallel', 'perpendicular', 'distance']);
    });

    it('every refusal carries kind + reason + alternative (C16 CA-18), for all eight', () => {
        for (const k of ['horizontal', 'vertical', 'tangent', 'radius', 'angle', 'diameter', 'equalLength', 'distancePointLine']) {
            const d = constraintAuthoringDisposition(k);
            expect(d.authorable).toBe(false);
            if (d.authorable) continue;
            expect(d.refusal.kind).toBe(k);
            expect(d.refusal.reason.length).toBeGreaterThan(20);
            expect(d.refusal.alternative).toContain('perpendicular');
        }
    });
});

/* ── ARM D — §NO-SILENT-DEPARAMETRISATION ─────────────────────────────────── */

describe('§NO-SILENT-DEPARAMETRISATION · ARM D — a lossy commit is refused, not absorbed', () => {
    it('⛔ an ARCHED profile is drawn but NOT writable — committing would replace a curve with chords', () => {
        const panel = createComponentProfilePanel({ profile: archedProfile(), plane: PLANE });
        // It DRAWS: the arc is flattened by the one evaluator, so the author sees the shape…
        expect(panel.root.querySelector('svg')).not.toBeNull();
        expect(panel.root.querySelector('polygon')!.getAttribute('points')!.split(/\s+/).length)
            .toBeGreaterThan(4);
        // …and the status line says, before any gesture, that it is read-only and why.
        expect(panel.statusText).toContain('read-only');
        expect(panel.statusText).toContain("carries a 'arc' entity");
        // …and a commit is REFUSED rather than silently writing chords.
        expect(panel.commit()).toBe(false);
        expect(panel.root.getAttribute('data-cpp-commit-refused')).toBe('profile-not-a-ring-source');
    });

    it('⛔ an expression-valued coordinate is refused for its own reason (the D4 defect, one layer over)', () => {
        const parametric = ProfileSchema.parse({
            id: `prof_${U(14)}`, name: 'Parametric', planeId: PLANE.id,
            entities: [
                { id: U(3), kind: 'point', data: { x: 0, z: 0 } },
                { id: U(4), kind: 'point', data: { x: 'Width', z: 0 } },
                { id: U(5), kind: 'point', data: { x: 'Width', z: 1.5 } },
                { id: U(6), kind: 'point', data: { x: 0, z: 1.5 } },
            ],
            constraints: [],
        });
        const d = profileWriteBackDisposition(parametric);
        expect(d.writable).toBe(false);
        if (!d.writable) expect(d.refusal.reason).toContain('freeze the formula into a literal');
    });

    it('⭐ an all-point profile IS writable, and the commit carries the moved vertex in DOCUMENT coordinates', () => {
        const profile = rectangleProfile();
        let committed: Profile | null = null;
        const panel = createComponentProfilePanel({
            profile, plane: PLANE, onCommit: (p) => { committed = p; },
        });
        expect(panel.statusText).not.toContain('read-only');
        // Move the third vertex, then commit.
        panel.surface!.setRing([
            ...panel.surface!.ring.slice(0, 2),
            { u: 1.0, v: 1.3 },
            panel.surface!.ring[3]!,
        ]);
        expect(panel.commit()).toBe(true);
        expect(committed).not.toBeNull();
        // ⭐ READ BACK OUT OF THE PROFILE THE PANEL PRODUCED, not out of `true`.
        const moved = committed!.entities.find((e) => e.id === U(5))!;
        expect(moved.data['x']).toBeCloseTo(1.0, 12);
        expect(moved.data['z']).toBeCloseTo(1.3, 12);
        // The three untouched points are untouched.
        expect(committed!.entities.find((e) => e.id === U(3))!.data).toEqual({ x: 0, z: 0 });
    });

    it('⛔ INSERTING a vertex is refused — closing the gap would mint entity ids under L-666', () => {
        const profile = rectangleProfile();
        const res = commitRingToProfile(
            profile,
            [{ u: 0, v: 0 }, { u: 0.6, v: 0 }, { u: 1.2, v: 0 }, { u: 1.2, v: 1.5 }, { u: 0, v: 1.5 }],
            { u: 0, v: 0 },
        );
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.refusal.code).toBe('profile-vertex-count-changed');
            expect(res.refusal.reason).toContain('L-666');
        }
    });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * §PROFILE-RING-IS-AUTHORABLE (lane CE-MAKE-IT-REACHABLE · L-12976)
 *
 * The arm above — "INSERTING a vertex is refused" — is DELIBERATELY LEFT INTACT
 * and is the backwards-compatibility proof for this block: without an id factory
 * the panel and the adapter behave exactly as they shipped. Supplying one is what
 * turns a vertex-nudger into a drawing surface.
 * ══════════════════════════════════════════════════════════════════════════════ */
describe('§PROFILE-RING-IS-AUTHORABLE — the panel can DRAW, and every refusal keeps its voice', () => {
    /** A caller's bare-ULID factory, deterministic so an arm can name the id it mints. */
    function minter(): () => string {
        let n = 10;
        return () => U(n++);
    }

    it('⭐ WITH an id factory, an INSERT commits — and the minted vertex is a bare `point`', () => {
        const profile = rectangleProfile();
        const res = commitRingToProfile(
            profile,
            [{ u: 0, v: 0 }, { u: 0.6, v: 0 }, { u: 1.2, v: 0 }, { u: 1.2, v: 1.5 }, { u: 0, v: 1.5 }],
            { u: 0, v: 0 },
            { mintEntityId: minter() },
        );
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.profile.entities).toHaveLength(5);
        // ⭐ The MINTED vertex is a bare point carrying only the drawn coordinates.
        expect(res.profile.entities[4]).toEqual({ id: U(10), kind: 'point', data: { x: 0, z: 1.5 } });
        // The four original ids survive in order — nothing the document anchored moved.
        expect(res.profile.entities.slice(0, 4).map((e) => e.id)).toEqual([U(3), U(4), U(5), U(6)]);
    });

    it('⭐ a DELETE commits too, and drops exactly the tail id', () => {
        const profile = rectangleProfile();
        const res = commitRingToProfile(
            profile,
            [{ u: 0, v: 0 }, { u: 1.2, v: 0 }, { u: 1.2, v: 1.5 }],
            { u: 0, v: 0 },
            { mintEntityId: minter() },
        );
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.profile.entities.map((e) => e.id)).toEqual([U(3), U(4), U(5)]);
    });

    it('⛔ fewer than three vertices is refused by NAME, even with a factory', () => {
        const res = commitRingToProfile(
            rectangleProfile(), [{ u: 0, v: 0 }, { u: 1.2, v: 0 }], { u: 0, v: 0 },
            { mintEntityId: minter() },
        );
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.refusal.reason).toContain('at least 3');
    });

    it('⛔ C111 §1.3-b — a CONSTRAINED profile refuses a count change, and still admits a MOVE', () => {
        const constrained = rectangleProfile([
            { id: U(9), kind: 'coincident', entityIds: [U(3), U(4)], parameterRef: null, value: null },
        ]);
        const grow = commitRingToProfile(
            constrained,
            [{ u: 0, v: 0 }, { u: 0.6, v: 0 }, { u: 1.2, v: 0 }, { u: 1.2, v: 1.5 }, { u: 0, v: 1.5 }],
            { u: 0, v: 0 }, { mintEntityId: minter() },
        );
        expect(grow.ok).toBe(false);
        if (!grow.ok) {
            expect(grow.refusal.code).toBe('profile-constrained-ring-change');
            expect(grow.refusal.alternative).toContain('remove the constraints');
        }
        const move = commitRingToProfile(
            constrained,
            [{ u: 0, v: 0 }, { u: 1.1, v: 0 }, { u: 1.1, v: 1.5 }, { u: 0, v: 1.5 }],
            { u: 0, v: 0 }, { mintEntityId: minter() },
        );
        expect(move.ok, 'identity is unchanged, so nothing is re-anchored').toBe(true);
    });

    it('⭐ THE DOM: a writable profile with a factory gets a Draw/Finish/Cancel trio; without one it gets none', () => {
        const withMint = createComponentProfilePanel({
            profile: rectangleProfile(), plane: PLANE, mintEntityId: minter(), attrPrefix: 'dm',
        });
        expect(withMint.root.querySelector('[data-dm-draw]')).not.toBeNull();
        expect(withMint.root.querySelector('[data-dm-finish]')).not.toBeNull();
        expect(withMint.root.querySelector('[data-dm-cancel-draw]')).not.toBeNull();

        const withoutMint = createComponentProfilePanel({
            profile: rectangleProfile(), plane: PLANE, attrPrefix: 'nm',
        });
        expect(withoutMint.root.querySelector('[data-nm-draw]'),
            'no factory, no affordance — a draw button whose commit must refuse is a button that lies').toBeNull();
        expect(withoutMint.beginDraw()).toBe(false);
        expect(withoutMint.statusText).toContain('no id factory');
    });

    it('⭐ THE GESTURE: Draw → three clicks → Finish replaces the ring, and the commit writes the drawn triangle', () => {
        let committed: Profile | null = null;
        const panel = createComponentProfilePanel({
            profile: rectangleProfile(), plane: PLANE, mintEntityId: minter(),
            marginFraction: 0.5, attrPrefix: 'dg',
            onCommit: (p) => { committed = p; },
        });
        const surface = panel.surface!;
        expect(surface.ring).toHaveLength(4);

        (panel.root.querySelector('[data-dg-draw]') as HTMLElement).click();
        expect(panel.mode).toBe('polyline');
        for (const pt of [{ u: 0.4, v: 0.4 }, { u: 1.4, v: 0.4 }, { u: 0.9, v: 1.4 }]) {
            const px = surface.toPx(pt);
            surface.svg.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true, clientX: px.x, clientY: px.y, shiftKey: true,
            }));
        }
        expect(surface.draft).toHaveLength(3);
        expect(surface.ring, 'the committed ring is untouched until Finish').toHaveLength(4);

        (panel.root.querySelector('[data-dg-finish]') as HTMLElement).click();
        expect(panel.mode).toBe('select');
        expect(surface.ring, 'the drawn triangle IS the ring').toHaveLength(3);

        expect(panel.commit()).toBe(true);
        expect(committed).not.toBeNull();
        expect(committed!.entities).toHaveLength(3);
    });

    it('⛔ FINISH under the floor is NAMED and KEEPS the draft — the author\'s work is not thrown away', () => {
        const panel = createComponentProfilePanel({
            profile: rectangleProfile(), plane: PLANE, mintEntityId: minter(), attrPrefix: 'fl',
        });
        const surface = panel.surface!;
        panel.beginDraw();
        for (const pt of [{ u: 0.2, v: 0.2 }, { u: 0.8, v: 0.2 }]) {
            const px = surface.toPx(pt);
            surface.svg.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true, clientX: px.x, clientY: px.y, shiftKey: true,
            }));
        }
        expect(panel.finishDraw()).toBe(false);
        expect(panel.statusText).toContain('at least 3');
        expect(surface.draft, 'the two placed vertices are still there').toHaveLength(2);
        expect(surface.ring, 'and the original ring is untouched').toHaveLength(4);
    });

    it('⭐ marginFraction pads the SHEET and not the geometry: the same ring commits identically', () => {
        const profile = rectangleProfile();
        const flush = profileToSurfaceRing(profile, PLANE, {});
        const padded = profileToSurfaceRing(profile, PLANE, {}, { marginFraction: 0.5 });
        expect(flush.ok && padded.ok).toBe(true);
        if (!flush.ok || !padded.ok) return;
        expect(padded.value.extents.length).toBeGreaterThan(flush.value.extents.length);
        const a = commitRingToProfile(profile, flush.value.ring, flush.value.origin);
        const b = commitRingToProfile(profile, padded.value.ring, padded.value.origin);
        expect(a.ok && b.ok).toBe(true);
        if (!a.ok || !b.ok) return;
        expect(b.profile.entities).toEqual(a.profile.entities);
    });
});
