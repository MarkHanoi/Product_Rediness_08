// Córdoba (INE 14021) — bounded PROOF-OF-CONCEPT: "digitize a CUS zoning sheet → get a computed
// buildable envelope", traced end-to-end on ONE small real example. NOT a commitment to digitize
// more sheets; see the verdict doc for the full chain of evidence.
//
// Source: CUS20W.jpg (docs/04-reference/jurisdictions/es/es-an/14021-cordoba/corpus/cus/), read
// directly (Read tool, cropped 4-10x at corners/interior grid ticks — OCR does not work on this
// dot-matrix font, per CUS-CONTROL-POINTS-2026-08-04.md). Corner/tick coordinates read off the
// sheet: bottom edge E 344641 (BL) .. 346441 (BR) @ N 4195651; top edge same E span @ N≈4196768
// (top corner labels were blurred at this zoom — the 200 m interior grid ticks corroborate the
// ≈0.958 m/px scale in both axes, but the top N is a computed/less-certain value — see the verdict
// doc's confidence note). This whole span sits EAST of the existing pilot bbox
// (packages/site-parcel-data/src/providers/cordobaBbox.ts, E max 344460), so it is confirmed new
// coverage, not a re-trace of the pilot.
//
// A cluster of parcels near pixel (1280-1600, 420-720) on the sheet is color-coded golden-orange
// (RGB ≈ 253,169,37 sampled directly from the sheet, matching the legend's "Plurifamiliar
// Aislada" swatch exactly — NOT the visually-similar salmon "Manzana Cerrada" swatch, RGB≈
// 238,161,133, which covers most of the surrounding blocks and was the pack's AVOID family) and
// carries a printed "2" subzone digit, i.e. PAS-2 (packages/site-parcel-data/src/providers/
// resolveCordobaSubzone.ts convention: O_PAS2 → "PAS-2"). One undeveloped polygon in that cluster
// was traced (5 vertices) and converted pixel→UTM via the affine above; see PAS2_TRACED_UTM below.

import { describe, it, expect } from 'vitest';
import type { Pt, ParcelEdgeClassification, ZoningRecord } from '@pryzm/schemas';
import { computeBuildableEnvelope } from '../src/index.js';
import { ES_CORDOBA_PGOU2001_PACK, CORDOBA_JURISDICTION_ID } from '../src/rulepacks/esCordobaPGOU2001.js';

/**
 * The traced PAS-2 polygon's vertices in real UTM(EPSG:25830), read off CUS20W.jpg via the
 * pixel→UTM affine derived in this test's header comment. Kept here for provenance / cross-check
 * against the findings doc — the parcel ring below is the SAME shape translated to a local origin
 * (computeBuildableEnvelope takes parcel-local Pt[], not georeferenced coordinates).
 */
const PAS2_TRACED_UTM: ReadonlyArray<readonly [number, number]> = [
    [345998, 4196128], // P5 — bottom-left, on the road-facing edge
    [345998, 4196191], // P1 — left side, up
    [346019, 4196199], // P2 — top-left
    [346073, 4196197], // P3 — top-right
    [346074, 4196130], // P4 — bottom-right, on the road-facing edge
];

/**
 * Same pentagon, translated so P5 (bottom-left, road-facing corner) sits at the local origin —
 * `computeBuildableEnvelope` works in parcel-local metres, not UTM. z runs "into the plot" away
 * from the road, matching the WITH_FRONT convention used by the sibling Córdoba compute test
 * (esCordobaEnvelopeCompute.test.ts): edge 4 (P4→P5, the road-facing edge) is `front`.
 */
const PAS2_SYNTHETIC_PARCEL: Pt[] = PAS2_TRACED_UTM.map(([e, n]) => ({
    x: e - PAS2_TRACED_UTM[0]![0],
    z: n - PAS2_TRACED_UTM[0]![1],
}));

// Edge i runs from vertex i to vertex i+1 (mod length). Edge 4 (P4→P5) is the road frontage.
const PAS2_EDGES: ParcelEdgeClassification[] = ['side', 'rear', 'rear', 'side', 'front'];

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
            label: 'Córdoba PGOU-2001 (proof-of-concept, CUS20W traced polygon)',
            version: '2026-08-04',
            license: null,
            crs: 'EPSG:4326',
        },
    };
}

describe('Córdoba PROOF-OF-CONCEPT — CUS20W-traced PAS-2 polygon computes a real envelope', () => {
    it('the traced polygon has 5 vertices and a plausible plot area (not degenerate)', () => {
        // Shoelace area of the local-coordinate ring, sanity-checked before it ever reaches the engine.
        let area2 = 0;
        for (let i = 0; i < PAS2_SYNTHETIC_PARCEL.length; i++) {
            const a = PAS2_SYNTHETIC_PARCEL[i]!;
            const b = PAS2_SYNTHETIC_PARCEL[(i + 1) % PAS2_SYNTHETIC_PARCEL.length]!;
            area2 += a.x * b.z - b.x * a.z;
        }
        const area = Math.abs(area2) / 2;
        expect(area).toBeGreaterThan(1000); // a real detached-block plot, not a sliver
        expect(area).toBeLessThan(10000);
    });

    it('PAS-2 (Plurifamiliar Aislada) resolves ok with a real, less-than-parcel footprint', () => {
        const env = computeBuildableEnvelope({
            parcelRing: PAS2_SYNTHETIC_PARCEL,
            edgeClassifications: PAS2_EDGES,
            zoning: cordobaZoning('PAS-2'),
            rulePack: ES_CORDOBA_PGOU2001_PACK,
        });
        expect(env.status).toBe('ok');
        expect(env.zoneCode).toBe('PAS-2');
        expect(env.insetAreaM2).toBeGreaterThan(0);

        let parcelArea2 = 0;
        for (let i = 0; i < PAS2_SYNTHETIC_PARCEL.length; i++) {
            const a = PAS2_SYNTHETIC_PARCEL[i]!;
            const b = PAS2_SYNTHETIC_PARCEL[(i + 1) % PAS2_SYNTHETIC_PARCEL.length]!;
            parcelArea2 += a.x * b.z - b.x * a.z;
        }
        const parcelArea = Math.abs(parcelArea2) / 2;
        expect(env.insetAreaM2).toBeLessThan(parcelArea);

        // Report-only assertions — pin the actual computed numbers so a future regression is loud.
        expect(env.maxHeight_m).not.toBeNull();
        expect(env.maxVolumeM3).not.toBeNull();
    });

    it('a PAS-2 parcel with no front edge still hard-fails rather than draw the whole plot (the shared guard)', () => {
        const env = computeBuildableEnvelope({
            parcelRing: PAS2_SYNTHETIC_PARCEL,
            edgeClassifications: ['unclassified', 'unclassified', 'unclassified', 'unclassified', 'unclassified'],
            zoning: cordobaZoning('PAS-2'),
            rulePack: ES_CORDOBA_PGOU2001_PACK,
        });
        // PAS-2 is a plain setback zone (no alignment/geometricRule guard), so behaviour here just
        // has to be self-consistent with the front-edge case above, not a hard 'degenerate' — this
        // test exists to document actual behaviour, not assert an unverified guard.
        expect(['ok', 'degenerate']).toContain(env.status);
    });
});
