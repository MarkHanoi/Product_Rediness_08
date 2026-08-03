// §VALENCIA-ALINEACIONES — the LIVE layer-212 seam, and the two ways it must refuse.
//
// ── WHY THIS FILE EXISTS, SEPARATELY FROM `valenciaAlineaciones.test.ts` ──────────────────────
// That file tests the PURE half (parser · validator · heritage hooks). This one tests the seam that
// did not exist until now: `esValenciaAlineaciones.ts` has marked `explicitAreaFootprint` as
// **resolved** since 2026-08-02, while NO CODE ANYWHERE FETCHED LAYER 212. An input marked
// `resolved` that no caller can obtain is, at runtime, indistinguishable from one that does not
// exist — so these tests were not previously possible to write.
//
// ⚠⚠ THE DEFECT THIS FILE IS REALLY GUARDING, measured 2026-08-03 and very nearly shipped:
// **layer 212 TILES the municipality, carriageway included.** 40,8 % of points sampled along the
// publisher's own street centreline (`MapServer/223`) fall INSIDE a 212 polygon (n = 12 647), and
// 94,8 % of those sit on `altura` = 0 / blank ground; only 0,96 % of all centreline points sit on
// building-class ground. A provider that returned "the polygon at this point" would hand back a
// STREET as a buildable footprint — an over-grant of the L-616 kind, behind a clean HTTP 200.
// Hence `valenciaAlturaGroundClass`, and hence the `not-building-ground` test below.
//
// FIXTURE RINGS ARE REAL València UTM 30N metres taken from the live service — which is also what
// makes the "not degrees" assertion meaningful.
//
// @see packages/site-parcel-data/src/providers/resolveValenciaAlineaciones.ts
// @see tools/valencia-alineaciones-probe/ — the paired-control probe behind the numbers above

import { describe, expect, it } from 'vitest';
import {
    resolveValenciaAlineaciones,
    VALENCIA_NATIVE_EPSG,
    VALENCIA_ALINEACIONES_GEOMETRY_EVIDENCE,
} from '../src/providers/resolveValenciaAlineaciones.js';
import {
    parseValenciaAltura,
    valenciaAlturaGroundClass,
} from '../src/rulepacks/esValenciaAlineaciones.js';
import { VALENCIA_ENVELOPE_VERIFIED } from '../src/rulepacks/esValenciaEnvelope.js';

/** A point inside València's routing box (Eixample). */
const IN_VALENCIA = { lat: 39.4648, lon: -0.3706 } as const;

/** A real 212 ring in native EPSG:25830 metres — a closed-block movement polygon. */
const RING_25830 = [
    [729184.85, 4372713.469], [729182.081, 4372705.25], [729177.341, 4372706.858],
    [729174.94, 4372699.689], [729167.222, 4372702.239], [729170.642, 4372712.329],
    [729161.382, 4372715.469], [729158.951, 4372708.268], [729151.272, 4372710.847],
    [729154.691, 4372720.857], [729152.78, 4372730.677], [729160.431, 4372728.088],
    [729184.85, 4372713.469],
];

function arcgisResponse(altura: string, rings: number[][][] = [RING_25830]) {
    return {
        spatialReference: { wkid: 25830, latestWkid: 25830 },
        features: [{ attributes: { altura, protec: ' ', ttggss: '114302' }, geometry: { rings } }],
    };
}

/**
 * A fetch that answers layer 212 with `body`, and makes the calificación cross-check FAIL.
 * That is deliberate: containment against `MapServer/231` is a best-effort guard, and a 231 outage
 * must leave containment UNASSERTED rather than fail the resolution or falsely assert it.
 */
const fetchReturning = (body: unknown) =>
    (async (url: string) => {
        if (String(url).includes('/231/')) throw new Error('calificacion unavailable');
        return { ok: true, status: 200, json: async () => body } as unknown as Response;
    }) as unknown as typeof fetch;

describe('§VALENCIA-ALINEACIONES — the ground-class gate', () => {
    it('returns a footprint on building-class ground, in NATIVE EPSG:25830 metres', async () => {
        const res = await resolveValenciaAlineaciones(IN_VALENCIA, {
            fetchImpl: fetchReturning(arcgisResponse('5')),
        });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.epsg).toBe(VALENCIA_NATIVE_EPSG);
        expect(res.groundClass).toBe('building-ground');
        expect(res.rings).toHaveLength(1);
        // ⚠ Metres, not degrees. The validator's `crs-looks-like-degrees` finding exists because the
        // first 2026-08-02 measurement got degrees back and read every mean width as 0.0 m.
        expect(Math.abs(res.rings[0]![0]![0]!)).toBeGreaterThan(1000);
        expect(res.validation.ok).toBe(true);
        expect(res.validation.areaM2).toBeGreaterThan(100);
    });

    it('⛔ REFUSES altura=0 as not-building-ground — never a footprint', async () => {
        // The carriageway / espacios libres case. The service answers perfectly; the honest result
        // is "no building is granted on this ground", NOT a ring.
        const res = await resolveValenciaAlineaciones(IN_VALENCIA, {
            fetchImpl: fetchReturning(arcgisResponse('0')),
        });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason).toBe('not-building-ground');
        expect(res.altura?.kind).toBe('zero');
    });

    it('⚠ REFUSES an unknown altura rather than drawing zero or the whole parcel', async () => {
        for (const raw of ['', '-+-', '_', '538650', 'PPARCIAL']) {
            const res = await resolveValenciaAlineaciones(IN_VALENCIA, {
                fetchImpl: fetchReturning(arcgisResponse(raw)),
            });
            expect(res.ok, `altura=${JSON.stringify(raw)} must not yield a footprint`).toBe(false);
            if (res.ok) continue;
            expect(res.reason, raw).toBe('altura-unknown');
        }
    });

    it('treats PROTEGIDO as building ground — an existing building stands there', async () => {
        const res = await resolveValenciaAlineaciones(IN_VALENCIA, {
            fetchImpl: fetchReturning(arcgisResponse('PROTEGIDO')),
        });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.altura.kind).toBe('protection-derived');
    });
});

describe('§VALENCIA-ALINEACIONES — failure is never empty (L-422/457/467/469)', () => {
    it('an unreachable service is service-error, NOT no-polygon-here', async () => {
        const res = await resolveValenciaAlineaciones(IN_VALENCIA, {
            fetchImpl: (async () => { throw new Error('socket hang up'); }) as unknown as typeof fetch,
        });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason).toBe('service-error');
    });

    it('an ArcGIS error body behind HTTP 200 is service-error, NOT no-polygon-here', async () => {
        const res = await resolveValenciaAlineaciones(IN_VALENCIA, {
            fetchImpl: fetchReturning({ error: { code: 400, message: 'Invalid query' } }),
        });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason).toBe('service-error');
    });

    it('a genuine empty answer is no-polygon-here — distinguishable from failure', async () => {
        const res = await resolveValenciaAlineaciones(IN_VALENCIA, {
            fetchImpl: fetchReturning({ spatialReference: { wkid: 25830 }, features: [] }),
        });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason).toBe('no-polygon-here');
    });

    it('⚠ REFUSES geometry returned in the wrong CRS rather than measuring it', async () => {
        // A silently-declined `outSR` is how a lossy reprojection enters unnoticed. A sibling agent
        // found Murcia measuring on 4326 geometry quantised to ~10 m against 8 m / 12 m legal bands.
        const res = await resolveValenciaAlineaciones(IN_VALENCIA, {
            fetchImpl: fetchReturning({
                spatialReference: { wkid: 4326, latestWkid: 4326 },
                features: [{
                    attributes: { altura: '5' },
                    geometry: { rings: [[[-0.37, 39.46], [-0.371, 39.46], [-0.371, 39.461], [-0.37, 39.46]]] },
                }],
            }),
        });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason).toBe('service-error');
    });

    it('a point outside the box refuses without touching the network', async () => {
        let called = false;
        const res = await resolveValenciaAlineaciones({ lat: 41.3874, lon: 2.1686 }, {
            fetchImpl: (async () => { called = true; throw new Error('should not fetch'); }) as unknown as typeof fetch,
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('out-of-valencia');
        expect(called).toBe(false);
    });

    it('never throws — a malformed body becomes a typed refusal', async () => {
        const res = await resolveValenciaAlineaciones(IN_VALENCIA, {
            fetchImpl: fetchReturning({ features: [{ attributes: { altura: '5' }, geometry: null }] }),
        });
        expect(res.ok).toBe(false);
    });
});

describe('⛔ THE GATE — an alignment does not produce a height', () => {
    it('VALENCIA_ENVELOPE_VERIFIED is still false, and this seam does not change that', () => {
        // ⚠ Wiring layer 212 unlocks the FOOTPRINT. Founder ruling R2 — the undocumented, measured
        // two-sided `altura` offset — is untouched and may not be retired by engineering.
        expect(VALENCIA_ENVELOPE_VERIFIED).toBe(false);
    });

    it('every successful resolution STILL blocks the height', async () => {
        const res = await resolveValenciaAlineaciones(IN_VALENCIA, {
            fetchImpl: fetchReturning(arcgisResponse('8')),
        });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.heightStatus).toBe('blocked-r2');
        expect(res.heightBlockedBecause).toMatch(/R2|authoritative definition/i);
        // The number is carried but NEVER bound to a meaning.
        expect(res.altura.kind).toBe('bare-integer');
        expect(res.altura).not.toHaveProperty('storeys');
        if (res.altura.kind === 'bare-integer') expect(res.altura.interpretationBound).toBe(false);
    });
});

describe('valenciaAlturaGroundClass — a KIND question, not a VALUE question', () => {
    it('classifies the measured field census correctly', () => {
        const cls = (raw: string) => valenciaAlturaGroundClass(parseValenciaAltura(raw));
        // building ground — the class the footprint is built from
        for (const raw of ['1', '5', '30', '<=5', '13m', 'PROTEGIDO', 'PROTEGIDO3', 'BIC']) {
            expect(cls(raw), raw).toBe('building-ground');
        }
        // not building ground — excluded, which UNDER-grants: the safe direction.
        // ⚠ ONLY the exact `'0'` reaches the parser's `zero` kind (its bare-integer pattern is
        // `^\d+$`). The asterisked `'0*'` (n=282 live) is `unrecognised` → `unknown` → refusal,
        // asserted below. That is MORE conservative, not less: it withholds rather than excludes.
        expect(cls('0')).toBe('not-building-ground');
        // ⚠ unknown — never folded into either side (L-616, ADR-0283)
        for (const raw of ['', '-+-', '_', '0*', '2000', '538650', 'PPARCIAL', 'NORMATIVA']) {
            expect(cls(raw), raw).toBe('unknown');
        }
    });

    it('never reports building-ground for a value it could not parse', () => {
        expect(valenciaAlturaGroundClass(parseValenciaAltura('M15b'))).toBe('unknown');
        expect(valenciaAlturaGroundClass(parseValenciaAltura('ET=1999210'))).toBe('unknown');
    });

    it('⚠ PINS A REAL PARSER GAP — heritage codes with an underscore fall to `unknown`', () => {
        // `BRL_MIL` (n=49) and `BIC_M` (n=87) occur in the live census, but the parser's
        // protection pattern uses `^brl\b` / `^bic\b` and `_` is a WORD character, so `\b` does not
        // match before it. They therefore parse `unrecognised` → `unknown` → REFUSAL.
        //
        // ⇒ Left as-is DELIBERATELY, and pinned rather than silently fixed. The failure direction is
        //   safe (it withholds a footprint it could have granted; it never grants one it should not),
        //   and widening a HERITAGE pattern is a legal-classification change, not a typo fix —
        //   heritage is founder-owned (R3). Retire this test WITH that decision, not around it.
        expect(valenciaAlturaGroundClass(parseValenciaAltura('BRL_MIL'))).toBe('unknown');
        expect(valenciaAlturaGroundClass(parseValenciaAltura('BIC_M'))).toBe('unknown');
        // …while the un-suffixed forms are recognised, which is what makes the gap a boundary case.
        expect(valenciaAlturaGroundClass(parseValenciaAltura('BIC'))).toBe('building-ground');
    });
});

describe('the paired-control evidence is PINNED, not prose', () => {
    it('records that 212 is NOT the street centreline, together with its control', () => {
        const e = VALENCIA_ALINEACIONES_GEOMETRY_EVIDENCE;
        // Parcel frontage sits ON the alignment…
        expect(e.frontageToAlineaciones.medianM).toBeLessThan(0.1);
        expect(e.frontageToAlineaciones.onLinePct).toBeGreaterThan(75);
        // …while the publisher's OWN axis sits half a street away. THE CONTROL — and the same
        // measurement that convicted Murcia's `pgou_ejes` as a centreline, with the sign reversed.
        expect(e.frontageToStreetAxis.medianM).toBeGreaterThan(5);
        expect(e.frontageToStreetAxis.onLinePct).toBeLessThan(5);
        // …and it is not a redrawn cadastre either.
        expect(e.granularity.ratio).toBeGreaterThan(1.5);
        expect(e.interiorEdgesAreOrdinanceSubdivisions.differingAlturaPct).toBeGreaterThan(50);
        // the correction that stopped a street shipping as a buildable footprint
        expect(e.centrelineOnBuildingClassPct).toBeLessThan(2);
    });
});
