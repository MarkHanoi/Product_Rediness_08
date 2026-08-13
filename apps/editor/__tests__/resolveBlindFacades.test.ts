// PW.2 (§DIAG-PARTY-WALL) — resolveBlindFacades seam tests.
//
// Confirms the ADDITIVE IDENTITY (no site data + no override ⇒ EMPTY DETERMINED
// set, so apartment + house with no GIS context are byte-identical), the manual
// override still works (PW.1), the override UNIONs with the computed set — and,
// since GR-10, that a CRASHED resolution is a TYPED refusal (`PLANNER_THREW`),
// never an empty set. The refusal assertion is the differentiating test for the
// ledger's ARM A row: the old `catch { return new Set(); }` shape returns a
// determined-empty for the malformed input and fails it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveBlindFacades } from '../src/ui/apartment-layout/resolveBlindFacades';
import {
    setNeighbourFootprints,
    clearNeighbourFootprints,
} from '../src/ui/site/neighbourFootprintStore';

const SHELL = [
    { id: 'w-north', start: { x: -5, z: -3 }, end: { x: 5, z: -3 } },
    { id: 'w-east', start: { x: 5, z: -3 }, end: { x: 5, z: 3 } },
];

const g = globalThis as unknown as {
    __pryzmBlindFacadeWallIds?: unknown;
    __pryzmPartyWallSetbackM?: unknown;
};

/** The determined blind set, or a hard failure of the test if undetermined. */
function determinedBlind(shell: typeof SHELL): string[] {
    const d = resolveBlindFacades(shell);
    expect(d.kind).toBe('determined');
    return d.kind === 'determined' ? [...d.blind].sort() : [];
}

describe('resolveBlindFacades — PW.2 detection + PW.1 override', () => {
    beforeEach(() => {
        clearNeighbourFootprints();
        delete g.__pryzmBlindFacadeWallIds;
        delete g.__pryzmPartyWallSetbackM;
    });
    afterEach(() => {
        clearNeighbourFootprints();
        delete g.__pryzmBlindFacadeWallIds;
        delete g.__pryzmPartyWallSetbackM;
    });

    it('ADDITIVE IDENTITY: no site origin + no neighbours + no override ⇒ EMPTY, and DETERMINED', () => {
        // No site origin pinned in this unit context, no captured footprints.
        // Empty here is a REAL answer (nothing to test against), not an unknown.
        expect(determinedBlind(SHELL)).toEqual([]);
    });

    it('empty footprints captured (no neighbours) ⇒ EMPTY determined', () => {
        setNeighbourFootprints(51.5, -0.12, { features: [] });
        expect(determinedBlind(SHELL)).toEqual([]);
    });

    it('manual override (PW.1) still works + is intersected with live shell ids', () => {
        g.__pryzmBlindFacadeWallIds = ['w-north', 'stale-id-not-in-shell'];
        expect(determinedBlind(SHELL)).toEqual(['w-north']);
    });

    it('override is a UNION, never erased by an empty computed set', () => {
        g.__pryzmBlindFacadeWallIds = ['w-east'];
        setNeighbourFootprints(51.5, -0.12, { features: [] }); // no neighbours
        expect(determinedBlind(SHELL)).toEqual(['w-east']);
    });

    it('GR-10: a crashed resolution is a TYPED refusal, never an empty set — and never throws', () => {
        // @ts-expect-error — deliberately malformed to prove the never-throw guard.
        const d = resolveBlindFacades(null);
        // The old shape returned { } (an empty Set) here — "no party walls",
        // asserted by a crash. C75 §1.4: failure and emptiness are different values.
        expect(d.kind).toBe('undetermined');
        if (d.kind === 'undetermined') {
            expect(d.reason).toBe('PLANNER_THREW');
            expect(d.detail).toContain('threw');
        }
    });
});
