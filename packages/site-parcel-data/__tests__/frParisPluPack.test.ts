// PARIS — the PLU bioclimatique PACK test: the curated `FR_PARIS_PLU_PACK`, the honesty-preserving
// `parisPluEnvelopeRefusal` (carries the real zone + hauteur, never a fabricated emprise), and the
// STRUCTURED-DATA-FIRST envelope engine `computeParisEnvelope` — the real ECM-footprint volume that
// replaces the old fabricated parcel×hauteur massing cap.
//
// Mirrors `esMadridNZ1Pack.test.ts` / the CH pack tests: a pack that refuses the parts it cannot cite.

import { describe, it, expect } from 'vitest';
import {
    FR_PARIS_PLU_PACK,
    FR_PARIS_PLU_CERTIFIED,
    FR_PARIS_UG_ZONE_CODE,
    PARIS_JURISDICTION_ID,
    PARIS_PLU_ORDINANCE_REF,
    PARIS_PLU_MISSING_RULES,
    PARIS_ECM_MISSING_COURONNEMENT,
    parisUgHeightMassingSupported,
    parisPluEnvelopeRefusal,
    parisZoneCodeFor,
    parisZoneLabelFor,
    computeParisEnvelope,
    projectParisRingToEnu,
} from '../src/rulepacks/frParisPluBioclimatique.js';
import type {
    ParisZoneIdentification,
    ParisEnvelopeInputs,
    ParisLonLat,
} from '../src/providers/resolveParisPluZone.js';

const UG_ZONE: ParisZoneIdentification = {
    zoneCode: 'UG',
    zoneLabel: 'Zone urbaine générale',
    typeZone: 'U',
    reglementDoc: '75056_reglement_20260616.pdf',
    planId: '75056_PLU_20260616',
    approvedOn: null,
};

// The REAL live ECM footprint (plub_ecm, verified 2026-07-26 at 2.39303,48.88277): an 83.12 m² polygon
// (st_area_shape), emprise 0, graphic hauteur 0, cadastral 19-DL-0002. WGS84 [lon,lat].
const ECM_RING: ParisLonLat[] = [
    [2.3931038094292516, 48.88276064338342],
    [2.393001862080542, 48.88271733661974],
    [2.392945092827867, 48.88277390868914],
    [2.3930191509844616, 48.88280803048602],
    [2.3930429653843492, 48.88281900338607],
    [2.3930497999222764, 48.88282215240052],
    [2.393065568606225, 48.882829417055696],
    [2.3930732840190987, 48.88282192071428],
    [2.3930879424678713, 48.88280767864911],
    [2.393104230241959, 48.88279216510006],
    [2.3931019714300135, 48.882791286699536],
    [2.3931227489565896, 48.88276868763264],
    [2.3931038094292516, 48.88276064338342],
];

/** The full live-probe inputs at the ECM parcel (zone UG, 25 m ceiling, filet V, crown C). */
function envInputs(overrides: Partial<ParisEnvelopeInputs> = {}): ParisEnvelopeInputs {
    return {
        zone: UG_ZONE,
        ecmGeometry: ECM_RING,
        ecmAreaM2: 83.122,
        ecmEmprisePct: null,
        ecmHeight: null,
        ecmCadastral: '19-DL-0002',
        heightCeiling_m: 25,
        hmc_m: null,
        hmcDatum: null,
        filetCode: 'V',
        filetHeight_m: 10,
        courCode: 'C',
        ealGeometry: null,
        ealAreaM2: null,
        sourceVersion: '2026-06-16',
        ...overrides,
    };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('FR_PARIS_PLU_PACK — the curated pack shape', () => {
    it('parses, is the Ville-de-Paris jurisdiction, and defaults to estimated-ruleset', () => {
        expect(FR_PARIS_PLU_PACK.jurisdictionId).toBe(PARIS_JURISDICTION_ID);
        expect(FR_PARIS_PLU_PACK.defaultConfidence).toBe('estimated-ruleset');
    });

    it('authors exactly the UG zone: real citation, NO fabricated coverage, height resolved live (null)', () => {
        const ug = FR_PARIS_PLU_PACK.zones.find((z) => z.code === FR_PARIS_UG_ZONE_CODE);
        expect(ug).toBeDefined();
        // The height is NEVER a pack constant (resolved per-parcel from plub_hauteur).
        expect(ug!.maxHeight_m).toBeNull();
        // The emprise is PDF-bound → NEVER a fabricated ratio.
        expect(ug!.maxCoverage).toBeNull();
        // 0/0/0 = the parcel footprint is the massing cap (only used behind the cert).
        expect(ug!.setbacks).toEqual({ front_m: 0, side_m: 0, rear_m: 0 });
        expect(ug!.ordinanceRef).toBe(PARIS_PLU_ORDINANCE_REF);
    });

    it('THE GATE IS OFF BY DEFAULT (a pack cannot self-certify the emprise assumption)', () => {
        expect(FR_PARIS_PLU_CERTIFIED).toBe(false);
    });

    it('parisUgHeightMassingSupported: UG only (UV / N / secteur-sauvegardé keep the refusal)', () => {
        expect(parisUgHeightMassingSupported('UG')).toBe(true);
        expect(parisUgHeightMassingSupported('ug')).toBe(true);
        expect(parisUgHeightMassingSupported('UV')).toBe(false);
        expect(parisUgHeightMassingSupported('US')).toBe(false);
        expect(parisUgHeightMassingSupported(null)).toBe(false);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('parisPluEnvelopeRefusal — carries the real zone + hauteur, never a fabricated emprise', () => {
    it('names the zone + the numeric height as knownFacts, cited, legallyGrounded=false', () => {
        const r = parisPluEnvelopeRefusal(UG_ZONE, 25, ['Parcel area: 600 m²']);
        expect(r.code).toBe('source-data-unavailable');
        expect(r.legallyGrounded).toBe(false); // a statement about our data path, not the ordinance
        expect(r.ordinanceRef).toBe(PARIS_PLU_ORDINANCE_REF);
        expect(r.knownFacts.some((f) => f.includes('Zone urbaine générale'))).toBe(true);
        expect(r.knownFacts.some((f) => f.includes('25 m'))).toBe(true);
        expect(r.knownFacts).toContain('Parcel area: 600 m²');
        // The refusal states WHY: the emprise is not published.
        expect(r.detail.toLowerCase()).toContain('emprise');
        expect(r.headline).toContain('UG');
    });

    it('ENRICHED payload: carries HMC + filet + sourceVersion, names the missing cumulative rules', () => {
        const r = parisPluEnvelopeRefusal(UG_ZONE, 25, ['Parcel area: 600 m²'], {
            hmc_m: 85,
            hmcDatum: 'NGF',
            filetCode: 'N',
            filetFrontageHeight_m: 20,
            sourceVersion: '2026-06-16',
        });
        // Every structured fact the resolver read is legible on the card.
        expect(r.knownFacts.some((f) => f.includes('Height ceiling') && f.includes('25 m'))).toBe(true);
        expect(r.knownFacts.some((f) => f.includes('HMC') && f.includes('85 m') && f.includes('NGF'))).toBe(true);
        expect(r.knownFacts.some((f) => f.includes('Filet') && f.includes('N') && f.includes('20 m'))).toBe(true);
        expect(r.knownFacts.some((f) => f.includes('PLU version') && f.includes('2026-06-16'))).toBe(true);
        // The headline names the structured facts found.
        expect(r.headline).toContain('25 m');
        expect(r.headline).toContain('HMC 85');
        expect(r.headline).toContain('filet N');
        // The detail states the volume is NOT computed and names every missing cumulative rule.
        for (const rule of PARIS_PLU_MISSING_RULES) expect(r.detail).toContain(rule);
        expect(r.detail.toLowerCase()).toContain('cumulative');
        // Still a cited refusal, still not legally grounded (a data-path statement).
        expect(r.legallyGrounded).toBe(false);
    });

    it('filet code M ("same as existing façade") renders façade-matched, never a fabricated metre value', () => {
        const r = parisPluEnvelopeRefusal(UG_ZONE, 25, [], { filetCode: 'M', filetFrontageHeight_m: null });
        expect(r.knownFacts.some((f) => f.includes('Filet') && f.toLowerCase().includes('existing façade'))).toBe(true);
        expect(r.knownFacts.some((f) => /Filet.*\d+ m/.test(f))).toBe(false); // no fabricated metres
    });

    it('the secteur-sauvegardé case: a zone but no height still yields a legible cited refusal', () => {
        const r = parisPluEnvelopeRefusal(UG_ZONE, null);
        expect(r.knownFacts.some((f) => f.includes('Zone urbaine générale'))).toBe(true);
        expect(r.knownFacts.some((f) => f.includes(' m ('))).toBe(false); // no height fact fabricated
    });

    it('a WFS miss (no zone) still returns a valid, honest refusal', () => {
        const r = parisPluEnvelopeRefusal(null, null);
        expect(r.code).toBe('source-data-unavailable');
        expect(r.legallyGrounded).toBe(false);
        expect(parisZoneCodeFor(null)).toBe('fr-paris-plu');
    });

    it('zone-code / label helpers echo the identified zone', () => {
        expect(parisZoneCodeFor(UG_ZONE)).toBe('UG');
        expect(parisZoneLabelFor(UG_ZONE)).toBe('Zone urbaine générale (UG)');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('projectParisRingToEnu — the ECM ring → local-ENU-metres projection reproduces the source area', () => {
    it('the live 83.12 m² ECM ring projects to ~83 m² (< 1 % drift vs st_area_shape)', () => {
        const poly = projectParisRingToEnu(ECM_RING);
        expect(poly.length).toBe(ECM_RING.length - 1); // closing vertex dropped
        // Shoelace on the projected polygon.
        let s = 0;
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i]!;
            const b = poly[(i + 1) % poly.length]!;
            s += a.x * b.z - b.x * a.z;
        }
        const area = Math.abs(s / 2);
        expect(area).toBeGreaterThan(82);
        expect(area).toBeLessThan(84);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('computeParisEnvelope — the STRUCTURED ECM-footprint volume (geometry, never parcel×%)', () => {
    it('the live ECM parcel → footprint ~83 m², 25 m, ~2077 m³ volume, confidence STRUCTURED', () => {
        const r = computeParisEnvelope(envInputs());
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.footprintAreaM2).toBeCloseTo(83.06, 0); // real geometry, not a parcel×% guess
        expect(r.height_m).toBe(25);
        expect(r.heightBinding).toBe('height-ceiling');
        expect(r.volumeM3).toBeCloseTo(83.06 * 25, 0);
        expect(r.confidence).toBe('structured'); // ECM polygon + published ceiling both resolved
        expect(r.components).toEqual({ footprint: 'structured', height: 'structured', couronnement: 'structured' });
        expect(r.couronnementRefusal).toBeNull(); // cour = C (pitched), no crown refusal
        expect(r.missingRules).toEqual([]);
        expect(r.knownFacts.some((f) => f.includes('Buildable footprint (ECM)'))).toBe(true);
        expect(r.knownFacts.some((f) => f.includes('Theoretical max volume'))).toBe(true);
    });

    it('cour = X (continuous crown) → PARTIAL refusal for the couronnement, but volume STILL ships', () => {
        const r = computeParisEnvelope(envInputs({ courCode: 'X' }));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // Footprint + straight extrusion still computed.
        expect(r.footprintAreaM2).toBeGreaterThan(82);
        expect(r.volumeM3).toBeGreaterThan(2000);
        // The crown component is a cited PARTIAL refusal, art. UG.3.2.4.
        expect(r.components.couronnement).toBe('refused');
        expect(r.couronnementRefusal).not.toBeNull();
        expect(r.couronnementRefusal!.ordinanceRef).toContain('UG.3.2.4');
        expect(r.couronnementRefusal!.legallyGrounded).toBe(false);
        expect(r.missingRules).toEqual([PARIS_ECM_MISSING_COURONNEMENT]);
        expect(r.caveats.some((c) => c.includes('UG.3.2.4'))).toBe(true);
    });

    it('NO ECM at the point → the FOOTPRINT component refuses (cited), carrying zone + height facts', () => {
        const r = computeParisEnvelope(envInputs({ ecmGeometry: null }), ['Location: Paris (48.85700, 2.38000)']);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusedComponent).toBe('footprint');
        expect(r.refusal.code).toBe('source-data-unavailable');
        expect(r.refusal.legallyGrounded).toBe(false);
        expect(r.refusal.knownFacts.some((f) => f.includes('Zone urbaine générale'))).toBe(true);
        expect(r.refusal.knownFacts.some((f) => f.includes('25 m'))).toBe(true);
        expect(r.refusal.knownFacts).toContain('Location: Paris (48.85700, 2.38000)');
    });

    it('ECM present but NO published height → the HEIGHT component refuses (never invents a height)', () => {
        const r = computeParisEnvelope(envInputs({ heightCeiling_m: null, ecmHeight: null, hmc_m: null }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusedComponent).toBe('height');
    });

    it('height = MIN of the resolved candidates (ECM graphic 18 m beats the 25 m ceiling)', () => {
        const r = computeParisEnvelope(envInputs({ ecmHeight: 18 }));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.height_m).toBe(18);
        expect(r.heightBinding).toBe('ecm-graphic');
        expect(r.confidence).toBe('structured'); // the ceiling still resolved → structured
    });

    it('HMC with an NGF datum is an ABSOLUTE altitude — never applied as a height cap', () => {
        const r = computeParisEnvelope(envInputs({ hmc_m: 85, hmcDatum: 'NGF' }));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.height_m).toBe(25); // the NGF 85 is NOT min-ed in
        expect(r.caveats.some((c) => c.includes('absolute altitude'))).toBe(true);
    });

    it('an EAL strip is SUBTRACTED from the footprint (reduces, never inflates)', () => {
        const gross = computeParisEnvelope(envInputs());
        const withEal = computeParisEnvelope(envInputs({ ealAreaM2: 10 }));
        expect(gross.ok && withEal.ok).toBe(true);
        if (!gross.ok || !withEal.ok) return;
        expect(withEal.footprintAreaM2).toBeCloseTo(gross.footprintAreaM2 - 10, 3);
        expect(withEal.footprintAreaM2).toBeLessThan(gross.footprintAreaM2);
    });

    it('no published ceiling, only the ECM graphic height → confidence drops to estimated-ruleset', () => {
        const r = computeParisEnvelope(envInputs({ heightCeiling_m: null, ecmHeight: 20 }));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.height_m).toBe(20);
        expect(r.confidence).toBe('estimated-ruleset');
    });
});
