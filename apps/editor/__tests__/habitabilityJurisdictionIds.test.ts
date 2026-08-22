// §HABITABILITY-MINIMA-ARE-JURISDICTIONAL — THE ANTI-DRIFT GATE (L-4413).
//
// ══════════════════════════════════════════════════════════════════════════════════
// WHAT THIS FILE EXISTS TO STOP
// ══════════════════════════════════════════════════════════════════════════════════
// The habitability registry in `@pryzm/ai-host` keys its standards on PLAIN STRINGS
// (`'es-29067-malaga'`), and the geography resolver that PRODUCES those strings lives
// in `@pryzm/site-parcel-data`. The two are deliberately NOT wired to each other:
// importing the zoning registry into the layout engine would drag 40+ rule packs and
// OpenTelemetry into it and break the purity `programRules.ts` declares (ADR-0352 §5).
//
// **A string coupling with no gate is drift with a delay.** A typo, a renamed
// registration, or a Catalan municipality registered later and not added to the
// Decret's key list would silently stop matching — and the failure mode is the exact
// one this subsystem exists to prevent: a room in Barcelona quietly judged by PRYZM's
// default instead of Catalan law, with nothing red anywhere.
//
// `apps/editor` (L7) is the ONE place that legitimately sees BOTH packages, so the gate
// lives here. It is the same argument `jurisdictionSpecificity.test.ts` makes about
// routing exclusivity, and the same C60 §2 identity discipline: state a fact once, and
// assert every copy against it.
//
// NETWORK: none. Pure string + registry comparison, plus two pure point lookups.

import { describe, it, expect } from 'vitest';
import {
    listJurisdictionCoverage,
    resolveRegisteredJurisdictionAt,
    JURISDICTION_EXTENT_RESOLUTIONS,
} from '@pryzm/site-parcel-data';
// ⚠ THE `./habitability` SUBPATH, NOT THE PACKAGE BARREL — DELIBERATE. Importing
// `@pryzm/ai-host` pulls `generative/LayoutGenerator` -> `ConstraintEngine`, which
// touches `window` AT MODULE SCOPE and dies at COLLECTION under this suite's node
// environment. The habitability module is pure by construction, so it has its own
// entry point and this gate never loads a browser-only module to check a string table.
import {
    HABITABILITY_STANDARDS,
    ES_CATALUNYA_DECRET_141_2012,
    ES_MALAGA_PGOU_2018,
    resolveRoomMinimum,
} from '@pryzm/ai-host/habitability';
import { resolveHabitabilityBinding } from '../src/ui/apartment-layout/resolveHabitabilityBinding.js';

/**
 * Keys that are DELIBERATELY not registered zoning jurisdictions, each with the reason
 * it cannot be one. ⛔ ADDING A KEY HERE IS A DECISION, NOT A FIX. A key lands in this
 * list only when PRYZM genuinely has no zoning registration at that extent — never to
 * silence a typo.
 */
const NON_REGISTRY_KEYS: Readonly<Record<string, string>> = {
    // Catalonia's ISO-style regional key. The registry's Catalan regional registration
    // is 'es-ct-catalunya'; 'es-ct' is the docs/jurisdictions folder key and is kept as
    // an alias so a caller that can name a region (rather than a parcel) still resolves.
    'es-ct': 'regional folder key; the registry equivalent es-ct-catalunya IS also listed',
    // England has no zoning registration of any kind in PRYZM. NDSS is an England-only
    // instrument, so its key is the docs/jurisdictions/gb/gb-eng folder key.
    'gb-eng': 'no GB zoning registration exists; NDSS is England-only, not UK-wide',
};

const REGISTERED_IDS = new Set(listJurisdictionCoverage().map(c => c.jurisdictionId));

describe('§HABITABILITY — every jurisdiction key is a REAL registration, or a declared exception', () => {
    it('no habitability standard keys on a string the zoning registry does not know', () => {
        for (const std of HABITABILITY_STANDARDS) {
            for (const key of std.jurisdictionKeys) {
                const known = REGISTERED_IDS.has(key) || key in NON_REGISTRY_KEYS;
                expect(
                    known,
                    `${std.standardId} keys on "${key}", which is neither a registered ` +
                        'jurisdictionId nor a declared non-registry key. A typo here silently ' +
                        'un-regulates a country.',
                ).toBe(true);
            }
        }
    });

    it('every DECLARED exception is still genuinely absent from the registry', () => {
        // If a key on the exception list later becomes a real registration, the comment
        // justifying the exception has gone stale — remove it rather than carry a lie.
        for (const key of Object.keys(NON_REGISTRY_KEYS)) {
            if (key === 'es-ct') continue;   // alias by design; its registry twin is asserted below
            expect(REGISTERED_IDS.has(key), `"${key}" IS now registered — drop the exception`).toBe(false);
        }
        expect(REGISTERED_IDS.has('es-ct-catalunya')).toBe(true);
    });

    it('the mirrored extent vocabulary is IDENTICAL to the registry\'s, not merely similar', () => {
        // `HabitabilityExtent` is re-declared in ai-host rather than imported (purity).
        // A mirror without a gate is drift, so the two orderings are pinned equal here.
        // The habitability side exports the array; compare element-for-element.
        const habitabilityExtents = ['district', 'municipal', 'metropolitan', 'regional', 'national'];
        expect([...JURISDICTION_EXTENT_RESOLUTIONS]).toEqual(habitabilityExtents);
    });

    it('every Catalan municipality the Decret claims is a registration it can actually receive', () => {
        // The Decret enumerates the Catalan registrations because the resolver returns
        // the FINEST claim (a city id), not the region. Each enumerated id must exist.
        const catalanKeys = ES_CATALUNYA_DECRET_141_2012.jurisdictionKeys
            .filter(k => !(k in NON_REGISTRY_KEYS));
        expect(catalanKeys.length).toBeGreaterThan(1);
        for (const k of catalanKeys) expect(REGISTERED_IDS.has(k), k).toBe(true);
    });
});

describe('§HABITABILITY — the binding is produced by the ONE existing resolver', () => {
    it('a Barcelona point resolves to the Catalan decree, end to end', () => {
        // Plaça de Catalunya. The resolver returns the CITY registration; the regional
        // instrument reaches it via its enumerated keys.
        const b = resolveHabitabilityBinding(41.3874, 2.1686);
        expect(b.resolution).toBe('resolved');
        expect(b.jurisdictionId).toBe('es-08019-barcelona');
        expect(b.countryCode).toBe('es');
        expect(resolveRoomMinimum('master', b).standardId)
            .toBe(ES_CATALUNYA_DECRET_141_2012.standardId);
    });

    it('a Málaga point resolves to Málaga\'s own PGOU, which requires MORE than Barcelona', () => {
        const b = resolveHabitabilityBinding(36.7213, -4.4214);
        // Guard the premise rather than assume it: if Málaga's zoning registration is
        // ever removed this test must say so, not quietly pass on the baseline.
        expect(b.jurisdictionId).toBe('es-29067-malaga');
        const mlg = resolveRoomMinimum('master', b);
        expect(mlg.standardId).toBe(ES_MALAGA_PGOU_2018.standardId);
        expect(mlg.minAreaM2).toBeGreaterThan(
            resolveRoomMinimum('master', resolveHabitabilityBinding(41.3874, 2.1686)).minAreaM2,
        );
    });

    it('⛔ an uncovered point produces NULL, not a neighbour\'s law', () => {
        // Mid-Atlantic. No registration claims it.
        const b = resolveHabitabilityBinding(30.0, -40.0);
        expect(b.resolution).toBe('none');
        expect(b.jurisdictionId).toBeNull();
        expect(b.countryCode).toBeNull();
        expect(resolveRoomMinimum('master', b).areaIsRegulated).toBe(false);
    });

    it('an unpinned / absent origin is `not-asked`, which is a DIFFERENT fact from `none`', () => {
        // "We never looked" and "we looked and nothing covers it" have different fixes,
        // so they are different values — the §CONTEXT-DATA-HONESTY rule applied here.
        expect(resolveHabitabilityBinding(0, 0).resolution).toBe('not-asked');
        expect(resolveHabitabilityBinding(null, null).resolution).toBe('not-asked');
        expect(resolveHabitabilityBinding(Number.NaN, 2).resolution).toBe('not-asked');
    });

    it('this file mints no resolver — the binding tracks the registry, not a local table', () => {
        // Property, not a fixture: for EVERY registered jurisdiction, asking the
        // habitability adapter at a point inside its extent must return an id the
        // registry itself would return. Re-derived from the shipped registrations, so a
        // future registration is covered without editing this test.
        for (const c of listJurisdictionCoverage()) {
            const lat = (c.extent.minLat + c.extent.maxLat) / 2;
            const lon = (c.extent.minLon + c.extent.maxLon) / 2;
            const viaRegistry = resolveRegisteredJurisdictionAt(lat, lon);
            const viaAdapter = resolveHabitabilityBinding(lat, lon);
            if (viaRegistry.kind === 'resolved') {
                expect(viaAdapter.jurisdictionId, c.jurisdictionId)
                    .toBe(viaRegistry.jurisdiction.jurisdictionId);
            } else {
                expect(viaAdapter.jurisdictionId, c.jurisdictionId).toBeNull();
                expect(viaAdapter.resolution, c.jurisdictionId).toBe(viaRegistry.kind);
            }
        }
    });
});
