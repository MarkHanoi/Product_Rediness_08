// Málaga PGOU-2011 pack (Documento C, Normas urbanísticas y ordenanzas, Título XII, Feb-2018) —
// the COMPUTE path for the nine real-footprint zones + the L-616 structural-refusal guard for the
// other twenty-nine.
//
// Málaga is the INVERSE of Sevilla's opening position: the ordinance is fully transcribed and
// article-cited, but no zone-identity resolver exists or can exist today (the municipal
// calificación layer `muralPGOU:POLCALIF_T` is behind an authority-side Oracle account lock —
// see `esMalaga.ts`'s module header for the four independent leads closed on 2026-08-05). These
// tests therefore pin the PACK, not a dispatch path — there is no dispatch path to pin.
//
// What is pinned:
//   • UAS-1…UAS-5 / UAD-1…UAD-2 / CTP-1…CTP-2 COMPUTE a real, bounded footprint — never the whole
//     parcel, never zero — with the exact article-cited numbers.
//   • Every other zone REFUSES (`status: 'degenerate'`) rather than fabricate a footprint, even
//     where real cited scalars (FAR, coverage, height) ARE packed.
//   • The MC / CTP / CH / UAD family invariants that would be silent L-616 mechanism-A failures if
//     an edit ever dropped a depth band or a ring.
//   • The zone-code universe is pinned as a sorted list, so a zone cannot be added or removed
//     without this test failing loudly.
//   • `MALAGA_ENVELOPE_VERIFIED` is `false` (L-449 — founder-only flip).

import { describe, it, expect } from 'vitest';
import type { Pt, ParcelEdgeClassification, ZoningRecord } from '@pryzm/schemas';
import { computeBuildableEnvelope } from '../src/index.js';
import {
    ES_MALAGA_PGOU_PACK,
    MALAGA_JURISDICTION_ID,
    MALAGA_ENVELOPE_VERIFIED,
    MALAGA_PGOU_ZONE_CODES,
    MALAGA_REAL_FOOTPRINT_ZONE_CODES,
    MALAGA_MC_FONDO_UNRESOLVED_RING,
    MALAGA_OA_SEPARACION_UNRESOLVED_RING,
    MALAGA_CJ_LINDEROS_UNRESOLVED_RING,
    MALAGA_CH_PEPRI_UNRESOLVED_RING,
    MALAGA_EP_CATALOGO_UNRESOLVED_RING,
    MALAGA_PROD_SEPARACION_UNRESOLVED_RING,
    MALAGA_TERCIARIO_CLASE_SUELO_UNRESOLVED_RING,
    MALAGA_HOTEL_SIN_TIPIFICACION_RING,
    MALAGA_EQUIP_ENTORNO_UNRESOLVED_RING,
    malagaResearchPendingRefusal,
} from '../src/rulepacks/esMalaga.js';

/** 30 m wide (x) × 40 m deep (z). Edge 0 (z=0 → the +x run) is the street frontage. */
const PARCEL: Pt[] = [
    { x: 0, z: 0 },
    { x: 30, z: 0 },
    { x: 30, z: 40 },
    { x: 0, z: 40 },
];
const PARCEL_AREA = 30 * 40; // 1200 m²

const WITH_FRONT: ParcelEdgeClassification[] = ['front', 'side', 'rear', 'side'];

function malagaZoning(zoneCode: string): ZoningRecord {
    return {
        zoneCode,
        zoneLabel: zoneCode,
        jurisdictionId: MALAGA_JURISDICTION_ID,
        structuredFields: {},
        overlays: [],
        ordinanceRef: null,
        provenance: {
            source: MALAGA_JURISDICTION_ID,
            label: 'Málaga PGOU-2011 Documento C Feb-2018 (test)',
            version: '2026-08-05',
            license: null,
            crs: 'EPSG:25830',
        },
    };
}

function solve(zoneCode: string, edges: ParcelEdgeClassification[] = WITH_FRONT) {
    return computeBuildableEnvelope({
        parcelRing: PARCEL,
        edgeClassifications: edges,
        zoning: malagaZoning(zoneCode),
        rulePack: ES_MALAGA_PGOU_PACK,
    });
}

const zone = (code: string) => ES_MALAGA_PGOU_PACK.zones.find((z) => z.code === code)!;

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE GATE — must stay shut (L-449).
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('Málaga — the publication gate is closed and stays closed', () => {
    it('MALAGA_ENVELOPE_VERIFIED is false (founder-only flip, L-449)', () => {
        expect(MALAGA_ENVELOPE_VERIFIED).toBe(false);
    });

    it('the research-pending refusal is legally ungrounded and names the real blocker', () => {
        const r = malagaResearchPendingRefusal();
        expect(r.code).toBe('no-rule-pack');
        // A refusal must never claim the LAW forbids building — only that PRYZM cannot yet say.
        expect(r.legallyGrounded).toBe(false);
        expect(r.ordinanceRef).toBeNull();
        // It must name zone IDENTITY, not ordinance text, as the blocker — the ordinance IS done.
        expect(r.detail).toMatch(/POLCALIF_T/);
        expect(r.detail).toMatch(/Zone identity, not ordinance text, is the blocker/);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE ZONE UNIVERSE — pinned, and derived rather than hand-typed.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('Málaga — the zone-code universe from Documento C Art. 12.1.1 + chapter subzone articles', () => {
    it('pins all 38 declared zone codes, sorted', () => {
        expect(MALAGA_PGOU_ZONE_CODES).toEqual([
            'C-1', 'C-2', 'C-3', 'C-4',
            'CJ-1', 'CJ-1A', 'CJ-2', 'CJ-2A', 'CJ-3', 'CJ-4',
            'CO',
            'CTP-1', 'CTP-2',
            'D', 'E', 'EP', 'GSM', 'H', 'MC',
            'OA-1', 'OA-2',
            'PROD-1A', 'PROD-1B', 'PROD-2', 'PROD-3A', 'PROD-3B', 'PROD-4', 'PROD-4B', 'PROD-5',
            'S', 'SC',
            'UAD-1', 'UAD-2',
            'UAS-1', 'UAS-2', 'UAS-3', 'UAS-4', 'UAS-5',
        ]);
        expect(MALAGA_PGOU_ZONE_CODES).toHaveLength(38);
    });

    it('the code list is DERIVED from the pack, never re-typed', () => {
        expect(MALAGA_PGOU_ZONE_CODES).toEqual(
            ES_MALAGA_PGOU_PACK.zones.map((z) => z.code.toUpperCase()).sort(),
        );
    });

    it('pins exactly nine real-footprint zones; the other 29 are structural refusals', () => {
        expect(MALAGA_REAL_FOOTPRINT_ZONE_CODES).toEqual([
            'CTP-1', 'CTP-2',
            'UAD-1', 'UAD-2',
            'UAS-1', 'UAS-2', 'UAS-3', 'UAS-4', 'UAS-5',
        ]);
        expect(MALAGA_PGOU_ZONE_CODES.length - MALAGA_REAL_FOOTPRINT_ZONE_CODES.length).toBe(29);
    });

    it('every zone carries a real article citation — no zone is packed uncited', () => {
        for (const z of ES_MALAGA_PGOU_PACK.zones) {
            expect(z.ordinanceRef, `${z.code} must cite an article`).toBeTruthy();
            expect(z.ordinanceRef!, `${z.code} must cite a Título XII article number`).toMatch(
                /(?:Art\.|Cap(?:ítulo|\.)) ?(?:12\.\d+|[IVX]+)/,
            );
        }
    });

    it('every zone cites the Feb-2018 Documento C consolidation, not the 2011 originals', () => {
        for (const z of ES_MALAGA_PGOU_PACK.zones) {
            expect(z.ordinanceRef!, `${z.code}`).toContain('FEBRERO 2018');
            expect(z.ordinanceRef!, `${z.code}`).toContain('12-TITULO-XII.pdf');
        }
    });

    it('declares the confirmed native CRS of the municipal planning layers', () => {
        expect(ES_MALAGA_PGOU_PACK.crs).toBe('EPSG:25830');
        expect(ES_MALAGA_PGOU_PACK.source).toBe('manual');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// UAS — five real footprints (Cap. VIII, Arts. 12.8.1–12.8.5).
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** [code, FAR, coverage, setback (front=side=rear, Art. 12.8.4.1 + 12.8.4.2)] */
const UAS_ROWS: ReadonlyArray<readonly [string, number, number, number]> = [
    ['UAS-1', 0.6, 0.5, 2],
    ['UAS-2', 0.37, 0.4, 3],
    ['UAS-3', 0.3, 0.3, 3],
    ['UAS-4', 0.25, 0.25, 4],
    ['UAS-5', 0.2, 0.2, 6],
];

describe.each(UAS_ROWS)(
    'Málaga %s — real footprint (Cap. VIII, Arts. 12.8.1–12.8.5)',
    (code, far, coverage, setback) => {
        it('carries the article-cited FAR, coverage and uniform setback', () => {
            const z = zone(code);
            expect(z.plotRatioFAR).toBe(far);
            expect(z.maxCoverage).toBe(coverage);
            // Art. 12.8.4.2 — "los demás linderos… en los mismos términos que el apartado
            // anterior": side and rear take the front's figure. This equality IS the ordinance.
            expect(z.setbacks).toEqual({ front_m: setback, side_m: setback, rear_m: setback });
        });

        it('carries the zone-wide PB+1 / 7 m height (Art. 12.8.4.3)', () => {
            const z = zone(code);
            expect(z.maxHeight_m).toBe(7);
            expect(z.maxFloors).toBe(2);
        });

        it('computes a real, bounded footprint — never the whole parcel, never zero', () => {
            const env = solve(code);
            expect(env.status).not.toBe('degenerate');
            expect(env.insetAreaM2).toBeGreaterThan(0);
            expect(env.insetAreaM2).toBeLessThan(PARCEL_AREA);
        });

        it('the inset area matches the uniform setback exactly (a real solve, not a stub)', () => {
            const env = solve(code);
            const expected = (30 - 2 * setback) * (40 - 2 * setback);
            expect(env.insetAreaM2).toBeCloseTo(expected, 3);
        });

        it('uses the legacy per-edge inset path — UAS states no profundidad edificable', () => {
            expect(zone(code).geometricRule?.kind).not.toBe('alignment');
            expect(zone(code).geometricRule?.kind).not.toBe('explicit-area');
        });

        it('does NOT pack the non-binding ARCO SOLAR variants', () => {
            const z = zone(code);
            // Título VIII solar-access figures are "recomendación en Suelo Urbano" — packing 6 m
            // or 12 m as a setback would assert a force the ordinance's own footnote denies.
            expect(z.ordinanceRef).toMatch(/ARCO SOLAR/);
            expect(z.ordinanceRef).toMatch(/recomendación en suelo urbano/i);
        });
    },
);

// ══════════════════════════════════════════════════════════════════════════════════════════════
// UAD — two real footprints WITH an alignment depth band (Cap. IX, Arts. 12.9.1–12.9.6).
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** [code, FAR, coverage, front, rear, buildableDepth] */
const UAD_ROWS: ReadonlyArray<readonly [string, number, number, number, number, number]> = [
    ['UAD-1', 1.16, 0.6, 3, 3, 15],
    ['UAD-2', 0.52, 0.45, 4, 5, 20],
];

describe.each(UAD_ROWS)(
    'Málaga %s — real footprint with an alignment depth band (Cap. IX)',
    (code, far, coverage, front, rear, depth) => {
        it('carries the article-cited FAR, coverage, front retranqueo and rear separation', () => {
            const z = zone(code);
            expect(z.plotRatioFAR).toBe(far);
            expect(z.maxCoverage).toBe(coverage);
            // side 0 — ordenación ADOSADA (Art. 12.9.1), whose consequence Art. 12.9.4.8 regulates.
            expect(z.setbacks).toEqual({ front_m: front, side_m: 0, rear_m: rear });
        });

        it('carries the zone-wide PB+1 / 7 m height (Art. 12.9.4.5)', () => {
            expect(zone(code).maxHeight_m).toBe(7);
            expect(zone(code).maxFloors).toBe(2);
        });

        it('carries the Art. 12.9.4.3 profundidad máxima edificable as an ALIGNMENT rule', () => {
            // ⚠ A depth measured from the STREET is not interchangeable with a rear setback
            // measured from the REAR boundary. If an edit ever downgrades this to a plain setback
            // triple, the footprint silently changes on every parcel whose depth ≠ depth + rear_m.
            expect(zone(code).geometricRule).toEqual({
                kind: 'alignment',
                alignTo: 'street',
                alignmentOffset_m: front,
                sideTreatment: 'party-wall',
                buildableDepth_m: depth,
            });
        });

        it('computes a real, bounded footprint — never the whole parcel, never zero', () => {
            const env = solve(code);
            expect(env.status).not.toBe('degenerate');
            expect(env.insetAreaM2).toBeGreaterThan(0);
            expect(env.insetAreaM2).toBeLessThan(PARCEL_AREA);
        });

        it('the depth band actually BINDS on a 40 m-deep parcel (it is not decorative)', () => {
            // Parcel depth 40 m; the band is 15/20 m from the alignment. Whatever the engine's
            // exact composition order, the result must be shallower than a rear-setback-only
            // solve would give (40 − front − rear), or the band did nothing.
            const env = solve(code);
            const rearOnlyDepth = 40 - front - rear;
            const rearOnlyArea = 30 * rearOnlyDepth;
            expect(env.insetAreaM2).toBeLessThan(rearOnlyArea);
        });

        it('does NOT pack the non-binding ARCO SOLAR lateral variants', () => {
            expect(zone(code).ordinanceRef).toMatch(/ARCO SOLAR/);
        });
    },
);

// ══════════════════════════════════════════════════════════════════════════════════════════════
// CTP — two real footprints, alignment-mandatory + medianera + flat 15 m depth (Cap. X).
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** [code, FAR, maxHeight, maxFloors] */
const CTP_ROWS: ReadonlyArray<readonly [string, number, number, number]> = [
    ['CTP-1', 1.8, 7.5, 2],
    ['CTP-2', 2.6, 11, 3],
];

describe.each(CTP_ROWS)('Málaga %s — real footprint (Cap. X, Arts. 12.10.1–12.10.6)', (code, far, h, floors) => {
    it('carries the article-cited FAR, coverage and height', () => {
        const z = zone(code);
        expect(z.plotRatioFAR).toBe(far);
        // Art. 12.10.3.5 — plantas altas 80 % is the packed (under-stating) figure; PB 100 % cited.
        expect(z.maxCoverage).toBe(0.8);
        expect(z.maxHeight_m).toBe(h);
        expect(z.maxFloors).toBe(floors);
    });

    it('front=0 (alineación obligatoria) and side=0 (medianera), rear unknown', () => {
        expect(zone(code).setbacks).toEqual({ front_m: 0, side_m: 0, rear_m: null });
    });

    it('⚠ L-616: front 0 + side 0 + rear null is ONLY safe because the 15 m depth band exists', () => {
        // Without this alignment rule, a 0/0/null triple insets by 0 on every edge and draws the
        // WHOLE parcel (ENVELOPE-REALISM-MATRIX mechanism A). The band is the entire guard here.
        expect(zone(code).geometricRule).toEqual({
            kind: 'alignment',
            alignTo: 'street',
            alignmentOffset_m: 0,
            sideTreatment: 'party-wall',
            buildableDepth_m: 15,
        });
    });

    it('computes a bounded footprint and NEVER the whole parcel', () => {
        const env = solve(code);
        expect(env.status).not.toBe('degenerate');
        expect(env.insetAreaM2).toBeGreaterThan(0);
        expect(env.insetAreaM2).toBeLessThan(PARCEL_AREA);
        expect(env.insetAreaM2).not.toBeCloseTo(PARCEL_AREA, 0);
    });

    it('the footprint is the 15 m depth band across the full 30 m frontage', () => {
        const env = solve(code);
        expect(env.insetAreaM2).toBeCloseTo(30 * 15, 3);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// STRUCTURAL REFUSALS — 29 zones, 9 mechanisms.
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** [zoneCode, expected ring handle] */
const REFUSED_ROWS: ReadonlyArray<readonly [string, string]> = [
    ['EP', MALAGA_EP_CATALOGO_UNRESOLVED_RING],
    ['C-1', MALAGA_CH_PEPRI_UNRESOLVED_RING],
    ['C-2', MALAGA_CH_PEPRI_UNRESOLVED_RING],
    ['C-3', MALAGA_CH_PEPRI_UNRESOLVED_RING],
    ['C-4', MALAGA_CH_PEPRI_UNRESOLVED_RING],
    ['MC', MALAGA_MC_FONDO_UNRESOLVED_RING],
    ['OA-1', MALAGA_OA_SEPARACION_UNRESOLVED_RING],
    ['OA-2', MALAGA_OA_SEPARACION_UNRESOLVED_RING],
    ['CJ-1', MALAGA_CJ_LINDEROS_UNRESOLVED_RING],
    ['CJ-1A', MALAGA_CJ_LINDEROS_UNRESOLVED_RING],
    ['CJ-2', MALAGA_CJ_LINDEROS_UNRESOLVED_RING],
    ['CJ-2A', MALAGA_CJ_LINDEROS_UNRESOLVED_RING],
    ['CJ-3', MALAGA_CJ_LINDEROS_UNRESOLVED_RING],
    ['CJ-4', MALAGA_CJ_LINDEROS_UNRESOLVED_RING],
    ['PROD-1A', MALAGA_PROD_SEPARACION_UNRESOLVED_RING],
    ['PROD-1B', MALAGA_PROD_SEPARACION_UNRESOLVED_RING],
    ['PROD-2', MALAGA_PROD_SEPARACION_UNRESOLVED_RING],
    ['PROD-3A', MALAGA_PROD_SEPARACION_UNRESOLVED_RING],
    ['PROD-3B', MALAGA_PROD_SEPARACION_UNRESOLVED_RING],
    ['PROD-4', MALAGA_PROD_SEPARACION_UNRESOLVED_RING],
    ['PROD-4B', MALAGA_PROD_SEPARACION_UNRESOLVED_RING],
    ['PROD-5', MALAGA_PROD_SEPARACION_UNRESOLVED_RING],
    ['CO', MALAGA_TERCIARIO_CLASE_SUELO_UNRESOLVED_RING],
    ['H', MALAGA_HOTEL_SIN_TIPIFICACION_RING],
    ['E', MALAGA_EQUIP_ENTORNO_UNRESOLVED_RING],
    ['S', MALAGA_EQUIP_ENTORNO_UNRESOLVED_RING],
    ['D', MALAGA_EQUIP_ENTORNO_UNRESOLVED_RING],
    ['SC', MALAGA_EQUIP_ENTORNO_UNRESOLVED_RING],
    ['GSM', MALAGA_TERCIARIO_CLASE_SUELO_UNRESOLVED_RING],
];

it('the refusal table covers every non-real-footprint zone exactly once', () => {
    expect(REFUSED_ROWS.map(([c]) => c).sort()).toEqual(
        MALAGA_PGOU_ZONE_CODES.filter((c) => !MALAGA_REAL_FOOTPRINT_ZONE_CODES.includes(c)).slice().sort(),
    );
    expect(REFUSED_ROWS).toHaveLength(29);
});

describe.each(REFUSED_ROWS)('Málaga %s — cited STRUCTURAL REFUSAL, never a fabricated footprint', (code, ring) => {
    it('carries the explicit-area handle naming its specific unresolved mechanism', () => {
        expect(zone(code).geometricRule).toEqual({ kind: 'explicit-area', ringRef: ring });
        expect(ring).toMatch(/UNRESOLVED/);
        expect(ring).toMatch(/^malaga-/);
    });

    it('yields ZERO buildable area — never the whole parcel, never a fabricated footprint', () => {
        const env = solve(code);
        expect(env.insetAreaM2).toBe(0);
        expect(env.insetAreaM2).not.toBeCloseTo(PARCEL_AREA, 0);
    });

    it('refuses regardless of edge classification — a missing front edge is not the cause', () => {
        const env = solve(code, ['unclassified', 'unclassified', 'unclassified', 'unclassified']);
        expect(env.insetAreaM2).toBe(0);
    });
});

// ⚠ EP IS THE ONE REFUSAL THAT TAKES A DIFFERENT ENGINE PATH, and the difference is worth pinning
// rather than smoothing over. `ZoningRulesEngine`'s `anyResolved` gate (src/ZoningRulesEngine.ts
// ~L210) only proceeds past `status:'none'` if at least one numeric field resolved OR a
// `permittedUse` was declared. EP declares NEITHER — deliberately: Capítulo Tercero is a
// per-building protection regime, so this pack asserts no zone-wide number AND no zone-wide use
// (inventing a use for a protected building would be exactly the kind of guess the pack forbids).
// The result is `status:'none'` — no envelope produced AT ALL, which is a STRONGER refusal than
// `degenerate`, not a weaker one.
//
// THE HONEST COST, STATED: because the engine short-circuits before the footprint stage, EP's
// `explicit-area` caveat is never emitted, so a consumer sees "no envelope" without the cited
// REASON that the other 28 refusals carry. The ring is still declared on the zone (asserted above)
// and is greppable, but it does not reach the user's card. That is a real, if small, gap in the
// refusal-quality chain — recorded here so it is a known trade-off rather than a silent surprise.
describe('Málaga EP — the no-parameters-at-all refusal (status "none", not "degenerate")', () => {
    it('produces no envelope at all, because the pack declares nothing for it', () => {
        const env = solve('EP');
        expect(env.status).toBe('none');
        expect(env.insetAreaM2).toBe(0);
    });

    it('declares neither a numeric parameter nor a permitted use — the reason for the "none" path', () => {
        const z = zone('EP');
        expect(z.permittedUse).toEqual([]);
        expect(z.maxHeight_m).toBeNull();
        expect(z.maxFloors).toBeNull();
        expect(z.plotRatioFAR).toBeNull();
        expect(z.maxCoverage).toBeNull();
        expect(z.setbacks).toEqual({ front_m: null, side_m: null, rear_m: null });
    });

    it('still carries its ring, and cites the Catálogo as the governing instrument', () => {
        expect(zone('EP').geometricRule).toEqual({
            kind: 'explicit-area',
            ringRef: MALAGA_EP_CATALOGO_UNRESOLVED_RING,
        });
        expect(zone('EP').ordinanceRef).toMatch(/Catálogo/);
    });
});

describe('Málaga — the other 28 refusals DO reach the footprint stage and cite their refusal', () => {
    const CITED = REFUSED_ROWS.filter(([c]) => c !== 'EP');

    it('covers 28 zones', () => {
        expect(CITED).toHaveLength(28);
    });

    it.each(CITED)('%s refuses as degenerate and surfaces the explicit-area caveat', (code) => {
        const env = solve(code);
        expect(env.status).toBe('degenerate');
        expect(env.caveats.some((c) => /explicit-area|published buildable footprint/i.test(c))).toBe(true);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// PER-MECHANISM INVARIANTS — the specific things that would be wrong if an edit went bad.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('Málaga MC — the free-depth guard (Art. 12.5.2.4)', () => {
    it('packs the real front/side (alineación + medianera) but NEVER a rear figure', () => {
        expect(zone('MC').setbacks).toEqual({ front_m: 0, side_m: 0, rear_m: null });
    });

    it('packs the 75 % upper-floor occupation but not the per-plantas FAR table (L-526)', () => {
        expect(zone('MC').maxCoverage).toBe(0.75);
        expect(zone('MC').plotRatioFAR).toBeNull();
        expect(zone('MC').ordinanceRef).toContain('12.5.2.2');
    });

    it('does NOT fabricate a height from the per-street-width table (Art. 12.5.3.1)', () => {
        expect(zone('MC').maxHeight_m).toBeNull();
        expect(zone('MC').maxFloors).toBeNull();
        expect(zone('MC').ordinanceRef).toMatch(/ancho de vial/);
    });

    it('the ring names the free-depth + occupation-only mechanism', () => {
        expect(MALAGA_MC_FONDO_UNRESOLVED_RING).toMatch(/12\.5\.2\.4/);
        expect(MALAGA_MC_FONDO_UNRESOLVED_RING).toMatch(/free-depth/);
    });
});

describe('Málaga OA — the road-AXIS guard (Art. 12.6.3.4.1)', () => {
    it('OA-1 packs the real FAR 2,20 and 65 % occupation but no setback at all', () => {
        expect(zone('OA-1').plotRatioFAR).toBe(2.2);
        expect(zone('OA-1').maxCoverage).toBe(0.65);
        expect(zone('OA-1').setbacks).toEqual({ front_m: null, side_m: null, rear_m: null });
    });

    it('never converts the axis-referenced table into a boundary inset (§MURCIA-PGOU-EJES)', () => {
        expect(zone('OA-1').ordinanceRef).toMatch(/EJE DEL VIAL/);
        expect(MALAGA_OA_SEPARACION_UNRESOLVED_RING).toMatch(/axis-referenced/);
    });

    it('OA-2 packs NO FAR (Art. 12.6.4.2 states none) and NO coverage (different denominator)', () => {
        expect(zone('OA-2').plotRatioFAR).toBeNull();
        // ⚠ 90 % applies to the GRAPHIC alignment footprint, not the parcel — packing it into a
        // parcel-relative slot would be a denominator substitution (C63).
        expect(zone('OA-2').maxCoverage).toBeNull();
        expect(zone('OA-2').ordinanceRef).toMatch(/HUELLA/);
    });
});

describe('Málaga CJ — front IS resolvable per subzone, side/rear are not (Arts. 12.7.3.3–12.7.3.5)', () => {
    /** [code, front (12.7.3.4 keyed on the 12.7.3.3 altura), height, floors, FAR, coverage] */
    const CJ_ROWS: ReadonlyArray<readonly [string, number, number, number, number, number]> = [
        ['CJ-1', 3, 10.5, 3, 0.66, 0.45],
        ['CJ-1A', 3, 7.5, 2, 0.66, 0.45],
        ['CJ-2', 4, 13.6, 4, 0.83, 0.45],
        ['CJ-2A', 3, 10.5, 3, 0.83, 0.45],
        ['CJ-3', 4, 13.6, 4, 1.16, 0.5],
        ['CJ-4', 5, 16.7, 5, 1.5, 0.5],
    ];

    it.each(CJ_ROWS)('%s composes the two stated tables into one flat front figure', (code, front, h, floors, far, cov) => {
        const z = zone(code);
        expect(z.setbacks.front_m).toBe(front);
        // side/rear are h/2 "en cada punto" — a sloping envelope, never a flat inset.
        expect(z.setbacks.side_m).toBeNull();
        expect(z.setbacks.rear_m).toBeNull();
        expect(z.maxHeight_m).toBe(h);
        expect(z.maxFloors).toBe(floors);
        expect(z.plotRatioFAR).toBe(far);
        expect(z.maxCoverage).toBe(cov);
    });

    it('the ring names the height-half separation mechanism', () => {
        expect(MALAGA_CJ_LINDEROS_UNRESOLVED_RING).toMatch(/12\.7\.3\.5/);
        expect(MALAGA_CJ_LINDEROS_UNRESOLVED_RING).toMatch(/height-half/);
    });
});

describe('Málaga CH / C-1…C-4 — delegated to PEPRI/PERI instruments (Art. 12.4.1)', () => {
    it.each(['C-1', 'C-2', 'C-3', 'C-4'])('%s packs no numeric parameter at all', (code) => {
        const z = zone(code);
        expect(z.maxHeight_m).toBeNull();
        expect(z.maxFloors).toBeNull();
        expect(z.plotRatioFAR).toBeNull();
        expect(z.maxCoverage).toBeNull();
        expect(z.setbacks).toEqual({ front_m: null, side_m: null, rear_m: null });
        expect(z.ordinanceRef).toMatch(/PEPRI|PERI/);
    });

    it('C-1 records that the PGOU expressly leaves per-street heights inside the PEPRI', () => {
        expect(zone('C-1').ordinanceRef).toMatch(/EXCEPTO LISTADOS DE ALTURAS POR CALLES/);
    });
});

describe('Málaga H — the ordinance ITSELF declines to state parameters (Art. 12.13.2)', () => {
    it('is a refusal grounded in the plan\'s own words, not in a PRYZM gap', () => {
        expect(zone('H').ordinanceRef).toMatch(/NO ES POSIBLE UNA TIPIFICACIÓN/);
        expect(MALAGA_HOTEL_SIN_TIPIFICACION_RING).toMatch(/declines-typification/);
    });
});

describe('Málaga Equipamiento — a stated MINIMUM is never packed into a MAXIMUM slot', () => {
    it.each(['E', 'S', 'D', 'SC'])('%s leaves plotRatioFAR null despite the article stating a figure', (code) => {
        // Art. 12.14.2.2's 0,50 / 1 m²t/m²s "prevalecerán COMO MÍNIMOS". Packing a floor into
        // `plotRatioFAR` (a ceiling) would invert the constraint's direction.
        expect(zone(code).plotRatioFAR).toBeNull();
        expect(zone(code).ordinanceRef).toMatch(/COMO MÍNIMOS?|COMO MÍNIMO/);
    });

    it('the ring names both the surrounding-zone and the minima-not-maxima mechanisms', () => {
        expect(MALAGA_EQUIP_ENTORNO_UNRESOLVED_RING).toMatch(/surrounding-zone/);
        expect(MALAGA_EQUIP_ENTORNO_UNRESOLVED_RING).toMatch(/minima-not-maxima/);
    });
});

describe('Málaga CO / GSM — land-class-branched, so neither branch is packed', () => {
    it.each(['CO', 'GSM'])('%s cites BOTH regimes and packs neither', (code) => {
        const z = zone(code);
        expect(z.plotRatioFAR).toBeNull();
        expect(z.maxCoverage).toBeNull();
        expect(z.maxHeight_m).toBeNull();
        expect(z.setbacks).toEqual({ front_m: null, side_m: null, rear_m: null });
        expect(z.ordinanceRef).toMatch(/SUELO URBANO CONSOLIDADO/);
        expect(z.ordinanceRef).toMatch(/SUELO\s+URBANIZABLE/);
        expect(z.ordinanceRef).toMatch(/NINGUNA PACKED/);
    });
});

describe('Málaga PROD — every subzone is conditional in its own way', () => {
    it('PROD-1A packs its real flat scalars but no setback (the 12 m is parking-standard-subordinated)', () => {
        const z = zone('PROD-1A');
        expect(z.plotRatioFAR).toBe(0.85);
        expect(z.maxCoverage).toBe(0.7);
        expect(z.maxHeight_m).toBe(9);
        expect(z.setbacks).toEqual({ front_m: null, side_m: null, rear_m: null });
        expect(z.ordinanceRef).toMatch(/12\.2\.41/);
    });

    it('PROD-2 records the road-class branch rather than picking one side of it', () => {
        expect(zone('PROD-2').ordinanceRef).toMatch(/viario local/);
        expect(zone('PROD-2').ordinanceRef).toMatch(/sistema general o viario estructurante/);
        expect(zone('PROD-2').setbacks.front_m).toBeNull();
    });

    it('PROD-4 packs NO scalar — it is a container for three IND types with different numbers', () => {
        const z = zone('PROD-4');
        expect(z.plotRatioFAR).toBeNull();
        expect(z.maxCoverage).toBeNull();
        expect(z.maxHeight_m).toBeNull();
        expect(z.ordinanceRef).toMatch(/IND-1/);
        expect(z.ordinanceRef).toMatch(/IND-2/);
        expect(z.ordinanceRef).toMatch(/IND-3/);
    });

    it('PROD-5 records that its footprint is a BORROWED ordinance (MC / OA / CJ)', () => {
        expect(zone('PROD-5').ordinanceRef).toMatch(/OTRAS ORDENANZAS DE ZONA/);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// GLOBAL INVARIANT — no zone may ever draw the whole parcel.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('Málaga — L-616 totality: NO zone in the pack draws the whole parcel', () => {
    it.each(MALAGA_PGOU_ZONE_CODES.map((c) => [c]))('%s never yields the full parcel area', (code) => {
        const env = solve(code);
        expect(env.insetAreaM2).toBeLessThan(PARCEL_AREA);
    });

    it('an unknown zone code refuses too — the pack never guesses', () => {
        const env = solve('NOT-A-REAL-MALAGA-ZONE');
        expect(env.insetAreaM2).toBeLessThan(PARCEL_AREA);
    });
});
