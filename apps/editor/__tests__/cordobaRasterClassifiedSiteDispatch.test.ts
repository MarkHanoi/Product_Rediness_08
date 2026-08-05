// §COR-RASTER-ZONE — the L5 REACHABILITY + HONESTY-GATE test for the raster-classified zone-family
// capability (2026-08-05), one rung weaker than `cordobaTracedZoneSiteDispatch.test.ts`.
//
// The capability under test is the THIRD and weakest Córdoba zone-identity source:
//     coaco:ordenanzas WFS  >  PRYZM hand-trace  >  raster colour classification  >  refusal
//
// ⚠ THIS FILE NEVER MOCKS `@pryzm/site-parcel-data`, so every assertion below reads the REAL,
// committed, unsigned `CORDOBA_RASTER_CLASSIFIED_ZONES_VERIFIED === false` and the REAL (empty)
// committed record set. The gate-OPEN path lives in its own companion file for the module-hoisting
// reason `cordobaTracedZoneSiteDispatch.test.ts`'s footer documents at length.
//
// What this suite is FOR. The new branch was chained into `applyCordobaTracedZoneThenFallback`'s
// three "no traced answer" exits, so it now sits on the live code path for every Córdoba parcel
// outside the pilot. That makes "it changes nothing today" a claim about production behaviour, and
// it is pinned here rather than asserted by inspection.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SiteModelStore, siteCreate } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import {
    CORDOBA_RASTER_CLASSIFIED_ZONES_VERIFIED,
    CORDOBA_RASTER_SAFE_ZONE_FAMILIES,
    loadCordobaRasterClassifiedZoneRecords,
    isInCordoba,
    isInCordobaMunicipality,
} from '@pryzm/site-parcel-data';
import { dispatchParcelBoundary, getLastBuildableEnvelope } from '../src/ui/site/siteDispatch.js';

/**
 * Córdoba land outside BOTH the COACo pilot bbox and the single committed hand-traced polygon —
 * i.e. a point that falls all the way through to the raster-classified branch. This is the
 * population the capability exists for (≈92 % of the municipality).
 */
const OUTSIDE_PILOT = { lat: 37.92, lon: -4.72 };

const BOUNDARY = {
    polygon: [
        { x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: 40 }, { x: 0, z: 40 },
    ],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

function ctxFor(store: SiteModelStore) {
    const emitted: string[] = [];
    const rt = {
        events: { emit: (t: string) => { emitted.push(t); } },
    } as unknown as PryzmRuntime;
    return { ctx: { rt, store, projectId: 'proj-cordoba-raster', toast: () => {} }, emitted };
}

async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 4_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

/** Any unstubbed fetch is a hard failure — this path is entirely OFFLINE (no network). */
function failOnAnyFetch(): typeof globalThis.fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
        throw new TypeError(`unstubbed fetch in raster-classified test: ${String(input)}`);
    }) as unknown as typeof globalThis.fetch;
}

describe('§COR-RASTER-ZONE — routing premise', () => {
    it('the fixture point is OUTSIDE the COACo pilot bbox', () => {
        expect(isInCordoba(OUTSIDE_PILOT.lat, OUTSIDE_PILOT.lon)).toBe(false);
    });

    it('the fixture point is INSIDE the municipal bbox — so it reaches the Córdoba outside-pilot chain', () => {
        expect(isInCordobaMunicipality(OUTSIDE_PILOT.lat, OUTSIDE_PILOT.lon)).toBe(true);
    });
});

describe('§COR-RASTER-ZONE §HONESTY-GATE (production default, gate CLOSED)', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('CORDOBA_RASTER_CLASSIFIED_ZONES_VERIFIED is unsigned (false) in the real, unmocked package', () => {
        expect(CORDOBA_RASTER_CLASSIFIED_ZONES_VERIFIED).toBe(false);
    });

    it('the committed record set is EMPTY — no machine-derived record ships today', () => {
        expect(loadCordobaRasterClassifiedZoneRecords()).toEqual([]);
    });

    it('the safe set is closed to {MC, OA} — UAD is NOT emittable', () => {
        expect([...CORDOBA_RASTER_SAFE_ZONE_FAMILIES].sort()).toEqual(['MC', 'OA']);
        expect(CORDOBA_RASTER_SAFE_ZONE_FAMILIES as readonly string[]).not.toContain('UAD');
    });

    it('⚠ THE LOAD-BEARING ASSERTION — chaining this branch in is a NO-OP on production behaviour', async () => {
        // Wiring the raster branch into the traced branch's fall-throughs must not change what a
        // Córdoba-outside-pilot parcel renders today: the §L-663 estimate-suppression refusal, via
        // the registered municipal coverage. A rendered number here would be the exact fabrication
        // this capability's gate exists to prevent — and, uniquely for this path, a number is not
        // merely ungated but structurally unavailable (family ≠ subzone).
        globalThis.fetch = failOnAnyFetch();
        const store = new SiteModelStore();
        siteCreate(
            {
                projectId: 'proj-cordoba-raster',
                location: { latitude: OUTSIDE_PILOT.lat, longitude: OUTSIDE_PILOT.lon },
            },
            store,
        );
        const { ctx, emitted } = ctxFor(store);
        expect(
            dispatchParcelBoundary(ctx, {
                ...BOUNDARY,
                edgeClassifications: [...BOUNDARY.edgeClassifications],
            }),
        ).toBe(true);
        await waitForEvent(emitted, 'site.zoning-updated');

        const envelope: BuildableEnvelope | null = getLastBuildableEnvelope();
        expect(envelope).not.toBeNull();
        expect(envelope!.status).not.toBe('ok');
        expect(envelope!.refusal).toBeTruthy();
        // Not the raster path's own zone code — the gate is shut, so it never dispatched at all.
        expect(envelope!.zoneCode).not.toBe('MC');
        expect(envelope!.zoneCode).not.toBe('OA');

        // No PLANNING network call: the offline resolver is never even reached while the gate is
        // shut. Filtered exactly like the traced-zone suite's `planningCalls` — the best-effort
        // 3D-context prefetch rides along on any parcel commit and says nothing about zoning.
        const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as unknown as [string][];
        const planningCalls = calls
            .map(([u]) => String(u))
            .filter((u) => u.includes('catastro') || u.includes('coaco') || u.includes('coacordoba'));
        expect(planningCalls).toEqual([]);
    });
});
