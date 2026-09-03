// LANE LU-ENVELOPE (2026-09-03) — proofs for the LU PAG NQ-PAP coefficient compile
// (`src/rulepacks/luPagEnvelope.ts`).
//
// THE FIXTURE IS THE STATE'S OWN BYTES, sha256-pinned: the raw GeoJSON body of a LIVE
// 2026-09-03 GetFeature against the INSPIRE WFS (`wms.inspire.geoportail.lu/geoserver/wfs`,
// typeName `lu:LU.SpatialPlan.PAG`, cql `xtf_id='a13bb15a-…'`) — one Ville-de-Luxembourg
// (commune C026) NQ-PAP zone, `ze.PAG_PAG_NQ_PAP_539`, serving COS_MAX 0.3 / CUS_MAX 0.3 /
// CSS_MAX 0.5 / DL_MAX 30 with a WGS84 polygon. The numbers asserted below are quoted VERBATIM
// from that body and cross-checked against the live 129-hit C026 sweep transcript
// (audit/demo-esfrpt/2026-09-02/transcripts/lu-envelope/) — two reads of the same channel on the
// same day (§probe-can-be-wrong-three-ways: at least the transcription leg is independent).
//
// ⛔ WHAT LUXEMBOURG MUST NEVER DO — the property every test here circles: NOTHING BINDS.
// All four coefficients are ratios/densities over the terrain à bâtir NET/BRUT (planning
// constructs, no area served — C63), Art. 26 makes each a zone AVERAGE lots may exceed, no
// vertical axis is served at all, and LU_PAG_CERTIFIED is BORN SHUT (L-449, signature: null).

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    LU_PAG_CERTIFIED,
    LU_PAG_DEFAULT_ZONE_CODE,
    LU_PAG_ENVELOPE_REF,
    LU_PAG_JURISDICTION_ID,
    LU_PAG_UNCERTIFIED_CAVEAT,
    computeBuildableEnvelope,
    luPagCitationFromNqPapRow,
    luPagFieldsFromNqPapRow,
    luPagFromInspireWfsFeature,
    luPagZoningRecord,
    luPagZoningRecordFromInspireWfsFeature,
    resolveLuPagEnvelope,
    type LuNqPapRow,
    type LuPagCitation,
    type LuPagFields,
} from '../src/index.js';
import {
    L449_CERTIFICATION_GATES,
    isGateSignatureRecorded,
} from '../src/l449CertificationGates.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(HERE, 'fixtures/lu-c026/wfs-nqpap-zone-539-recorded-live-2026-09-03.json');
const FIXTURE_SHA256 = 'a17e527ffd21de5122c1201c440d55b8fe427605dc0520388a7279b8ee3911c5';

function recordedFeature(): unknown {
    const body = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as { features: unknown[] };
    return body.features[0];
}

// A 40 × 25 = 1000 m² canonical study parcel, scene-XZ (the PL exemplar's parcel).
const PARCEL = [
    { x: 0, z: 0 },
    { x: 40, z: 0 },
    { x: 40, z: 25 },
    { x: 0, z: 25 },
];
const EDGES = ['front', 'side', 'rear', 'side'] as const;

describe('fixture provenance', () => {
    it('is the byte-identical recorded live WFS body (sha256 pinned)', () => {
        expect(createHash('sha256').update(readFileSync(FIXTURE_PATH)).digest('hex')).toBe(FIXTURE_SHA256);
    });

    it('the recorded body really is the live channel shape (numberMatched 1, zone 539)', () => {
        const body = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Record<string, unknown>;
        expect(body['numberMatched']).toBe(1);
        const parsed = luPagFromInspireWfsFeature(recordedFeature());
        expect(parsed).not.toBeNull();
        expect(parsed!.citation.inspireLocalId).toBe('ze.PAG_PAG_NQ_PAP_539');
        expect(parsed!.citation.channel).toBe('inspire-wfs');
    });
});

describe('the LIVE-CHANNEL parser — verbatim cells, defensively parsed identity', () => {
    it('extracts the four maxima verbatim and the commune from gml_description', () => {
        const parsed = luPagFromInspireWfsFeature(recordedFeature())!;
        expect(parsed.fields).toEqual({
            cosMax: 0.3,
            cosMin: null,
            cusMax: 0.3,
            cusMin: null,
            cssMax: 0.5,
            dlMax: 30,
            dlMin: null,
        });
        expect(parsed.citation.communeCode).toBe('C026'); // only served inside gml_description
        expect(parsed.citation.xtfId).toBe('a13bb15a-0239-4f8e-a6c5-2eaa800a0b4e');
        expect(parsed.citation.partieEcriteFilename).toBe('026_PE_NQ');
        // The channel itself cites the 2011-régime content RGD — carried verbatim, never dropped.
        expect(parsed.citation.servedLegislationCitation).toContain('28 juillet 2011');
    });

    it('refuses a feature with no xtf_id (the only unique key) rather than minting an identity', () => {
        expect(luPagFromInspireWfsFeature({ properties: { cos_max: 0.5 } })).toBeNull();
        expect(luPagFromInspireWfsFeature(null)).toBeNull();
        expect(luPagZoningRecordFromInspireWfsFeature({ properties: {} })).toBeNull();
    });
});

describe('COMPILE — every coefficient is a cited FACT, and EVERY fact is withheld', () => {
    function resolution() {
        const parsed = luPagFromInspireWfsFeature(recordedFeature())!;
        return resolveLuPagEnvelope(parsed.fields, parsed.citation);
    }

    it('compiles the four maxima VERBATIM with their statutory denominators', () => {
        const res = resolution();
        expect(res.coverage.fact).toBe(0.3);
        expect(res.coverage.withheldReason).toBe('denominator-terrain-a-batir-net');
        expect(res.weightedFar.fact).toBe(0.3);
        expect(res.weightedFar.withheldReason).toBe('denominator-terrain-a-batir-brut');
        expect(res.soilSealing.fact).toBe(0.5);
        expect(res.soilSealing.withheldReason).toBe('denominator-terrain-a-batir-net');
        expect(res.dwellingDensity.fact).toBe(30);
        expect(res.dwellingDensity.unit).toBe('dwellings/ha');
        expect(res.dwellingDensity.withheldReason).toBe('denominator-terrain-a-batir-brut');
        // There is NO reason value meaning "binds" — the type itself forbids it; assert the
        // resolution never presents a bindable state.
        for (const f of [res.coverage, res.weightedFar, res.soilSealing, res.dwellingDensity]) {
            expect(f.withheldReason).not.toBeNull();
        }
    });

    it('carries the three refusal grounds as NAMED caveats: denominator, Art. 26, no vertical axis', () => {
        const res = resolution();
        const all = res.caveats.join('\n');
        expect(all).toContain('terrain à bâtir');
        expect(all).toContain('C63');
        expect(all).toContain('Art. 26');
        expect(all).toContain('dépassés'); // the verbatim French normative-force clause survives
        expect(all).toContain('NO max height, NO setbacks, NO storey count');
        // CUS's non-linear numerator is named whenever a CUS fact is present.
        expect(all).toContain('WEIGHTED');
    });

    it('mirrors the shut L-449 gate BY NAME on the resolution (never a silent refusal)', () => {
        const res = resolution();
        expect(res.certified).toBe(LU_PAG_CERTIFIED);
        expect(LU_PAG_CERTIFIED).toBe(false); // flipping this requires a recorded human signature
        expect(res.caveats).toContain(LU_PAG_UNCERTIFIED_CAVEAT);
        expect(LU_PAG_UNCERTIFIED_CAVEAT).toContain('L-449');
    });

    it('R2 — the value-basis codes are the statutory denominator terms from the ONE vocabulary', () => {
        const res = resolution();
        expect(res.valueBasis.scheme).toBe('lu-rgd-2017-03-08-pag-annexe-ii');
        expect([...res.valueBasis.codes].sort()).toEqual([
            'terrain-a-batir-brut',
            'terrain-a-batir-brut-hectares',
            'terrain-a-batir-net',
        ]);
    });
});

describe('the ZoningRecord — structuredFields carry NO number AT ALL (the Luxembourg invariant)', () => {
    it('feeds the engine nothing to multiply; the facts ride the ordinanceRef', () => {
        const { record, resolution } = luPagZoningRecordFromInspireWfsFeature(recordedFeature())!;
        expect(record.jurisdictionId).toBe(LU_PAG_JURISDICTION_ID);
        expect(record.zoneCode).toBe(LU_PAG_DEFAULT_ZONE_CODE);
        expect(record.structuredFields.maxHeight_m ?? null).toBeNull();
        expect(record.structuredFields.maxFloors ?? null).toBeNull();
        expect(record.structuredFields.plotRatioFAR ?? null).toBeNull();
        expect(record.structuredFields.maxCoverage ?? null).toBeNull();
        expect(record.structuredFields.setbacks).toEqual({ front_m: null, side_m: null, rear_m: null });
        // The facts travel — cited, marked withheld — on the citation string.
        expect(record.ordinanceRef).toContain('COS_MAX 0.3');
        expect(record.ordinanceRef).toContain('CUS_MAX 0.3');
        expect(record.ordinanceRef).toContain('CSS_MAX 0.5');
        expect(record.ordinanceRef).toContain('DL_MAX 30');
        expect(record.ordinanceRef).toContain('NONE binding');
        expect(resolution.why).toContain('NOTHING binds');
        expect(LU_PAG_ENVELOPE_REF).toContain('NOTHING BINDS');
    });

    it('the never-overstate tripwire: no naive product and no engine-number smuggling', () => {
        const { record } = luPagZoningRecordFromInspireWfsFeature(recordedFeature())!;
        const serialised = JSON.stringify(record);
        // 0.3 × 1000 = 300 m² (footprint / weighted-GFA traps), 0.5 × 1000 = 500 m² (sealing trap).
        expect(serialised).not.toContain('"plotRatioFAR":0.3');
        expect(serialised).not.toMatch(/"maxCoverage":\s*0\.3/);
        expect(serialised).not.toContain('300');
        expect(serialised).not.toContain('500');
    });
});

describe('the ENGINE — the honest LU answer is a REFUSAL, and the withhold is load-bearing', () => {
    it('resolves status none (no envelope, draws nothing — cannot overstate)', () => {
        const { record } = luPagZoningRecordFromInspireWfsFeature(recordedFeature())!;
        const env = computeBuildableEnvelope({
            parcelRing: PARCEL,
            edgeClassifications: [...EDGES],
            zoning: record,
            rulePack: null,
        });
        expect(env.status).toBe('none');
        expect(env.maxHeight_m).toBeNull();
        expect(env.maxFAR).toBeNull();
        expect(env.maxCoverage).toBeNull();
        expect(env.caveats.join(' ')).toContain('No zoning data resolved');
    });

    it('TEETH — injecting COS/CUS back into the numbers provably re-binds them (the C63 trap the omission prevents)', () => {
        const { record, resolution } = luPagZoningRecordFromInspireWfsFeature(recordedFeature())!;
        const tampered = {
            ...record,
            structuredFields: {
                ...record.structuredFields,
                plotRatioFAR: resolution.weightedFar.fact,
                maxCoverage: resolution.coverage.fact,
            },
        };
        const env = computeBuildableEnvelope({
            parcelRing: PARCEL,
            edgeClassifications: [...EDGES],
            zoning: tampered as typeof record,
            rulePack: null,
        });
        expect(env.status).toBe('ok');
        expect(env.maxFAR).toBe(0.3);
        expect(env.maxCoverage).toBe(0.3);
    });
});

describe('E4 control 9 + the statutory domain — UNKNOWN ≠ 0 ≠ unlimited, breaches refused', () => {
    const citation: LuPagCitation = {
        communeCode: 'C999',
        zoneDenomination: 'Test',
        xtfId: '00000000-0000-0000-0000-000000000000',
        inspireLocalId: null,
        partieEcriteFilename: null,
        servedLegislationCitation: null,
        channel: 'bulk-gpkg',
    };
    const base: LuPagFields = {
        cosMax: 0.4, cosMin: null, cusMax: 1.2, cusMin: null, cssMax: 0.6, dlMax: 35, dlMin: null,
    };

    it('a NULL cell compiles to a not-published fact (null), never 0 and never "no limit"', () => {
        const res = resolveLuPagEnvelope({ ...base, cosMax: null }, citation);
        expect(res.coverage.fact).toBeNull();
        expect(res.coverage.kind).toBe('unknown-absent');
        expect(res.coverage.withheldReason).toBe('not-published');
    });

    it('a served ZERO compiles to a null fact with the measured-indistinguishability reason', () => {
        const res = resolveLuPagEnvelope({ ...base, dlMax: 0 }, citation);
        expect(res.dwellingDensity.fact).toBeNull();
        expect(res.dwellingDensity.kind).toBe('unknown-zero');
        expect(res.dwellingDensity.withheldReason).toBe('served-zero-indistinguishable');
    });

    it('a COS/CSS above 1 or any negative is a DOMAIN BREACH — refused by name, never clipped', () => {
        const over = resolveLuPagEnvelope({ ...base, cosMax: 1.3 }, citation);
        expect(over.coverage.fact).toBeNull();
        expect(over.coverage.kind).toBe('refused-domain');
        expect(over.coverage.withheldReason).toBe('domain-breach');
        const neg = resolveLuPagEnvelope({ ...base, cssMax: -0.2 }, citation);
        expect(neg.soilSealing.fact).toBeNull();
        expect(neg.soilSealing.withheldReason).toBe('domain-breach');
        // CUS legitimately exceeds 1 (its numerator sums every storey, weighted) — NOT a breach.
        const cus = resolveLuPagEnvelope({ ...base, cusMax: 5.48 }, citation);
        expect(cus.weightedFar.fact).toBe(5.48);
    });

    it('served MINIMA are kept as facts only when strictly positive (zero/null → null)', () => {
        const res = resolveLuPagEnvelope({ ...base, cosMin: 0.1, cusMin: 0, dlMin: null }, citation);
        expect(res.minima).toEqual({ cosMin: 0.1, cusMin: null, dlMin: null });
        expect(res.caveats.join(' ')).toContain('MINIMA');
    });
});

describe('the GPKG bridge — one typed NQ-PAP row → the same compile surface', () => {
    const row: LuNqPapRow = {
        id: 1,
        xtfId: '11111111-2222-3333-4444-555555555555',
        codeCom: 'C116',
        denomination: 'Test NQ',
        cosMin: null, cosMax: 0.4, cusMin: null, cusMax: 0.8, cssMax: 0.6, dlMin: null, dlMax: 25,
        nomFichierEc: '116_PE_PAP_NQ',
        nomFichierSdEc: null, nomFichierSdGr: null,
        srs: 2169,
        geometry: null,
    };

    it('extracts fields + citation verbatim and stamps the bulk-gpkg channel', () => {
        expect(luPagFieldsFromNqPapRow(row)).toEqual({
            cosMax: 0.4, cosMin: null, cusMax: 0.8, cusMin: null, cssMax: 0.6, dlMax: 25, dlMin: null,
        });
        const cit = luPagCitationFromNqPapRow(row);
        expect(cit.channel).toBe('bulk-gpkg');
        expect(cit.communeCode).toBe('C116');
        expect(cit.zoneDenomination).toBe('Test NQ');
        expect(cit.partieEcriteFilename).toBe('116_PE_PAP_NQ');
        const { record } = luPagZoningRecord(luPagFieldsFromNqPapRow(row), cit);
        expect(record.provenance.crs).toBe('EPSG:2169');
        expect(record.structuredFields.plotRatioFAR ?? null).toBeNull();
    });
});

describe('L-449 — the gate is REGISTERED, SHUT, and unsigned (scribe-not-signatory)', () => {
    it('LU_PAG_CERTIFIED is in the certification registry with signature: null', () => {
        const row = L449_CERTIFICATION_GATES.find((g) => g.gate === 'LU_PAG_CERTIFIED');
        expect(row).toBeDefined();
        expect(row!.value).toBe(false);
        expect(row!.signature).toBeNull();
        expect(row!.file).toBe('packages/site-parcel-data/src/rulepacks/luPagEnvelope.ts');
        expect(isGateSignatureRecorded('LU_PAG_CERTIFIED')).toBe(false);
    });
});

describe('determinism — same served cells → byte-identical resolution', () => {
    it('is a pure function of the fields + citation', () => {
        const parsed = luPagFromInspireWfsFeature(recordedFeature())!;
        const a = resolveLuPagEnvelope(parsed.fields, parsed.citation);
        const b = resolveLuPagEnvelope(parsed.fields, parsed.citation);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
});
