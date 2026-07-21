// ADR-0271 P3 — the ENGINE-LEVEL integration test for block-derived *profunditat edificable*.
//
// The P1 unit tests proved the bisection solves Art. 242.2 in isolation. This proves the
// COMPOSITION: a `block-derived-alignment` zone driven through `computeBuildableEnvelope`
// yields a depth-limited envelope whose depth was CONSTRUCTED from the block, and — the part
// that actually matters — that every path which cannot construct it produces NO ENVELOPE
// rather than a plausible one.
//
// THE FAILURE THIS FILE EXISTS TO CATCH: silently falling back to `minDepth_m` when the block
// is missing. That would publish a depth the ordinance does not sanction for this block, while
// looking exactly like a computed result. It is the L-445 / C58 §1.4 shape of defect — a wrong
// answer is far worse than no answer here, because nothing downstream can tell them apart.

import { describe, it, expect } from 'vitest';
import type { Pt, ParcelEdgeClassification, GeometricRule } from '@pryzm/schemas';
import {
    computeBuildableEnvelope,
    estimatedDefaultZoningRecord,
    ESTIMATED_DEFAULT_PACK,
} from '../src/index.js';

/**
 * A Cerdà-style block: 113 × 113 m, streets on all four sides. Chosen because it is the real
 * Eixample module, and because the 30% interior-free construction has a non-trivial answer on
 * it (the cap does not simply bind).
 */
const BLOCK: Pt[] = [
    { x: 0, z: 0 },
    { x: 113, z: 0 },
    { x: 113, z: 113 },
    { x: 0, z: 113 },
];
const BLOCK_ALL_FRONT: ParcelEdgeClassification[] = ['front', 'front', 'front', 'front'];

/** A parcel on the block's south frontage: 20 m wide, full 113 m depth to the far side. */
const PARCEL: Pt[] = [
    { x: 40, z: 0 },
    { x: 60, z: 0 },
    { x: 60, z: 113 },
    { x: 40, z: 113 },
];
/** Edge 0 (z=0, the +x run) is the street; sides are party walls; edge 2 is the block interior. */
const WITH_FRONT: ParcelEdgeClassification[] = ['front', 'side', 'rear', 'side'];

const EIXAMPLE: GeometricRule = {
    kind: 'block-derived-alignment',
    alignTo: 'street',
    alignmentOffset_m: 0,
    sideTreatment: 'party-wall',
    interiorFreeRatio: 0.3,
    minDepth_m: 11,
    maxDepth_m: 30,
};

function solve(opts: {
    geometricRule?: GeometricRule | null;
    blockRing?: Pt[] | null;
    blockEdgeClassifications?: ParcelEdgeClassification[] | null;
    edges?: ParcelEdgeClassification[];
} = {}) {
    return computeBuildableEnvelope({
        parcelRing: PARCEL,
        edgeClassifications: opts.edges ?? WITH_FRONT,
        zoning: estimatedDefaultZoningRecord(),
        rulePack: ESTIMATED_DEFAULT_PACK,
        geometricRule: opts.geometricRule === undefined ? EIXAMPLE : opts.geometricRule,
        blockRing: opts.blockRing === undefined ? BLOCK : opts.blockRing,
        blockEdgeClassifications:
            opts.blockEdgeClassifications === undefined ? BLOCK_ALL_FRONT : opts.blockEdgeClassifications,
    });
}

describe('ADR-0271 P3 — the depth is CONSTRUCTED from the block, end to end', () => {
    it('produces a depth-limited envelope, NOT the whole parcel', () => {
        const env = solve();
        expect(env.insetPolygon.length).toBeGreaterThanOrEqual(3);

        // The parcel is 113 m deep. A correct Art. 242 construction caps the buildable strip
        // at <= 30 m, so the envelope must be a small fraction of the plot. If this ever
        // approaches the full parcel area, the depth clip silently stopped applying — which is
        // the exact defect that looks perfectly fine on screen.
        const parcelArea = 20 * 113;
        expect(env.insetAreaM2).toBeLessThan(parcelArea * 0.35);
        expect(env.insetAreaM2).toBeGreaterThan(0);
    });

    it('records the depth AND which rule bound it — different legal statements (C58 §1.3)', () => {
        const env = solve();
        const depth = env.derivation.find((d) => d.constraint === 'alignment.depth');
        const binding = env.derivation.find((d) => d.constraint === 'alignment.depthBinding');

        expect(depth).toBeDefined();
        expect(typeof depth!.value).toBe('number');
        // Must sit inside the ordinance band; outside it the construction is not Art. 242.
        expect(depth!.value as number).toBeGreaterThanOrEqual(11);
        expect(depth!.value as number).toBeLessThanOrEqual(30);

        // The binding is what lets the report say WHICH article did the work. Without it a
        // constructed depth is indistinguishable from a stated one.
        expect(binding).toBeDefined();
        expect(['interior-ratio', 'max-cap', 'min-floor']).toContain(binding!.value);
    });

    it('is byte-deterministic — same inputs, identical envelope (C58 §1.1)', () => {
        // The bisection has a FIXED iteration budget precisely so this holds. A tolerance-based
        // loop would make the last bit input-sensitive and this test is what would catch it.
        expect(JSON.stringify(solve())).toBe(JSON.stringify(solve()));
    });

    it('is winding-agnostic — a reversed block ring gives the same depth', () => {
        const reversed = [...BLOCK].reverse();
        const a = solve();
        const b = solve({ blockRing: reversed });
        const depthOf = (e: ReturnType<typeof solve>) =>
            e.derivation.find((d) => d.constraint === 'alignment.depth')?.value;
        expect(depthOf(b)).toBeCloseTo(depthOf(a) as number, 9);
    });
});

describe('ADR-0271 P3 — REFUSES to answer rather than fabricating a depth', () => {
    it('NO block ring → no envelope, and it says why. NEVER falls back to the 11 m floor', () => {
        // THE CENTRAL TEST OF THIS FILE. `minDepth_m` is an ordinance BOUND on the construction,
        // not a default answer. Returning it here would publish a depth Art. 242 does not
        // sanction for this block while looking computed.
        const env = solve({ blockRing: null, blockEdgeClassifications: null });

        expect(env.insetPolygon).toEqual([]);
        expect(env.insetAreaM2).toBe(0);
        expect(env.caveats.join(' ')).toMatch(/no block ring|function of the block/i);

        // Specifically: no depth row was emitted at all. A row reading "11 m" would be read by
        // a user as the ordinance's answer for this plot.
        expect(env.derivation.find((d) => d.constraint === 'alignment.depth')).toBeUndefined();
    });

    it('mismatched blockEdgeClassifications length → no envelope', () => {
        // A misaligned array silently mis-identifies which edges are frontages, producing a
        // plausible depth measured from the wrong sides — worse than an obvious failure.
        const env = solve({ blockEdgeClassifications: ['front', 'front'] });
        expect(env.insetPolygon).toEqual([]);
        expect(env.caveats.join(' ')).toMatch(/does not match/i);
    });

    it('block with NO street frontage → no envelope (nothing to measure the depth from)', () => {
        const env = solve({
            blockEdgeClassifications: ['side', 'side', 'side', 'side'],
        });
        expect(env.insetPolygon).toEqual([]);
        expect(env.insetAreaM2).toBe(0);
    });

    it('parcel with no `front` edge → no envelope, even though the block solved fine', () => {
        // The block gives a depth, but without a parcel alineación there is nowhere to apply
        // it from. Skipping the clip would return the FULL 113 m-deep ring.
        const env = solve({ edges: ['unclassified', 'unclassified', 'unclassified', 'unclassified'] });
        expect(env.insetPolygon).toEqual([]);
    });
});

describe('ADR-0271 P3 — the other rule kinds are untouched', () => {
    it('a scalar `alignment` zone still solves, and emits NO binding row', () => {
        // The binding is meaningful only for a constructed depth. Emitting it for a stated one
        // would imply a derivation that never happened.
        const env = solve({
            geometricRule: {
                kind: 'alignment',
                alignTo: 'street',
                buildableDepth_m: 12,
                alignmentOffset_m: 0,
                sideTreatment: 'party-wall',
            },
        });
        expect(env.insetPolygon.length).toBeGreaterThanOrEqual(3);
        expect(env.derivation.find((d) => d.constraint === 'alignment.depth')?.value).toBe(12);
        expect(env.derivation.find((d) => d.constraint === 'alignment.depthBinding')).toBeUndefined();
    });

    it('passing a block ring to a plain setback zone changes nothing', () => {
        // Additive-input discipline: an unused optional input must not perturb a shipped path.
        const withBlock = solve({ geometricRule: null });
        const withoutBlock = computeBuildableEnvelope({
            parcelRing: PARCEL,
            edgeClassifications: WITH_FRONT,
            zoning: estimatedDefaultZoningRecord(),
            rulePack: ESTIMATED_DEFAULT_PACK,
            geometricRule: null,
        });
        expect(withBlock.insetAreaM2).toBeCloseTo(withoutBlock.insetAreaM2, 9);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §L-572 — the CONFIDENCE TIER is a property of the determination, not of a UI path.
//
// This block existed nowhere before. The `block-constructed` tier was assigned in L5
// (`siteDispatch.ts`) by re-scanning `derivation` for the `alignment.depthBinding` row, so it
// was untested AND unreachable by any second consumer: a per-parcel report, an export or an API
// calling `computeBuildableEnvelope` directly received `estimated-ruleset` on real, cited,
// constructed data. These tests pin the tier at the engine so that cannot regress.
// ─────────────────────────────────────────────────────────────────────────────
describe('§L-572 — the engine stamps `block-constructed` itself (C58 §1.2)', () => {
    const ESTIMATED_CAVEAT = 'Estimated envelope';

    it('a depth CONSTRUCTED from the block is labelled `block-constructed`, not estimated', () => {
        const env = solve();
        expect(env.status).toBe('ok');
        expect(env.confidence).toBe('block-constructed');
    });

    it('and does NOT also carry the "Estimated envelope" caveat — the label and the prose must agree', () => {
        // THE LATENT CONTRADICTION THIS CLOSES: the caveat is pushed when the tier is still
        // `estimated-ruleset`. While the upgrade happened downstream in the editor, a constructed
        // Barcelona envelope shipped with a badge reading "Real · constructed" and a caveat
        // reading "Estimated envelope — verify against the governing ordinance". It never reached
        // a user only because `caveats` is currently consumed by nothing but a console.log — it
        // was invisible, not absent, and would have surfaced the moment caveats are rendered.
        const env = solve();
        expect(env.caveats.some((c) => c.includes(ESTIMATED_CAVEAT))).toBe(false);
    });

    it('a REFUSED block-derived solve is never labelled constructed', () => {
        // The tier must track the determination, not the zone type. No block ring ⇒ no
        // construction happened ⇒ claiming "constructed" would be the exact over-claim the
        // C58 §1.4 refusal paths exist to prevent.
        const env = solve({ blockRing: null });
        expect(env.status).not.toBe('ok');
        expect(env.confidence).not.toBe('block-constructed');
    });

    it('a plain setback zone stays `estimated-ruleset` AND keeps its caveat', () => {
        // The other direction: the upgrade must not leak onto envelopes that genuinely are
        // estimates. This is what stops §L-572 from quietly promoting the whole product.
        const env = solve({ geometricRule: null });
        expect(env.confidence).toBe('estimated-ruleset');
        expect(env.caveats.some((c) => c.includes(ESTIMATED_CAVEAT))).toBe(true);
    });

    it('a STATED-depth alignment zone is not "constructed" — nothing was constructed', () => {
        // `kind: 'alignment'` reads the depth straight off the rule, so no `depthBinding` row is
        // emitted and the tier must stay estimated. This is the distinction the binding row was
        // introduced to make (C58 §1.3), now load-bearing for the honesty label too.
        const env = solve({
            geometricRule: {
                kind: 'alignment',
                alignTo: 'street',
                buildableDepth_m: 12,
                alignmentOffset_m: 0,
                sideTreatment: 'party-wall',
            },
        });
        expect(env.status).toBe('ok');
        expect(env.confidence).toBe('estimated-ruleset');
    });
});
