// §TELDE-ENVELOPE — the L5 REACHABILITY + HONESTY-GATE test: what does a real click on a real
// Telde parcel actually put on screen today?
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS TEST EXISTS
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// `ES_TELDE_PGO2003_PACK` is REGISTERED in `rulepacks/registry.ts` with a non-empty `packsByZone`
// (31 packed EDIF zones), and until this session NOTHING in `siteDispatch.ts` referenced
// `isInTelde` / `TELDE_JURISDICTION_ID` / `applyTeldeZoningThenFallback` — VERIFICATION.md §6
// records that a Telde click reached only the generic §L-663 chokepoint
// (`refuseEstimateInsideRegisteredJurisdiction`), which suppresses the estimated triple but never
// names a Telde zone or reads an EDIF row. This suite is the direct analogue of
// `zaragozaSiteDispatch.test.ts`: the real `dispatchParcelBoundary`, a real `SiteModelStore`, a
// site on real Telde land, and the ONLY stub is the injectable `resolveTeldeZone` fetch. Nothing
// about the routing, the ordering, the gate or the dispatch is mocked — remove the `isInTelde`
// branch from `applyZoning` and the first test fails, because a Telde plot would then fall through
// to the ESTIMATED front/side/rear default, precisely the fabrication the gate exists to prevent.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
 * this file only needs a point safely inside the box, not a specific parcel identity.
 */
const PARCEL = {
    lat: 27.995,
    lon: -15.42,
} as const;

/** A small plot ring in scene metres — the shape a draw/select commits. */
const BOUNDARY = {
    polygon: [
        { x: 0, z: 0 }, { x: 15, z: 0 }, { x: 15, z: 20 }, { x: 0, z: 20 },
    ],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

interface RouteLog {
    readonly urls: string[];
}

/**
 * Stub the one same-origin proxy this path would call. Any OTHER URL rejects, which is
 * deliberate: if the Telde path ever started calling a national Catastro endpoint (it does not
 * today) that would need to surface here rather than hang silently.
 *
 * ⚠ Unlike Zaragoza's `/api/zaragoza/calificaciones`, `/api/telde/edif` is NOT wired server-side
 * today (`resolveTeldeZone.ts`'s header) — this stub exists purely to prove the PARSE/dispatch side
 * of the contract; it is not a claim that the real endpoint answers this way in production.
 */
function stubProxy(
    log: RouteLog,
    edifRow: Record<string, string> | null,
): typeof globalThis.fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        log.urls.push(url);
        if (url.startsWith('/api/telde/edif')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    features: edifRow ? [{ properties: edifRow }] : [],
                }),
            } as unknown as Response;
        }
        throw new TypeError(`unstubbed URL in unit test: ${url}`);
    }) as unknown as typeof globalThis.fetch;
}

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
    edifRow: Record<string, string> | null = { Etiqueta: 'E', Nombre: 'Ciudad jardín, unifamiliar aislada' },
): Promise<{
    store: SiteModelStore;
    envelope: BuildableEnvelope | null;
    urls: string[];
}> {
    const log: RouteLog = { urls: [] };
    globalThis.fetch = stubProxy(log, edifRow);
    const store = new SiteModelStore();
    siteCreate(
        { projectId: 'proj-telde', location: { latitude: PARCEL.lat, longitude: PARCEL.lon } },
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
    return { store, envelope: getLastBuildableEnvelope(), urls: log.urls };
}

describe('§TELDE-ENVELOPE — a click on a Telde parcel reaches the Telde code', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

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
        const { store, envelope, urls } = await dispatchTelde();
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
        expect(store.getSite()!.parcel.zoning.jurisdictionRef).toBe('sipu-telde-edif');
        // The Telde leg calls exactly the one same-origin proxy it needs, nothing more.
        const planningCalls = urls.filter((u) => u.includes('telde'));
        expect(planningCalls.length).toBeGreaterThan(0);
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
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('a PACKED zone (E) resolves but dispatches a cited no-signed-rule refusal naming it, never a number', async () => {
        // Zone E — Ciudad jardín, edificación residencial unifamiliar aislada. One of the 31
        // packed zones (`esTeldePgo2003.ts`, SETBACK grammar).
        expect(TELDE_PGO2003_ZONE_CODES).toContain('E');
        const { envelope } = await dispatchTelde({
            Etiqueta: 'E',
            Nombre: 'Ciudad jardín, edificación residencial unifamiliar aislada',
            SepMinFr: '5', SepMinPs: '5', SepMinLt: '2',
            PMaxOcup: '40', EdifMax: '0,60', AltMaxPl: '2', AltMaxMP: '7,50',
        });
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
        expect(TELDE_PGO2003_ZONE_CODES).not.toContain('INDEF');
        expect(TELDE_UNPACKED_ZONES.INDEF).toBeTruthy();
        const { envelope } = await dispatchTelde({ Etiqueta: 'INDEF', Nombre: 'Indefinida' });
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
        // refusal), distinct from the generic `canariasNoRulePackRefusal`.
        expect(TELDE_PGO2003_ZONE_CODES).not.toContain('D1');
        expect(TELDE_UNPACKED_ZONES.D1).toMatch(/GRF|plan sheet/i);
        // Verbatim shape of Telde's real D1 row (`esCanariasTelde.test.ts` TELDE_D1 fixture): the
        // setback/depth columns are ALL the sentinel `I` — DispObl=GRF is the only speaking field,
        // so `hasNumericDepth` is false and `detectSipuGrammar` selects `graphed-refusal` (its
        // FIRST, most-specific branch: `graphed && !hasNumericDepth`).
        const { envelope } = await dispatchTelde({
            Etiqueta: 'D1',
            Nombre: 'Proceso tipológico de edificación residencial colectiva con patio de manzana. Ordenanza D',
            SepMinFr: 'I', SepMinPs: 'I', SepMinLt: 'I',
            DispObl: 'GRF',
            FonMaxEdm: 'I',
            PMaxOcup: 'I',
        });
        const r = envelope!.refusal!;
        expect(r.legallyGrounded).toBe(true);
        expect(r.code).toBe('regime-undetermined');
        expect(envelope!.status).toBe('none');
        const prose = `${r.headline} ${r.detail}`.toLowerCase();
        expect(prose).toMatch(/gr[aá]fic|plan sheet|drawing/);
    });

    it('an UNRESOLVED point (no EDIF feature) still dispatches a cited refusal, never falls through to the estimate', async () => {
        const { envelope } = await dispatchTelde(null);
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
