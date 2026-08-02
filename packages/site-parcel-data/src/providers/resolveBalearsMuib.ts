// ILLES BALEARS — `resolveBalearsMuib`: the LIVE zone + *fitxa* reader, and the ONE impure seam that
// the pure parser (`balearsMuibFitxa.ts`) and the pure rule builder (`esBalearsMuib.ts`) sit either
// side of.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THE SOURCE IS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// GOIB **MUIB** (*Mapa Urbanístic de les Illes Balears*) — an ArcGIS REST MapServer, PUBLIC and
// KEYLESS, published by the Govern de les Illes Balears at
//
//     https://ideib.caib.es/geoserveis/rest/services/public/GOIB_MUIB/MapServer
//
// Layer **10 `QUALIFICACIONS`** carries the zoning polygons. It publishes NO numeric parameter — no
// altura, no edificabilitat, no ocupació, no reculada. What it publishes is `URL`, at **100 %
// coverage and 5,273 distinct values**, pointing at a per-zone ***fitxa*** at
// `muib.caib.es/mapurbibfront/normativa.jsp?identitat=NNN`.
//
// ⭐ AND THAT FITXA IS A STRUCTURED TABLE, NOT A PDF. Manacor `RE-NA` prints, as rows:
//     `PM 200 m²` · `NP 3 plantes` · `O 80 %` · `E 2.4`, citing **Article 66** and **Article 56.3.j**.
// That is why Balears is worth an adapter at all: the parameters are MACHINE-READABLE, per zone,
// island-wide — the best `P` measured anywhere in Spain (74.1 % of private developable land is
// any-drawable; 61.4 % of it carries a complete rule).
//
// ⛔ `CODIAJ` IS NOT A MUNICIPALITY CODE — it is the municipal ZONE LABEL (706 distinct in Palma
// alone). The municipal key is `CODIMUNI`, which is INE-5 with the `07` province prefix stripped;
// `balearsBbox.ts` owns that conversion and records why `'07040'` returns 0 on a clean HTTP 200.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// FIVE HONESTY PROPERTIES — read before changing this file
// ══════════════════════════════════════════════════════════════════════════════════════════════
//  1. IT NEVER THROWS. Every miss, unreachable proxy and malformed body is a TYPED refusal, so the
//     dispatcher always has something honest to render (mirrors `resolveMurciaZoning`/`resolveChZone`).
//  2. FAILURE ≠ EMPTY. The proxy answers `null` when the upstream did not answer and `[]` when it
//     answered empty, and the two never collapse (`endpoint-unreachable` vs `no-zoning-here`) —
//     §CONTEXT-DATA-HONESTY, L-422/457/467/469.
//  3. ⭐ IT REFUSES LAND THE PUBLISHER SAYS IS OUT OF DATE. **23.77 % of Balears buildable land, BY
//     AREA, SELF-DECLARES NOT CURRENT** — Palma, Andratx and Eivissa each write it into `OBS` on the
//     zoning layer itself. Drawing there would publish a superseded plan under a current-sounding
//     citation, so it refuses with the municipality's OWN words quoted back.
//  4. IT APPLIES THE PUBLISHER'S VALIDITY INTERVAL. `DINIVIGEN`/`DFIVIGEN` are MUIB's answer to the
//     question Denmark answers with `bygkunifelt` booleans. ⚠ `DFIVIGEN` is 100 % non-null with the
//     single value **99999999** — a SENTINEL meaning "no end date". It is not a date and must never
//     be compared as one.
//  5. IT REFUSES AMBIGUITY. Two DIFFERENT zone codes covering one point is a boundary, and a zone
//     chosen by `features[0]` is a coin flip.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ WHAT THIS PROVIDER CANNOT KNOW — ADR-0293, AND WHY EVERY BALEARS ENVELOPE IS AN OPEN TOP
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The fitxa gives the ZONE's parameters. It does not give the CONSTRAINTS, and PRYZM models none of
// them: heritage (*catàleg*), flood, airport servitudes, coastal (*Llei de Costes*), environmental
// (Xarxa Natura / ANEI), **and the PTI hierarchy** — the island territorial plans, which do carry
// urban determinations. So under ADR-0293 a Balears envelope is an **OPEN TOP WITH A STATED
// REASON**, never a closed box, and `BALEARS_MISSING_CONSTRAINTS` is that statement carried IN THE
// DATA on every successful resolution — not written once in a doc nobody reads.
//
// ⚠ PTI REACH INTO BUILDABLE LAND MEASURED **0 % BY THE FLAG'S OWN SCOPE** — the published
// abrogation flag names *"les àrees de transició (AT), i la resta de categories del sòl rústic"* and
// nothing else. ⛔ THAT MEASURED THE PUBLISHED FLAG, NOT THE PTIs THEMSELVES. **UNKNOWN NEVER NO**:
// absence of a flag has never been evidence of currency in this corpus, and it is not evidence here.
//
// PURITY: the fetch is INJECTED (C58 §1.9) — given the same bodies the parse is byte-deterministic.
// OTel spans per P8. Strategic context — ADR-0283, ADR-0293, C57 §1.5, C58 §1.4/§1.5/§1.9/§1.10.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { isInBalears, balearsIneFromCodiMuni } from './balearsBbox.js';
import {
    parseBalearsFitxa,
    classifyBalearsFitxa,
    balearsDrawability,
    type BalearsParameters,
    type BalearsDrawability,
    type BalearsParsedFitxa,
} from './balearsMuibFitxa.js';

const tracer = trace.getTracer('pryzm.zoning.balears');

/** The same-origin proxy route the browser calls (never ideib.caib.es directly — C57 CSP). */
export const BALEARS_MUIB_PATH = '/api/es/balears-muib';

/** ⚠ UPSTREAM, for the proxy and for Node-side tooling ONLY. The browser must not call it. */
export const BALEARS_MUIB_SERVICE =
    'https://ideib.caib.es/geoserveis/rest/services/public/GOIB_MUIB/MapServer';

/** Layer id of `QUALIFICACIONS` on GOIB_MUIB (verified against the service's own layer tree). */
export const BALEARS_QUALIFICACIONS_LAYER = 10;

/** Host of the per-zone *fitxa* the `URL` field points at. */
export const BALEARS_FITXA_HOST = 'muib.caib.es';

/**
 * ⚠ `DFIVIGEN`'s SENTINEL. 100 % non-null, single value — it means "no end date", NOT the year 9999.
 * Comparing it as a date is how a sentinel silently becomes a fact.
 */
export const BALEARS_DFIVIGEN_OPEN_ENDED = 99999999;

/**
 * The land CLASSES on which a private buildable envelope can exist at all: `SU` (*sòl urbà*) and
 * `SB` (*sòl urbanitzable*). `SR` (*rústic*) is a different regime and is not answered by a zone fitxa.
 */
export const BALEARS_BUILDABLE_CLASSES: readonly string[] = ['SU', 'SB'];

/**
 * ⛔ THE CONSTRAINT FAMILIES PRYZM DOES NOT MODEL IN THE BALEARS. Carried on every answer (ADR-0293).
 * Each entry can only ever REDUCE a result, so the published solid is an upper bound with respect to
 * all of them — which is exactly what makes the answer an OPEN TOP rather than a closed box.
 */
export const BALEARS_MISSING_CONSTRAINTS: readonly string[] = Object.freeze([
    'heritage — municipal catàleg de patrimoni and BIC declarations (not modelled)',
    'flood — ARPSIs / zones inundables under the Pla Hidrològic de les Illes Balears (not modelled)',
    'airport — servituds aeronàutiques around PMI / MAH / IBZ (not modelled)',
    'coastal — Llei 22/1988 de Costes servitude and the ribera del mar strips (not modelled)',
    'environmental — Xarxa Natura 2000, ANEI / ARIP / APR protection regimes (not modelled)',
    'PTI — the island Plans Territorials Insulars, which DO carry urban determinations. ⚠ MUIB ' +
        'publishes no abrogation flag over buildable land, which is NOT evidence that the PTIs fail ' +
        'to reach it (UNKNOWN NEVER NO)',
]);

/** A WGS84 query point. */
export interface BalearsLatLon {
    readonly lat: number;
    readonly lon: number;
}

/** Injectable dependencies so the resolver is unit-testable without the network. */
export interface BalearsMuibDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy base (default `BALEARS_MUIB_PATH`). */
    readonly pathBase?: string;
    /**
     * ISO date (`YYYY-MM-DD`) the validity interval is tested against. INJECTED so the temporal
     * filter is deterministic in a test and auditable in production — never an implicit `Date.now()`
     * buried inside a parse.
     */
    readonly asOf?: string;
}

/**
 * Why a Balears resolution refused. CLOSED vocabulary — every member is operationally distinct, and
 * ⛔ NONE of them is `null`. A silent null is the failure this union exists to make impossible.
 */
export type BalearsMuibRefusalReason =
    /** The point is outside the loose Balears bbox, or is not finite — nothing to query. */
    | 'out-of-balears'
    /** No `fetch`, the proxy could not be reached, or the zoning layer's upstream did not answer. */
    | 'endpoint-unreachable'
    /** The layer answered and publishes no polygon here (a real negative — e.g. open sea). */
    | 'no-zoning-here'
    /** Polygons cover the point but every one is outside its validity interval (superseded). */
    | 'only-superseded-records'
    /** Two DIFFERENT in-force zone codes cover the point (a boundary) — refuse, never guess. */
    | 'ambiguous-zone'
    /**
     * ⭐ THE MUNICIPALITY ITSELF DECLARES MUIB OUT OF DATE HERE (`OBS`). 23.77 % of buildable land by
     * area. A DURABLE, CITED refusal — and the citation is the publisher's own sentence.
     */
    | 'plan-not-current'
    /** The polygon's land class is not `SU`/`SB` — a zone fitxa does not govern that regime. */
    | 'not-buildable-class'
    /** The feature carries no `URL`, so there is no fitxa to read (measured coverage is 100 %). */
    | 'no-fitxa-url'
    /** The fitxa page could not be fetched. TRANSIENT. */
    | 'fitxa-unreachable'
    /** The fitxa was fetched but the parser could not read code cells it SAW — never a clean zero. */
    | 'fitxa-unparsable'
    /** The fitxa's printed `id entitat` disagrees with the `identitat` this feature asked for. */
    | 'fitxa-identity-mismatch'
    /**
     * The fitxa parsed cleanly and publishes nothing an envelope can be drawn from — notably FAR
     * ALONE, which fixes floor area but neither a footprint nor a height.
     */
    | 'no-drawable-parameters';

/**
 * Is this refusal the RETRYABLE class? Only two members are, and they are exactly the two that mean
 * "the source did not answer" — the `TRANSIENT_FETCH_REASONS` distinction, applied locally so a
 * durable refusal can never be rendered as "retrying".
 */
export function balearsRefusalIsTransient(reason: BalearsMuibRefusalReason): boolean {
    return reason === 'endpoint-unreachable' || reason === 'fitxa-unreachable';
}

/** The verbatim MUIB zoning attributes at the point. Field names are the source's own. */
export interface BalearsZoningFeature {
    /** The MUIB normalised zone code, e.g. `RE_NA`. THE ROUTING KEY. */
    readonly CODIMUIB: string | null;
    /** ⛔ The municipal ZONE LABEL (`RE-NA`), NOT a municipality code. */
    readonly CODIAJ: string | null;
    /** INE-5 minus the `07` province prefix, e.g. `033` for Manacor. */
    readonly CODIMUNI: string | null;
    readonly MUNICIPI: string | null;
    /** The zone's name in the plan's own words. */
    readonly NOM: string | null;
    /** The governing plan's identifier, e.g. `2021_PG_MANACOR_033`. */
    readonly CODIPLA: string | null;
    /** `SU` | `SB` | `SR` — the land class. */
    readonly CODICLAS: string | null;
    /** ⭐ The fitxa URL. 100 % coverage, 5,273 distinct. */
    readonly URL: string | null;
    readonly IDENTITAT: number | null;
    /** ⚠ The self-declared currency statement, when the municipality wrote one. */
    readonly OBS: string | null;
    readonly DINIVIGEN: string | null;
    readonly DFIVIGEN: number | null;
}

/** A successful resolution: the zone identity, the fitxa, and what it can honestly support. */
export interface BalearsMuibRecord {
    readonly feature: BalearsZoningFeature;
    /** The national INE-5 code, composed from `CODIMUNI`. Null when `CODIMUNI` was unreadable. */
    readonly ineCode: string | null;
    /** The fitxa URL actually read. */
    readonly fitxaUrl: string;
    readonly fitxa: BalearsParsedFitxa;
    readonly parameters: BalearsParameters;
    readonly drawability: BalearsDrawability;
    /**
     * The article(s) cited ON an envelope-bearing parameter, where the fitxa cites any.
     *
     * ⚠ EMPTY IS THE COMMON CASE, AND IT IS REPORTED RATHER THAN HIDDEN. Only **2.0 %** of fitxes are
     * both COMPLETE and cite a governing article on the parameter itself. That is a SIGNATURE
     * question — who may sign a transcription that cites no article? — not an engineering one. The
     * provider's duty is to CARRY the article when present and MARK ITS ABSENCE when not, which is
     * what an empty array plus `articleAbsent` means.
     */
    readonly articleRefs: readonly string[];
    /** True when NO article is cited on any envelope-bearing parameter. */
    readonly articleAbsent: boolean;
    /** How many records covering the point were dropped as superseded. Provenance, not a rule. */
    readonly supersededCount: number;
    /** ADR-0293 — the OPEN TOP, in the data. Always non-empty. */
    readonly missingConstraints: readonly string[];
}

export type BalearsMuibResolution =
    | { readonly ok: true; readonly record: BalearsMuibRecord }
    | {
          readonly ok: false;
          readonly reason: BalearsMuibRefusalReason;
          /** Human-readable specifics for a refusal card. Never a number, never a constraint. */
          readonly detail?: string;
          /** The zone identity, when we got far enough to know it. */
          readonly feature?: BalearsZoningFeature;
      };

// ──────────────────────────────────────────────────────────────────────────────────────────────
// PURE HELPERS
// ──────────────────────────────────────────────────────────────────────────────────────────────

function str(bag: Record<string, unknown>, key: string): string | null {
    const v = bag[key];
    if (typeof v === 'string') {
        const t = v.trim();
        return t === '' ? null : t;
    }
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return null;
}

function num(bag: Record<string, unknown>, key: string): number | null {
    const v = bag[key];
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number.parseFloat(v);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/**
 * Read one ArcGIS feature (or a bare attribute bag) into the verbatim zoning record. PURE.
 * Returns null when the row carries no usable zone identity at all.
 */
export function readBalearsZoningFeature(feature: unknown): BalearsZoningFeature | null {
    if (!feature || typeof feature !== 'object') return null;
    const raw = feature as { attributes?: unknown; properties?: unknown };
    const bag =
        (raw.attributes && typeof raw.attributes === 'object' ? raw.attributes : null) ??
        (raw.properties && typeof raw.properties === 'object' ? raw.properties : null) ??
        (feature as Record<string, unknown>);
    const b = bag as Record<string, unknown>;
    const rec: BalearsZoningFeature = {
        CODIMUIB: str(b, 'CODIMUIB'),
        CODIAJ: str(b, 'CODIAJ'),
        CODIMUNI: str(b, 'CODIMUNI'),
        MUNICIPI: str(b, 'MUNICIPI'),
        NOM: str(b, 'NOM'),
        CODIPLA: str(b, 'CODIPLA'),
        CODICLAS: str(b, 'CODICLAS'),
        URL: str(b, 'URL'),
        IDENTITAT: num(b, 'IDENTITAT'),
        OBS: str(b, 'OBS'),
        DINIVIGEN: str(b, 'DINIVIGEN'),
        DFIVIGEN: num(b, 'DFIVIGEN'),
    };
    return rec.CODIMUIB === null && rec.NOM === null && rec.URL === null ? null : rec;
}

/**
 * ⭐ DOES `OBS` DECLARE THAT MUIB IS NOT CURRENT HERE?
 *
 * ⚠ DETECTED FROM THE PUBLISHER'S TEXT, NOT FROM A HARD-CODED MUNICIPALITY LIST. Exactly three
 * distinct `OBS` strings exist on the zoning layer today, all three saying the same thing in the
 * municipality's own words (verbatim, live 2026-08-02):
 *
 *   • *"Palma NO està actualitzat al MUIB segons el darrer planejament aprovat i actualment el MUIB
 *      no mostra l'actual classificació del sòl…"*
 *   • *"Andratx NO està actualitzat al MUIB segons els darrer planejament aprovat…"*
 *   • *"Del municipi d'Eivissa el MUIB NO mostra l'actual normativa vigent…"*
 *
 * A list of three NAMES would be correct today and silently wrong the day a fourth municipality adds
 * the same sentence — and the failure direction is the bad one: PRYZM would keep drawing on land
 * whose publisher had just disowned it. Matching the SENTENCE tracks the publisher; matching the
 * names tracks a snapshot. All three strings are pinned verbatim in the tests, so a change in the
 * upstream wording is a RED TEST rather than a silent re-opening of 23.77 % of buildable land.
 */
export function balearsObsDeclaresNotCurrent(obs: string | null | undefined): boolean {
    if (typeof obs !== 'string' || obs.trim() === '') return false;
    // Strip Catalan diacritics and upper-case, so `està`/`ESTA` and `NO`/`no` all match.
    const t = obs.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
    return /\bNO\s+(ESTA\s+ACTUALITZAT|MOSTRA)\b/.test(t);
}

/**
 * Is this record in force as at `asOf` (`YYYY-MM-DD`)?
 *
 * ⚠ THREE-VALUED, AND THE `null` MATTERS: it means "this record carries no interval we can test",
 * which is NOT "it is out of force". Discarding it would throw away the only answer the publisher
 * gave on the strength of our own inability to check — the same §CONTEXT-DATA-HONESTY error the
 * Murcia resolver avoids the same way. ONLY AN EXPLICIT `false` DROPS A RECORD.
 *
 * `DINIVIGEN` is `DD/MM/YYYY`. `DFIVIGEN` is an INTEGER `YYYYMMDD` whose value 99999999 is the
 * OPEN-ENDED SENTINEL and is never read as a date.
 */
export function balearsIsInForce(
    dinivigen: string | null | undefined,
    dfivigen: number | null | undefined,
    asOf: string,
): boolean | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asOf);
    if (!m) return null;
    const asOfInt = Number.parseInt(`${m[1]}${m[2]}${m[3]}`, 10);
    let known = false;

    if (typeof dinivigen === 'string') {
        const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dinivigen.trim());
        if (d) {
            known = true;
            if (Number.parseInt(`${d[3]}${d[2]}${d[1]}`, 10) > asOfInt) return false;
        }
    }
    if (typeof dfivigen === 'number' && Number.isFinite(dfivigen)) {
        if (dfivigen === BALEARS_DFIVIGEN_OPEN_ENDED) {
            known = true; // open-ended: positively in force with respect to its end
        } else if (dfivigen >= 10000101 && dfivigen <= 99991231) {
            // A real end date only if it looks like YYYYMMDD. Anything else is a sentinel we do not
            // recognise, and an unrecognised sentinel is not a licence to drop the record.
            known = true;
            if (dfivigen < asOfInt) return false;
        }
    }
    return known ? true : null;
}

/** The proxy payload. `null` ⇒ that upstream did NOT answer; `[]` ⇒ it answered, empty. */
interface BalearsProxyBody {
    readonly qualificacions?: readonly unknown[] | null;
    readonly fitxa?: {
        readonly identitat?: unknown;
        readonly url?: unknown;
        readonly html?: unknown;
    } | null;
}

/** Two zone records are "the same answer" when their MUIB code AND their governing plan agree. */
function sameZone(a: BalearsZoningFeature, b: BalearsZoningFeature): boolean {
    return a.CODIMUIB === b.CODIMUIB && a.CODIPLA === b.CODIPLA;
}

/** The envelope-bearing codes whose citations count as citing THE NUMBER (not the page footer). */
const CITABLE_CODES = ['NP', 'HR', 'HT', 'O', 'E', 'RA', 'RF', 'RM', 'PE'] as const;

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE IMPURE SEAM
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the MUIB zone + its parsed fitxa at a WGS84 point, through the same-origin
 * `/api/es/balears-muib` proxy. ⛔ NEVER throws — every failure is a DISCRIMINATED refusal, never a
 * silent null.
 *
 * ⚠ THIS RESOLVES PARAMETERS, NOT AN AUTHORISATION. Whether PRYZM may PUBLISH what it reads is
 * `envelopePublicationAuthorisation()`'s question alone, and Balears is not registered there, so it
 * fails closed as `unknown-jurisdiction`. That is the intended state until a human signs.
 *
 * P8 — emits `pryzm.zoning.resolveBalearsMuib`.
 */
export async function resolveBalearsMuib(
    point: BalearsLatLon | null | undefined,
    deps: BalearsMuibDeps = {},
): Promise<BalearsMuibResolution> {
    const span = tracer.startSpan('pryzm.zoning.resolveBalearsMuib');
    span.setAttribute('provider', 'goib-muib-arcgis');
    const done = (r: BalearsMuibResolution): BalearsMuibResolution => {
        span.setAttribute('resultFields', r.ok ? 'record' : r.reason);
        span.setStatus({ code: SpanStatusCode.OK });
        return r;
    };
    try {
        if (
            !point ||
            !Number.isFinite(point.lat) ||
            !Number.isFinite(point.lon) ||
            !isInBalears(point.lat, point.lon)
        ) {
            return done({ ok: false, reason: 'out-of-balears' });
        }

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            return done({
                ok: false,
                reason: 'endpoint-unreachable',
                detail: 'no fetch implementation available',
            });
        }
        const asOf = deps.asOf ?? new Date().toISOString().slice(0, 10);
        const base = deps.pathBase ?? BALEARS_MUIB_PATH;
        const url =
            `${base}?lat=${encodeURIComponent(String(point.lat))}` +
            `&lon=${encodeURIComponent(String(point.lon))}`;

        let body: BalearsProxyBody | null = null;
        try {
            const res = await fetchImpl(url, {
                method: 'GET',
                headers: { Accept: 'application/json' },
            });
            if (!res || !res.ok) {
                // Includes the proxy's own 502 — "the service did not answer", which is NOT "there
                // is nothing here". Keeping those apart is honesty property (2).
                return done({
                    ok: false,
                    reason: 'endpoint-unreachable',
                    detail: `upstream status ${res?.status ?? 'n/a'}`,
                });
            }
            body = (await res.json()) as BalearsProxyBody | null;
        } catch (fetchErr) {
            console.warn(
                '[balears-muib] fetch failed (non-fatal):',
                (fetchErr as Error)?.message ?? fetchErr,
            );
            return done({ ok: false, reason: 'endpoint-unreachable', detail: 'fetch threw' });
        }

        const rawFeatures = body?.qualificacions ?? null;
        if (rawFeatures === null) {
            return done({
                ok: false,
                reason: 'endpoint-unreachable',
                detail: 'the zoning layer did not answer',
            });
        }
        const all = (Array.isArray(rawFeatures) ? rawFeatures : [])
            .map(readBalearsZoningFeature)
            .filter((f): f is BalearsZoningFeature => f !== null);
        if (all.length === 0) {
            return done({ ok: false, reason: 'no-zoning-here' });
        }

        // ── Validity (honesty property 4). Only an explicit `false` drops a record. ──
        const inForce: BalearsZoningFeature[] = [];
        let supersededCount = 0;
        for (const f of all) {
            if (balearsIsInForce(f.DINIVIGEN, f.DFIVIGEN, asOf) === false) supersededCount++;
            else inForce.push(f);
        }
        const first = inForce[0];
        if (first === undefined) {
            return done({
                ok: false,
                reason: 'only-superseded-records',
                detail:
                    `${supersededCount} record(s) cover this point and every one of them is outside ` +
                    'its validity interval — quoting one would publish a repealed rule',
            });
        }

        // ── Ambiguity (property 5). Identical duplicates collapse; a real boundary refuses. ──
        if (inForce.some((f) => !sameZone(f, first))) {
            const codes = [...new Set(inForce.map((f) => f.CODIMUIB ?? '?'))].join(', ');
            return done({
                ok: false,
                reason: 'ambiguous-zone',
                detail: `two or more different zones cover this point (${codes})`,
                feature: first,
            });
        }

        // ── ⭐ CURRENCY (property 3) — the publisher's own disclaimer, quoted back. ──
        if (balearsObsDeclaresNotCurrent(first.OBS)) {
            return done({
                ok: false,
                reason: 'plan-not-current',
                detail: (first.OBS ?? '').slice(0, 400),
                feature: first,
            });
        }

        // ── Land class. A zone fitxa does not govern rústic. ──
        if (first.CODICLAS !== null && !BALEARS_BUILDABLE_CLASSES.includes(first.CODICLAS)) {
            return done({
                ok: false,
                reason: 'not-buildable-class',
                detail: `land class ${first.CODICLAS} — a zone fitxa does not govern this regime`,
                feature: first,
            });
        }

        if (first.URL === null) {
            return done({ ok: false, reason: 'no-fitxa-url', feature: first });
        }

        // ── The fitxa. Resolved from THIS feature's own `URL`, so the two cannot disagree. ──
        const fitxaHtml = typeof body?.fitxa?.html === 'string' ? body.fitxa.html : null;
        if (fitxaHtml === null || fitxaHtml.length === 0) {
            return done({ ok: false, reason: 'fitxa-unreachable', feature: first });
        }
        const fitxaUrl = typeof body?.fitxa?.url === 'string' ? body.fitxa.url : first.URL;

        const parsed = parseBalearsFitxa(fitxaHtml);
        // ⛔ A PARSER FAILURE MUST NOT WEAR THE COSTUME OF A DATA ABSENCE. `codeCellsUnparsed` is
        // non-empty ONLY when the parser SAW a code cell and could not read it, i.e. the page changed
        // shape. Reporting the resulting thin parameter set as "this zone publishes little" is
        // exactly the collapse this codebase keeps hitting.
        if (parsed.codeCellsUnparsed.length > 0) {
            return done({
                ok: false,
                reason: 'fitxa-unparsable',
                detail:
                    `${parsed.codeCellsUnparsed.length} code cell(s) seen but unreadable: ` +
                    parsed.codeCellsUnparsed.slice(0, 3).join(' | '),
                feature: first,
            });
        }
        // The fitxa states its own `id entitat`. If it disagrees with the identitat this feature
        // asked for, we are reading SOMEBODY ELSE'S ZONE — a mis-citation carrying a plausible number.
        if (
            parsed.identitat !== null &&
            first.IDENTITAT !== null &&
            parsed.identitat !== String(first.IDENTITAT)
        ) {
            return done({
                ok: false,
                reason: 'fitxa-identity-mismatch',
                detail: `feature IDENTITAT ${first.IDENTITAT} but the fitxa prints id entitat ${parsed.identitat}`,
                feature: first,
            });
        }

        const parameters = classifyBalearsFitxa(parsed);
        const drawability = balearsDrawability(parameters);
        if (drawability.tier === 'NOT_DRAWABLE') {
            return done({
                ok: false,
                reason: 'no-drawable-parameters',
                detail: drawability.reasons.join('; '),
                feature: first,
            });
        }

        // Articles cited ON an envelope-bearing parameter — the strong form. `articleRefsAll` (the
        // whole page) is deliberately NOT used: an article cited in a page footer is not a citation
        // OF THE NUMBER, and treating it as one would inflate the 2.0 % citation rate with noise.
        const articleRefs = [
            ...new Set(CITABLE_CODES.flatMap((c) => parameters[c]?.articleRefs ?? [])),
        ];

        span.setAttribute('zone', first.CODIMUIB ?? 'n/a');
        span.setAttribute('municipi', first.MUNICIPI ?? 'n/a');
        span.setAttribute('drawability', drawability.tier);
        span.setAttribute('articleCited', articleRefs.length > 0);
        return done({
            ok: true,
            record: {
                feature: first,
                ineCode: balearsIneFromCodiMuni(first.CODIMUNI),
                fitxaUrl,
                fitxa: parsed,
                parameters,
                drawability,
                articleRefs,
                articleAbsent: articleRefs.length === 0,
                supersededCount,
                missingConstraints: BALEARS_MISSING_CONSTRAINTS,
            },
        });
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn(
            '[balears-muib] unexpected error (non-fatal):',
            (err as Error)?.message ?? err,
        );
        return { ok: false, reason: 'endpoint-unreachable', detail: 'unexpected error' };
    } finally {
        span.end();
    }
}
