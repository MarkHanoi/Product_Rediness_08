// §MURCIA-RM1-DEPTH-BAND — the founder's prod report, settled deterministically.
//
// THE REPORT (pryzm.fly.dev, 2026-08-01): an RM1 parcel rendered `Buildable footprint 671 m²`
// with `Buildable depth 15.0 m` on the card, and the 3D box "looked larger than the parcel".
// The rectangle-fit off the screenshot (area 671 / perimeter 111.7 ⇒ ≈38.3 × 17.5 m) suggested a
// 17.5 m depth under a 15 m cap — i.e. the *fondo máximo edificable* of PGOU Art. 5.5.3 not
// binding. That was a LEAD read off pixels, not a finding. This file settles it in the engine.
//
// WHY THIS FILE EXISTS AND WHAT IT PINS
//   1. On a plot DEEPER than the cap, RM1 must clip to a 15 m band off the `front` edge.
//      A whole-plot answer here is the L-616 family: an envelope larger than the law allows.
//   2. On a plot SHALLOWER than the cap, the band must NOT bind and the engine must SAY SO
//      (`bandInactive` caveat) — a 15 m depth cited as if it had constrained a 9 m plot
//      misrepresents what governed the envelope (C58 §1.3 explain-why).
//   3. With no `front` edge the engine must HARD-REFUSE, never return the full ring (ADR-0270).
//   4. §MURCIA-EDGE-CLASS-LENGTH-GUARD — an `edgeClassifications` array whose length does not
//      match `parcelRing` must REFUSE. The block-derived branch already guards this
//      (`blockEdgeClassifications.length !== blockRing.length`); the parcel-level alignment
//      branch did not, and an off-by-N array silently measures the band from the WRONG EDGE —
//      a plausible number computed from the wrong alineación, which is exactly the failure
//      ADR-0270 exists to prevent.
//
// Contracts: C58 §1.3/§1.4 · ADR-0270 · L-616. Source: PGOU de Murcia, Normas Urbanísticas,
// Texto Refundido diciembre 2012, Art. 5.5.3 — «El fondo máximo edificable será de 15 metros.»
// (verified byte-identical in both published consolidations, `corpus/RETRIEVAL-LOG.md`).

import { describe, it, expect } from 'vitest';
import type { Pt, ParcelEdgeClassification, ZoningRecord } from '@pryzm/schemas';
import { computeBuildableEnvelope } from '../src/index.js';
import { ES_MURCIA_PGOU2012_PACK } from '../src/rulepacks/esMurciaPgou2012.js';
import { MURCIA_JURISDICTION_ID } from '../src/rulepacks/esMurciaEnvelope.js';

/** The record the Murcia L5 dispatch builds for a packed calificación (siteDispatch.ts). */
function murciaRecord(zoneCode: string): ZoningRecord {
    return {
        zoneCode,
        zoneLabel: null,
        jurisdictionId: MURCIA_JURISDICTION_ID,
        structuredFields: {},
        overlays: [],
        ordinanceRef: null,
        provenance: {
            source: 'murcia-pgou-tr-2012',
            label: 'PGOU de Murcia TR dic-2012 (Vol. 11) — transcribed, human-signed SIG-MU1',
            version: '2012-12',
            license: null,
            crs: 'EPSG:4326',
        },
    } as ZoningRecord;
}

function solveRm1(
    parcelRing: Pt[],
    edgeClassifications: ParcelEdgeClassification[],
) {
    return computeBuildableEnvelope({
        parcelRing,
        edgeClassifications,
        zoning: murciaRecord('RM1'),
        rulePack: ES_MURCIA_PGOU2012_PACK,
    });
}

/** Shoelace, in the same scene-XZ metres the engine works in. */
function areaM2(ring: ReadonlyArray<Pt>): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!, q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
}

/** 38.3 m of frontage × 17.5 m deep — the rectangle-fit of the founder's card. */
const DEEP_PLOT: Pt[] = [
    { x: 0, z: 0 }, { x: 38.3, z: 0 }, { x: 38.3, z: 17.5 }, { x: 0, z: 17.5 },
];
/** Edge i spans vertex i → i+1, so index 0 (z = 0, the +x run) is the street frontage. */
const FRONT_FIRST: ParcelEdgeClassification[] = ['front', 'side', 'rear', 'side'];

describe('§MURCIA-RM1-DEPTH-BAND — PGOU Art. 5.5.3 fondo máximo edificable 15 m', () => {
    it('THE FOUNDER\'S PLOT: a 17.5 m-deep RM1 parcel is CLIPPED to the 15 m band, not left whole', () => {
        const env = solveRm1(DEEP_PLOT, FRONT_FIRST);
        expect(env.status).toBe('ok');

        const wholePlot = areaM2(DEEP_PLOT);          // 670.25 m²
        // RM1 setbacks are all zero (alineación a vial, medianeras), so the ONLY footprint-shaping
        // constraint is the depth band. 38.3 × 15 = 574.5 m².
        expect(wholePlot).toBeCloseTo(670.25, 1);
        expect(env.insetAreaM2).toBeCloseTo(38.3 * 15, 1);

        // The load-bearing assertion. If the band silently failed to bind, this is the
        // whole-plot 670 m² — i.e. the 671 m² the founder saw.
        expect(env.insetAreaM2).toBeLessThan(wholePlot - 90);
    });

    it('states that the profundidad edificable was APPLIED, with its figure (C58 §1.3)', () => {
        const env = solveRm1(DEEP_PLOT, FRONT_FIRST);
        expect(env.caveats.some((c) => /profundidad edificable/i.test(c) && /15/.test(c))).toBe(true);
        expect(env.caveats.some((c) => /NOT binding/i.test(c))).toBe(false);
    });

    it('a SHALLOW plot keeps the whole ring but the caveat says the cap did NOT bind', () => {
        const shallow: Pt[] = [
            { x: 0, z: 0 }, { x: 38.3, z: 0 }, { x: 38.3, z: 9 }, { x: 0, z: 9 },
        ];
        const env = solveRm1(shallow, FRONT_FIRST);
        expect(env.status).toBe('ok');
        expect(env.insetAreaM2).toBeCloseTo(areaM2(shallow), 1);
        // A 15 m cap quoted on a 9 m plot without this sentence would misstate what governed.
        expect(env.caveats.some((c) => /NOT binding/i.test(c))).toBe(true);
    });

    it('NO `front` edge ⇒ HARD REFUSAL, never a full-depth ring (ADR-0270 / C58 §1.4)', () => {
        const env = solveRm1(DEEP_PLOT, ['unclassified', 'unclassified', 'unclassified', 'unclassified']);
        expect(env.status).toBe('degenerate');
        expect(env.insetPolygon ?? []).toHaveLength(0);
        expect(env.caveats.some((c) => /no parcel edge is classified/i.test(c))).toBe(true);
    });

    it('§MURCIA-EDGE-CLASS-LENGTH-GUARD — a MISMATCHED classification array REFUSES', () => {
        // 4-vertex ring, 3 classifications. Before the guard the engine read `front` at index 0
        // and clipped from an edge chosen by an array that does not describe this ring — a
        // plausible number measured from the wrong alineación.
        const env = solveRm1(DEEP_PLOT, ['side', 'side', 'front']);
        expect(env.status).toBe('degenerate');
        expect(env.insetPolygon ?? []).toHaveLength(0);
        expect(
            env.caveats.some((c) => /classification/i.test(c) && /match/i.test(c)),
        ).toBe(true);
    });

    it('the footprint is a SUBSET of the parcel — perimeter can never exceed the plot\'s', () => {
        // The founder's card read footprint perimeter 111.7 m against drawn edge labels summing
        // to 82.7 m. A clipped region cannot out-perimeter its parent, so that pairing is
        // impossible for a correctly-clipped ring; this pins the invariant in the engine.
        const env = solveRm1(DEEP_PLOT, FRONT_FIRST);
        const perim = (ring: ReadonlyArray<Pt>): number => ring.reduce((acc, p, i) => {
            const q = ring[(i + 1) % ring.length]!;
            return acc + Math.hypot(q.x - p.x, q.z - p.z);
        }, 0);
        expect(perim(env.insetPolygon ?? [])).toBeLessThanOrEqual(perim(DEEP_PLOT) + 1e-6);
        expect(env.insetAreaM2).toBeLessThanOrEqual(areaM2(DEEP_PLOT) + 1e-6);
    });
});
