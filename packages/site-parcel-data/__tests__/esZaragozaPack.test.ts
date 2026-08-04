// Zaragoza (INE 50297) PGOU 2024 — the Grado A1 subgrados 3.1/3.2/4.1/4.2 pack + the HONESTY GATE.
//
// Mirrors `esCordobaPack.test.ts`'s structure:
//   1. THE PACK PARSES (module-load assertion — `JurisdictionZoningContractSchema.parse` throws on
//      a schema violation, so importing it is already a test).
//   2. THE 4 ZONE TABLE ENTRIES match the transcribed values exactly.
//   3. THE GATE STAYS CLOSED — a resolved subgrado gets a cited refusal, never a number, while
//      `ZARAGOZA_ENVELOPE_VERIFIED` is false.
//   4. THE STREET-WIDTH BANDING produces the right height/floors/FAR for both A1/3.* bands.

import { describe, it, expect } from 'vitest';
import {
    ES_ZARAGOZA_PGOU2024_PACK,
    ZARAGOZA_ZONE_CODES,
    ZARAGOZA_FIELD_PROVENANCE,
    ZARAGOZA_PACK_DEFAULT_CONFIDENCE,
    ZARAGOZA_A1_3_WIDTH_BANDS,
    ZARAGOZA_A1_3_2_TRAVESIA_GAP,
    ZARAGOZA_MISSING_CONSTRAINTS,
    resolveZaragozaA13Height,
    zaragozaA13WeightedEdificabilidad,
    zaragozaA13ResolvedPack,
    type ZaragozaA13Resolution,
} from '../src/rulepacks/esZaragoza.js';
import {
    ZARAGOZA_ENVELOPE_VERIFIED,
    ZARAGOZA_JURISDICTION_ID,
    zaragozaNoRulePackRefusal,
} from '../src/rulepacks/esAragon.js';
import { isInZaragoza, ZARAGOZA_BBOX } from '../src/providers/aragonBbox.js';
import { resolveZoneDisposition, listJurisdictionCoverage } from '../src/rulepacks/registry.js';

describe('Zaragoza PGOU 2024 — the pack is VALID (parses at load) and covers 4 subgrados', () => {
    it('parsed the schema without throwing', () => {
        expect(ES_ZARAGOZA_PGOU2024_PACK.jurisdictionId).toBe(ZARAGOZA_JURISDICTION_ID);
        expect(ES_ZARAGOZA_PGOU2024_PACK.zones).toHaveLength(4);
        expect([...ZARAGOZA_ZONE_CODES]).toEqual(['A1/3.1', 'A1/3.2', 'A1/4.1', 'A1/4.2']);
        for (const code of ZARAGOZA_ZONE_CODES) {
            expect(ES_ZARAGOZA_PGOU2024_PACK.zones.find((z) => z.code === code)).toBeDefined();
        }
    });
});

describe('Zaragoza — the HONESTY TIER', () => {
    it('the pack ceiling is `estimated-ruleset`, never higher (human/agent transcription, not OCR)', () => {
        expect(ES_ZARAGOZA_PGOU2024_PACK.defaultConfidence).toBe('estimated-ruleset');
        expect(ES_ZARAGOZA_PGOU2024_PACK.defaultConfidence).toBe(ZARAGOZA_PACK_DEFAULT_CONFIDENCE);
        expect(ES_ZARAGOZA_PGOU2024_PACK.defaultConfidence).not.toBe('pipeline-extracted-unverified');
    });

    it('EVERY declared field provenance is `ordinance-pdf`, never `pipeline-extracted` / `estimated`', () => {
        let checked = 0;
        for (const z of ES_ZARAGOZA_PGOU2024_PACK.zones) {
            for (const [field, prov] of Object.entries(z.fieldProvenance ?? {})) {
                expect(prov, `${z.code}.${field}`).toBe('ordinance-pdf');
                expect(prov, `${z.code}.${field}`).toBe(ZARAGOZA_FIELD_PROVENANCE);
                checked++;
            }
        }
        expect(checked).toBeGreaterThan(0);
    });

    it('every zone carries an ordinanceRef citing a PGOU article', () => {
        for (const z of ES_ZARAGOZA_PGOU2024_PACK.zones) {
            expect(z.ordinanceRef, `${z.code}.ref`).toBeTruthy();
            expect(z.ordinanceRef, `${z.code}.ref`).toMatch(/PGOU Zaragoza 2024/);
        }
    });
});

describe('Zaragoza — the 4 zone table entries match the transcribed values exactly', () => {
    const zone = (code: string) => {
        const z = ES_ZARAGOZA_PGOU2024_PACK.zones.find((zz) => zz.code === code);
        if (!z) throw new Error(`missing zone ${code}`);
        return z;
    };

    it('A1/3.1 (Art. 4.1.12) — TABLE height/FAR (null), 50% maxCoverage, 15 m alignment depth', () => {
        const z = zone('A1/3.1');
        expect(z.maxHeight_m).toBeNull();
        expect(z.maxFloors).toBeNull();
        expect(z.plotRatioFAR).toBeNull();
        expect(z.maxCoverage).toBe(0.5);
        expect(z.setbacks).toEqual({ front_m: null, side_m: null, rear_m: null });
        expect(z.geometricRule).toMatchObject({
            kind: 'alignment',
            alignTo: 'street',
            alignmentOffset_m: 0,
            sideTreatment: 'party-wall',
            buildableDepth_m: 15,
        });
    });

    it('A1/3.2 (Art. 4.1.13) — same shape as A1/3.1 (travesía band deliberately omitted)', () => {
        const z = zone('A1/3.2');
        expect(z.maxHeight_m).toBeNull();
        expect(z.maxFloors).toBeNull();
        expect(z.plotRatioFAR).toBeNull();
        expect(z.maxCoverage).toBe(0.5);
        expect(z.geometricRule).toMatchObject({ kind: 'alignment', buildableDepth_m: 15 });
        expect(z.ordinanceRef).toMatch(/Travesía/);
        expect(z.ordinanceRef).toMatch(/UNRESOLVED|KNOWN GAP/i);
    });

    it('A1/4.1 (Art. 4.1.15) — FIXED B+2/10 m/1.15 FAR, no street-width table', () => {
        const z = zone('A1/4.1');
        expect(z.maxHeight_m).toBe(10);
        expect(z.maxFloors).toBe(3); // planta baja + 2 = B+2
        expect(z.plotRatioFAR).toBe(1.15);
        expect(z.maxCoverage).toBe(0.5);
        expect(z.geometricRule).toMatchObject({ kind: 'alignment', buildableDepth_m: 15 });
    });

    it('A1/4.2 (Art. 4.1.17) — identical fixed numbers to A1/4.1 ("igual que en A1-4.1")', () => {
        const z41 = zone('A1/4.1');
        const z42 = zone('A1/4.2');
        expect(z42.maxHeight_m).toBe(z41.maxHeight_m);
        expect(z42.maxFloors).toBe(z41.maxFloors);
        expect(z42.plotRatioFAR).toBe(z41.plotRatioFAR);
        expect(z42.maxCoverage).toBe(z41.maxCoverage);
        expect(z42.geometricRule).toEqual(z41.geometricRule);
        expect(z42.ordinanceRef).toMatch(/densidad/i);
    });
});

describe('Zaragoza — the street-width band table (Art. 4.1.12/4.1.13)', () => {
    it('two bands: <12 m → B+2/10.50 m/1.60; ≥12 m → B+3/13.50 m/2.10', () => {
        expect(ZARAGOZA_A1_3_WIDTH_BANDS).toHaveLength(2);
        expect(ZARAGOZA_A1_3_WIDTH_BANDS[0]).toMatchObject({
            minWidth_m: 0, maxWidth_m: 12, floorsAboveGround: 2, height_m: 10.5, far: 1.6,
        });
        expect(ZARAGOZA_A1_3_WIDTH_BANDS[1]).toMatchObject({
            minWidth_m: 12, maxWidth_m: Infinity, floorsAboveGround: 3, height_m: 13.5, far: 2.1,
        });
    });

    it('resolves a narrow street (8 m) to the <12 m band', () => {
        const r = resolveZaragozaA13Height(8);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.height_m).toBe(10.5);
            expect(r.floorsAboveGround).toBe(2);
            expect(r.far).toBe(1.6);
        }
    });

    it('resolves a wide street (20 m) to the ≥12 m band', () => {
        const r = resolveZaragozaA13Height(20);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.height_m).toBe(13.5);
            expect(r.floorsAboveGround).toBe(3);
            expect(r.far).toBe(2.1);
        }
    });

    it('refuses at exactly the 12 m band edge from a MEASURED width (never guesses a storey)', () => {
        const r = resolveZaragozaA13Height(12);
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.reason).toBe('band-edge');
            expect(r.straddles).toEqual([10.5, 13.5]);
        }
    });

    it('an OFFICIAL width may sit exactly on the edge (guard skipped)', () => {
        const r = resolveZaragozaA13Height(12, { trustedOfficialWidth: true });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.height_m).toBe(13.5); // Art. 4.1.12: "≥ 12 m" is inclusive
    });

    it('refuses bad input rather than guessing', () => {
        const r1 = resolveZaragozaA13Height(0);
        const r2 = resolveZaragozaA13Height(Number.NaN);
        expect(r1.ok).toBe(false);
        expect(r2.ok).toBe(false);
        if (!r1.ok) expect(r1.reason).toBe('bad-input');
    });

    it('the travesía gap is a named, cited constant — not silently dropped', () => {
        expect(ZARAGOZA_A1_3_2_TRAVESIA_GAP).toMatch(/Travesía/);
        expect(ZARAGOZA_A1_3_2_TRAVESIA_GAP).toMatch(/16,50/);
        expect(ZARAGOZA_A1_3_2_TRAVESIA_GAP).toMatch(/2,60/);
    });
});

describe('Zaragoza — the corner-lot weighted edificabilidad (Art. 4.1.12)', () => {
    it('ep = (1.60·l1 + 2.10·l2)/(l1+l2) for equal-length frontages ⇒ the simple mean', () => {
        const ep = zaragozaA13WeightedEdificabilidad([
            { length_m: 10, far: 1.6 },
            { length_m: 10, far: 2.1 },
        ]);
        expect(ep).toBeCloseTo(1.85, 6);
    });

    it('weights toward the longer frontage', () => {
        const ep = zaragozaA13WeightedEdificabilidad([
            { length_m: 30, far: 1.6 },
            { length_m: 10, far: 2.1 },
        ]);
        // (1.6*30 + 2.1*10) / 40 = (48 + 21) / 40 = 1.725
        expect(ep).toBeCloseTo(1.725, 6);
    });

    it('returns null for no frontages or zero total length (never divides by zero)', () => {
        expect(zaragozaA13WeightedEdificabilidad([])).toBeNull();
        expect(zaragozaA13WeightedEdificabilidad([{ length_m: 0, far: 1.6 }])).toBeNull();
    });
});

describe('Zaragoza — THE VERIFICATION GATE (no number renders until sign-off)', () => {
    it('the gate is CLOSED — ZARAGOZA_ENVELOPE_VERIFIED is false', () => {
        expect(ZARAGOZA_ENVELOPE_VERIFIED).toBe(false);
    });

    it('registry disposition for every packed subgrado is a REFUSAL, never `pack`, while shut', () => {
        for (const code of ZARAGOZA_ZONE_CODES) {
            const d = resolveZoneDisposition(ZARAGOZA_JURISDICTION_ID, code);
            expect(d.kind, code).toBe('refusal');
            if (d.kind === 'refusal') {
                expect(d.refusal.code).toBe('no-rule-pack');
                // Never a legal statement — a statement about PRYZM's own verification status.
                expect(d.refusal.legallyGrounded).toBe(false);
                expect(d.refusal.ordinanceRef).toBeNull();
            }
        }
    });

    it('an unregistered subgrado is ALSO a cited refusal, never the estimated fallback', () => {
        const d = resolveZoneDisposition(ZARAGOZA_JURISDICTION_ID, 'A1');
        expect(d.kind).toBe('refusal');
    });

    it('the coverage-gap card carries no number and cites the subgrado articles', () => {
        const r = zaragozaNoRulePackRefusal('A1', null, ['Parcel area: 300 m²']);
        expect(r.code).toBe('no-rule-pack');
        expect(r.legallyGrounded).toBe(false);
        expect(r.ordinanceRef).toBeNull();
        expect(r.knownFacts).toContain('Parcel area: 300 m²');
        expect(`${r.headline} ${r.detail}`).toMatch(/4\.1\.12|4\.1\.13|4\.1\.15|4\.1\.17|subgrado/i);
    });

    it('surfaces on the coverage globe (registered, extent lit, no pack reachable while shut)', () => {
        const cov = listJurisdictionCoverage().find(
            (c) => c.jurisdictionId === ZARAGOZA_JURISDICTION_ID,
        );
        expect(cov).toBeDefined();
        // ⚠ THE REGRESSION GUARD — if this goes non-empty while the gate is false, an unsigned
        // subgrado pack has become reachable through the registry.
        expect(cov!.packZoneCodes).toHaveLength(0);
        expect(cov!.contains(41.65, -0.88)).toBe(true); // Zaragoza centre
    });
});

describe('Zaragoza — the bbox jurisdiction gate (a coarse proximity claim)', () => {
    it('accepts Zaragoza centre, rejects a Barcelona point and non-finite input', () => {
        expect(isInZaragoza(41.65, -0.88)).toBe(true);
        expect(isInZaragoza(41.4, 2.17)).toBe(false); // Barcelona
        expect(isInZaragoza(Number.NaN, -0.88)).toBe(false);
    });

    it('the box matches the término municipal extent recorded in aragonBbox.ts', () => {
        expect(ZARAGOZA_BBOX.minLat).toBeCloseTo(41.44, 2);
        expect(ZARAGOZA_BBOX.maxLat).toBeCloseTo(41.94, 2);
        expect(ZARAGOZA_BBOX.minLon).toBeCloseTo(-1.18, 2);
        expect(ZARAGOZA_BBOX.maxLon).toBeCloseTo(-0.66, 2);
    });
});

describe('Zaragoza — §ZGZ-MISSING-CONSTRAINTS (the open-top-indicative reason list)', () => {
    it('names real, verifiable families and never a manufactured coastal one', () => {
        expect(ZARAGOZA_MISSING_CONSTRAINTS.length).toBeGreaterThanOrEqual(4);
        const joined = ZARAGOZA_MISSING_CONSTRAINTS.join(' ').toLowerCase();
        for (const f of ['heritage', 'flood', 'airport', 'environmental']) {
            expect(joined, f).toContain(f);
        }
        expect(joined).not.toContain('coastal');
        expect(ZARAGOZA_MISSING_CONSTRAINTS).toContain(ZARAGOZA_A1_3_2_TRAVESIA_GAP);
    });

    it('is frozen — cannot be emptied after the fact', () => {
        expect(Object.isFrozen(ZARAGOZA_MISSING_CONSTRAINTS)).toBe(true);
    });
});

describe('Zaragoza — §ZGZ-A13-RESOLVED-PACK (per-parcel street-width pack)', () => {
    const resolvedNarrow = resolveZaragozaA13Height(8) as Extract<ZaragozaA13Resolution, { ok: true }>;
    const resolvedWide = resolveZaragozaA13Height(20) as Extract<ZaragozaA13Resolution, { ok: true }>;

    it('builds a valid one-zone contract for A1/3.1 from a resolved narrow-street band', () => {
        const pack = zaragozaA13ResolvedPack('A1/3.1', resolvedNarrow, 'TEST-AUTHORITY');
        expect(pack.zones).toHaveLength(1);
        const z = pack.zones[0]!;
        expect(z.code).toBe('A1/3.1');
        expect(z.maxHeight_m).toBe(10.5);
        expect(z.maxFloors).toBe(3); // 2 above ground + planta baja
        expect(z.plotRatioFAR).toBe(1.6);
        expect(z.maxCoverage).toBe(0.5);
        expect(z.geometricRule).toMatchObject({ kind: 'alignment', buildableDepth_m: 15 });
        expect(pack.defaultConfidence).toBe(ZARAGOZA_PACK_DEFAULT_CONFIDENCE);
        expect(z.ordinanceRef).toMatch(/TEST-AUTHORITY/);
    });

    it('builds a valid one-zone contract for A1/3.2 from a resolved wide-street band, carrying the travesía gap', () => {
        const pack = zaragozaA13ResolvedPack('A1/3.2', resolvedWide, 'TEST-AUTHORITY');
        const z = pack.zones[0]!;
        expect(z.code).toBe('A1/3.2');
        expect(z.maxHeight_m).toBe(13.5);
        expect(z.maxFloors).toBe(4);
        expect(z.plotRatioFAR).toBe(2.1);
        expect(z.ordinanceRef).toMatch(/Travesía/);
    });

    it('never higher than `estimated-ruleset`, matching the static pack ceiling', () => {
        const pack = zaragozaA13ResolvedPack('A1/3.1', resolvedNarrow, 'x');
        expect(pack.defaultConfidence).not.toBe('structured');
        expect(pack.defaultConfidence).not.toBe('authoritative');
    });
});
