// §ES-SIU-GUARD (lane ES-SIU-GUARD, 2026-09-02) — SPAIN'S NATIONAL LAND-CLASS REGISTER AS A
// GUARD AHEAD OF THE ESTIMATED FALLBACK.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS CLOSES (demo gap G5, audit/demo-esfrpt/2026-09-02/DEMO-READINESS.md)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Probe point 3 of the 2026-09-02 demo readiness sweep: a real rústica parcel outside Villacañas
// (Toledo) — refcat 45186A06800141, 67 505 m² official — resolves live from Catastro, routes to
// ZONING=none (no registered jurisdiction claims it), and fell through to `applyEstimatedZoning`,
// which rendered the generic buildable triple (3.0/1.5/3.0 m, FAR 2.0, 50 %) labelled "Estimated".
// The SAME point, asked of the live SIU proxy (`/api/siu/classification`), answers
// `clase: "no_urbanizable"` — `SUELO NO URBANIZABLE`, published-structured, in force
// (`transcripts/live-clm-siu.json`). PRYZM was drawing a buildable volume on land the state
// classifies as non-developable: the L-616 overstatement family (an UNKNOWN-to-us constraint the
// state had in fact published, rendered as "buildable"), live on real rural land.
//
// THE RULE: inside Spain, before the estimated-default triple may publish, the national SIU
// clasificación-del-suelo register is consulted at the parcel's own query point. When it answers
// `no_urbanizable` (in force, and not a delimited rural nucleus), the honest output is a CITED
// refusal that names SIU, the classification, and the query — never the estimate.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS DELIBERATELY DOES *NOT* DO — control 9: UNKNOWN ≠ no-restriction ≠ restriction
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Availability must never convert into a refusal. Every outcome below other than a confident,
// in-force `no_urbanizable` PROCEEDS with the existing behaviour (the honestly-badged estimate),
// each under its own named reason rather than a collapsed boolean — the §CONTEXT-DATA-HONESTY
// discipline ("failure and empty are the same value" is the defect, not the design):
//
//   • transient        — proxy/network/upstream failure, timeout, non-JSON. RECORDED, never a
//                        refusal: "SIU is down" is a statement about a server, not about land.
//   • no-coverage      — SIU answered "no polygon here" (sea, a gap, or outside Spain entirely —
//                        the routing bbox `isInSpain` is coarse and swallows Portugal). A durable
//                        answer about COVERAGE, not a classification.
//   • developable-class— urbano / urbano_no_consolidado / urbanizable_delimitado /
//                        urbanizable_no_delimitado: the ladder proceeds unchanged.
//   • class-not-guarded— `sistemas_generales`: a real class this guard does not interpret. The
//                        lane brief scopes the guard to no_urbanizable/rústico; widening it to
//                        classes whose buildability semantics we have not established would be
//                        its own overstatement (of restriction).
//   • unknown-class    — SIU published a class string our closed normalisation does not know
//                        (`clase: null`, `claseRaw` set). UNKNOWN is not a restriction and not a
//                        permission; the estimate keeps its honest badge.
//   • nucleo-rural     — `no_urbanizable` WITH `NuclRural = 1`: a delimited rural nucleus is
//                        precisely where regional law grants limited building rights inside
//                        non-developable class land. Refusing there would overstate the
//                        RESTRICTION — the mirror image of the defect this guard closes
//                        (the L-942 lesson: the refusing half needs its escape hatch).
//   • not-in-force     — the record's FechaBaja says it was repealed; a dead record grounds
//                        nothing.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS LIVES IN apps/editor AND NOT IN @pryzm/site-parcel-data
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The natural L2 home would be a rulepack module — but this lane runs under the shared-file
// protocol (2026-09-02): `packages/site-parcel-data/src/index.ts` (the barrel) is held by sibling
// lanes and may not be edited here, and the package's `exports` map blocks deep imports, so a new
// L2 module would be unreachable from the dispatcher this guard exists to guard. The pure
// interpretation (`interpretSiuClassification`) and the refusal constructor are kept side-effect
// free and I/O-free so the eventual move into `site-parcel-data` (recorded in
// audit/demo-esfrpt/2026-09-02/barrel-additions-es-siu.txt) is a cut-and-paste, not a rewrite.
//
// The server half already exists and is live: `server/jurisdiction/siuClassificationProxy.js`
// (§L-441 Tier B) — same-origin proxy, 24 h cache, ArcGIS REST (NOT WFS — the WFS projection
// omits `ClaseSuelo` entirely; see that file). This module is the missing CONSUMER.
//
// Contracts: C58 §1.4 (never overstate), §1.11 (granularity — SIU answers "what class of land",
// NOT "what may I build"; its own payload says so), §CONTEXT-DATA-HONESTY, L-616 family.

import { projectScopeRegistry } from '@pryzm/core-app-model';
import type { EnvelopeRefusal } from '@pryzm/schemas';

/** The same-origin proxy route (`server/jurisdiction/siuClassificationProxy.js`). */
export const SIU_CLASSIFICATION_ENDPOINT = '/api/siu/classification';

/**
 * Client-side ceiling on the guard's wait. The proxy's own upstream timeout is 15 s, after which
 * it answers 200 `{found:false, reason:'upstream-timeout'}` — so 20 s means the proxy's honest
 * transient answer normally arrives first, and this abort only fires when the app server itself
 * is wedged. Either way the outcome is `transient` and the estimate proceeds; the ceiling exists
 * so a hung socket cannot hold the envelope determination open for ever (§L-716: ask "can this
 * ever complete?" before "why slow?").
 */
export const SIU_GUARD_TIMEOUT_MS = 20_000;

/** The proxy's answer shape (mirrors `siuClassificationHandler`'s two payloads). */
export interface SiuClassificationAnswer {
    readonly found: boolean;
    /** Stable machine key, or null when SIU published a class the closed normalisation rejects. */
    readonly clase?: string | null;
    /** SIU's own verbatim string, e.g. "SUELO NO URBANIZABLE". */
    readonly claseRaw?: string | null;
    /** 5-digit municipality INE code (SIU names the field ProvINE), or null. */
    readonly municipioIne?: string | null;
    /** SIU's NuclRural flag — a delimited rural nucleus inside class land. */
    readonly nucleoRural?: boolean;
    /** FechaBaja-derived: is the record still in force? */
    readonly inForce?: boolean;
    readonly source?: string;
    readonly sourceUrl?: string;
    /** On `found:false`: 'no-coverage' | 'upstream-<status>' | 'upstream-timeout' | … */
    readonly reason?: string;
}

/** Why the guard let the existing ladder proceed. Named, never collapsed (control 9). */
export type SiuProceedReason =
    | 'transient'
    | 'no-coverage'
    | 'developable-class'
    | 'class-not-guarded'
    | 'unknown-class'
    | 'nucleo-rural'
    | 'not-in-force';

export type SiuGuardVerdict =
    | {
          readonly kind: 'refuse';
          readonly clase: 'no_urbanizable';
          readonly claseRaw: string;
          readonly municipioIne: string | null;
          readonly sourceUrl: string | null;
      }
    | {
          readonly kind: 'proceed';
          readonly reason: SiuProceedReason;
          /** Diagnostic only — e.g. the upstream reason string, or the unrecognised claseRaw. */
          readonly detail: string | null;
      };

/** The four classes the SIU normalisation marks as urban/urbanizable (developable ladder-wise). */
const DEVELOPABLE_CLASSES: ReadonlySet<string> = new Set([
    'urbano',
    'urbano_no_consolidado',
    'urbanizable_delimitado',
    'urbanizable_no_delimitado',
]);

/**
 * PURE interpretation of a proxy answer → guard verdict. No I/O, no clock; every branch is a
 * named outcome so a test (and the console record) can tell "SIU said build" from "SIU was down"
 * from "SIU said a word we do not know" — three different answers (§CONTEXT-DATA-HONESTY).
 */
export function interpretSiuClassification(answer: SiuClassificationAnswer): SiuGuardVerdict {
    if (!answer.found) {
        // The proxy's `no-coverage` is a REAL answer (the point is outside SIU's polygons);
        // every other `found:false` reason is the proxy reporting its upstream failed.
        return answer.reason === 'no-coverage'
            ? { kind: 'proceed', reason: 'no-coverage', detail: null }
            : { kind: 'proceed', reason: 'transient', detail: answer.reason ?? 'unknown' };
    }
    const clase = answer.clase ?? null;
    if (clase === null) {
        return { kind: 'proceed', reason: 'unknown-class', detail: answer.claseRaw ?? null };
    }
    if (DEVELOPABLE_CLASSES.has(clase)) {
        return { kind: 'proceed', reason: 'developable-class', detail: clase };
    }
    if (clase !== 'no_urbanizable') {
        // `sistemas_generales` today; anything the normalisation later adds lands here too, and
        // proceeds until someone establishes its semantics — never a refusal by default.
        return { kind: 'proceed', reason: 'class-not-guarded', detail: clase };
    }
    if (answer.inForce === false) {
        return { kind: 'proceed', reason: 'not-in-force', detail: clase };
    }
    if (answer.nucleoRural === true) {
        return { kind: 'proceed', reason: 'nucleo-rural', detail: clase };
    }
    return {
        kind: 'refuse',
        clase: 'no_urbanizable',
        claseRaw: typeof answer.claseRaw === 'string' && answer.claseRaw.trim() !== ''
            ? answer.claseRaw
            : 'SUELO NO URBANIZABLE',
        municipioIne: typeof answer.municipioIne === 'string' ? answer.municipioIne : null,
        sourceUrl: typeof answer.sourceUrl === 'string' ? answer.sourceUrl : null,
    };
}

/** Build the exact query URL — exported so the refusal can CITE the query it made, verbatim. */
export function siuClassificationQueryUrl(lat: number, lon: number): string {
    return `${SIU_CLASSIFICATION_ENDPOINT}?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`;
}

/**
 * Fetch + interpret. NEVER throws and NEVER rejects — any failure at any layer is the `transient`
 * proceed verdict, because this guard's failure mode must be "existing behaviour", not a refusal
 * and not a broken commit path (the same non-fatal discipline as the proxy itself).
 */
export async function fetchSiuClassificationVerdict(
    lat: number,
    lon: number,
    fetchImpl?: typeof fetch,
): Promise<SiuGuardVerdict> {
    const f = fetchImpl ?? globalThis.fetch;
    if (typeof f !== 'function') {
        return { kind: 'proceed', reason: 'transient', detail: 'no-fetch-implementation' };
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), SIU_GUARD_TIMEOUT_MS) : null;
    try {
        const res = await f(siuClassificationQueryUrl(lat, lon), {
            method: 'GET',
            headers: { Accept: 'application/json' },
            ...(controller ? { signal: controller.signal } : {}),
        });
        if (!res.ok) {
            return { kind: 'proceed', reason: 'transient', detail: `http-${res.status}` };
        }
        const json = (await res.json()) as SiuClassificationAnswer;
        if (typeof json !== 'object' || json === null || typeof json.found !== 'boolean') {
            return { kind: 'proceed', reason: 'transient', detail: 'malformed-payload' };
        }
        return interpretSiuClassification(json);
    } catch (err) {
        const detail =
            err instanceof Error && err.name === 'AbortError' ? 'client-timeout' : 'unreachable';
        return { kind: 'proceed', reason: 'transient', detail };
    } finally {
        if (timer !== null) clearTimeout(timer);
    }
}

/**
 * The CITED refusal for in-force `no_urbanizable` land. Carries BOTH halves the never-overstate
 * doctrine demands of a refusal: WHAT WAS ASKED (the exact query, the point) and WHAT THE SOURCE
 * SAID (SIU's verbatim class + the normalised key + the register identity), so the card is an
 * auditable claim, not a bare "no".
 *
 * `code: 'protected-soil'` — the schema's own gloss is "*sòl no urbanitzable* / protective
 * easements … No urban envelope exists", which is this classification exactly.
 * `legallyGrounded: true` — a statement about the state's published land-class register, not
 * about PRYZM's coverage.
 *
 * ⚠ GRANULARITY, stated rather than implied: SIU's answer is a land-class POLYGON intersection at
 * the query point (its payload says `granularity: 'municipality-polygon'`), and it answers "what
 * class of land", never "what may I build" (C58 §1.11). The knownFacts say so on the card.
 */
export function buildSiuNonDevelopableRefusal(opts: {
    readonly lat: number;
    readonly lon: number;
    readonly claseRaw: string;
    readonly municipioIne: string | null;
    readonly sourceUrl: string | null;
}): EnvelopeRefusal {
    const point = `${opts.lat.toFixed(5)}, ${opts.lon.toFixed(5)}`;
    const query = siuClassificationQueryUrl(opts.lat, opts.lon);
    const register =
        'SIU — Sistema de Información Urbana, Ministerio de Vivienda y Agenda Urbana';
    return {
        code: 'protected-soil',
        headline:
            'Suelo no urbanizable — Spain’s national land-classification register states ' +
            'this land is non-developable.',
        detail:
            `PRYZM asked ${register} what class of land lies at ${point} (${query}). ` +
            `The register answered "${opts.claseRaw}" (no_urbanizable), in force` +
            (opts.municipioIne ? `, municipality INE ${opts.municipioIne}` : '') +
            '. No registered municipal rule pack claims this point, so the only number PRYZM ' +
            'could have drawn here is the generic estimated triple — and drawing a buildable ' +
            'volume on land the state classifies as non-developable would state a development ' +
            'right the register says does not exist (C58 §1.4, the never-overstate rule; ' +
            'the L-616 family). The classification is class-polygon-granular, not a parcel ' +
            'determination, and it answers "what class of land", never "what may I build": a ' +
            'regional rural-land regime may still permit specific agricultural, forestry or ' +
            'exceptional uses — consult the municipality’s own planning instrument.',
        ordinanceRef:
            `${register} · Clases de Suelo` +
            (opts.sourceUrl ? ` · ${opts.sourceUrl}` : ''),
        legallyGrounded: true,
        knownFacts: [
            `Land class (SIU): ${opts.claseRaw} (no_urbanizable) — in force`,
            `Classification query: ${query}`,
            `Location: ${point}`,
            ...(opts.municipioIne ? [`Municipality (INE): ${opts.municipioIne}`] : []),
            'Register granularity: land-class polygon (SIU), not a parcel determination',
        ],
    };
}

// ── The guard's last outcome — a RECORD, for diagnostics and for the availability-arm test. ──
//
// "Records transient" is a requirement of this lane, not decoration: an availability failure
// that proceeds silently is indistinguishable from "SIU said build", which is the exact
// failure≠empty collapse this family of defects keeps paying for. One slot, module-local,
// overwritten per consult — the same lifetime discipline as `_lastEnvelope` in siteDispatch.
export interface SiuGuardOutcomeRecord {
    readonly atIso: string;
    readonly lat: number;
    readonly lon: number;
    readonly verdict: SiuGuardVerdict;
}

let _lastOutcome: SiuGuardOutcomeRecord | null = null;

/** Called by the dispatcher after every consult (refuse AND proceed alike). */
export function recordSiuGuardOutcome(lat: number, lon: number, verdict: SiuGuardVerdict): void {
    _lastOutcome = { atIso: new Date().toISOString(), lat, lon, verdict };
}

/** The last consult's outcome, or null when no consult has run this session. */
export function getLastSiuGuardOutcome(): SiuGuardOutcomeRecord | null {
    return _lastOutcome;
}

/** Test seam — parallel to the proxy's `__resetSiuCacheForTests`. */
export function __resetSiuGuardForTests(): void {
    _lastOutcome = null;
}

// ── §C13-CANDIDATE-OWNERS (ADR-0298 §3, lane CI-GREEN/ISO) — project-switch owner ──
//
// `_lastOutcome` carries `lat`/`lon` — THE PREVIOUS PROJECT'S SITE COORDINATES — plus the
// verdict the national register returned for them. That is project-identifying content by
// any reading: `getLastSiuGuardOutcome()` is the diagnostic answer to "what did the guard
// last say about THIS site", and after a switch it answered about the other one, with a
// timestamp that makes the stale reading look current.
//
// The block above states the intended lifetime itself — "the same lifetime discipline as
// `_lastEnvelope` in siteDispatch" — and `_lastEnvelope` IS cleared per project, by
// `resetSiteDispatchProjectState()` (siteDispatch.ts, the declared `site.dispatch` scope).
// This slot was written to mirror that discipline and never wired to it; the only thing
// that dropped it was the test seam directly above. Registering here rather than adding a
// line to `resetSiteDispatchProjectState` keeps the state and its teardown in ONE module
// (C13 §3.10), which the sweep can see and a reader cannot miss.
projectScopeRegistry.register({
    scopeName: 'site.siuLandClassificationGuard',
    clear: () => { _lastOutcome = null; },
});
