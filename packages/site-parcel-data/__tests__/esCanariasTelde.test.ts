// KNOWN-ANSWER TEST — Canarias / Telde (INE 35026), SIPU 2.6.A.
//
// ⚠ LOCATION IS LOAD-BEARING. `vitest.config.ts` uses `include: ['__tests__/**/*.test.ts']`,
// which does NOT match a nested `src/**/__tests__/`. A silently-uncollected suite has bitten this
// repo three times, so this file sits at the PACKAGE ROOT `__tests__/`.
//
// WHAT THIS PINS
// --------------
// One named zone of one named municipality, with the EXPECTED OUTPUT written out, so that a
// change to the parser, the sentinel table, the range gates or the grammar detector fails LOUDLY
// rather than quietly producing a different building.
//
// The fixtures below are VERBATIM cell values from the `EDIF` table of `EDIF.mdb` inside
// `030319-pgo-ad-itpu-150323-210504-sipu.zip` (Gobierno de Canarias, opendata.sitcan.es) — the
// publisher's own strings, decimal commas and sentinels included. They are not paraphrased.

import { describe, expect, it } from 'vitest';
import {
    CANARIAS_ENVELOPE_VERIFIED,
    CANARIAS_ROUTABLE_MUNICIPALITIES,
    SIPU_HEIGHT_DATUM,
    canariasGraphedRefusal,
    canariasNoRulePackRefusal,
    detectSipuGrammar,
    fonMaxEdRoutingHint,
} from '../src/rulepacks/esCanariasSipu.js';
import {
    ES_TELDE_PGO2003_PACK,
    TELDE_PGO2003_ZONE_CODES,
    TELDE_UNPACKED_ZONES,
} from '../src/rulepacks/esTeldePgo2003.js';
import {
    classifyObservation,
    readSipuValue,
    readSipuZone,
    type SipuEdifRecord,
} from '../src/providers/canariasSipuProvider.js';

// ── VERBATIM FIXTURES ───────────────────────────────────────────────────────────────────────
/** Ordenanza E — ciudad jardín, unifamiliar aislada. The COMPLETE-RULE case. */
const TELDE_E: SipuEdifRecord = {
    Etiqueta: 'E',
    Nombre:
        'Proceso tipológico de ciudad jardín con edificación residencial unifamiliar aislada. ' +
        'Ordenanza E',
    SupMin: '250',
    SepMinFr: '5',
    SepMinPs: '5',
    SepMinLt: '2',
    DispObl: 'I',
    FonMaxEd: 'I',
    FonMaxEdm: 'I',
    PMaxOcup: '40',
    EdifMax: '0,6',
    AltMaxPl: '2',
    AltMaxMV: 'I',
    AltMaxMP: '7,5',
    ObsPMO: 'Art.229. Ordenanzas Municipales.',
    ObsAMPl: 'Art.229. Ordenanzas Municipales.',
};

/** Ordenanza G — alineación a vial + fondo. The ALIGNMENT case, and a STREET datum. */
const TELDE_G: SipuEdifRecord = {
    Etiqueta: 'G',
    Nombre:
        'Proceso tipológico de edificación en bloque lineal con orientación respecto al ' +
        'espacio urbano. Ordenanza G',
    SepMinFr: 'I',
    SepMinPs: 'I',
    SepMinLt: 'I',
    DispObl: 'AV',
    FonMaxEdm: '14',
    PMaxOcup: 'I',
    EdifMax: '4,8',
    AltMaxPl: '5',
    AltMaxMV: '16,5',
    AltMaxMP: 'I',
    ObsAMV: 'Art.231. Ordenanzas Municipales.',
};

/** Ordenanza D1 — `DispObl = GRF`. The GRAPHED-REFUSAL case. */
const TELDE_D1: SipuEdifRecord = {
    Etiqueta: 'D1',
    Nombre:
        'Proceso tipológico de edificación residencial colectiva con patio de manzana. ' +
        'Ordenanza D',
    SepMinFr: 'I',
    SepMinPs: 'I',
    SepMinLt: 'I',
    DispObl: 'GRF',
    FonMaxEdm: 'I',
    PMaxOcup: 'I',
    EdifMax: '2,8',
    AltMaxPl: '3',
    AltMaxMP: '11',
};

/** Ordenanza A1 — FAR + height, NO footprint rule. Lever 3's negative case. */
const TELDE_A1: SipuEdifRecord = {
    Etiqueta: 'A1',
    Nombre: 'Proceso tipológico tradicional con parcelación aleatoria. Ordenanza A',
    SepMinFr: 'I',
    SepMinPs: 'I',
    SepMinLt: 'I',
    DispObl: 'I',
    FonMaxEdm: 'I',
    PMaxOcup: 'I',
    EdifMax: '2,8',
    AltMaxPl: '3',
    AltMaxMP: '8,2',
};

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('Canarias SIPU — the publication GATE', () => {
    it('is SHUT, so no Canarias number can reach a user today', () => {
        // ⛔ If this ever fails, someone opened a publication gate without a human signature —
        // the MADRID_NZ1_CERTIFIED defect. Flipping it is a LEGAL act and belongs to the founder.
        expect(CANARIAS_ENVELOPE_VERIFIED).toBe(false);
    });

    it('scopes registration to the 41 municipalities with a determinable instrument', () => {
        expect(CANARIAS_ROUTABLE_MUNICIPALITIES).toHaveLength(41);
        // ⚠ Telde is the PILOT but is NOT claimed as routable by the census rule — its routing
        // rests on the adaptación-PLENA argument, which is asserted, not measured.
        expect(CANARIAS_ROUTABLE_MUNICIPALITIES).not.toContain('Telde');
    });
});

describe('Canarias SIPU — VALIDATE BEFORE COUNTING', () => {
    it('accepts 0 in a setback but REFUSES 0 storeys', () => {
        // 0 m front setback = build to the boundary. A real rule.
        expect(readSipuValue('SepMinFr', '0')).toEqual({ value: 0, reason: null });
        // 0 storeys is not a building. A null wearing a number.
        expect(readSipuValue('AltMaxPl', '0')).toEqual({ value: null, reason: 'zero-invalid' });
    });

    it('refuses metres sitting in the storeys column', () => {
        expect(readSipuValue('AltMaxPl', '7,5')).toEqual({
            value: null,
            reason: 'non-integer-floors',
        });
    });

    it('refuses a coverage outside 0–100 and a FAR above ~20', () => {
        expect(readSipuValue('PMaxOcup', '150').reason).toBe('out-of-range');
        // ⛔ 216 in an "edificabilidad" column is m² of FLOOR AREA, not a ratio — the trap that
        // cost this programme a 4x error before it was caught.
        expect(readSipuValue('EdifMax', '216').reason).toBe('out-of-range');
    });

    it('keeps SENTINEL distinct from ABSENT — a sentinel is UNKNOWN, never zero', () => {
        expect(readSipuValue('PMaxOcup', 'I')).toEqual({ value: null, reason: 'sentinel' });
        expect(readSipuValue('PMaxOcup', null)).toEqual({ value: null, reason: 'absent' });
        expect(readSipuValue('PMaxOcup', 'GRF').reason).toBe('sentinel');
    });

    it('reads the decimal COMMA and the thousands DOT the way the publisher writes them', () => {
        expect(readSipuValue('AltMaxMP', '7,5').value).toBe(7.5);
        // "1.000" is 1 000 m², not 1 m². Getting this backwards shrinks a minimum plot 1000x.
        expect(readSipuValue('SupMin', '1.000').value).toBe(1000);
    });

    it('separates a bare ARTICLE CITATION from a real CONDITION', () => {
        expect(classifyObservation('Art.229. Ordenanzas Municipales.')).toBe('citation-only');
        expect(classifyObservation('Anexo Ordenación de Suelos Urbanizables')).toBe(
            'citation-only',
        );
        expect(classifyObservation('2 plantas como máximo medidas en el punto medio')).toBe(
            'conditional',
        );
        expect(classifyObservation('')).toBe('none');
    });
});

describe('Canarias SIPU — GRAMMAR DETECTION maps to an engine that already exists', () => {
    it('selects SETBACK when the setback columns speak', () => {
        expect(
            detectSipuGrammar({
                dispObl: 'I',
                fonMaxEd: null,
                hasNumericDepth: false,
                hasSetback: true,
                hasCoverage: true,
            }),
        ).toBe('setback');
    });

    it('selects ALIGNMENT when an alignment token and a numeric depth speak together', () => {
        expect(
            detectSipuGrammar({
                dispObl: 'AV',
                fonMaxEd: null,
                hasNumericDepth: true,
                hasSetback: false,
                hasCoverage: false,
            }),
        ).toBe('alignment-depth');
    });

    it('REFUSES a graphed alignment rather than falling through to a setback inset', () => {
        // ⛔ The dangerous alternative is silently drawing a different building.
        expect(
            detectSipuGrammar({
                dispObl: 'GRF',
                fonMaxEd: null,
                hasNumericDepth: false,
                hasSetback: true,
                hasCoverage: true,
            }),
        ).toBe('graphed-refusal');
    });

    it('says a depth with no datum edge is UNSOLVABLE instead of guessing the edge', () => {
        expect(
            detectSipuGrammar({
                dispObl: 'I',
                fonMaxEd: null,
                hasNumericDepth: true,
                hasSetback: false,
                hasCoverage: false,
            }),
        ).toBe('depth-without-datum');
    });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('KNOWN ANSWER — Telde Ordenanza E, the parcel that DRAWS', () => {
    const r = readSipuZone(TELDE_E);

    it('produces the exact expected envelope inputs', () => {
        expect(r).toMatchObject({
            zoneCode: 'E',
            grammar: 'setback',
            floors: 2,
            far: 0.6,
            coverage: 0.4,
            setbacks: { front_m: 5, side_m: 2, rear_m: 5 },
            drawable: true,
        });
    });

    it('records the height DATUM, not a bare number', () => {
        // ⚠ 7,5 m measured from the PARCEL. Madrid's NM_ALTURA is uninterpretable precisely
        // because its datum is unstated, and §terrain-rasant (L-584) is the same defect.
        expect(r.height).toEqual({ value: 7.5, datum: 'parcel' });
    });

    it('is NOT flagged conditional — its Obs* cells are citations, not qualifications', () => {
        expect(r.conditional).toBe(false);
    });

    it('is packed, and the pack carries the citation the publisher supplied', () => {
        const zone = ES_TELDE_PGO2003_PACK.zones.find((z) => z.code === 'E');
        expect(zone).toBeDefined();
        expect(zone?.maxHeight_m).toBe(7.5);
        expect(zone?.maxFloors).toBe(2);
        expect(zone?.plotRatioFAR).toBe(0.6);
        expect(zone?.maxCoverage).toBe(0.4);
        expect(zone?.setbacks).toEqual({ front_m: 5, side_m: 2, rear_m: 5 });
        expect(zone?.geometricRule).toMatchObject({ kind: 'setback', front_m: 5, rear_m: 5 });
        expect(zone?.ordinanceRef).toContain('Art. 229');
    });
});

describe('KNOWN ANSWER — Telde Ordenanza G, the ALIGNMENT + DEPTH case', () => {
    const r = readSipuZone(TELDE_G);

    it('reads a published buildable depth and an alignment, from data', () => {
        // ⭐ Barcelona has to CONSTRUCT its depth from PGM Art. 242.2 and València's is on the
        // Plano C sheets. Telde publishes it as a number, in the row.
        expect(r.grammar).toBe('alignment-depth');
        expect(r.buildableDepth_m).toBe(14);
        expect(r.drawable).toBe(true);
    });

    it('records the STREET datum — a different datum from Ordenanza E', () => {
        expect(r.height).toEqual({ value: 16.5, datum: 'street' });
    });

    it('packs as GeometricRule kind "alignment" with NO new engine', () => {
        const zone = ES_TELDE_PGO2003_PACK.zones.find((z) => z.code === 'G');
        expect(zone?.geometricRule).toMatchObject({
            kind: 'alignment',
            alignTo: 'street',
            alignmentOffset_m: 0,
            sideTreatment: 'party-wall',
            buildableDepth_m: 14,
        });
    });

    it('packs R1 with DispOblm as the alignment OFFSET, not as a setback', () => {
        const zone = ES_TELDE_PGO2003_PACK.zones.find((z) => z.code === 'R1');
        expect(zone?.geometricRule).toMatchObject({
            kind: 'alignment',
            alignmentOffset_m: 14.75,
            buildableDepth_m: 15,
            sideTreatment: 'setback',
            side_m: 3,
        });
    });
});

describe('KNOWN ANSWER — the rows that must REFUSE', () => {
    it('D1 refuses because its building line is on a plan sheet', () => {
        const r = readSipuZone(TELDE_D1);
        expect(r.grammar).toBe('graphed-refusal');
        expect(r.drawable).toBe(false);
        expect(TELDE_UNPACKED_ZONES.D1).toContain('GRF');
        expect(TELDE_PGO2003_ZONE_CODES).not.toContain('D1');

        const refusal = canariasGraphedRefusal('D1', 'Ordenanza D', []);
        // The plan HAS the rule — so this refusal is legally grounded, unlike a coverage gap.
        expect(refusal.legallyGrounded).toBe(true);
        expect(refusal.detail).toContain('DispObl = GRF');
        // ⛔ NOT `source-data-unavailable`: that is the only code that earns a RETRY affordance,
        // and no number of retries turns a plan sheet into data.
        expect(refusal.code).toBe('regime-undetermined');
        expect(refusal.ordinanceRef).not.toBeNull();
    });

    it('A1 refuses because FAR ALONE DOES NOT DRAW', () => {
        // ⛔ The tempting bug: pack A1 with null setbacks. The engine insets by 0 and draws the
        // WHOLE PARCEL — L-616 mechanism-A, a confidently wrong number on a real plot.
        const r = readSipuZone(TELDE_A1);
        expect(r.far).toBe(2.8);
        expect(r.height.value).toBe(8.2);
        expect(r.drawable).toBe(false); // has FAR + height, has NO footprint rule
        expect(TELDE_PGO2003_ZONE_CODES).not.toContain('A1');
    });

    it('the coverage-gap refusal claims nothing about the LAW', () => {
        const refusal = canariasNoRulePackRefusal('E', 'Ordenanza E', []);
        // PRYZM has not read Telde's Normas Urbanísticas, so it may not assert what they require.
        expect(refusal.legallyGrounded).toBe(false);
        expect(refusal.code).toBe('no-rule-pack');
        // ⚠ An uncited refusal is honest here; an INVENTED citation would not be.
        expect(refusal.ordinanceRef).toBeNull();
    });

    it('refuses 100% coverage when a setback is ALSO published (they contradict)', () => {
        const contradictory: SipuEdifRecord = { ...TELDE_E, PMaxOcup: '100' };
        const r = readSipuZone(contradictory);
        expect(r.coverage).toBeNull();
        expect(r.rejections.PMaxOcup).toBe('out-of-range');
    });
});

describe('THE FOUR DATUMS — cornice ≠ crown ≠ street ≠ parcel', () => {
    // ⛔ Merging these is the NM_ALTURA ambiguity that makes Madrid legally uninterpretable.
    // Canarias disambiguates BY SCHEMA, so the information exists and must survive the read.
    it('names each datum distinctly and never as a synonym', () => {
        expect(SIPU_HEIGHT_DATUM.AltMaxMV).toBe('street');
        expect(SIPU_HEIGHT_DATUM.AltMaxMP).toBe('parcel');
        expect(SIPU_HEIGHT_DATUM.AltMaxCornis).toBe('cornice');
        expect(SIPU_HEIGHT_DATUM.AltMaxCoron).toBe('crown');
        // ⚠ `AltMaxMt` states metres but NOT the datum. 'unspecified' ≠ 'unknown': the column
        // spoke, the schema simply does not say from where.
        expect(SIPU_HEIGHT_DATUM.AltMaxMt).toBe('unspecified');
        expect(new Set(Object.values(SIPU_HEIGHT_DATUM)).size).toBe(6);
    });

    it('reads a CORNICE height and reports it as cornice, not as a generic height', () => {
        const r = readSipuZone({ ...TELDE_E, AltMaxMP: 'I', AltMaxCornis: '9,5' });
        expect(r.height).toEqual({ value: 9.5, datum: 'cornice' });
    });

    it('reads AltMaxMt but refuses to pretend it knows the datum', () => {
        const r = readSipuZone({ ...TELDE_E, AltMaxMP: 'I', AltMaxMt: '7' });
        expect(r.height).toEqual({ value: 7, datum: 'unspecified' });
    });

    it('takes the LOWEST when several datums speak — never the most generous', () => {
        const r = readSipuZone({
            ...TELDE_E,
            AltMaxMP: '12',
            AltMaxMV: '10',
            AltMaxCoron: '14',
        });
        // An envelope may not exceed ANY published datum.
        expect(r.height).toEqual({ value: 10, datum: 'street' });
    });
});

describe('Depth is near-absent in Canarias — so FonMaxEd is a ROUTING HINT, not a value', () => {
    it('surfaces an ordinance cross-reference as a hint, never as a depth', () => {
        const r = readSipuZone({ ...TELDE_E, FonMaxEd: 'Remitido a Plan Especial' });
        expect(r.depthRoutingHint).toBe('Remitido a Plan Especial');
        expect(r.buildableDepth_m).toBeNull(); // ⛔ a pointer is not a number
    });

    it('never mistakes a sentinel or a number for a hint', () => {
        expect(fonMaxEdRoutingHint('I')).toBeNull();
        expect(fonMaxEdRoutingHint('21')).toBeNull();
        expect(fonMaxEdRoutingHint('')).toBeNull();
    });

    it('never surfaces access_parser garbage to a user as an ordinance reference', () => {
        // ⚠ La Laguna's cells come back as variable-length parser garbage. That archive is
        // BLOCKED BY A PARSER DEFECT, not empty — and garbage must never reach a citation.
        // Built by code point so the fixture cannot smuggle raw control bytes into this
        // source file - the exact accident that produced these cells in the first place.
        const cjkGarbage = 'a' + String.fromCharCode(0x4000) + String.fromCharCode(0x1841);
        const ctrlGarbage = 'V@' + String.fromCharCode(0x01) + 'w';
        expect(fonMaxEdRoutingHint(cjkGarbage)).toBeNull();
        expect(fonMaxEdRoutingHint(ctrlGarbage)).toBeNull();
    });
});

describe('Telde pack integrity', () => {
    it('parses under the schema and keys only zones that carry a footprint rule', () => {
        expect(ES_TELDE_PGO2003_PACK.zones.length).toBeGreaterThan(0);
        for (const z of ES_TELDE_PGO2003_PACK.zones) {
            const hasFootprint =
                z.maxCoverage !== null ||
                z.setbacks.front_m !== null ||
                z.setbacks.side_m !== null ||
                z.setbacks.rear_m !== null ||
                (z.geometricRule !== null && z.geometricRule.kind === 'alignment');
            const hasHeight = z.maxHeight_m !== null || z.maxFloors !== null;
            expect(hasFootprint, `zone ${z.code} has no footprint rule`).toBe(true);
            expect(hasHeight, `zone ${z.code} has no height`).toBe(true);
        }
    });

    it('never claims a confidence tier implying a verified ordinance reading', () => {
        expect(ES_TELDE_PGO2003_PACK.defaultConfidence).toBe('estimated-ruleset');
    });

    it('names a reason for every unpacked zone', () => {
        for (const [code, why] of Object.entries(TELDE_UNPACKED_ZONES)) {
            expect(why.length, `zone ${code} has no stated reason`).toBeGreaterThan(20);
            expect(TELDE_PGO2003_ZONE_CODES).not.toContain(code);
        }
    });
});
