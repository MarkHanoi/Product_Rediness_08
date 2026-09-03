/**
 * §COMPONENT-PREVIEW — the PURE half: evaluation → mesh data.
 *
 * What is pinned here is L-127 applied to components: the subject's numbers ARE
 * `bakeFamilyInstance`'s numbers — the SAME call the placed component's
 * committer makes — and the preview invents NOTHING. The Window fixture mirrors
 * the U-SEED starter (§64: `GlassWidth = Width - 2 * FrameWidth`) with the
 * glazing profile parameter-bound, so the glass geometry is asserted at two
 * valuations: Width 1200 → 1.050 m, Width 1400 → 1.250 m (runtime mm → document
 * metres across `§4D-ONE-LENGTH-SEAM`).
 *
 * ⚠ The renderer is not exercised: happy-dom has no WebGL, and a mocked context
 * would be a fake more capable than the real thing. The renderer's obligations
 * are P2/P3-gated (`check-three-imports`, `check-raf-count`) and its draw
 * honesty is pinned in `ElementPreviewFailureReporting.spec.ts`.
 */

import { describe, it, expect } from 'vitest';
import { buildComponentPreviewSubject } from '../componentPreviewSubject';
import { isMeshPart, type PreviewMeshPart } from '../../element-preview/OpeningPreviewSubject';
import {
    makeWindowFamily,
    span,
    P_WIDTH,
    SOL_BOOL,
    TYPE_STD,
} from './windowFixture';

function meshParts(parts: readonly unknown[]): PreviewMeshPart[] {
    return (parts as PreviewMeshPart[]).filter((p) => isMeshPart(p));
}

describe('§COMPONENT-PREVIEW — evaluation → mesh data (the §64 numbers, in geometry)', () => {
    it('⭐⭐ Width 1200 → the GLASS MESH is 1.050 m wide; Width 1400 → 1.250 m — the formula reaches the vertices, not just the table', async () => {
        const family = makeWindowFamily();

        const a = await buildComponentPreviewSubject({ family, typeId: TYPE_STD });
        expect(a.ok, JSON.stringify(!a.ok ? a : null)).toBe(true);
        if (!a.ok) return;
        // The resolver's own §64 answer rides out untouched (runtime mm).
        expect(a.resolvedValues['GlassWidth']).toBe(1050);
        expect(a.diagnostics).toHaveLength(0);

        const partsA = meshParts(a.subject.parts);
        expect(partsA, 'frame + glass, in document order').toHaveLength(2);
        const [frameA, glassA] = partsA as [PreviewMeshPart, PreviewMeshPart];
        // Independent re-measure of the buffers (never trust one probe): the
        // glazing profile spans GlassWidth across x — 1050 mm → 1.050 m.
        expect(span(glassA.position, 0)).toBeCloseTo(1.05, 6);
        // z carries Height - 2*FrameWidth = 1350 mm → 1.35 m.
        expect(span(glassA.position, 2)).toBeCloseTo(1.35, 6);
        // The frame spans Width × Height, extruded FrameWidth (75 mm) along +Y.
        expect(span(frameA.position, 0)).toBeCloseTo(1.2, 6);
        expect(span(frameA.position, 2)).toBeCloseTo(1.5, 6);
        expect(span(frameA.position, 1)).toBeCloseTo(0.075, 6);
        // The subject frames the UNION of the descriptors' own bounds.
        expect(a.subject.extent[0]).toBeCloseTo(1.2, 6);
        expect(a.subject.extent[1]).toBeCloseTo(0.075, 6);
        expect(a.subject.extent[2]).toBeCloseTo(1.5, 6);

        const b = await buildComponentPreviewSubject({
            family,
            typeId: TYPE_STD,
            instanceOverrides: { [P_WIDTH]: 1400 },
        });
        expect(b.ok).toBe(true);
        if (!b.ok) return;
        expect(b.resolvedValues['GlassWidth']).toBe(1250);
        const [frameB, glassB] = meshParts(b.subject.parts) as [PreviewMeshPart, PreviewMeshPart];
        expect(span(glassB.position, 0)).toBeCloseTo(1.25, 6);
        expect(span(frameB.position, 0)).toBeCloseTo(1.4, 6);
        expect(b.subject.extent[0]).toBeCloseTo(1.4, 6);

        // A parameter change re-dimensions the SAME topology — same triangle
        // count, different vertices. A count change here would mean the preview
        // rebuilt a different shape for the same recipe.
        expect(glassB.index.length).toBe(glassA.index.length);
        expect(glassA.index.length).toBeGreaterThan(0);
        expect(glassA.position.length).toBe(glassB.position.length);

        // The rebuild key tracks the valuation, and is stable per valuation.
        expect(b.subject.key).not.toBe(a.subject.key);
        const a2 = await buildComponentPreviewSubject({ family, typeId: TYPE_STD });
        expect(a2.ok && a2.subject.key).toBe(a.subject.key);
    });

    it('caption counts what is drawn — a complete bake says so, and never claims more solids than the document declares', async () => {
        const res = await buildComponentPreviewSubject({ family: makeWindowFamily(), typeId: TYPE_STD });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.subject.caption).toContain('Window');
        expect(res.subject.caption).toContain('Standard');
        expect(res.subject.caption).toMatch(/2 solid/);
        expect(res.unsupported).toHaveLength(0);
    });
});

describe('§COMPONENT-PREVIEW — honest degradation: no evaluation, no shape (spec §75)', () => {
    it('a BROKEN §64 expression refuses as resolver-failed, carrying the resolver\'s own typed diagnostics — and produces NO subject', async () => {
        const family = makeWindowFamily({ glassExpression: 'Width - * 2' });
        const res = await buildComponentPreviewSubject({ family, typeId: TYPE_STD });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason).toBe('resolver-failed');
        expect(res.diagnostics.length).toBeGreaterThan(0);
        expect(res.diagnostics.some((d) => d.code === 'expression-parse')).toBe(true);
        expect('subject' in res).toBe(false);
    });

    it('an UNKNOWN type refuses by name; a NULL scope refuses rather than inventing one', async () => {
        const family = makeWindowFamily();
        const unknown = await buildComponentPreviewSubject({ family, typeId: 'typ_01ARZ3NDEKTSV4RRFFQ69G5TZZ' });
        expect(!unknown.ok && unknown.reason).toBe('unknown-type');

        const none = await buildComponentPreviewSubject({ family, typeId: null });
        expect(!none.ok && none.reason).toBe('no-type');
        if (!none.ok) expect(none.message).toContain('select');
    });

    it('⭐ a PARTIAL bake draws what evaluated and NAMES what refused — the boolean solid appears in `unsupported` and the caption counts 2 of 3', async () => {
        const family = makeWindowFamily({ withBooleanSolid: true });
        const res = await buildComponentPreviewSubject({ family, typeId: TYPE_STD });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.subject.parts).toHaveLength(2);
        expect(res.unsupported).toHaveLength(1);
        expect(res.unsupported[0]!.solidId).toBe(SOL_BOOL);
        expect(res.unsupported[0]!.reason).toBe('unsupported-feature');
        expect(res.subject.caption).toMatch(/2 of 3 solid\(s\) shown — 1 refused/);
    });

    it('a document where NOTHING bakes refuses as nothing-baked, with the bake\'s own per-solid sentences', async () => {
        const family = makeWindowFamily({ withBooleanSolid: true, withoutExtrudes: true });
        const res = await buildComponentPreviewSubject({ family, typeId: TYPE_STD });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason).toBe('nothing-baked');
        expect(res.unsupported).toHaveLength(1);
        expect(res.message).toContain('boolean');
    });
});
