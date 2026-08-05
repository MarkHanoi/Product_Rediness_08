// §COR-RASTER-ZONE — the gate-OPEN companion to `cordobaRasterClassifiedSiteDispatch.test.ts`.
//
// ⚠⚠ THIS FILE MOCKS `CORDOBA_RASTER_CLASSIFIED_ZONES_VERIFIED` TO `true` AND INJECTS A CLASSIFIED
// RECORD. IT DOES **NOT** FLIP THE REAL, COMMITTED CONSTANT (still `false` on disk) NOR WRITE ANY
// RECORD TO `cordobaRasterClassifiedZones.json` (still `[]` on disk). The mock exists so the branch
// behind the gate can be proven to behave correctly BEFORE anyone is asked to sign it — and what
// "correctly" means here is unusual and worth stating up front:
//
//     THE ONLY CORRECT GATE-OPEN OUTCOME IS A BETTER-WORDED REFUSAL.
//
// Unlike the pilot's §COR-COMPUTE suite or the traced-zone gate-open companion — both of which prove
// a NUMBER renders once signed — this path must never produce one, at any gate setting. The CUS
// legend carries one colour per zone FAMILY; the SUBZONE, which is what selects the parameters, is
// not machine-recoverable. `ES_CORDOBA_PGOU2001_PACK` prices OA-1 at FAR 1.4 and OA-2 at 1.6, and
// leaves MC's footprint structurally unresolved in every subzone. So the assertions below are
// deliberately inverted: they check that a *correct, confident* classification still refuses, and
// that the refusal is strictly more informative than the generic one it replaces.

import { describe, it, expect, vi } from 'vitest';

vi.mock('@pryzm/site-parcel-data', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@pryzm/site-parcel-data')>();
    return {
        ...actual,
        CORDOBA_RASTER_CLASSIFIED_ZONES_VERIFIED: true,
        // A record shaped exactly like the offline batch job's output, with the evidence fields the
        // real pipeline measures. Values are taken from the feasibility study's own worked example
        // for refcat 3632807UG4933S (§4: a genuine Manzana Cerrada parcel, 503 classified pixels).
        resolveCordobaRasterClassifiedZone: async () => ({
            ok: true as const,
            resolution: {
                zoneFamily: 'MC' as const,
                refcat: '3632807UG4933S',
                ring: [
                    [-4.7204, 37.9196], [-4.7196, 37.9196], [-4.7196, 37.9204], [-4.7204, 37.9204],
                ] as ReadonlyArray<readonly [number, number]>,
                sourceSheet: 'CUS41W',
                classifiedDate: '2026-08-05',
                evidence: {
                    method: 'raster_colour_classification' as const,
                    sourceCrs: 'EPSG:23030' as const,
                    classifiedPixels: 503,
                    winningPixels: 376,
                    rejectedPixels: 261,
                    nearestLegendChebyshev: 12,
                    runnerUpFamily: null,
                    georefResidualPx: 3,
                    ocrZoneLabel: null,
                    subzoneResolved: false as const,
                    derived: true as const,
                    official: false as const,
                },
                provenance:
                    "PRYZM's OWN machine classification of a scanned Ayuntamiento de Córdoba " +
                    'PGOU-2001 CUS calificación sheet. NOT municipal data.',
            },
        }),
    };
});

import { SiteModelStore, siteCreate } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import { CORDOBA_RASTER_CLASSIFIED_ZONES_VERIFIED } from '@pryzm/site-parcel-data';
import { dispatchParcelBoundary, getLastBuildableEnvelope } from '../src/ui/site/siteDispatch.js';

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
    return { ctx: { rt, store, projectId: 'proj-cordoba-raster-verified', toast: () => {} }, emitted };
}

async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 4_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

async function runOnce(): Promise<BuildableEnvelope | null> {
    const store = new SiteModelStore();
    siteCreate(
        {
            projectId: 'proj-cordoba-raster-verified',
            location: { latitude: OUTSIDE_PILOT.lat, longitude: OUTSIDE_PILOT.lon },
        },
        store,
    );
    const { ctx, emitted } = ctxFor(store);
    dispatchParcelBoundary(ctx, {
        ...BOUNDARY,
        edgeClassifications: [...BOUNDARY.edgeClassifications],
    });
    await waitForEvent(emitted, 'site.zoning-updated');
    return getLastBuildableEnvelope();
}

describe('§COR-RASTER-ZONE gate OPEN — a confident, correct classification STILL refuses', () => {
    it('the mock is in force for this file only', () => {
        expect(CORDOBA_RASTER_CLASSIFIED_ZONES_VERIFIED).toBe(true);
    });

    it('⚠ dispatches a REFUSAL, never a computed envelope — family ≠ subzone', async () => {
        const envelope = await runOnce();
        expect(envelope).not.toBeNull();
        expect(envelope!.status).not.toBe('ok');
        expect(envelope!.refusal).toBeTruthy();
    });

    it('emits NO numeric envelope field and NO buildable ring', async () => {
        const envelope = await runOnce();
        expect(envelope!.maxHeight_m ?? null).toBeNull();
        expect(envelope!.maxFloors ?? null).toBeNull();
        expect(envelope!.buildableArea_m2 ?? null).toBeNull();
        expect(envelope!.buildableRing ?? null).toBeNull();
    });

    it('the refusal NAMES the family — the whole value this path delivers', async () => {
        const envelope = await runOnce();
        expect(envelope!.zoneCode).toBe('MC');
        expect(envelope!.refusal!.headline).toContain('Manzana Cerrada');
    });

    it('the refusal states plainly that the SUBZONE was not determined', async () => {
        const envelope = await runOnce();
        const facts = (envelope!.refusal!.knownFacts ?? []).join(' | ');
        expect(facts).toMatch(/SUBZONE: NOT determined/);
        expect(envelope!.refusal!.detail).toMatch(/subzone/i);
    });

    it('is never presented as legally grounded or as municipal data', async () => {
        const envelope = await runOnce();
        expect(envelope!.refusal!.legallyGrounded).toBe(false);
        const facts = (envelope!.refusal!.knownFacts ?? []).join(' | ');
        expect(facts).toMatch(/NOT a|not a municipal|machine/i);
    });

    it('cites the measured evidence — real counts and the ED50 source CRS, no invented confidence', async () => {
        const envelope = await runOnce();
        const facts = (envelope!.refusal!.knownFacts ?? []).join(' | ');
        expect(facts).toContain('376/503');
        expect(facts).toContain('EPSG:23030');
        expect(facts).toContain('CUS41W');
        expect(facts).toContain('3632807UG4933S');
        // No aggregate confidence float anywhere in the user-visible copy (§12.3: errors occur at
        // confidence 1.000 and gating is non-monotonic, so such a number would mislead).
        expect(facts).not.toMatch(/confidence[^a-z]/i);
    });
});
