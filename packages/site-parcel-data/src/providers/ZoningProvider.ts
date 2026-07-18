// C58 §3.1 — the provider-agnostic `ZoningProvider` interface (L2).
//
// Each jurisdiction implements this once. All network access goes through the
// C57 same-origin server proxy (never browser → gov endpoint directly), so no
// CSP `connect-src` change is needed. The interface is POINT-based (the parcel's
// representative WGS84 point) — mirroring the shipped C57 `ParcelProvider.
// fetchParcelAtPoint` precedent (apps/editor/.../parcel/ParcelProvider.ts) —
// because the zoning proxies key on a point-in-plan-polygon query and the
// parcel ring here lives in scene-XZ, not WGS84.
//
// The adapter is the ONE impure seam (fetch); the field mapping it performs is a
// pure, unit-tested function (e.g. `mapPlandataToZoningRecord`). `fetchZoningAtPoint`
// MUST never throw — a miss / upstream failure returns `null`, and the caller
// falls back to the estimated default (C58 §1.2 fidelity 3 graceful degradation).

import type { ZoningRecord } from '@pryzm/schemas';

/** Injectable dependencies so an adapter is unit-testable without the network. */
export interface ZoningProviderDeps {
    /** Override `globalThis.fetch` (tests inject a fake). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy path base (default per adapter). */
    readonly pathBase?: string;
    /** ISO fetch date (tests pin it; production uses the wall clock). */
    readonly nowISO?: string;
}

export interface ZoningProvider {
    /** Stable provider id / provenance tag (e.g. `'plandata-dk'`). */
    readonly id: string;
    /** Human-facing source label for the facts card / attribution (C57 §1.9). */
    readonly label: string;
    /**
     * Resolve the structured zoning at a WGS84 point, or `null` when there is no
     * plan there / the source is unavailable. MUST never throw.
     */
    fetchZoningAtPoint(
        lat: number,
        lon: number,
        deps?: ZoningProviderDeps,
    ): Promise<ZoningRecord | null>;
}
