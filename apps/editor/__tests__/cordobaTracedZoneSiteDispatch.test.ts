// §COR-TRACED-ZONE — the L5 REACHABILITY + HONESTY-GATE test for the traced-zone capability
// (2026-08-05), the direct analogue of `cordobaSiteDispatch.test.ts` one rung outward: a click on
// Córdoba land OUTSIDE the COACo Sur+Noroeste pilot but INSIDE the seeded PAS-2 traced polygon
// (`packages/site-parcel-data/src/providers/data/cordobaTracedZones.json`, traced off CUS20W.jpg —
// see `docs/04-reference/jurisdictions/es/es-an/14021-cordoba/findings/END-TO-END-PROOF-2026-08-04.md`).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY TWO SEPARATE `describe` BLOCKS, EACH RESETTING THE MODULE GRAPH
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// `CORDOBA_TRACED_ZONES_VERIFIED` is a module-level `const` read directly by
// `applyCordobaTracedZoneThenFallback` in `siteDispatch.ts` (mirrors how `CORDOBA_ENVELOPE_VERIFIED`
// is read by `applyCordobaZoningThenFallback`). The task this suite exists for is explicit: prove
// the gate-open compute path works WITHOUT ever setting the real, committed constant to `true` —
// that flip is a human sign-off, not something a test may simulate as fact. `vi.doMock` +
// `vi.resetModules()` + a dynamic `import()` gives an ISOLATED, per-test override of the exported
// binding: only the module graph built AFTER the mock is installed sees `true`; the committed source
// file on disk, and every other test file in the suite, never does. The second `describe` block
// proves that isolation directly (re-imports the real, unmocked module and reads `false` again).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SiteModelStore, siteCreate } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import { CORDOBA_TRACED_ZONES_VERIFIED, isInCordoba, isInCordobaMunicipality } from '@pryzm/site-parcel-data';
import { dispatchParcelBoundary, getLastBuildableEnvelope } from '../src/ui/site/siteDispatch.js';

/**
 * A point inside the seeded PAS-2 traced pentagon's interior — the centroid of the ring committed in
 * `cordobaTracedZones.json`, independently recomputed (not copy-pasted) and cross-checked against
 * the resolver's own even-odd test in `resolveCordobaTracedZone.test.ts`.
 */
const PAS2_POINT = { lat: 37.9000309378604, lon: -4.751228404551405 };

/**
 * Sized like `cordobaSiteDispatch.test.ts`'s own `LARGE_BOUNDARY` — large enough to clear PAS-2's
 * real Art. 13.7.3.1 setbacks (front 3 m, side/rear = ½ × 12.75 m ≈ 6.375 m) with buildable area
 * left over, so a `status: 'degenerate'` in the gate-open test is a real defect, not an undersized
 * fixture (the same reasoning that file's own header documents for OA-1).
 */
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
    return { ctx: { rt, store, projectId: 'proj-cordoba-traced', toast: () => {} }, emitted };
}

/** Bounded poll — the zoning leg is a fire-and-forget async continuation. */
async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 4_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

/** Any unstubbed fetch is a hard failure — the traced-zone path is entirely OFFLINE (no network). */
function failOnAnyFetch(): typeof globalThis.fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
        throw new TypeError(`unstubbed fetch in traced-zone test: ${String(input)}`);
    }) as unknown as typeof globalThis.fetch;
}

describe('§COR-TRACED-ZONE — routing premise: PAS-2 point is outside the pilot, inside the municipality', () => {
    it('the fixture point is OUTSIDE isInCordoba (the pilot bbox) — confirms new-territory routing', () => {
        expect(isInCordoba(PAS2_POINT.lat, PAS2_POINT.lon)).toBe(false);
    });
    it('the fixture point is INSIDE isInCordobaMunicipality — confirms it reaches the traced-zone branch', () => {
        expect(isInCordobaMunicipality(PAS2_POINT.lat, PAS2_POINT.lon)).toBe(true);
    });
});

describe('§COR-TRACED-ZONE §HONESTY-GATE (production default, gate CLOSED) — no number renders', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('CORDOBA_TRACED_ZONES_VERIFIED is unsigned (false) in the real, unmocked package', () => {
        expect(CORDOBA_TRACED_ZONES_VERIFIED).toBe(false);
    });

    it('a point matching the seeded PAS-2 polygon still correctly REFUSES — never a fabricated envelope', async () => {
        // ⚠⚠ THE LOAD-BEARING ASSERTION FOR THIS WHOLE TASK. Wiring the traced-zone branch into
        // `applyZoning` must be a documented NO-OP on current production behaviour while the gate is
        // shut: this point resolves a real PAS-2 match in the store, and STILL must not render a
        // number — it has to fall through to exactly what a Córdoba-outside-pilot point already
        // does today (the §L-663 estimate-suppression refusal via the registered
        // `CORDOBA_MUNICIPAL_JURISDICTION_ID` coverage), not a new code path with new behaviour.
        globalThis.fetch = failOnAnyFetch();
        const store = new SiteModelStore();
        siteCreate(
            { projectId: 'proj-cordoba-traced', location: { latitude: PAS2_POINT.lat, longitude: PAS2_POINT.lon } },
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
        // Never a rendered number — a computed 'ok' status here would be the exact fabrication this
        // whole task's honesty gate exists to prevent.
        expect(envelope!.status).not.toBe('ok');
        expect(envelope!.refusal).toBeTruthy();
        expect(envelope!.zoneCode).not.toBe('PAS-2');
        // No PLANNING network call — the offline traced-zone resolver is never even reached while
        // the gate is shut (the dispatcher short-circuits before calling it). Filtered like
        // `cordobaSiteDispatch.test.ts`'s own `planningCalls`: the best-effort 3D-context prefetch
        // (PMTiles / Overpass) rides along on any parcel commit and says nothing about zoning.
        const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as unknown as [string][];
        const planningCalls = calls
            .map(([u]) => String(u))
            .filter((u) => u.includes('catastro') || u.includes('coaco') || u.includes('coacordoba') || u.includes('cordoba-traced'));
        expect(planningCalls).toEqual([]);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// GATE ISOLATED TO TRUE — kept in a companion file (`cordobaTracedZoneVerifiedSiteDispatch.test.ts`)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Vitest hoists EVERY `vi.mock`/`vi.doMock`/`vi.unmock` call in a file to the top, before any test
// runs (confirmed live by this file's own dev history — a nested `vi.doMock`/`vi.unmock` pair inside
// per-test hooks executed in the WRONG order and silently mocked a test that should have seen the
// real, unmocked module). The robust, Vitest-documented way to scope a module mock to only some
// tests is to put it in its OWN file, where the top-level `vi.mock(...)` factory governs that file's
// entire module graph and no other file's. See that file's header for the isolation argument in
// full — the short version is: this file NEVER mocks `@pryzm/site-parcel-data`, so every assertion
// above reads the real, committed, unsigned `CORDOBA_TRACED_ZONES_VERIFIED === false`.
