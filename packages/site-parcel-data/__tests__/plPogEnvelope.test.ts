// LANE PL-POG (2026-09-03) — proofs for the POG APP GML 2.0 → envelope-contribution compile
// (`src/rulepacks/plPogEnvelope.ts`). The COMPILE half of the census Type-B verdict for Poland.
//
// THE FIXTURE IS THE STATE'S OWN BYTES, sha256-pinned (the same official ministry POG sample the
// country-adapter tests pin — one artifact, one hash). The numbers asserted here are quoted
// VERBATIM from the fixture and cross-checked against the E-wave lane audit (§PL-2: strefa 1SZ →
// symbol "SZ", FAR 0.8, coverage 50.0 %, height 15.0 m uom="m", green 50.0 %) — two independent
// sources (§probe-can-be-wrong-three-ways).

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAppGml, type AppStrefaPlanistyczna } from '../src/parsers/appGml/index.js';
import {
    PL_POG_ENVELOPE_REF,
    PL_POG_HEIGHT_MAX_M,
    PL_POG_JURISDICTION_ID,
    PL_POG_SOURCE_ID,
    computeBuildableEnvelope,
    plPogCitationFromStrefa,
    plPogCoverageGapRefusal,
    plPogFieldsFromStrefa,
    plPogPlanIdentityOf,
    plPogZoningRecord,
    plPogZoningRecordFromStrefa,
    resolvePlPogEnvelope,
    type PlPogCitation,
} from '../src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const GML_PATH = resolve(HERE, 'fixtures/pl-app-gml-2-0/pog-official-sample-2024-12-04.gml');
const GML_SHA256 = '173690566bf1fab5fbb448970efc007219848d06eb93ff5e7e35c70ea5090853';
const GML = readFileSync(GML_PATH, 'utf8');

function parsedDoc() {
    const outcome = parseAppGml(GML);
    if (outcome.status !== 'parsed') throw new Error(`parse failed: ${JSON.stringify(outcome)}`);
    return outcome.document;
}

function strefaByOznaczenie(oz: string): AppStrefaPlanistyczna {
    const s = parsedDoc().strefyPlanistyczne.find((x) => x.oznaczenie === oz);
    if (s === undefined) throw new Error(`no strefa ${oz} in sample`);
    return s;
}

/** The single act's identity, used as the plan citation for every strefa of the sample. */
function sampleActIdentity() {
    return plPogPlanIdentityOf(parsedDoc().akty[0] ?? null);
}

// A 40 × 25 = 1000 m² canonical study parcel, scene-XZ.
const PARCEL = [
    { x: 0, z: 0 },
    { x: 40, z: 0 },
    { x: 40, z: 25 },
    { x: 0, z: 25 },
];
const PARCEL_AREA = 1000;
const EDGES = ['front', 'side', 'rear', 'side'] as const;

describe('fixture provenance', () => {
    it('is the byte-identical official ministry POG sample (sha256 pinned)', () => {
        expect(createHash('sha256').update(readFileSync(GML_PATH)).digest('hex')).toBe(GML_SHA256);
    });
});

describe('COMPILE — strefa 1SZ → envelope-contribution scalars, each cited', () => {
    it('compiles the four published ceilings VERBATIM, height binding, FAR/coverage withheld', () => {
        const s = strefaByOznaczenie('1SZ');
        const res = resolvePlPogEnvelope(plPogFieldsFromStrefa(s), plPogCitationFromStrefa(s, sampleActIdentity()));

        // HEIGHT — the one binding axis (metres, in range).
        expect(res.maxHeightM).toBe(15);
        expect(res.heightWithheldReason).toBeNull();

        // FAR — a compiled FACT, WITHHELD from binding (denominator).
        expect(res.maxFar).toBe(0.8);
        expect(res.farWithheldReason).toBe('denominator-dzialka-budowlana');

        // COVERAGE — a compiled FACT (50 % → fraction 0.5), WITHHELD from binding (denominator).
        expect(res.maxCoveragePct).toBe(50);
        expect(res.maxCoverageFraction).toBe(0.5);
        expect(res.coverageWithheldReason).toBe('denominator-dzialka-budowlana');

        // MIN GREEN — a fact.
        expect(res.minGreenPct).toBe(50);

        // The official sample act is a DRAFT (status elaboration) — never presented as in force.
        expect(res.inForce).toBe(false);
        expect(res.caveats.some((c) => c.includes('DRAFT') || c.includes('not in force'))).toBe(true);
    });

    it('EACH scalar carries its APP citation: plan id + version + the reform legal basis', () => {
        const act = sampleActIdentity();
        expect(act.planIdentity).not.toBeNull();
        const s = strefaByOznaczenie('1SZ');
        const res = resolvePlPogEnvelope(plPogFieldsFromStrefa(s), plPogCitationFromStrefa(s, act));
        // plan id
        expect(res.citation).toContain(act.planIdentity!);
        // version (the sample act carries a wersjaId)
        if (act.planVersion !== null) expect(res.citation).toContain(act.planVersion);
        // reform legal basis — art. 13e / the 2023 reform / upzp
        expect(res.citation).toContain('art. 13e');
        expect(res.citation).toContain('2023');
        expect(res.valueBasis.code).toBe('art. 13e');
        expect(PL_POG_ENVELOPE_REF).toContain('Dz.U. 2023 poz. 1688');
    });
});

describe('the ZoningRecord — ONLY height enters structuredFields (never FAR/coverage)', () => {
    it('binds height, and WITHHOLDS FAR + coverage by omission from the engine numbers', () => {
        const s = strefaByOznaczenie('1SZ');
        const { record, resolution } = plPogZoningRecordFromStrefa(s, sampleActIdentity());

        expect(record.jurisdictionId).toBe(PL_POG_JURISDICTION_ID);
        expect(record.zoneCode).toBe('SZ');
        expect(record.provenance.source).toBe(PL_POG_SOURCE_ID);
        expect(record.structuredFields.maxHeight_m).toBe(15);
        // The whole denominator point: neither ratio rides the numbers the engine multiplies.
        expect(record.structuredFields.plotRatioFAR ?? null).toBeNull();
        expect(record.structuredFields.maxCoverage ?? null).toBeNull();
        // Setbacks unresolved (POG serves none) → the engine will stamp footprintIsUpperBound.
        expect(record.structuredFields.setbacks).toEqual({ front_m: null, side_m: null, rear_m: null });
        // The facts still travel — on the citation, never as engine numbers.
        expect(record.ordinanceRef).toContain('FAR 0.8');
        expect(record.ordinanceRef).toContain('coverage 50');
        expect(resolution.maxFar).toBe(0.8);
    });

    it('the never-overstate tripwire: the naive FAR/coverage × parcel products appear NOWHERE', () => {
        const s = strefaByOznaczenie('1SZ');
        const { record } = plPogZoningRecordFromStrefa(s, sampleActIdentity());
        const serialised = JSON.stringify(record);
        // 0.8 × 1000 = 800 (GFA trap) and 0.5 × 1000 = 500 (footprint trap) — the C63 products.
        expect(serialised).not.toContain('"plotRatioFAR":0.8');
        expect(serialised).not.toMatch(/"maxCoverage":\s*0\.5/);
        // No fabricated GFA/footprint number smuggled into the record.
        expect(serialised).not.toContain('800');
        expect(serialised).not.toContain('gfa');
    });
});

describe('the ENVELOPE CONTRIBUTION — height binds through the real engine, FAR/coverage do not', () => {
    it('solves a height-capped envelope, footprintIsUpperBound, no FAR/coverage binding', () => {
        const s = strefaByOznaczenie('1SZ');
        const { record } = plPogZoningRecordFromStrefa(s, sampleActIdentity());
        const env = computeBuildableEnvelope({
            parcelRing: PARCEL,
            edgeClassifications: [...EDGES],
            zoning: record,
            rulePack: null,
        });
        expect(env.status).toBe('ok');
        expect(env.maxHeight_m).toBe(15);
        // The setback axis is unresolved and no footprint-shaping rule exists → unknown ≠ 0.
        expect(env.footprintIsUpperBound).toBe(true);
        // FAR and coverage never bind (withheld upstream) — the C63 trap cannot fire.
        expect(env.maxFAR).toBeNull();
        expect(env.maxCoverage).toBeNull();
        // The height cap is honoured: the inset footprint never exceeds the parcel.
        expect(env.insetAreaM2).toBeLessThanOrEqual(PARCEL_AREA + 1e-6);
    });
});

describe('THE RANGE GATE — an out-of-range or non-metre height is WITHHELD, never a wrong cap', () => {
    const cit: PlPogCitation = {
        planIdentity: 'PL.ZIPPZP.TEST/1POG',
        planVersion: '1',
        actStatus: 'legalForce',
        zoneDesignation: 'TEST',
        zoneSymbol: 'SZ',
        zoneIdentity: 'PL.ZIPPZP.TEST/strefa-1',
    };

    it('withholds a value past the plausibility band (a units-confusion artefact)', () => {
        const res = resolvePlPogEnvelope(
            { maxHeightValue: 4500, maxHeightUom: 'm', maxFar: 0.8, maxCoveragePct: 50, minGreenPct: 25 },
            cit,
        );
        expect(res.maxHeightM).toBeNull();
        expect(res.heightWithheldReason).toBe('height-out-of-range');
        expect(PL_POG_HEIGHT_MAX_M).toBe(1000);
        // The other scalars are unaffected — the withhold is surgical.
        expect(res.maxFar).toBe(0.8);
        expect(res.maxCoverageFraction).toBe(0.5);
    });

    it('withholds a non-metre height (gml:LengthType uom is never coerced)', () => {
        const res = resolvePlPogEnvelope(
            { maxHeightValue: 15, maxHeightUom: 'ft', maxFar: null, maxCoveragePct: null, minGreenPct: null },
            cit,
        );
        expect(res.maxHeightM).toBeNull();
        expect(res.heightWithheldReason).toBe('height-non-metre-uom');
    });

    it('a genuinely tall but plausible value (e.g. a 250 m downtown cap) still binds', () => {
        const res = resolvePlPogEnvelope(
            { maxHeightValue: 250, maxHeightUom: 'm', maxFar: null, maxCoveragePct: null, minGreenPct: null },
            cit,
        );
        expect(res.maxHeightM).toBe(250);
        expect(res.heightWithheldReason).toBeNull();
    });
});

describe('E4 control 9 — an ABSENT ceiling stays UNKNOWN, never 0 and never "no limit"', () => {
    it('emits not-published reasons (never a fabricated number) for absent ceilings', () => {
        // The sample omits FAR/height on 10 of 28 strefy and the green share on 8 — find one that
        // is missing a ceiling and assert it degrades honestly.
        const missingHeight = parsedDoc().strefyPlanistyczne.find(
            (x) => x.maksWysokoscZabudowy.kind === 'unspecified',
        );
        expect(missingHeight).toBeDefined();
        const res = resolvePlPogEnvelope(
            plPogFieldsFromStrefa(missingHeight!),
            plPogCitationFromStrefa(missingHeight!, sampleActIdentity()),
        );
        expect(res.maxHeightM).toBeNull();
        expect(res.heightWithheldReason).toBe('not-published');
        // Building the record over an absent height still parses (structuredFields.maxHeight_m null).
        const { record } = plPogZoningRecord(
            plPogFieldsFromStrefa(missingHeight!),
            plPogCitationFromStrefa(missingHeight!, sampleActIdentity()),
        );
        expect(record.structuredFields.maxHeight_m ?? null).toBeNull();
    });
});

describe('the COVERAGE-GAP REFUSAL — transient by name, never empty, never the pre-reform MPZP', () => {
    it('names the commune, is transient (endpoint-unreachable), and forbids an MPZP fallback', () => {
        const out = plPogCoverageGapRefusal('146510_8 Warszawa');
        expect(out.status).toBe('transient');
        if (out.status !== 'transient') throw new Error('unreachable');
        expect(out.reason.startsWith('endpoint-unreachable')).toBe(true);
        expect(out.reason).toContain('146510_8 Warszawa');
        expect(out.reason).toContain('coverage gap');
        expect(out.reason).toContain('NEVER the pre-reform MPZP');
    });
});

describe('determinism — same strefa → byte-identical resolution', () => {
    it('is a pure function of the fields + citation', () => {
        const s = strefaByOznaczenie('1SZ');
        const a = resolvePlPogEnvelope(plPogFieldsFromStrefa(s), plPogCitationFromStrefa(s, sampleActIdentity()));
        const b = resolvePlPogEnvelope(plPogFieldsFromStrefa(s), plPogCitationFromStrefa(s, sampleActIdentity()));
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
});
