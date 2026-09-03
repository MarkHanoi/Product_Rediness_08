// LANE FR-PRESCRIPTIONS — the GPU prescription→geometry consumer, proven on REAL recorded GPU
// features (fixtures/fr-prescriptions/recorded-census-2026-09-02.json — byte-exact geometry +
// properties from the envelope-geometry-census transcripts, 2026-09-02):
//   • typepsc=14  plan-masse   17453_PLU_20190411 "SECTEUR DE PLAN MASSE 1" (nomfic #page=96) +
//                              87093 "Secteur de plan de masse" + the upload-noise "Voies classée
//                              bruyante type I" (also code 14 — the filter's teeth)
//   • typepsc=15  marge de recul lines, commune 01034 "Marge de recul imposée au constructions"
//   • typepsc=39/02 height     02157_PLU_20201208 "...LIMITEE A 9 METRES AU FAITAGE" + the 39/00
//                              "Cone de protection visuelle" (rejected — not a height limit)
//
// THE NON-NEGOTIABLES UNDER TEST:
//   1. FILTER BY CODE, VERIFY BY LIBELLE — a code-14 upload-noise feature is DECLINED, never drawn.
//   2. HEIGHT NEVER BINDS — ADR-0377: the 9 m libelle number is cited + carried, datum `unknown`,
//      `appliesAsBindingCap:false`. The measurement top ("faîtage") is captured; the ground plane
//      is not (règlement text).
//   3. F1–F8 PROVENANCE — idurba=plan_id, datvalid=valid_from(legal), nomfic(#page)=document/page.
//   4. A.5 DEGRADATION — a missing P or V slot is NAMED, never a silent blank.
//   5. FEEDS THE ENGINE — the drawn footprint projects into scene-XZ and CLIPS to the parcel
//      through the REAL `solveExplicitArea` (never a new solver).
//   6. DETERMINISM — same inputs → byte-identical output.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Pt } from '@pryzm/schemas';
import { solveExplicitArea } from '../src/index.js';
import {
    buildFrDrawnEnvelopeContribution,
    frFootprintToSceneParts,
    isFrPlanMasseFeature,
    parseFrHeightCapPrescription,
    parseFrHeightLibelle,
    parseFrPlanMassePrescription,
    projectFrLatLonRingToSceneXZ,
    type FrPrescriptionGeoFeature,
} from '../src/countryAdapters/fr/index.js';

const FIXTURES = JSON.parse(
    readFileSync(
        new URL('./fixtures/fr-prescriptions/recorded-census-2026-09-02.json', import.meta.url),
        'utf8',
    ),
) as {
    readonly planMasse: FrPrescriptionGeoFeature[];
    readonly setbackLin: FrPrescriptionGeoFeature[];
    readonly height39: FrPrescriptionGeoFeature[];
};

const FETCHED_AT = '2026-09-02T18:00:00.000Z';
const POINT = { lat: 45.882, lon: -0.914 }; // near the 17453 plan-masse sample

function polyAreaXZ(ring: ReadonlyArray<Pt>): number {
    if (ring.length < 3) return 0;
    let a = 0;
    for (let i = 0; i < ring.length; i += 1) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
}

describe('FR prescription→geometry: plan-masse (typepsc=14) → drawn footprint', () => {
    it('picks the plan-masse, DECLINES the code-14 upload noise, and cites F1–F8', () => {
        const c = buildFrDrawnEnvelopeContribution({
            point: POINT,
            fetchedAtIso: FETCHED_AT,
            planMasseFeatures: FIXTURES.planMasse,
        });
        expect(c.tier).toBe('partial-drawn-envelope');
        expect(c.footprint).not.toBeNull();
        const fp = c.footprint!;
        // lowest gid among the two VALID plan-masse features → 17453 (gid 262133 < 4964942)
        expect(fp.libelle).toBe('SECTEUR DE PLAN MASSE 1');
        expect(fp.parts.length).toBeGreaterThan(0);
        expect(fp.parts[0]!.outer.length).toBeGreaterThanOrEqual(3);
        // the upload-noise "Voies classée bruyante type I" was DECLINED, its receipt recorded
        expect(c.declinedPlanMasseNoise.map((d) => d.libelle)).toContain('Voies classée bruyante type I');
        // F1–F8 — the legal address is complete and cites the plan + version + document + page
        const s = fp.provenance.source;
        expect(s.country).toBe('FR');
        expect(s.authority).toMatch(/G[ée]oportail de l'urbanisme/);
        expect(s.plan_id).toBe('17453_PLU_20190411');
        expect(s.document).toBe('17453_reglement_20190411.pdf');
        expect(s.page).toBe(96);
        expect(fp.provenance.validityBasis).toBe('legal');
        expect(fp.provenance.valid_from).toBe('2018-08-30'); // datvalid 20180830
        // degradation: footprint slot filled, height slot named-absent
        expect(c.degradation.footprint.filled).toBe(true);
        expect(c.degradation.height.filled).toBe(false);
        expect(c.degradation.label).toBe('Footprint derived; vertical extent unresolved');
    });

    it('rejects a code-14 feature whose libelle is not a plan de masse', () => {
        const noise = FIXTURES.planMasse.find(
            (f) => f.properties['libelle'] === 'Voies classée bruyante type I',
        )!;
        expect(isFrPlanMasseFeature(noise.properties)).toBe(false);
        expect(parseFrPlanMassePrescription(noise, FETCHED_AT)).toBeNull();
    });

    it('feeds the REAL explicit-area engine: the drawn footprint CLIPS to a biting parcel', () => {
        const fp = parseFrPlanMassePrescription(
            FIXTURES.planMasse.find((f) => f.properties['idurba'] === '17453_PLU_20190411')!,
            FETCHED_AT,
        )!;
        const origin = fp.parts[0]!.outer[0]!;
        const parts = frFootprintToSceneParts(fp, origin);
        const footprintArea = parts.reduce((s, p) => s + polyAreaXZ(p.outer), 0);
        expect(footprintArea).toBeGreaterThan(0);
        // A parcel covering the footprint's left ~40 % + a 10 m apron — the clip MUST bite.
        const xs = parts.flatMap((p) => p.outer.map((q) => q.x));
        const zs = parts.flatMap((p) => p.outer.map((q) => q.z));
        const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
        const [minZ, maxZ] = [Math.min(...zs), Math.max(...zs)];
        const cutX = minX + (maxX - minX) * 0.4;
        const parcelRing: Pt[] = [
            { x: minX - 10, z: minZ - 10 },
            { x: cutX, z: minZ - 10 },
            { x: cutX, z: maxZ + 10 },
            { x: minX - 10, z: maxZ + 10 },
        ];
        const solve = solveExplicitArea({ parcelRing, footprintParts: parts });
        expect(solve.ok).toBe(true);
        if (solve.ok) {
            expect(solve.areaM2).toBeGreaterThan(0);
            // NEVER-OVERSTATE: the clipped area never exceeds the published footprint (parcel ∩ ring)
            expect(solve.areaM2).toBeLessThanOrEqual(footprintArea + 1e-6);
            // the clip BIT (it is strictly smaller than the whole footprint)
            expect(solve.areaM2).toBeLessThan(footprintArea);
        }
    });
});

describe('FR prescription→geometry: marge de recul (typepsc=15) → drawn setback', () => {
    it('carries the drawn setback lines, each cited by libelle + idurba', () => {
        const c = buildFrDrawnEnvelopeContribution({
            point: { lat: 45.755, lon: 5.696 },
            fetchedAtIso: FETCHED_AT,
            setbackFeatures: FIXTURES.setbackLin,
        });
        expect(c.setbacks.length).toBe(2);
        for (const sb of c.setbacks) {
            expect(sb.geometryKind).toBe('lin');
            expect(sb.lines.length).toBeGreaterThan(0);
            expect(sb.lines[0]!.length).toBeGreaterThanOrEqual(2);
            expect(sb.libelle).toBe('Marge de recul imposée au constructions');
            expect(sb.provenance.source.plan_id).toBe('01034_PLU_20171128');
            expect(sb.provenance.valid_from).toBe('2017-11-28'); // datvalid 20171128
        }
        // a setback line is a CONSTRAINT, never fabricated into a footprint here
        expect(c.footprint).toBeNull();
        expect(c.tier).toBe('partial-drawn-envelope');
    });
});

describe('FR prescription→geometry: height polygon (typepsc=39/02) → cited height cap', () => {
    it('parses 9 m au faîtage, datum unknown, NEVER binding (ADR-0377), and cites verbatim', () => {
        const c = buildFrDrawnEnvelopeContribution({
            point: { lat: 49.591, lon: 3.649 },
            fetchedAtIso: FETCHED_AT,
            heightFeatures: FIXTURES.height39,
        });
        expect(c.heightCap).not.toBeNull();
        const h = c.heightCap!;
        expect(h.maxHeight_m).toBe(9);
        expect(h.measuredTo).toBe('faitage');
        expect(h.heightDatum).toEqual({ kind: 'unknown' });
        expect(h.appliesAsBindingCap).toBe(false);
        expect(h.bindingBasis).toBe('study-upper-bound-datum-unresolved');
        expect(h.citation).toBe('HAUTEUR DES CONSTRUCTIONS LIMITEE A 9 METRES AU FAITAGE');
        expect(h.provenance.source.plan_id).toBe('02157_PLU_20201208');
        expect(h.provenance.valid_from).toBe('2020-12-08');
        // the 39/00 "Cone de protection visuelle" is NOT a height limit → excluded
        expect(c.degradation.height.filled).toBe(true);
        expect(c.degradation.label).toBe('Vertical limit derived; footprint unresolved');
    });

    it('rejects a 39/00 sub-code (cone de vue) as not a height limit', () => {
        const cone = FIXTURES.height39.find(
            (f) => f.properties['libelle'] === 'Cone de protection visuelle',
        )!;
        expect(parseFrHeightCapPrescription(cone, FETCHED_AT)).toBeNull();
    });

    it('parseFrHeightLibelle handles metres, decimals, top-point and absent numbers', () => {
        expect(parseFrHeightLibelle('HAUTEUR DES CONSTRUCTIONS LIMITEE A 9 METRES AU FAITAGE')).toEqual({
            maxHeight_m: 9,
            measuredTo: 'faitage',
        });
        expect(parseFrHeightLibelle("hauteur maximale 7,5 mètres à l'égout")).toEqual({
            maxHeight_m: 7.5,
            measuredTo: 'egout',
        });
        expect(parseFrHeightLibelle("hauteur limitée à l'acrotère")).toEqual({
            maxHeight_m: null,
            measuredTo: 'acrotere',
        });
        expect(parseFrHeightLibelle(null)).toEqual({ maxHeight_m: null, measuredTo: 'unspecified' });
    });
});

describe('FR prescription→geometry: A.5 degradation ladder + determinism', () => {
    it('no drawn geometry → honest "no-drawn-geometry" tier naming the gap', () => {
        const c = buildFrDrawnEnvelopeContribution({ point: POINT, fetchedAtIso: FETCHED_AT });
        expect(c.tier).toBe('no-drawn-geometry');
        expect(c.footprint).toBeNull();
        expect(c.heightCap).toBeNull();
        expect(c.setbacks).toEqual([]);
        expect(c.degradation.footprint.filled).toBe(false);
        expect(c.degradation.height.filled).toBe(false);
        expect(c.degradation.label).toMatch(/No drawn envelope geometry/);
        if (!c.degradation.footprint.filled) expect(c.degradation.footprint.reason).toMatch(/plan de masse/);
    });

    it('footprint + height → the full drawn-envelope label', () => {
        const c = buildFrDrawnEnvelopeContribution({
            point: POINT,
            fetchedAtIso: FETCHED_AT,
            planMasseFeatures: FIXTURES.planMasse,
            heightFeatures: FIXTURES.height39,
        });
        expect(c.degradation.label).toBe('Footprint + vertical limit derived (drawn envelope)');
    });

    it('is byte-identical for identical inputs (determinism)', () => {
        const input = {
            point: POINT,
            fetchedAtIso: FETCHED_AT,
            planMasseFeatures: FIXTURES.planMasse,
            setbackFeatures: FIXTURES.setbackLin,
            heightFeatures: FIXTURES.height39,
        };
        const a = JSON.stringify(buildFrDrawnEnvelopeContribution(input));
        const b = JSON.stringify(buildFrDrawnEnvelopeContribution(input));
        expect(a).toBe(b);
    });

    it('projects WGS84 → scene-XZ deterministically about an origin', () => {
        const ring = [
            { lat: 45.0, lon: 5.0 },
            { lat: 45.001, lon: 5.0 },
            { lat: 45.001, lon: 5.001 },
        ];
        const origin = { lat: 45.0, lon: 5.0 };
        const xz = projectFrLatLonRingToSceneXZ(ring, origin);
        expect(xz[0]).toEqual({ x: 0, z: 0 });
        expect(xz[1]!.z).toBeGreaterThan(100); // ~111 m north
        expect(xz[1]!.z).toBeLessThan(120);
    });
});
