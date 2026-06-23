// Residential building reject UX — pure reason→friendly-copy mapping + the
// error/partial modal HTML builders. Node env (no DOM): every export is a pure
// string/value function, so we assert on the mapping + emitted markup.

import { describe, expect, it } from 'vitest';
import {
    friendlyResidentialError,
    polygonAreaM2,
    buildResidentialErrorModalHtml,
    buildResidentialPartialNoticeHtml,
    RESIDENTIAL_MIN_PLATE_M2,
} from '../src/ui/residential-building/residentialError.js';

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
    it('maps the zero-apartments / no-usable-band reject to the "too small" branch and weaves in the area', () => {
        const e = friendlyResidentialError(
            'level 1 partition placed zero apartments (core/corridor leave no usable band runs)',
            280,
        );
        expect(e.kind).toBe('too-small');
        expect(e.title).toMatch(/can.?t build/i);
        expect(e.body).toContain('~280 m²');
        expect(e.body.toLowerCase()).toContain('too small');
        // Guidance names the rough minimum and an actionable fix.
        expect(e.guidance).toContain(`≥${RESIDENTIAL_MIN_PLATE_M2} m²`);
        expect(e.guidance.toLowerCase()).toMatch(/larger boundary|reduce the core/);
    });

    it('falls back to "this size" when no area is known', () => {
        const e = friendlyResidentialError('too small for the programme');
        expect(e.kind).toBe('too-small');
        expect(e.body).toContain('this size');
        expect(e.body).not.toContain('m²');
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
