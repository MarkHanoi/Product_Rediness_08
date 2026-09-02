/**
 * §EMPTY-LAYER-IS-ABSENT — **C86 §10.1 PR-9's named obligation, discharged.**
 *
 * PR-9: *"A universal surface MUST carry its own equivalent of
 * `WallProfileNonRegressionBaseline.test.ts` §(A2a): **the general path must not change one
 * byte of the rectangle**, pinned, before it is admitted anywhere."*
 *
 * This is that pin. `fixtures/elevationOutlineSurface.bytes.json` was generated from the
 * **UNMODIFIED** `ElevationOutlineSurface.ts` (its `__provenance` block records the subject
 * file's sha256 at generation time, `9837d091…`, and the generator was deleted in the same
 * commit — a probe that can rewrite its own fixture proves nothing). Every arm below drives
 * the surface with one of the three live callers' EXACT option sets and compares
 * `svg.outerHTML` to the pre-change bytes.
 *
 * ⛔ **WHY BYTES AND NOT BEHAVIOUR.** Phase 4F adds a plane declaration and a constraint-glyph
 * layer to a surface with three shipped callers. Both are *absent*, not *empty*, when
 * undeclared — and "absent" versus "an empty `<g>`" is exactly the difference a behavioural
 * assertion cannot see and a byte comparison can. An empty layer would also shift
 * `_handleLayer`'s sibling index, which is what the wall modal's own chrome test walks.
 *
 * ⛔ **NON-VACUITY IS ASSERTED, NOT ASSUMED.** The last describe block proves the fixture can
 * FAIL — a glyph or a plane changes the bytes. Without it, a fixture comparison that always
 * passes would be indistinguishable from one that pins nothing (L-10930's shape).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ElevationOutlineSurface } from '../../ElevationOutlineSurface';

const FIXTURE = JSON.parse(
    readFileSync(resolve(__dirname, 'fixtures/elevationOutlineSurface.bytes.json'), 'utf8'),
) as Record<string, string> & { __provenance: Record<string, string> };

const noop = (): void => {};
const snap = (v: number, on: boolean): number => (on ? Math.round(v / 0.05) * 0.05 : v);

/** The three live callers' EXACT option sets, plus the pad-floor box. */
const ARMS = [
    { arm: 'wall-profile-modal', extents: { length: 4.2, height: 2.7 }, minVertices: 4, attrPrefix: 'wpe', box: [520, 360] },
    { arm: 'window-outline-dialog', extents: { length: 1.2, height: 1.4 }, minVertices: 3, attrPrefix: 'woe', box: [420, 320] },
    { arm: 'finish-type-outline', extents: { length: 1.2, height: 1.4 }, minVertices: 3, attrPrefix: 'fteo', box: [300, 240] },
    { arm: 'tiny-box-pad-floor', extents: { length: 4.2, height: 2.7 }, minVertices: 4, attrPrefix: 'wpe', box: [64, 64] },
] as const;

function rect(e: { length: number; height: number }): { u: number; v: number }[] {
    return [{ u: 0, v: 0 }, { u: e.length, v: 0 }, { u: e.length, v: e.height }, { u: 0, v: e.height }];
}

function build(a: (typeof ARMS)[number]): ElevationOutlineSurface {
    const s = new ElevationOutlineSurface({
        extents: a.extents, snap, minVertices: a.minVertices,
        onChanged: noop, onDeleteRefused: noop, attrPrefix: a.attrPrefix,
    });
    s.refitTo(a.box[0], a.box[1]);
    return s;
}

describe('§EMPTY-LAYER-IS-ABSENT · PR-9 — the general path changes NO byte of the existing arms', () => {
    it('the fixture predates the change and says so', () => {
        expect(FIXTURE.__provenance.subjectFile).toBe('apps/editor/src/ui/ElevationOutlineSurface.ts');
        expect(FIXTURE.__provenance.subjectSha256AtGeneration).toMatch(/^[0-9a-f]{64}$/);
        // 4 arms × 3 states — a shrunken fixture would silently stop pinning arms.
        expect(Object.keys(FIXTURE).filter((k) => k.includes(':'))).toHaveLength(12);
    });

    for (const a of ARMS) {
        it(`${a.arm} — empty ring, rectangle, and an open polyline draft are all byte-identical`, () => {
            const s = build(a);
            expect(s.svg.outerHTML).toBe(FIXTURE[`${a.arm}:empty`]);
            s.setRing(rect(a.extents));
            expect(s.svg.outerHTML).toBe(FIXTURE[`${a.arm}:rectangle`]);
            s.setMode('polyline');
            expect(s.svg.outerHTML).toBe(FIXTURE[`${a.arm}:polyline-empty-draft`]);
        });
    }

    it('⭐ setting glyphs to [] on a surface that never had any is still byte-identical', () => {
        // The path a caller takes when a profile carries no constraints at all: it must not
        // leave an empty <g> behind, because that <g> is a byte and the arms above are pinned.
        const a = ARMS[0];
        const s = build(a);
        s.setRing(rect(a.extents));
        s.setConstraintGlyphs([]);
        expect(s.svg.outerHTML).toBe(FIXTURE[`${a.arm}:rectangle`]);
    });

    it('⭐ a glyph ADDED and then REMOVED returns the surface to the pinned bytes', () => {
        // The layer is removed, not emptied — a surface that has *ever* held a glyph must be
        // indistinguishable from one that never did.
        const a = ARMS[0];
        const s = build(a);
        s.setRing(rect(a.extents));
        s.setConstraintGlyphs([
            { id: 'c1', kind: 'horizontal', status: 'declared-only', vertexIndices: [0, 1], label: 'H' },
        ]);
        expect(s.svg.outerHTML).not.toBe(FIXTURE[`${a.arm}:rectangle`]);
        s.setConstraintGlyphs([]);
        expect(s.svg.outerHTML).toBe(FIXTURE[`${a.arm}:rectangle`]);
    });
});

describe('§EMPTY-LAYER-IS-ABSENT · ⛔ NON-VACUITY — the fixture CAN fail', () => {
    it('a declared plane changes the bytes (so "absent" is a real state, not a no-op)', () => {
        const a = ARMS[0];
        const s = new ElevationOutlineSurface({
            extents: a.extents, snap, minVertices: a.minVertices,
            onChanged: noop, onDeleteRefused: noop, attrPrefix: a.attrPrefix,
            plane: { id: 'plane-front', name: 'Front' },
        });
        s.refitTo(a.box[0], a.box[1]);
        expect(s.svg.outerHTML).not.toBe(FIXTURE[`${a.arm}:empty`]);
        expect(s.svg.getAttribute('data-wpe-plane')).toBe('plane-front');
    });

    it('a glyph changes the bytes', () => {
        const a = ARMS[0];
        const s = build(a);
        s.setRing(rect(a.extents));
        s.setConstraintGlyphs([
            { id: 'c1', kind: 'parallel', status: 'evaluated', vertexIndices: [0, 1], label: '∥' },
        ]);
        expect(s.svg.outerHTML).not.toBe(FIXTURE[`${a.arm}:rectangle`]);
    });
});
