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

    it('falls back to window.runtime when no runtime argument is passed', () => {
        (globalThis as { window: { runtime?: unknown } }).window.runtime =
            runtimeWithParcel({ buildableRing: RING, maxHeight: 9 });
        const res = resolveRenderableBuildableEnvelope();
        expect(res!.ring).toEqual(RING);
        expect(res!.source).toBe('persisted');
    });

    // ⚠ THE HONESTY BOUNDARY (C58 §1.4). The persisted record is the RING ONLY. `confidence`,
    // `status` and the `derivation` trace are NOT persisted, so this resolver deliberately
    // returns a geometry-only shape: there is no field on it into which a caller could read a
    // provenance we did not re-derive. Fabricating one would present unverified data as a
    // determination — the exact failure this whole fix exists to prevent.
    it('exposes GEOMETRY ONLY — no confidence/status/derivation to fabricate', () => {
        const res = resolveRenderableBuildableEnvelope(
            runtimeWithParcel({ buildableRing: RING, maxHeight: 12 }) as never,
        )!;
        expect(Object.keys(res).sort()).toEqual(['maxHeightM', 'ring', 'source']);
        expect(res).not.toHaveProperty('confidence');
        expect(res).not.toHaveProperty('derivation');
        expect(res).not.toHaveProperty('status');
    });
});
