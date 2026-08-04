// §TELDE-ENVELOPE — the L5 REACHABILITY + HONESTY-GATE test: what does a real click on a real
// Telde parcel actually put on screen today?
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS TEST EXISTS
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// `ES_TELDE_PGO2003_PACK` is REGISTERED in `rulepacks/registry.ts` with a non-empty `packsByZone`
// (31 packed EDIF zones), and until 2026-08-03 NOTHING in `siteDispatch.ts` referenced
// `isInTelde` / `TELDE_JURISDICTION_ID` / `applyTeldeZoningThenFallback` — VERIFICATION.md §6
// records that a Telde click reached only the generic §L-663 chokepoint
// (`refuseEstimateInsideRegisteredJurisdiction`), which suppresses the estimated triple but never
// names a Telde zone or reads an EDIF row. This suite is the direct analogue of
// `zaragozaSiteDispatch.test.ts`: the real `dispatchParcelBoundary`, a real `SiteModelStore`, a
// site on real Telde land — nothing stubbed. Remove the `isInTelde` branch from `applyZoning` and
// the first test fails, because a Telde plot would then fall through to the ESTIMATED front/side/
// rear default, precisely the fabrication the gate exists to prevent.
//
// ⭐ 2026-08-04 — NO FETCH STUB. `resolveTeldeZone` was rewritten onto the El Sauzal offline-
// shapefile pattern: it point-in-polygon joins against a COMMITTED extract of the real
// `EDIF.shp`/`EDIF.dbf` pair (`data/teldeEdif.json`, 2 643 records), not a network call. So the
// fixture points below are REAL WGS84 coordinates, independently derived by numerically inverting
// the resolver's own `wgs84ToUtm28N` projection against each zone's real polygon centroid from the
// committed data (see the session's extraction notes) — not synthetic geometry. A click at these
// exact coordinates in production resolves to exactly the zone code each test names.

import { describe, it, expect } from 'vitest';
import { SiteModelStore, siteCreate } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import {
    CANARIAS_ENVELOPE_VERIFIED,
    isInTelde,
    TELDE_BBOX,
    TELDE_PGO2003_ZONE_CODES,
    TELDE_UNPACKED_ZONES,
    registeredPackZoneCodes,
    TELDE_JURISDICTION_ID,
} from '@pryzm/site-parcel-data';
import {
    dispatchParcelBoundary,
    getLastBuildableEnvelope,
} from '../src/ui/site/siteDispatch.js';

/**
 * A real point inside Telde's término municipal (well within `TELDE_BBOX`, asserted below) —
 * `teldeRouting.test.ts` resolves the same municipality independently from a Catastro OVC probe,
 * this file only needs a point safely inside the box, not a specific parcel identity. This point
 * sits inside a real `E` (packed) EDIF polygon in the committed offline extract.
 */
const PARCEL = {
    lat: 28.01478338454933,
    lon: -15.382309021079934,
} as const;

/**
 * Real WGS84 points, each independently verified (this session) to fall inside a specific real
 * EDIF polygon in the committed `teldeEdif.json` extract, by numerically inverting
 * `wgs84ToUtm28N` against that polygon's own vertex centroid and re-running the SAME forward-
 * projection + even-odd point-in-polygon test the shipped resolver uses.
 */
const REAL_ZONE_POINTS = {
    /** Packed zone `E` — Ciudad jardín, unifamiliar aislada (Art. 229). */
    E: { lat: 28.01478338454933, lon: -15.382309021079934 },
    /** Unpacked, graphed zone `D1` — `DispObl = GRF`. */
    D1: { lat: 27.997386367147705, lon: -15.410879878830968 },
    /** Unpacked zone `INDEF` — "Indefinida". */
    INDEF: { lat: 28.028548910374724, lon: -15.415081646617685 },
    /** Outside every committed EDIF polygon (well outside the extract's own bounding box). */
    OUTSIDE: { lat: 27.922847492182665, lon: -15.534930886011523 },
} as const;

/** A small plot ring in scene metres — the shape a draw/select commits. */
const BOUNDARY = {
    polygon: [
        { x: 0, z: 0 }, { x: 15, z: 0 }, { x: 15, z: 20 }, { x: 0, z: 20 },
    ],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

function ctxFor(store: SiteModelStore) {
    const emitted: string[] = [];
    const rt = {
        events: { emit: (t: string) => { emitted.push(t); } },
    } as unknown as PryzmRuntime;
    return { ctx: { rt, store, projectId: 'proj-telde', toast: () => {} }, emitted };
}

/** Bounded poll — the zoning leg is a fire-and-forget async continuation. */
async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 4_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

async function dispatchTelde(
    point: { readonly lat: number; readonly lon: number } = PARCEL,
): Promise<{
    store: SiteModelStore;
    envelope: BuildableEnvelope | null;
}> {
    const store = new SiteModelStore();
    siteCreate(
        { projectId: 'proj-telde', location: { latitude: point.lat, longitude: point.lon } },
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
    return { store, envelope: getLastBuildableEnvelope() };
}

describe('§TELDE-ENVELOPE — a click on a Telde parcel reaches the Telde code', () => {
    it('the fixture point really is inside the shipping Telde bbox extent (the routing premise)', () => {
        expect(isInTelde(PARCEL.lat, PARCEL.lon)).toBe(true);
        expect(PARCEL.lat).toBeGreaterThanOrEqual(TELDE_BBOX.minLat);
        expect(PARCEL.lat).toBeLessThanOrEqual(TELDE_BBOX.maxLat);
        expect(PARCEL.lon).toBeGreaterThanOrEqual(TELDE_BBOX.minLon);
        expect(PARCEL.lon).toBeLessThanOrEqual(TELDE_BBOX.maxLon);
    });

    it('ROUTES to the Telde branch — NOT to the estimated front/side/rear default', async () => {
        // ⚠ THE REACHABILITY ASSERTION. If the `isInTelde` branch is removed from `applyZoning`,
        // this Canarian plot falls through to `applyEstimatedZoning`, which produces a REAL
        // envelope with setbacks and a height — `status: 'ok'`, no refusal. Both assertions below
        // then fail. The jurisdiction ref is the second half of the same proof: `sipu-telde-edif`
        // is written by no other branch.
        const { store, envelope } = await dispatchTelde();
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
        expect(store.getSite()!.parcel.zoning.jurisdictionRef).toBe('sipu-telde-edif');
    });

    it('the pack is REGISTERED-AND-REFUSING (unlike Zaragoza): populated packsByZone, gate still shut', () => {
        // ⚠ ⛔ THIS PINS THE GATE, NOT A FIXED PACK STATE. `CANARIAS_ENVELOPE_VERIFIED` is `false`
        // in this repository (L-449, `esCanariasSipu.ts`) — a founder act, never a model flip
        // (L-449/L-677).
        //
        // ⚠ TELDE'S REGISTRATION SHAPE DIFFERS FROM ZARAGOZA'S ON PURPOSE (`registry.ts`, "⚠
        // REGISTERED-AND-REFUSING, like Córdoba"): `packsByZone` is POPULATED unconditionally (SIPU
        // publishes real numbers as named columns), not gated behind `CANARIAS_ENVELOPE_VERIFIED`
        // the way Zaragoza's registration is behind `ZARAGOZA_ENVELOPE_VERIFIED`. What gates Telde
        // is the DISPATCHER refusing to compute from it, not the registry withholding the codes —
        // `applyTeldeZoningThenFallback` reads the SAME `CANARIAS_ENVELOPE_VERIFIED` constant this
        // test pins, so the two assertions drift together rather than duplicating a boolean that
        // could disagree.
        expect(CANARIAS_ENVELOPE_VERIFIED).toBe(false);
        expect(registeredPackZoneCodes(TELDE_JURISDICTION_ID)).toEqual(
            expect.arrayContaining([...TELDE_PGO2003_ZONE_CODES]),
        );
        expect(registeredPackZoneCodes(TELDE_JURISDICTION_ID)).toHaveLength(
            TELDE_PGO2003_ZONE_CODES.length,
        );
    });
});

describe('§TELDE-ENVELOPE §HONESTY-GATE — a resolved zone never renders a number while the gate is shut', () => {
    it('a PACKED zone (E) resolves but dispatches a cited no-signed-rule refusal naming it, never a number', async () => {
        // Zone E — Ciudad jardín, edificación residencial unifamiliar aislada. One of the 31
        // packed zones (`esTeldePgo2003.ts`, SETBACK grammar). `REAL_ZONE_POINTS.E` is a real
        // WGS84 point independently verified to sit inside a real `E` EDIF polygon.
        expect(TELDE_PGO2003_ZONE_CODES).toContain('E');
        const { envelope } = await dispatchTelde(REAL_ZONE_POINTS.E);
        const r = envelope!.refusal!;
        // ⚠ `legallyGrounded: false` and it must stay false. PGO Telde Art. 229 DOES set an
        // envelope for zone E — what is missing is PRYZM's signed transcription, not the law.
        // Claiming `true` would attribute PRYZM's own unsigned state to Canarian planning law.
        expect(r.legallyGrounded).toBe(false);
        const prose = `${r.headline} ${r.detail}`.toLowerCase();
        expect(prose).toMatch(/telde|canarias/);
        // The resolved zone must be NAMED in the refusal, not silently dropped (honesty property 3
        // on `resolveTeldeZone` / the §TELDE-ZONE resolve in the dispatcher) — a GENERIC message
        // would fail this.
        expect(r.detail).toContain('is E');
        expect(envelope!.status).toBe('none');
    });

    it('an UNPACKED zone (INDEF) refuses citing its OWN named TELDE_UNPACKED_ZONES reason, not a generic message', async () => {
        // "Indefinida" — the plan itself declares the zone undetermined. One of the 15
        // deliberately-unpacked codes; the reason string lives in `TELDE_UNPACKED_ZONES.INDEF`.
        // `REAL_ZONE_POINTS.INDEF` is a real point inside a real `INDEF` EDIF polygon.
        expect(TELDE_PGO2003_ZONE_CODES).not.toContain('INDEF');
        expect(TELDE_UNPACKED_ZONES.INDEF).toBeTruthy();
        const { envelope } = await dispatchTelde(REAL_ZONE_POINTS.INDEF);
        const r = envelope!.refusal!;
        expect(r.legallyGrounded).toBe(false);
        expect(envelope!.status).toBe('none');
        // The refusal must carry the zone code AND is expected to reach a reader alongside the
        // dispatcher's own `knownFacts`, which the dispatcher composes from `TELDE_UNPACKED_ZONES`.
        // We assert the STRUCTURAL property here (a specific, non-generic zone-named refusal) —
        // the exact prose lives in `esCanariasSipu.ts` / the dispatcher, not duplicated here.
        const prose = `${r.headline} ${r.detail}`.toLowerCase();
        expect(prose).toContain('indef');
    });

    it('another UNPACKED zone (D1, graphed) refuses on the STRONGER graphed-refusal terms, not the generic coverage-gap one', async () => {
        // D1 — DispObl = GRF: the building line is on a plan sheet PRYZM does not hold. This is
        // `canariasGraphedRefusal`, deliberately `legallyGrounded: true` (a stronger, structural
        // refusal), distinct from the generic `canariasNoRulePackRefusal`. `REAL_ZONE_POINTS.D1`
        // is a real point inside a real `D1` EDIF polygon; the offline resolver has no `DispObl`
        // column to read (it lives in `EDIF.mdb`, not the shapefile), so the dispatcher derives
        // "graphed" statically from `TELDE_GRAPHED_ZONE_CODES`, itself derived from the SAME
        // `EDIF.mdb`-sourced citation already in `TELDE_UNPACKED_ZONES.D1`.
        expect(TELDE_PGO2003_ZONE_CODES).not.toContain('D1');
        expect(TELDE_UNPACKED_ZONES.D1).toMatch(/GRF|plan sheet/i);
        const { envelope } = await dispatchTelde(REAL_ZONE_POINTS.D1);
        const r = envelope!.refusal!;
        expect(r.legallyGrounded).toBe(true);
        expect(r.code).toBe('regime-undetermined');
        expect(envelope!.status).toBe('none');
        const prose = `${r.headline} ${r.detail}`.toLowerCase();
        expect(prose).toMatch(/gr[aá]fic|plan sheet|drawing/);
    });

    it('an UNRESOLVED point (no EDIF feature) still dispatches a cited refusal, never falls through to the estimate', async () => {
        const { envelope } = await dispatchTelde(REAL_ZONE_POINTS.OUTSIDE);
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
    });

    it('NEVER draws an extrudable volume — no massing can be built from this answer', async () => {
        const { envelope } = await dispatchTelde();
        expect(envelope!.insetPolygon).toEqual([]);
        expect(envelope!.insetAreaM2).toBe(0);
        expect(envelope!.maxHeight_m).toBeNull();
        expect(envelope!.farLimitedHeight_m).toBeNull();
        expect(envelope!.maxFloors).toBeNull();
        expect(envelope!.maxCoverage).toBeNull();
        expect(envelope!.maxVolumeM3).toBeNull();
        expect(envelope!.tiers).toEqual([]);
    });

    it('writes NO number onto the persisted C19 Parcel either', async () => {
        const { store } = await dispatchTelde();
        const site = store.getSite()!;
        expect(site.parcel.maxHeight).toBeNull();
        expect(site.parcel.maxFAR).toBeNull();
        expect(site.parcel.buildableRing).toBeNull();
    });
});
