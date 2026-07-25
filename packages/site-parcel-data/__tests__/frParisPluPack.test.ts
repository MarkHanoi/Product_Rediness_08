// PARIS — the PLU bioclimatique PACK test: the curated `FR_PARIS_PLU_PACK`, the honesty-preserving
// `parisPluEnvelopeRefusal` (carries the real zone + hauteur, never a fabricated emprise), and the
// CERTIFIED massing cap through `computeBuildableEnvelope` (parcel × hauteur at estimated-ruleset).
//
// Mirrors `esMadridNZ1Pack.test.ts` / the CH pack tests: a pack that refuses the parts it cannot cite.

import { describe, it, expect } from 'vitest';
import type { Pt, ParcelEdgeClassification, ZoningRecord } from '@pryzm/schemas';
import { computeBuildableEnvelope } from '../src/index.js';
import {
    FR_PARIS_PLU_PACK,
    FR_PARIS_PLU_CERTIFIED,
    FR_PARIS_UG_ZONE_CODE,
    PARIS_JURISDICTION_ID,
    PARIS_PLU_ORDINANCE_REF,
    PARIS_PLU_MISSING_RULES,
    parisUgHeightMassingSupported,
    parisPluEnvelopeRefusal,
    parisZoneCodeFor,
    parisZoneLabelFor,
} from '../src/rulepacks/frParisPluBioclimatique.js';
import type { ParisZoneIdentification } from '../src/providers/resolveParisPluZone.js';

const UG_ZONE: ParisZoneIdentification = {
    zoneCode: 'UG',
    zoneLabel: 'Zone urbaine générale',
    typeZone: 'U',
    reglementDoc: '75056_reglement_20260616.pdf',
    planId: '75056_PLU_20260616',
    approvedOn: null,
};

// A 20 m × 30 m Paris parcel (600 m²), in scene-XZ (the frame dispatchParcelBoundary produced).
const PARCEL: Pt[] = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 30 }, { x: 0, z: 30 }];
const EDGES: ParcelEdgeClassification[] = ['front', 'side', 'rear', 'side'];

function ugRecord(hauteur_m: number): ZoningRecord {
    return {
        zoneCode: FR_PARIS_UG_ZONE_CODE,
        zoneLabel: 'Zone urbaine générale (UG)',
        jurisdictionId: PARIS_JURISDICTION_ID,
        structuredFields: { maxHeight_m: hauteur_m },
        overlays: [],
        ordinanceRef: null,
        provenance: { source: 'gpu-paris-plu', label: 'Paris PLU-b', version: null, license: null, crs: 'EPSG:4326' },
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
describe('THE CERTIFIED MASSING CAP — parcel × hauteur through computeBuildableEnvelope', () => {
    it('a UG parcel + a resolved 25 m height → full-parcel footprint at 25 m, estimated-ruleset', () => {
        const env = computeBuildableEnvelope({
            parcelRing: PARCEL,
            edgeClassifications: EDGES,
            zoning: ugRecord(25),
            rulePack: FR_PARIS_PLU_PACK,
        });
        expect(env.status).toBe('ok');
        // emprise = the parcel (0/0/0 setbacks) — the massing cap covers the whole 600 m².
        expect(env.insetAreaM2).toBeCloseTo(600, 3);
        expect(env.maxHeight_m).toBe(25);
        // NEVER structured: the emprise is an assumption, not cited data.
        expect(env.confidence).toBe('estimated-ruleset');
        // No coverage is ever asserted.
        expect(env.maxCoverage).toBeNull();
    });
});
