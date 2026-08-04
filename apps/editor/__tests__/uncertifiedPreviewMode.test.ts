// §STAGING-UNCERTIFIED-PREVIEW — unit tests for the triple gate itself. Every scenario this
// module's own header enumerates as "must never do" is pinned here as a real assertion, not just
// a comment: production build ⇒ hard no; a weak/truthy value ⇒ no; only the exact literal in a
// non-production build ⇒ yes.

import { describe, it, expect } from 'vitest';
import {
    isUncertifiedPreviewModeActive,
    uncertifiedPreviewCaveat,
} from '../src/ui/site/testMode/uncertifiedPreviewMode.js';

const LITERAL = 'i-understand-this-is-not-legally-certified';

describe('isUncertifiedPreviewModeActive', () => {
    it('is FALSE by default (no env override) — the shipped, real-build state', () => {
        expect(isUncertifiedPreviewModeActive()).toBe(false);
    });

    it('is FALSE even with the exact literal, when PROD is true — the hard production refusal', () => {
        expect(
            isUncertifiedPreviewModeActive({ PROD: true, VITE_PRYZM_UNCERTIFIED_PREVIEW: LITERAL }),
        ).toBe(false);
    });

    it('is FALSE for a weak/truthy value ("true", "1") even outside production', () => {
        expect(
            isUncertifiedPreviewModeActive({ PROD: false, VITE_PRYZM_UNCERTIFIED_PREVIEW: 'true' }),
        ).toBe(false);
        expect(
            isUncertifiedPreviewModeActive({ PROD: false, VITE_PRYZM_UNCERTIFIED_PREVIEW: '1' }),
        ).toBe(false);
    });

    it('is TRUE only for the exact literal outside production', () => {
        expect(
            isUncertifiedPreviewModeActive({ PROD: false, VITE_PRYZM_UNCERTIFIED_PREVIEW: LITERAL }),
        ).toBe(true);
    });

    it('is FALSE when no VITE_PRYZM_UNCERTIFIED_PREVIEW is set at all, even outside production', () => {
        expect(isUncertifiedPreviewModeActive({ PROD: false })).toBe(false);
    });
});

describe('uncertifiedPreviewCaveat', () => {
    it('names the jurisdiction and states this is not a buildable right', () => {
        const caveat = uncertifiedPreviewCaveat('Telde EDIF E');
        expect(caveat).toContain('Telde EDIF E');
        expect(caveat).toMatch(/TEST MODE/);
        expect(caveat).toMatch(/NOT LEGALLY CERTIFIED/);
        expect(caveat.toLowerCase()).toMatch(/never a buildable right/);
    });
});
