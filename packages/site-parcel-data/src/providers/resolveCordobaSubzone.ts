// Córdoba (INE 14021) — the PGOU-2001 SUBZONE resolver (WIRING-TODO 5, the provider half).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// PRYZM binds a Córdoba parcel to its calificación subzone (PAS-2 / MC-3 / …) by asking the COACo
// GeoServer, the live public WFS vectorisation of the PGOU-2001 (CORDOBA-DATA-RECON-SPIKE, §4). It is
// the Córdoba counterpart of `resolveMadridNZ1Ring` / `resolveBcnRefosOV`: the ONE impure seam (a
// fetch through a C57 same-origin proxy) wrapping a deterministic parse.
//
// ⚠⚠ IT IS WIRED, BUT THE HONESTY GATE STAYS CLOSED. `CORDOBA_ENVELOPE_VERIFIED`
// (`esCordobaZoneClassification.ts`) is false until a human signs `sources/VERIFICATION.md`, so the
// L5 dispatcher renders the cited "machine-extracted, unverified" REFUSAL for every Córdoba parcel
// today — this resolver's output is NOT rendered. The wiring means one flag-flip renders it the day
// sign-off lands; until then a resolved subzone binds NO number (§CONTEXT-DATA-HONESTY).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE TWO-STEP RESOLVE (recon §4) — the second step is load-bearing for subzone precision
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   STEP 1 (authoritative subzone) — a spatial INTERSECTS on `coaco:ordenanzas`, then parse the
//     subzone from the `link` BASENAME (`.../O_MC3.pdf` → "MC-3"). This is mandatory: the parcel-join
//     layer carries the FAMILY name only (`Manzana Cerrada`), never the `MC-3` subzone, and MC-1..4
//     differ materially — resolving from the join alone would be confident-wrong. Only `ordenanzas.link`
//     disambiguates it.
//   STEP 2 (attributes + derived-planning override) — a refcat key-join on
//     `coaco:vcatastro_urbanismo` for `sup_pc_m2` (drives the CTP-1 ocupación step-function),
//     `max_plantas` (an INDEPENDENT height corroboration for the L-449 cross-check) and `actuacion`.
//     ⚠ A NON-EMPTY `actuacion` means the parcel is inside one of the 42 derived-planning ámbitos
//     (PP/PERI/ED/SG) and the SUBORDINATE instrument governs — the resolver flags
//     `derivedPlanningOverride: true` so the dispatcher branches to a derived-planning refusal, NOT
//     the base ordenanza (the same precedence PRYZM applies in Barcelona).
//
// ⚠ CRS/axis gotcha (recon §4, documented so nobody loses an hour): the layers are native
// EPSG:25830, and a bare 4326 BBOX silently returns EMPTY. The `/api/cordoba/*` proxy handles the
// axis puzzle SERVER-SIDE (it issues the BBOX with the explicit `urn:ogc:def:crs:EPSG::4326` authority
// axis order, or queries in 25830), so this resolver just sends the parcel's WGS84 point / refcat.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THREE HONESTY PROPERTIES (mirror the sibling resolvers)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. IT NEVER THROWS. Every miss / unreachable endpoint / malformed body returns a typed REFUSAL.
//   2. IT DOES NOT DECIDE TO RENDER. It resolves the DATA; the dispatcher decides, gated on
//      `CORDOBA_ENVELOPE_VERIFIED` (default OFF). A resolved subzone while the gate is closed still
//      shows the unverified refusal.
//   3. IT NEVER INVENTS A SUBZONE. An unparseable / absent `link` yields a typed refusal, never a
//      guessed family (the confident-wrong subzone the recon warns against).
//
// PURITY of the parse (C58 §1.9): the fetch is injected; given the same response the parse is
// byte-deterministic. OTel span `pryzm.zoning.resolveCordobaSubzone` (C58 §1.10 / P8).
//
// Strategic context — CORDOBA-DATA-RECON-SPIKE §4/§5, esCordobaZoneClassification.ts (the gate),
// C57, C58 §1.4/§1.5/§1.9/§1.10, §CONTEXT-DATA-HONESTY.

import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.zoning');

/**
 * Same-origin proxy routes the browser calls (C57 — never geoserver.pgou.coacordoba.org directly).
 * The proxy builds the WFS query (incl. the EPSG:25830/axis handling) and returns the GeoJSON. Wired
 * server-side in `server/cordobaZoningProxy.js`.
 */
export const CORDOBA_ORDENANZAS_PATH = '/api/cordoba/ordenanzas';
export const CORDOBA_VCATASTRO_PATH = '/api/cordoba/vcatastro';

/** A WGS84 point — the frame the resolver queries the subzone by (the proxy reprojects). */
export interface CordobaLngLat {
    readonly lat: number;
    readonly lon: number;
}

/** Injectable dependencies so the adapter is unit-testable without the network. */
export interface CordobaSubzoneDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy base for the `coaco:ordenanzas` spatial query (default `CORDOBA_ORDENANZAS_PATH`). */
    readonly ordenanzasPathBase?: string;
    /** Same-origin proxy base for the `coaco:vcatastro_urbanismo` refcat-join (default `CORDOBA_VCATASTRO_PATH`). */
    readonly vcatastroPathBase?: string;
    /**
     * The Catastro refcat, when PRYZM already resolved it (it does, via the national INSPIRE WFS).
     * When present, STEP 2 runs — attributes + the `actuacion` derived-planning override. When
     * absent the subzone still resolves from STEP 1 (the `link`), just without corroboration.
     */
    readonly refcat?: string | null;
}

/** Why a Córdoba subzone resolution refused. Closed vocabulary — these are operationally distinct. */
export type CordobaSubzoneRefusalReason =
    /** No usable WGS84 point was supplied — nothing to intersect the calificación plane by. */
    | 'no-point'
    /** No `fetch` available, the endpoint could not be reached, or it returned a non-OK / bad body. */
    | 'endpoint-unreachable'
    /** The point-intersect returned no `coaco:ordenanzas` feature (outside the 2-district pilot). */
    | 'no-subzone'
    /** A feature was returned but its `link` carried no parseable subzone basename. */
    | 'unparseable-subzone';

export interface CordobaSubzoneResolution {
    /** The precise subzone code, from the `link` basename (`O_MC3.pdf` → `MC-3`). */
    readonly subzone: string;
    /** The COACo family name (`Manzana Cerrada`, …) — coarser than `subzone`; echoed for provenance. */
    readonly ordenanza: string | null;
    /** The raw `O_*` link basename the subzone was parsed from (`O_MC3`). */
    readonly linkBasename: string | null;
    /** `sup_pc_m2` from the refcat-join (STEP 2) — drives the CTP-1 ocupación step-function. */
    readonly supPcM2: number | null;
    /** `max_plantas` from the refcat-join — an INDEPENDENT height corroboration for the L-449 cross-check. */
    readonly maxPlantas: number | null;
    /** The raw `actuacion` value, or null when the parcel is in no derived-planning ámbito. */
    readonly actuacion: string | null;
    /**
     * ⚠ TRUE when `actuacion` is non-empty — a derived-planning ámbito (PP/PERI/ED/SG) governs, so the
     * base ordenanza does NOT apply and the dispatcher must branch to a derived-planning refusal.
     */
    readonly derivedPlanningOverride: boolean;
}

export type CordobaSubzoneResult =
    | { readonly ok: true; readonly resolution: CordobaSubzoneResolution }
    | { readonly ok: false; readonly reason: CordobaSubzoneRefusalReason };

/**
 * Parse a COACo `O_*` subzone `link` (URL or bare basename) into the pack's subzone code:
 * `.../O_MC3.pdf` → `MC-3`, `O_PAS2` → `PAS-2`, `O_UAD3` → `UAD-3`, `O_CTP1` → `CTP-1`,
 * `O_OA1` → `OA-1`, `O_UAS1` → `UAS-1`. A basename with no trailing digits keeps its bare form
 * (`O_PTC` → `PTC`, `O_COMERCIAL` → `COMERCIAL`, `O_EP` → `EP`). Returns null when there is no
 * usable `O_`-prefixed token (never guesses a subzone). PURE.
 */
export function subzoneCodeFromLink(link: unknown): string | null {
    if (typeof link !== 'string') return null;
    const trimmed = link.trim();
    if (trimmed === '') return null;
    // Take the last path segment, strip a `.pdf`/`.PDF` (or any) extension.
    const base = trimmed.split(/[\\/]/).pop() ?? trimmed;
    const noExt = base.replace(/\.[a-z0-9]+$/i, '');
    // Require the COACo `O_` family prefix; the token after it is the subzone.
    const m = /^O_([A-Za-z]+)(\d*)$/.exec(noExt);
    if (!m) return null;
    const letters = m[1]!.toUpperCase();
    const digits = m[2] ?? '';
    return digits === '' ? letters : `${letters}-${digits}`;
}

/** Coerce a WFS numeric property (number, or a numeric string, possibly comma-decimal) → number|null. */
function numFromProp(v: unknown): number | null {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    const s = v.trim().replace(',', '.');
    if (s === '') return null;
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : null;
}

/** Read the first WFS feature's `properties` from a GeoJSON body, or null. Never throws. */
function firstProps(body: unknown): Record<string, unknown> | null {
    const features = (body as { features?: unknown } | null)?.features;
    const feature = Array.isArray(features) ? features[0] : null;
    if (!feature || typeof feature !== 'object') return null;
    const props = (feature as { properties?: unknown }).properties;
    return props && typeof props === 'object' ? (props as Record<string, unknown>) : null;
}

async function fetchJson(fetchImpl: typeof fetch, url: string): Promise<{ ok: true; body: unknown } | { ok: false }> {
    try {
        const res = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } });
        if (!res || !res.ok) return { ok: false };
        return { ok: true, body: await res.json() };
    } catch (err) {
        console.warn('[cordoba-subzone] fetch failed (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false };
    }
}

/**
 * Resolve a Córdoba parcel's PGOU-2001 subzone (recon §4). STEP 1 spatial-intersects
 * `coaco:ordenanzas` at the WGS84 point and parses the `link` basename; STEP 2 (when a refcat is
 * supplied) key-joins `coaco:vcatastro_urbanismo` for the attributes + the derived-planning override.
 * NEVER throws — every failure is a typed refusal (three honesty properties in the header).
 *
 * @param point  the parcel query point (WGS84); the subzone polygon is found by point-in-polygon.
 * @param deps   injectable fetch + proxy bases + an optional refcat for STEP 2.
 */
export async function resolveCordobaSubzone(
    point: CordobaLngLat | null | undefined,
    deps: CordobaSubzoneDeps = {},
): Promise<CordobaSubzoneResult> {
    const span = tracer.startSpan('pryzm.zoning.resolveCordobaSubzone');
    span.setAttribute('provider', 'coaco-pgou');
    try {
        if (
            !point ||
            typeof point.lat !== 'number' ||
            typeof point.lon !== 'number' ||
            !Number.isFinite(point.lat) ||
            !Number.isFinite(point.lon)
        ) {
            span.setAttribute('resultFields', 'no-point');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-point' };
        }

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        // ── STEP 1 — authoritative subzone from `coaco:ordenanzas.link` ──────────────────────────
        const ordBase = deps.ordenanzasPathBase ?? CORDOBA_ORDENANZAS_PATH;
        const ordUrl =
            `${ordBase}?lat=${encodeURIComponent(String(point.lat))}` +
            `&lon=${encodeURIComponent(String(point.lon))}`;
        const ordRes = await fetchJson(fetchImpl, ordUrl);
        if (!ordRes.ok) {
            span.setAttribute('resultFields', 'endpoint-unreachable');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }
        const ordProps = firstProps(ordRes.body);
        if (!ordProps) {
            span.setAttribute('resultFields', 'no-subzone');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-subzone' };
        }
        const link = ordProps['link'];
        const subzone = subzoneCodeFromLink(link);
        if (!subzone) {
            span.setAttribute('resultFields', 'unparseable-subzone');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'unparseable-subzone' };
        }
        const ordenanza =
            typeof ordProps['ordenanza'] === 'string' && ordProps['ordenanza'].trim() !== ''
                ? (ordProps['ordenanza'] as string).trim()
                : null;
        const linkBasename = ((): string | null => {
            if (typeof link !== 'string') return null;
            const base = link.trim().split(/[\\/]/).pop() ?? '';
            const noExt = base.replace(/\.[a-z0-9]+$/i, '');
            return noExt || null;
        })();

        // ── STEP 2 — attributes + derived-planning override (only when a refcat is supplied) ─────
        let supPcM2: number | null = null;
        let maxPlantas: number | null = null;
        let actuacion: string | null = null;
        const refcat = typeof deps.refcat === 'string' ? deps.refcat.trim() : '';
        if (refcat !== '') {
            const vcBase = deps.vcatastroPathBase ?? CORDOBA_VCATASTRO_PATH;
            const vcUrl = `${vcBase}?refcat=${encodeURIComponent(refcat)}`;
            const vcRes = await fetchJson(fetchImpl, vcUrl);
            if (vcRes.ok) {
                const vcProps = firstProps(vcRes.body);
                if (vcProps) {
                    supPcM2 = numFromProp(vcProps['sup_pc_m2']);
                    maxPlantas = numFromProp(vcProps['max_plantas']);
                    const rawAct = vcProps['actuacion'];
                    actuacion =
                        typeof rawAct === 'string' && rawAct.trim() !== '' ? rawAct.trim() : null;
                }
            }
            // A vcatastro miss is NON-fatal: STEP 1 already bound the subzone; STEP 2 is corroboration.
        }

        span.setAttribute('resultFields', 'ok');
        span.setAttribute('subzone', subzone);
        span.setAttribute('derivedPlanningOverride', String(actuacion !== null));
        span.setStatus({ code: SpanStatusCode.OK });
        return {
            ok: true,
            resolution: {
                subzone,
                ordenanza,
                linkBasename,
                supPcM2,
                maxPlantas,
                actuacion,
                derivedPlanningOverride: actuacion !== null,
            },
        };
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[cordoba-subzone] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}
