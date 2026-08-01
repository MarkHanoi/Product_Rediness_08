// §L-663 — THE ESTIMATED PACK IS UNREACHABLE INSIDE A REGISTERED JURISDICTION.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS PINS, AND THE PROD SESSION THAT EARNED IT
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Founder, prod build `6f7c9fd5`, 2026-08-01. A boundary hand-drawn at Carrer de la Diputació ×
// Carrer de Roger de Llúria — central Eixample, clau `13a`, four shipped Barcelona rule packs —
// rendered the generic `estimated-default` triple: front 3.0 m / side 1.5 m / rear 3.0 m,
// FAR 2.00, coverage 50 %, max height 12 m, badged `EST · zone generic-urban · no citation`.
// The SAME block, Catastro-SELECTED (refcat `0627603DF3802H`, CL DIPUTACIO 276), resolved clau
// 13a from the Generalitat MUC on the same build and refused honestly. Two answers, one piece of
// land, and the fabricated one is the one that draws a purple volume.
//
// The badge was never the defect. The defect is that a ROUTING FAILURE — `fetchQualificationAtPoint`
// returning `null`, which today conflates a Generalitat outage, a non-200, a non-JSON body and a
// genuine empty — was converted into a NUMBER. §CONTEXT-DATA-HONESTY: an outage, a genuine empty
// and a resolved-but-unpacked zone are THREE different answers, and none of them is 3.0/1.5/3.0.
//
// ⚠ WHY THIS SUITE DRIVES THE REAL `dispatchParcelBoundary` AND STUBS ONLY THE PROXIES.
// The bug was not in any rule pack — every Barcelona pack, refusal and disposition test was green
// while prod published the fabrication. It lived in the DISPATCH, in fifteen `applyEstimatedZoning`
// guard/`catch` call sites whose failure mode was "publish a number". Only exercising the dispatcher
// can catch that class, which is the same argument `murciaSiteDispatch.test.ts` makes for
// reachability. Nothing about the routing, the ordering or the fallback is mocked here.
//
// THE FOUR CLAIMS:
//   1. A Barcelona parcel whose zone lookup FAILS (a 502) gets a cited refusal, never the triple.
//   2. A Barcelona parcel whose zone lookup returns a GENUINE EMPTY also refuses — failure and
//      empty may not collapse into a number, even though (today) they still collapse into the
//      same refusal. Both wrong answers are excluded; the remaining distinction is the open
//      provider-level half of §L-663, recorded in `zoneRefusal.ts`.
//   3. The city's OWN zone-named refusal still wins where the clau IS known — the generic card is
//      a last resort, not a replacement for Barcelona's `13a` cards.
//   4. Land NO registration claims still receives the estimated triple, honestly badged. The
//      guard is scoped; `estimated-default` is not dead (C58 §1.6).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SiteModelStore, siteCreate } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import {
    dispatchParcelBoundary,
    getLastBuildableEnvelope,
} from '../src/ui/site/siteDispatch.js';

/**
 * Carrer de la Diputació × Carrer de Roger de Llúria. The founder's own click, and the dead centre
 * of the Cerdà grid: `13a` (*Densificació Urbana Intensiva*) territory, whose pack has shipped
 * since 2026-07-20.
 */
const EIXAMPLE = { lat: 41.3925, lon: 2.165 } as const;

/**
 * Lisbon — chosen because NO registration in `listJurisdictionCoverage()` claims it. Deliberately
 * not "the middle of the ocean": the control has to be plausible URBAN land a user could really
 * draw on, or it would prove nothing about the estimate still being reachable where it is honest.
 */
const UNCOVERED = { lat: 38.7223, lon: -9.1393 } as const;

/**
 * A HAND-DRAWN ring in scene metres — irregular, as a hand-drawn one is, and NOT a cadastral
 * outline. ~900 m², the order of the founder's parcel (the Catastro one measured 905 m²).
 */
const HAND_DRAWN = {
    polygon: [
        { x: 0, z: 0 },
        { x: 31, z: 2 },
        { x: 33, z: 29 },
        { x: 2, z: 27 },
    ],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

/** The estimated-default pack's verbatim numbers — the exact fabrication that must not appear. */
const ESTIMATED_TRIPLE = {
    front_m: 3,
    side_m: 1.5,
    rear_m: 3,
    maxFAR: 2,
    maxHeight_m: 12,
    maxCoverage: 0.5,
    zoneCode: 'generic-urban',
} as const;

interface RouteLog {
    readonly urls: string[];
}

type MucReply =
    /** The Generalitat proxy is down / erroring — a FAILURE. */
    | { readonly kind: 'http-error'; readonly status: number }
    /** The proxy answered and resolved nothing — a genuine EMPTY. */
    | { readonly kind: 'empty' }
    /** The proxy resolved a clau. */
    | { readonly kind: 'clau'; readonly clau: string; readonly clauLabel: string; readonly mucCode: string };

/**
 * Stub the same-origin proxies this path calls. Any OTHER URL rejects — a unit test may reach no
 * network, and a path that quietly started calling something else must surface here rather than
 * hang. (Best-effort callers such as the context-building prefetch swallow the rejection.)
 */
function stubProxies(log: RouteLog, muc: MucReply, catastroParcel: unknown): typeof globalThis.fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        log.urls.push(url);
        if (url.startsWith('/api/muc/zoning')) {
            if (muc.kind === 'http-error') {
                return { ok: false, status: muc.status, statusText: 'Bad Gateway' } as unknown as Response;
            }
            if (muc.kind === 'empty') {
                return { ok: true, status: 200, json: async () => ({ zoning: null }) } as unknown as Response;
            }
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    zoning: {
                        clau: muc.clau,
                        clauLabel: muc.clauLabel,
                        mucCode: muc.mucCode,
                        mucLabel: 'Residencial',
                        ineCode: '08019',
                        source: 'muc-gencat',
                        sourceLayer: 'MUCVW_MUCS_QUAL',
                    },
                }),
            } as unknown as Response;
        }
        if (url.startsWith('/api/catastro/parcel')) {
            return { ok: true, status: 200, json: async () => catastroParcel } as unknown as Response;
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
    muc: MucReply,
    catastroParcel: unknown = { parcel: null },
): Promise<{ store: SiteModelStore; envelope: BuildableEnvelope | null; urls: string[] }> {
    const log: RouteLog = { urls: [] };
    globalThis.fetch = stubProxies(log, muc, catastroParcel);
    const store = new SiteModelStore();
    // A fresh id per scenario. Plain `proj-N`: `site.create` validates the shape of the id, and a
    // lat/lon-derived one (dots, minus signs) is rejected — which cost one debugging round.
    const projectId = `proj-l663-${++_projectSeq}`;
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

/**
 * The single assertion the founder's screenshot violates. Kept as one helper so every scenario
 * states the SAME prohibition rather than each re-deciding what "no fabrication" means.
 */
function expectNoEstimatedTriple(store: SiteModelStore, envelope: BuildableEnvelope | null): void {
    const parcel = store.getSite()!.parcel;
    expect(parcel.zoning.jurisdictionRef).not.toBe('estimated-default');
    expect(parcel.zoning.category).not.toBe(ESTIMATED_TRIPLE.zoneCode);
    expect(parcel.maxFAR).not.toBe(ESTIMATED_TRIPLE.maxFAR);
    expect(parcel.maxHeight).not.toBe(ESTIMATED_TRIPLE.maxHeight_m);
    // The setbacks are the shape claim, and the one that renders as a volume.
    expect(parcel.setbacks?.front ?? null).not.toBe(ESTIMATED_TRIPLE.front_m);
    expect(parcel.setbacks?.side ?? null).not.toBe(ESTIMATED_TRIPLE.side_m);
    expect(parcel.setbacks?.rear ?? null).not.toBe(ESTIMATED_TRIPLE.rear_m);
    // …and nothing extrudable survives on the cached envelope either.
    expect(envelope!.confidence).not.toBe('estimated-ruleset');
    expect(envelope!.maxFAR).toBeNull();
    expect(envelope!.maxHeight_m).toBeNull();
    expect(envelope!.maxCoverage).toBeNull();
    expect(envelope!.insetPolygon).toEqual([]);
    expect(envelope!.insetAreaM2).toBe(0);
    expect(parcel.buildableRing).toBeNull();
}

describe('§L-663 — a hand-drawn Eixample boundary never receives the estimated-default triple', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('the MUC lookup FAILS (502) → a cited refusal, NOT 3.0/1.5/3.0 + FAR 2.0 + 50 %', async () => {
        const { store, envelope } = await commitBoundaryAt(EIXAMPLE, { kind: 'http-error', status: 502 });

        // ⚠ THE ASSERTION THE FOUNDER'S SCREENSHOT FAILS.
        expect(envelope).not.toBeNull();
        expectNoEstimatedTriple(store, envelope);

        // …and what IS published is an honest, transient, uncited-by-design refusal.
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
        expect(envelope!.refusal!.code).toBe('source-data-unavailable');
        // A statement about PRYZM's data path, never about the law. A legally-grounded code here
        // would assert an ordinance fact about someone's land that we never established.
        expect(envelope!.refusal!.legallyGrounded).toBe(false);
        // No citation: nothing about the ordinance failed, our lookup did (the L-526 discipline).
        expect(envelope!.refusal!.ordinanceRef).toBeNull();
        expect(envelope!.confidence).toBe('not-determined');
        // No zone was resolved, so none is claimed — not even a placeholder.
        expect(envelope!.zoneCode).toBeNull();
        // L-553 rule 1 — the card proves we identified the user's land, at the coarsest
        // granularity we can honestly claim: the jurisdiction, read live from the registry.
        expect(envelope!.refusal!.headline).toContain('Barcelona');
        expect(envelope!.refusal!.knownFacts.join(' | ')).toContain('Barcelona');
        // …and it says WHY nothing is drawn, in the user's terms.
        expect(envelope!.refusal!.detail).toMatch(/generic/i);
        // The jurisdiction IS recorded — we knew whose land it was, just not which zone.
        expect(store.getSite()!.parcel.zoning.jurisdictionRef).toBe('es-08019-barcelona');
    });

    it('the MUC answers and resolves NOTHING → still a refusal; an empty is not a number either', async () => {
        const { store, envelope } = await commitBoundaryAt(EIXAMPLE, { kind: 'empty' });
        expectNoEstimatedTriple(store, envelope);
        expect(envelope!.refusal).toBeTruthy();
        expect(envelope!.status).toBe('none');
    });

    it('routes through Barcelona at the PARCEL centroid — the guard cannot be reached by accident', async () => {
        const { urls } = await commitBoundaryAt(EIXAMPLE, { kind: 'http-error', status: 502 });
        // If the `isInBarcelona` branch were removed from `applyZoning`, no MUC call would be made
        // and the estimate would be dispatched by the untouched fall-through — so this call being
        // present is what proves the refusal above came from the Barcelona path, not from nowhere.
        const mucCall = urls.find((u) => u.startsWith('/api/muc/zoning'));
        expect(mucCall).toBeDefined();
        const q = new URLSearchParams(mucCall!.split('?')[1]!);
        // §L-521 — the query point is the PARCEL'S AREA CENTROID, not the site anchor. Assert
        // proximity rather than a literal: it must land on the drawn boundary (within ~50 m).
        expect(Math.abs(Number(q.get('lat')) - EIXAMPLE.lat)).toBeLessThan(5e-4);
        expect(Math.abs(Number(q.get('lon')) - EIXAMPLE.lon)).toBeLessThan(5e-4);
    });

    it("the city's OWN zone-named refusal still wins where the clau IS known", async () => {
        // MUC resolves 13a; Catastro has no parcel ⇒ no refcat ⇒ §L-574 `block-unavailable`.
        // The generic §L-663 card is a LAST RESORT and must not displace the better one.
        const { store, envelope } = await commitBoundaryAt(
            EIXAMPLE,
            { kind: 'clau', clau: '13a', clauLabel: 'Densificació Urbana Intensiva', mucCode: 'R2' },
            { parcel: null },
        );
        expectNoEstimatedTriple(store, envelope);
        expect(envelope!.zoneCode).toBe('13a');
        expect(envelope!.refusal!.code).toBe('source-data-unavailable');
        // The zone, in the ordinance's own words, is what separates this card from the generic one.
        expect(envelope!.refusal!.headline).toContain('Densificació Urbana Intensiva');
        expect(envelope!.refusal!.detail).toContain('242.2');
    });
});

describe('§L-663 — the guard is SCOPED: uncovered land keeps the honestly-badged estimate', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('a parcel no registration claims still receives estimated-default (C58 §1.6)', async () => {
        // ⚠ THE OTHER HALF OF THE RULE, and the reason this is not simply "delete the estimated
        // pack". Where PRYZM makes NO other claim about the land, a badged estimate is an honest
        // study aid; suppressing it there would trade a fabrication for a blank screen and buy
        // nothing. The prohibition is specifically about a city we cover contradicting itself.
        const { store, envelope } = await commitBoundaryAt(UNCOVERED, { kind: 'empty' });
        expect(envelope).not.toBeNull();
        expect(envelope!.confidence).toBe('estimated-ruleset');
        expect(envelope!.status).toBe('ok');
        expect(envelope!.refusal).toBeNull();
        const parcel = store.getSite()!.parcel;
        expect(parcel.zoning.jurisdictionRef).toBe('estimated-default');
        expect(parcel.zoning.category).toBe(ESTIMATED_TRIPLE.zoneCode);
        expect(parcel.maxFAR).toBe(ESTIMATED_TRIPLE.maxFAR);
        expect(parcel.maxHeight).toBe(ESTIMATED_TRIPLE.maxHeight_m);
        expect(parcel.setbacks?.front).toBe(ESTIMATED_TRIPLE.front_m);
        expect(parcel.setbacks?.side).toBe(ESTIMATED_TRIPLE.side_m);
        expect(parcel.setbacks?.rear).toBe(ESTIMATED_TRIPLE.rear_m);
    });
});
