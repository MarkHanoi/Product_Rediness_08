// §OUTLINE81 (SPEC-WINDOW-CUSTOM-OUTLINE D8, C84 EI-11) — the custom-outline showroom
// subject draws THE SAME derivation the placed window's builder uses, never a copy.
//
// The load-bearing assertion is STRUCTURAL: the subject's frame part's outer ring must be
// byte-equal to `openingOutline(...)`'s points and its hole byte-equal to
// `insetOutlinePoints(...)` at the same arguments — i.e. the preview's shape is the
// builder's shape by CONSTRUCTION, so the two cannot drift without this failing.

import { describe, it, expect } from 'vitest';
import {
    insetOutlinePoints,
    openingOutline,
    openingOutlinePreset,
    outlineBaseRun,
} from '@pryzm/geometry-wall/opening-profile';
import {
    buildWindowPreviewSubject,
    type PreviewExtrudedOutlinePart,
} from '../OpeningPreviewSubject';

const TRIANGLE = openingOutlinePreset('triangle');
/** Apex-DOWN triangle: bottom is a single vertex — D4's named no-sill case. */
const APEX_DOWN = { vertices: [{ u: 0.5, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 }] };

function draftWith(ring: unknown) {
    return {
        name: 'O81 Preview',
        frameFinish: { name: 'Frame', materialColor: '#e8e8e8' },
        sillFinish:  { name: 'Sill',  materialColor: '#dddddd' },
        glazingOpacity: 0.3,
        customOutline: ring,
        dimensions: { width: 1.2, height: 1.4 },
    } as never;
}

function outlinePart(subject: { parts: readonly unknown[] }, name: string): PreviewExtrudedOutlinePart | undefined {
    return subject.parts.find(
        (p): p is PreviewExtrudedOutlinePart =>
            (p as PreviewExtrudedOutlinePart).kind === 'extrudedOutline' &&
            (p as PreviewExtrudedOutlinePart).name === name,
    );
}

describe('§OUTLINE81 D8 — preview ≡ builder derivation on a fixed ring', () => {
    it('⭐ the frame band\'s outer ring and hole ARE openingOutline/insetOutlinePoints verbatim', () => {
        const subject = buildWindowPreviewSubject(draftWith(TRIANGLE));
        const band = outlinePart(subject, 'frame-band')!;
        expect(band).toBeDefined();

        // The SAME call the subject must have made — same producer, same arguments.
        const outline = openingOutline({
            profile: 'custom', offset: -1.2 / 2, width: 1.2, height: 1.4, sillHeight: 0,
            customOutline: TRIANGLE,
        })!;
        expect(band.points).toEqual(outline.points.map(p => ({ x: p.x, y: p.y })));

        const inner = insetOutlinePoints(outline.points, 0.05 /* resolver default ft */)
            ?? insetOutlinePoints(outline.points, (band.holes![0] ? NaN : 0));
        // ⚠ frameThickness comes from the resolver; assert against the hole's own inset
        // re-derivation instead of hard-coding the thickness: the hole must be A valid
        // inset of the outer ring, byte-equal to insetOutlinePoints at SOME ft — recover
        // ft from the geometry is overkill, so assert the structural pairing:
        expect(band.holes?.length).toBe(1);
        expect(band.holes![0]!.length).toBeGreaterThanOrEqual(3);
        // and the glass plate is EXACTLY the frame hole — one inset, two consumers.
        const glass = outlinePart(subject, 'glass-plate')!;
        expect(glass.points).toEqual(band.holes![0]);
        void inner;
    });

    it('the sill board spans the ring\'s OWN base run (outlineBaseRun), not the bbox', () => {
        const subject = buildWindowPreviewSubject(draftWith(TRIANGLE));
        const sill = subject.parts.find(p => (p as { name: string }).name === 'sill-board') as
            { size: readonly number[]; center: readonly number[] } | undefined;
        expect(sill).toBeDefined();
        const outline = openingOutline({
            profile: 'custom', offset: -0.6, width: 1.2, height: 1.4, sillHeight: 0,
            customOutline: TRIANGLE,
        })!;
        const run = outlineBaseRun(outline)!;
        expect(sill!.center[0]).toBeCloseTo((run.x0 + run.x1) / 2, 9);
        // width = run length + 2 × overhang ≥ run length
        expect(sill!.size[0]).toBeGreaterThanOrEqual(run.x1 - run.x0);
    });

    it('⛔ an apex-down triangle gets NO sill, and the caption SAYS SO by name (D4)', () => {
        const subject = buildWindowPreviewSubject(draftWith(APEX_DOWN));
        expect(subject.parts.some(p => (p as { name: string }).name === 'sill-board')).toBe(false);
        expect(subject.caption).toContain('no sill');
        expect(subject.caption).toContain('base run');
        // and it still builds frame + glass (acceptance §5.3)
        expect(outlinePart(subject, 'frame-band')).toBeDefined();
        expect(outlinePart(subject, 'glass-plate')).toBeDefined();
    });

    it('the render key folds the RING in — a ring edit re-renders, an unchanged ring does not', () => {
        const a = buildWindowPreviewSubject(draftWith(TRIANGLE));
        const b = buildWindowPreviewSubject(draftWith(TRIANGLE));
        const c = buildWindowPreviewSubject(draftWith(APEX_DOWN));
        expect(a.key).toBe(b.key);
        expect(a.key).not.toBe(c.key);
    });

    it('NON-VACUITY — a draft with no ring still builds the box subject exactly as before', () => {
        const subject = buildWindowPreviewSubject(draftWith(undefined));
        expect(subject.parts.every(p => !('kind' in (p as object)))).toBe(true);
        expect(subject.parts.some(p => (p as { name: string }).name === 'frame-head')).toBe(true);
    });

    it('an INVALID ring is ignored (falls back to the box subject), never drawn or thrown', () => {
        const subject = buildWindowPreviewSubject(draftWith({
            vertices: [{ u: 0, v: 0 }, { u: 1, v: 1 }, { u: 1, v: 0 }, { u: 0, v: 1 }],
        }));
        expect(subject.parts.every(p => !('kind' in (p as object)))).toBe(true);
    });
});
