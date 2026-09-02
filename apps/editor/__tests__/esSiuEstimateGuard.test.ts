// §ES-SIU-GUARD (lane ES-SIU-GUARD, 2026-09-02) — RURAL SPAIN NEVER RECEIVES AN ESTIMATED
// ENVELOPE ON LAND SIU CLASSIFIES `no_urbanizable`.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS PINS, AND THE PROBE THAT EARNED IT
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Demo-readiness probe point 3 (audit/demo-esfrpt/2026-09-02/DEMO-READINESS.md, gap G5): a real
// rústica parcel outside Villacañas (Toledo) — refcat 45186A06800141, 67 505 m² official,
// route9.txt: `rural-clm 39.55,-3.35 PARCEL=[catastro] ZONING=none`. The live SIU proxy answers
// (`transcripts/live-clm-siu.json`, VERBATIM below): `clase:"no_urbanizable"`, in force,
// published-structured — and the deployed dispatch ladder still fell through to
// `applyEstimatedZoning`, rendering the generic buildable triple (3.0/1.5/3.0 m, FAR 2.0, 50 %)
// on land the state classifies as non-developable. The L-616 overstatement family, live.
//
// ⚠ WHY THIS SUITE DRIVES THE REAL `dispatchParcelBoundary` AND STUBS ONLY THE PROXIES — the
// same reachability argument as `estimatedFallbackJurisdictionGuard.test.ts` (§L-663) and
// `madridSiteDispatch.test.ts`: the defect was never in a rule pack, it was in the DISPATCH.
// Nothing about the routing, the ordering, the chokepoint or the guard is mocked here.
//
// THE FIVE CLAIMS:
//   1. The Villacañas point + the verbatim live SIU answer → a CITED refusal naming SIU, the
//      classification and the query. NEVER the estimated triple (the founder-visible defect).
//   2. AVAILABILITY ARM (control 9): SIU severed (network reject) OR answering an upstream
//      failure → the guard RECORDS the transient and does NOT refuse — the estimate publishes
//      exactly as before the guard existed. UNKNOWN ≠ no-restriction ≠ restriction.
//   3. SIU answering urbano/urbanizable → the existing ladder proceeds unchanged.
//   4. An urban MADRID point still reaches its existing Madrid path — the SIU guard is never
//      consulted where a registered jurisdiction claims the parcel.
//   5. Barcelona Eixample still routes through its own MUC path (regression arm) — no SIU call,
//      the Barcelona card unchanged.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SiteModelStore, siteCreate } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import {
    dispatchParcelBoundary,
    getLastBuildableEnvelope,
} from '../src/ui/site/siteDispatch.js';
import {
    interpretSiuClassification,
    buildSiuNonDevelopableRefusal,
    getLastSiuGuardOutcome,
    __resetSiuGuardForTests,
} from '../src/ui/site/siuLandClassificationGuard.js';

/**
 * The probe point — route9.txt line `rural-clm 39.55,-3.35`. Villacañas farmland, Toledo:
 * inside SPAIN_BBOX, outside every registered jurisdiction (ZONING=none).
 */
const VILLACANAS = { lat: 39.55, lon: -3.35 } as const;

/** Central Madrid — `madridSiteDispatch.test.ts`'s own point, unambiguously inside MADRID_BBOX. */
const MADRID = { lat: 40.41678, lon: -3.70379 } as const;

/** Carrer de la Diputació × Roger de Llúria — the §L-663 suite's own Eixample point. */
const EIXAMPLE = { lat: 41.3925, lon: 2.165 } as const;

/**
 * The VERBATIM live answer, `transcripts/live-clm-siu.json` (2026-09-02). Kept byte-faithful so
 * the refusal below is proven against what the real register actually said, not a paraphrase.
 */
const LIVE_CLM_SIU = {
    found: true,
    clase: 'no_urbanizable',
    claseRaw: 'SUELO NO URBANIZABLE',
    municipioIne: '45185',
    nucleoRural: false,
    inForce: true,
    granularity: 'municipality-polygon',
    source: 'siu',
    sourceUrl: 'https://mapas.fomento.gob.es/arcgis/rest/services/SIU/Servicios_OGC/MapServer/15',
    confidence: 'published-structured',
} as const;

/** The estimated-default pack's verbatim numbers — the exact fabrication that must not appear. */
const ESTIMATED_TRIPLE = {
    front_m: 3,
    side_m: 1.5,
    rear_m: 3,
    maxFAR: 2,
    maxHeight_m: 12,
    zoneCode: 'generic-urban',
} as const;

const HAND_DRAWN = {
    polygon: [
        { x: 0, z: 0 },
        { x: 31, z: 2 },
        { x: 33, z: 29 },
        { x: 2, z: 27 },
    ],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

type SiuReply =
    /** The proxy answers 200 with a JSON payload (found:true/false shapes alike). */
    | { readonly kind: 'json'; readonly payload: unknown }
    /** The network itself is severed — fetch rejects (the scratch-severed arm). */
    | { readonly kind: 'severed' };

interface RouteLog {
    readonly urls: string[];
}

/**
 * Stub the same-origin proxies. Any OTHER URL rejects — a unit test may reach no network, and a
 * path that quietly started calling something else must surface here rather than hang. Best-effort
 * callers (context prefetch, Madrid/MUC legs falling into their own catch) swallow the rejection,
 * which is exactly the production shape when those proxies are down.
 */
function stubProxies(log: RouteLog, siu: SiuReply): typeof globalThis.fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        log.urls.push(url);
        if (url.startsWith('/api/siu/classification')) {
            if (siu.kind === 'severed') {
                throw new TypeError('fetch failed: network severed (test)');
            }
            return { ok: true, status: 200, json: async () => siu.payload } as unknown as Response;
        }
        if (url.startsWith('/api/catastro/parcel')) {
            return { ok: true, status: 200, json: async () => ({ parcel: null }) } as unknown as Response;
        }
        throw new TypeError(`unstubbed URL in unit test: ${url}`);
    }) as unknown as typeof globalThis.fetch;
}

function ctxFor(store: SiteModelStore, projectId: string) {
    const emitted: string[] = [];
    const rt = {
        events: { emit: (t: string) => { emitted.push(t); } },
    } as unknown as PryzmRuntime;
    return { ctx: { rt, store, projectId, toast: () => {} }, emitted };
}

/** Bounded poll — the zoning leg is a fire-and-forget async continuation. */
async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 4_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

let _projectSeq = 0;

async function commitBoundaryAt(
    at: { lat: number; lon: number },
    siu: SiuReply,
): Promise<{ store: SiteModelStore; envelope: BuildableEnvelope | null; urls: string[] }> {
    const log: RouteLog = { urls: [] };
    globalThis.fetch = stubProxies(log, siu);
    const store = new SiteModelStore();
    const projectId = `proj-siu-${++_projectSeq}`;
    siteCreate({ projectId, location: { latitude: at.lat, longitude: at.lon } }, store);
    const { ctx, emitted } = ctxFor(store, projectId);
    expect(
        dispatchParcelBoundary(ctx, {
            polygon: HAND_DRAWN.polygon.map((p) => ({ ...p })),
            edgeClassifications: [...HAND_DRAWN.edgeClassifications],
        }),
    ).toBe(true);
    await waitForEvent(emitted, 'site.zoning-updated');
    return { store, envelope: getLastBuildableEnvelope(), urls: log.urls };
}

/** The single prohibition, stated once — mirrors the §L-663 suite's helper. */
function expectNoEstimatedTriple(store: SiteModelStore, envelope: BuildableEnvelope | null): void {
    const parcel = store.getSite()!.parcel;
    expect(parcel.zoning.jurisdictionRef).not.toBe('estimated-default');
    expect(parcel.zoning.category).not.toBe(ESTIMATED_TRIPLE.zoneCode);
    expect(parcel.maxFAR).not.toBe(ESTIMATED_TRIPLE.maxFAR);
    expect(parcel.maxHeight).not.toBe(ESTIMATED_TRIPLE.maxHeight_m);
    expect(parcel.setbacks?.front ?? null).not.toBe(ESTIMATED_TRIPLE.front_m);
    expect(parcel.setbacks?.side ?? null).not.toBe(ESTIMATED_TRIPLE.side_m);
    expect(parcel.setbacks?.rear ?? null).not.toBe(ESTIMATED_TRIPLE.rear_m);
    expect(envelope!.confidence).not.toBe('estimated-ruleset');
    expect(envelope!.maxFAR).toBeNull();
    expect(envelope!.maxHeight_m).toBeNull();
    expect(envelope!.insetPolygon).toEqual([]);
    expect(parcel.buildableRing).toBeNull();
}

/** …and its inverse: the honestly-badged estimate DID publish (the pre-guard behaviour). */
function expectEstimatedTriple(store: SiteModelStore, envelope: BuildableEnvelope | null): void {
    expect(envelope).not.toBeNull();
    expect(envelope!.confidence).toBe('estimated-ruleset');
    expect(envelope!.status).toBe('ok');
    expect(envelope!.refusal).toBeNull();
    const parcel = store.getSite()!.parcel;
    expect(parcel.zoning.jurisdictionRef).toBe('estimated-default');
    expect(parcel.zoning.category).toBe(ESTIMATED_TRIPLE.zoneCode);
    expect(parcel.setbacks?.front).toBe(ESTIMATED_TRIPLE.front_m);
    expect(parcel.setbacks?.side).toBe(ESTIMATED_TRIPLE.side_m);
    expect(parcel.setbacks?.rear).toBe(ESTIMATED_TRIPLE.rear_m);
}

describe('§ES-SIU-GUARD — rural no_urbanizable land refuses with a citation, never an estimate', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; __resetSiuGuardForTests(); });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('Villacañas (39.55,-3.35) + the VERBATIM live SIU answer → the cited refusal, never the triple', async () => {
        const { store, envelope, urls } = await commitBoundaryAt(VILLACANAS, {
            kind: 'json',
            payload: LIVE_CLM_SIU,
        });

        // ⚠ THE ASSERTION THE DEMO PROBE FAILS TODAY.
        expect(envelope).not.toBeNull();
        expectNoEstimatedTriple(store, envelope);

        // The refusal is legally grounded and cites the register, the classification AND the query.
        expect(envelope!.refusal).toBeTruthy();
        expect(envelope!.refusal!.code).toBe('protected-soil');
        expect(envelope!.refusal!.legallyGrounded).toBe(true);
        // 'not-applicable' — the register ANSWERED; this is not a fetch failure wearing a card.
        expect(envelope!.status).toBe('not-applicable');
        expect(envelope!.confidence).toBe('not-determined');
        // Names SIU…
        expect(envelope!.refusal!.headline).toMatch(/no urbanizable/i);
        expect(envelope!.refusal!.detail).toContain('Sistema de Información Urbana');
        // …the classification, in the register's own words…
        expect(envelope!.refusal!.detail).toContain('SUELO NO URBANIZABLE');
        // …and the query it made (both halves of the never-overstate refusal doctrine: what was
        // asked AND what the source said).
        expect(envelope!.refusal!.detail).toContain('/api/siu/classification');
        expect(envelope!.refusal!.knownFacts.join(' | ')).toContain('SUELO NO URBANIZABLE');
        expect(envelope!.refusal!.knownFacts.join(' | ')).toContain('/api/siu/classification');
        expect(envelope!.refusal!.knownFacts.join(' | ')).toContain('45185');
        expect(envelope!.refusal!.ordinanceRef).toContain('SIU');
        // No zone is claimed — SIU answers a land CLASS, not a planning zone.
        expect(envelope!.zoneCode).toBeNull();
        expect(store.getSite()!.parcel.zoning.jurisdictionRef).toBe('es-siu-national');

        // The guard really asked at the PARCEL's own point (the §L-521 discipline).
        const siuCall = urls.find((u) => u.startsWith('/api/siu/classification'));
        expect(siuCall).toBeDefined();
        const q = new URLSearchParams(siuCall!.split('?')[1]!);
        expect(Math.abs(Number(q.get('lat')) - VILLACANAS.lat)).toBeLessThan(5e-4);
        expect(Math.abs(Number(q.get('lon')) - VILLACANAS.lon)).toBeLessThan(5e-4);

        // …and the outcome is recorded as a refusal, not silently.
        expect(getLastSiuGuardOutcome()?.verdict.kind).toBe('refuse');
    });

    it('AVAILABILITY ARM — SIU severed (network reject) → transient RECORDED, estimate proceeds, NO refusal', async () => {
        const { store, envelope } = await commitBoundaryAt(VILLACANAS, { kind: 'severed' });

        // Availability did NOT convert into a refusal (control 9): the pre-guard behaviour holds.
        expectEstimatedTriple(store, envelope);

        // …but the guard did not proceed SILENTLY: the transient is recorded.
        const rec = getLastSiuGuardOutcome();
        expect(rec).not.toBeNull();
        expect(rec!.verdict.kind).toBe('proceed');
        expect(rec!.verdict.kind === 'proceed' && rec!.verdict.reason).toBe('transient');
    });

    it('AVAILABILITY ARM — the proxy itself reports its upstream failed (found:false) → same: estimate, transient recorded', async () => {
        const { store, envelope } = await commitBoundaryAt(VILLACANAS, {
            kind: 'json',
            payload: { found: false, reason: 'upstream-timeout' },
        });
        expectEstimatedTriple(store, envelope);
        const rec = getLastSiuGuardOutcome();
        expect(rec!.verdict.kind === 'proceed' && rec!.verdict.reason).toBe('transient');
    });

    it('SIU answers urbano → the existing ladder proceeds unchanged (the guard only guards)', async () => {
        const { store, envelope } = await commitBoundaryAt(VILLACANAS, {
            kind: 'json',
            payload: { ...LIVE_CLM_SIU, clase: 'urbano', claseRaw: 'SUELO URBANO' },
        });
        expectEstimatedTriple(store, envelope);
        const rec = getLastSiuGuardOutcome();
        expect(rec!.verdict.kind === 'proceed' && rec!.verdict.reason).toBe('developable-class');
    });

    it('SIU answers no-coverage (outside its polygons) → estimate proceeds; a coverage answer is not a class', async () => {
        const { store, envelope } = await commitBoundaryAt(VILLACANAS, {
            kind: 'json',
            payload: { found: false, reason: 'no-coverage' },
        });
        expectEstimatedTriple(store, envelope);
        const rec = getLastSiuGuardOutcome();
        expect(rec!.verdict.kind === 'proceed' && rec!.verdict.reason).toBe('no-coverage');
    });
});

describe('§ES-SIU-GUARD — the guard is SCOPED: registered jurisdictions never consult it', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; __resetSiuGuardForTests(); });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('an urban MADRID point routes to the Madrid path — /api/madrid/* is asked, /api/siu/* never is', async () => {
        // Madrid's own proxies are deliberately UNstubbed here (they reject): the Madrid branch
        // falls into its own catch → `applyEstimatedZoning` → the §L-663 registered-jurisdiction
        // guard refuses FIRST — the SIU guard sits behind it and must never fire.
        const { store, envelope, urls } = await commitBoundaryAt(MADRID, {
            kind: 'json',
            payload: LIVE_CLM_SIU, // would refuse if (wrongly) consulted — the stub is a tripwire
        });
        expect(urls.some((u) => u.startsWith('/api/madrid/'))).toBe(true);
        expect(urls.some((u) => u.startsWith('/api/siu/'))).toBe(false);
        expect(getLastSiuGuardOutcome()).toBeNull();
        // …and Madrid's existing answer shape holds: never the triple, never an SIU card.
        expectNoEstimatedTriple(store, envelope);
        expect(store.getSite()!.parcel.zoning.jurisdictionRef).not.toBe('es-siu-national');
    });

    it('Barcelona Eixample still routes through the MUC path unchanged (regression arm)', async () => {
        const { store, envelope, urls } = await commitBoundaryAt(EIXAMPLE, {
            kind: 'json',
            payload: LIVE_CLM_SIU, // tripwire again — Eixample must never reach the SIU guard
        });
        expect(urls.some((u) => u.startsWith('/api/muc/zoning'))).toBe(true);
        expect(urls.some((u) => u.startsWith('/api/siu/'))).toBe(false);
        expect(getLastSiuGuardOutcome()).toBeNull();
        expectNoEstimatedTriple(store, envelope);
        // The Barcelona card, not an SIU one: the §L-663 suite pins its exact wording; here it is
        // enough that the refusal names Barcelona and the SIU register appears nowhere.
        expect(envelope!.refusal).toBeTruthy();
        expect(envelope!.refusal!.headline).toContain('Barcelona');
        expect(envelope!.refusal!.detail).not.toContain('Sistema de Información Urbana');
    });
});

describe('§ES-SIU-GUARD — pure interpretation: every non-refusing class proceeds under its own name', () => {
    it('no_urbanizable + NuclRural=1 → proceed (a rural nucleus has building rights; refusing would overstate)', () => {
        const v = interpretSiuClassification({ ...LIVE_CLM_SIU, nucleoRural: true });
        expect(v).toEqual({ kind: 'proceed', reason: 'nucleo-rural', detail: 'no_urbanizable' });
    });

    it('no_urbanizable but NOT in force → proceed (a repealed record grounds nothing)', () => {
        const v = interpretSiuClassification({ ...LIVE_CLM_SIU, inForce: false });
        expect(v).toEqual({ kind: 'proceed', reason: 'not-in-force', detail: 'no_urbanizable' });
    });

    it('an unknown published class (clase:null, claseRaw set) → proceed as unknown-class, never a guess', () => {
        const v = interpretSiuClassification({
            found: true, clase: null, claseRaw: 'SUELO RUSTICO ESPECIAL (NUEVA CATEGORIA)',
        });
        expect(v.kind).toBe('proceed');
        expect(v.kind === 'proceed' && v.reason).toBe('unknown-class');
    });

    it('sistemas_generales → proceed as class-not-guarded (semantics not established ⇒ no refusal by default)', () => {
        const v = interpretSiuClassification({ found: true, clase: 'sistemas_generales', claseRaw: 'SISTEMAS GENERALES Y OTROS' });
        expect(v.kind === 'proceed' && v.reason).toBe('class-not-guarded');
    });

    it('every urbanizable class proceeds as developable-class', () => {
        for (const clase of ['urbano', 'urbano_no_consolidado', 'urbanizable_delimitado', 'urbanizable_no_delimitado']) {
            const v = interpretSiuClassification({ found: true, clase, claseRaw: clase.toUpperCase() });
            expect(v.kind === 'proceed' && v.reason).toBe('developable-class');
        }
    });

    it('the refusal carries both halves: what was asked AND what the source said', () => {
        const refusal = buildSiuNonDevelopableRefusal({
            lat: VILLACANAS.lat, lon: VILLACANAS.lon,
            claseRaw: 'SUELO NO URBANIZABLE', municipioIne: '45185',
            sourceUrl: LIVE_CLM_SIU.sourceUrl,
        });
        expect(refusal.code).toBe('protected-soil');
        expect(refusal.legallyGrounded).toBe(true);
        expect(refusal.detail).toContain('39.55000, -3.35000'); // what was asked (the point)
        expect(refusal.detail).toContain('/api/siu/classification'); // …and the query
        expect(refusal.detail).toContain('SUELO NO URBANIZABLE'); // what the source said
        expect(refusal.ordinanceRef).toContain('mapas.fomento.gob.es'); // the register, cited
        expect(refusal.knownFacts.length).toBeGreaterThanOrEqual(4);
    });
});
