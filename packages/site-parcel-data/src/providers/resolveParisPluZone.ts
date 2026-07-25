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

/** The Paris opendata dataset the numeric hauteur plafond (height CEILING, UG.3.2.1) is read from (probe §2). */
export const PARIS_HAUTEUR_DATASET = 'plub_hauteur';

/** The Paris opendata dataset the HMC (Hauteur Maximale Constructible, UG.3.2.2) overlay is read from. */
export const PARIS_HMC_DATASET = 'plub_hmc';

/** The Paris opendata dataset the filet / gabarit-enveloppe frontage markings are read from. */
export const PARIS_FILET_DATASET = 'plub_filet';

/**
 * Provenance tag for the height ceiling: it is READ from the PLU graphic (opendata `plub_hauteur`),
 * the graphical annex of the règlement — not inferred, not estimated. Carried on every resolution so
 * a consumer can cite the source of `heightCeiling_m` without re-deriving it.
 */
export const PARIS_HAUTEUR_SOURCE = 'PLU_GRAPHIC_DATA' as const;
export type ParisHauteurSource = typeof PARIS_HAUTEUR_SOURCE;

/**
 * The filet `haut` LETTER code → frontage height in METRES (PLU-b gabarit-enveloppe table). `M` means
 * "same height as the existing façade" — NOT a fixed number — so it maps to `null` (an honest withheld,
 * with a note on the refusal), never a fabricated metre value. Codes are matched case-insensitively.
 */
export const PARIS_FILET_CODE_TO_METRES: Readonly<Record<string, number>> = {
    K: 7,
    V: 10,
    O: 12,
    P: 15,
    B: 18,
    N: 20,
    G: 23,
    L: 25,
    // M = "même hauteur que la façade existante" → no fixed metre value (resolved to null).
};

/** Map a filet `haut` code to its frontage height in metres, or null (unknown code, or `M`). */
export function parisFiletMetresForCode(code: string | null | undefined): number | null {
    if (typeof code !== 'string') return null;
    const key = code.trim().toUpperCase();
    if (key === '') return null;
    const m = PARIS_FILET_CODE_TO_METRES[key];
    return typeof m === 'number' && Number.isFinite(m) ? m : null;
}

/**
 * Derive the PLU dataset version (ISO `YYYY-MM-DD`) from the GPU `idurba` plan id, e.g.
 * `75056_PLU_20260616` → `2026-06-16`. The current PLU bioclimatique was voted 16 June 2026; this
 * reads the version LIVE from the resolved plan id rather than hardcoding a dataset date. Returns null
 * when the id carries no parsable trailing `YYYYMMDD` (honest withheld, never a guessed date).
 */
export function parseParisSourceVersion(idurba: string | null | undefined): string | null {
    if (typeof idurba !== 'string') return null;
    const m = idurba.trim().match(/(\d{4})(\d{2})(\d{2})(?!\d)/);
    if (!m) return null;
    const [, y, mo, d] = m;
    const month = Number(mo);
    const day = Number(d);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${y}-${mo}-${d}`;
}

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
          /** The identified PLU zone, or null when the point carried a height/overlay but no parsable zone. */
          readonly zone: ParisZoneIdentification | null;
          /**
           * The height CEILING in METRES — the *plafond* of règlement UG.3.2.1. Populated ONLY from a
           * single clean positive number `plub_hauteur` published; `null` for absence (honest withheld,
           * never 0, never fabricated). ⚠ This is a CEILING, not a max building height — "d'autres
           * règles peuvent limiter à une valeur inférieure" (UG.3.2.1). NEVER relabel it maxBuildingHeight.
           * A secteur-sauvegardé parcel (no PLU height sector) legitimately returns a zone + null here.
           */
          readonly heightCeiling_m: number | null;
          /** Provenance of `heightCeiling_m` — always the PLU graphic annex (see `PARIS_HAUTEUR_SOURCE`). */
          readonly hauteurSource: ParisHauteurSource;
          /**
           * @deprecated Transitional alias of `heightCeiling_m` (identical value) kept so the L5
           * dispatcher compiles unchanged during the rename. Read `heightCeiling_m` in new code.
           */
          readonly hauteurPlafond_m: number | null;
          /**
           * The HMC (Hauteur Maximale Constructible, UG.3.2.2) ceiling in METRES from the `plub_hmc`
           * overlay — a SEPARATE field from `heightCeiling_m`, NEVER collapsed into it. `null` where the
           * overlay does not cover the point (honest absence). ⚠ Read `hmcDatum`: when it is `NGF` this
           * is an ABSOLUTE altitude (metres NGF), not a metres-above-ground height.
           */
          readonly hmc_m: number | null;
          /** The datum of `hmc_m` (e.g. `NGF` = absolute altitude), or null. Guards against misreading. */
          readonly hmcDatum: string | null;
          /** The raw filet frontage `haut` letter code (e.g. `N`), or null (no filet near the point). */
          readonly filetCode: string | null;
          /**
           * The nearest filet frontage height in METRES, mapped from `filetCode` via the gabarit table
           * (see `PARIS_FILET_CODE_TO_METRES`). `null` for code `M` ("same as existing façade") or an
           * unknown code — honest withheld, never a fabricated metre value. Informational (a nearby
           * frontage marking), never applied as a per-parcel constraint.
           */
          readonly filetFrontageHeight_m: number | null;
          /** PLU dataset version `YYYY-MM-DD` derived from the plan `idurba` (see `parseParisSourceVersion`), or null. */
          readonly sourceVersion: string | null;
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
    /** HMC overlay half (UG.3.2.2): `hmc_m` numeric ceiling, `datum` its reference (e.g. `NGF`). */
    readonly hmc?: {
        readonly hmc_m?: unknown;
        readonly datum?: unknown;
    } | null;
    /** Nearest filet frontage marking: raw `code` (the `haut` letter). */
    readonly filet?: {
        readonly code?: unknown;
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

/** The PURE-parse result: the four structured facts + the derived version, all independently nullable. */
export interface ParisPluParsed {
    readonly zone: ParisZoneIdentification | null;
    /** The height CEILING (UG.3.2.1) in metres, or null (honest withheld). NEVER a maxBuildingHeight. */
    readonly heightCeiling_m: number | null;
    /** The HMC (UG.3.2.2) ceiling in metres, or null — a SEPARATE field, never merged with the ceiling. */
    readonly hmc_m: number | null;
    /** The datum of `hmc_m` (e.g. `NGF` = absolute altitude), or null. */
    readonly hmcDatum: string | null;
    /** The raw filet frontage `haut` code (e.g. `N`), or null. */
    readonly filetCode: string | null;
    /** The filet frontage height in metres mapped from the code, or null (code `M`/unknown). */
    readonly filetFrontageHeight_m: number | null;
    /** The PLU dataset version `YYYY-MM-DD` derived from the zone's `idurba`, or null. */
    readonly sourceVersion: string | null;
}

/**
 * PURE — map the proxy's combined body into the resolver's structured shape. Deterministic; no I/O, no
 * guess. A zone with no `libelle` is dropped (an identity needs a code); a non-positive / absent height
 * becomes null. HMC stays a DISTINCT field (never folded into the ceiling); the filet code is mapped to
 * metres via the gabarit table (`M`/unknown → null). `sourceVersion` is derived from the plan `idurba`.
 * Returns all-null when the body is empty (the caller then refuses `no-plu-here`).
 */
export function parseParisPluResponse(body: ParisPluProxyResponse | null | undefined): ParisPluParsed {
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
    const heightCeiling_m = readHauteurMetres(body?.hauteur?.hauteur_m);
    const hmc_m = readHauteurMetres(body?.hmc?.hmc_m);
    const hmcDatum = hmc_m !== null ? readStr(body?.hmc?.datum) : null;
    const filetCode = readStr(body?.filet?.code)?.toUpperCase() ?? null;
    const filetFrontageHeight_m = parisFiletMetresForCode(filetCode);
    const sourceVersion = parseParisSourceVersion(zone?.planId);
    return { zone, heightCeiling_m, hmc_m, hmcDatum, filetCode, filetFrontageHeight_m, sourceVersion };
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

        const parsed = parseParisPluResponse(body);
        const { zone, heightCeiling_m, hmc_m, hmcDatum, filetCode, filetFrontageHeight_m, sourceVersion } =
            parsed;
        // no-plu-here is gated on the PRIMARY identity (zone + ceiling); HMC/filet ride along only when
        // one of those is present (an enrichment never stands in for the identity).
        if (!zone && heightCeiling_m === null) {
            span.setAttribute('resultFields', 'no-plu-here');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-plu-here' };
        }

        span.setAttribute('resultFields', 'plu');
        if (zone) span.setAttribute('zoneCode', zone.zoneCode);
        span.setAttribute('heightCeiling', heightCeiling_m ?? -1);
        span.setAttribute('hmc', hmc_m ?? -1);
        if (filetCode) span.setAttribute('filetCode', filetCode);
        if (sourceVersion) span.setAttribute('sourceVersion', sourceVersion);
        span.setStatus({ code: SpanStatusCode.OK });
        return {
            ok: true,
            zone,
            heightCeiling_m,
            hauteurSource: PARIS_HAUTEUR_SOURCE,
            hauteurPlafond_m: heightCeiling_m, // @deprecated transitional alias (see the type).
            hmc_m,
            hmcDatum,
            filetCode,
            filetFrontageHeight_m,
            sourceVersion,
        };
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[paris-plu] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}
