// C58 §1.14.4 — `check-envelope-solid-never-overstates`. THE STRUCTURAL STOP that makes render-side
// over-statement IMPOSSIBLE rather than patched pack by pack (the L-616 seam; STRUCTURAL-SEAM-1).
//
// WHAT IT BINDS
// -------------
// `envelopeToMassing` is the ONLY path a `BuildableEnvelope` becomes a 3D solid. Because it is a pure
// total function that sees ONLY a `BuildableEnvelope`, an invariant proven over the envelope space
// holds for EVERY jurisdiction's output at once — no per-city test, no per-city escape. This file
// proves the three §1.14.4 invariants:
//
//   1. Σ volume(claimsVolume solids) ≤ the geometric cap the envelope grants.  (C58 §1.4)
//   2. `footprintIsUpperBound` ⇒ EVERY solid carries the provisional study style.  (§L-619)
//   3. `tiers.length > 1` ⇒ `solids.length > 1` — a multi-tier envelope is never one prism.  (§1.7b.4)
//
// THE CAP, AND WHY IT IS THE GEOMETRIC BOUND AND NOT `maxVolumeM3` VERBATIM
// ------------------------------------------------------------------------
// §1.14.4 writes the bound as `Σ volume ≤ (env.maxVolumeM3 ?? Σ tier.area × tier.height)`. For a
// SINGLE-prism envelope `maxVolumeM3 = insetArea × maxHeight`, so it IS the geometric bound and the
// test uses it directly. For a TIERED envelope it is NOT: the engine sets `maxVolumeM3` from the
// PRINCIPAL tier's area only (`insetAreaM2` mirrors the principal tier per the
// `BuildableEnvelope.ts:489–507` refinement) and further reduces it by the occupation cap — so it
// under-counts the drawn tiles. The bound the DRAWN solids must respect is therefore the tier-summed
// geometric volume `Σ tier.area × tier.height`, exactly the `??` right-hand side, which is why §1.14.4
// spells both out. This test uses the correct geometric bound per shape.
//
// COVERAGE
// --------
//   Part A — REAL envelopes solved through `computeBuildableEnvelope` for every STRUCTURAL CLASS a
//            registered pack can emit (single prism, FAR-limited + upper-bound, tiered, null-height).
//   Part B — an ENUMERATION TRIPWIRE over the shipping registry: the set of pack-bearing jurisdictions
//            is pinned, so registering a NEW pack fails this test until its class is acknowledged here
//            (§1.14.4 — "the test binds every pack"; no silent escape).
//   Part C — a deterministic FUZZ over the whole envelope space (single + FAR + upper-bound + tiered +
//            null-height + refused), proving the invariants hold for envelopes no current pack emits.

import { describe, it, expect } from 'vitest';
import type {
    GeometricRule,
    ParcelEdgeClassification,
    Pt,
    ZoningRecord,
    EnvelopeConfidence,
} from '@pryzm/schemas';
import {
    computeBuildableEnvelope,
    envelopeToMassing,
    massingSolidVolumeM3,
    totalMassingVolumeM3,
    listJurisdictionCoverage,
    BCN_JURISDICTION_ID,
    ESTIMATED_DEFAULT_PACK,
    estimatedDefaultZoningRecord,
    type BuildableEnvelopeMassingInput,
    type MassingSolid,
} from '../src/index.js';
import { ES_BARCELONA_INDUSTRIAL_PACK } from '../src/rulepacks/esBarcelonaIndustrial.js';
import { SA_RIYADH_JURISDICTION_ID } from '../src/rulepacks/saRiyadhDemo.js';
import { CORDOBA_JURISDICTION_ID } from '../src/rulepacks/esCordobaPGOU2001.js';
import { MADRID_JURISDICTION_ID } from '../src/rulepacks/esMadridNZ1.js';
import { MURCIA_JURISDICTION_ID } from '../src/rulepacks/esMurciaEnvelope.js';
import { TELDE_JURISDICTION_ID } from '../src/rulepacks/esCanariasSipu.js';

// ── Geometry + cap helpers ──────────────────────────────────────────────────────────────────────
function rect(x0: number, z0: number, x1: number, z1: number): Pt[] {
    return [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
}
function polyArea(ring: ReadonlyArray<Pt>): number {
    if (ring.length < 3) return 0;
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
}

/** The geometric volume the envelope GRANTS — the bound the drawn solids must never exceed. */
function geometricCapM3(env: BuildableEnvelopeMassingInput): number {
    const tiers = env.tiers ?? [];
    if (tiers.length > 0) {
        let c = 0;
        for (const t of tiers) {
            const area = t.areaM2 > 0 ? t.areaM2 : polyArea(t.polygon);
            c += area * Math.max(0, t.maxHeight_m ?? 0);
        }
        return c;
    }
    const area = env.insetAreaM2 && env.insetAreaM2 > 0 ? env.insetAreaM2 : polyArea(env.insetPolygon);
    if (typeof env.maxVolumeM3 === 'number') return env.maxVolumeM3;
    return area * Math.max(0, env.maxHeight_m ?? 0);
}

/** The three §1.14.4 invariants, asserted on one envelope's rendered solids. */
function assertNeverOverstates(env: BuildableEnvelopeMassingInput, label: string): MassingSolid[] {
    const solids = envelopeToMassing(env);
    const claimed = totalMassingVolumeM3(solids);
    const cap = geometricCapM3(env);
    // 1. Never overstate the granted volume (C58 §1.4). Relative + absolute epsilon for FP noise.
    expect(claimed, `${label}: Σ claimed volume ${claimed.toFixed(2)} exceeds cap ${cap.toFixed(2)}`)
        .toBeLessThanOrEqual(cap * (1 + 1e-9) + 1e-6);
    // A shell / footprint slab must never be counted as buildable volume.
    for (const s of solids) {
        if (!s.claimsVolume) {
            expect(massingSolidVolumeM3(s), `${label}: ${s.role} must claim no volume`).toBe(0);
        }
    }
    // 2. An upper-bound footprint is provisional on EVERY solid (§L-619).
    if (env.footprintIsUpperBound === true) {
        for (const s of solids) {
            expect(s.style.footprintUpperBound, `${label}: ${s.id} not marked upper-bound`).toBe(true);
            expect(s.style.hue, `${label}: ${s.id} must be provisional`).toBe('provisional');
            expect(s.style.complete).toBe(false);
        }
    }
    // 3. A multi-tier envelope is never one prism (§1.7b.4).
    if ((env.tiers?.length ?? 0) > 1) {
        expect(solids.length, `${label}: ${env.tiers!.length} tiers collapsed to ${solids.length} solid(s)`)
            .toBeGreaterThan(1);
    }
    return solids;
}

const UNCLASSIFIED: ParcelEdgeClassification[] = ['unclassified', 'unclassified', 'unclassified', 'unclassified'];

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('check-envelope-solid-never-overstates — PART A: every structural class a pack emits', () => {
    it('SINGLE PRISM (estimated default / 13a-like) never overstates and draws ≥ 1 solid', () => {
        const env = computeBuildableEnvelope({
            parcelRing: rect(0, 0, 30, 24),
            edgeClassifications: [...UNCLASSIFIED],
            zoning: estimatedDefaultZoningRecord(),
            rulePack: ESTIMATED_DEFAULT_PACK,
        });
        expect(env.status).toBe('ok');
        const solids = assertNeverOverstates(env, 'estimated-default');
        expect(solids.length).toBeGreaterThanOrEqual(1);
    });

    it('FAR-LIMITED + UPPER-BOUND (DK Plandata, no setbacks) — shell + FAR solid, all provisional', () => {
        const dk: ZoningRecord = {
            zoneCode: 'DK-LOKALPLAN',
            zoneLabel: 'Copenhagen lokalplan',
            jurisdictionId: 'dk',
            structuredFields: {
                maxHeight_m: 24,
                maxFloors: null,
                plotRatioFAR: 1.5,
                maxCoverage: null,
                setbacks: { front_m: null, side_m: null, rear_m: null },
                permittedUse: ['residential'],
            },
            overlays: [],
            ordinanceRef: 'https://dokument.plandata.dk/plan-123',
            provenance: {
                source: 'plandata-dk', label: 'Plandata.dk', version: '2026-07-26',
                license: 'Open public data', crs: 'EPSG:25832',
            },
        } as ZoningRecord;
        const env = computeBuildableEnvelope({
            parcelRing: rect(0, 0, 40, 28),
            edgeClassifications: [...UNCLASSIFIED],
            zoning: dk,
            rulePack: null,
        });
        expect(env.status).toBe('ok');
        expect(env.footprintIsUpperBound).toBe(true);
        expect(env.farLimitedHeight_m).not.toBeNull();
        expect(env.farLimitedHeight_m!).toBeLessThan(24);
        const solids = assertNeverOverstates(env, 'dk-upper-bound-far');
        // §L-616 — the FAR case draws a translucent height shell + an opaque FAR solid inside it.
        expect(solids.some((s) => s.role === 'height-shell')).toBe(true);
        expect(solids.some((s) => s.role === 'far-massing')).toBe(true);
        // The claimed volume is the FAR solid only — the shell is a boundary, not a claim.
        const far = solids.find((s) => s.role === 'far-massing')!;
        expect(totalMassingVolumeM3(solids)).toBeCloseTo(massingSolidVolumeM3(far), 6);
    });

    it('TIERED (22a Art. 350.2) — one solid per tier, > 1 solid, never overstates', () => {
        const BLOCK = rect(0, 0, 113, 113);
        const DEEP_PARCEL = rect(40, 0, 60, 113);
        const zoning22a: ZoningRecord = {
            zoneCode: '22a',
            zoneLabel: 'Zona Industrial (clau 22a)',
            jurisdictionId: BCN_JURISDICTION_ID,
            structuredFields: { maxHeight_m: 17 },
            overlays: [],
            ordinanceRef: null,
            provenance: { source: 'catastro-muc', label: 'test', version: 'test', license: null, crs: 'EPSG:4326' },
        } as ZoningRecord;
        const env = computeBuildableEnvelope({
            parcelRing: DEEP_PARCEL,
            edgeClassifications: ['front', 'side', 'rear', 'side'],
            zoning: zoning22a,
            rulePack: ES_BARCELONA_INDUSTRIAL_PACK,
            geometricRule: ES_BARCELONA_INDUSTRIAL_PACK.zones[0]!.geometricRule as GeometricRule,
            blockRing: BLOCK,
            blockEdgeClassifications: ['front', 'front', 'front', 'front'],
        });
        expect(env.status).toBe('ok');
        expect(env.tiers.length).toBeGreaterThan(1);
        const solids = assertNeverOverstates(env, '22a-tiered');
        expect(solids.length).toBe(env.tiers.length);
    });

    it('NULL HEIGHT (setbacks, no constructed height) — a flat footprint slab, zero volume claim', () => {
        const env: BuildableEnvelopeMassingInput = {
            insetPolygon: rect(0, 0, 20, 20),
            insetAreaM2: 400,
            maxHeight_m: null,
            status: 'ok',
            confidence: 'structured',
            tiers: [],
        };
        const solids = assertNeverOverstates(env, 'null-height');
        expect(solids).toHaveLength(1);
        expect(solids[0]!.role).toBe('footprint-slab');
        expect(solids[0]!.claimsVolume).toBe(false);
        expect(totalMassingVolumeM3(solids)).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('check-envelope-solid-never-overstates — PART B: the registry binds EVERY pack', () => {
    it('every pack-bearing jurisdiction is acknowledged (a new pack fails until its class is added)', () => {
        // The tripwire: a NEW registered pack changes this set, so whoever adds it must confirm the
        // structural class it emits is covered by Part A / Part C. §1.14.4 — the shared function is the
        // only render path and the test binds every pack; there is no silent escape.
        const packJurisdictions = listJurisdictionCoverage()
            .filter((j) => j.packZoneCodes.length > 0)
            .map((j) => j.jurisdictionId)
            .sort();
        // §MADRID-PGOUM97-WIRING (2026-08-01) — `es-28079-madrid` joined this set when
        // `ES_MADRID_PGOUM97_PACK` was registered. THE CLASSES IT EMITS, acknowledged as §1.14.4
        // requires:
        //   • SINGLE PRISM — NZ 5/7/8/9 are setback triples with a scalar `maxHeight_m` + FAR +
        //     ocupación. Covered by Part A's single-prism case and Part C's fuzz.
        //   • NULL HEIGHT — NZ 4's `maxHeight_m` is `null` (Art. 8.4.10 is a street-width table, not
        //     a scalar), so it draws the zero-volume footprint slab. Covered by Part A's null-height
        //     case. ⚠ NOT a new class: `alignment` changes the FOOTPRINT (a 12 m depth band off the
        //     official line), never the extrusion, and `envelopeToMassing` sees only the resulting
        //     `insetPolygon`.
        //   • NO TIERED CLASS — the pack contains no `tiers`-producing rule; the Art. 6.6.8.2 2:1
        //     cornisa cap and the 10 %-area top-storey allowances are explicitly NOT modelled.
        // ⚠ AND TODAY IT EMITS NONE OF THEM: `MADRID_ENVELOPE_VERIFIED` is false, so every Madrid
        // parcel receives a REFUSED envelope (`status: 'none'`), which Part C proves draws NOTHING.
        // Registration is not authorisation; this entry records the class review done in advance.
        //
        // §MURCIA-PACK-REGISTERED — Murcia joined the set on 2026-08-01. Structural classes its 14
        // zones emit: `alignment` (MC/MG/RM1/RM2/RD1 — the same class Córdoba's PAS/OA already bind,
        // Part A) and setback+FAR single prisms (RD/RF/RG/RH/RL/IC/IX/IG/AJ — Part A's single-prism
        // and FAR-limited cases). NO tiered and NO explicit-area rule is present, so no unacknowledged
        // class enters. ⚠ Acknowledged for completeness only: `MURCIA_ENVELOPE_VERIFIED` is false, so
        // no Murcia parcel reaches `envelopeToMassing` at all today.
        //
        // §TELDE-BBOX-PROVENANCE — Telde (INE 35026, Canarias) joined the set on 2026-08-02, when a
        // SOURCED municipal bbox finally made the SIPU adapter reachable. Structural classes its 17
        // zones emit, counted from `esTeldePgo2003.ts`: 9 × `setback` (Part A's single-prism and
        // FAR-limited cases) and 4 × `alignment` carrying a `buildableDepth` — the SAME class
        // Córdoba's PAS/OA and Murcia's MC/MG already bind, which is the whole reason no new
        // geometry engine was added for Canarias. NO `tiers` and NO explicit-area rule is present,
        // and NO zone declares `maxHeight_m: null` (grepped: 0 occurrences), so neither the tiered
        // class nor the null-height footprint-slab case enters unacknowledged.
        // ⚠ Acknowledged for completeness only: `CANARIAS_ENVELOPE_VERIFIED` is false, so no Telde
        // parcel reaches `envelopeToMassing` at all today — every one gets a cited refusal. Part C
        // proves a refused envelope (`status: 'none'`) draws NOTHING.
        const KNOWN = [
            BCN_JURISDICTION_ID,
            SA_RIYADH_JURISDICTION_ID,
            CORDOBA_JURISDICTION_ID,
            MADRID_JURISDICTION_ID,
            MURCIA_JURISDICTION_ID,
            TELDE_JURISDICTION_ID,
        ].sort();
        expect(packJurisdictions).toEqual(KNOWN);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('check-envelope-solid-never-overstates — PART C: fuzz the whole envelope space', () => {
    // Deterministic LCG (no RNG dependency; byte-identical across runs — the package forbids RNG).
    function lcg(seed: number): () => number {
        let s = seed >>> 0;
        return () => {
            s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            return s / 0x100000000;
        };
    }
    const CONFIDENCES: Array<EnvelopeConfidence | null> = [
        'authoritative', 'structured', 'block-constructed',
        'estimated-ruleset', 'pipeline-extracted-unverified', 'not-determined', null,
    ];

    it('single-prism / FAR / upper-bound / null-height — 400 synthetic envelopes never overstate', () => {
        const rnd = lcg(0xC58_014);
        for (let i = 0; i < 400; i++) {
            const w = 5 + rnd() * 60;
            const d = 5 + rnd() * 60;
            const ring = rect(0, 0, w, d);
            const area = w * d;
            const hasHeight = rnd() > 0.15;
            const maxHeight_m = hasHeight ? 3 + rnd() * 80 : null;
            const upper = rnd() > 0.6;
            // A FAR limit strictly below the height cap, some of the time.
            const farLimitedHeight_m =
                hasHeight && rnd() > 0.5 ? maxHeight_m! * (0.1 + rnd() * 0.8) : null;
            const env: BuildableEnvelopeMassingInput = {
                insetPolygon: ring,
                insetAreaM2: area,
                maxHeight_m,
                farLimitedHeight_m,
                maxVolumeM3: hasHeight ? area * maxHeight_m! : null,
                footprintIsUpperBound: upper,
                confidence: CONFIDENCES[Math.floor(rnd() * CONFIDENCES.length)]!,
                status: 'ok',
                tiers: [],
            };
            assertNeverOverstates(env, `fuzz-single-${i}`);
        }
    });

    it('tiered — 200 synthetic two-tier envelopes tile the plot and never overstate', () => {
        const rnd = lcg(0x350_02b);
        for (let i = 0; i < 200; i++) {
            const w = 8 + rnd() * 50;
            const depth = 10 + rnd() * 60;
            const split = depth * (0.2 + rnd() * 0.6); // band depth
            const band = rect(0, 0, w, split);
            const interior = rect(0, split, w, depth);
            const bandArea = w * split;
            const interiorArea = w * (depth - split);
            const bandH = 8 + rnd() * 40;
            const interiorH = rnd() > 0.2 ? 3 + rnd() * bandH : null; // sometimes a null-height tier
            // Principal = tallest (band, by construction bandH ≥ interiorH); legacy scalars mirror it.
            const env: BuildableEnvelopeMassingInput = {
                insetPolygon: band,
                insetAreaM2: bandArea,
                maxHeight_m: bandH,
                // Coverage-capped principal-only figure, as the engine emits it — deliberately BELOW
                // the tier-summed geometric volume, to prove the test uses the geometric cap.
                maxVolumeM3: bandArea * bandH,
                confidence: CONFIDENCES[Math.floor(rnd() * CONFIDENCES.length)]!,
                status: 'ok',
                tiers: [
                    { id: 'block-band', label: 'band', polygon: band, areaM2: bandArea, baseHeight_m: 0, maxHeight_m: bandH, maxFloors: null, ordinanceRef: null },
                    { id: 'block-interior', label: 'interior', polygon: interior, areaM2: interiorArea, baseHeight_m: 0, maxHeight_m: interiorH, maxFloors: null, ordinanceRef: null },
                ],
            };
            const solids = assertNeverOverstates(env, `fuzz-tier-${i}`);
            expect(solids.length).toBe(2);
        }
    });

    it('refused / degenerate / empty-ring envelopes draw NOTHING (§1.13.3)', () => {
        for (const status of ['degenerate', 'none', 'not-applicable'] as const) {
            expect(envelopeToMassing({ insetPolygon: rect(0, 0, 10, 10), maxHeight_m: 20, status })).toEqual([]);
        }
        // status ok but a degenerate ring is still nothing to draw.
        expect(envelopeToMassing({ insetPolygon: [{ x: 0, z: 0 }, { x: 1, z: 1 }], maxHeight_m: 20, status: 'ok' })).toEqual([]);
    });
});
