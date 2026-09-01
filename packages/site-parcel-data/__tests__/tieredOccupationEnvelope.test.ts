// §L-590b / ADR-0273 — the TWO-TIER envelope: PGM Art. 350.2 solved end to end.
//
// WHAT THIS FILE GUARDS, AND WHY EACH GUARD EXISTS
// ------------------------------------------------
// `blockConcentricBand.test.ts` proves the Art. 350.2.b equality is solved in isolation. This
// file proves the COMPOSITION — a `tiered-occupation` zone driven through
// `computeBuildableEnvelope` — and it is written around the three ways this feature can ship a
// wrong answer that looks right:
//
//   1. **The tiers stop tiling.** They are cut from the SAME inset by the SAME line; if the two
//      clips ever disagree about which side is which, one tier silently becomes the other's
//      complement — plausible geometry, completely wrong building.
//   2. **The legacy single-prism fields drift from the tiers.** Every consumer that predates
//      ADR-0273 — the facts panel, the Cesium massing, the C58 §1.8 generator bounds — reads
//      `insetPolygon` × `maxHeight_m`. If that prism is not a REAL tier, they render a solid the
//      ordinance never granted.
//   3. **It OVER-STATES.** L-586 measured the previous offset over-stating buildable area on
//      31/65 real blocks by up to 65 %. Art. 350 makes that easy to repeat: a parcel shallower
//      than the band depth has a band tier covering 100 % of the plot beside a published 90 %
//      occupation cap from the same article, which is the exact contradiction
//      `BCN_22A_ENVELOPE_BLOCKER` refused to ship.

import { describe, it, expect } from 'vitest';
import type { Pt, ParcelEdgeClassification, GeometricRule, ZoningRecord } from '@pryzm/schemas';
import { principalTier, BuildableEnvelopeSchema } from '@pryzm/schemas';
import { computeBuildableEnvelope } from '../src/index.js';
import { ES_BARCELONA_INDUSTRIAL_PACK } from '../src/rulepacks/esBarcelonaIndustrial.js';

/**
 * A Cerdà-style 113 × 113 m block with streets on all four sides. Reused from the ADR-0271 suite
 * on purpose: the two constructions must be comparable on the SAME block, because the whole point
 * of `blockConcentricBand.ts` is that Art. 350.2.b and Art. 242.2 give DIFFERENT depths from
 * identical geometry, and a fixture shared with the Eixample suite is what makes that checkable.
 *
 * The exact answer is available in closed form here, which is why a square is the right unit
 * fixture: eroding a square by `d` on all four sides leaves `(113 − 2d)²`, and Art. 350.2.b wants
 * that to be 30 % of 113² ⇒ `113 − 2d = 113·√0.3` ⇒ **d ≈ 25.556 m**. Any drift in the solver
 * moves this number, and the number is checkable by hand from the article.
 */
const BLOCK: Pt[] = [
    { x: 0, z: 0 },
    { x: 113, z: 0 },
    { x: 113, z: 113 },
    { x: 0, z: 113 },
];
const BLOCK_ALL_FRONT: ParcelEdgeClassification[] = ['front', 'front', 'front', 'front'];
const EXPECTED_BAND_DEPTH_M = (113 - 113 * Math.sqrt(0.3)) / 2;

/** A deep parcel on the block's south frontage: 20 m wide, running the full 113 m to the far side. */
const DEEP_PARCEL: Pt[] = [
    { x: 40, z: 0 },
    { x: 60, z: 0 },
    { x: 60, z: 113 },
    { x: 40, z: 113 },
];
/** A shallow parcel: 20 × 15 m, entirely inside the band. The over-statement case. */
const SHALLOW_PARCEL: Pt[] = [
    { x: 40, z: 0 },
    { x: 60, z: 0 },
    { x: 60, z: 15 },
    { x: 40, z: 15 },
];
const WITH_FRONT: ParcelEdgeClassification[] = ['front', 'side', 'rear', 'side'];

/** The pack's own rule — never a hand-written copy, so a pack edit moves these tests. */
const RULE_22A = ES_BARCELONA_INDUSTRIAL_PACK.zones[0]!.geometricRule as GeometricRule;

/**
 * A 22a zoning record. `maxHeight_m` is passed through `structuredFields` because that is how the
 * Art. 350.2.c height reaches the engine in production: the pack ships `maxHeight_m: null` (the
 * table is a per-street CONSTRUCTION) and the resolved figure is attached by the caller. Passing
 * `null` models the honest refusal — no *amplada de vial*, or the Pla-Parcial regime unknown.
 */
function zoning22a(maxHeight_m: number | null): ZoningRecord {
    return {
        zoneCode: '22a',
        zoneLabel: 'Zona Industrial (clau 22a)',
        jurisdictionId: 'es-08019-barcelona',
        structuredFields: maxHeight_m === null ? {} : { maxHeight_m },
        overlays: [],
        ordinanceRef: null,
        provenance: {
            source: 'catastro-muc',
            label: 'test',
            version: 'test',
            license: null,
            crs: 'EPSG:4326',
        },
    } as ZoningRecord;
}

function solve(opts: {
    parcel?: Pt[];
    maxHeight_m?: number | null;
    blockRing?: Pt[] | null;
    blockEdgeClassifications?: ParcelEdgeClassification[] | null;
    edges?: ParcelEdgeClassification[];
    geometricRule?: GeometricRule | null;
} = {}) {
    return computeBuildableEnvelope({
        parcelRing: opts.parcel ?? DEEP_PARCEL,
        edgeClassifications: opts.edges ?? WITH_FRONT,
        zoning: zoning22a(opts.maxHeight_m === undefined ? 17 : opts.maxHeight_m),
        rulePack: ES_BARCELONA_INDUSTRIAL_PACK,
        geometricRule: opts.geometricRule === undefined ? RULE_22A : opts.geometricRule,
        blockRing: opts.blockRing === undefined ? BLOCK : opts.blockRing,
        blockEdgeClassifications:
            opts.blockEdgeClassifications === undefined
                ? BLOCK_ALL_FRONT
                : opts.blockEdgeClassifications,
    });
}

const areaOf = (r: ReadonlyArray<Pt>): number => {
    let a = 0;
    for (let i = 0; i < r.length; i++) {
        const p = r[i]!;
        const q = r[(i + 1) % r.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
};

describe('ADR-0273 — the two-tier solid is EXPRESSED and SOLVED', () => {
    it('produces exactly the two tiers Art. 350.2 describes', () => {
        const env = solve();
        expect(env.status).toBe('ok');
        expect(env.tiers.map((t) => t.id)).toEqual(['block-band', 'block-interior']);

        const band = env.tiers[0]!;
        const interior = env.tiers[1]!;
        // Art. 350.2.c inside the band…
        expect(band.maxHeight_m).toBe(17);
        // …Art. 350.2.e outside it: 5 m, ONE indivisible storey. The two heights coexisting on
        // one envelope IS the capability; before ADR-0273 one of them was necessarily discarded.
        expect(interior.maxHeight_m).toBe(5);
        expect(interior.maxFloors).toBe(1);
    });

    it('the tiers TILE the parcel — no sliver lost, no area double-counted', () => {
        // The clips share one inward normal and one Sutherland–Hodgman pass precisely so this
        // holds. If it ever fails, one tier has become the complement of the other and the
        // building would be modelled on the wrong half of the plot.
        const env = solve();
        const sum = env.tiers.reduce((n, t) => n + t.areaM2, 0);
        expect(sum).toBeCloseTo(areaOf(DEEP_PARCEL), 6);
        // …and the split is at the CONSTRUCTED depth, not at some default.
        expect(env.tiers[0]!.areaM2).toBeCloseTo(20 * EXPECTED_BAND_DEPTH_M, 4);
    });

    it('the band depth is the Art. 350.2.b EQUALITY, checkable by hand from the article', () => {
        const env = solve();
        const depth = env.derivation.find((d) => d.constraint === 'tier.bandDepth');
        expect(depth).toBeDefined();
        // (113 − 2d)² = 0.30 × 113²  ⇒  d = 25.556 m. A closed-form answer the article yields
        // directly, so this asserts the LAW, not the implementation's own output.
        expect(depth!.value as number).toBeCloseTo(EXPECTED_BAND_DEPTH_M, 4);
    });

    it('⚠ is NOT Art. 242.2’s depth — same block, different article, different number', () => {
        // THE ASSERTION THAT STOPS THE NEAR-MISS. `block-derived-alignment` with
        // `interiorFreeRatio: 0.3` looks like a drop-in for Art. 350.2.b and produces a
        // DIFFERENT depth, because Art. 242 clamps to [11, 30] and states a MINIMUM where
        // Art. 350 states an EQUALITY. On this block Art. 242 is cap-bound at 30 m; Art. 350.2.b
        // is 25.56 m. Publishing either under the other's citation is L-526.
        expect(EXPECTED_BAND_DEPTH_M).toBeLessThan(30);
        expect(EXPECTED_BAND_DEPTH_M).toBeGreaterThan(11);
        const env = solve();
        expect(env.derivation.some((d) => d.constraint === 'alignment.depth')).toBe(false);
        expect(env.derivation.some((d) => d.constraint === 'alignment.depthBinding')).toBe(false);
    });

    it('explains itself: the ratio, the constructed depth and the interior height are ROWS', () => {
        // C58 §1.3. A rule that shaped the envelope but appears only in free-text `caveats` is
        // invisible to the compliance report — the ADR-0270 P4 defect, one article over.
        const env = solve();
        const by = (c: string) => env.derivation.find((d) => d.constraint === c);
        expect(by('tier.bandAreaRatio')!.value).toBe(0.7);
        expect(by('tier.interiorHeight')!.value).toBe(5);
        expect(by('tier.bandDepth')).toBeDefined();
        // Read verbatim off p. 116 of the ordinance — never badged as PRYZM's guess.
        expect(by('tier.bandAreaRatio')!.fieldProvenance).toBe('ordinance-pdf');
        expect(by('tier.bandAreaRatio')!.ordinanceRef).toMatch(/Art\. 350\.2\.b/);
    });

    it('is byte-deterministic (C58 §1.1)', () => {
        // The band bisection has a FIXED iteration budget for exactly this reason.
        expect(JSON.stringify(solve())).toBe(JSON.stringify(solve()));
    });

    it('is winding-agnostic — a reversed block ring gives the same depth', () => {
        const depthOf = (e: ReturnType<typeof solve>) =>
            e.derivation.find((d) => d.constraint === 'tier.bandDepth')?.value as number;
        expect(depthOf(solve({ blockRing: [...BLOCK].reverse() }))).toBeCloseTo(depthOf(solve()), 6);
    });
});

describe('ADR-0273 — the LEGACY single-prism fields can never contradict the tiers', () => {
    it('mirror the PRINCIPAL tier, and the schema refuses an envelope where they do not', () => {
        const env = solve();
        const p = principalTier(env.tiers)!;
        expect(p.id).toBe('block-band');            // 17 m beats 5 m
        expect(env.maxHeight_m).toBe(p.maxHeight_m);
        expect(env.insetAreaM2).toBeCloseTo(p.areaM2, 9);
        expect(env.insetPolygon).toEqual(p.polygon);
        // The engine's output must survive its own schema — the refinement is the guarantee that
        // makes this change safe for every tier-unaware consumer.
        expect(() => BuildableEnvelopeSchema.parse(env)).not.toThrow();
    });

    it('⚠ REJECTS a hand-built envelope whose prism is not a tier (the migration hazard)', () => {
        const env = solve();
        expect(() =>
            BuildableEnvelopeSchema.parse({ ...env, maxHeight_m: 99 }),
        ).toThrow(/PRINCIPAL/);
    });

    it('when the tall tier’s height refuses, the 5 m tier becomes the principal one', () => {
        // Art. 350.2.c is gated on the *amplada de vial* AND on the Pla-Parcial regime, so the
        // band tier's HEIGHT can honestly refuse while its REGION is fully determined. Publishing
        // the zone-level null there would hide the 5 m the ordinance states outright; publishing
        // 17 m over the interior ring would over-state. The principal-tier rule resolves it.
        const env = solve({ maxHeight_m: null });
        expect(env.status).toBe('ok');
        expect(env.tiers[0]!.maxHeight_m).toBeNull();
        expect(env.maxHeight_m).toBe(5);
        expect(env.insetPolygon).toEqual(env.tiers[1]!.polygon);
        expect(() => BuildableEnvelopeSchema.parse(env)).not.toThrow();
    });
});

describe('ADR-0273 — ⚠ IT MUST NEVER OVER-STATE (C58 §1.4, the L-586 direction)', () => {
    it('the study volume honours the Art. 350.2.a occupation cap on a shallow parcel', () => {
        // THE CASE THE BLOCKER NAMED. A parcel wholly inside the band has a band tier covering
        // 100 % of the plot — beside a 90 % occupation cap read from the SAME article. Left
        // alone, `insetAreaM2 × maxHeight` publishes 111 % of the permitted volume.
        const env = solve({ parcel: SHALLOW_PARCEL });
        expect(env.status).toBe('ok');
        expect(env.tiers).toHaveLength(1);                    // no block-interior part
        const parcelArea = areaOf(SHALLOW_PARCEL);
        expect(env.insetAreaM2).toBeCloseTo(parcelArea, 6);   // the permitted REGION is the plot…
        expect(env.maxCoverage).toBe(0.9);
        // …but the VOLUME is capped at 90 % of it (ADR-0272 §3.2: coverage caps how much, not where)
        // — AND, since §NEVER-OVERSTATE-B (E2a, 2026-09-01), by the zone's own FAR when that binds
        // HARDER: this pin used to stop at the occupation cap (parcelArea × 0.9 × 17 = the
        // coverage-capped shell), which still over-stated what the declared edificabilitat permits.
        // The published volume is min(coverage-capped shell, footprint × farLimitedHeight_m).
        expect(env.maxVolumeM3!).toBeLessThanOrEqual(parcelArea * 0.9 * 17 + 1e-6);
        expect(env.farLimitedHeight_m).not.toBeNull();
        expect(env.maxVolumeM3).toBeCloseTo(
            Math.min(parcelArea * 0.9 * 17, env.insetAreaM2 * env.farLimitedHeight_m!),
            6,
        );
        expect(env.maxVolumeM3!).toBeLessThan(env.insetAreaM2 * 17);
    });

    it('every tier polygon lies inside the parcel, and their union is not larger than it', () => {
        for (const parcel of [DEEP_PARCEL, SHALLOW_PARCEL]) {
            const env = solve({ parcel });
            const sum = env.tiers.reduce((n, t) => n + t.areaM2, 0);
            // An erosion + two half-plane clips can only ever remove area. A sum ABOVE the parcel
            // means a fold escaped — the failure L-586 found on 31/65 real blocks, and the one
            // that is invisible to a "did it produce geometry?" check.
            expect(sum).toBeLessThanOrEqual(areaOf(parcel) + 1e-6);
        }
    });
});

describe('ADR-0273 — REFUSES rather than fabricating a tier boundary', () => {
    it('no block ring ⇒ NO envelope (never the un-tiered whole parcel)', () => {
        // The single most dangerous fallback available here: dropping to the un-tiered inset
        // publishes the WHOLE parcel at the TALL tier's height — a 100 % envelope beside the
        // zone's own 90 % cap, which is precisely what kept this pack unregistered.
        const env = solve({ blockRing: null, blockEdgeClassifications: null });
        expect(env.status).toBe('degenerate');
        expect(env.insetPolygon).toEqual([]);
        expect(env.tiers).toEqual([]);
        expect(env.caveats.join(' ')).toMatch(/franja concèntrica/);
    });

    it('a block with no identified street frontage ⇒ NO envelope', () => {
        // §BLOCK-DEPTH-REQUIRES-FRONTAGE, applied to Art. 350.2.b: with no alignments to be
        // concentric with, a naive search hands back a band covering the whole block — maximum
        // buildability from a construction that had no input.
        const env = solve({ blockEdgeClassifications: ['side', 'side', 'side', 'side'] });
        expect(env.status).toBe('degenerate');
        expect(env.tiers).toEqual([]);
    });

    it('a parcel with no `front` edge ⇒ NO envelope', () => {
        const env = solve({ edges: ['side', 'side', 'side', 'side'] });
        expect(env.status).toBe('degenerate');
        expect(env.tiers).toEqual([]);
        expect(env.caveats.join(' ')).toMatch(/no parcel edge is classified/);
    });

    it('mismatched block classifications ⇒ NO envelope (frontages unidentifiable)', () => {
        const env = solve({ blockEdgeClassifications: ['front', 'front'] });
        expect(env.status).toBe('degenerate');
        expect(env.tiers).toEqual([]);
    });
});
