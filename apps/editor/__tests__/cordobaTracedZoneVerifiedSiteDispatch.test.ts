// §COR-TRACED-ZONE — the gate-OPEN companion to `cordobaTracedZoneSiteDispatch.test.ts`.
//
// ⚠⚠ THIS FILE MOCKS `CORDOBA_TRACED_ZONES_VERIFIED` TO `true`. IT DOES **NOT** FLIP THE REAL,
// COMMITTED CONSTANT — `resolveCordobaTracedZone.ts`'s exported `CORDOBA_TRACED_ZONES_VERIFIED`
// stays `false` on disk; that flip is a founder/authorized-signer decision (see that constant's own
// header), never something a test may simulate as fact. `vi.mock` below is a TEST-LOCAL override of
// the binding this file's own module graph sees — it exists so the compute path behind the gate can
// be proven to actually work end-to-end, the same way `cordobaSiteDispatch.test.ts`'s §COR-COMPUTE
// suite proves the pilot's compute path against the ALREADY-SIGNED `CORDOBA_ENVELOPE_VERIFIED`. This
// capability is unsigned, so the only way to exercise that path today is the isolated mock below.
//
// Split into its own file (rather than a second `describe` block sharing
// `cordobaTracedZoneSiteDispatch.test.ts`) because Vitest hoists EVERY `vi.mock`/`vi.doMock` call in
// a file to its top, before any test runs, regardless of where in the file it is written — verified
// live during this suite's own authoring (a nested per-test `vi.doMock`/`vi.unmock` pair executed in
// the wrong order and silently mocked a test meant to see the real module). A top-level `vi.mock`
// scoped to its own file is the robust, Vitest-documented pattern; it cannot leak into any other
// test file, and `cordobaTracedZoneSiteDispatch.test.ts`'s own "the REAL committed constant" test
// proves the reverse (that file never mocks this package at all, and reads `false`).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@pryzm/site-parcel-data', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@pryzm/site-parcel-data')>();
    return { ...actual, CORDOBA_TRACED_ZONES_VERIFIED: true };
});

import { SiteModelStore, siteCreate } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import { CORDOBA_TRACED_ZONES_VERIFIED } from '@pryzm/site-parcel-data';
import { dispatchParcelBoundary, getLastBuildableEnvelope } from '../src/ui/site/siteDispatch.js';

/** Same PAS-2 interior point as the gate-off companion file — see that file's own derivation note. */
const PAS2_POINT = { lat: 37.9000309378604, lon: -4.751228404551405 };

/**
 * A point inside the SECOND traced record — the OA-1 block read off `CUS27W.jpg` on 2026-08-05
 * (Distrito Sureste, outside both the COACo pilot bbox and the six COACo-vectorised sheets). This is
 * the WGS84 position of the block's own printed subzone digit "1", not arithmetic on the stored ring.
 */
const OA1_POINT = { lat: 37.8864229, lon: -4.7529792 };

/** Same fixture as the gate-off companion file (LARGE_BOUNDARY-shaped, clears PAS-2's real setbacks). */
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
    return { ctx: { rt, store, projectId: 'proj-cordoba-traced-verified', toast: () => {} }, emitted };
}

async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 4_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

function failOnAnyFetch(): typeof globalThis.fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
        throw new TypeError(`unstubbed fetch in traced-zone (gate-open) test: ${String(input)}`);
    }) as unknown as typeof globalThis.fetch;
}

describe('§COR-TRACED-ZONE (gate mocked TRUE, this file only) — the full path renders a real envelope', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('this file\'s module graph sees the MOCKED gate as true (sanity check for the mock itself)', () => {
        expect(CORDOBA_TRACED_ZONES_VERIFIED).toBe(true);
    });

    it('a PAS-2-traced point computes a real, less-than-parcel envelope end-to-end', async () => {
        globalThis.fetch = failOnAnyFetch();
        const store = new SiteModelStore();
        siteCreate(
            {
                projectId: 'proj-cordoba-traced-verified',
                location: { latitude: PAS2_POINT.lat, longitude: PAS2_POINT.lon },
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
        expect(envelope!.status).toBe('ok');
        expect(envelope!.refusal).toBeFalsy();
        expect(envelope!.zoneCode).toBe('PAS-2');
        expect(envelope!.insetPolygon.length).toBeGreaterThan(0);
        expect(envelope!.insetAreaM2).toBeGreaterThan(0);
        // The gate opening does NOT promote the confidence tier — the pack's own machine-extracted
        // ceiling still applies (mirrors the pilot's identical L-665 `capEnvelopeConfidenceToPackDefault`
        // rule, proven in `cordobaSiteDispatch.test.ts`'s OA-1 §COR-COMPUTE test).
        expect(envelope!.confidence).toBe('pipeline-extracted-unverified');
        const site = store.getSite()!;
        expect(site.parcel.zoning.jurisdictionRef).toBe('coaco-pgou-traced');
        // No PLANNING network call — the traced-zone resolver is a committed offline extract, gate
        // open or not. Filtered like the gate-off companion file's own `planningCalls`: the
        // best-effort 3D-context prefetch (PMTiles / Overpass) rides along on any parcel commit.
        const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as unknown as [string][];
        const planningCalls = calls
            .map(([u]) => String(u))
            .filter((u) => u.includes('catastro') || u.includes('coaco') || u.includes('coacordoba') || u.includes('cordoba-traced'));
        expect(planningCalls).toEqual([]);
    });

    it('the CUS27W-traced OA-1 block also computes a real envelope end-to-end (Art. 13.6 numbers)',
        async () => {
            // §END-TO-END — the same proof shape as the PAS-2 case above, run against the second
            // committed record through the REAL, unmodified resolver → dispatcher →
            // computeBuildableEnvelope chain. Nothing but the data file changed to make this pass.
            globalThis.fetch = failOnAnyFetch();
            const store = new SiteModelStore();
            siteCreate(
                {
                    projectId: 'proj-cordoba-traced-verified',
                    location: { latitude: OA1_POINT.lat, longitude: OA1_POINT.lon },
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
            expect(envelope!.status).toBe('ok');
            expect(envelope!.refusal).toBeFalsy();
            expect(envelope!.zoneCode).toBe('OA-1');
            expect(envelope!.insetPolygon.length).toBeGreaterThan(0);
            expect(envelope!.insetAreaM2).toBeGreaterThan(0);
            // Less than the parcel — a real setback was actually applied (OA-1 Art. 13.6.3.3,
            // linderos privados ½·altura = 10,5 m), not a full-parcel fallback.
            expect(envelope!.insetAreaM2).toBeLessThan(40 * 40);
            expect(envelope!.confidence).toBe('pipeline-extracted-unverified');
            expect(store.getSite()!.parcel.zoning.jurisdictionRef).toBe('coaco-pgou-traced');
        });
});
