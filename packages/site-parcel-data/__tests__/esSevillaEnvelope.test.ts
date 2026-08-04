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

describe('Sevilla — an unmapped zona_orden still refuses (no pack, no envelope)', () => {
    it('a zone code this pass never read (e.g. "MC") resolves no rule and computes nothing', () => {
        const env = solve('MC: Manzana Cerrada');
        expect(env.status).not.toBe('ok');
        expect(env.insetAreaM2 === 0 || env.insetAreaM2 == null).toBe(true);
    });

    it('SEVILLA_PGOU_ZONE_CODES names exactly what was transcribed — SB, and nothing else', () => {
        expect(SEVILLA_PGOU_ZONE_CODES).toEqual(['SB']);
    });
});

describe('Sevilla — SEVILLA_ENVELOPE_VERIFIED stays false regardless of the SB transcription', () => {
    it('is false — a founder-only act; transcribing SB does not flip it', () => {
        expect(SEVILLA_ENVELOPE_VERIFIED).toBe(false);
    });

    it('the dispatcher-level refusal still fires and names the real zone (unchanged behaviour)', () => {
        const refusal = sevillaNoRulePackRefusal('SB: Suburbana', null, ['Location: test']);
        expect(refusal.code).toBe('no-rule-pack');
        expect(refusal.legallyGrounded).toBe(false);
        expect(refusal.headline).toContain('SB: Suburbana');
    });
});
