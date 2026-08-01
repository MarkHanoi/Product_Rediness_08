// §MURCIA-ENVELOPE — the L5 REACHABILITY test: does a real click on a Murcia parcel actually reach
// the Murcia code?
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS TEST EXISTS, AND WHY IT DRIVES THE REAL DISPATCHER
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The Murcia rule pack, bbox and zoning mapper shipped as ORPHANS: complete, unit-tested, and
// referenced by nothing outside their own files. Every one of their own tests passed, and not one
// line of Murcia code could be reached from the running app. A provider test cannot detect that —
// only exercising the DISPATCH can. So this suite calls the real `dispatchParcelBoundary` on a real
// `SiteModelStore` with a site located on the founder's Murcia parcel, and asserts on what lands in
// the C19 Parcel and in the cached envelope the renderers read.
//
// The only stubs are the two SAME-ORIGIN PROXIES the path fetches (`/api/catastro/parcel`,
// `/api/es/murcia-pgou`), replayed from the live responses recorded 2026-07-31. Nothing about the
// routing, the ordering, the disposition or the dispatch is mocked — if the `isInMurcia` branch is
// removed from `applyZoning`, or the registry entry is dropped, or the refusal stops being cited,
// these assertions fail.
//
// NOTE: imports the real `@pryzm/stores` + `@pryzm/site-parcel-data`, like
// `parcelBoundaryEnvelopeOrdering.test.ts`.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SiteModelStore, siteCreate } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import {
    dispatchParcelBoundary,
    getLastBuildableEnvelope,
} from '../src/ui/site/siteDispatch.js';

/** The founder's parcel — Catastro + Murcia GeoServer, both read live on 2026-07-31. */
const PARCEL = {
    refcat: '3481104XH6038S',
    lat: 38.0061,
    lon: -1.138028,
    address: 'PL U.A. 5ª DEL P.P. CR-5  P1 MURCIA (CHURRA) (MURCIA)',
    areaOfficialM2: 935,
} as const;

/** A small plot ring in scene metres — the shape a draw/select commits. */
const BOUNDARY = {
    polygon: [
        { x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 31 }, { x: 0, z: 31 },
    ],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

/** `Murcia:pgou_alineaciones` at the parcel — verbatim attributes. */
const CAL_FEATURE = {
    type: 'Feature',
    properties: {
        calificacion: 'RR',
        descripcion: 'Residencial, ordenación remitida al planeamiento anterior',
        uso_global: 'Residencial',
        sector: 'TA-379',
        url: 'RR.pdf',
        f_inicial: '2021-09-09Z',
        f_fin: '2999-12-30Z',
    },
};

/** `Murcia:pgou_sectores` at the parcel — verbatim attributes. */
const SECTOR_FEATURE = {
    type: 'Feature',
    properties: {
        sector: 'TA-379',
        clase_suelo: 'Urbanizable',
        categoria: 'Urbanizable Transitorio',
        uso_global: 'Residencial',
        pedania: 'EL PUNTAL',
        superficie: 383313,
        f_inicial: '2024-01-17Z',
        f_fin: '2999-12-30Z',
    },
};

interface RouteLog {
    readonly urls: string[];
}

/**
 * Stub the two same-origin proxies this path calls. Any OTHER URL rejects, which is deliberate:
 * a unit test may reach no network, and a path that quietly started calling something else should
 * surface here rather than hang.
 */
function stubProxies(log: RouteLog, murciaBody: unknown): typeof globalThis.fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        log.urls.push(url);
        if (url.startsWith('/api/catastro/parcel')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    parcel: {
                        refcat: PARCEL.refcat,
                        address: PARCEL.address,
                        areaM2: PARCEL.areaOfficialM2,
                        areaOfficialM2: PARCEL.areaOfficialM2,
                        source: 'catastro',
                        ring: [
                            { lat: PARCEL.lat, lon: PARCEL.lon },
                            { lat: PARCEL.lat + 0.0002, lon: PARCEL.lon },
                            { lat: PARCEL.lat + 0.0002, lon: PARCEL.lon + 0.0003 },
                            { lat: PARCEL.lat, lon: PARCEL.lon + 0.0003 },
                        ],
                    },
                }),
            } as unknown as Response;
        }
        if (url.startsWith('/api/es/murcia-pgou')) {
            return { ok: true, status: 200, json: async () => murciaBody } as unknown as Response;
        }
        // Context-building prefetch etc. — best-effort callers that swallow this.
        throw new TypeError(`unstubbed URL in unit test: ${url}`);
    }) as unknown as typeof globalThis.fetch;
}

function ctxFor(store: SiteModelStore) {
    const emitted: string[] = [];
    const rt = {
        events: { emit: (t: string) => { emitted.push(t); } },
    } as unknown as PryzmRuntime;
    return { ctx: { rt, store, projectId: 'proj-murcia', toast: () => {} }, emitted };
}

/** Bounded poll — the zoning leg is a fire-and-forget async continuation. */
async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 4_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

async function dispatchMurcia(murciaBody: unknown): Promise<{
    store: SiteModelStore;
    envelope: BuildableEnvelope | null;
    urls: string[];
}> {
    const log: RouteLog = { urls: [] };
    globalThis.fetch = stubProxies(log, murciaBody);
    const store = new SiteModelStore();
    siteCreate(
        { projectId: 'proj-murcia', location: { latitude: PARCEL.lat, longitude: PARCEL.lon } },
        store,
    );
    const { ctx, emitted } = ctxFor(store);
    expect(dispatchParcelBoundary(ctx, { ...BOUNDARY, edgeClassifications: [...BOUNDARY.edgeClassifications] })).toBe(true);
    await waitForEvent(emitted, 'site.zoning-updated');
    return { store, envelope: getLastBuildableEnvelope(), urls: log.urls };
}

describe('§MURCIA-ENVELOPE — a click on the founder\'s Murcia parcel reaches the Murcia code', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('ROUTES to the Murcia municipal service — the link that was missing', async () => {
        const { urls } = await dispatchMurcia({
            calificaciones: [CAL_FEATURE],
            sectores: [SECTOR_FEATURE],
        });
        // ⚠ THE REACHABILITY ASSERTION. Before this wiring no Murcia code ran on any click: the
        // parcel resolved (Catastro is national) and the zoning fell through to the estimated
        // default. If the `isInMurcia` branch is removed from `applyZoning`, this fails.
        const murciaCall = urls.find((u) => u.startsWith('/api/es/murcia-pgou'));
        expect(murciaCall).toBeDefined();
        // §L-521 — the query point is the PARCEL'S AREA CENTROID, not the site anchor, so assert
        // proximity rather than a literal: it must land on the founder's parcel (within ~50 m).
        const q = new URLSearchParams(murciaCall!.split('?')[1]!);
        expect(Math.abs(Number(q.get('lat')) - PARCEL.lat)).toBeLessThan(5e-4);
        expect(Math.abs(Number(q.get('lon')) - PARCEL.lon)).toBeLessThan(5e-4);
        // …and it reads the parcel identity from the national Catastro path in the same pass.
        expect(urls.some((u) => u.startsWith('/api/catastro/parcel'))).toBe(true);
    });

    it('dispatches the LEGALLY GROUNDED derived-plan refusal onto the C19 Parcel', async () => {
        const { store, envelope } = await dispatchMurcia({
            calificaciones: [CAL_FEATURE],
            sectores: [SECTOR_FEATURE],
        });

        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('none');
        expect(envelope!.zoneCode).toBe('RR');
        expect(envelope!.refusal).toBeTruthy();
        // The ordinance ANSWERED, and its answer was "that other document" (PGOU Art. 6.6.2).
        expect(envelope!.refusal!.code).toBe('derived-plan');
        expect(envelope!.refusal!.legallyGrounded).toBe(true);
        expect(envelope!.refusal!.ordinanceRef).toContain('6.6.2');
        expect(envelope!.refusal!.detail).toContain('expediente 379');
        // The instrument named by the CADASTRAL ADDRESS, folded in from the Catastro leg.
        expect(envelope!.refusal!.detail).toContain('Plan Parcial CR-5');
        // The card opens with the user's own land, then the municipality's own words.
        const facts = envelope!.refusal!.knownFacts.join(' | ');
        expect(facts).toContain(PARCEL.refcat);
        expect(facts).toContain('TA-379');
        expect(facts).toContain('Urbanizable Transitorio');
        expect(facts).toContain('EL PUNTAL');

        // …and what reaches the persisted parcel: the zone + jurisdiction, and NO number.
        const site = store.getSite()!;
        expect(site.parcel.zoning.category).toBe('RR');
        expect(site.parcel.zoning.jurisdictionRef).toBe('murcia-pgou');
        expect(site.parcel.maxHeight).toBeNull();
        expect(site.parcel.maxFAR).toBeNull();
        expect(site.parcel.buildableRing).toBeNull();
    });

    it('NEVER draws an extrudable volume — no massing can be built from this answer', async () => {
        const { envelope } = await dispatchMurcia({
            calificaciones: [CAL_FEATURE],
            sectores: [SECTOR_FEATURE],
        });
        expect(envelope!.insetPolygon).toEqual([]);
        expect(envelope!.insetAreaM2).toBe(0);
        expect(envelope!.maxHeight_m).toBeNull();
        expect(envelope!.farLimitedHeight_m).toBeNull();
        expect(envelope!.maxFloors).toBeNull();
        expect(envelope!.maxCoverage).toBeNull();
        expect(envelope!.maxVolumeM3).toBeNull();
        expect(envelope!.tiers).toEqual([]);
        expect(envelope!.confidence).toBe('not-determined');
        // A competitor published ~262 m² of edificabilidad on this parcel as a "proxy PGOU".
        const prose = `${envelope!.refusal!.headline} ${envelope!.refusal!.detail}`;
        expect(prose).not.toMatch(/\b262\b/);
    });

    it('does NOT fall back to the estimated default when the municipal service is DOWN', async () => {
        // ⚠ The failure mode this guards: an estimated front/side/rear triple on a jurisdiction
        // whose ordinance publishes no such thing would be a fabrication wearing a badge.
        const { store, envelope } = await dispatchMurcia({ calificaciones: null, sectores: null });
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
        expect(envelope!.refusal!.code).toBe('no-rule-pack');
        expect(envelope!.refusal!.legallyGrounded).toBe(false);
        // FAILURE and ABSENCE stay different answers, on the card as well as in the code.
        expect(envelope!.refusal!.knownFacts.join(' ')).toContain('did not answer');
        expect(store.getSite()!.parcel.zoning.jurisdictionRef).toBe('murcia-pgou');
        expect(store.getSite()!.parcel.maxHeight).toBeNull();
    });

    it('still names the derived instrument when the municipal records are absent', async () => {
        const { envelope } = await dispatchMurcia({ calificaciones: [], sectores: [] });
        expect(envelope!.refusal!.code).toBe('no-rule-pack');
        // The cadastral address is a NATIONAL signal — it survives a municipal outage.
        expect(envelope!.refusal!.detail).toContain('Plan Parcial CR-5');
        expect(envelope!.refusal!.legallyGrounded).toBe(false);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// §MURCIA-ENVELOPE-RENDER — the OTHER half: land the PGOU orders DIRECTLY must now DRAW.
//
// Everything above pins a refusal. That was the whole story while the pack was unsigned, and it is
// still the story for the ~67 % of Murcia the plan delegates. But SIG-MU1 authorises publication on
// the measured 23.51 % where a transcribed calificación meets non-delegated soil, and a suite that
// only ever asserts "no number" cannot tell a working render path from a dead one — the exact blind
// spot that let the gate flip ship while the dispatcher rendered nothing.
//
// `RL` on `Urbano` is deliberately the fixture: at 12.381 M m² it is the single largest
// calificación × clase cell in the whole city (`tools/murcia-coverage-crosstab/out-crosstab.json`),
// so it is the land this signature is mostly ABOUT.
// ══════════════════════════════════════════════════════════════════════════════════════════

/** `RL` — Agrupaciones Lineales Residenciales, PGOU Art. 5.14.3. PGOU-DIRECT, packed, signed. */
const RL_CAL_FEATURE = {
    type: 'Feature',
    properties: {
        calificacion: 'RL',
        descripcion: 'Agrupaciones Lineales Residenciales',
        uso_global: 'Residencial',
        sector: 'ZM-SV1',
        url: 'RL.pdf',
        f_inicial: '2012-12-01Z',
        f_fin: '2999-12-30Z',
    },
};

/** Urbano soil in a non-delegating ámbito — the PGOU orders this land itself. */
const RL_SECTOR_URBANO = {
    type: 'Feature',
    properties: {
        sector: 'ZM-SV1',
        clase_suelo: 'Urbano',
        categoria: 'Urbano Consolidado',
        uso_global: 'Residencial',
        pedania: 'CHURRA',
        superficie: 12000,
        f_inicial: '2012-12-01Z',
        f_fin: '2999-12-30Z',
    },
};

describe('§MURCIA-ENVELOPE-RENDER — PGOU-direct land draws a signed envelope', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('RENDERS the transcribed Art. 5.14.3 numbers — the 23.51 % SIG-MU1 authorises', async () => {
        const { store, envelope } = await dispatchMurcia({
            calificaciones: [RL_CAL_FEATURE],
            sectores: [RL_SECTOR_URBANO],
        });

        expect(envelope).not.toBeNull();
        // THE ASSERTION THIS WHOLE SUITE WAS MISSING: a number actually reaches the user.
        expect(envelope!.status).toBe('ok');
        expect(envelope!.zoneCode).toBe('RL');
        // Art. 5.14.3 verbatim: «la altura máxima será de 2 plantas (7 metros)» and FAR 0,25 m²/m².
        expect(envelope!.maxHeight_m).toBe(7);
        expect(envelope!.maxFloors).toBe(2);
        // ⚠ THE TIER IS PART OF THE AUTHORISATION, not a detail. SIG-MU1 authorises publication at
        // `estimated-ruleset` and states `authoritative` is UNREACHABLE. A future change that
        // promotes this would publish beyond what a human signed.
        expect(envelope!.confidence).toBe('estimated-ruleset');
        // The setback triple 5 / 7,5 / 5 consumed real area off a 30 × 31 m plot, so a massing
        // volume can genuinely be built from this answer (the inverse of the refusal tests above).
        expect(envelope!.insetPolygon.length).toBeGreaterThan(2);
        expect(envelope!.insetAreaM2).toBeGreaterThan(0);
        expect(envelope!.insetAreaM2).toBeLessThan(30 * 31);
        // …and it reaches the persisted C19 Parcel, which is what the renderers read.
        const site = store.getSite()!;
        expect(site.parcel.zoning.category).toBe('RL');
        expect(site.parcel.zoning.jurisdictionRef).toBe('murcia-pgou');
        expect(site.parcel.maxHeight).toBe(7);
        expect(site.parcel.buildableRing).not.toBeNull();
    });

    // ⚠ The citation is NOT a single top-level field on `BuildableEnvelope` — C58 §1.3 puts an
    // `ordinanceRef` on EVERY `derivation` entry, so each constraint cites the article that produced
    // that specific number rather than the whole envelope pointing at one document. Assert it there,
    // per constraint, which is the stricter property: an uncited number cannot hide behind a cited
    // sibling.
    it('cites the ordinance on EVERY derived constraint — an uncited number is not publishable', async () => {
        const { envelope } = await dispatchMurcia({
            calificaciones: [RL_CAL_FEATURE],
            sectores: [RL_SECTOR_URBANO],
        });
        expect(envelope!.derivation.length).toBeGreaterThan(0);
        for (const d of envelope!.derivation) {
            expect(d.ordinanceRef, `constraint ${d.constraint} carries no citation`).toBeTruthy();
            expect(d.ordinanceRef!).toContain('Art. 5.14.3');
            expect(d.ordinanceRef!).toContain('Texto Refundido diciembre 2012');
            // A verbatim quote, not a paraphrase — the standard every Murcia zone is held to.
            expect(d.ordinanceRef!).toContain('«');
            expect(d.zoneCode).toBe('RL');
        }
        // The setback triple 5 / 7,5 / 5 must each be present and attributed, not just the height.
        const byConstraint = new Map(envelope!.derivation.map((d) => [d.constraint, d.value]));
        expect(byConstraint.get('setback.front')).toBe(5);
        expect(byConstraint.get('setback.side')).toBe(7.5);
        expect(byConstraint.get('setback.rear')).toBe(5);
    });

    // ⚠ R-7 IN THE REAL DISPATCHER, not in a unit test of the disposition. Same calificación, same
    // pack, same signature — only the soil differs. Before §R-7-DELEGATION-PARITY this rendered
    // Art. 5.14.3's numbers on land Art. 6.2.2.3 hands to a Plan Parcial, which is the «proxy PGOU»
    // error a competitor made on the founder's own parcel. Measured exposure: 13.09 pp of buildable
    // land, taking rendered coverage to 36.59 % — ABOVE the 33.00 % the PGOU orders directly.
    it('REFUSES the identical calificación on urbanizable soil, and draws nothing', async () => {
        const { store, envelope } = await dispatchMurcia({
            calificaciones: [RL_CAL_FEATURE],
            sectores: [{
                ...RL_SECTOR_URBANO,
                properties: {
                    ...RL_SECTOR_URBANO.properties,
                    clase_suelo: 'Urbanizable',
                    categoria: 'Urbanizable Sectorizado',
                },
            }],
        });
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal!.code).toBe('derived-plan');
        // The ORDINANCE answered — this is a statement about the law, not about our coverage.
        expect(envelope!.refusal!.legallyGrounded).toBe(true);
        expect(envelope!.refusal!.ordinanceRef).toContain('6.2.2.3');
        // Not one transcribed number leaks onto the card or the parcel.
        expect(envelope!.maxHeight_m).toBeNull();
        expect(envelope!.insetPolygon).toEqual([]);
        expect(store.getSite()!.parcel.maxHeight).toBeNull();
        expect(store.getSite()!.parcel.buildableRing).toBeNull();
        const prose = `${envelope!.refusal!.headline} ${envelope!.refusal!.detail}`;
        expect(prose).not.toMatch(/\b0[,.]25\b/);
        expect(prose).not.toMatch(/\b7 metros\b/);
    });

    // The same guard on the ámbito ground (Art. 5.25.1), so both new R-7 branches are covered
    // end-to-end and neither can regress silently.
    it('REFUSES the identical calificación inside a UE ámbito', async () => {
        const { envelope } = await dispatchMurcia({
            calificaciones: [{
                ...RL_CAL_FEATURE,
                properties: { ...RL_CAL_FEATURE.properties, sector: 'UE-12' },
            }],
            sectores: [{
                ...RL_SECTOR_URBANO,
                properties: { ...RL_SECTOR_URBANO.properties, sector: 'UE-12' },
            }],
        });
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal!.code).toBe('derived-plan');
        expect(envelope!.refusal!.legallyGrounded).toBe(true);
        expect(envelope!.refusal!.ordinanceRef).toContain('5.25.1');
        expect(envelope!.maxHeight_m).toBeNull();
    });
});
