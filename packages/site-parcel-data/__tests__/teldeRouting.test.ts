// §TELDE-ROUTING-PROBE — does a REAL Telde parcel reach the Canarias adapter at all?
//
// ⚠ THIS FILE WAS WRITTEN AS A PROBE, BEFORE THE FIX, AND IT WAS RED. That ordering is the
// point (§CONTEXT-DATA-HONESTY, L-422/457/467/469): the Canarias adapter, its rule pack and
// its 27 known-answer tests all shipped in f29820db, yet NOT ONE Telde parcel could reach
// them, because `registry.ts` had no Telde registration and no `TELDE_BBOX` to register.
// "The adapter exists" and "the adapter is reachable" are DIFFERENT CLAIMS, and only the
// second one is worth anything to a user standing on the land.
//
// ── THE FAILURE MODE THIS PROBE PROVED, MEASURED ON THIS BRANCH, NOT ASSUMED ─────────────
// Before the registration, `resolveRegisteredJurisdictionAt()` at the parcel below returned
//     { kind: 'none' }
// and `'none'` does NOT mean "we refused". It is read downstream as *"genuinely uncovered
// land — the estimate is honest here"* (see §L-663 in `cordobaBbox.ts`), so the parcel fell
// through every jurisdiction predicate onto `applyEstimatedZoning` and PRYZM PUBLISHED a
// fabricated envelope — the generic estimated triple — on Canarian soil whose Normas
// Urbanísticas it has never read. That is the exact collapse §L-663 was written to end,
// surviving because the hole was in the REGISTRY, not in the chokepoint.
//
// ⚠⚠ SO `'none'` IS THE DANGEROUS ANSWER HERE, NOT THE SAFE ONE. FAILED ≠ EMPTY: this probe
// asserts the three verdicts SEPARATELY and names them, so a future regression reports WHICH
// way it broke rather than a bare "expected true to be false".
//
//   'none'      → NOT REGISTERED. Falls to the fabricated estimate. THE BUG.
//   'ambiguous' → two registrations tie. Refused, honest, but Telde is unreachable.
//   'resolved'  → registered. Telde reaches `esCanariasSipu` and gets a CITED REFUSAL,
//                 because CANARIAS_ENVELOPE_VERIFIED is false. THE FIX.
//
// ⭐ REGISTERING TELDE PUBLISHES NO NUMBER. The gate stays SHUT. What changes is that the
// answer becomes a cited "PRYZM will not sign this reading" instead of a confident invented
// envelope. Never draw an unknown constraint as zero or unbounded (L-616).

import { describe, it, expect } from 'vitest';
import { resolveRegisteredJurisdictionAt } from '../src/rulepacks/registry.js';
import { TELDE_JURISDICTION_ID } from '../src/rulepacks/esCanariasSipu.js';
import {
    TELDE_BBOX,
    TELDE_INE_CODE,
    isInTelde,
    TELDE_BBOX_SOURCE,
} from '../src/providers/teldeBbox.js';

// ═════════════════════════════════════════════════════════════════════════════════════════
// THE GROUND TRUTH — ONE REAL TELDE PARCEL, RESOLVED FROM CATASTRO, NOT FROM A MAP
// ═════════════════════════════════════════════════════════════════════════════════════════
//
// Sourced 2026-08-02 from the Dirección General del Catastro OVC web service — a DIFFERENT
// system from the INSPIRE ATOM the bbox came from, which is the whole reason it is used here
// (a probe can be wrong three ways: wrong runtime, wrong property, wrong SYSTEM).
//
//   1. Consulta_RCCOOR (point → referencia catastral), EPSG:4326:
//      http://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/
//        Consulta_RCCOOR?SRS=EPSG:4326&Coordenada_X=-15.4181&Coordenada_Y=27.9973
//      → <pc1>8969903</pc1><pc2>DS5997S</pc2>, <ldt>CL ROQUE TELDE (LAS PALMAS)</ldt>
//
//   2. Consulta_CPMRC (referencia catastral → its OWN official coordinates), EPSG:4326:
//      …/Consulta_CPMRC?Provincia=&Municipio=&SRS=EPSG:4326&RC=8969903DS5997S
//      → <xcen>-15.4187717770541</xcen><ycen>27.9980118136136</ycen><srs>EPSG:4326</srs>
//
// ⚠ THE ROUND TRIP IS THE POINT. Step 2 is not decoration: it makes Catastro state the
// parcel's coordinates ITSELF rather than echoing the ones it was asked about, and `<ldt>`
// names the municipality — TELDE (LAS PALMAS) — so the parcel is Telde's by the CADASTRE's
// word, not by a rectangle's. The numbers below are step 2's output, verbatim.
const TELDE_PARCEL_RC = '8969903DS5997S';
const TELDE_PARCEL_LAT = 27.9980118136136;
const TELDE_PARCEL_LON = -15.4187717770541;

describe('§TELDE-ROUTING-PROBE — a real Telde parcel reaches the Canarias adapter', () => {
    it('the sourced bbox contains the Catastro-resolved parcel (the box is not a guess)', () => {
        // If this fails, the bbox and the parcel disagree — and since BOTH came from Catastro,
        // that would mean a CRS error, which is the classic silent failure for this island.
        expect(isInTelde(TELDE_PARCEL_LAT, TELDE_PARCEL_LON)).toBe(true);
        expect(TELDE_INE_CODE).toBe('35026');
        // The citation must travel WITH the number, or the number is unauditable.
        expect(TELDE_BBOX_SOURCE.crsOfBboxCoordinates).toBe('EPSG:4326');
        expect(TELDE_BBOX_SOURCE.url).toContain('catastro');
    });

    it('§THE-BUG — routes to a REGISTERED jurisdiction, not to `none` (the estimate hole)', () => {
        const r = resolveRegisteredJurisdictionAt(TELDE_PARCEL_LAT, TELDE_PARCEL_LON);

        // FAILED ≠ EMPTY — name the verdict, never assert a bare boolean.
        if (r.kind === 'none') {
            throw new Error(
                `§TELDE-ROUTING-PROBE FAILED — parcel ${TELDE_PARCEL_RC} ` +
                    `(${TELDE_PARCEL_LAT}, ${TELDE_PARCEL_LON}) is claimed by NO registration. ` +
                    "That is not a refusal: 'none' is read downstream as genuinely-uncovered " +
                    'land, so this parcel falls onto applyEstimatedZoning and PRYZM publishes a ' +
                    'FABRICATED envelope on Canarian soil (§L-663).',
            );
        }
        if (r.kind === 'ambiguous') {
            throw new Error(
                `§TELDE-ROUTING-PROBE FAILED — ${r.candidates.length} registrations tie at ` +
                    `${TELDE_PARCEL_RC}: ${r.candidates.map((c) => c.jurisdictionId).join(', ')}. ` +
                    'Honest, but Telde still never reaches its adapter.',
            );
        }
        expect(r.kind).toBe('resolved');
        expect(r.jurisdiction.jurisdictionId).toBe(TELDE_JURISDICTION_ID);
    });

    it('the registration is MUNICIPAL, so any future finer Canarian claim outranks it', () => {
        const r = resolveRegisteredJurisdictionAt(TELDE_PARCEL_LAT, TELDE_PARCEL_LON);
        expect(r.kind).toBe('resolved');
        if (r.kind !== 'resolved') return;
        expect(r.jurisdiction.extentResolution).toBe('municipal');
    });

    it('the bbox is the SAME OBJECT the predicate gates on (a copy is how boxes drift)', () => {
        // Both must agree at all four corners, inclusive.
        expect(isInTelde(TELDE_BBOX.minLat, TELDE_BBOX.minLon)).toBe(true);
        expect(isInTelde(TELDE_BBOX.maxLat, TELDE_BBOX.maxLon)).toBe(true);
        expect(isInTelde(TELDE_BBOX.minLat, TELDE_BBOX.maxLon)).toBe(true);
        expect(isInTelde(TELDE_BBOX.maxLat, TELDE_BBOX.minLon)).toBe(true);
    });

    it('§CRS-GUARD — the box is in DEGREES, and rejects UTM-28N metres outright', () => {
        // ⚠ THE CLASSIC SILENT FAILURE ON THIS ISLAND. The SIPU package and the Catastro
        // INSPIRE payload are both EPSG:32628 (WGS 84 / UTM zone 28N), whose easting/northing
        // for Telde are ≈ 458 000 E / 3 096 000 N. Feeding those metres to a degree predicate
        // must be REFUSED, never silently accepted as a point somewhere off Africa.
        expect(isInTelde(3_096_000, 458_000)).toBe(false);
        // And the box's own magnitudes must be degree-shaped.
        expect(Math.abs(TELDE_BBOX.maxLat)).toBeLessThanOrEqual(90);
        expect(Math.abs(TELDE_BBOX.maxLon)).toBeLessThanOrEqual(180);
        // Gran Canaria is in the WESTERN hemisphere, NORTH of the equator. A sign error is the
        // second silent failure, and it puts Telde in the Atlantic off Morocco.
        expect(TELDE_BBOX.minLat).toBeGreaterThan(27);
        expect(TELDE_BBOX.maxLat).toBeLessThan(29);
        expect(TELDE_BBOX.maxLon).toBeLessThan(0);
        expect(TELDE_BBOX.minLon).toBeGreaterThan(-16);
    });

    it('rejects non-finite input rather than admitting it (the murciaBbox convention)', () => {
        expect(isInTelde(Number.NaN, TELDE_PARCEL_LON)).toBe(false);
        expect(isInTelde(TELDE_PARCEL_LAT, Number.POSITIVE_INFINITY)).toBe(false);
    });

    it('§SPILL-IS-BOUNDED — the box does not reach Las Palmas de Gran Canaria city centre', () => {
        // Every bbox spills; what matters is that the spill is stated and bounded. The
        // provincial capital (INE 35016, ≈ 28.1248 N, 15.4300 W) is a SEPARATE municipality
        // with its own plan, and it must NOT be answered by Telde's registration.
        expect(isInTelde(28.1248, -15.43)).toBe(false);
        // Nor mainland Spain, nor Tenerife (Santa Cruz ≈ 28.4636 N, 16.2518 W).
        expect(isInTelde(28.4636, -16.2518)).toBe(false);
        expect(isInTelde(40.4168, -3.7038)).toBe(false);
    });
});
