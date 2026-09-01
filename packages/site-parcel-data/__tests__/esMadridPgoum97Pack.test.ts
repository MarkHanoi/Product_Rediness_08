// Madrid PGOUM-97 rule pack (Normas Zonales 4/5/7/8/9) — the pack, the honesty tier, the refusals,
// and the L-616 property tests.
//
// ⚠ THE FIRST TEST IS THE ONE THAT MATTERS (the L-445 lesson, mirrored from esCordobaPack.test.ts):
// the pack runs `JurisdictionZoningContractSchema.parse` at MODULE LOAD, so a schema violation is a
// runtime throw, not a type error. Importing it is the assertion.
//
// The rest pin the properties this pack exists to guarantee:
//   1. THE HUMAN GATE — `MADRID_ENVELOPE_VERIFIED` is false. A pack cannot certify its own reading.
//   2. THE HONESTY TIER — `pipeline-extracted-unverified` / `pipeline-extracted`, never `ordinance-pdf`.
//   3. EVERY NUMBER CARRIES ITS CITATION — article + apartado, per zone, machine-checked.
//   4. THE ZONE CODE SPACE IS THE LIVE MUNICIPAL VOCABULARY, and it does not collide with NZ 1's.
//   5. L-616 — no zone yields an envelope bigger than the parcel; an unknown constraint never
//      renders as zero; a height-proportional setback is packed at the value that pairs with the
//      zone's own maximum height, never at the ordinance floor.

import { describe, it, expect } from 'vitest';
import type { Pt, ParcelEdgeClassification, ZoningRecord } from '@pryzm/schemas';
import { computeBuildableEnvelope } from '../src/index.js';
import {
    ES_MADRID_PGOUM97_PACK,
    MADRID_PGOUM97_ZONE_CODES,
    MADRID_NZ3_ZONE_CODES,
    MADRID_PGOUM97_DEFAULT_CONFIDENCE,
    MADRID_PGOUM97_FIELD_PROVENANCE,
    MADRID_PGOUM97_GRANULARITY,
    MADRID_PGOUM97_RULE_KINDS,
    MADRID_ENVELOPE_VERIFIED,
    MADRID_FLOOR_ONLY_SEPARATIONS,
    MADRID_NZ4_RULE,
    MADRID_NZ5_LINDERO_SEPARATION,
    MADRID_NZ8_TESTERO_SEPARATION,
    MADRID_NZ86_LATERAL_SEPARATION,
    MADRID_NZ86_FAR_EXCESS,
    MADRID_NZ86_FAR_FIRST,
    MADRID_NZ86_FAR_STEP_M2,
    resolveMadridSeparation_m,
    madridNZ86BuildableArea_m2,
    madridNZ3Refusal,
    madridPgoum97UnverifiedRefusal,
} from '../src/rulepacks/esMadridPgoum97.js';
import { MADRID_NZ1_ZONE_CODES, MADRID_JURISDICTION_ID } from '../src/rulepacks/esMadridNZ1.js';

// ── A generous parcel: 80 m of frontage × 100 m deep. Big enough that even NZ 5 grado 1º's 25,50 m
//    separation leaves a real footprint, so a `degenerate` result would be a genuine bug and not an
//    artefact of the fixture. ────────────────────────────────────────────────────────────────────
const PARCEL: Pt[] = [
    { x: 0, z: 0 },
    { x: 80, z: 0 },
    { x: 80, z: 100 },
    { x: 0, z: 100 },
];
const PARCEL_AREA = 80 * 100;
const WITH_FRONT: ParcelEdgeClassification[] = ['front', 'side', 'rear', 'side'];

function madridZoning(zoneCode: string): ZoningRecord {
    return {
        zoneCode,
        zoneLabel: zoneCode,
        jurisdictionId: MADRID_JURISDICTION_ID,
        structuredFields: {},
        overlays: [],
        ordinanceRef: null,
        provenance: {
            source: MADRID_JURISDICTION_ID,
            label: 'Madrid PGOUM-97 Compendio 2025 (test)',
            version: '2026-07-31',
            license: null,
            crs: 'EPSG:25830',
        },
    };
}

function solve(zoneCode: string) {
    return computeBuildableEnvelope({
        parcelRing: PARCEL,
        edgeClassifications: WITH_FRONT,
        zoning: madridZoning(zoneCode),
        rulePack: ES_MADRID_PGOUM97_PACK,
    });
}

const zoneOf = (code: string) => ES_MADRID_PGOUM97_PACK.zones.find((z) => z.code === code)!;

// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('Madrid PGOUM-97 — the pack is VALID (parses at load) and covers 23 zone codes', () => {
    it('parsed the schema without throwing', () => {
        expect(ES_MADRID_PGOUM97_PACK.jurisdictionId).toBe(MADRID_JURISDICTION_ID);
        expect(ES_MADRID_PGOUM97_PACK.source).toBe('madrid-pgou');
        expect(ES_MADRID_PGOUM97_PACK.zones).toHaveLength(23);
        expect([...MADRID_PGOUM97_ZONE_CODES]).toHaveLength(23);
        for (const code of MADRID_PGOUM97_ZONE_CODES) {
            expect(zoneOf(code), code).toBeDefined();
        }
    });

    it('the codes are exactly the live AMB_TX_ETIQ vocabulary for NZ 4/5/7/8/9', () => {
        // Probed live 2026-07-24 against
        // sigma.madrid.es/.../DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer/0.
        expect([...MADRID_PGOUM97_ZONE_CODES].sort()).toEqual(
            [
                '4',
                '5.1', '5.2', '5.3',
                '7.1.a', '7.1.b', '7.2.e',
                '8.1.a', '8.1.c', '8.2.a', '8.2.b', '8.2.c', '8.3.a', '8.3.c', '8.4', '8.5', '8.6',
                '9.1', '9.2', '9.3', '9.4.a', '9.4.b', '9.5',
            ].sort(),
        );
    });

    it('23 packed + 6 NZ 1 + 5 NZ 3 = the 34 codes the municipal layer publishes', () => {
        expect(
            MADRID_PGOUM97_ZONE_CODES.length +
                MADRID_NZ1_ZONE_CODES.length +
                MADRID_NZ3_ZONE_CODES.length,
        ).toBe(34);
    });

    it('⚠ NEVER collides with Norma Zonal 1 — that is a SETTLED explicit-area decision', () => {
        // `packMap()` throws on a duplicate registration, so a collision here would break the
        // registry at import time. This asserts the intent before the mechanism has to.
        for (const nz1 of MADRID_NZ1_ZONE_CODES) {
            expect(
                (MADRID_PGOUM97_ZONE_CODES as readonly string[]).includes(nz1),
                `NZ 1 code ${nz1} leaked into the PGOUM-97 pack`,
            ).toBe(false);
        }
        for (const nz3 of MADRID_NZ3_ZONE_CODES) {
            expect((MADRID_PGOUM97_ZONE_CODES as readonly string[]).includes(nz3)).toBe(false);
        }
    });
});

describe('Madrid PGOUM-97 — THE HUMAN GATE and the honesty tier', () => {
    it('MADRID_ENVELOPE_VERIFIED is FALSE — a pack cannot sign its own transcription', () => {
        expect(MADRID_ENVELOPE_VERIFIED).toBe(false);
    });

    it('ships `pipeline-extracted-unverified`, NOT `estimated-ruleset` and NOT `structured`', () => {
        expect(ES_MADRID_PGOUM97_PACK.defaultConfidence).toBe(MADRID_PGOUM97_DEFAULT_CONFIDENCE);
        expect(ES_MADRID_PGOUM97_PACK.defaultConfidence).toBe('pipeline-extracted-unverified');
        expect(ES_MADRID_PGOUM97_PACK.defaultConfidence).not.toBe('estimated-ruleset');
    });

    it('EVERY field provenance is `pipeline-extracted` — never the human `ordinance-pdf`', () => {
        let checked = 0;
        for (const z of ES_MADRID_PGOUM97_PACK.zones) {
            for (const [field, prov] of Object.entries(z.fieldProvenance ?? {})) {
                expect(prov, `${z.code}.${field}`).toBe(MADRID_PGOUM97_FIELD_PROVENANCE);
                checked++;
            }
        }
        expect(checked).toBeGreaterThan(100);
    });

    it('declares its GRANULARITY rather than leaving it to be inferred (C58 §1.11)', () => {
        expect(MADRID_PGOUM97_GRANULARITY).toBe('parcel');
    });
});

describe('Madrid PGOUM-97 — EVERY number carries its citation', () => {
    it('every zone cites at least one article, with an apartado, and names the source document', () => {
        for (const z of ES_MADRID_PGOUM97_PACK.zones) {
            const ref = z.ordinanceRef ?? '';
            expect(ref, z.code).toMatch(/PGOUM-97 Art\. 8\.\d+\.\d+/);
            expect(ref, z.code).toMatch(/ap\./);
            expect(ref, z.code).toMatch(/Compendio 2025/);
            // The tier must ride WITH the citation, not only on the pack header.
            expect(ref, z.code).toMatch(/pipeline-extracted-unverified/);
        }
    });

    it('a zone that publishes a number cites the article for it — no bare values', () => {
        for (const z of ES_MADRID_PGOUM97_PACK.zones) {
            const ref = z.ordinanceRef ?? '';
            if (z.plotRatioFAR !== null) expect(ref, `${z.code} FAR`).toMatch(/edificabilidad/i);
            if (z.maxCoverage !== null) expect(ref, `${z.code} cov`).toMatch(/ocupación/i);
            if (z.maxHeight_m !== null) expect(ref, `${z.code} h`).toMatch(/plantas|altura|cornisa|coronación/i);
        }
    });

    it('a zone whose value is NULL says WHY, in the citation, with a ⚠ marker', () => {
        for (const z of ES_MADRID_PGOUM97_PACK.zones) {
            const ref = z.ordinanceRef ?? '';
            const anyNull =
                z.maxHeight_m === null ||
                z.plotRatioFAR === null ||
                z.maxCoverage === null ||
                z.setbacks.front_m === null;
            if (anyNull) expect(ref, `${z.code} null-reason`).toMatch(/NULL|null/);
        }
    });
});

describe('Madrid PGOUM-97 — the rule KIND is stated per zone (ADR-0270 / C58 §2.2)', () => {
    it('every packed code has a declared kind, and only NZ 4 is `alignment`', () => {
        for (const code of MADRID_PGOUM97_ZONE_CODES) {
            expect(MADRID_PGOUM97_RULE_KINDS[code], code).toBeDefined();
        }
        const alignments = Object.entries(MADRID_PGOUM97_RULE_KINDS)
            .filter(([, k]) => k === 'alignment')
            .map(([c]) => c);
        expect(alignments).toEqual(['4']);
    });

    it('the declared kind agrees with the shipped `geometricRule` wherever one exists', () => {
        for (const z of ES_MADRID_PGOUM97_PACK.zones) {
            if (z.geometricRule) {
                expect(z.geometricRule.kind, z.code).toBe(MADRID_PGOUM97_RULE_KINDS[z.code]);
            } else {
                // A null geometricRule is the engine's legacy per-edge inset — i.e. `setback`.
                expect(MADRID_PGOUM97_RULE_KINDS[z.code], z.code).toBe('setback');
            }
        }
    });

    it('NZ 4 is the Madrid *ensanche*: build-to line, party walls, 12 m fondo (Art. 8.4.7.1)', () => {
        expect(MADRID_NZ4_RULE).toMatchObject({
            kind: 'alignment',
            alignmentOffset_m: 0,
            sideTreatment: 'party-wall',
            buildableDepth_m: 12,
        });
        expect(zoneOf('4').geometricRule).toEqual(MADRID_NZ4_RULE);
    });

    it('⚠ NZ 9 grados 1º/2º are NOT alignment zones — Art. 8.9.6.1\'s 12 m is a party-wall threshold', () => {
        // Importing NZ 4's fondo here would be the L-526 failure verbatim.
        for (const code of ['9.1', '9.2']) {
            expect(MADRID_PGOUM97_RULE_KINDS[code], code).toBe('setback');
            expect(zoneOf(code).geometricRule, code).toBeNull();
        }
    });
});

describe('Madrid PGOUM-97 — ADR-0271: the DERIVED parameters are null, never a constant', () => {
    it('NZ 4 states NO FAR — Art. 8.4.9.1 is a CONSTRUCTION, not a ratio', () => {
        expect(zoneOf('4').plotRatioFAR).toBeNull();
        expect(zoneOf('4').ordinanceRef).toMatch(/CONSTRUCTION/);
    });

    it('⚠ NZ 4 does NOT borrow Art. 8.4.2.2.e)\'s 2,4 — that is an EXISTING-industrial ceiling', () => {
        expect(zoneOf('4').plotRatioFAR).not.toBe(2.4);
    });

    it('the street-width-governed zones publish NO height and NO floors', () => {
        for (const code of ['4', '9.1', '9.2']) {
            expect(zoneOf(code).maxHeight_m, code).toBeNull();
            expect(zoneOf(code).maxFloors, code).toBeNull();
        }
    });

    it('NZ 8 grado 6º packs the CONSERVATIVE excess coefficient, not the headline 0,7', () => {
        expect(zoneOf('8.6').plotRatioFAR).toBe(MADRID_NZ86_FAR_EXCESS);
        expect(zoneOf('8.6').plotRatioFAR).toBe(0.5);
        expect(zoneOf('8.6').plotRatioFAR).not.toBe(MADRID_NZ86_FAR_FIRST);
    });

    it('`madridNZ86BuildableArea_m2` is the exact Art. 8.8.9.1.f) step function', () => {
        // At or below the step: the flat 0,7.
        expect(madridNZ86BuildableArea_m2(400)).toBeCloseTo(280, 9);
        expect(madridNZ86BuildableArea_m2(MADRID_NZ86_FAR_STEP_M2)).toBeCloseTo(350, 9);
        // Above it: 0,7 on the first 500, 0,5 on the excess ⇒ an EFFECTIVE ratio of 0,60 at 1000 m².
        expect(madridNZ86BuildableArea_m2(1000)).toBeCloseTo(600, 9);
        expect(madridNZ86BuildableArea_m2(1000)! / 1000).toBeCloseTo(0.6, 9);
        // The packed scalar UNDER-states (safe); the headline 0,7 would OVER-state.
        expect(0.5 * 1000).toBeLessThan(madridNZ86BuildableArea_m2(1000)!);
        expect(0.7 * 1000).toBeGreaterThan(madridNZ86BuildableArea_m2(1000)!);
        // Never guesses.
        expect(madridNZ86BuildableArea_m2(0)).toBeNull();
        expect(madridNZ86BuildableArea_m2(Number.NaN)).toBeNull();
    });
});

describe('Madrid PGOUM-97 — L-616: height-proportional setbacks are packed at the ZONE MAXIMUM', () => {
    it('`resolveMadridSeparation_m` returns NULL for an unknown height — never the floor, never 0', () => {
        expect(resolveMadridSeparation_m(MADRID_NZ8_TESTERO_SEPARATION, null)).toBeNull();
        expect(resolveMadridSeparation_m(MADRID_NZ8_TESTERO_SEPARATION, 0)).toBeNull();
        expect(resolveMadridSeparation_m(MADRID_NZ8_TESTERO_SEPARATION, Number.NaN)).toBeNull();
    });

    it('the floor binds only below the break-even height, and the formula above it', () => {
        // NZ 8 testero: max(4, 2H/3). Break-even at H = 6 m.
        expect(resolveMadridSeparation_m(MADRID_NZ8_TESTERO_SEPARATION, 3)).toBe(4);
        expect(resolveMadridSeparation_m(MADRID_NZ8_TESTERO_SEPARATION, 6)).toBeCloseTo(4, 9);
        expect(resolveMadridSeparation_m(MADRID_NZ8_TESTERO_SEPARATION, 10.5)).toBeCloseTo(7, 9);
    });

    it('NZ 5 packs 25,50 / 15,00 / 7,50 — NOT the printed 5 m floor (a 5× under-inset)', () => {
        expect(zoneOf('5.1').setbacks.side_m).toBeCloseTo(25.5, 9);
        expect(zoneOf('5.2').setbacks.side_m).toBeCloseTo(15, 9);
        expect(zoneOf('5.3').setbacks.side_m).toBeCloseTo(7.5, 9);
        for (const code of ['5.1', '5.2', '5.3']) {
            expect(zoneOf(code).setbacks.side_m, code).toBeGreaterThan(
                MADRID_NZ5_LINDERO_SEPARATION.floor_m,
            );
            // Side and rear share Art. 8.5.6.4.a) — "el lindero correspondiente", undistinguished.
            expect(zoneOf(code).setbacks.rear_m, code).toBe(zoneOf(code).setbacks.side_m);
        }
    });

    it('NZ 8 packs a 7,00 m testero at 10,50 m cornisa — NOT the printed 4 m', () => {
        for (const code of ['8.1.a', '8.1.c', '8.2.a', '8.2.b', '8.2.c', '8.3.a', '8.3.c', '8.4', '8.6']) {
            expect(zoneOf(code).setbacks.rear_m, code).toBeCloseTo(7, 9);
        }
        // Grado 5º is the only 2-planta / 7 m grado, so ITS testero is 2·7/3 = 4,67 m.
        expect(zoneOf('8.5').setbacks.rear_m).toBeCloseTo(14 / 3, 9);
        expect(zoneOf('8.5').setbacks.rear_m).toBeGreaterThan(MADRID_NZ8_TESTERO_SEPARATION.floor_m);
    });

    it('NZ 8 grado 6º packs a 5,25 m lateral — its side rule is ALSO a formula (Art. 8.8.6.1.f)', () => {
        expect(zoneOf('8.6').setbacks.side_m).toBeCloseTo(5.25, 9);
        expect(zoneOf('8.6').setbacks.side_m).toBeGreaterThan(MADRID_NZ86_LATERAL_SEPARATION.floor_m);
        // Every other NZ 8 grado states a plain distance, so grado 6º must differ from grado 3º's 3 m.
        expect(zoneOf('8.3.a').setbacks.side_m).toBe(3);
    });

    it('the FLOOR-ONLY zones are declared, with their break-even height and their reason', () => {
        expect(MADRID_FLOOR_ONLY_SEPARATIONS.map((e) => e.zoneCode).sort()).toEqual(['4', '9.1', '9.2']);
        for (const e of MADRID_FLOOR_ONLY_SEPARATIONS) {
            // Each one is a zone whose height is unresolved — that is the whole reason it is here.
            expect(zoneOf(e.zoneCode).maxHeight_m, e.zoneCode).toBeNull();
            expect(zoneOf(e.zoneCode).setbacks[`${e.edge}_m`], e.zoneCode).toBe(e.packed_m);
            expect(e.breakEvenHeight_m).toBeGreaterThan(0);
            expect(e.why.length).toBeGreaterThan(40);
        }
    });
});

describe('Madrid PGOUM-97 — L-616: an unknown constraint NEVER renders as zero', () => {
    it('every null in the pack is a null, not a 0 wearing a null\'s name', () => {
        for (const z of ES_MADRID_PGOUM97_PACK.zones) {
            for (const v of [z.maxHeight_m, z.maxFloors, z.plotRatioFAR, z.maxCoverage]) {
                // Nothing in this pack legitimately equals 0 on these four fields — a 0 would mean
                // "nothing may be built", which no PGOUM zone says.
                expect(v === null || v > 0, z.code).toBe(true);
            }
        }
    });

    it('a null pack field reaches the envelope as null, never coerced to 0', () => {
        const nz4 = solve('4');
        expect(nz4.maxFAR).toBeNull();
        expect(nz4.maxCoverage).toBeNull();
        expect(nz4.maxHeight_m).toBeNull();
        for (const code of ['9.1', '9.3', '9.5']) {
            expect(solve(code).maxCoverage, code).toBeNull();
        }
    });

    it('the zones that DO publish numbers carry them through to the envelope', () => {
        const nz51 = solve('5.1');
        expect(nz51.maxHeight_m).toBe(51);
        expect(nz51.maxFAR).toBe(2);
        expect(nz51.maxCoverage).toBe(0.5);
        const nz81a = solve('8.1.a');
        expect(nz81a.maxHeight_m).toBe(10.5);
        expect(nz81a.maxFAR).toBe(0.3);
        expect(nz81a.maxCoverage).toBe(0.2);
    });
});

describe('Madrid PGOUM-97 — L-616: no zone yields an envelope BIGGER than the parcel', () => {
    for (const code of MADRID_PGOUM97_ZONE_CODES) {
        it(`${code} solves to a footprint strictly inside the parcel`, () => {
            const env = solve(code);
            expect(env.status, code).toBe('ok');
            expect(env.insetAreaM2, code).toBeGreaterThan(0);
            expect(env.insetAreaM2, code).toBeLessThanOrEqual(PARCEL_AREA);
            expect(env.zoneCode, code).toBe(code);
        });
    }

    it('⚠ NO zone draws the WHOLE parcel — every one erodes or clips something', () => {
        for (const code of MADRID_PGOUM97_ZONE_CODES) {
            const env = solve(code);
            expect(env.insetAreaM2, `${code} drew the whole parcel`).toBeLessThan(PARCEL_AREA);
        }
    });

    it('`footprintIsUpperBound` flags EXACTLY the zones with an unresolved edge (§NEVER-OVERSTATE-A)', () => {
        // §NEVER-OVERSTATE-A (E2a, 2026-09-01) — this pin used to assert the flag FALSE for every
        // zone, on the §L-619 all-null semantics ("every Madrid zone knows at least one edge").
        // But the NZ 5 grados ship `front_m: null` and the pack's OWN block comment says of it:
        // "the geometric effect is the same: NO front inset. On a narrow street that OVER-STATES."
        // A partially-unknown setback is the same mechanism-A over-statement one notch narrower,
        // so those zones now flag as upper-bound with a caveat naming the front axis. NZ 4 keeps
        // its `alignment` rule (footprint-shaping ⇒ never flagged); every fully-stated setback
        // zone stays a solved footprint.
        const EXPECT_FLAGGED = new Set(['5.1', '5.2', '5.3']);
        for (const code of MADRID_PGOUM97_ZONE_CODES) {
            const env = solve(code);
            expect(env.footprintIsUpperBound, code).toBe(EXPECT_FLAGGED.has(code));
            if (EXPECT_FLAGGED.has(code)) {
                const caveat = env.caveats.find((c) => c.includes('UNKNOWN on the'));
                expect(caveat, `${code} must name the unresolved axis`).toBeDefined();
                expect(caveat!).toContain('front');
            }
        }
    });

    it('NZ 4 clips to the 12 m depth band, not to the 100 m parcel depth', () => {
        const env = solve('4');
        // Party walls + build-to line ⇒ the band is the full 80 m frontage × 12 m.
        expect(env.insetAreaM2).toBeCloseTo(80 * 12, 6);
        expect(env.insetAreaM2).toBeLessThan(PARCEL_AREA * 0.2);
    });

    it('NZ 5 grado 1º\'s 25,50 m separation is what shapes the plot — the floor would not', () => {
        const env = solve('5.1');
        // front null ⇒ no front inset; sides + rear at 25.50 m ⇒ (80 − 51) × (100 − 25.5).
        expect(env.insetAreaM2).toBeCloseTo((80 - 51) * (100 - 25.5), 6);
        // Had the 5 m floor been packed, the footprint would have been ~4× larger.
        expect(env.insetAreaM2).toBeLessThan((80 - 10) * (100 - 5));
    });
});

describe('Madrid PGOUM-97 — Norma Zonal 3 is a LEGALLY GROUNDED refusal, never a pack', () => {
    it('is cited, legally grounded, and coded `derived-plan`', () => {
        const r = madridNZ3Refusal();
        expect(r.code).toBe('derived-plan');
        expect(r.legallyGrounded).toBe(true);
        expect(r.ordinanceRef).toMatch(/Art\. 8\.3\.1/);
        expect(r.ordinanceRef).toMatch(/Compendio 2025/);
        expect(r.detail).toMatch(/aprovechamiento urbanístico/);
        expect(r.detail).toMatch(/antecedent/i);
    });

    it('carries the caller\'s known facts through untouched', () => {
        const r = madridNZ3Refusal(['parcel 1234', 'ámbito X']);
        expect(r.knownFacts).toEqual(['parcel 1234', 'ámbito X']);
    });

    it('⚠ does NOT leak the 1,4 m²/m² that Art. 8.3.5.3.b)ii)b) mentions', () => {
        // That figure is NZ 5 grado 3º's, applied by reference to DOTACIONAL parcels only.
        const r = madridNZ3Refusal();
        expect(JSON.stringify(r)).not.toMatch(/1[.,]4\s*m²/);
    });
});

describe('Madrid PGOUM-97 — the unverified refusal is about US, not about the plan', () => {
    it('is NOT legally grounded — the law is known; the human signature is not', () => {
        const r = madridPgoum97UnverifiedRefusal('8.1.a');
        expect(r.legallyGrounded).toBe(false);
        expect(r.code).toBe('source-data-unavailable');
        expect(r.headline).toMatch(/8\.1\.a/);
        expect(r.detail).toMatch(/human/i);
        expect(r.ordinanceRef).toMatch(/Compendio 2025/);
    });

    it('⚠ states NO number — a refusal that carried one would be the back door', () => {
        const r = madridPgoum97UnverifiedRefusal('4');
        // No metre / m²/m² / percentage figures anywhere in the card.
        expect(r.detail).not.toMatch(/\d+[.,]\d+\s*(m²|m\b|%)/);
    });
});
