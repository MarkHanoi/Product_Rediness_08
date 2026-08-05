// Sevilla PGOU-2006 pack — the SB (Suburbana) COMPUTE path + the L-616 structural-refusal guard.
//
// SB (Capítulo V, Arts. 12.5.1-12.5.13) is transcribed from its own ordinance PDF (esSevilla.ts),
// but its buildable depth is governed by two CONDITIONAL rules (Art. 12.5.4 occupation %, Art.
// 12.5.6 rear separation) rather than a flat "profundidad máxima edificable" metres figure — so,
// on Córdoba MC's exact precedent, it ships `explicit-area` with an UNRESOLVABLE footprint handle.
// These tests pin that SB:
//   • NEVER draws the whole parcel (front 0 + side 0 party-wall + rear null would do exactly that
//     with no geometricRule — the ENVELOPE-REALISM-MATRIX mechanism-A failure).
//   • Refuses (`status: 'degenerate'`) rather than fabricate a footprint, even though real, cited
//     ordinance parameters (coverage, front/side setbacks) ARE packed.
//   • Every other zona_orden value (an unmapped/unresolved zone) refuses too — no pack, no envelope.

import { describe, it, expect } from 'vitest';
import type { Pt, ParcelEdgeClassification, ZoningRecord } from '@pryzm/schemas';
import { computeBuildableEnvelope } from '../src/index.js';
import {
    ES_SEVILLA_PGOU_PACK,
    SEVILLA_JURISDICTION_ID,
    SEVILLA_ENVELOPE_VERIFIED,
    SEVILLA_SB_FONDO_UNRESOLVED_RING,
    SEVILLA_CJ_LINDEROS_UNRESOLVED_RING,
    SEVILLA_M_FONDO_UNRESOLVED_RING,
    SEVILLA_CT_ORDEN_UNRESOLVED_RING,
    SEVILLA_IC_LINDEROS_UNRESOLVED_RING,
    SEVILLA_STC_ORDEN_UNRESOLVED_RING,
    SEVILLA_STA_LINDEROS_UNRESOLVED_RING,
    SEVILLA_A_LINDEROS_UNRESOLVED_RING,
    SEVILLA_MP_INTERIOR_UNRESOLVED_RING,
    SEVILLA_CH_OCUPACION_UNRESOLVED_RING,
    SEVILLA_PGOU_ZONE_CODES,
    sevillaNoRulePackRefusal,
} from '../src/rulepacks/esSevilla.js';

/** 30 m wide (x) × 40 m deep (z). Edge 0 (z=0 → the +x run) is the street frontage. */
const PARCEL: Pt[] = [
    { x: 0, z: 0 },
    { x: 30, z: 0 },
    { x: 30, z: 40 },
    { x: 0, z: 40 },
];
const PARCEL_AREA = 30 * 40; // 1200 m²

const WITH_FRONT: ParcelEdgeClassification[] = ['front', 'side', 'rear', 'side'];

function sevillaZoning(zoneCode: string): ZoningRecord {
    return {
        zoneCode,
        zoneLabel: zoneCode,
        jurisdictionId: SEVILLA_JURISDICTION_ID,
        structuredFields: {},
        overlays: [],
        ordinanceRef: null,
        provenance: {
            source: SEVILLA_JURISDICTION_ID,
            label: 'Sevilla PGOU-2006 (test)',
            version: '2026-08-03',
            license: null,
            crs: 'EPSG:25830',
        },
    };
}

function solve(zoneCode: string, edges: ParcelEdgeClassification[] = WITH_FRONT) {
    return computeBuildableEnvelope({
        parcelRing: PARCEL,
        edgeClassifications: edges,
        zoning: sevillaZoning(zoneCode),
        rulePack: ES_SEVILLA_PGOU_PACK,
    });
}

describe('Sevilla SB — real, cited ordinance parameters are shipped', () => {
    it('carries front=0 (alineación obligatoria) and side=0 (medianera) setbacks, rear unknown', () => {
        const sb = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'SB')!;
        expect(sb.setbacks).toEqual({ front_m: 0, side_m: 0, rear_m: null });
    });

    it('carries the 80 % occupation figure, cited to Art. 12.5.4', () => {
        const sb = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'SB')!;
        expect(sb.maxCoverage).toBe(0.8);
        expect(sb.ordinanceRef).toContain('12.5.4');
    });

    it('does NOT fabricate height, floors or FAR — Art. 12.5.7/12.5.9 are per-block tables, null here', () => {
        const sb = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'SB')!;
        expect(sb.maxHeight_m).toBeNull();
        expect(sb.maxFloors).toBeNull();
        expect(sb.plotRatioFAR).toBeNull();
    });

    it('cites the exact source PDF and article range', () => {
        const sb = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'SB')!;
        expect(sb.ordinanceRef).toContain('12.5.3');
        expect(sb.ordinanceRef).toContain('12.5.6');
        expect(sb.ordinanceRef).toContain('06_TR_NORMAS_SB.pdf');
    });
});

describe('Sevilla SB — STRUCTURAL REFUSAL: never a full-parcel box (the L-616 guard)', () => {
    it('refuses (degenerate, zero area) rather than draw the whole parcel', () => {
        const env = solve('SB');
        expect(env.status).toBe('degenerate');
        expect(env.insetAreaM2).toBe(0);
        // The failure this guard exists to prevent: front=0 + side=0 + rear=null with NO
        // geometricRule would inset by 0 on every edge and draw the WHOLE 1200 m² parcel.
        expect(env.insetAreaM2).not.toBeCloseTo(PARCEL_AREA, 0);
    });

    it('cites the unresolvable explicit-area footprint (no full-parcel fall-through)', () => {
        const env = solve('SB');
        expect(env.caveats.some((c) => /explicit-area|published buildable footprint/i.test(c))).toBe(true);
    });

    it('the guard ring handle is a stable, greppable constant naming the real conditional rules', () => {
        expect(SEVILLA_SB_FONDO_UNRESOLVED_RING).toMatch(/UNRESOLVED/);
        expect(SEVILLA_SB_FONDO_UNRESOLVED_RING).toMatch(/12\.5\.4/);
        expect(SEVILLA_SB_FONDO_UNRESOLVED_RING).toMatch(/12\.5\.6/);
        const sb = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'SB')!;
        expect(sb.geometricRule).toEqual({
            kind: 'explicit-area',
            ringRef: SEVILLA_SB_FONDO_UNRESOLVED_RING,
        });
    });

    it('refuses regardless of edge classification — no front edge is not the cause', () => {
        const env = solve('SB', ['unclassified', 'unclassified', 'unclassified', 'unclassified']);
        expect(env.status).toBe('degenerate');
        expect(env.insetAreaM2).toBe(0);
    });
});

describe('Sevilla CJ — real, cited ordinance parameters are shipped', () => {
    it('carries front=4 (Art. 12.6.3 §3, obligatorio) and side/rear unknown (h/2, height-dependent)', () => {
        const cj = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'CJ')!;
        expect(cj.setbacks).toEqual({ front_m: 4, side_m: null, rear_m: null });
    });

    it('carries the 50 % occupation figure, cited to Art. 12.6.3 §1', () => {
        const cj = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'CJ')!;
        expect(cj.maxCoverage).toBe(0.5);
        expect(cj.ordinanceRef).toContain('12.6.3');
    });

    it('does NOT fabricate height, floors or FAR — Art. 12.6.3 §§4-5 are per-parcel/derived, null here', () => {
        const cj = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'CJ')!;
        expect(cj.maxHeight_m).toBeNull();
        expect(cj.maxFloors).toBeNull();
        expect(cj.plotRatioFAR).toBeNull();
    });

    it('cites the exact source document and article range', () => {
        const cj = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'CJ')!;
        expect(cj.ordinanceRef).toContain('12.6.1');
        expect(cj.ordinanceRef).toContain('12.6.3');
        expect(cj.ordinanceRef).toContain('06_TR_NORMAS.pdf');
    });
});

describe('Sevilla CJ — STRUCTURAL REFUSAL: never a front-4m-only box (the L-616 guard)', () => {
    it('refuses (degenerate, zero area) rather than draw the whole parcel minus the front setback', () => {
        const env = solve('CJ');
        expect(env.status).toBe('degenerate');
        expect(env.insetAreaM2).toBe(0);
        // The failure this guard exists to prevent: front=4 + side=null + rear=null with NO
        // geometricRule would inset only 4 m off the front edge and publish the REST of the
        // 1200 m² parcel as buildable, when the real ordinance requires an unknown-but-positive
        // h/2 withdrawal from every other edge.
        expect(env.insetAreaM2).not.toBeCloseTo(PARCEL_AREA, 0);
    });

    it('cites the unresolvable explicit-area footprint (no full-parcel fall-through)', () => {
        const env = solve('CJ');
        expect(env.caveats.some((c) => /explicit-area|published buildable footprint/i.test(c))).toBe(true);
    });

    it('the guard ring handle is a stable, greppable constant naming the real conditional rule', () => {
        expect(SEVILLA_CJ_LINDEROS_UNRESOLVED_RING).toMatch(/UNRESOLVED/);
        expect(SEVILLA_CJ_LINDEROS_UNRESOLVED_RING).toMatch(/12\.6\.3/);
        const cj = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'CJ')!;
        expect(cj.geometricRule).toEqual({
            kind: 'explicit-area',
            ringRef: SEVILLA_CJ_LINDEROS_UNRESOLVED_RING,
        });
    });

    it('refuses regardless of edge classification — no front edge is not the cause', () => {
        const env = solve('CJ', ['unclassified', 'unclassified', 'unclassified', 'unclassified']);
        expect(env.status).toBe('degenerate');
        expect(env.insetAreaM2).toBe(0);
    });
});

describe('Sevilla M — real, cited ordinance parameters are shipped', () => {
    it('carries front=0 (alineación obligatoria) and side=0 (medianera) setbacks, rear unknown', () => {
        const m = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'M')!;
        expect(m.setbacks).toEqual({ front_m: 0, side_m: 0, rear_m: null });
    });

    it('carries the 80 % occupation figure, cited to Art. 12.3.6', () => {
        const m = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'M')!;
        expect(m.maxCoverage).toBe(0.8);
        expect(m.ordinanceRef).toContain('12.3.6');
    });

    it('does NOT fabricate height, floors or FAR — Art. 12.3.8/12.3.9 are per-block/table, null here', () => {
        const m = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'M')!;
        expect(m.maxHeight_m).toBeNull();
        expect(m.maxFloors).toBeNull();
        expect(m.plotRatioFAR).toBeNull();
    });

    it('cites the exact source document and article range', () => {
        const m = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'M')!;
        expect(m.ordinanceRef).toContain('12.3.3');
        expect(m.ordinanceRef).toContain('12.3.9');
        expect(m.ordinanceRef).toContain('06_TR_NORMAS.pdf');
    });
});

describe('Sevilla M — STRUCTURAL REFUSAL: never a full-parcel box (the L-616 guard)', () => {
    it('refuses (degenerate, zero area) rather than draw the whole parcel', () => {
        const env = solve('M');
        expect(env.status).toBe('degenerate');
        expect(env.insetAreaM2).toBe(0);
        expect(env.insetAreaM2).not.toBeCloseTo(PARCEL_AREA, 0);
    });

    it('cites the unresolvable explicit-area footprint (no full-parcel fall-through)', () => {
        const env = solve('M');
        expect(env.caveats.some((c) => /explicit-area|published buildable footprint/i.test(c))).toBe(true);
    });

    it('the guard ring handle is a stable, greppable constant naming the real gap', () => {
        expect(SEVILLA_M_FONDO_UNRESOLVED_RING).toMatch(/UNRESOLVED/);
        expect(SEVILLA_M_FONDO_UNRESOLVED_RING).toMatch(/12\.3\.6/);
        const m = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'M')!;
        expect(m.geometricRule).toEqual({
            kind: 'explicit-area',
            ringRef: SEVILLA_M_FONDO_UNRESOLVED_RING,
        });
    });

    it('refuses regardless of edge classification — no front edge is not the cause', () => {
        const env = solve('M', ['unclassified', 'unclassified', 'unclassified', 'unclassified']);
        expect(env.status).toBe('degenerate');
        expect(env.insetAreaM2).toBe(0);
    });
});

describe('Sevilla AD — Sevilla\'s FIRST non-refused zone: real setback footprint', () => {
    it('carries flat front=4/side=0/rear=4 setbacks, all stated (Art. 12.7.3 §4)', () => {
        const ad = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'AD')!;
        expect(ad.setbacks).toEqual({ front_m: 4, side_m: 0, rear_m: 4 });
        expect(ad.geometricRule).toEqual({ kind: 'setback', front_m: 4, side_m: 0, rear_m: 4 });
    });

    it('carries the flat 1.20 m²t/m²s edificabilidad and 60 % occupation (Art. 12.7.3 §§2,6)', () => {
        const ad = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'AD')!;
        expect(ad.plotRatioFAR).toBe(1.2);
        expect(ad.maxCoverage).toBe(0.6);
    });

    it('does NOT fabricate height/floors — Art. 12.7.3 §5 is per-parcel graphic, 7 m is a ceiling not an answer', () => {
        const ad = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'AD')!;
        expect(ad.maxHeight_m).toBeNull();
        expect(ad.maxFloors).toBeNull();
        expect(ad.ordinanceRef).toContain('techo absoluto 7 m');
    });

    it('computes a real footprint — inset 4 m front + 4 m rear, 0 m sides (960 m² of 1200 m²)', () => {
        const env = solve('AD');
        expect(env.status).toBe('ok');
        expect(env.insetAreaM2).toBeCloseTo(30 * (40 - 4 - 4), 6); // 960 m²
        expect(env.insetAreaM2).toBeLessThan(PARCEL_AREA);
    });
});

describe('Sevilla UA — Sevilla\'s SECOND non-refused zone: real setback footprint', () => {
    it('carries flat front=6/side=5/rear=5 setbacks, all stated (Art. 12.8.3 §4)', () => {
        const ua = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'UA')!;
        expect(ua.setbacks).toEqual({ front_m: 6, side_m: 5, rear_m: 5 });
        expect(ua.geometricRule).toEqual({ kind: 'setback', front_m: 6, side_m: 5, rear_m: 5 });
    });

    it('carries the flat 0.60 m²t/m²s edificabilidad and 30 % occupation (Art. 12.8.3 §§2,6)', () => {
        const ua = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'UA')!;
        expect(ua.plotRatioFAR).toBe(0.6);
        expect(ua.maxCoverage).toBe(0.3);
    });

    it('does NOT fabricate height/floors — Art. 12.8.3 §5 is per-parcel graphic, 9 m is a ceiling not an answer', () => {
        const ua = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'UA')!;
        expect(ua.maxHeight_m).toBeNull();
        expect(ua.maxFloors).toBeNull();
    });

    it('computes a real footprint — inset 6 m front + 5 m rear + 5 m each side (580 m² of 1200 m²)', () => {
        const env = solve('UA');
        expect(env.status).toBe('ok');
        expect(env.insetAreaM2).toBeCloseTo((30 - 5 - 5) * (40 - 6 - 5), 6); // 580 m²
        expect(env.insetAreaM2).toBeLessThan(PARCEL_AREA);
    });
});

describe('Sevilla — a genuinely unmapped zona_orden still refuses (no pack, no envelope)', () => {
    it('a zone code no chapter answers for (e.g. "ZZ") resolves no rule and computes nothing', () => {
        const env = solve('ZZ: not a real zona_orden');
        expect(env.status).not.toBe('ok');
        expect(env.insetAreaM2 === 0 || env.insetAreaM2 == null).toBe(true);
    });

    it('SEVILLA_PGOU_ZONE_CODES names ALL 15 of the live zona_orden universe (CH now packed)', () => {
        expect(SEVILLA_PGOU_ZONE_CODES).toEqual([
            'A',
            'AD',
            'CH',
            'CJ',
            'CT',
            'IA',
            'IC',
            'IS',
            'M',
            'MP',
            'SA',
            'SB',
            'ST-A',
            'ST-C',
            'UA',
        ]);
    });
});

describe('Sevilla IS — real footprint (Industria Singular, Art. 12.10.2)', () => {
    it('carries flat front=5/side=5/rear=5 setbacks (Art. 12.10.2 §2.2)', () => {
        const is = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'IS')!;
        expect(is.setbacks).toEqual({ front_m: 5, side_m: 5, rear_m: 5 });
        expect(is.geometricRule).toEqual({ kind: 'setback', front_m: 5, side_m: 5, rear_m: 5 });
    });

    it('carries flat FAR 1.5 and a flat 20 m height ceiling (Art. 12.10.2 §§2.4-2.5)', () => {
        const is = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'IS')!;
        expect(is.plotRatioFAR).toBe(1.5);
        expect(is.maxHeight_m).toBe(20);
        expect(is.maxCoverage).toBeNull();
    });

    it('computes a real footprint — inset 5 m on every edge', () => {
        const env = solve('IS');
        expect(env.status).toBe('ok');
        expect(env.insetAreaM2).toBeCloseTo((30 - 5 - 5) * (40 - 5 - 5), 6); // 500 m²
        expect(env.insetAreaM2).toBeLessThan(PARCEL_AREA);
    });
});

describe('Sevilla IA — real footprint (Industria en Edificación Abierta, Art. 12.10.3)', () => {
    it('carries flat front=6/side=5/rear=5 setbacks (Art. 12.10.3 §2.1)', () => {
        const ia = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'IA')!;
        expect(ia.setbacks).toEqual({ front_m: 6, side_m: 5, rear_m: 5 });
        expect(ia.geometricRule).toEqual({ kind: 'setback', front_m: 6, side_m: 5, rear_m: 5 });
    });

    it('carries flat FAR 1.5 and a flat 15 m height ceiling (Art. 12.10.3 §§2.3-2.4)', () => {
        const ia = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'IA')!;
        expect(ia.plotRatioFAR).toBe(1.5);
        expect(ia.maxHeight_m).toBe(15);
    });

    it('computes a real footprint', () => {
        const env = solve('IA');
        expect(env.status).toBe('ok');
        expect(env.insetAreaM2).toBeCloseTo((30 - 5 - 5) * (40 - 6 - 5), 6); // 580 m²
    });
});

describe('Sevilla SA — real footprint (Servicios Avanzados, Art. 12.11.3)', () => {
    it('carries flat front=5/side=4/rear=4 setbacks (Art. 12.11.3 §1)', () => {
        const sa = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'SA')!;
        expect(sa.setbacks).toEqual({ front_m: 5, side_m: 4, rear_m: 4 });
        expect(sa.geometricRule).toEqual({ kind: 'setback', front_m: 5, side_m: 4, rear_m: 4 });
    });

    it('carries flat FAR 2.0, no fabricated height (Art. 12.11.3 §§3-4)', () => {
        const sa = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === 'SA')!;
        expect(sa.plotRatioFAR).toBe(2.0);
        expect(sa.maxHeight_m).toBeNull();
    });

    it('computes a real footprint', () => {
        const env = solve('SA');
        expect(env.status).toBe('ok');
        expect(env.insetAreaM2).toBeCloseTo((30 - 4 - 4) * (40 - 5 - 4), 6); // 682 m²
    });
});

describe('Sevilla CT/IC/ST-C/ST-A/A/MP/CH — STRUCTURAL REFUSALS (the L-616 guard)', () => {
    const cases: Array<[string, RegExp]> = [
        ['CT', SEVILLA_CT_ORDEN_UNRESOLVED_RING as unknown as RegExp],
        ['IC', SEVILLA_IC_LINDEROS_UNRESOLVED_RING as unknown as RegExp],
        ['ST-C', SEVILLA_STC_ORDEN_UNRESOLVED_RING as unknown as RegExp],
        ['ST-A', SEVILLA_STA_LINDEROS_UNRESOLVED_RING as unknown as RegExp],
        ['A', SEVILLA_A_LINDEROS_UNRESOLVED_RING as unknown as RegExp],
        ['MP', SEVILLA_MP_INTERIOR_UNRESOLVED_RING as unknown as RegExp],
        ['CH', SEVILLA_CH_OCUPACION_UNRESOLVED_RING as unknown as RegExp],
    ];

    it.each(cases)('%s refuses (degenerate, zero area) rather than draw the whole parcel', (code) => {
        const env = solve(code);
        expect(env.status).toBe('degenerate');
        expect(env.insetAreaM2).toBe(0);
        expect(env.insetAreaM2).not.toBeCloseTo(PARCEL_AREA, 0);
    });

    it.each(cases)('%s ships explicit-area with its own named ring handle', (code, ring) => {
        const zone = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === code)!;
        expect(zone.geometricRule).toEqual({ kind: 'explicit-area', ringRef: ring as unknown as string });
    });

    it('every guard ring handle is a stable, greppable constant naming UNRESOLVED', () => {
        expect(SEVILLA_CT_ORDEN_UNRESOLVED_RING).toMatch(/UNRESOLVED/);
        expect(SEVILLA_IC_LINDEROS_UNRESOLVED_RING).toMatch(/UNRESOLVED/);
        expect(SEVILLA_STC_ORDEN_UNRESOLVED_RING).toMatch(/UNRESOLVED/);
        expect(SEVILLA_STA_LINDEROS_UNRESOLVED_RING).toMatch(/UNRESOLVED/);
        expect(SEVILLA_A_LINDEROS_UNRESOLVED_RING).toMatch(/UNRESOLVED/);
        expect(SEVILLA_MP_INTERIOR_UNRESOLVED_RING).toMatch(/UNRESOLVED/);
        expect(SEVILLA_CH_OCUPACION_UNRESOLVED_RING).toMatch(/UNRESOLVED/);
    });
});

describe('Sevilla — SEVILLA_ENVELOPE_VERIFIED — the founder-only sign-off gate', () => {
    it('is true — signed 2026-08-05, see sources/VERIFICATION.md', () => {
        expect(SEVILLA_ENVELOPE_VERIFIED).toBe(true);
    });

    it('the dispatcher-level refusal still fires and names the real zone (unchanged behaviour)', () => {
        const refusal = sevillaNoRulePackRefusal('SB: Suburbana', null, ['Location: test']);
        expect(refusal.code).toBe('no-rule-pack');
        expect(refusal.legallyGrounded).toBe(false);
        expect(refusal.headline).toContain('SB: Suburbana');
    });
});
