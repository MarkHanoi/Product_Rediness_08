// PARIS (Ville de Paris, INSEE 75056) — `resolveParisPluZone`: the PLU bioclimatique zone +
// hauteur-plafond resolver. The honest FR counterpart of `resolveChZone` / `resolveMadridNZ1Ring`.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THE PROBE ESTABLISHED (live 2026-07-25 — see the PARIS-PLU-DATA probe in the report)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Three DISTINCT fidelity tiers for a Paris parcel, and this resolver keeps them apart:
//
//   1. ZONE IDENTITY — **structured, published, point-queryable.** The Géoportail de l'urbanisme
//      national WFS (`data.geopf.fr/wfs/ows`, layer `wfs_du:zone_urba`) returns the PLU zone code
//      (`libelle`, e.g. `UG`), its long label (`libelong`, "Zone urbaine générale"), the zone type
//      (`typezone`, `U`), the governing règlement document (`nomfic`, e.g.
//      `75056_reglement_20260616.pdf`) and the plan id (`idurba`, `75056_PLU_20260616`). This is a
//      genuine `structured`-confidence identity win — the SAME shape as Switzerland's Outcome B.
//
//   2. HAUTEUR PLAFOND — **structured & NUMERIC.** Paris opendata `plub_hauteur.hauteur` publishes
//      the height ceiling (metres) as SURFACIC polygons (values 18 / 25 / 31 / 37 m across the
//      commune; article 3.2.1 / 3.2.3 of the PLU-b règlement). A point-in-polygon returns one clean
//      integer. This is the field that lifts Paris ABOVE Switzerland: a real, citable height number.
//
//   3. EMPRISE AU SOL / GABARIT / rear-cour — **PDF-BOUND.** NO structured coverage/emprise field
//      exists in any WFS or opendata layer (probed: `plub_zonage` carries only the zone code). The
//      emprise, the gabarit-enveloppe taper and the mandatory rear courtyard are stated only in the
//      règlement PDF. So this resolver NEVER returns a coverage or a footprint rule — fabricating an
//      emprise is exactly the §CONTEXT-DATA-HONESTY failure (a cited refusal beats an invented ratio).
//
// ⇒ This resolver returns (1) + (2) — the parts that are real DATA — and the buildable-envelope
//    decision is made by the caller against `FR_PARIS_PLU_CERTIFIED` (below): while the gate is
//    closed the dispatcher renders a cited refusal that CARRIES the real zone + the real hauteur as
//    knownFacts and names the règlement for the missing emprise; only under the human cert does it
//    apply the hauteur to the parcel footprint as a massing cap.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// HONESTY PROPERTIES — read before changing this file
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. IT NEVER THROWS. Every miss / unreachable endpoint / non-OK / malformed body returns a typed
//      refusal or a null-carrying ok, so the L5 dispatcher shows a cited refusal, never a fabricated
//      number (mirrors `resolveChZone` / `resolveMadridNZ1Ring`).
//   2. IT NEVER FABRICATES A HEIGHT. `hauteurPlafond_m` is populated ONLY from a single clean
//      positive number the opendata layer published; absence / a non-finite value → `null` (honest
//      withheld), NEVER 0 and NEVER a guess. A parcel with a zone but no height sector (the secteur
//      sauvegardé / PSMV, which the PLU height layer deliberately excludes) returns zone + null height.
//   3. IT DOES NOT INVENT AN EMPRISE. There is no coverage/footprint field ANYWHERE in this module's
//      output — not a fillable null, but structurally absent, because the sources do not publish it.
//
// LAYERING (C58 §1.9): the fetch (through the C57 same-origin proxy `/api/paris/plu`, never
// browser→data.geopf.fr / opendata.paris.fr directly under CSP) is the ONE impure seam;
// `parseParisPluResponse` is PURE + deterministic and is what the fixture tests exercise. Injectable
// `fetchImpl`. OTel span `pryzm.zoning.resolveParisPlu` (C58 §1.10 / P8).
//
// Strategic context — C58 §1.2/§1.4/§1.5/§1.10, ADR-0270 (why height is DATA but emprise is not a
// number we may invent), and the Switzerland Outcome-B precedent (`chGrundnutzungProvider.ts`).

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { isInParis } from './parisBbox.js';

const tracer = trace.getTracer('pryzm.zoning');

/** The same-origin proxy route the client calls (never data.geopf.fr / opendata.paris.fr directly — C57 CSP). */
export const PARIS_PLU_PATH = '/api/paris/plu';

/** The GPU national WFS layer the zone identity is read from (probe §1). */
export const PARIS_ZONE_URBA_LAYER = 'wfs_du:zone_urba';

/** The Paris opendata dataset the numeric hauteur plafond is read from (probe §2). */
export const PARIS_HAUTEUR_DATASET = 'plub_hauteur';

/**
 * The identified Paris PLU zone — the STRUCTURED identity half. Every field mirrors a `zone_urba`
 * element from the GPU WFS (probe §1). There is DELIBERATELY no emprise / coverage / setback field:
 * those are PDF-bound and are refused, never carried here as a fillable null.
 */
export interface ParisZoneIdentification {
    /** `libelle` — the PLU zone code (e.g. `UG`). Keys the (small) rule pack. */
    readonly zoneCode: string;
    /** `libelong` — the long label (e.g. `Zone urbaine générale`), or null. */
    readonly zoneLabel: string | null;
    /** `typezone` — the CNIG zone type (`U` urbaine, `AU`, `A`, `N`), or null. */
    readonly typeZone: string | null;
    /** `nomfic` — the governing règlement document filename (e.g. `75056_reglement_20260616.pdf`), or null. */
    readonly reglementDoc: string | null;
    /** `idurba` — the plan identifier (e.g. `75056_PLU_20260616`), or null. */
    readonly planId: string | null;
    /** `datappro` — the plan approval date (ISO-ish string), or null. */
    readonly approvedOn: string | null;
}

/** Why a Paris PLU resolution refused. Closed vocabulary — these are operationally distinct. */
export type ParisPluRefusalReason =
    /** The point is outside the loose Ville-de-Paris bbox — nothing to query. */
    | 'out-of-paris'
    /** No `fetch`, the proxy could not be reached, or it returned a non-OK / bodyless response. */
    | 'endpoint-unreachable'
    /** The proxy answered but carried neither a zone nor a hauteur at the point (no PLU data here). */
    | 'no-plu-here';

export type ParisPluResolution =
    | {
          readonly ok: true;
          /** The identified PLU zone, or null when the point carried a hauteur but no parsable zone. */
          readonly zone: ParisZoneIdentification | null;
          /**
           * The hauteur plafond in METRES — populated ONLY from a single clean positive number the
           * opendata layer published; `null` for absence (honest withheld, never 0, never fabricated).
           * A secteur-sauvegardé parcel (no PLU height sector) legitimately returns a zone + null here.
           */
          readonly hauteurPlafond_m: number | null;
      }
    | { readonly ok: false; readonly reason: ParisPluRefusalReason };

/** Injectable dependencies so the resolver is unit-testable without the network (mirrors `ChZoneDeps`). */
export interface ParisPluDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy path base (default `PARIS_PLU_PATH`). */
    readonly pathBase?: string;
}

/**
 * The raw combined body the `/api/paris/plu` proxy returns: the GPU zone identity and the opendata
 * hauteur, already extracted server-side (all the WFS/ODSQL knowledge lives in the proxy, C58 §1.5).
 * Both halves are independently nullable — a point may have a zone but no height sector, or vice versa.
 */
export interface ParisPluProxyResponse {
    readonly zone?: {
        readonly libelle?: unknown;
        readonly libelong?: unknown;
        readonly typezone?: unknown;
        readonly nomfic?: unknown;
        readonly idurba?: unknown;
        readonly datappro?: unknown;
    } | null;
    readonly hauteur?: {
        readonly hauteur_m?: unknown;
    } | null;
}

/** Read a string field verbatim (trimmed), or null for absence / blank / non-string. */
function readStr(raw: unknown): string | null {
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
    if (typeof raw !== 'string') return null;
    const s = raw.trim();
    return s === '' ? null : s;
}

/**
 * Read the hauteur as a clean positive NUMBER of metres, or null (honest withheld). Tolerates a
 * numeric or a numeric-string value; a comma decimal is normalised. NEVER returns 0 or a negative —
 * a zero/absent height is honest absence, not "build nothing here" and not a fabricated value.
 */
function readHauteurMetres(raw: unknown): number | null {
    if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null;
    if (typeof raw !== 'string') return null;
    const s = raw.trim().replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    const n = Number.parseFloat(s);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * PURE — map the proxy's combined body into the resolver's `{ zone, hauteurPlafond_m }` shape.
 * Deterministic; no I/O, no guess. A zone with no `libelle` is dropped (an identity needs a code);
 * a non-positive / absent hauteur becomes null. Returns null for both halves absent (the caller then
 * refuses `no-plu-here`).
 */
export function parseParisPluResponse(
    body: ParisPluProxyResponse | null | undefined,
): { zone: ParisZoneIdentification | null; hauteurPlafond_m: number | null } {
    const zoneRaw = body?.zone ?? null;
    const zoneCode = readStr(zoneRaw?.libelle);
    const zone: ParisZoneIdentification | null = zoneCode
        ? {
              zoneCode,
              zoneLabel: readStr(zoneRaw?.libelong),
              typeZone: readStr(zoneRaw?.typezone),
              reglementDoc: readStr(zoneRaw?.nomfic),
              planId: readStr(zoneRaw?.idurba),
              approvedOn: readStr(zoneRaw?.datappro),
          }
        : null;
    const hauteurPlafond_m = readHauteurMetres(body?.hauteur?.hauteur_m);
    return { zone, hauteurPlafond_m };
}

/**
 * Resolve the Paris PLU zone identity + numeric hauteur plafond at a WGS84 point, via the same-origin
 * `/api/paris/plu` proxy (which point-queries the GPU `zone_urba` WFS and the opendata `plub_hauteur`
 * dataset server-side and returns the combined body). NEVER throws — every failure is a typed refusal
 * (see the header honesty properties). It IDENTIFIES the zone and reads the height; it never returns
 * an emprise or a footprint rule — those are PDF-bound and the caller refuses them honestly.
 *
 * @param lat  EPSG:4326 latitude of the parcel's representative point.
 * @param lon  EPSG:4326 longitude.
 */
export async function resolveParisPluZone(
    lat: number,
    lon: number,
    deps: ParisPluDeps = {},
): Promise<ParisPluResolution> {
    const span = tracer.startSpan('pryzm.zoning.resolveParisPlu');
    span.setAttribute('provider', 'gpu-paris-plu-bioclimatique');
    try {
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isInParis(lat, lon)) {
            span.setAttribute('resultFields', 'out-of-paris');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-paris' };
        }

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }
        const base = deps.pathBase ?? PARIS_PLU_PATH;
        const url =
            `${base}?lat=${encodeURIComponent(String(lat))}` +
            `&lon=${encodeURIComponent(String(lon))}`;

        let body: ParisPluProxyResponse | null = null;
        try {
            const res = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } });
            if (!res || !res.ok) {
                span.setAttribute('resultFields', 'upstream-miss');
                span.setStatus({ code: SpanStatusCode.OK });
                return { ok: false, reason: 'endpoint-unreachable' };
            }
            body = (await res.json()) as ParisPluProxyResponse | null;
        } catch (fetchErr) {
            span.setAttribute('resultFields', 'fetch-error');
            span.setStatus({ code: SpanStatusCode.OK });
            console.warn('[paris-plu] fetch failed (non-fatal):', (fetchErr as Error)?.message ?? fetchErr);
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        const { zone, hauteurPlafond_m } = parseParisPluResponse(body);
        if (!zone && hauteurPlafond_m === null) {
            span.setAttribute('resultFields', 'no-plu-here');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-plu-here' };
        }

        span.setAttribute('resultFields', 'plu');
        if (zone) span.setAttribute('zoneCode', zone.zoneCode);
        span.setAttribute('hauteurPlafond', hauteurPlafond_m ?? -1);
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: true, zone, hauteurPlafond_m };
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[paris-plu] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}
