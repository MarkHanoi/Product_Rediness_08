// PW.2 (§DIAG-PARTY-WALL) — resolveBlindFacades seam tests.
//
// Confirms the ADDITIVE IDENTITY (no site data + no override ⇒ EMPTY set, so
// apartment + house with no GIS context are byte-identical), the manual override
// still works (PW.1), and the override UNIONs with the computed set.

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

    it('ADDITIVE IDENTITY: no site origin + no neighbours + no override ⇒ EMPTY', () => {
        // No site origin pinned in this unit context, no captured footprints.
        expect([...resolveBlindFacades(SHELL)]).toEqual([]);
    });

    it('empty footprints captured (no neighbours) ⇒ EMPTY', () => {
        setNeighbourFootprints(51.5, -0.12, { features: [] });
        expect([...resolveBlindFacades(SHELL)]).toEqual([]);
    });

    it('manual override (PW.1) still works + is intersected with live shell ids', () => {
        g.__pryzmBlindFacadeWallIds = ['w-north', 'stale-id-not-in-shell'];
        const blind = resolveBlindFacades(SHELL);
        expect([...blind].sort()).toEqual(['w-north']);
    });

    it('override is a UNION, never erased by an empty computed set', () => {
        g.__pryzmBlindFacadeWallIds = ['w-east'];
        setNeighbourFootprints(51.5, -0.12, { features: [] }); // no neighbours
        expect([...resolveBlindFacades(SHELL)]).toEqual(['w-east']);
    });

    it('never throws on a malformed shell / footprint input', () => {
        // @ts-expect-error — deliberately malformed to prove the never-throw guard.
        expect(() => resolveBlindFacades(null)).not.toThrow();
    });
});
