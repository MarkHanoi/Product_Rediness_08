// L-445 — `resolveRenderableBuildableEnvelope`: the render-path read that made the C58
// buildable envelope survive a reload / open-from-hub.
//
// THE DEFECT: every renderer read `getLastBuildableEnvelope()`, a MODULE GLOBAL written only
// inside the parcel-commit path. It survived view switches but NOT a page reload, so re-entering
// 3D Site on an existing project logged `envelope present=n, entities added=0` while the toggle
// still truthfully said "Envelope: ON" — the silent false negative C58 §1.4 forbids. The parcel
// BOUNDARY never had this bug because it reads the (persisted) siteModelStore; the envelope read
// RAM. Same view, two lifetimes.
//
// The fix reads back `Parcel.buildableRing` (ADR-0270 option A / C58 §1.7a) when this session
// has no solved envelope. These tests pin the PRECEDENCE and — just as important — the HONESTY
// boundary: geometry is rehydrated, provenance is NOT.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveRenderableBuildableEnvelope } from '../src/ui/site/siteDispatch';

const RING = [
    { x: 2, z: 2 },
    { x: 8, z: 2 },
    { x: 8, z: 6 },
    { x: 2, z: 6 },
];

/** A minimal stand-in for `runtime.siteModelStore` — only `getSite()` is read here. */
function runtimeWithParcel(parcel: unknown): unknown {
    return { siteModelStore: { getSite: () => ({ parcel }) } };
}

describe('L-445 resolveRenderableBuildableEnvelope — persisted-ring fallback', () => {
    beforeEach(() => {
        (globalThis as { window?: unknown }).window ??= {};
    });
    afterEach(() => {
        delete (globalThis as { window?: { runtime?: unknown } }).window?.runtime;
    });

    it('returns the PERSISTED ring when this session never solved an envelope', () => {
        const rt = runtimeWithParcel({ buildableRing: RING, maxHeight: 12 });
        const res = resolveRenderableBuildableEnvelope(rt as never);
        expect(res).not.toBeNull();
        expect(res!.ring).toEqual(RING);
        expect(res!.maxHeightM).toBe(12);
        // The DIAGNOSTIC that distinguishes the two lifetimes — this is the re-entry path.
        expect(res!.source).toBe('persisted');
    });

    it('carries a null maxHeight through rather than inventing one', () => {
        const rt = runtimeWithParcel({ buildableRing: RING, maxHeight: null });
        expect(resolveRenderableBuildableEnvelope(rt as never)!.maxHeightM).toBeNull();
    });

    it('returns null when no ring is persisted (no parcel / never solved)', () => {
        const rt = runtimeWithParcel({ buildableRing: null, maxHeight: null });
        expect(resolveRenderableBuildableEnvelope(rt as never)).toBeNull();
    });

    // A ring under 3 points cannot bound an area. Drawing it would put a degenerate sliver on
    // screen that still READS as a compliance constraint — worse than drawing nothing.
    it('rejects a degenerate ring of fewer than 3 points', () => {
        const rt = runtimeWithParcel({ buildableRing: [{ x: 0, z: 0 }, { x: 1, z: 1 }], maxHeight: 9 });
        expect(resolveRenderableBuildableEnvelope(rt as never)).toBeNull();
    });

    // This runs on a render path where "no site yet" is the NORMAL case, not an error — it must
    // not throw, and (unlike resolveSiteContext) must not toast.
    it('never throws when the runtime / store / site is absent', () => {
        expect(() => resolveRenderableBuildableEnvelope(null)).not.toThrow();
        expect(resolveRenderableBuildableEnvelope(null)).toBeNull();
        expect(resolveRenderableBuildableEnvelope({} as never)).toBeNull();
        expect(resolveRenderableBuildableEnvelope({ siteModelStore: { getSite: () => null } } as never))
            .toBeNull();
    });

    // ── Fallback 3: re-inset from PERSISTED setbacks ────────────────────────────────────
    // Fallback 2 only helps parcels committed AFTER the ring-persistence fix. Every project
    // committed BEFORE it has buildableRing === null forever, and nothing re-solves on load —
    // which is why the founder's existing Barcelona project STILL logged `present=n` with the
    // fix deployed. A fix that only helps new data is not a fix for a user who already has data.
    describe('re-inset fallback for parcels committed before ring persistence', () => {
        const SQUARE = [
            { x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 20 }, { x: 0, z: 20 },
        ];
        const parcelNoRing = (setbacks: unknown) => ({
            buildableRing: null,
            maxHeight: 12,
            setbacks,
            boundary: { polygon: SQUARE, edgeClassifications: ['front', 'side', 'rear', 'side'] },
        });

        it('re-insets from stored setbacks when no ring is persisted', () => {
            const res = resolveRenderableBuildableEnvelope(
                runtimeWithParcel(parcelNoRing({ front: 3, side: 1.5, rear: 3 })) as never,
            );
            expect(res).not.toBeNull();
            expect(res!.source).toBe('re-inset');
            expect(res!.ring.length).toBeGreaterThanOrEqual(3);
            expect(res!.maxHeightM).toBe(12);
            // Genuinely inset — strictly inside the parcel on every axis.
            const xs = res!.ring.map((p) => p.x), zs = res!.ring.map((p) => p.z);
            expect(Math.min(...xs)).toBeGreaterThan(0);
            expect(Math.max(...xs)).toBeLessThan(30);
            expect(Math.min(...zs)).toBeGreaterThan(0);
            expect(Math.max(...zs)).toBeLessThan(20);
        });

        // ⚠ THE §1.7a GUARD, and the reason this fallback is legal at all. The contract permits
        // re-insetting "only for `setback` zones and MUST NOT be used as a general path". An
        // alignment zone stores NULL setbacks, so requiring all three to be numbers IS that
        // condition — enforced by the type, not by a promise. If this ever passed, an
        // alignment-governed parcel would silently get a setback-shaped envelope: the exact
        // lossy coercion ADR-0270 rejected.
        it('REFUSES to re-inset an alignment zone (null setbacks) — C58 §1.7a', () => {
            expect(resolveRenderableBuildableEnvelope(
                runtimeWithParcel(parcelNoRing({ front: null, side: null, rear: null })) as never,
            )).toBeNull();
        });

        it('refuses when even ONE setback is null (partial data is not a setback zone)', () => {
            expect(resolveRenderableBuildableEnvelope(
                runtimeWithParcel(parcelNoRing({ front: 3, side: null, rear: 3 })) as never,
            )).toBeNull();
        });

        // ⭐ §ENVELOPE-ZERO-INSET-REFUSAL (L-1171) — THE FOUNDER'S GREY BOX, 2026-08-19.
        //
        // His log: `re-inset from the PERSISTED setbacks 0/0/0 m (11-pt ring)` → `maxHeight=n/a`
        // → `provisional grey` → a `footprint-slab@0.5m` covering his building. Read that back as
        // a CLAIM and it says "the buildable envelope here is the whole parcel, to its very edge,
        // and we cannot tell you a height" — the §L-616 overstatement in its purest form: an
        // UNKNOWN constraint drawn as ZERO.
        //
        // ⚠ THE OLD GUARD WAS SATISFIABLE BY A DEFAULT. It argued that all three being NUMBERS is
        // equivalent to "this is a setback zone", because an alignment zone stores its ring and
        // NULL setbacks. `0` is a number: a zero-FILLED record passes it exactly as a derived
        // `3/1.5/3` does. [[context-data-honesty-family]] — failure and empty are the same value.
        //
        // AND THE OUTPUT CARRIED NO INFORMATION EITHER WAY: `insetPolygonPerEdge` at 0/0/0 is the
        // IDENTITY, so the "buildable ring" IS `boundary.polygon`, vertex for vertex — a polygon
        // already drawn as the violet parcel ring on both surfaces. Zero new pixels, one new
        // false legal claim. Refusing costs the user nothing.
        it('REFUSES the ALL-ZERO re-inset — a 0/0/0 "envelope" is the parcel, not a constraint', () => {
            expect(resolveRenderableBuildableEnvelope(
                runtimeWithParcel(parcelNoRing({ front: 0, side: 0, rear: 0 })) as never,
            )).toBeNull();
        });

        // The refusal is narrow ON PURPOSE. A PARTIAL zero is still a derived triple — a zero
        // front setback with real side/rear is a real alignment-to-street rule, and its inset is
        // genuinely smaller than the parcel. Widening the refusal to "any zero" would delete real
        // envelopes, which is the opposite failure and the more damaging one.
        it('still re-insets when only SOME setbacks are zero (a real derived triple)', () => {
            const res = resolveRenderableBuildableEnvelope(
                runtimeWithParcel(parcelNoRing({ front: 0, side: 2, rear: 3 })) as never,
            );
            expect(res).not.toBeNull();
            expect(res!.source).toBe('re-inset');
            // The FRONT edge (z=0) is deliberately NOT moved — front=0 is the rule. What makes
            // this a real envelope rather than the identity is that the other edges DID move:
            // rear=3 pulls z=20 in to 17, side=2 pulls x=0/30 in to 2/28. The ring is strictly
            // smaller than the parcel, which is exactly what the all-zero case can never be.
            const zs = res!.ring.map((p) => p.z);
            const xs = res!.ring.map((p) => p.x);
            expect(Math.max(...zs)).toBeLessThan(20);
            expect(Math.min(...xs)).toBeGreaterThan(0);
            expect(Math.max(...xs)).toBeLessThan(30);
        });

        // A genuinely zero-setback jurisdiction (Barcelona alignment, the DK/Copenhagen §L-619
        // case) is UNAFFECTED: it persists its solved ring, so branch 2 answers long before the
        // re-inset branch is reached. This pins that the refusal cannot reach those cities.
        it('does NOT affect a zero-setback zone that persisted its ring (branch 2 wins)', () => {
            const res = resolveRenderableBuildableEnvelope(runtimeWithParcel({
                buildableRing: RING,
                maxHeight: 24,
                setbacks: { front: 0, side: 0, rear: 0 },
                boundary: { polygon: SQUARE, edgeClassifications: ['front', 'side', 'rear', 'side'] },
            }) as never)!;
            expect(res.source).toBe('persisted');
            expect(res.ring).toEqual(RING);
        });

        it('returns null when the re-inset is degenerate (setbacks eat the parcel)', () => {
            expect(resolveRenderableBuildableEnvelope(
                runtimeWithParcel(parcelNoRing({ front: 50, side: 50, rear: 50 })) as never,
            )).toBeNull();
        });

        // Precedence: a persisted ring is the TRUTH and must never be second-guessed by a
        // re-derivation, even though both are available here.
        it('prefers the PERSISTED ring over re-insetting when both are possible', () => {
            const rt = runtimeWithParcel({
                buildableRing: RING,
                maxHeight: 9,
                setbacks: { front: 3, side: 1.5, rear: 3 },
                boundary: { polygon: SQUARE, edgeClassifications: ['front', 'side', 'rear', 'side'] },
            });
            const res = resolveRenderableBuildableEnvelope(rt as never)!;
            expect(res.source).toBe('persisted');
            expect(res.ring).toEqual(RING);
        });
    });

    it('falls back to window.runtime when no runtime argument is passed', () => {
        (globalThis as { window: { runtime?: unknown } }).window.runtime =
            runtimeWithParcel({ buildableRing: RING, maxHeight: 9 });
        const res = resolveRenderableBuildableEnvelope();
        expect(res!.ring).toEqual(RING);
        expect(res!.source).toBe('persisted');
    });

    // ⚠ THE HONESTY BOUNDARY (C58 §1.4). The persisted record is the RING ONLY. `confidence` and
    // `status`/`derivation` are NOT persisted, so this resolver deliberately returns them as
    // explicit `null` (never a guessed/inherited value) — the honest "we did not re-derive this",
    // not an absent field. `farLimitedHeightM` joined the shape under the same rule (§L-616): the
    // FAR-realistic height is likewise not re-derivable from a persisted ring alone, so it too is
    // an explicit `null`, present uniformly across every `RenderableBuildableEnvelope` source tier
    // so a renderer can read it without branching on `source`. Fabricating a NON-null value in
    // either field would present unverified data as a determination — the exact failure this
    // whole fix exists to prevent; `null` is the fix, not a gap in it.
    it('exposes GEOMETRY as real values — confidence/status/derivation stay null, never fabricated', () => {
        const res = resolveRenderableBuildableEnvelope(
            runtimeWithParcel({ buildableRing: RING, maxHeight: 12 }) as never,
        )!;
        expect(Object.keys(res).sort()).toEqual([
            'confidence', 'farLimitedHeightM', 'maxHeightM', 'ring', 'source',
        ]);
        expect(res.confidence).toBeNull();
        expect(res.farLimitedHeightM).toBeNull();
        expect(res).not.toHaveProperty('derivation');
        expect(res).not.toHaveProperty('status');
    });
});
