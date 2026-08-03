// Córdoba PGOU-2001 pack — the COMPUTE path + the L-616 CTP-1/MC geometricRule GUARD.
//
// The ENVELOPE-REALISM-MATRIX flagged Córdoba as "REFUSES (latent BOTH)": CTP-1/MC had null setbacks
// and NO `geometricRule`, so the day `CORDOBA_ENVELOPE_VERIFIED` opens they would inset by 0 and draw
// the WHOLE PARCEL (mechanism A). These tests pin the guard end-to-end through the real engine:
//   • PAS/OA/UAD parcels → a real, LESS-THAN-parcel setback envelope (they always computed correctly).
//   • CTP-1 → an alignment DEPTH-BAND (16 m, Art. 13.8.2.4), never the whole parcel; no front → refuse.
//   • MC-* → a STRUCTURAL REFUSAL (explicit-area, unresolvable footprint) — NEVER a full-parcel box.
//
// The pack's zone.geometricRule is read by the engine itself (ZoningRulesEngine ~L140), so driving
// `computeBuildableEnvelope` with `rulePack: ES_CORDOBA_PGOU2001_PACK` exercises the shipped guard.

import { describe, it, expect } from 'vitest';
import type { Pt, ParcelEdgeClassification, ZoningRecord } from '@pryzm/schemas';
import { computeBuildableEnvelope } from '../src/index.js';
import {
    ES_CORDOBA_PGOU2001_PACK,
    CORDOBA_JURISDICTION_ID,
    CORDOBA_MC_FONDO_UNRESOLVED_RING,
} from '../src/rulepacks/esCordobaPGOU2001.js';

/** 30 m wide (x) × 40 m deep (z). Edge 0 (z=0 → the +x run) is the street frontage. */
const PARCEL: Pt[] = [
    { x: 0, z: 0 },
    { x: 30, z: 0 },
    { x: 30, z: 40 },
    { x: 0, z: 40 },
];
const PARCEL_AREA = 30 * 40; // 1200 m²

const WITH_FRONT: ParcelEdgeClassification[] = ['front', 'side', 'rear', 'side'];
const ALL_UNCLASSIFIED: ParcelEdgeClassification[] = [
    'unclassified', 'unclassified', 'unclassified', 'unclassified',
];

/** A Córdoba ZoningRecord for a packed subzone (no structured fields — the pack answers). */
function cordobaZoning(zoneCode: string): ZoningRecord {
    return {
        zoneCode,
        zoneLabel: zoneCode,
        jurisdictionId: CORDOBA_JURISDICTION_ID,
        structuredFields: {},
        overlays: [],
        ordinanceRef: null,
        provenance: {
            source: CORDOBA_JURISDICTION_ID,
            label: 'Córdoba PGOU-2001 (test)',
            version: '2026-07-26',
            license: null,
            crs: 'EPSG:4326',
        },
    };
}

function solve(zoneCode: string, edges: ParcelEdgeClassification[] = WITH_FRONT) {
    return computeBuildableEnvelope({
        parcelRing: PARCEL,
        edgeClassifications: edges,
        zoning: cordobaZoning(zoneCode),
        rulePack: ES_CORDOBA_PGOU2001_PACK,
    });
}

describe('Córdoba — PAS / OA / UAD compute a REAL setback envelope (less than the parcel)', () => {
    for (const code of ['PAS-1', 'PAS-2', 'PAS-3', 'OA-1', 'OA-2', 'UAD-1', 'UAD-2']) {
        it(`${code} yields status:ok with a positive footprint strictly inside the parcel`, () => {
            const env = solve(code);
            expect(env.status, code).toBe('ok');
            expect(env.insetAreaM2, code).toBeGreaterThan(0);
            // The whole point of a setback zone: never the full parcel.
            expect(env.insetAreaM2, code).toBeLessThan(PARCEL_AREA);
            expect(env.zoneCode, code).toBe(code);
        });
    }

    it('a setback zone (PAS-1) does NOT run the alignment depth machinery', () => {
        const env = solve('PAS-1');
        expect(env.caveats.some((c) => /profundidad edificable/i.test(c))).toBe(false);
    });
});

describe('Córdoba — CTP-1 is an ALIGNMENT zone: a 16 m depth band, never the full parcel', () => {
    it('clips to the ~16 m profundidad edificable band (Art. 13.8.2.4), well under the parcel', () => {
        const env = solve('CTP-1');
        expect(env.status).toBe('ok');
        // 30 m frontage × 16 m depth ≈ 480 m² — far below the 1200 m² parcel. A whole-parcel result
        // would mean the guard failed and the depth cap was silently dropped.
        expect(env.insetAreaM2).toBeGreaterThan(300);
        expect(env.insetAreaM2).toBeLessThan(600);
        expect(env.insetAreaM2).toBeLessThan(PARCEL_AREA);
    });

    it('records the profundidad edificable in the caveats (C58 §1.3 explain-why)', () => {
        const env = solve('CTP-1');
        expect(env.caveats.some((c) => /profundidad edificable/i.test(c))).toBe(true);
        expect(env.caveats.some((c) => /16/.test(c))).toBe(true);
    });

    it('emits an alignment.depth derivation row (the rule that shaped the envelope)', () => {
        const env = solve('CTP-1');
        expect(env.derivation.some((d) => d.constraint === 'alignment.depth' && d.value === 16)).toBe(true);
    });

    it('HARD-FAILS to degenerate with NO front edge — never a full-depth fallback (the guard)', () => {
        const env = solve('CTP-1', ALL_UNCLASSIFIED);
        expect(env.status).toBe('degenerate');
        expect(env.insetAreaM2).toBe(0);
        // Crucially: NOT the whole parcel.
        expect(env.insetAreaM2).not.toBeCloseTo(PARCEL_AREA, 0);
    });
});

describe('Córdoba — MC-* is a STRUCTURAL REFUSAL: never a full-parcel box (the guard)', () => {
    for (const code of ['MC-1', 'MC-2', 'MC-3', 'MC-4']) {
        it(`${code} refuses (degenerate, zero area) rather than draw the whole parcel`, () => {
            const env = solve(code);
            expect(env.status, code).toBe('degenerate');
            expect(env.insetAreaM2, code).toBe(0);
            // The failure ENVELOPE-REALISM-MATRIX named: MC must never become the parcel.
            expect(env.insetAreaM2, code).not.toBeCloseTo(PARCEL_AREA, 0);
        });
    }

    it('cites the unresolvable explicit-area footprint (no full-parcel fall-through)', () => {
        const env = solve('MC-1');
        expect(env.caveats.some((c) => /explicit-area|published buildable footprint/i.test(c))).toBe(true);
    });

    it('the guard ring handle is a stable, greppable constant', () => {
        expect(CORDOBA_MC_FONDO_UNRESOLVED_RING).toMatch(/UNRESOLVED/);
        for (const code of ['MC-1', 'MC-2', 'MC-3', 'MC-4']) {
            const zone = ES_CORDOBA_PGOU2001_PACK.zones.find((z) => z.code === code)!;
            expect(zone.geometricRule, code).toEqual({
                kind: 'explicit-area',
                ringRef: CORDOBA_MC_FONDO_UNRESOLVED_RING,
            });
        }
    });
});

describe('Córdoba — the pack still parses and CTP-1 carries the alignment rule', () => {
    it('CTP-1 geometricRule is a party-wall alignment with a 16 m buildable depth', () => {
        const ctp = ES_CORDOBA_PGOU2001_PACK.zones.find((z) => z.code === 'CTP-1')!;
        expect(ctp.geometricRule).toEqual({
            kind: 'alignment',
            alignTo: 'street',
            alignmentOffset_m: 0,
            sideTreatment: 'party-wall',
            buildableDepth_m: 16,
        });
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// §COR-UAD-DEPTH — D1: the STATED Art. 13.9.3.3 profundidad, which the pack used to omit.
// ══════════════════════════════════════════════════════════════════════════════════════════════
// UAD-1 16 m · UAD-2 18 m · UAD-3 16 m, measured FROM THE VIAL ALIGNMENT (verified 380 dpi;
// OCR-EXTRACTION-RESULTS §2.3, VERIFICATION.md §D1). Before this, all three were bounded by the
// setback inset alone. UAD-3 (front 0 + side 0 party-wall + rear 5, no depth band) drew 1050 of the
// 1200 m² parcel — the L-616 mechanism-A overstatement verbatim, on the 1,934 % of pilot land it
// really binds.
//
// ⚠ These tests assert the depth BITES, not merely that a field exists. A rule that is present but
// never clips would pass a shape assertion and still over-state every deep parcel.
const UAD_STATED_DEPTH: ReadonlyArray<readonly [string, number, number]> = [
    // [subzone, Art. 13.9.3.3 depth (m), front retranqueo (m) per Art. 13.9.3.2]
    ['UAD-1', 16, 4],
    ['UAD-2', 18, 5],
    ['UAD-3', 16, 0],
];

describe('Córdoba — UAD carries the stated profundidad edificable (D1, Art. 13.9.3.3)', () => {
    for (const [code, depth, offset] of UAD_STATED_DEPTH) {
        it(`${code} geometricRule is a party-wall alignment with the stated ${depth} m depth`, () => {
            const z = ES_CORDOBA_PGOU2001_PACK.zones.find((zz) => zz.code === code)!;
            expect(z.geometricRule, code).toEqual({
                kind: 'alignment',
                alignTo: 'street',
                alignmentOffset_m: offset,
                sideTreatment: 'party-wall',
                buildableDepth_m: depth,
            });
        });

        it(`${code} emits the alignment.depth derivation row carrying ${depth}`, () => {
            const env = solve(code);
            expect(
                env.derivation.some((d) => d.constraint === 'alignment.depth' && d.value === depth),
                code,
            ).toBe(true);
        });

        it(`${code} CLIPS to the band — the footprint is the frontage × the depth, not the plot`, () => {
            const env = solve(code);
            expect(env.status, code).toBe('ok');
            // The band runs from the ALIGNMENT (parcel edge 0, z = 0) to `depth`; the front
            // retranqueo eats the first `offset` m. 30 m of frontage × (depth − offset) of depth.
            const expected = 30 * (depth - offset);
            expect(env.insetAreaM2, code).toBeCloseTo(expected, 0);
            expect(env.insetAreaM2, code).toBeLessThan(PARCEL_AREA);
        });
    }

    it('⭐ UAD-3 no longer draws essentially the whole parcel (the L-616 regression guard)', () => {
        const env = solve('UAD-3');
        // Setback-only would be 30 × (40 − 0 − 5) = 1050 m², i.e. 87.5 % of the plot.
        const setbackOnly = 30 * 35;
        expect(env.insetAreaM2).toBeLessThan(setbackOnly * 0.6);
        expect(env.insetAreaM2).toBeCloseTo(30 * 16, 0);
    });

    it('a UAD parcel with NO front edge HARD-FAILS rather than fall back to full depth', () => {
        // Same guard CTP-1 has: with no alineación located, the depth cannot be applied, and
        // silently skipping the clip would return the setback-only ring as if it were solved.
        for (const [code] of UAD_STATED_DEPTH) {
            const env = solve(code, ALL_UNCLASSIFIED);
            expect(env.status, code).toBe('degenerate');
            expect(env.insetAreaM2, code).toBe(0);
        }
    });

    it('the depth is cited in the ordinanceRef so a reader can check it (C58 §1.3)', () => {
        for (const [code, depth] of UAD_STATED_DEPTH) {
            const z = ES_CORDOBA_PGOU2001_PACK.zones.find((zz) => zz.code === code)!;
            expect(z.ordinanceRef, code).toContain('13.9.3.3');
            expect(z.ordinanceRef, code).toContain(String(depth));
        }
    });
});
