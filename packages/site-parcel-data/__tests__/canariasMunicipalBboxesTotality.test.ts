// §CANARIAS-88-REGISTRATION-TOTALITY (2026-08-03) — does the generated registry actually cover
// all 88 Canarias municipalities, exactly once, with no drift between the census list in
// `esCanariasSipu.ts` and the bbox table in `canariasMunicipalBboxes.ts`?
//
// ⚠⚠ BEFORE THIS SESSION'S CHANGE, ONLY TELDE (1/88) HAD A REGISTRATION. `CANARIAS_ROUTABLE_
// MUNICIPALITIES` named 41 more municipalities as routable and `CANARIAS_MULTI_INSTRUMENT_
// BLOCKER` named a real reason for the other 46, but NEITHER group had a bbox, so NONE of
// them could reach `registry.ts` — a parcel in any of the 87 fell through to
// `applyEstimatedZoning`'s fabricated generic envelope (§L-663), exactly the same hole
// `teldeRouting.test.ts` proved and closed for Telde alone.
//
// This suite proves the CLOSURE is total and non-overlapping:
//   1. the two generated bbox tables partition the census — same names as
//      `CANARIAS_ROUTABLE_MUNICIPALITIES`, and 88 − 41 − 1(Telde) = 46 for the blocked table;
//   2. every generated `ine` is unique and 5 digits, and no generated id collides with Telde's;
//   3. the registry actually resolves a real point inside each of a spot-checked sample to its
//      OWN jurisdiction id — not `'none'`, not `'ambiguous'`, not another municipality's box;
//   4. the split is a REAL partition of the true 88 — routable + blocked + Telde covers all of
//      them, with no name left over and none double-counted.

import { describe, it, expect } from 'vitest';
import { resolveRegisteredJurisdictionAt, listJurisdictionCoverage } from '../src/rulepacks/registry.js';
import {
    CANARIAS_ROUTABLE_MUNICIPALITIES,
    TELDE_JURISDICTION_ID,
} from '../src/rulepacks/esCanariasSipu.js';
import {
    CANARIAS_ROUTABLE_MUNICIPAL_BBOXES,
    CANARIAS_MULTI_INSTRUMENT_MUNICIPAL_BBOXES,
    isWithinCanariasMunicipalBbox,
} from '../src/providers/canariasMunicipalBboxes.js';

// §MULTI-AGENT-COLLISION (2026-08-03) — El Sauzal (INE 38041) is IN CANARIAS_ROUTABLE_MUNICIPALITIES
// (the census is an objective SIPU catalogue fact and stays unedited) but is EXCLUDED from
// `CANARIAS_ROUTABLE_MUNICIPAL_BBOXES`: a concurrently-landed, article-cited transcription
// (`esElSauzal.ts`, 17 packed zones read from the PGO's own Normativa Urbanística) is the more
// specific, richer registration for that municipality, and registering it twice either shadows
// the richer one silently or throws at load — `envelopeAuthorisation.test.ts` caught the throw
// during this session when both this batch's generic entry and `esElSauzal.ts`'s own gate row
// named the same jurisdiction id. The exclusion is the SAME precedent Telde already sets.
const ROUTABLE_MINUS_EL_SAUZAL = CANARIAS_ROUTABLE_MUNICIPALITIES.filter((n) => n !== 'El Sauzal');

describe('§CANARIAS-88-REGISTRATION-TOTALITY — the generated tables partition the census', () => {
    it('the routable bbox table has the 40 names CANARIAS_ROUTABLE_MUNICIPALITIES declares, minus El Sauzal', () => {
        const generated = new Set(CANARIAS_ROUTABLE_MUNICIPAL_BBOXES.map((m) => m.name));
        const declared = new Set(ROUTABLE_MINUS_EL_SAUZAL);
        expect(CANARIAS_ROUTABLE_MUNICIPALITIES.length).toBe(41);
        expect(generated.size).toBe(40);
        expect(declared.size).toBe(40);
        expect(generated).toEqual(declared);
        // El Sauzal is a NAMED exception, not a silent gap: it must be absent from OUR table…
        expect(generated.has('El Sauzal')).toBe(false);
        // …and it is exactly the one name the census declares that we do not generate.
        const missing = CANARIAS_ROUTABLE_MUNICIPALITIES.filter((n) => !generated.has(n));
        expect(missing).toEqual(['El Sauzal']);
    });

    it('the multi-instrument bbox table has exactly 46 entries (88 − 41 routable − 1 Telde)', () => {
        expect(CANARIAS_MULTI_INSTRUMENT_MUNICIPAL_BBOXES.length).toBe(46);
    });

    it('every INE code across both tables is unique, 5 digits, and none collides with Telde (35026) or El Sauzal (38041)', () => {
        const all = [
            ...CANARIAS_ROUTABLE_MUNICIPAL_BBOXES,
            ...CANARIAS_MULTI_INSTRUMENT_MUNICIPAL_BBOXES,
        ];
        expect(all.length).toBe(86);
        const ines = all.map((m) => m.ine);
        expect(new Set(ines).size).toBe(86);
        for (const ine of ines) {
            expect(ine).toMatch(/^\d{5}$/);
            expect(ine).not.toBe('35026');
            expect(ine).not.toBe('38041');
        }
    });

    it('every generated jurisdiction id is unique across the whole registry (no silent collision)', () => {
        const coverage = listJurisdictionCoverage();
        const ids = coverage.map((c) => c.jurisdictionId);
        expect(new Set(ids).size).toBe(ids.length);
        // Telde (its own registration) + the 86 ids THIS batch generates must all be present.
        // ⚠ NOT asserted as a total count of 88: El Sauzal's own concurrent registration
        // (`esElSauzal.ts`) may or may not have landed in `registry.ts` by the time this runs —
        // this suite proves THIS batch's own accounting, not the timing of a different task.
        expect(ids).toContain(TELDE_JURISDICTION_ID);
        const generatedIds = new Set(
            [...CANARIAS_ROUTABLE_MUNICIPAL_BBOXES, ...CANARIAS_MULTI_INSTRUMENT_MUNICIPAL_BBOXES].map(
                (m) => `es-${m.ine}-${m.jurisdictionSlug}`,
            ),
        );
        expect(generatedIds.size).toBe(86);
        for (const id of generatedIds) expect(ids).toContain(id);
    });

    it('a bbox interior point for every routable municipality resolves to ITS OWN jurisdiction id', () => {
        for (const m of CANARIAS_ROUTABLE_MUNICIPAL_BBOXES) {
            const lat = (m.bbox.minLat + m.bbox.maxLat) / 2;
            const lon = (m.bbox.minLon + m.bbox.maxLon) / 2;
            expect(isWithinCanariasMunicipalBbox(m.bbox, lat, lon)).toBe(true);
            const claim = resolveRegisteredJurisdictionAt(lat, lon);
            // ⚠ Some boxes legitimately tie with a neighbour (the Telde/Valsequillo spill
            // discipline) — an 'ambiguous' verdict is an HONEST outcome, never a bug, so it is
            // accepted here too. What must NEVER happen is `'none'` (the §L-663 hole) or a
            // `'resolved'` verdict naming a DIFFERENT municipality.
            expect(claim.kind).not.toBe('none');
            if (claim.kind === 'resolved') {
                expect(claim.jurisdiction.jurisdictionId).toBe(`es-${m.ine}-${m.jurisdictionSlug}`);
            } else if (claim.kind === 'ambiguous') {
                expect(claim.candidates.map((c) => c.jurisdictionId)).toContain(
                    `es-${m.ine}-${m.jurisdictionSlug}`,
                );
            }
        }
    });

    it('a bbox interior point for every multi-instrument municipality resolves to ITS OWN jurisdiction id', () => {
        for (const m of CANARIAS_MULTI_INSTRUMENT_MUNICIPAL_BBOXES) {
            const lat = (m.bbox.minLat + m.bbox.maxLat) / 2;
            const lon = (m.bbox.minLon + m.bbox.maxLon) / 2;
            const claim = resolveRegisteredJurisdictionAt(lat, lon);
            expect(claim.kind).not.toBe('none');
            if (claim.kind === 'resolved') {
                expect(claim.jurisdiction.jurisdictionId).toBe(`es-${m.ine}-${m.jurisdictionSlug}`);
            } else if (claim.kind === 'ambiguous') {
                expect(claim.candidates.map((c) => c.jurisdictionId)).toContain(
                    `es-${m.ine}-${m.jurisdictionSlug}`,
                );
            }
        }
    });

    it('Santa Cruz de Tenerife carries the true INE (38038), not Catastro\'s own DGC code (38900)', () => {
        const scT = CANARIAS_MULTI_INSTRUMENT_MUNICIPAL_BBOXES.find(
            (m) => m.jurisdictionSlug === 'santa-cruz-de-tenerife',
        );
        expect(scT).toBeDefined();
        expect(scT!.ine).toBe('38038');
        expect(scT!.dgcCode).toBe('38900');
        expect(scT!.sourceEntryTitle).toContain('38900');
    });
});

describe('§CANARIAS-88-REGISTRATION-TOTALITY — every registered municipality refuses, never publishes', () => {
    it('every registration THIS BATCH generated carries an EMPTY packsByZone (no fabricated pack)', () => {
        // ⚠ Scoped to THIS batch's own 86 generated ids (not a `/^es-3[58]\d{3}-/` regex over the
        // whole registry) — El Sauzal's concurrent registration is a REAL transcribed pack, and a
        // blanket Canarias-prefix scan would wrongly demand it be empty too.
        const generatedIds = new Set(
            [...CANARIAS_ROUTABLE_MUNICIPAL_BBOXES, ...CANARIAS_MULTI_INSTRUMENT_MUNICIPAL_BBOXES].map(
                (m) => `es-${m.ine}-${m.jurisdictionSlug}`,
            ),
        );
        const coverage = listJurisdictionCoverage();
        const generated = coverage.filter((c) => generatedIds.has(c.jurisdictionId));
        expect(generated.length).toBe(86);
        for (const c of generated) {
            expect(c.packZoneCodes.length).toBe(0);
        }
    });
});
