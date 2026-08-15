/**
 * §FIX-OVERRIDE-PANEL-UNDETERMINED (GR-10, the []-means-unknown drain) —
 * DIFFERENTIATING suite for `overridePanelModel.ts`, the pure half of
 * OverridePanel's render decision.
 *
 * The defect these pin: `instance?.localOverrides` / `?.graphicOverrides ?? []`
 * rendered a view with NO ViewIntentInstance (unbound — nothing examined)
 * exactly like a view examined and found to carry zero overrides ("Clean").
 * Every "unknown" case below FAILS against the old `?? []` shape, and the
 * central pair asserts the two inputs differ ONLY on the new discriminator.
 */
import { describe, it, expect } from 'vitest';
import {
    determineOverrideLayer,
    overrideLayerRefusalText,
} from '../overridePanelModel';

const EMPTY_LAYER = {
    localOverrides: { visibilityOverrides: [], graphicOverrides: [], isolateActive: false },
};

describe('determineOverrideLayer — unbound is unknown, examined-empty is "Clean"', () => {
    it('NO instance -> undetermined (RELATIONSHIP_NOT_RECORDED), never a determined empty', () => {
        // Old shape: `instance?.localOverrides?.graphicOverrides ?? []` -> []
        // — this assertion fails against it.
        const d = determineOverrideLayer('v1', null);
        expect(d.kind).toBe('undetermined');
        if (d.kind === 'undetermined') expect(d.reason).toBe('RELATIONSHIP_NOT_RECORDED');
    });

    it('instance with an EXAMINED-EMPTY layer -> determined (the real "Clean")', () => {
        const d = determineOverrideLayer('v1', EMPTY_LAYER);
        expect(d.kind).toBe('determined');
        if (d.kind === 'determined') {
            expect(d.visibility).toEqual([]);
            expect(d.graphics).toEqual([]);
            expect(d.isolateActive).toBe(false);
        }
    });

    it('the two cases are DIFFERENT values (the collapse the ledger exists to end)', () => {
        const unbound = determineOverrideLayer('v1', null);
        const clean = determineOverrideLayer('v1', EMPTY_LAYER);
        expect(unbound.kind).not.toBe(clean.kind);
    });

    it('instance whose localOverrides layer was never written -> undetermined, not "Clean"', () => {
        const d = determineOverrideLayer('v1', {} as never);
        expect(d.kind).toBe('undetermined');
        if (d.kind === 'undetermined') expect(d.reason).toBe('RELATIONSHIP_NOT_RECORDED');
    });

    it('malformed override lists -> RELATIONSHIP_NOT_READABLE (unreadable ≠ unwritten ≠ empty)', () => {
        const d = determineOverrideLayer('v1', {
            localOverrides: { visibilityOverrides: 'corrupt', graphicOverrides: [], isolateActive: false },
        } as never);
        expect(d.kind).toBe('undetermined');
        if (d.kind === 'undetermined') expect(d.reason).toBe('RELATIONSHIP_NOT_READABLE');
    });

    it('a populated layer passes through untouched (negative control)', () => {
        const vis = [{ targetKind: 'element', targetId: 'e1', action: 'hide' }];
        const d = determineOverrideLayer('v1', {
            localOverrides: { visibilityOverrides: vis, graphicOverrides: [], isolateActive: true },
        } as never);
        expect(d.kind).toBe('determined');
        if (d.kind === 'determined') {
            expect(d.visibility).toHaveLength(1);
            expect(d.isolateActive).toBe(true);
        }
    });
});

describe('overrideLayerRefusalText — the refusal CARRIES its identity (§REFUSAL-IDENTITY)', () => {
    it('the visible text contains the closed reason token verbatim', () => {
        const d = determineOverrideLayer('v1', null);
        if (d.kind !== 'undetermined') throw new Error('control precondition failed');
        const text = overrideLayerRefusalText(d);
        expect(text).toContain('RELATIONSHIP_NOT_RECORDED');
    });

    it('unwritten and unreadable render DISTINGUISHABLE refusals', () => {
        const unwritten = determineOverrideLayer('v1', null);
        const unreadable = determineOverrideLayer('v1', {
            localOverrides: { visibilityOverrides: 1, graphicOverrides: [], isolateActive: false },
        } as never);
        if (unwritten.kind !== 'undetermined' || unreadable.kind !== 'undetermined') {
            throw new Error('control precondition failed');
        }
        expect(overrideLayerRefusalText(unwritten)).not.toEqual(overrideLayerRefusalText(unreadable));
    });
});
