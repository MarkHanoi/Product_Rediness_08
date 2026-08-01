// Residential building reject UX — pure reason→friendly-copy mapping + the
// error/partial modal HTML builders. Node env (no DOM): every export is a pure
// string/value function, so we assert on the mapping + emitted markup.

import { describe, expect, it } from 'vitest';
import {
    friendlyResidentialError,
    polygonAreaM2,
    buildResidentialErrorModalHtml,
    buildResidentialPartialNoticeHtml,
} from '../src/ui/residential-building/residentialError.js';

/** The orchestrator's derived floor (`MIN_PLATE_WIDTH_M` = MIN_CORE_DIM_M 2.6 + MIN_SIDE_RUN_M 8.5).
 *  Deliberately re-stated as a literal rather than imported: `residentialError.ts` is a PURE module
 *  that must not value-import the `@pryzm/ai-host` barrel (it would drag the AI host into the
 *  editor's first-paint chunk and break these plain-Node tests). The engine-side value is pinned by
 *  `packages/ai-host/__tests__/residentialNarrowPlate.test.ts`; here we assert only that the copy
 *  echoes whatever the ENGINE put in the reason string and invents nothing. */
const MIN_PLATE_WIDTH_M = 11.1;

describe('polygonAreaM2', () => {
    it('shoelaces a 20×14 rectangle to 280 m²', () => {
        expect(polygonAreaM2([
            { x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 14 }, { x: 0, z: 14 },
        ])).toBe(280);
    });
    it('is 0 for a degenerate / under-3-point ring', () => {
        expect(polygonAreaM2([])).toBe(0);
        expect(polygonAreaM2([{ x: 0, z: 0 }, { x: 5, z: 0 }])).toBe(0);
    });
});

describe('friendlyResidentialError — reason → {title, body, guidance, kind}', () => {
    // ── §RESI-REFUSAL-TRUE (founder 2026-08-01, L-668) ────────────────────────────────────────
    // The refusal must state the quantity the ENGINE actually evaluated. The old copy quoted the
    // user's PLOT AREA against an invented ≥400 m² PLATE threshold and so contradicted itself on
    // the founder's 674 m² plot (674 > 400, yet refused). These tests FAIL against that copy.

    it('§RESI-REFUSAL-TRUE — the "too narrow" refusal quotes the MEASURED plate width and the DERIVED threshold', () => {
        const e = friendlyResidentialError(
            'plate is too narrow: the buildable plate measures 9.4 m across its short side; ' +
            'a core + corridor + one apartment run needs at least 11.1 m',
            674,
        );
        expect(e.kind).toBe('too-narrow');
        // The MEASURED limiting quantity, not the plot area.
        expect(e.body).toContain('9.4 m');
        expect(e.body).toContain(`${MIN_PLATE_WIDTH_M} m`);
        // ⚠ THE DEFECT: the plot area must NEVER appear as a feasibility threshold.
        expect(e.body).not.toContain('674');
        expect(e.guidance).not.toContain('674');
        expect(`${e.body} ${e.guidance}`).not.toContain('400 m²');
        // …and the copy must say WHY, so the user does not draw a bigger-but-equally-thin plot.
        expect(e.guidance.toLowerCase()).toContain('width');
    });

    it('§RESI-REFUSAL-TRUE — a threshold stated in the copy is never violated by the number beside it', () => {
        const e = friendlyResidentialError(
            'plate is too narrow: the buildable plate measures 9.4 m across its short side; ' +
            'a core + corridor + one apartment run needs at least 11.1 m',
        );
        const nums = [...`${e.body} ${e.guidance}`.matchAll(/([\d.]+)\s*m(?!²)/g)].map((m) => Number(m[1]));
        // Every measured value quoted must be BELOW the threshold quoted — a message that states its
        // own threshold and then shows a bigger number beside it is a defect in its own right.
        expect(nums).toContain(MIN_PLATE_WIDTH_M);
        for (const n of nums) expect(n).toBeLessThanOrEqual(MIN_PLATE_WIDTH_M);
    });

    it('§RESI-REFUSAL-TRUE — the zero-apartments reject quotes the PLATE dimensions, never the plot area', () => {
        const e = friendlyResidentialError(
            'level 1 partition placed zero apartments on a 40 m × 8 m plate ' +
            '(core/corridor leave no usable band runs (placed 0/1))',
            674,
        );
        expect(e.kind).toBe('too-small');
        expect(e.body).toContain('40 m × 8 m');
        expect(e.body).not.toContain('674');
        expect(`${e.body} ${e.guidance}`).not.toContain('400 m²');
        // The guidance must not tell the user their PLOT is too small — it is the proportions.
        expect(e.guidance.toLowerCase()).toContain('not its area');
    });

    it('degrades without plate dimensions in the reason (never invents a threshold)', () => {
        const e = friendlyResidentialError('too small for the programme');
        expect(e.kind).toBe('too-small');
        expect(`${e.body} ${e.guidance}`).not.toMatch(/≥\s*\d+\s*m²/);
    });

    it('§RESI-REFUSAL-TRUE — states NO threshold when the engine supplied none (quote-only-what-was-measured)', () => {
        // A "too narrow" reason with no threshold in it: the copy must stay silent about the number
        // rather than substitute one of its own. This is the structural guarantee that the deleted
        // RESIDENTIAL_MIN_PLATE_M2 class of defect cannot come back.
        const e = friendlyResidentialError('plate is too narrow for the programme');
        expect(e.kind).toBe('too-narrow');
        expect(e.body).not.toMatch(/at least\s*[\d.]+\s*m/);
        expect(`${e.body} ${e.guidance}`).not.toMatch(/\d+\s*m²/);
    });

    it('maps the degenerate / zero-area footprint reject', () => {
        const e = friendlyResidentialError('footprint is degenerate (zero-area plate)');
        expect(e.kind).toBe('degenerate');
        expect(e.title.toLowerCase()).toContain('boundary');
        expect(e.body.toLowerCase()).toContain('degenerate');
        expect(e.guidance.toLowerCase()).toContain('closed boundary');
    });

    it('maps the "core doesn\'t fit" reject', () => {
        const e = friendlyResidentialError("core doesn't fit on the plate", 150);
        expect(e.kind).toBe('core-too-large');
        expect(e.title.toLowerCase()).toContain('core');
        expect(e.body).toContain('~150 m²');
        expect(e.guidance.toLowerCase()).toContain('core');
    });

    it('falls through to the generic branch for an unknown reason, surfacing the raw reason', () => {
        const e = friendlyResidentialError('solver timed out unexpectedly');
        expect(e.kind).toBe('generic');
        expect(e.body).toContain('solver timed out unexpectedly');
        expect(e.guidance.length).toBeGreaterThan(0);
    });

    it('never throws on undefined / empty reason', () => {
        expect(() => friendlyResidentialError(undefined)).not.toThrow();
        const e = friendlyResidentialError('');
        expect(e.kind).toBe('generic');
        expect(e.body.length).toBeGreaterThan(0);
    });
});

describe('buildResidentialErrorModalHtml — brand chrome + error token', () => {
    it('renders the brand shell + the established rejection notice token, with an OK action', () => {
        const html = buildResidentialErrorModalHtml(friendlyResidentialError('too small', 280));
        expect(html).toContain('alm-panel');                 // brand shell
        expect(html).toContain('alm-notice alm-notice--rejected'); // established error token
        expect(html).toContain('data-action="dismiss-error"');     // OK dismiss
        expect(html).toContain('alm-select');                // brand purple button class
        expect(html).not.toContain('data-action="adjust"');  // no adjust by default
    });
    it('adds the secondary "Adjust inputs" action when asked', () => {
        const html = buildResidentialErrorModalHtml(friendlyResidentialError('too small'), { withAdjust: true });
        expect(html).toContain('data-action="adjust"');
    });
    it('escapes interpolated reason text (XSS guard)', () => {
        const html = buildResidentialErrorModalHtml(friendlyResidentialError('<img src=x onerror=alert(1)>'));
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;img');
    });
});

describe('buildResidentialPartialNoticeHtml — non-blocking partial banner', () => {
    it('is empty when nothing was rejected', () => {
        expect(buildResidentialPartialNoticeHtml(0, 8)).toBe('');
    });
    it('uses the informative (purple) token, NOT the error red, and reads "N of M"', () => {
        const html = buildResidentialPartialNoticeHtml(2, 8);
        expect(html).toContain('alm-notice alm-notice--reduced'); // informative, not --rejected
        expect(html).not.toContain('alm-notice--rejected');
        expect(html).toContain('2 of 8 apartments');
    });
    it('singularises one apartment', () => {
        const html = buildResidentialPartialNoticeHtml(1, 5);
        expect(html).toContain('1 of 5 apartment');
        expect(html).not.toContain('1 of 5 apartments');
    });
});
